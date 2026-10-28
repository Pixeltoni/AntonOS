import { describe, expect, it } from 'vitest';
import type { Recurring, Transaction } from '../types';
import { cancelDeadline, contractStatus, currentTermEnd, detectSubscriptions, everyLabel, perMonth, subscriptionTotals } from './subscriptions';

const base: Recurring = { id: 'a', type: 'Ausgabe', description: 'Fitnessstudio', amount: 19.9, category: 'Sport', account: 'Giro', day: 1, start: '2026-01', lastBooked: null };
const tx = (p: Partial<Transaction>): Transaction => ({ id: Math.random().toString(), type: 'Ausgabe', description: 'Netflix', amount: 10.99, category: 'Abos', account: 'Giro', date: '2026-10-05', ...p });

describe('Abos & Verträge', () => {
  it('rechnet auf den Monat und das Jahr um', () => {
    expect(perMonth({ amount: 60, every: 12 })).toBe(5);
    expect(everyLabel({ day: 3, every: 12 })).toBe('jährlich am 3.');
    expect(everyLabel({ day: 15 })).toBe('am 15. jedes Monats');
    const totals = subscriptionTotals([base, { ...base, id: 'b', amount: 60, every: 12, category: 'Abos' }, { ...base, id: 'c', paused: true }, { ...base, id: 'd', type: 'Einnahme' }], '2026-10-28');
    expect(totals.month).toBe(24.9);
    expect(totals.year).toBe(298.8);
    expect(totals.byCategory.map((c) => c.category)).toEqual(['Sport', 'Abos']);
  });

  it('findet die nächste Kündigungsfrist und rückt bei Verlängerung weiter', () => {
    const contract = { ...base, termEnd: '2026-11-30', noticeDays: 21, renewMonths: 12 };
    expect(cancelDeadline(contract, '2026-10-28')).toBe('2026-11-09');
    expect(contractStatus(contract, '2026-10-28')).toMatchObject({ state: 'frist', daysLeft: 12 });
    // Frist verpasst: verlängert sich um ein Jahr
    expect(currentTermEnd(contract, '2026-11-10')).toBe('2027-11-30');
    expect(contractStatus(contract, '2026-11-10').state).toBe('laufzeit');
    // Ohne Verlängerung bleibt das Ende stehen
    expect(currentTermEnd({ ...contract, renewMonths: 0 }, '2027-03-01')).toBe('2026-11-30');
  });

  it('kennt gekündigte, pausierte und flexible Abos', () => {
    expect(contractStatus({ ...base, endsOn: '2026-11-30' }, '2026-10-28')).toMatchObject({ state: 'gekuendigt', daysLeft: 33 });
    expect(contractStatus({ ...base, endsOn: '2026-09-30' }, '2026-10-28').state).toBe('beendet');
    expect(contractStatus({ ...base, paused: true }, '2026-10-28').state).toBe('pausiert');
    expect(contractStatus(base, '2026-10-28').state).toBe('flexibel');
  });

  it('erkennt Abos in den Buchungen', () => {
    const txs = [
      tx({ date: '2026-08-05' }), tx({ date: '2026-09-05' }), tx({ date: '2026-10-05' }),
      tx({ description: 'Mensa', amount: 4.5, date: '2026-10-01' }), tx({ description: 'Mensa', amount: 4.5, date: '2026-10-02' }), tx({ description: 'Mensa', amount: 4.5, date: '2026-09-02' }),
      tx({ description: 'Spotify', amount: 5.99, date: '2026-09-15' }), tx({ description: 'Spotify', amount: 5.99, date: '2026-10-15' }),
      tx({ id: 'rec-x-2026-10', description: 'Miete', amount: 390 }), tx({ id: 'rec-x-2026-09', description: 'Miete', amount: 390, date: '2026-09-05' }),
    ];
    const hints = detectSubscriptions(txs, [{ ...base, description: 'spotify' }], '2026-10-28');
    expect(hints).toEqual([{ description: 'Netflix', amount: 10.99, category: 'Abos', account: 'Giro', day: 5, months: 3 }]);
  });
});
