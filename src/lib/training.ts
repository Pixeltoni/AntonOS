import type { DateStr, ExerciseLog, ID, SetLog, TrainingDay, Workout } from '../types';
import { addDays } from './dates';
import { weekdayOf } from './recurrence';

/** Vorlage für einen Push/Pull-Split (ohne IDs, die vergibt der Aufrufer) */
export const PUSH_PULL_TEMPLATE: { name: string; exercises: { name: string; sets: number; reps: string }[] }[] = [
  {
    name: 'Push',
    exercises: [
      { name: 'Bankdrücken', sets: 3, reps: '6–10' },
      { name: 'Schulterdrücken', sets: 3, reps: '8–12' },
      { name: 'Schrägbankdrücken (KH)', sets: 3, reps: '8–12' },
      { name: 'Seitheben', sets: 3, reps: '12–15' },
      { name: 'Trizepsdrücken am Kabel', sets: 3, reps: '10–15' },
    ],
  },
  {
    name: 'Pull',
    exercises: [
      { name: 'Klimmzüge', sets: 3, reps: '6–10' },
      { name: 'Langhantelrudern', sets: 3, reps: '8–12' },
      { name: 'Latzug', sets: 3, reps: '10–12' },
      { name: 'Face Pulls', sets: 3, reps: '12–15' },
      { name: 'Bizepscurls', sets: 3, reps: '10–12' },
    ],
  },
];

export function buildPlan(makeId: () => ID): TrainingDay[] {
  return PUSH_PULL_TEMPLATE.map((d) => ({ id: makeId(), name: d.name, exercises: d.exercises.map((e) => ({ id: makeId(), ...e })) }));
}

/** Zahl aus einem Eingabefeld, auch mit Komma („62,5“). Leer oder ungültig = null. */
export function parseNumber(input: string): number | null {
  const s = input.trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** 62.5 → „62,5“ */
export const formatNumber = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 });

/** Sätze mit mindestens einer Wiederholung */
export const validSets = (sets: SetLog[]) => sets.filter((s) => s.reps > 0);

/** Bewegtes Gewicht: Summe aus Gewicht × Wiederholungen */
export const volume = (sets: SetLog[]) => validSets(sets).reduce((sum, s) => sum + s.weight * s.reps, 0);

export const totalReps = (sets: SetLog[]) => validSets(sets).reduce((sum, s) => sum + s.reps, 0);

/** Bester Satz: höchstes Gewicht, bei Gleichstand mehr Wiederholungen */
export function bestSet(sets: SetLog[]): SetLog | null {
  let best: SetLog | null = null;
  for (const s of validSets(sets)) {
    if (!best || s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps)) best = s;
  }
  return best;
}

/** „60 kg × 10 · 10 · 8“ bzw. „60×10 · 62,5×8“ bei wechselndem Gewicht */
export function formatSets(sets: SetLog[]): string {
  const v = validSets(sets);
  if (v.length === 0) return '–';
  const same = v.every((s) => s.weight === v[0].weight);
  if (same) return `${v[0].weight > 0 ? `${formatNumber(v[0].weight)} kg` : 'KG'} × ${v.map((s) => s.reps).join(' · ')}`;
  return v.map((s) => `${formatNumber(s.weight)}×${s.reps}`).join(' · ');
}

const sameExercise = (log: ExerciseLog, exerciseId: ID, name: string) =>
  log.exerciseId === exerciseId || log.name.trim().toLowerCase() === name.trim().toLowerCase();

export interface ExerciseEntry {
  date: DateStr;
  workoutId: ID;
  sets: SetLog[];
}

/** Alle eingetragenen Durchgänge einer Übung, neueste zuerst (erkennt die Übung auch am Namen). */
export function exerciseHistory(workouts: Workout[], exerciseId: ID, name: string): ExerciseEntry[] {
  const out: (ExerciseEntry & { order: number })[] = [];
  workouts.forEach((w, order) => {
    if (!w.done || !w.exercises) return;
    const log = w.exercises.find((l) => sameExercise(l, exerciseId, name));
    if (log && validSets(log.sets).length) out.push({ date: w.date, workoutId: w.id, sets: log.sets, order });
  });
  // Am selben Tag gilt das später eingetragene Training als neuer
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.order - a.order).map(({ order: _, ...e }) => e);
}

/** Letzter Durchgang vor einem Training (ohne das Training selbst, z. B. beim Bearbeiten) */
export function previousEntry(workouts: Workout[], exerciseId: ID, name: string, date: DateStr, skipWorkoutId?: ID): ExerciseEntry | null {
  return exerciseHistory(workouts, exerciseId, name).find((e) => e.workoutId !== skipWorkoutId && e.date <= date) ?? null;
}

export type Trend = 'besser' | 'gleich' | 'schlechter';

export interface Comparison {
  /** Unterschied beim besten Satz in kg */
  weight: number;
  /** Unterschied bei allen Wiederholungen zusammen */
  reps: number;
  /** Unterschied beim bewegten Gewicht in kg */
  volume: number;
  trend: Trend;
}

/** Vergleicht einen Durchgang mit dem letzten: erst das Gewicht, dann die Wiederholungen. */
export function compareSets(current: SetLog[], previous: SetLog[]): Comparison | null {
  const a = bestSet(current);
  const b = bestSet(previous);
  if (!a || !b) return null;
  const weight = a.weight - b.weight;
  const reps = totalReps(current) - totalReps(previous);
  const vol = volume(current) - volume(previous);
  // Gewicht zählt zuerst; bei gleichem Gewicht entscheiden die Wiederholungen (bzw. bei Körpergewicht)
  const score = weight !== 0 ? weight : a.reps - b.reps !== 0 ? a.reps - b.reps : reps;
  return { weight, reps, volume: vol, trend: score > 0 ? 'besser' : score < 0 ? 'schlechter' : 'gleich' };
}

/** „+2,5 kg“, „+3 Wdh.“ oder „gleich“ */
export function describeComparison(c: Comparison): string {
  const parts: string[] = [];
  if (c.weight !== 0) parts.push(`${c.weight > 0 ? '+' : '−'}${formatNumber(Math.abs(c.weight))} kg`);
  if (c.reps !== 0) parts.push(`${c.reps > 0 ? '+' : '−'}${Math.abs(c.reps)} Wdh.`);
  return parts.length ? parts.join(', ') : 'gleich';
}

/** Welcher Tag ist dran? Der, der am längsten nicht (oder noch nie) trainiert wurde. */
export function nextTrainingDay(plan: TrainingDay[], workouts: Workout[]): TrainingDay | null {
  if (plan.length === 0) return null;
  const last = (id: ID) => workouts.filter((w) => w.done && w.planDayId === id).reduce<DateStr>((m, w) => (w.date > m ? w.date : m), '');
  let pick = plan[0];
  for (const d of plan) if (last(d.id) < last(pick.id)) pick = d;
  return pick;
}

/** Letztes Training eines Plan-Tags */
export function lastSessionOf(workouts: Workout[], dayId: ID): Workout | null {
  return workouts.filter((w) => w.done && w.planDayId === dayId).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}

/**
 * Startwerte für ein neues Training: die Sätze vom letzten Mal, sonst leere Sätze nach Plan.
 * So muss man meist nur noch bestätigen oder eine Zahl ändern.
 */
export function prefillSets(planned: number, previous: SetLog[] | undefined): SetLog[] {
  const prev = previous ? validSets(previous) : [];
  if (prev.length) return prev.map((s) => ({ ...s }));
  return Array.from({ length: Math.max(1, planned) }, () => ({ weight: 0, reps: 0 }));
}

export type WorkoutRepeat = 'einmal' | 'woechentlich' | 'monatlich';

/** Höchstzahl an Terminen, die eine Serie auf einmal anlegt */
export const MAX_SERIES = 120;

/**
 * Alle Termine einer Trainings-Serie:
 * - einmal: nur `start`
 * - wöchentlich: an jedem gewählten Wochentag (1 = Mo … 7 = So) von `start` bis `until`
 * - monatlich: jeden Monat am Tag von `start` (in kürzeren Monaten am letzten Tag)
 */
export function seriesDates(repeat: WorkoutRepeat, start: DateStr, until: DateStr, weekdays: number[] = []): DateStr[] {
  if (repeat === 'einmal' || until < start) return [start];
  const out: DateStr[] = [];
  if (repeat === 'woechentlich') {
    const days = new Set(weekdays.length ? weekdays : [weekdayOf(start)]);
    for (let d = start; d <= until && out.length < MAX_SERIES; d = addDays(d, 1)) if (days.has(weekdayOf(d))) out.push(d);
    return out;
  }
  const [y, m, day] = start.split('-').map(Number);
  for (let i = 0; out.length < MAX_SERIES; i++) {
    const year = y + Math.floor((m - 1 + i) / 12);
    const month = ((m - 1 + i) % 12) + 1;
    const last = new Date(year, month, 0).getDate();
    const d = `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
    if (d > until) break;
    out.push(d);
  }
  return out;
}

/** Entfernt die noch offenen Termine einer Serie ab `from` (erledigte Trainings bleiben). */
export function removeSeriesFrom(workouts: Workout[], seriesId: ID, from: DateStr): Workout[] {
  return workouts.filter((w) => !(w.seriesId === seriesId && !w.done && w.date >= from));
}
