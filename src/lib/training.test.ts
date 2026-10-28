import { describe, expect, it } from 'vitest';
import type { TrainingDay, Workout } from '../types';
import { bestSet, buildPlan, compareSets, describeComparison, exerciseHistory, formatSets, nextTrainingDay, parseNumber, prefillSets, previousEntry, volume } from './training';

const day = (id: string, name: string): TrainingDay => ({ id, name, exercises: [{ id: `${id}-1`, name: 'Bankdrücken', sets: 3 }] });
const session = (id: string, date: string, planDayId: string, sets: { weight: number; reps: number }[], name = 'Bankdrücken', exerciseId = 'push-1'): Workout => ({
  id, title: 'Push', type: 'Krafttraining', date, done: true, notes: '', planDayId, exercises: [{ exerciseId, name, sets }],
});

describe('Trainingsplan', () => {
  it('legt einen Push/Pull-Plan an', () => {
    let n = 0;
    const plan = buildPlan(() => `id${n++}`);
    expect(plan.map((d) => d.name)).toEqual(['Push', 'Pull']);
    expect(plan[0].exercises.length).toBeGreaterThan(3);
    expect(new Set([plan[0].id, ...plan[0].exercises.map((e) => e.id)]).size).toBe(plan[0].exercises.length + 1);
  });

  it('versteht Zahlen mit Komma', () => {
    expect(parseNumber('62,5')).toBe(62.5);
    expect(parseNumber(' 10 ')).toBe(10);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('-5')).toBeNull();
  });

  it('fasst Sätze zusammen', () => {
    const sets = [{ weight: 60, reps: 10 }, { weight: 60, reps: 8 }, { weight: 0, reps: 0 }];
    expect(formatSets(sets)).toBe('60 kg × 10 · 8');
    expect(formatSets([{ weight: 60, reps: 10 }, { weight: 62.5, reps: 6 }])).toBe('60×10 · 62,5×6');
    expect(formatSets([{ weight: 0, reps: 12 }])).toBe('KG × 12');
    expect(bestSet(sets)).toEqual({ weight: 60, reps: 10 });
    expect(volume(sets)).toBe(1080);
  });

  it('vergleicht mit dem letzten Mal', () => {
    const prev = [{ weight: 60, reps: 10 }, { weight: 60, reps: 8 }];
    const more = compareSets([{ weight: 62.5, reps: 8 }, { weight: 62.5, reps: 7 }], prev)!;
    expect(more.trend).toBe('besser');
    expect(describeComparison(more)).toBe('+2,5 kg, −3 Wdh.');
    expect(compareSets([{ weight: 60, reps: 10 }, { weight: 60, reps: 9 }], prev)!.trend).toBe('besser');
    expect(compareSets(prev, prev)!.trend).toBe('gleich');
    expect(compareSets([{ weight: 57.5, reps: 12 }], prev)!.trend).toBe('schlechter');
    expect(compareSets([], prev)).toBeNull();
  });

  it('findet den Verlauf einer Übung, auch nach Namen', () => {
    const ws = [
      session('a', '2026-10-01', 'push', [{ weight: 50, reps: 10 }]),
      session('b', '2026-10-08', 'push', [{ weight: 55, reps: 10 }], 'bankdrücken', 'anders'),
      { ...session('c', '2026-10-15', 'push', [{ weight: 60, reps: 10 }]), done: false },
    ];
    expect(exerciseHistory(ws, 'push-1', 'Bankdrücken').map((e) => e.workoutId)).toEqual(['b', 'a']);
    expect(previousEntry(ws, 'push-1', 'Bankdrücken', '2026-10-10')?.workoutId).toBe('b');
    expect(previousEntry(ws, 'push-1', 'Bankdrücken', '2026-10-08', 'b')?.workoutId).toBe('a');
  });

  it('sortiert zwei Trainings am selben Tag nach Eintragung', () => {
    const ws = [session('z', '2026-10-01', 'push', [{ weight: 50, reps: 10 }]), session('a', '2026-10-01', 'push', [{ weight: 55, reps: 10 }])];
    expect(exerciseHistory(ws, 'push-1', 'Bankdrücken').map((e) => e.workoutId)).toEqual(['a', 'z']);
  });

  it('schlägt den Tag vor, der am längsten her ist', () => {
    const plan = [day('push', 'Push'), day('pull', 'Pull')];
    expect(nextTrainingDay(plan, [])?.name).toBe('Push');
    expect(nextTrainingDay(plan, [session('a', '2026-10-01', 'push', [])])?.name).toBe('Pull');
    expect(nextTrainingDay(plan, [session('a', '2026-10-01', 'pull', []), session('b', '2026-10-03', 'push', [])])?.name).toBe('Pull');
    expect(nextTrainingDay([], [])).toBeNull();
  });

  it('übernimmt die Sätze vom letzten Mal', () => {
    expect(prefillSets(3, [{ weight: 60, reps: 10 }, { weight: 60, reps: 0 }])).toEqual([{ weight: 60, reps: 10 }]);
    expect(prefillSets(3, undefined)).toHaveLength(3);
  });
});
