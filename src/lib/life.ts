import type { DateStr, Habit, HabitLog, ID, Transaction } from '../types';
import { addDays, parseDate, toDateStr } from './dates';

/* ---------- Zeitfortschritt ---------- */

export interface PeriodProgress {
  day: number;
  week: number;
  month: number;
  year: number;
}

/** Wie viel Prozent von Tag, Woche (ab Montag), Monat und Jahr schon vergangen sind. */
export function periodProgress(now: Date): PeriodProgress {
  const ms = now.getTime();
  const share = (start: Date, end: Date) => ((ms - start.getTime()) / (end.getTime() - start.getTime())) * 100;
  const y = now.getFullYear();
  const m = now.getMonth();
  const dayStart = new Date(y, m, now.getDate());
  const weekStart = new Date(y, m, now.getDate() - ((now.getDay() + 6) % 7));
  return {
    day: share(dayStart, new Date(y, m, now.getDate() + 1)),
    week: share(weekStart, new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7)),
    month: share(new Date(y, m, 1), new Date(y, m + 1, 1)),
    year: share(new Date(y, 0, 1), new Date(y + 1, 0, 1)),
  };
}

/* ---------- Kalender ---------- */

/** 6 Wochen à 7 Tage (Montag zuerst), die den Monat `month` (0–11) vollständig enthalten. */
export function monthGrid(year: number, month: number): DateStr[] {
  const first = new Date(year, month, 1);
  const start = toDateStr(new Date(year, month, 1 - ((first.getDay() + 6) % 7)));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function monthKey(s: DateStr): string {
  return s.slice(0, 7);
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string): string {
  return parseDate(`${key}-01`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

/* ---------- Gewohnheiten ---------- */

type HabitRef = ID | Pick<Habit, 'id' | 'target'>;

const habitKey = (h: HabitRef) => (typeof h === 'string' ? { id: h, target: undefined } : h);

/** Menge, die an einem Tag eingetragen wurde (z. B. 1,25 Liter). */
export function habitAmount(logs: HabitLog[], habitId: ID, date: DateStr): number {
  const log = logs.find((l) => l.habitId === habitId && l.date === date);
  return log ? (log.amount ?? 0) : 0;
}

/**
 * Erledigt ist eine Gewohnheit, wenn es einen Eintrag gibt – bei Mengen-Gewohnheiten
 * (z. B. „2 Liter Wasser“) erst, wenn das Tagesziel erreicht ist.
 */
export function isHabitDone(logs: HabitLog[], habit: HabitRef, date: DateStr): boolean {
  const { id, target } = habitKey(habit);
  const log = logs.find((l) => l.habitId === id && l.date === date);
  if (!log) return false;
  return !target || log.amount === undefined || log.amount >= target;
}

/**
 * Anzahl aufeinanderfolgender erledigter Tage bis heute. Ist heute noch offen,
 * zählt die Serie bis gestern – sie ist ja noch nicht gerissen.
 */
export function streak(logs: HabitLog[], habit: HabitRef, on: DateStr): number {
  const h = habitKey(habit);
  const done = (d: DateStr) => isHabitDone(logs, h, d);
  let day = done(on) ? on : addDays(on, -1);
  let count = 0;
  while (done(day)) {
    count++;
    day = addDays(day, -1);
  }
  return count;
}

/** Anteil erledigter Tage in den letzten `days` Tagen (inkl. heute), 0–100. */
export function completionRate(logs: HabitLog[], habit: HabitRef, on: DateStr, days = 30): number {
  const h = habitKey(habit);
  let done = 0;
  for (let i = 0; i < days; i++) if (isHabitDone(logs, h, addDays(on, -i))) done++;
  return (done / days) * 100;
}

/** Mengen für die Plus-Knöpfe einer Gewohnheit (mindestens eine). */
export function habitSteps(habit: Pick<Habit, 'step' | 'steps'>): number[] {
  const list = (habit.steps ?? []).filter((n) => Number.isFinite(n) && n > 0);
  if (list.length) return list;
  return [habit.step && habit.step > 0 ? habit.step : 1];
}

/** „0,2; 0,5“ oder „0,2 0,5“ → [0.2, 0.5] (sortiert, ohne Doppelte) */
export function parseAmounts(text: string): number[] {
  const parts = text.replace(/,\s+/g, ';').split(/[;\s/|]+/);
  const nums = parts.map((p) => Number(p.replace(',', '.'))).filter((n) => Number.isFinite(n) && n > 0);
  return [...new Set(nums.map((n) => Math.round(n * 1000) / 1000))].sort((a, b) => a - b);
}

/** [0.2, 0.5] → „0,2; 0,5“ */
export const formatAmounts = (list: number[]): string => list.map((n) => n.toLocaleString('de-DE', { maximumFractionDigits: 3 })).join('; ');

/* ---------- Finanzen ---------- */

export interface MonthTotals {
  income: number;
  expenses: number;
  balance: number;
  byCategory: { category: string; amount: number }[];
}

export function monthTotals(txs: Transaction[], key: string): MonthTotals {
  const inMonth = txs.filter((t) => monthKey(t.date) === key);
  const income = inMonth.filter((t) => t.type === 'Einnahme').reduce((s, t) => s + t.amount, 0);
  const expenses = inMonth.filter((t) => t.type === 'Ausgabe').reduce((s, t) => s + t.amount, 0);
  const cats = new Map<string, number>();
  for (const t of inMonth) {
    if (t.type !== 'Ausgabe') continue;
    const c = t.category || 'Sonstiges';
    cats.set(c, (cats.get(c) ?? 0) + t.amount);
  }
  return {
    income,
    expenses,
    balance: income - expenses,
    byCategory: [...cats].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
  };
}

export function formatMoney(value: number): string {
  return value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

/* ---------- Sichere URLs ---------- */

/** Nur http(s)-Links zulassen, damit z. B. `javascript:`-URLs nie ausgeführt werden. */
export function safeHttpUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Bildquelle: http(s)-URL oder hochgeladenes Bild als Data-URL. */
export function safeImageSrc(raw: string | undefined): string | null {
  if (!raw) return null;
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(raw)) return raw;
  return safeHttpUrl(raw);
}

/** Wandelt einen Spotify-Link (Playlist, Album, Track, …) in die Einbettungs-URL um. */
export function spotifyEmbedUrl(raw: string): string | null {
  const url = safeHttpUrl(raw);
  if (!url) return null;
  const u = new URL(url);
  if (u.hostname !== 'open.spotify.com') return null;
  const parts = u.pathname.split('/').filter(Boolean).filter((p) => !p.startsWith('intl-') && p !== 'embed');
  const [type, id] = parts;
  if (!['playlist', 'album', 'track', 'artist', 'show', 'episode'].includes(type) || !/^[A-Za-z0-9]+$/.test(id ?? '')) return null;
  return `https://open.spotify.com/embed/${type}/${id}`;
}
