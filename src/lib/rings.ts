import type { DateStr, FocusSession, Habit, HabitLog, RingGoals, Workout } from '../types';
import { addDays, parseDate } from './dates';
import { isHabitDone, streak } from './life';

export const RING_COLORS = { learn: '#FA114F', move: '#A6FF00', habits: '#00E5FF' } as const;
export const RING_TRACKS = { learn: '#3A0B12', move: '#163A05', habits: '#08303A' } as const;

export const defaultRingGoals = (): RingGoals => ({ learnMinutes: 120, moveMinutes: 30, reminder: false, reminderTime: '20:00' });

/** Ein Training ohne eingetragene Dauer zählt mit dieser Minutenzahl. */
export const DEFAULT_WORKOUT_MINUTES = 30;

export interface RingDay {
  date: DateStr;
  learn: number;
  move: number;
  habitsDone: number;
  habitsTotal: number;
  /** Anteile 0–1 (können über 1 liegen, wenn das Ziel übertroffen wurde) */
  learnShare: number;
  moveShare: number;
  habitsShare: number;
  closed: boolean;
}

export interface RingSources {
  sessions: FocusSession[];
  workouts: Workout[];
  habits: Habit[];
  habitLogs: HabitLog[];
}

/** Stand der drei Ringe an einem Tag: Lernen aus dem Fokus-Timer, Bewegung aus dem Training. */
export function ringDay(src: RingSources, goals: RingGoals, date: DateStr): RingDay {
  const learn = src.sessions.filter((s) => s.date === date).reduce((sum, s) => sum + s.minutes, 0);
  const move = src.workouts
    .filter((w) => w.done && w.date === date)
    .reduce((sum, w) => sum + (w.minutes && w.minutes > 0 ? w.minutes : DEFAULT_WORKOUT_MINUTES), 0);
  const habitsTotal = src.habits.length;
  const habitsDone = src.habits.filter((h) => isHabitDone(src.habitLogs, h, date)).length;
  const learnShare = goals.learnMinutes > 0 ? learn / goals.learnMinutes : 1;
  const moveShare = goals.moveMinutes > 0 ? move / goals.moveMinutes : 1;
  const habitsShare = habitsTotal > 0 ? habitsDone / habitsTotal : 1;
  return {
    date, learn, move, habitsDone, habitsTotal, learnShare, moveShare, habitsShare,
    closed: learnShare >= 1 && moveShare >= 1 && habitsShare >= 1,
  };
}

/** Montag bis Sonntag der Woche, in der `date` liegt. */
export function weekOf(date: DateStr): DateStr[] {
  const monday = addDays(date, -((parseDate(date).getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Welche Ringe am Abend noch offen sind – für die Erinnerung. */
export function openRings(day: RingDay): string[] {
  const open: string[] = [];
  if (day.learnShare < 1) open.push('Lernen');
  if (day.moveShare < 1) open.push('Bewegung');
  if (day.habitsShare < 1) open.push('Gewohnheiten');
  return open;
}

export interface Award {
  id: string;
  label: string;
  icon: string;
  description: string;
  earned: boolean;
  /** Fortschritt 0–1 bis zur Auszeichnung */
  progress: number;
}

/** Längste Folge von Tagen (innerhalb der letzten `days` Tage), an denen alle Ringe geschlossen waren. */
export function longestClosedRun(src: RingSources, goals: RingGoals, on: DateStr, days = 90): number {
  let best = 0;
  let run = 0;
  for (let i = days - 1; i >= 0; i--) {
    if (ringDay(src, goals, addDays(on, -i)).closed) best = Math.max(best, ++run);
    else run = 0;
  }
  return best;
}

export function awards(src: RingSources, goals: RingGoals, on: DateStr): Award[] {
  const bestStreak = Math.max(0, ...src.habits.map((h) => streak(src.habitLogs, h, on)));
  const learnedHours = src.sessions.reduce((sum, s) => sum + s.minutes, 0) / 60;
  const workouts = src.workouts.filter((w) => w.done).length;
  const closedRun = longestClosedRun(src, goals, on);
  const closedToday = ringDay(src, goals, on).closed || closedRun > 0;
  const award = (id: string, icon: string, label: string, description: string, value: number, target: number): Award => ({
    id, icon, label, description, earned: value >= target, progress: Math.min(1, value / target),
  });
  return [
    award('ringe', '⭕', 'Alle Ringe', 'Alle drei Ringe an einem Tag geschlossen', closedToday ? 1 : 0, 1),
    award('serie7', '🔥', '7-Tage-Serie', 'Eine Gewohnheit 7 Tage am Stück', bestStreak, 7),
    award('serie30', '🏅', '30-Tage-Serie', 'Eine Gewohnheit 30 Tage am Stück', bestStreak, 30),
    award('woche', '🌟', 'Perfekte Woche', '7 Tage hintereinander alle Ringe geschlossen', closedRun, 7),
    award('lernen20', '📚', '20 Std. gelernt', 'Insgesamt 20 Stunden im Fokus-Timer', learnedHours, 20),
    award('lernen100', '🎓', '100 Std. gelernt', 'Insgesamt 100 Stunden im Fokus-Timer', learnedHours, 100),
    award('training10', '💪', '10 Trainings', '10 erledigte Trainings', workouts, 10),
  ];
}
