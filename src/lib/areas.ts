import type { Data, DateStr, NavItem } from '../types';
import { addDays, daysBetween, parseDate, relativeLabel } from './dates';
import { listTasks } from './tasks';
import { formatMoney, isHabitDone, monthTotals } from './life';
import { isDue } from './srs';
import { subscriptionTotals } from './subscriptions';
import { nextAlarm } from './alarm';
import { daysLabel, upcomingBirthdays } from './people';
import { tripPhase } from './trips';
import { ranToday, routineStreak } from './routines';
import { onDay, type CalendarEntry } from './calendar';
import { goalProgress } from './goals';
import { budgetStatus } from './finance';
import { formatGrade, summary } from './grades';
import { weekPrompt } from './weekplan';
import type { PetMood } from './pet';

/** Feste Farbe je Bereich (wie die Kategorien in Apple Health) */
export const AREA_COLORS: Record<string, string> = {
  Start: '#007AFF',
  Leben: '#FF9500',
  Geld: '#30B566',
  Studium: '#5856D6',
  Freizeit: '#FF2D55',
};
const OTHER_COLORS = ['#32ADE6', '#AF52DE', '#A2845E', '#00C7BE', '#FF6B3D'];
export const NEUTRAL_COLOR = '#8E8E93';

/** Farbe einer Sidebar-Gruppe; eigene Gruppen bekommen eine feste Farbe aus dem Namen */
export function areaColor(group: string): string {
  if (!group) return NEUTRAL_COLOR;
  if (AREA_COLORS[group]) return AREA_COLORS[group];
  let h = 0;
  for (const ch of group) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return OTHER_COLORS[h % OTHER_COLORS.length];
}

/** Farbe der Seite `path` – nach der Gruppe, in der sie in der Sidebar steht */
export function pageColor(path: string, items: Pick<NavItem, 'path' | 'group'>[]): string {
  if (path === 'heute' || path === 'bereiche' || path === 'dashboard') return AREA_COLORS.Start;
  const item = items.find((i) => i.path === path);
  return item ? areaColor(item.group) : AREA_COLORS.Start;
}

/** Seiten, die vorne in der Tab-Leiste stehen (danach folgen immer „Bereiche“ und „Suche“) */
export const DEFAULT_TABS = ['heute', 'kalender', 'aufgaben'];
export const TAB_COUNT = 3;

/** Gespeicherte Tabs prüfen: nur bekannte Seiten, keine doppelten, immer genau drei */
export function normalizeTabs(stored: unknown, known: string[]): string[] {
  const ok = new Set([...known, 'heute']);
  const list = Array.isArray(stored) ? stored.filter((x): x is string => typeof x === 'string' && ok.has(x)) : [];
  const result = [...new Set(list)].slice(0, TAB_COUNT);
  for (const d of [...DEFAULT_TABS, ...known]) {
    if (result.length >= TAB_COUNT) break;
    if (!result.includes(d) && d !== 'bereiche' && d !== 'einstellungen') result.push(d);
  }
  return result;
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Was die Bereiche-Seite zusätzlich kennt (Kalender mit Vorlesungen, Knubbels Laune) */
export interface HintExtras {
  entries?: CalendarEntry[];
  pet?: PetMood | null;
}

const PET_HINTS: Record<PetMood, string> = {
  essen: 'frisst gerade', party: 'satt und froh', froh: 'gut gelaunt', normal: 'bummelt herum', hunger: 'hat Hunger',
  traurig: 'sehr hungrig', krank: 'ist krank', tot: 'braucht ein neues Ei', schlaf: 'schläft',
};

/** Kurzer Stand je Seite für die Bereichs-Kacheln (fehlt = nichts Besonderes) */
export function areaHints(data: Data, t: DateStr, now: Date, extras: HintExtras = {}): Record<string, string> {
  const hints: Record<string, string> = {};
  const open = listTasks(data.tasks).filter((x) => x.status !== 'erledigt');
  const due = open.filter((x) => x.due !== null && x.due <= t).length;
  if (open.length) hints.aufgaben = due ? `${due} fällig` : `${open.length} offen`;

  const cards = data.cards.filter((c) => isDue(c, t)).length;
  if (cards) hints.lernen = `${cards} ${cards === 1 ? 'Karte' : 'Karten'} fällig`;

  if (data.habits.length) {
    const done = data.habits.filter((h) => isHabitDone(data.habitLogs, h, t)).length;
    hints.gewohnheiten = `${done} von ${data.habits.length} heute`;
  }

  const routines = data.routines.filter((r) => r.steps.length);
  if (routines.length) {
    const best = routines.map((r) => ({ r, streak: routineStreak(r, t) })).sort((a, b) => b.streak - a.streak)[0];
    hints.routinen = best.streak > 1 ? `${best.r.icon} ${best.streak} Tage in Folge` : `${routines.filter((r) => ranToday(r, t)).length} von ${routines.length} heute`;
  }

  const exam = [...data.exams].filter((e) => e.date >= t).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (exam) hints.pruefungen = `${exam.title} ${relativeLabel(exam.date, t)}`;

  const month = monthTotals(data.transactions, t.slice(0, 7));
  if (month.expenses) hints.finanzen = `${formatMoney(month.expenses)} ausgegeben`;

  const subs = subscriptionTotals(data.recurring, t);
  if (subs.month) hints.abos = `${formatMoney(subs.month)} im Monat`;

  const alarm = nextAlarm(data.alarms, now);
  if (alarm) {
    const day = daysBetween(t, `${alarm.at.getFullYear()}-${String(alarm.at.getMonth() + 1).padStart(2, '0')}-${String(alarm.at.getDate()).padStart(2, '0')}`);
    hints.wecker = `${day === 0 ? 'heute' : day === 1 ? 'morgen' : alarm.at.toLocaleDateString('de-DE', { weekday: 'short' })} ${hhmm(alarm.at)}`;
  }

  const bday = upcomingBirthdays(data.people, t, 14)[0];
  if (bday) hints.menschen = `${bday.person.name.split(' ')[0]} ${daysLabel(bday.days)}`;

  const trip = [...data.trips].filter((x) => x.end >= t).sort((a, b) => a.start.localeCompare(b.start))[0];
  if (trip) {
    const p = tripPhase(trip, t);
    hints.reisen = p.phase === 'unterwegs' ? `${trip.title}: Tag ${p.days}` : `${trip.title} ${daysLabel(p.days)}`;
  }

  const shopping = data.shopping.filter((s) => !s.done).length;
  if (shopping) hints.einkauf = `${shopping} auf der Liste`;

  const lastWorkout = [...data.workouts].filter((w) => w.done && w.date <= t).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (lastWorkout) {
    const ago = daysBetween(lastWorkout.date, t);
    hints.training = `${lastWorkout.title || lastWorkout.type}, ${ago === 0 ? 'heute' : ago === 1 ? 'gestern' : `vor ${ago} Tagen`}`;
  }

  const active = data.projects.filter((p) => p.status === 'aktiv').length;
  if (active) hints.projekte = `${active} aktiv`;
  const notes = data.notes.filter((n) => !n.deletedAt).length;
  if (notes) hints.notizen = `${notes} ${notes === 1 ? 'Notiz' : 'Notizen'}`;
  const meal = data.meals?.find((m) => m.date === t);
  if (meal) hints.essen = 'heute geplant';

  // Kalender und Kurse: nächster Eintrag heute (Vorlesungen kommen aus dem Stundenplan)
  const time = hhmm(now);
  const later = (extras.entries ?? []).filter((e) => e.time && e.time > time && onDay(e, t)).sort((a, b) => a.time.localeCompare(b.time));
  const nextEvent = later.find((e) => e.kind === 'event' || e.kind === 'lecture');
  if (nextEvent) hints.kalender = `${nextEvent.label} ${nextEvent.time}`;
  const lecture = later.find((e) => e.kind === 'lecture');
  if (lecture) hints.kurse = `${lecture.label} ${lecture.time}`;

  const focus = data.sessions.filter((s) => s.date === t).reduce((sum, s) => sum + s.minutes, 0);
  if (focus) hints.fokus = `${focus} Min heute`;

  const goals = data.goals.filter((g) => !g.deadline || g.deadline >= t);
  if (goals.length) {
    const avg = Math.round(goals.reduce((sum, g) => sum + goalProgress(g, data, t), 0) / goals.length);
    hints.ziele = `${goals.length} ${goals.length === 1 ? 'Ziel' : 'Ziele'}, ${avg} %`;
  }

  const avg = summary(data.courses, data.grades).average;
  if (avg !== null) hints.noten = `Schnitt ${formatGrade(avg, 1)}`;

  const watching = data.media.filter((m) => m.kind === 'Serie' || m.kind === 'Film');
  const running = watching.filter((m) => m.status === 'läuft');
  const planned = watching.filter((m) => m.status === 'geplant').length;
  if (running.length) hints.schauen = running.length === 1 ? `${running[0].title} läuft` : `${running.length} laufen`;
  else if (planned) hints.schauen = `${planned} auf der Liste`;

  const book = data.media.find((m) => (m.kind === 'Buch' || m.kind === 'Hörbuch') && m.status === 'läuft');
  if (book) hints.lesen = book.progress ? `${book.title}, ${book.progress}` : book.title;

  if (data.albums.length) hints.alben = `${data.albums.length} ${data.albums.length === 1 ? 'Album' : 'Alben'}`;

  if (weekPrompt(data.weekPlans, t).plan) hints.wochenplan = 'jetzt planen';

  const close = data.settings.dayClose;
  if (close?.enabled) hints.abend = close.last === t ? 'heute erledigt' : `ab ${close.time}`;

  if (extras.pet) hints.knubbel = PET_HINTS[extras.pet];
  return hints;
}

/** Zahl als Abzeichen oben rechts auf der Kachel; `text` ersetzt dann den Hinweis */
export interface AreaBadge {
  count: number;
  text: string;
}

/** Abzeichen wie bei iOS-Apps: nur, wo wirklich etwas zu tun ist */
export function areaBadges(data: Data, t: DateStr): Record<string, AreaBadge> {
  const badges: Record<string, AreaBadge> = {};
  const due = listTasks(data.tasks).filter((x) => x.status !== 'erledigt' && x.due !== null && x.due <= t).length;
  if (due) badges.aufgaben = { count: due, text: 'fällig' };
  const cards = data.cards.filter((c) => isDue(c, t)).length;
  if (cards) badges.lernen = { count: cards, text: cards === 1 ? 'Karte fällig' : 'Karten fällig' };
  const shopping = data.shopping.filter((s) => !s.done).length;
  if (shopping) badges.einkauf = { count: shopping, text: 'auf der Liste' };
  const open = data.habits.filter((h) => !isHabitDone(data.habitLogs, h, t)).length;
  if (open) badges.gewohnheiten = { count: open, text: 'noch offen heute' };
  return badges;
}

/** Ab so vielen fälligen Karten wird „Lernkarten“ groß */
export const URGENT_CARDS = 10;

/** Seiten mit Dringendem – ihre Kacheln werden doppelt breit */
export function areaUrgent(data: Data, t: DateStr, now: Date): string[] {
  const urgent: string[] = [];
  if (listTasks(data.tasks).some((x) => x.status !== 'erledigt' && x.due !== null && x.due <= t)) urgent.push('aufgaben');
  if (data.cards.filter((c) => isDue(c, t)).length >= URGENT_CARDS) urgent.push('lernen');
  if (data.exams.some((e) => e.date >= t && daysBetween(t, e.date) <= 7)) urgent.push('pruefungen');
  const alarm = nextAlarm(data.alarms, now);
  if (alarm && alarm.at.getTime() - now.getTime() <= 12 * 3600_000) urgent.push('wecker');
  if (upcomingBirthdays(data.people, t, 1).length) urgent.push('menschen');
  if (data.trips.some((x) => x.end >= t && x.start <= addDays(t, 2))) urgent.push('reisen');
  return urgent;
}

/** Eine Kennzahl im Tagesüberblick oben auf „Bereiche“ (das Symbol der Seite sagt, wozu) */
export interface AreaStat {
  path: string;
  value: string;
  label: string;
}

/** Bis zu vier Kennzahlen für den Überblick; leere fallen weg */
export function areaSummary(data: Data, t: DateStr, now: Date): AreaStat[] {
  const stats: AreaStat[] = [];
  const open = listTasks(data.tasks).filter((x) => x.status !== 'erledigt');
  const due = open.filter((x) => x.due !== null && x.due <= t).length;
  if (open.length) stats.push({ path: 'aufgaben', value: String(due || open.length), label: due ? 'fällig' : 'offen' });
  const month = monthTotals(data.transactions, t.slice(0, 7));
  if (month.expenses) {
    stats.push({ path: 'finanzen', value: `${Math.round(month.expenses).toLocaleString('de-DE')} €`, label: 'ausgegeben' });
  }
  const alarm = nextAlarm(data.alarms, now);
  if (alarm) {
    const days = daysBetween(t, `${alarm.at.getFullYear()}-${String(alarm.at.getMonth() + 1).padStart(2, '0')}-${String(alarm.at.getDate()).padStart(2, '0')}`);
    stats.push({ path: 'wecker', value: hhmm(alarm.at), label: days === 0 ? 'heute' : days === 1 ? 'morgen' : alarm.at.toLocaleDateString('de-DE', { weekday: 'long' }) });
  }
  const cards = data.cards.filter((c) => isDue(c, t)).length;
  if (cards) stats.push({ path: 'lernen', value: String(cards), label: cards === 1 ? 'Karte' : 'Karten' });
  if (data.habits.length) {
    const done = data.habits.filter((h) => isHabitDone(data.habitLogs, h, t)).length;
    stats.push({ path: 'gewohnheiten', value: `${done}/${data.habits.length}`, label: 'erledigt' });
  }
  return stats.slice(0, 4);
}

const hexToHsl = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
};

/**
 * Farbe einer Kachel: die Gruppenfarbe, je Platz in der Gruppe leicht im Farbton
 * und in der Helligkeit verschoben – so wird eine lange Gruppe keine einfarbige Wand.
 */
export function tileColor(group: string, index: number): string {
  const base = areaColor(group);
  if (base === NEUTRAL_COLOR) return base;
  const [h, s, l] = hexToHsl(base);
  const dl = (((index * 2) % 3) - 1) * 6;
  // Hellere Kacheln etwas wärmer, dunklere etwas kühler – so wird Orange nicht oliv
  const dh = dl * 0.6 + ((index % 4) - 1.5) * 2;
  const light = Math.max(30, Math.min(62, l + dl));
  return `hsl(${Math.round((h + dh + 360) % 360)} ${Math.round(s)}% ${Math.round(light)}%)`;
}

/** Wie viele zuletzt geöffnete Seiten gemerkt werden */
export const RECENT_MAX = 8;

/** Seiten, die nie unter „Zuletzt benutzt“ stehen */
const NOT_RECENT = new Set(['bereiche', 'heute', 'einstellungen', 'dashboard']);

/** Zuletzt geöffnete Seite nach vorne, ohne Doppelte */
export function pushRecent(list: string[], path: string): string[] {
  if (!path || NOT_RECENT.has(path)) return list;
  return [path, ...list.filter((p) => p !== path)].slice(0, RECENT_MAX);
}

/** Seite in der Sidebar verschieben: vor `before`, hinter `after` oder ans Ende von `group` – und in diese Gruppe */
export function moveNavItem(items: NavItem[], path: string, target: { before?: string; after?: string; group: string }): NavItem[] {
  const item = items.find((i) => i.path === path);
  if (!item || target.before === path || target.after === path) return items;
  const rest = items.filter((i) => i.path !== path);
  const moved = { ...item, group: target.group };
  let at = -1;
  if (target.before) at = rest.findIndex((i) => i.path === target.before);
  else if (target.after) {
    const i = rest.findIndex((x) => x.path === target.after);
    at = i < 0 ? -1 : i + 1;
  }
  if (at < 0) {
    // Hinter den letzten Eintrag der Gruppe
    const last = rest.map((i) => i.group).lastIndexOf(target.group);
    at = last < 0 ? rest.length : last + 1;
  }
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

/** Abkürzung im Menü beim Gedrückthalten einer Kachel */
export type QuickAction = { label: string; prefill: string } | { label: string; href: string } | { label: string; run: 'focus' };

/** Schnellaktionen je Seite (Routinen kommen aus den Daten dazu) */
export function quickActions(path: string, data: Pick<Data, 'routines'>): QuickAction[] {
  switch (path) {
    case 'aufgaben': return [{ label: 'Neue Aufgabe', prefill: 'Aufgabe: ' }];
    case 'kalender': return [{ label: 'Termin eintragen', prefill: 'Termin: ' }];
    case 'notizen': return [{ label: 'Neue Notiz', prefill: 'Notiz: ' }];
    case 'finanzen': return [{ label: 'Ausgabe eintragen', prefill: 'Ausgabe: ' }];
    case 'einkauf': return [{ label: 'Artikel hinzufügen', prefill: 'Kaufe ' }];
    case 'gewohnheiten': return [{ label: 'Gewohnheit abhaken', prefill: 'Ich habe ' }];
    case 'fokus': return [{ label: 'Fokus starten', run: 'focus' }];
    case 'dashboard': return [{ label: 'Übersicht bearbeiten', href: '#/dashboard/bearbeiten' }];
    case 'routinen': return data.routines.filter((r) => r.steps.length).slice(0, 4).map((r) => ({ label: `${r.icon} ${r.name} starten`, href: `#/routinen/start/${r.id}` }));
    default: return [];
  }
}

/**
 * Welche Woche die Story auf „Heute“ zeigt: sonntags die laufende Woche,
 * sonst die zuletzt abgeschlossene (Montag bis Sonntag).
 */
export function storyWeek(t: DateStr): { day: DateStr; until: DateStr; current: boolean } {
  const weekday = parseDate(t).getDay();
  if (weekday === 0) return { day: t, until: t, current: true };
  const lastSunday = addDays(t, -weekday);
  return { day: lastSunday, until: lastSunday, current: false };
}

export type DayPhase = 'morgen' | 'tag' | 'abend';
export type TodaySection = 'abschluss' | 'routine' | 'wecker' | 'termin' | 'kacheln' | 'aufgaben' | 'woche' | 'ringe' | 'ziele' | 'essen' | 'demnaechst';

/**
 * Tageszeit für die Heute-Seite: morgens bis 11 Uhr, abends ab 18 Uhr
 * bzw. ab der Uhrzeit von „Tag abschließen“, falls die früher liegt.
 */
export function dayPhase(now: Date, dayCloseTime = '21:30'): DayPhase {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const [h, m] = dayCloseTime.split(':').map(Number);
  const close = Number.isFinite(h) ? h * 60 + (m || 0) : 21 * 60 + 30;
  if (minutes < 4 * 60) return 'abend';
  if (minutes < 11 * 60) return 'morgen';
  if (minutes >= Math.min(18 * 60, close)) return 'abend';
  return 'tag';
}

/** Reihenfolge der Abschnitte auf „Heute“ – morgens der Plan (mit der Morgenroutine gleich darunter), abends der Abschluss oben */
export function todaySections(phase: DayPhase): TodaySection[] {
  if (phase === 'morgen') return ['termin', 'routine', 'kacheln', 'aufgaben', 'woche', 'ringe', 'ziele', 'essen', 'demnaechst'];
  if (phase === 'abend') return ['abschluss', 'routine', 'wecker', 'woche', 'ringe', 'ziele', 'aufgaben', 'termin', 'demnaechst'];
  return ['termin', 'kacheln', 'aufgaben', 'routine', 'woche', 'ringe', 'ziele', 'essen', 'demnaechst'];
}

export function greeting(now: Date): string {
  const h = now.getHours();
  if (h >= 22 || h < 4) return 'Gute Nacht';
  if (h < 11) return 'Guten Morgen';
  if (h < 18) return 'Hallo';
  return 'Guten Abend';
}

/** Eine Kachel im Kachel-Raster auf „Heute“: Zahl, die beim Öffnen hochzählt */
export interface TodayTile {
  key: 'aufgaben' | 'budget' | 'fokus' | 'lernen';
  label: string;
  value: number;
  /** Wie die Zahl angezeigt wird */
  unit: 'anzahl' | 'euro' | 'minuten';
  hint: string;
  href: string;
}

/** Die vier Kacheln unter dem nächsten Termin: Aufgaben, Budget, Fokus und Lernkarten */
export function todayTiles(data: Data, t: DateStr): TodayTile[] {
  const open = listTasks(data.tasks).filter((x) => x.status !== 'erledigt');
  const dueToday = open.filter((x) => !x.someday && ((x.due !== null && x.due <= t) || (!!x.plannedFor && x.plannedFor <= t)));
  const overdue = dueToday.filter((x) => x.due !== null && x.due < t).length;
  const finance = data.settings.finance ?? { budget: 0, categoryBudgets: [], balanceCorrections: [] };
  const money = budgetStatus(data.transactions, finance, t.slice(0, 7), t);
  const weekStart = addDays(t, -6);
  const focus = data.sessions.filter((s) => s.date >= weekStart && s.date <= t).reduce((sum, s) => sum + s.minutes, 0);
  const cards = data.cards.filter((c) => isDue(c, t)).length;
  return [
    { key: 'aufgaben', label: 'Aufgaben', value: dueToday.length, unit: 'anzahl', hint: overdue ? `${overdue} überfällig` : dueToday.length ? 'für heute' : 'alles frei', href: '#/aufgaben' },
    { key: 'budget', label: money.budget > 0 ? 'Budget frei' : 'Saldo im Monat', value: money.available, unit: 'euro', hint: money.daysLeft ? `noch ${money.daysLeft} ${money.daysLeft === 1 ? 'Tag' : 'Tage'}` : 'diesen Monat', href: '#/finanzen' },
    { key: 'fokus', label: 'Fokus', value: focus, unit: 'minuten', hint: 'letzte 7 Tage', href: '#/fokus' },
    { key: 'lernen', label: 'Lernkarten', value: cards, unit: 'anzahl', hint: cards ? 'heute fällig' : 'alles wiederholt', href: '#/lernen' },
  ];
}
