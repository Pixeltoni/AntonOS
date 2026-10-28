import { describe, expect, it } from 'vitest';
import type { Trip } from '../types';
import { applyTemplate, nextTrip, PACK_TEMPLATES, packSections, sortLegs, tripBudget, tripDays, tripPhase } from './trips';

const trip = (p: Partial<Trip> = {}): Trip => ({ id: 't', title: 'Lissabon', start: '2026-11-12', end: '2026-11-16', cover: '', budget: 350, legs: [], packing: [], note: '', ...p });

describe('Reisen', () => {
  it('kennt Countdown, Reisetage und Ende', () => {
    expect(tripPhase(trip(), '2026-10-28')).toEqual({ phase: 'bald', days: 15 });
    expect(tripPhase(trip(), '2026-11-13')).toEqual({ phase: 'unterwegs', days: 2 });
    expect(tripPhase(trip(), '2026-11-20').phase).toBe('vorbei');
    expect(tripDays(trip())).toBe(5);
  });

  it('rechnet das Reisebudget pro Tag', () => {
    const txs = [{ tripId: 't', type: 'Ausgabe' as const, amount: 120 }, { tripId: 't', type: 'Ausgabe' as const, amount: 50 }, { tripId: 'x', type: 'Ausgabe' as const, amount: 99 }];
    expect(tripBudget(trip(), txs, '2026-10-28')).toEqual({ spent: 170, left: 180, perDay: 36 });
    expect(tripBudget(trip(), txs, '2026-11-15').perDay).toBe(90);
  });

  it('übernimmt Vorlagen ohne Doppelte und sortiert Abschnitte', () => {
    let n = 0;
    const packing = applyTemplate([{ id: 'x', title: 'personalausweis', section: 'Dokumente', done: true }], PACK_TEMPLATES[0], () => `id${n++}`);
    expect(packing.filter((p) => p.title.toLowerCase() === 'personalausweis')).toHaveLength(1);
    expect(packSections(packing).map((s) => s.section)).toEqual(['Dokumente', 'Kleidung', 'Hygiene', 'Technik']);
  });

  it('sortiert Etappen und findet die nächste Reise', () => {
    const legs = sortLegs([
      { id: 'b', kind: 'flug', title: 'Rückflug', date: '2026-11-16', time: '18:15', detail: '' },
      { id: 'c', kind: 'unterkunft', title: 'Hostel', date: '2026-11-12', time: '', detail: '' },
      { id: 'a', kind: 'flug', title: 'Hinflug', date: '2026-11-12', time: '07:40', detail: '' },
    ]);
    expect(legs.map((l) => l.id)).toEqual(['a', 'c', 'b']);
    expect(nextTrip([trip({ id: 'alt', start: '2026-01-01', end: '2026-01-03' }), trip(), trip({ id: 'spaet', start: '2027-02-01', end: '2027-02-05' })], '2026-10-28')?.id).toBe('t');
  });
});
