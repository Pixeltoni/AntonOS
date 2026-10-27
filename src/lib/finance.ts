import type { Data, DateStr, FinanceSettings, Recurring, Transaction } from '../types';
import { monthTotals, shiftMonth } from './life';
import { parseDate } from './dates';

const CATEGORY_STYLE: Record<string, { icon: string; color: string }> = {
  Lebensmittel: { icon: '🛒', color: '#34C759' },
  Essen: { icon: '🍝', color: '#34C759' },
  Miete: { icon: '🏠', color: '#007AFF' },
  Mobilität: { icon: '🚌', color: '#5AC8FA' },
  Freizeit: { icon: '🎬', color: '#FF9500' },
  Studium: { icon: '📚', color: '#AF52DE' },
  Abos: { icon: '🔁', color: '#FF2D55' },
  Kleidung: { icon: '👕', color: '#FFCC00' },
  Gesundheit: { icon: '💊', color: '#FF3B30' },
  Sparen: { icon: '🐷', color: '#30B0C7' },
  Gehalt: { icon: '💼', color: '#34C759' },
  BAföG: { icon: '🎓', color: '#34C759' },
  Sonstiges: { icon: '💳', color: '#8E8E93' },
};
const EXTRA_COLORS = ['#5856D6', '#A2845E', '#64D2FF', '#FF6482', '#32ADE6', '#BF5AF2'];

export function categoryStyle(category: string): { icon: string; color: string } {
  const known = CATEGORY_STYLE[category];
  if (known) return known;
  let hash = 0;
  for (const ch of category) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return { icon: '💳', color: EXTRA_COLORS[hash % EXTRA_COLORS.length] };
}

/** Letzter Tag eines Monats (YYYY-MM) */
const daysInMonth = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

/** Buchungsdatum einer wiederkehrenden Zahlung im Monat `key` (31 → Monatsletzter). */
export function bookingDate(r: Pick<Recurring, 'day'>, key: string): DateStr {
  const day = Math.min(Math.max(1, Math.round(r.day)), daysInMonth(key));
  return `${key}-${String(day).padStart(2, '0')}`;
}

/** Feste ID, damit dieselbe Buchung auf zwei Geräten nicht doppelt entsteht. */
export const recurringTxId = (r: Pick<Recurring, 'id'>, key: string) => `rec-${r.id}-${key}`;

/**
 * Welche Buchungen aus wiederkehrenden Zahlungen fällig sind: jeder Monat ab dem Start
 * (bzw. nach dem zuletzt gebuchten), dessen Buchungstag erreicht ist.
 */
export function dueRecurring(
  recurring: Recurring[],
  transactions: Pick<Transaction, 'id'>[],
  on: DateStr,
): { transactions: Transaction[]; booked: { id: string; lastBooked: string }[] } {
  const existing = new Set(transactions.map((t) => t.id));
  const current = on.slice(0, 7);
  const out: Transaction[] = [];
  const booked: { id: string; lastBooked: string }[] = [];
  for (const r of recurring) {
    if (r.paused || !(r.amount > 0) || !/^\d{4}-\d{2}$/.test(r.start)) continue;
    let key = r.lastBooked && r.lastBooked >= r.start ? shiftMonth(r.lastBooked, 1) : r.start;
    let last: string | null = null;
    // Sicherheitsgrenze: höchstens 24 Monate nachholen
    for (let i = 0; i < 24 && key <= current; i++, key = shiftMonth(key, 1)) {
      const date = bookingDate(r, key);
      if (date > on) break;
      const id = recurringTxId(r, key);
      if (!existing.has(id)) {
        out.push({ id, type: r.type, description: r.description, amount: r.amount, category: r.category, account: r.account, date });
      }
      last = key;
    }
    if (last) booked.push({ id: r.id, lastBooked: last });
  }
  return { transactions: out, booked };
}

/** Nächster Buchungstermin einer wiederkehrenden Zahlung */
export function nextBooking(r: Recurring, on: DateStr): DateStr {
  let key = r.lastBooked && r.lastBooked >= r.start ? shiftMonth(r.lastBooked, 1) : r.start;
  if (key < on.slice(0, 7)) key = on.slice(0, 7);
  return bookingDate(r, key);
}

export interface BudgetStatus {
  budget: number;
  spent: number;
  income: number;
  /** Budget minus Ausgaben (ohne Budget: Einnahmen minus Ausgaben) */
  available: number;
  categories: { category: string; spent: number; budget: number; share: number; warn: boolean }[];
  daysLeft: number;
}

/** Stand des Monats `key` gegenüber dem Budget. Warnung ab 90 % eines Kategorie-Budgets. */
export function budgetStatus(txs: Transaction[], settings: FinanceSettings, key: string, on: DateStr): BudgetStatus {
  const totals = monthTotals(txs, key);
  const budgets = new Map(settings.categoryBudgets.filter((b) => b.amount > 0).map((b) => [b.category, b.amount]));
  const names = new Set([...totals.byCategory.map((c) => c.category), ...budgets.keys()]);
  const categories = [...names].map((category) => {
    const spent = totals.byCategory.find((c) => c.category === category)?.amount ?? 0;
    const budget = budgets.get(category) ?? 0;
    const share = budget > 0 ? spent / budget : 0;
    return { category, spent, budget, share, warn: budget > 0 && share >= 0.9 };
  }).sort((a, b) => b.spent - a.spent || a.category.localeCompare(b.category));
  const daysLeft = key === on.slice(0, 7) ? daysInMonth(key) - parseDate(on).getDate() : 0;
  return {
    budget: settings.budget,
    spent: totals.expenses,
    income: totals.income,
    available: settings.budget > 0 ? settings.budget - totals.expenses : totals.balance,
    categories,
    daysLeft,
  };
}

/** Bögen für den Kategorien-Ring: Start- und Endwinkel als Anteil 0–1 */
export function donutSegments<T extends { amount: number }>(items: T[]): (T & { from: number; to: number })[] {
  const total = items.reduce((s, i) => s + Math.max(0, i.amount), 0);
  if (total <= 0) return [];
  let acc = 0;
  return items.filter((i) => i.amount > 0).map((i) => {
    const from = acc / total;
    acc += i.amount;
    return { ...i, from, to: acc / total };
  });
}

/** Text-Zelle: Formel-Zeichen am Anfang entschärfen, Sonderzeichen in Anführungszeichen */
const textCell = (raw: string) => {
  const v = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

/**
 * CSV für Excel (deutsches Format: Semikolon, Dezimalkomma, Datum TT.MM.JJJJ).
 * Formel-Zeichen am Anfang werden entschärft, damit Excel nichts ausführt.
 */
export function toCsv(txs: Transaction[]): string {
  const rows = ['Datum;Art;Beschreibung;Kategorie;Konto;Betrag'];
  for (const t of [...txs].sort((a, b) => a.date.localeCompare(b.date))) {
    const [y, m, d] = t.date.split('-');
    const signed = t.type === 'Ausgabe' ? -t.amount : t.amount;
    rows.push([`${d}.${m}.${y}`, t.type, textCell(t.description), textCell(t.category), textCell(t.account), signed.toFixed(2).replace('.', ',')].join(';'));
  }
  return '﻿' + rows.join('\r\n') + '\r\n';
}

/** Trägt fällige wiederkehrende Zahlungen ein; gibt `data` unverändert zurück, wenn nichts fällig ist. */
export function applyRecurring(data: Data, on: DateStr): Data {
  const due = dueRecurring(data.recurring, data.transactions, on);
  const changed = due.booked.filter((b) => data.recurring.find((r) => r.id === b.id)?.lastBooked !== b.lastBooked);
  if (due.transactions.length === 0 && changed.length === 0) return data;
  const last = new Map(due.booked.map((b) => [b.id, b.lastBooked]));
  return {
    ...data,
    transactions: [...data.transactions, ...due.transactions],
    recurring: data.recurring.map((r) => (last.has(r.id) ? { ...r, lastBooked: last.get(r.id)! } : r)),
  };
}
