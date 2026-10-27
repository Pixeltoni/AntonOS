import type { DateStr, HabitLog, ID, Transaction } from '../types';
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

export function isHabitDone(logs: HabitLog[], habitId: ID, date: DateStr): boolean {
  return logs.some((l) => l.habitId === habitId && l.date === date);
}

/**
 * Anzahl aufeinanderfolgender erledigter Tage bis heute. Ist heute noch offen,
 * zählt die Serie bis gestern – sie ist ja noch nicht gerissen.
 */
export function streak(logs: HabitLog[], habitId: ID, on: DateStr): number {
  const days = new Set(logs.filter((l) => l.habitId === habitId).map((l) => l.date));
  let day = days.has(on) ? on : addDays(on, -1);
  let count = 0;
  while (days.has(day)) {
    count++;
    day = addDays(day, -1);
  }
  return count;
}

/** Anteil erledigter Tage in den letzten `days` Tagen (inkl. heute), 0–100. */
export function completionRate(logs: HabitLog[], habitId: ID, on: DateStr, days = 30): number {
  const from = addDays(on, -(days - 1));
  const done = new Set(logs.filter((l) => l.habitId === habitId && l.date >= from && l.date <= on).map((l) => l.date));
  return (done.size / days) * 100;
}

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
