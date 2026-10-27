import type { DateStr } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateStr(d: Date): DateStr {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): DateStr {
  return toDateStr(new Date());
}

export function parseDate(s: DateStr): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: DateStr, days: number): DateStr {
  const d = parseDate(s);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

/** Ganze Tage von `from` bis `to` (negativ, wenn `to` in der Vergangenheit liegt). */
export function daysBetween(from: DateStr, to: DateStr): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}

export function relativeLabel(s: DateStr, ref: DateStr = today()): string {
  const diff = daysBetween(ref, s);
  if (diff === 0) return 'heute';
  if (diff === 1) return 'morgen';
  if (diff === -1) return 'gestern';
  if (diff < 0) return `vor ${-diff} Tagen`;
  return `in ${diff} Tagen`;
}

export function formatDate(s: DateStr): string {
  return parseDate(s).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Minuten als Stunden mit deutscher Dezimalschreibweise, z. B. 0,8 */
export function hours(minutes: number): string {
  return (minutes / 60).toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

/** Kalenderwoche nach ISO 8601. */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}
