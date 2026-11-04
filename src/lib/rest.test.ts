import { describe, expect, it } from 'vitest';
import { doneSets, extendRest, minutesSince, nextOpenSet, parseDraft, restActivityState, restLeft, restProgress, setLabel, startRest } from './rest';

describe('Satzpause', () => {
  const info = { exercise: 'Bankdrücken', next: 'Bankdrücken · Satz 3 von 4', goal: '62,5 kg × 8' };

  it('läuft herunter und lässt sich verlängern', () => {
    const t = startRest(1000, 90, info);
    expect(t.endAt).toBe(91_000);
    expect(restLeft(t, 31_000)).toBe(60_000);
    expect(restProgress(t, 46_000)).toBeCloseTo(0.5);
    expect(extendRest(t, 30, 31_000).endAt).toBe(121_000);
    // Abgelaufen: beginnt ab jetzt neu
    const late = extendRest(t, 30, 200_000);
    expect(late.startAt).toBe(200_000);
    expect(late.endAt).toBe(230_000);
    expect(restLeft(t, 999_999)).toBe(0);
  });

  it('liefert den Stand für die Live-Aktivität', () => {
    const s = restActivityState(startRest(0, 90, info), 18_500);
    expect(s.phase).toBe('satzpause');
    expect(s.leftSeconds).toBe(72);
    expect(s.detail).toBe('Als Nächstes: Bankdrücken · Satz 3 von 4');
    expect(s.goal).toBe('Ziel: 62,5 kg × 8');
  });

  it('findet den nächsten offenen Satz', () => {
    const rows = [{ sets: [{ done: true }, { done: true }, {}] }, { sets: [{}, {}] }];
    expect(nextOpenSet(rows, 0, 1)).toEqual({ row: 0, set: 2 });
    expect(nextOpenSet(rows, 0, 2)).toEqual({ row: 1, set: 0 });
    const all = [{ sets: [{ done: true }] }, { sets: [{ done: true }, { done: true }] }];
    expect(nextOpenSet(all, 1, 1)).toBeNull();
    // Übersprungener Satz weiter oben
    const skipped = [{ sets: [{}, { done: true }] }, { sets: [{ done: true }] }];
    expect(nextOpenSet(skipped, 1, 0)).toEqual({ row: 0, set: 0 });
  });
});

describe('Laufendes Training', () => {
  it('liest gespeicherte Entwürfe vorsichtig', () => {
    const draft = parseDraft({
      dayId: 'd1', date: '2026-11-04', startedAt: 1000, minutes: '', notes: 'gut',
      rows: [{ exerciseId: 'e1', sets: [{ w: '60', r: '8', done: true }, { w: '60', r: '' }, { w: 5 }] }, { nope: true }],
    })!;
    expect(draft.rows).toEqual([{ exerciseId: 'e1', sets: [{ w: '60', r: '8', done: true }, { w: '60', r: '' }] }]);
    expect(doneSets(draft)).toBe(1);
    expect(draft.notes).toBe('gut');
    expect(parseDraft({ dayId: 'd1', date: 'gestern', rows: [] })).toBeNull();
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft({ dayId: 'd1', date: '2026-11-04', rows: [], startedAt: 'x' })?.startedAt).toBeNull();
  });

  it('schlägt die Dauer vor und beschriftet Sätze', () => {
    expect(minutesSince(0, 40 * 60_000)).toBe(45);
    expect(minutesSince(0, 10_000, 0)).toBe(1);
    expect(setLabel('Bankdrücken', 2, 4)).toBe('Bankdrücken · Satz 3 von 4');
  });
});
