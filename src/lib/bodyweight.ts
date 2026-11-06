/**
 * Körpertraining schnell eintragen (iOS-Widget „Körpertraining“): Wiederholungen ohne Gewicht,
 * z. B. täglich Liegestütze. Jeder Tipp im Widget ist ein Satz; die App sammelt die Sätze eines
 * Tages im Training des Körpertraining-Tags (ein Eintrag pro Tag, wird bei Bedarf angelegt).
 */
import type { Data, DateStr, ExerciseLog, ID, PlanExercise, TrainingDay, Workout } from '../types';
import { addDays } from './dates';
import { exerciseHistory, isRepsOnly, parseRepRange, timedExercise, totalReps, validSets } from './training';

export interface WidgetBodyExercise {
  id: ID;
  name: string;
  /** Wiederholungen (bzw. Sekunden) heute insgesamt */
  today: number;
  /** Menge pro Tipp: erster Satz vom letzten Mal, sonst unteres Ende des Plans, sonst 10 */
  step: number;
  timed: boolean;
  /** Insgesamt an den letzten 7 Tagen, ältester zuerst, heute zuletzt */
  week: number[];
}

export interface WidgetBodyweight {
  dayId: ID;
  name: string;
  exercises: WidgetBodyExercise[];
}

const sameExercise = (log: ExerciseLog, ex: Pick<PlanExercise, 'id' | 'name'>) =>
  log.exerciseId === ex.id || log.name.trim().toLowerCase() === ex.name.trim().toLowerCase();

/** Alle Wiederholungen einer Übung an einem Tag (aus allen erledigten Trainings) */
export function repsOnDay(workouts: Workout[], ex: Pick<PlanExercise, 'id' | 'name'>, day: DateStr): number {
  return workouts
    .filter((w) => w.done && w.date === day)
    .reduce((sum, w) => sum + (w.exercises ?? []).filter((l) => sameExercise(l, ex)).reduce((s, l) => s + totalReps(l.sets), 0), 0);
}

/** Der erste Tag im Plan, der nur Wiederholungen zählt (das Körpertraining) */
export const bodyweightDay = (plan: TrainingDay[]) => plan.find((d) => isRepsOnly(d) && d.exercises.length > 0) ?? null;

/** Menge pro Tipp im Widget */
export function repStep(workouts: Workout[], ex: Pick<PlanExercise, 'id' | 'name' | 'reps'>): number {
  const last = exerciseHistory(workouts, ex.id, ex.name)[0];
  const first = last ? validSets(last.sets)[0] : undefined;
  if (first && first.reps > 0) return first.reps;
  return parseRepRange(ex.reps)?.[0] ?? 10;
}

/** Stand fürs Widget: Übungen des Körpertrainings mit heutigem Stand und der letzten Woche */
export function widgetBodyweight(data: Pick<Data, 'workouts' | 'trainingPlan'>, day: DateStr): WidgetBodyweight | null {
  const plan = bodyweightDay(data.trainingPlan);
  if (!plan) return null;
  return {
    dayId: plan.id,
    name: plan.name,
    exercises: plan.exercises.map((e) => ({
      id: e.id,
      name: e.name,
      today: repsOnDay(data.workouts, e, day),
      step: repStep(data.workouts, e),
      timed: timedExercise(e),
      week: Array.from({ length: 7 }, (_, i) => repsOnDay(data.workouts, e, addDays(day, i - 6))),
    })),
  };
}

/** Ein Tipp im Widget: `reps` > 0 = neuer Satz, < 0 = so viele Wiederholungen vom Ende wieder weg */
export interface RepsEntry {
  exerciseId: ID;
  day: DateStr;
  reps: number;
  at: number;
}

export type BodyweightOp =
  | { op: 'add'; collection: 'workouts'; item: Omit<Workout, 'id'> }
  | { op: 'update'; collection: 'workouts'; id: ID; patch: Partial<Workout> };

/** Wiederholungen vom Ende abziehen: letzter Satz wird kleiner oder fällt weg */
function takeReps(log: ExerciseLog, n: number): ExerciseLog {
  const sets = validSets(log.sets).map((s) => ({ ...s }));
  let rest = n;
  while (rest > 0 && sets.length) {
    const last = sets[sets.length - 1];
    if (last.reps > rest) {
      last.reps -= rest;
      rest = 0;
    } else {
      rest -= last.reps;
      sets.pop();
    }
  }
  return { ...log, sets };
}

/**
 * Was die App mit den Tipps aus dem Widget tun muss: pro Tag ein Training des Körpertraining-Tags
 * (vorhandenes erledigtes, sonst ein geplantes – das gilt dann als erledigt –, sonst ein neues).
 * Jeder Tipp zählt, der Reihe nach.
 */
export function resolveRepsEntries(data: Pick<Data, 'workouts' | 'trainingPlan'>, entries: RepsEntry[]): BodyweightOp[] {
  const ops: BodyweightOp[] = [];
  const byDay = new Map<DateStr, RepsEntry[]>();
  for (const e of [...entries].sort((a, b) => a.at - b.at)) {
    if (!Number.isFinite(e.reps) || e.reps === 0) continue;
    byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);
  }
  for (const [day, list] of byDay) {
    // Tag des Plans, zu dem die Übung gehört (sonst das Körpertraining)
    const plan = data.trainingPlan.find((d) => isRepsOnly(d) && d.exercises.some((x) => x.id === list[0].exerciseId)) ?? bodyweightDay(data.trainingPlan);
    if (!plan) continue;
    const ofDay = data.workouts.filter((w) => w.date === day && w.planDayId === plan.id);
    const workout = ofDay.find((w) => w.done) ?? ofDay.find((w) => !w.done);
    let logs: ExerciseLog[] = (workout?.exercises ?? []).map((l) => ({ ...l, sets: [...l.sets] }));
    for (const e of list) {
      const ex = plan.exercises.find((x) => x.id === e.exerciseId);
      if (!ex) continue;
      const i = logs.findIndex((l) => sameExercise(l, ex));
      if (e.reps > 0) {
        const set = { weight: 0, reps: Math.round(e.reps) };
        if (i >= 0) logs[i] = { ...logs[i], sets: [...logs[i].sets, set] };
        else logs.push({ exerciseId: ex.id, name: ex.name, sets: [set] });
      } else if (i >= 0) {
        logs[i] = takeReps(logs[i], Math.round(-e.reps));
      }
    }
    logs = logs.filter((l) => validSets(l.sets).length > 0);
    if (workout) {
      ops.push({ op: 'update', collection: 'workouts', id: workout.id, patch: { exercises: logs, done: workout.done || logs.length > 0 } });
    } else if (logs.length) {
      ops.push({ op: 'add', collection: 'workouts', item: { title: plan.name, type: 'Krafttraining', date: day, done: true, notes: '', planDayId: plan.id, exercises: logs } });
    }
  }
  return ops;
}
