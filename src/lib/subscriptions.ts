import type { DateStr, Recurring, Transaction } from '../types';
import { addDays, addMonths, daysBetween } from './dates';
import { monthKey, shiftMonth } from './life';

/** Abstände für Abos und Verträge */
export const INTERVALS: { months: number; label: string }[] = [
  { months: 1, label: 'monatlich' },
  { months: 3, label: 'vierteljährlich' },
  { months: 6, label: 'halbjährlich' },
  { months: 12, label: 'jährlich' },
];

const every = (r: Pick<Recurring, 'every'>) => Math.max(1, Math.round(r.every ?? 1));

/** Kosten auf einen Monat umgerechnet (jährlich 60 € → 5 € im Monat) */
export const perMonth = (r: Pick<Recurring, 'amount' | 'every'>) => r.amount / every(r);

/** „am 15. jedes Monats“, „jährlich am 3.“ */
export function everyLabel(r: Pick<Recurring, 'day' | 'every'>): string {
  const e = every(r);
  if (e === 1) return `am ${r.day}. jedes Monats`;
  return `${INTERVALS.find((i) => i.months === e)?.label ?? `alle ${e} Monate`} am ${r.day}.`;
}

/** Läuft die Zahlung noch (nicht pausiert und nicht schon beendet)? */
export const isRunning = (r: Pick<Recurring, 'paused' | 'endsOn'>, on: DateStr) => !r.paused && (!r.endsOn || r.endsOn >= on);

/**
 * Laufzeitende, zu dem als Nächstes gekündigt werden kann. Verlängert sich der Vertrag
 * von selbst, rückt es so lange um die Verlängerung weiter, bis die Frist noch erreichbar ist.
 */
export function currentTermEnd(r: Pick<Recurring, 'termEnd' | 'noticeDays' | 'renewMonths'>, on: DateStr): DateStr | null {
  if (!r.termEnd) return null;
  let end = r.termEnd;
  const renew = Math.max(0, Math.round(r.renewMonths ?? 0));
  for (let i = 0; renew > 0 && i < 200 && addDays(end, -(r.noticeDays ?? 0)) < on; i++) end = addMonths(r.termEnd, renew * (i + 1));
  return end;
}

/** Letzter Tag, an dem die Kündigung noch rechtzeitig ist */
export function cancelDeadline(r: Pick<Recurring, 'termEnd' | 'noticeDays' | 'renewMonths'>, on: DateStr): DateStr | null {
  const end = currentTermEnd(r, on);
  return end ? addDays(end, -(r.noticeDays ?? 0)) : null;
}

export type ContractState = 'pausiert' | 'gekuendigt' | 'beendet' | 'frist' | 'laufzeit' | 'flexibel';

export interface ContractStatus {
  state: ContractState;
  /** Kündigungsfrist bzw. Laufzeitende */
  deadline: DateStr | null;
  termEnd: DateStr | null;
  /** Tage bis zur Kündigungsfrist */
  daysLeft: number | null;
}

/** Ab so vielen Tagen vor der Frist warnt AntonOS */
export const WARN_DAYS = 30;

export function contractStatus(r: Recurring, on: DateStr): ContractStatus {
  const termEnd = currentTermEnd(r, on);
  const deadline = cancelDeadline(r, on);
  const daysLeft = deadline ? daysBetween(on, deadline) : null;
  const base = { termEnd, deadline, daysLeft };
  if (r.endsOn) return { ...base, state: r.endsOn < on ? 'beendet' : 'gekuendigt', deadline: r.endsOn, daysLeft: daysBetween(on, r.endsOn) };
  if (r.paused) return { ...base, state: 'pausiert' };
  if (!deadline) return { ...base, state: 'flexibel' };
  if (daysLeft !== null && daysLeft >= 0 && daysLeft <= WARN_DAYS) return { ...base, state: 'frist' };
  return { ...base, state: 'laufzeit' };
}

export interface SubscriptionTotals {
  month: number;
  year: number;
  byCategory: { category: string; amount: number }[];
}

/** Laufende Ausgaben pro Monat und Jahr, nach Kategorie */
export function subscriptionTotals(list: Recurring[], on: DateStr): SubscriptionTotals {
  const running = list.filter((r) => r.type === 'Ausgabe' && isRunning(r, on));
  const map = new Map<string, number>();
  for (const r of running) map.set(r.category, (map.get(r.category) ?? 0) + perMonth(r));
  const month = running.reduce((s, r) => s + perMonth(r), 0);
  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    month: round(month),
    year: round(month * 12),
    byCategory: [...map.entries()].map(([category, amount]) => ({ category, amount: round(amount) })).sort((a, b) => b.amount - a.amount),
  };
}

export interface SubscriptionHint {
  description: string;
  amount: number;
  category: string;
  account: string;
  day: number;
  /** In so vielen verschiedenen Monaten gefunden */
  months: number;
}

const key = (s: string) => s.trim().toLowerCase();

/**
 * Sucht in den Buchungen nach Abos, die noch nicht als Dauerauftrag erfasst sind:
 * gleiche Beschreibung und gleicher Betrag in mindestens zwei der letzten vier Monate.
 */
export function detectSubscriptions(txs: Transaction[], recurring: Recurring[], on: DateStr): SubscriptionHint[] {
  const known = new Set(recurring.map((r) => key(r.description)));
  const from = shiftMonth(monthKey(on), -3);
  const groups = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (t.type !== 'Ausgabe' || t.id.startsWith('rec-') || !t.description.trim() || known.has(key(t.description))) continue;
    if (monthKey(t.date) < from || t.date > on) continue;
    const k = `${key(t.description)}|${t.amount.toFixed(2)}`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const out: SubscriptionHint[] = [];
  for (const list of groups.values()) {
    const months = new Set(list.map((t) => monthKey(t.date))).size;
    // Mehrmals im selben Monat (z. B. Mensa) ist kein Abo
    if (months < 2 || list.length > months) continue;
    const last = [...list].sort((a, b) => b.date.localeCompare(a.date))[0];
    out.push({ description: last.description, amount: last.amount, category: last.category, account: last.account, day: Number(last.date.slice(8)), months });
  }
  return out.sort((a, b) => b.months - a.months || b.amount - a.amount);
}
