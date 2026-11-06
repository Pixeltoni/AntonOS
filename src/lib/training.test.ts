import { describe, expect, it } from 'vitest';
import type { TrainingDay, Workout } from '../types';
import { MAX_SERIES, removeSeriesFrom, seriesDates, bestSet, buildPlan, buildSeparateDay, compareSets, describeComparison, exerciseHistory, formatSets, nextTrainingDay, parseNumber, prefillSets, previousEntry, volume } from './training';

const day = (id: string, name: string): TrainingDay => ({ id, name, exercises: [{ id: `${id}-1`, name: 'Bankdrücken', sets: 3 }] });
const session = (id: string, date: string, planDayId: string, sets: { weight: number; reps: number }[], name = 'Bankdrücken', exerciseId = 'push-1'): Workout => ({
  id, title: 'Push', type: 'Krafttraining', date, done: true, notes: '', planDayId, exercises: [{ exerciseId, name, sets }],
});

describe('Trainingsplan', () => {
  it('legt einen Push/Pull-Plan an', () => {
    let n = 0;
    const plan = buildPlan(() => `id${n++}`);
    expect(plan.map((d) => d.name)).toEqual(['Push', 'Pull', 'Körpertraining']);
    expect(plan.map((d) => !!d.separate)).toEqual([false, false, true]);
    expect(plan[0].exercises.length).toBeGreaterThan(3);
    expect(new Set([plan[0].id, ...plan[0].exercises.map((e) => e.id)]).size).toBe(plan[0].exercises.length + 1);
  });

  it('baut ein separates Körpertraining', () => {
    let n = 0;
    const d = buildSeparateDay(() => `k${n++}`);
    expect(d.separate).toBe(true);
    expect(d.exercises.length).toBeGreaterThan(3);
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
    expect(formatSets([{ weight: 0, reps: 12 }])).toBe('12 Wdh.');
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

  it('lässt das separate Körpertraining aus der Reihenfolge heraus', () => {
    const koerper: TrainingDay = { ...day('koerper', 'Körpertraining'), separate: true };
    const plan = [koerper, day('push', 'Push'), day('pull', 'Pull')];
    // Nie trainiert: trotzdem nicht „Als Nächstes“
    expect(nextTrainingDay(plan, [])?.name).toBe('Push');
    // Körpertraining zwischendurch verschiebt Push/Pull nicht
    const ws = [session('a', '2026-10-01', 'push', []), session('b', '2026-10-02', 'koerper', [])];
    expect(nextTrainingDay(plan, ws)?.name).toBe('Pull');
    expect(nextTrainingDay([koerper], [])).toBeNull();
  });

  it('übernimmt die Sätze vom letzten Mal', () => {
    expect(prefillSets(3, [{ weight: 60, reps: 10 }, { weight: 60, reps: 0 }])).toEqual([{ weight: 60, reps: 10 }]);
    expect(prefillSets(3, undefined)).toHaveLength(3);
  });
});

describe('Trainings-Serien', () => {
  it('plant an mehreren Wochentagen', () => {
    // 2026-11-02 ist ein Montag
    expect(seriesDates('woechentlich', '2026-11-02', '2026-11-15', [1, 4])).toEqual(['2026-11-02', '2026-11-05', '2026-11-09', '2026-11-12']);
    expect(seriesDates('woechentlich', '2026-11-04', '2026-11-18', [])).toEqual(['2026-11-04', '2026-11-11', '2026-11-18']);
  });
  it('plant monatlich, auch am Monatsende', () => {
    expect(seriesDates('monatlich', '2027-01-31', '2027-04-30')).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
    expect(seriesDates('monatlich', '2026-11-15', '2027-01-15')).toEqual(['2026-11-15', '2026-12-15', '2027-01-15']);
  });
  it('einmal oder ohne gültiges Ende nur ein Termin, nie unendlich viele', () => {
    expect(seriesDates('einmal', '2026-11-02', '2027-11-02', [1])).toEqual(['2026-11-02']);
    expect(seriesDates('woechentlich', '2026-11-02', '2026-10-01', [1])).toEqual(['2026-11-02']);
    expect(seriesDates('woechentlich', '2026-01-01', '2036-01-01', [1, 2, 3, 4, 5, 6, 7])).toHaveLength(MAX_SERIES);
  });
});

describe('Serie löschen', () => {
  it('löscht nur offene, künftige Termine der Serie', () => {
    const base = { title: 'Push', type: 'Krafttraining', notes: '' };
    const ws = [
      { ...base, id: '1', date: '2026-11-02', done: true, seriesId: 's' },
      { ...base, id: '2', date: '2026-11-05', done: false, seriesId: 's' },
      { ...base, id: '3', date: '2026-11-09', done: false, seriesId: 's' },
      { ...base, id: '4', date: '2026-11-09', done: false, seriesId: 'x' },
      { ...base, id: '5', date: '2026-11-01', done: false, seriesId: 's' },
    ];
    expect(removeSeriesFrom(ws, 's', '2026-11-05').map((w) => w.id)).toEqual(['1', '4', '5']);
  });
});

import { dayTargetSummary, describeTarget, formatTarget, nextTarget, parseRepRange, setText, stalled, targetFor } from './training';

describe('Nächstes Ziel', () => {
  const bench = { name: 'Bankdrücken', sets: 3, reps: '6–10' };
  const s = (weight: number, ...reps: number[]) => reps.map((r) => ({ weight, reps: r }));

  it('liest den Wiederholungsbereich', () => {
    expect(parseRepRange('8–12')).toEqual([8, 12]);
    expect(parseRepRange('10')).toEqual([10, 10]);
    expect(parseRepRange('12-8')).toEqual([8, 12]);
    expect(parseRepRange('')).toBeNull();
  });

  it('steigert das Gewicht, wenn alle Sätze oben im Bereich waren', () => {
    const t = nextTarget(bench, [s(60, 10, 10, 11)])!;
    expect(t).toEqual({ weight: 62.5, reps: [6, 6, 6], kind: 'steigern', plus: 2.5 });
    expect(formatTarget(t)).toBe('62,5 kg × 6 · 6 · 6');
    expect(describeTarget(t)).toBe('↑ +2,5 kg');
    expect(nextTarget(bench, [s(8, 10, 10, 10)])?.weight).toBe(9);
  });

  it('sonst gleiches Gewicht und in jedem Satz eine Wiederholung mehr', () => {
    const t = nextTarget(bench, [s(60, 10, 9, 7)])!;
    expect(t).toEqual({ weight: 60, reps: [10, 10, 8], kind: 'mehr', plus: 2 });
    expect(describeTarget(t)).toBe('+2 Wdh.');
  });

  it('zählt nur Arbeitssätze mit dem höchsten Gewicht', () => {
    const t = nextTarget(bench, [[{ weight: 40, reps: 10 }, ...s(60, 10, 10)]])!;
    expect(t.kind).toBe('halten');
    expect(t.reps).toEqual([10, 10, 10]);
    expect(describeTarget(t)).toBe('alle Sätze schaffen');
  });

  it('Körpergewicht und Übungen auf Zeit', () => {
    const pullups = nextTarget({ name: 'Klimmzüge', sets: 2, reps: '6–10' }, [s(0, 10, 10)])!;
    expect(pullups).toEqual({ weight: 0, reps: [11, 11], kind: 'mehr', plus: 2 });
    expect(formatTarget(pullups)).toBe('11 · 11 Wdh.');
    const plank = nextTarget({ name: 'Plank (Sek.)', sets: 3, reps: '30–60' }, [s(0, 40, 40, 35)])!;
    expect(plank.reps).toEqual([45, 45, 40]);
    expect(formatTarget(plank, true)).toBe('45 · 45 · 40 Sek.');
    expect(describeTarget(plank, true)).toBe('+15 Sek.');
    expect(nextTarget(bench, [])).toBeNull();
  });

  it('schlägt nach drei Einheiten Stillstand eine leichtere Einheit vor', () => {
    const flat = [s(60, 9, 8, 8), s(60, 9, 8, 8), s(60, 9, 8, 8), s(60, 9, 9, 8)];
    expect(stalled(flat)).toBe(true);
    const t = nextTarget(bench, flat)!;
    expect(t).toEqual({ weight: 55, reps: [9, 8, 8], kind: 'leichter', plus: 5 });
    expect(describeTarget(t)).toBe('↓ −5 kg');
    // Fortschritt in einer der drei Einheiten: kein Stillstand
    expect(stalled([s(60, 9, 8, 8), s(60, 9, 8, 7), s(60, 9, 8, 8), s(60, 9, 8, 8)])).toBe(false);
    // Nach der leichteren Einheit nicht gleich wieder
    expect(stalled([s(55, 9, 8, 8), ...flat.slice(0, 3)])).toBe(false);
    expect(stalled(flat.slice(0, 3))).toBe(false);
    expect(stalled([s(0, 10), s(0, 10), s(0, 10), s(0, 10)])).toBe(false);
  });

  it('liest das Ziel aus den eingetragenen Trainings', () => {
    const day = { id: 'd', name: 'Push', exercises: [{ id: 'b', ...bench }, { id: 'f', name: 'Seitheben', sets: 3, reps: '12–15' }] };
    const workouts = [
      { id: 'w1', title: 'Push', type: 'Krafttraining', date: '2026-11-01', done: true, notes: '', exercises: [{ exerciseId: 'b', name: 'Bankdrücken', sets: s(60, 10, 10, 10) }, { exerciseId: 'f', name: 'Seitheben', sets: s(8, 13, 12, 12) }] },
    ];
    expect(targetFor(workouts, day.exercises[0], '2026-11-04')?.weight).toBe(62.5);
    expect(targetFor(workouts, day.exercises[0], '2026-10-30')).toBeNull();
    expect(targetFor(workouts, day.exercises[0], '2026-11-04', 'w1')).toBeNull();
    expect(dayTargetSummary(day, workouts, '2026-11-04')).toEqual({ up: ['Bankdrücken'], lighter: [] });
  });

  it('schreibt einen Satz', () => {
    expect(setText(62.5, 8)).toBe('62,5 kg × 8');
    expect(setText(0, 12)).toBe('12 Wdh.');
    expect(setText(0, 45, true)).toBe('45 Sek.');
    expect(setText(20, 0)).toBe('20 kg');
  });
});
