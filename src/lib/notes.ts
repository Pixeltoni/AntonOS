import type { DateStr, Note, Task } from '../types';
import { parseDate } from './dates';

/**
 * Notizen sind einfacher Text mit wenigen Zeichen für Formatierung, wie in Markdown:
 * „# Titel“, „## Überschrift“, „- [ ] Checkliste“, „- Liste“, „> Zitat“, „! Hinweis“,
 * „---“ (Trennlinie), **fett**, *kursiv*, [[Verknüpfung]] und #tag.
 */

export type Block =
  | { kind: 'h1' | 'h2' | 'p' | 'li' | 'quote' | 'callout'; text: string; line: number }
  | { kind: 'check'; text: string; done: boolean; line: number }
  | { kind: 'empty' | 'hr'; line: number };

export function parseBlocks(content: string): Block[] {
  return content.split('\n').map((raw, line): Block => {
    const check = raw.match(/^\s*[-*] \[( |x|X)\] ?(.*)$/);
    if (check) return { kind: 'check', done: check[1] !== ' ', text: check[2], line };
    if (/^# /.test(raw)) return { kind: 'h1', text: raw.slice(2), line };
    if (/^## /.test(raw)) return { kind: 'h2', text: raw.slice(3), line };
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(raw)) return { kind: 'hr', line };
    if (/^> ?/.test(raw)) return { kind: 'quote', text: raw.replace(/^> ?/, ''), line };
    if (/^! /.test(raw)) return { kind: 'callout', text: raw.slice(2), line };
    const li = raw.match(/^\s*[-*•] (.*)$/);
    if (li) return { kind: 'li', text: li[1], line };
    if (!raw.trim()) return { kind: 'empty', line };
    return { kind: 'p', text: raw, line };
  });
}

/** Hakt eine Checklisten-Zeile ab bzw. wieder auf. */
export function toggleCheck(content: string, line: number): string {
  const lines = content.split('\n');
  const l = lines[line];
  if (l === undefined) return content;
  lines[line] = l.replace(/^(\s*[-*] \[)( |x|X)(\])/, (_, a, mark, b) => `${a}${mark === ' ' ? 'x' : ' '}${b}`);
  return lines.join('\n');
}

export type Inline = { kind: 'text' | 'bold' | 'italic' | 'tag' | 'link' | 'url'; text: string };

/** Zerlegt eine Zeile in Text, **fett**, *kursiv*, #tag, [[Verknüpfung]] und Links. */
export function parseInline(text: string): Inline[] {
  const re = /(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[\[[^\]]+\]\])|(https?:\/\/[^\s)]+)|((?:^|(?<=\s))#[\p{L}\d_-]+)/gu;
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ kind: 'text', text: text.slice(last, i) });
    const s = m[0];
    if (m[1]) out.push({ kind: 'bold', text: s.slice(2, -2) });
    else if (m[2]) out.push({ kind: 'italic', text: s.slice(1, -1) });
    else if (m[3]) out.push({ kind: 'link', text: s.slice(2, -2).trim() });
    else if (m[4]) out.push({ kind: 'url', text: s });
    else out.push({ kind: 'tag', text: s.slice(1) });
    last = i + s.length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

/** Alle #tags einer Notiz (klein geschrieben, ohne Doppelte). Überschriften „# “ zählen nicht. */
export function extractTags(content: string): string[] {
  const tags = new Set<string>();
  for (const m of content.matchAll(/(?:^|\s)#([\p{L}\d_-]+)/gu)) tags.add(m[1].toLowerCase());
  return [...tags];
}

/** Alle [[Verknüpfungen]] einer Notiz */
export function extractLinks(content: string): string[] {
  return [...new Set([...content.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim()).filter(Boolean))];
}

const strip = (s: string) =>
  s.replace(/^\s*(-{3,}|\*{3,}|_{3,})\s*$/, '').replace(/^#+ /, '').replace(/^(> ?|! )/, '').replace(/^\s*[-*] (\[[ xX]\] )?/, '').replace(/\*\*|\[\[|\]\]/g, '').trim();

/** Titel: eigener Titel oder die erste Zeile mit Text */
export function noteTitle(note: Pick<Note, 'title' | 'content'>): string {
  if (note.title.trim()) return note.title.trim();
  const first = note.content.split('\n').map(strip).find(Boolean);
  return first ? first.slice(0, 80) : 'Neue Notiz';
}

/** Vorschau-Text unter dem Titel in der Liste */
export function noteSnippet(note: Pick<Note, 'title' | 'content'>): string {
  const lines = note.content.split('\n').map(strip).filter(Boolean);
  const rest = note.title.trim() ? lines : lines.slice(1);
  return rest.join(' ').slice(0, 120) || 'Kein weiterer Text';
}

export type DateGroup = 'Heute' | 'Gestern' | 'Letzte 7 Tage' | 'Letzte 30 Tage' | 'Älter';

/** Gruppen wie in Apple Notizen */
export function dateGroup(iso: string, now: Date): DateGroup {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(now) - start(d)) / 86_400_000);
  if (days <= 0) return 'Heute';
  if (days === 1) return 'Gestern';
  if (days < 7) return 'Letzte 7 Tage';
  if (days < 30) return 'Letzte 30 Tage';
  return 'Älter';
}

/**
 * Macht aus Text Lernkarten: jede Zeile der Form „Frage? Antwort“, „Begriff: Erklärung“
 * oder „Begriff – Erklärung“ wird eine Karte.
 */
export function cardsFromText(text: string): { front: string; back: string }[] {
  const cards: { front: string; back: string }[] = [];
  for (const raw of text.split('\n')) {
    const line = strip(raw);
    if (!line) continue;
    let m = line.match(/^(.+?\?)\s+(.+)$/);
    if (!m) m = line.match(/^(.+?):\s+(.+)$/);
    if (!m) m = line.match(/^(.+?)\s+[–—-]\s+(.+)$/);
    if (m && m[1].trim() && m[2].trim()) cards.push({ front: m[1].trim().replace(/\*\*/g, ''), back: m[2].trim().replace(/\*\*/g, '') });
  }
  return cards;
}

/**
 * Formatierung per Tastenkürzel: setzt bzw. entfernt ein Zeilenpräfix für alle Zeilen
 * der Auswahl. Gibt den neuen Text und die neue Auswahl zurück.
 */
export function togglePrefix(content: string, from: number, to: number, prefix: string): { content: string; from: number; to: number } {
  const lineStart = content.lastIndexOf('\n', from - 1) + 1;
  let lineEnd = content.indexOf('\n', Math.max(from, to - (to > from ? 1 : 0)));
  if (lineEnd === -1) lineEnd = content.length;
  const block = content.slice(lineStart, lineEnd).split('\n');
  const known = /^(# |## |- \[[ xX]\] |- |> |! )/;
  const all = block.every((l) => l.startsWith(prefix));
  const next = block.map((l) => (all ? l.slice(prefix.length) : prefix + l.replace(known, ''))).join('\n');
  const text = content.slice(0, lineStart) + next + content.slice(lineEnd);
  // Ohne Auswahl bleibt der Cursor an seiner Stelle im Text (verschoben um das Präfix)
  if (from === to) {
    const pos = Math.max(lineStart, from + next.length - (lineEnd - lineStart));
    return { content: text, from: pos, to: pos };
  }
  return { content: text, from: lineStart, to: lineStart + next.length };
}

/** **fett** bzw. *kursiv* um die Auswahl legen */
export function wrapSelection(content: string, from: number, to: number, mark: string): { content: string; from: number; to: number } {
  const inner = content.slice(from, to) || 'Text';
  const text = content.slice(0, from) + mark + inner + mark + content.slice(to);
  return { content: text, from: from + mark.length, to: from + mark.length + inner.length };
}

/** Auswahl in `open`/`close` einschließen, z. B. „[[“ und „]]“ (ohne Auswahl landet der Cursor dazwischen) */
export function wrapWith(content: string, from: number, to: number, open: string, close: string): { content: string; from: number; to: number } {
  const inner = content.slice(from, to);
  return { content: content.slice(0, from) + open + inner + close + content.slice(to), from: from + open.length, to: from + open.length + inner.length };
}

/**
 * Setzt den Haken der ersten Checklisten-Zeile mit genau diesem Text
 * (für Checkpunkte, aus denen eine Aufgabe wurde). Ohne Treffer bleibt alles gleich.
 */
export function setCheckByText(content: string, text: string, done: boolean): string {
  const want = text.trim();
  const lines = content.split('\n');
  const i = lines.findIndex((l) => {
    const m = l.match(/^\s*[-*] \[( |x|X)\] ?(.*)$/);
    return !!m && m[2].trim() === want;
  });
  if (i < 0) return content;
  lines[i] = lines[i].replace(/^(\s*[-*] \[)( |x|X)(\])/, (_, a, _m, b) => `${a}${done ? 'x' : ' '}${b}`);
  return lines.join('\n');
}

/**
 * Wird eine Aufgabe aus einem Checkpunkt erledigt oder wieder geöffnet,
 * zieht der Haken in der Notiz mit.
 */
export function syncTaskCheck<N extends Note>(
  notes: N[],
  before: Pick<Task, 'status'> | undefined,
  after: Pick<Task, 'status' | 'noteId' | 'noteLine'> | undefined,
): N[] {
  if (!before || !after?.noteId || !after.noteLine) return notes;
  const done = after.status === 'erledigt';
  if ((before.status === 'erledigt') === done) return notes;
  return notes.map((n) => (n.id === after.noteId ? { ...n, content: setCheckByText(n.content, after.noteLine!, done) } : n));
}

/* ---------- Zuletzt gelöscht ---------- */

/** So lange bleiben gelöschte Notizen in „Zuletzt gelöscht“ */
export const TRASH_DAYS = 30;

/** Notizen ohne die gelöschten */
export const liveNotes = <T extends Pick<Note, 'deletedAt'>>(notes: T[]): T[] => notes.filter((n) => !n.deletedAt);

/** Ganze Tage, bis eine gelöschte Notiz endgültig verschwindet (mindestens 0) */
export function trashDaysLeft(deletedAt: string, now: Date): number {
  const gone = new Date(deletedAt).getTime() + TRASH_DAYS * 86_400_000;
  return Math.max(0, Math.ceil((gone - now.getTime()) / 86_400_000));
}

/** Entfernt Notizen, die länger als 30 Tage in „Zuletzt gelöscht“ liegen */
export function purgeDeleted<T extends Pick<Note, 'deletedAt'>>(notes: T[], now: Date): T[] {
  return notes.filter((n) => !n.deletedAt || trashDaysLeft(n.deletedAt, now) > 0);
}

/* ---------- Erwähnt in ---------- */

/** Notizen, die per [[Titel]] auf `note` verweisen (ohne gelöschte und ohne sich selbst) */
export function backlinks<T extends Note>(note: Pick<Note, 'id' | 'title' | 'content'>, notes: T[]): T[] {
  const title = noteTitle(note).toLowerCase();
  return liveNotes(notes).filter((n) => n.id !== note.id && extractLinks(n.content).some((l) => l.toLowerCase() === title));
}

/* ---------- Tagesnotiz und Vorlagen ---------- */

/** „Freitag, 6. November“ */
export function dailyTitle(day: DateStr): string {
  return parseDate(day).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Inhalt einer neuen Tagesnotiz, mit den Terminen des Tages */
export function dailyContent(events: { time?: string; label: string }[]): string {
  const termine = events.length ? events.map((e) => `- ${e.time ? `${e.time} ` : ''}${e.label}`).join('\n') : '- keine Termine';
  return `## Termine\n${termine}\n\n## Wichtig heute\n- [ ] \n\n## Notizen\n\n\n## Dankbar für\n- `;
}

export interface NoteTemplate {
  id: string;
  label: string;
  /** lucide-Symbolname für das Menü */
  icon: 'file' | 'graduation-cap' | 'users' | 'layers' | 'smile' | 'shopping-basket';
  color: string;
  emoji?: string;
  title: (day: DateStr) => string;
  content: (day: DateStr) => string;
}

const shortDay = (day: DateStr) => parseDate(day).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });

export const NOTE_TEMPLATES: NoteTemplate[] = [
  { id: 'leer', label: 'Leere Notiz', icon: 'file', color: '#8E8E93', title: () => '', content: () => '' },
  {
    id: 'vorlesung', label: 'Vorlesungsmitschrift', icon: 'graduation-cap', color: '#007AFF', emoji: '🎓',
    title: (d) => `Vorlesung ${shortDay(d)}`,
    content: (d) => `${shortDay(d)} · Raum \n\n## Wichtigste Punkte\n- \n\n! Klausurrelevant: \n\n## Begriffe\nBegriff: Erklärung\n\n## Offene Fragen\n- [ ] `,
  },
  {
    id: 'besprechung', label: 'Besprechung', icon: 'users', color: '#30B0C7', emoji: '🗣️',
    title: (d) => `Besprechung ${shortDay(d)}`,
    content: () => 'Mit: \n\n## Themen\n- \n\n## Entscheidungen\n- \n\n## To-dos\n- [ ] ',
  },
  {
    id: 'lernzettel', label: 'Lernzettel', icon: 'layers', color: '#5856D6', emoji: '🧠',
    title: () => 'Lernzettel',
    content: () => '## Begriffe\nBegriff: Erklärung\n\n## Formeln\n! \n\n## Beispiel\n\n\n---\nZeilen wie „Begriff: Erklärung“ werden mit 🧠 zu Lernkarten.',
  },
  {
    id: 'woche', label: 'Wochenrückblick', icon: 'smile', color: '#FF9500', emoji: '🌤️',
    title: (d) => `Woche bis ${shortDay(d)}`,
    content: () => '## Was lief gut\n- \n\n## Was nicht\n- \n\n## Gelernt\n- \n\n## Nächste Woche\n- [ ] ',
  },
  {
    id: 'liste', label: 'Checkliste', icon: 'shopping-basket', color: '#34C759', emoji: '✅',
    title: () => '',
    content: () => '- [ ] ',
  },
];

/** Auswahl an Symbolen für Notizen */
export const NOTE_EMOJIS = ['📝', '📌', '💡', '🎯', '📚', '🎓', '🧠', '📐', '🧮', '∑', '🔬', '💻', '🗣️', '🤖', '🎁', '🛒', '🍳', '✈️', '🏃', '💰', '❤️', '🌱', '🎵', '⭐'];

/** Farben für Notizen (wie bei Listen) */
export const NOTE_COLORS = ['#FF9500', '#FF3B30', '#FF2D55', '#AF52DE', '#5856D6', '#007AFF', '#30B0C7', '#34C759', '#A2845E', '#8E8E93'];
