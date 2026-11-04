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

/** Kurzer Stand je Seite für die Bereichs-Kacheln (fehlt = nichts Besonderes) */
export function areaHints(data: Data, t: DateStr, now: Date): Record<string, string> {
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
  if (data.notes.length) hints.notizen = `${data.notes.length} ${data.notes.length === 1 ? 'Notiz' : 'Notizen'}`;
  const meal = data.meals?.find((m) => m.date === t);
  if (meal) hints.essen = 'heute geplant';
  return hints;
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
export type TodaySection = 'abschluss' | 'routine' | 'wecker' | 'termin' | 'aufgaben' | 'woche' | 'ringe' | 'ziele' | 'essen' | 'demnaechst';

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
  if (phase === 'morgen') return ['termin', 'routine', 'aufgaben', 'woche', 'ringe', 'ziele', 'essen', 'demnaechst'];
  if (phase === 'abend') return ['abschluss', 'routine', 'wecker', 'woche', 'ringe', 'ziele', 'aufgaben', 'termin', 'demnaechst'];
  return ['termin', 'aufgaben', 'routine', 'woche', 'ringe', 'ziele', 'essen', 'demnaechst'];
}

export function greeting(now: Date): string {
  const h = now.getHours();
  if (h >= 22 || h < 4) return 'Gute Nacht';
  if (h < 11) return 'Guten Morgen';
  if (h < 18) return 'Hallo';
  return 'Guten Abend';
}
