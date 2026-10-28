import type { Course, DateStr, Habit, ID, Priority, TxType } from '../types';
import { addDays, toDateStr } from './dates';
import { parseEventQuickAdd, parseQuickAdd, type EventQuickAdd } from './quickadd';
import { parseShopping, type ParsedItem } from './shopping';

/** Was die Assistentin aus einem Satz macht */
export type Intent =
  | {
      kind: 'task';
      title: string;
      due: DateStr | null;
      dueTime: string;
      priority: Priority | null;
      courseId: ID | null;
      evening: boolean;
      someday: boolean;
      /** „Erinnere mich …“ mit Uhrzeit → Mitteilung zur Uhrzeit */
      remind: boolean;
    }
  | { kind: 'shopping'; items: ParsedItem[] }
  | { kind: 'event'; event: EventQuickAdd }
  | { kind: 'habit'; habitId: ID; amount: number | null; date: DateStr }
  | { kind: 'expense'; type: TxType; amount: number; description: string; category: string; date: DateStr }
  | { kind: 'note'; title: string };

export interface AssistantContext {
  habits?: Pick<Habit, 'id' | 'name' | 'target' | 'unit'>[];
  courses?: Pick<Course, 'id' | 'name' | 'code'>[];
}

const pad = (n: number) => String(n).padStart(2, '0');

const NUMBER_WORDS: Record<string, number> = {
  zwei: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11,
  zwölf: 12, zwoelf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18,
  neunzehn: 19, zwanzig: 20, dreißig: 30, dreissig: 30, vierzig: 40, fünfzig: 50, sechzig: 60, neunzig: 90,
};

/** „acht“ → „8“ (Spracheingabe schreibt Zahlen oft aus); „ein/eine“ bleiben, weil sie meist Artikel sind. */
function digits(text: string): string {
  return text
    .replace(/\b(eins|ein|einer)(?=\s+uhr\b)/gi, '1')
    .replace(/(?<=\bum\s+)eins\b/gi, '1')
    .replace(/[\p{L}]+/gu, (w) => (w.toLowerCase() in NUMBER_WORDS ? String(NUMBER_WORDS[w.toLowerCase()]) : w));
}

/** Uhrzeiten wie „halb neun“, „viertel vor 9“, „8 Uhr abends“ in „8:30“, „8:45“, „20:00“ umwandeln. */
function normalizeTimes(text: string): string {
  const hhmm = (h: number, m: number) => `${pad(((h % 24) + 24) % 24)}:${pad(m)}`;
  const pm = (h: number) => (h < 12 ? h + 12 : h);
  return text
    .replace(/\bhalb\s+(\d{1,2})\b/gi, (_, h) => hhmm(Number(h) - 1, 30))
    .replace(/\bviertel\s+nach\s+(\d{1,2})\b/gi, (_, h) => hhmm(Number(h), 15))
    .replace(/\bviertel\s+vor\s+(\d{1,2})\b/gi, (_, h) => hhmm(Number(h) - 1, 45))
    .replace(/\b(\d{1,2})\s+uhr\s+(\d{2})\b/gi, (_, h, m) => hhmm(Number(h), Number(m)))
    // „heute Abend um 8“, „abends um 8“, „morgen Nachmittag um 3“
    .replace(/\b(?:(heute|morgen|übermorgen)\s+)?(?:abends?|am\s+abend|nachmittags?|am\s+nachmittag)\s+um\s+(\d{1,2})(?:[:.](\d{2}))?(?:\s*uhr)?\b/gi, (_, day, h, m) =>
      `${day ?? ''} um ${hhmm(pm(Number(h)), Number(m ?? 0))}`,
    )
    // „um 8 Uhr abends“, „8:30 abends“
    .replace(/\b(um\s+)?(\d{1,2})(?:[:.](\d{2}))?(?:\s*uhr)?\s+(?:abends|nachmittags|nachts|am\s+abend|am\s+nachmittag)\b/gi, (_, um, h, m) =>
      `${um ?? ''}${hhmm(pm(Number(h)), Number(m ?? 0))}`,
    )
    .replace(/\b(heute|morgen)\s+früh\b/gi, '$1')
    .replace(/\b(?:morgens|vormittags|früh)\s+um\b/gi, 'um')
    .replace(/(\d)(\s*uhr)?\s+(?:morgens|vormittags|früh)\b/gi, '$1$2');
}

/** Satzzeichen am Ende und Höflichkeiten („Hey“, „bitte“, „kannst du“) entfernen. */
function tidy(input: string): string {
  let s = input.trim().replace(/\s+/g, ' ');
  s = s.replace(/([^\s\d.!?])[.!?]+$/, '$1');
  s = s.replace(/^(?:hey|hallo|hi|ok|okay)\b[,\s]*(?:antonos|assistentin|anton)?[,:\s]*/i, '');
  for (let i = 0; i < 3; i++) {
    s = s.replace(/^(?:bitte|kannst\s+du(?!\s+mich)|könntest\s+du(?!\s+mich)|würdest\s+du(?!\s+mich)|ich\s+möchte|ich\s+will|ich\s+würde\s+gerne?)[,\s]+/i, '');
  }
  return s.replace(/[,\s]+(?:bitte|danke)$/i, '').trim();
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const MODALS = new Set(['muss', 'soll', 'sollte', 'will', 'möchte', 'darf', 'kann', 'werde', 'muß']);

/** „ich den Müll mitnehme“ → „Den Müll mitnehmen“ (Satz nach „dass“ als Aufgabe) */
export function reminderTitle(raw: string): string {
  // „an den Zahnarzt“ → „Zahnarzt“
  const s = raw.trim().replace(/^(?:daran|zu)\s+/i, '').replace(/^an\s+(?:den|die|das|dem|der)?\s*/i, '');
  const words = s.split(' ').filter(Boolean);
  if (words.length > 1 && /^(?:ich|wir)$/i.test(words[0])) {
    words.shift();
    const last = words[words.length - 1];
    if (MODALS.has(last.toLowerCase()) && words.length > 1) words.pop();
    else if (/^[a-zäöüß]{3,}$/.test(last) && !/(?:en|ern|eln)$/.test(last)) words[words.length - 1] = last.endsWith('e') ? `${last}n` : `${last}en`;
  }
  return capitalize(words.join(' '));
}

/** „in 20 Minuten“, „in 2 Stunden“, „in einer halben Stunde“ → Tag und Uhrzeit ab jetzt */
function takeRelativeTime(text: string, now: Date): { text: string; due: DateStr; time: string } | null {
  const m = text.match(/\bin\s+(\d{1,3}|einer|einem|1)\s+(halben\s+)?(minuten?|min|stunden?|std|viertelstunde)\b/i)
    ?? text.match(/\bin\s+(einer)\s+(halben\s+)?(stunde|viertelstunde)\b/i);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : 1;
  const unit = m[3].toLowerCase();
  let minutes = unit.startsWith('viertel') ? 15 : unit.startsWith('st') ? n * 60 : n;
  if (m[2]) minutes = 30;
  const at = new Date(now.getTime() + minutes * 60_000);
  return { text: text.replace(m[0], ' '), due: toDateStr(at), time: `${pad(at.getHours())}:${pad(at.getMinutes())}` };
}

const LIST = String.raw`(?:(?:meine[rm]?|die|der|unsere[rm]?)\s+)?(?:einkaufsliste|einkaufszettel)`;
const SHOPPING_PATTERNS = [
  new RegExp(String.raw`^(?:füg(?:e)?|setz(?:e)?|schreib(?:e)?|pack(?:e)?|tu(?:e)?|nimm|trag(?:e)?)\s+(.+?)\s+(?:zu|zur|auf|in|an)\s+${LIST}(?:\s+(?:hinzu|dazu|drauf|ein))?$`, 'i'),
  new RegExp(String.raw`^(.+?)\s+(?:zu|zur|auf|in)\s+${LIST}(?:\s+(?:hinzufügen|setzen|schreiben|packen))?$`, 'i'),
  new RegExp(String.raw`^(?:(?:auf|zur)\s+)?${LIST}:?\s+(.+)$`, 'i'),
];

/** Artikel aus gesprochenem Text: „zwei Bananen und eine Gurke“ → 2 Bananen, Gurke */
function shoppingItems(text: string): ParsedItem[] {
  const list = digits(text)
    .replace(/\s+(?:und|sowie|&)\s+/gi, ', ')
    .split(/,(?!\d)/)
    .map((s) => s.trim().replace(/^(?:noch|bitte|etwas|ein|eine|einen|einmal)\s+/i, '').trim())
    .filter(Boolean)
    .join(', ');
  return parseShopping(list);
}

const CATEGORIES: [string, RegExp][] = [
  ['Lebensmittel', /rewe|aldi|lidl|edeka|netto|penny|kaufland|supermarkt|lebensmittel|einkauf/i],
  ['Essen', /pizza|döner|mensa|restaurant|essen|burger|sushi|kaffee|café|cafe|bäcker|lieferando|imbiss/i],
  ['Mobilität', /bahn|bus|ticket|tanken|benzin|uber|taxi|fahrkarte|zug|scooter/i],
  ['Freizeit', /kino|konzert|bar|party|bowling|museum|spiel|festival/i],
  ['Studium', /buch|bücher|skript|semesterbeitrag|uni|drucken|kopien/i],
  ['Abos', /netflix|spotify|abo|disney|prime/i],
  ['Kleidung', /schuhe|jacke|hose|shirt|pulli|kleid/i],
  ['Gesundheit', /apotheke|medikament|arzt|tabletten/i],
  ['Gehalt', /gehalt|lohn|minijob/i],
];

const guessCategory = (text: string, type: TxType) =>
  CATEGORIES.find(([cat, re]) => re.test(text) && (cat === 'Gehalt') === (type === 'Einnahme'))?.[0] ?? 'Sonstiges';

const MONEY = /(\d+(?:[.,]\d{1,2})?)\s*(?:€|euro|eur)(?=\s|$)/i;

function expense(s: string, today: DateStr): Intent | null {
  let m = s.match(MONEY);
  const explicit = /^(?:ausgabe|einnahme)n?:?\s/i.test(s);
  if (!m && explicit) m = s.match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const amount = Number(m[1].replace(',', '.'));
  if (!(amount > 0)) return null;
  const type: TxType = /\b(?:einnahme|bekommen|verdient|eingenommen|erhalten|gehalt|zurückbekommen|überwiesen bekommen)\b/i.test(s) ? 'Einnahme' : 'Ausgabe';
  const date = /\bgestern\b/i.test(s) ? addDays(today, -1) : today;
  const description = capitalize(
    s
      .replace(m[0], ' ')
      .replace(/\b(?:ich|habe|hab|heute|gestern|ausgegeben|bezahlt|gezahlt|ausgabe|ausgaben|einnahme|einnahmen|bekommen|verdient|eingenommen|erhalten|zurückbekommen|euro|eur|gekostet|kostet|hat|für|buche|buch|trag|ein)\b/gi, ' ')
      .replace(/[:€]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^(?:bei|beim|im|in|vom|von)\s+/i, ''),
  );
  return { kind: 'expense', type, amount, description, category: guessCategory(description, type), date };
}

const HABIT_STOP = new Set(['minuten', 'seiten', 'liter', 'stunden', 'täglich', 'jeden', 'mindestens']);
const HABIT_DONE = /\b(?:hab(?:e)?|erledigt|gemacht|geschafft|abhaken|abgehakt|hake|getrunken|gelesen|meditiert|gelaufen|gejoggt|trainiert|geschrieben|eingetragen|trage)\b/i;

function habit(s: string, today: DateStr, habits: AssistantContext['habits'] = []): Intent | null {
  if (!HABIT_DONE.test(s)) return null;
  const lower = s.toLowerCase();
  const hit = habits.find((h) =>
    h.name
      .toLowerCase()
      .split(/[^\p{L}]+/u)
      .filter((w) => w.length >= 4 && !HABIT_STOP.has(w))
      .some((w) => lower.includes(w.slice(0, Math.max(4, w.length - 2)))),
  );
  if (!hit) return null;
  const date = /\bgestern\b/i.test(s) ? addDays(today, -1) : today;
  let amount: number | null = null;
  const num = digits(s).match(/(\d+(?:[.,]\d+)?)\s*(ml|l|liter)?\b/i);
  if (hit.target && num) {
    amount = Number(num[1].replace(',', '.'));
    if (num[2]?.toLowerCase() === 'ml' && hit.unit === 'l') amount /= 1000;
  }
  return { kind: 'habit', habitId: hit.id, amount, date };
}

function event(text: string, today: DateStr): Intent {
  const ev = parseEventQuickAdd(text.replace(/,(?!\d)/g, ' '), today);
  let title = ev.title.replace(/^(?:einen|den|ein)?\s*termin\s*/i, '').trim();
  if (!title || /^(?:mit|bei|beim|zum|zur)\s/i.test(title)) title = `Termin ${title}`.trim();
  return { kind: 'event', event: { ...ev, title: capitalize(title) } };
}

function task(text: string, now: Date, ctx: AssistantContext, remind: boolean): Intent {
  const today = toDateStr(now);
  let t = text.replace(/,(?!\d)/g, ' ');
  const rel = takeRelativeTime(t, now);
  if (rel) t = rel.text;
  const qa = parseQuickAdd(t, today, ctx.courses);
  let title = remind ? reminderTitle(qa.title.replace(/\b(?:daran\s+)?dass\b/i, ' ').replace(/\s+/g, ' ')) : qa.title;
  title = capitalize(title.replace(/^(?:ich\s+muss|ich\s+sollte|wir\s+müssen|aufgabe:?|to-?do:?|neue\s+aufgabe:?)\s+/i, '').trim());
  let { due, dueTime, evening } = qa;
  if (rel) {
    due = rel.due;
    dueTime = rel.time;
  }
  if (evening && dueTime) evening = false;
  return { kind: 'task', title, due, dueTime, priority: qa.priority, courseId: qa.courseId, evening, someday: qa.someday, remind: remind && !!dueTime };
}

/**
 * Versteht natürliche Sätze wie „Erinnere mich morgen um 8, dass ich den Müll mitnehme“,
 * „Füge Bananen zu meiner Einkaufsliste hinzu“, „Termin Zahnarzt Freitag 10 Uhr“,
 * „12 € für Pizza ausgegeben“, „Ich habe meditiert“ oder „Notiz: …“ –
 * ohne Internet und ohne KI, nur mit Regeln. Alles andere wird eine Aufgabe.
 */
export function interpret(input: string, now: Date, ctx: AssistantContext = {}): Intent | null {
  const today = toDateStr(now);
  const s = normalizeTimes(digits(tidy(input)));
  if (!s) return null;

  // Erinnerungen
  const asked = s.match(/^(?:kannst|könntest|würdest)\s+du\s+mich\s+(.*?)\s*(?:daran\s+)?erinnern\b[,\s]*(.*)$/i);
  if (asked) return task(`${asked[1]} ${asked[2]}`, now, ctx, true);
  const reminder = s.match(/^(?:erinner(?:e|n)?|erinnerung:?)(?:\s+(?:mich|uns))?[,\s]+(.*)$/i);
  if (reminder) return task(reminder[1], now, ctx, true);

  // Einkaufsliste
  for (const re of SHOPPING_PATTERNS) {
    const m = s.match(re);
    if (m) return { kind: 'shopping', items: shoppingItems(m[1]) };
  }
  const need = s.match(/^(?:ich|wir)\s+(?:brauche|brauchen)\s+(?:noch\s+)?(.+)$/i) ?? s.match(/^(?:kauf(?:e|en)?|einkaufen:?)\s+(.+)$/i);
  if (need && !parseQuickAdd(need[1], today).due) return { kind: 'shopping', items: shoppingItems(need[1]) };

  // Notizen
  const note = s.match(/^(?:notiz|notiere|notier|merk\s+dir|schreib(?:e)?\s+(?:mir\s+)?auf)(?:\s+mir)?[:,\s]+(.+)$/i);
  if (note) return { kind: 'note', title: capitalize(note[1].trim()) };

  // Termine
  const ev =
    s.match(/^(?:neuer\s+)?termin:?\s+(.+)$/i) ??
    s.match(/^(?:trag(?:e)?|füg(?:e)?|setz(?:e)?|schreib(?:e)?|plan(?:e)?)\s+(.+?)\s+(?:in\s+(?:den|meinen)|im|zum|zu\s+meinem|in)\s+kalender(?:\s+(?:ein|hinzu))?$/i) ??
    s.match(/^(.+?)\s+in\s+(?:den|meinen)\s+kalender(?:\s+eintragen)?$/i) ??
    s.match(/^trag(?:e)?\s+(.+?)\s+ein$/i);
  if (ev) return event(ev[1], today);

  // Geld und Gewohnheiten
  const money = expense(s, today);
  if (money) return money;
  const done = habit(s, today, ctx.habits);
  if (done) return done;

  // „Ich habe morgen um 10 Zahnarzt“ oder ein Zeitraum („14-16 Uhr“) → Termin
  const have = s.match(/^(?:ich\s+habe|ich\s+hab|hab|wir\s+haben)\s+(.+)$/i);
  if (have && parseQuickAdd(have[1].replace(/,(?!\d)/g, ' '), today).due) return event(have[1], today);
  const span = parseEventQuickAdd(s.replace(/,(?!\d)/g, ' '), today);
  if (span.endTime) return event(s, today);

  return task(s, now, ctx, false);
}

/** Kurze Beschreibung für die Vorschau unter dem Eingabefeld */
export const INTENT_LABELS: Record<Intent['kind'], { icon: string; label: string }> = {
  task: { icon: '✅', label: 'Aufgabe' },
  shopping: { icon: '🛒', label: 'Einkaufsliste' },
  event: { icon: '📅', label: 'Termin' },
  habit: { icon: '🔁', label: 'Gewohnheit' },
  expense: { icon: '💸', label: 'Finanzen' },
  note: { icon: '📝', label: 'Notiz' },
};
