import { describe, expect, it } from 'vitest';
import type { Recurring, Transaction } from '../types';
import { applyRecurring, bookingDate, budgetStatus, donutSegments, dueRecurring, nextBooking, toCsv } from './finance';

const rent: Recurring = { id: 'r', type: 'Ausgabe', description: 'Miete', amount: 390, category: 'Miete', account: 'Giro', day: 1, start: '2026-08', lastBooked: null };
const tx = (p: Partial<Transaction>): Transaction => ({ id: Math.random().toString(), type: 'Ausgabe', description: '', amount: 10, category: 'Sonstiges', account: 'Giro', date: '2026-10-05', ...p });

describe('Wiederkehrende Zahlungen', () => {
  it('bucht verpasste Monate nach, aber nichts in der Zukunft', () => {
    const r = dueRecurring([rent, { ...rent, id: 'abo', day: 28, amount: 7 }], [], '2026-10-27');
    expect(r.transactions.map((t) => t.date)).toEqual(['2026-08-01', '2026-09-01', '2026-10-01', '2026-08-28', '2026-09-28']);
    expect(r.transactions[0]).toMatchObject({ id: 'rec-r-2026-08', amount: 390, type: 'Ausgabe', category: 'Miete' });
    expect(r.booked).toEqual([{ id: 'r', lastBooked: '2026-10' }, { id: 'abo', lastBooked: '2026-09' }]);
  });

  it('bucht nichts doppelt', () => {
    const r = dueRecurring([{ ...rent, lastBooked: '2026-09' }], [{ id: 'rec-r-2026-10' }], '2026-10-27');
    expect(r.transactions).toEqual([]);
    expect(r.booked).toEqual([{ id: 'r', lastBooked: '2026-10' }]);
    expect(dueRecurring([{ ...rent, paused: true }], [], '2026-10-27').transactions).toEqual([]);
  });

  it('nimmt in kurzen Monaten den letzten Tag', () => {
    expect(bookingDate({ day: 31 }, '2026-02')).toBe('2026-02-28');
    expect(bookingDate({ day: 31 }, '2028-02')).toBe('2028-02-29');
    expect(nextBooking({ ...rent, lastBooked: '2026-10' }, '2026-10-27')).toBe('2026-11-01');
    expect(nextBooking({ ...rent, day: 30, lastBooked: '2026-09' }, '2026-10-27')).toBe('2026-10-30');
  });
});

describe('Automatisch buchen', () => {
  it('ändert nur, wenn etwas fällig ist', () => {
    const data = { recurring: [rent], transactions: [] } as unknown as Parameters<typeof applyRecurring>[0];
    const next = applyRecurring(data, '2026-08-15');
    expect(next.transactions.length).toBe(1);
    expect(next.recurring[0].lastBooked).toBe('2026-08');
    expect(applyRecurring(next, '2026-08-20')).toBe(next);
  });
});

describe('Budget', () => {
  const txs = [
    tx({ category: 'Freizeit', amount: 73.6 }),
    tx({ category: 'Miete', amount: 390 }),
    tx({ type: 'Einnahme', category: 'Gehalt', amount: 620 }),
    tx({ category: 'Freizeit', amount: 50, date: '2026-09-30' }),
  ];
  it('rechnet Verfügbar und warnt ab 90 %', () => {
    const s = budgetStatus(txs, { budget: 1200, categoryBudgets: [{ category: 'Freizeit', amount: 80 }, { category: 'Studium', amount: 50 }] }, '2026-10', '2026-10-23');
    expect(s.available).toBeCloseTo(736.4);
    expect(s.daysLeft).toBe(8);
    expect(s.categories.map((c) => [c.category, c.warn])).toEqual([['Miete', false], ['Freizeit', true], ['Studium', false]]);
    expect(s.categories[1].share).toBeCloseTo(0.92);
  });
  it('nimmt ohne Budget den Saldo', () => {
    expect(budgetStatus(txs, { budget: 0, categoryBudgets: [] }, '2026-10', '2026-10-23').available).toBeCloseTo(156.4);
  });
  it('teilt den Ring auf', () => {
    expect(donutSegments([{ amount: 3 }, { amount: 0 }, { amount: 1 }])).toEqual([{ amount: 3, from: 0, to: 0.75 }, { amount: 1, from: 0.75, to: 1 }]);
    expect(donutSegments([])).toEqual([]);
  });
});

describe('CSV-Export', () => {
  it('schreibt deutsches Excel-Format und entschärft Formeln', () => {
    const csv = toCsv([tx({ description: '=HYPERLINK("x")', amount: 12.5, date: '2026-10-02' }), tx({ type: 'Einnahme', description: 'Job; Oktober', amount: 620, date: '2026-10-01' })]);
    expect(csv.startsWith('﻿Datum;Art;Beschreibung;Kategorie;Konto;Betrag\r\n')).toBe(true);
    const lines = csv.trim().split('\r\n');
    expect(lines[1]).toBe('01.10.2026;Einnahme;"Job; Oktober";Sonstiges;Giro;620,00');
    expect(lines[2]).toBe(`02.10.2026;Ausgabe;"'=HYPERLINK(""x"")";Sonstiges;Giro;-12,50`);
  });
});
