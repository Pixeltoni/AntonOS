import type { Data, HealthDay, HealthSettings, ID, Workout } from '../types';
import type { HealthDayValues, HealthWorkout } from './native';
import { toDateStr } from './dates';

export const defaultHealth = (): HealthSettings => ({ enabled: false, workouts: true, sleep: true, steps: true });

/** So viele Tage zurück wird abgeglichen */
export const HEALTH_DAYS = 14;

/**
 * Übernimmt Werte aus Apple Health: neue Workouts als erledigte Trainings (zählen für den
 * Bewegungsring), Schritte und Schlaf als Tageswerte; Schlaf auch ins Stimmungstagebuch,
 * wenn dort noch nichts steht. Schon übernommene Workouts kommen nicht doppelt.
 */
export function mergeHealth(
  data: Data,
  values: { days: HealthDayValues[]; workouts: HealthWorkout[] },
  settings: HealthSettings,
  newId: () => ID,
): Data {
  let next = data;
  if (settings.workouts) {
    const known = new Set(data.workouts.map((w) => w.healthId).filter(Boolean));
    const fresh: Workout[] = values.workouts
      .filter((w) => !known.has(w.id) && w.minutes >= 1)
      .map((w) => ({ id: newId(), title: w.type || 'Workout', type: w.type || 'Workout', date: toDateStr(new Date(w.start)), done: true, notes: 'Aus Apple Health', minutes: Math.round(w.minutes), healthId: w.id }));
    if (fresh.length) next = { ...next, workouts: [...next.workouts, ...fresh] };
  }
  if (settings.steps || settings.sleep) {
    const byDate = new Map(next.healthDays.map((d) => [d.date, d]));
    for (const v of values.days) {
      const old = byDate.get(v.date);
      const day: HealthDay = { id: old?.id ?? newId(), date: v.date, steps: settings.steps ? Math.round(v.steps) : old?.steps ?? 0, sleepMinutes: settings.sleep ? Math.round(v.sleepMinutes) : old?.sleepMinutes ?? 0 };
      byDate.set(v.date, day);
    }
    next = { ...next, healthDays: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-120) };
  }
  if (settings.sleep) {
    const moods = next.moods.map((m) => {
      if (m.sleep) return m;
      const v = values.days.find((d) => d.date === m.date);
      return v && v.sleepMinutes > 0 ? { ...m, sleep: Math.round((v.sleepMinutes / 60) * 2) / 2 } : m;
    });
    next = { ...next, moods };
  }
  return next;
}

/** „6.120“ */
export const stepsLabel = (n: number) => Math.round(n).toLocaleString('de-DE');
