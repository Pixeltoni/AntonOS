import { describe, expect, it } from 'vitest';
import type { TrainingDay, Workout } from '../types';
import { bodyweightDay, repsOnDay, repStep, resolveRepsEntries, widgetBodyweight } from './bodyweight';
import { buildSeparateDay, isRepsOnly, targetFor } from './training';
import { parseWidgetActions, resolveWidgetActions } from './widgets';

const koerper: TrainingDay = {
  id: 'k', name: 'Körpertraining', separate: true, repsOnly: true,
  exercises: [{ id: 'ls', name: 'Liegestütze', sets: 3, reps: '10–20' }, { id: 'pl', name: 'Plank (Sek.)', sets: 3, reps: '30–60' }],
};
const push: TrainingDay = { id: 'p', name: 'Push', exercises: [{ id: 'bd', name: 'Bankdrücken', sets: 3, reps: '6–10' }] };
const w = (id: string, date: string, sets: number[], extra: Partial<Workout> = {}): Workout => ({
  id, title: 'Körpertraining', type: 'Krafttraining', date, done: true, notes: '', planDayId: 'k',
  exercises: [{ exerciseId: 'ls', name: 'Liegestütze', sets: sets.map((reps) => ({ weight: 0, reps })) }], ...extra,
});
const DAY = '2026-11-06';

describe('Nur Wiederholungen', () => {
  it('erkennt Körpertraining auch in älteren Plänen', () => {
    expect(isRepsOnly(koerper)).toBe(true);
    expect(isRepsOnly({ name: 'Körpertraining', separate: true })).toBe(true);
    expect(isRepsOnly({ name: 'Körpertraining', separate: true, repsOnly: false })).toBe(false);
    expect(isRepsOnly(push)).toBe(false);
    expect(isRepsOnly(undefined)).toBe(false);
    let n = 0;
    expect(buildSeparateDay(() => `id${n++}`).repsOnly).toBe(true);
  });

  it('Ziel ohne Gewicht, auch wenn früher mit Gewicht eingetragen', () => {
    const old = w('a', '2026-11-01', [12, 12, 12]);
    old.exercises![0].sets = old.exercises![0].sets.map((s) => ({ ...s, weight: 10 }));
    const t = targetFor([old], koerper.exercises[0], DAY, undefined, true);
    expect(t?.weight).toBe(0);
    expect(t?.reps).toEqual([13, 13, 13]);
  });
});

describe('Körpertraining-Widget', () => {
  it('zählt die Wiederholungen eines Tages und schlägt eine Menge pro Tipp vor', () => {
    const ws = [w('a', DAY, [20, 15]), w('b', DAY, [10]), w('c', '2026-11-05', [25]), w('d', DAY, [99], { done: false })];
    expect(repsOnDay(ws, koerper.exercises[0], DAY)).toBe(45);
    expect(repStep(ws, koerper.exercises[0])).toBe(10); // später am selben Tag eingetragen = neuer
    expect(repStep([], koerper.exercises[1])).toBe(30);
    expect(repStep([], { id: 'z', name: 'Dips' })).toBe(10);
    const s = widgetBodyweight({ workouts: ws, trainingPlan: [push, koerper] }, DAY)!;
    expect(s.dayId).toBe('k');
    expect(s.exercises[0]).toMatchObject({ id: 'ls', today: 45, timed: false });
    expect(s.exercises[0].week).toEqual([0, 0, 0, 0, 0, 25, 45]);
    expect(s.exercises[1].timed).toBe(true);
    expect(widgetBodyweight({ workouts: [], trainingPlan: [push] }, DAY)).toBeNull();
    expect(bodyweightDay([push])).toBeNull();
  });

  it('legt das Training des Tages an und hängt Sätze an', () => {
    const plan = [push, koerper];
    expect(resolveRepsEntries({ workouts: [], trainingPlan: plan }, [
      { exerciseId: 'ls', day: DAY, reps: 20, at: 1 },
      { exerciseId: 'ls', day: DAY, reps: 15, at: 2 },
      { exerciseId: 'pl', day: DAY, reps: 45, at: 3 },
    ])).toEqual([{
      op: 'add', collection: 'workouts',
      item: {
        title: 'Körpertraining', type: 'Krafttraining', date: DAY, done: true, notes: '', planDayId: 'k',
        exercises: [
          { exerciseId: 'ls', name: 'Liegestütze', sets: [{ weight: 0, reps: 20 }, { weight: 0, reps: 15 }] },
          { exerciseId: 'pl', name: 'Plank (Sek.)', sets: [{ weight: 0, reps: 45 }] },
        ],
      },
    }]);
    // Vorhandenes Training von heute: Satz dazu, Abziehen verkleinert den letzten Satz
    expect(resolveRepsEntries({ workouts: [w('a', DAY, [20, 15])], trainingPlan: plan }, [
      { exerciseId: 'ls', day: DAY, reps: 10, at: 1 },
      { exerciseId: 'ls', day: DAY, reps: -15, at: 2 },
    ])).toEqual([{ op: 'update', collection: 'workouts', id: 'a', patch: { done: true, exercises: [{ exerciseId: 'ls', name: 'Liegestütze', sets: [{ weight: 0, reps: 20 }, { weight: 0, reps: 10 }] }] } }]);
    // Geplantes Training gilt danach als erledigt
    expect(resolveRepsEntries({ workouts: [{ ...w('a', DAY, []), done: false, exercises: [] }], trainingPlan: plan }, [{ exerciseId: 'ls', day: DAY, reps: 10, at: 1 }])[0])
      .toMatchObject({ op: 'update', id: 'a', patch: { done: true } });
    // Nur abziehen ohne Training: nichts tun
    expect(resolveRepsEntries({ workouts: [], trainingPlan: plan }, [{ exerciseId: 'ls', day: DAY, reps: -10, at: 1 }])).toEqual([]);
  });

  it('kommt über die Warteschlange der Widgets', () => {
    const actions = parseWidgetActions([{ kind: 'reps', id: 'ls', done: true, day: DAY, amount: 12, at: 5 }]);
    expect(actions).toHaveLength(1);
    const ops = resolveWidgetActions({ tasks: [], shopping: [], habits: [], habitLogs: [], cards: [], workouts: [], trainingPlan: [koerper] }, actions);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: 'add', collection: 'workouts' });
  });
});
