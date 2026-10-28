import type { DateStr, FocusSession, Habit, HabitLog, RingGoals, RingSlot, RingSource, Task, Workout } from '../types';
import { addDays, parseDate } from './dates';
import { habitAmount, isHabitDone, streak } from './life';

export const RING_COLORS = { learn: '#FA114F', move: '#A6FF00', habits: '#00E5FF' } as const;
export const RING_TRACKS = { learn: '#3A0B12', move: '#163A05', habits: '#08303A' } as const;
/** Farben nach Position (außen, Mitte, innen) wie bei Apple Fitness */
export const SLOT_COLORS = [RING_COLORS.learn, RING_COLORS.move, RING_COLORS.habits] as const;
export const SLOT_TRACKS = [RING_TRACKS.learn, RING_TRACKS.move, RING_TRACKS.habits] as const;

export const defaultRingGoals = (): RingGoals => ({ learnMinutes: 120, moveMinutes: 30, reminder: false, reminderTime: '20:00' });

/** Ein Training ohne eingetragene Dauer zählt mit dieser Minutenzahl. */
export const DEFAULT_WORKOUT_MINUTES = 30;

/** Vorschlag für das Tagesziel, wenn ein Ring eine neue Quelle bekommt */
export const DEFAULT_SLOT_GOAL: Record<'learn' | 'focus' | 'move' | 'tasks', number> = { learn: 120, focus: 120, move: 30, tasks: 3 };

export const SOURCE_LABELS: Record<'learn' | 'focus' | 'move' | 'habits' | 'tasks' | 'off', string> = {
  learn: 'Lernen',
  focus: 'Fokuszeit',
  move: 'Bewegung',
  habits: 'Gewohnheiten',
  tasks: 'Aufgaben',
  off: 'Aus',
};

/** Braucht diese Quelle ein eigenes Tagesziel? (Gewohnheiten bringen ihr Ziel selbst mit) */
export const sourceHasGoal = (source: RingSource): source is 'learn' | 'focus' | 'move' | 'tasks' =>
  source === 'learn' || source === 'focus' || source === 'move' || source === 'tasks';

/** Die drei Ringe – ohne eigene Auswahl wie bisher Lernen, Bewegung, Gewohnheiten. */
export function ringSlots(goals: RingGoals): RingSlot[] {
  const fallback: RingSlot[] = [
    { source: 'learn', goal: goals.learnMinutes },
    { source: 'move', goal: goals.moveMinutes },
    { source: 'habits', goal: 0 },
  ];
  if (!Array.isArray(goals.slots) || goals.slots.length === 0) return fallback;
  return fallback.map((f, i) => {
    const s = goals.slots?.[i];
    if (!s || typeof s.source !== 'string') return i === 0 ? f : { source: 'off', goal: 0 };
    return { source: s.source, goal: Number(s.goal) > 0 ? Number(s.goal) : sourceHasGoal(s.source) ? DEFAULT_SLOT_GOAL[s.source] : 0 };
  });
}

export interface RingValue {
  source: RingSource;
  /** Position 0–2 (für die Farbe) */
  slot: number;
  label: string;
  value: number;
  goal: number;
  /** Anteil 0–1 (kann über 1 liegen, wenn das Ziel übertroffen wurde) */
  share: number;
  /** z. B. „45/120 Min.“ */
  text: string;
  color: string;
  track: string;
}

export interface RingDay {
  date: DateStr;
  /** Die eingeschalteten Ringe von außen nach innen */
  rings: RingValue[];
  learn: number;
  move: number;
  habitsDone: number;
  habitsTotal: number;
  habitsShare: number;
  closed: boolean;
}

export interface RingSources {
  sessions: FocusSession[];
  workouts: Workout[];
  habits: Habit[];
  habitLogs: HabitLog[];
  tasks?: Task[];
}

const num = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
const minutesText = (value: number, goal: number) =>
  goal >= 60 ? `${num(Math.round((value / 60) * 10) / 10)}/${num(Math.round((goal / 60) * 10) / 10)} Std.` : `${value}/${goal} Min.`;

/** Stand der Ringe an einem Tag – die Quellen kommen aus Fokus-Timer, Training, Gewohnheiten und Aufgaben. */
export function ringDay(src: RingSources, goals: RingGoals, date: DateStr): RingDay {
  const focusOn = (learnOnly: boolean) =>
    src.sessions.filter((s) => s.date === date && (!learnOnly || !s.mode || s.mode === 'lernen')).reduce((sum, s) => sum + s.minutes, 0);
  const learn = focusOn(true);
  const move = src.workouts
    .filter((w) => w.done && w.date === date)
    .reduce((sum, w) => sum + (w.minutes && w.minutes > 0 ? w.minutes : DEFAULT_WORKOUT_MINUTES), 0);
  const habitsTotal = src.habits.length;
  const habitsDone = src.habits.filter((h) => isHabitDone(src.habitLogs, h, date)).length;
  const habitsShare = habitsTotal > 0 ? habitsDone / habitsTotal : 1;

  const minutes = (value: number, goal: number) => ({ value, goal, share: goal > 0 ? value / goal : 1, text: minutesText(value, goal) });
  const measure = (slot: RingSlot): Pick<RingValue, 'label' | 'value' | 'goal' | 'share' | 'text'> => {
    const s = slot.source;
    if (s === 'learn') return { label: SOURCE_LABELS.learn, ...minutes(learn, slot.goal) };
    if (s === 'focus') return { label: SOURCE_LABELS.focus, ...minutes(focusOn(false), slot.goal) };
    if (s === 'move') return { label: SOURCE_LABELS.move, ...minutes(move, slot.goal) };
    if (s === 'tasks') {
      const value = (src.tasks ?? []).filter((t) => t.status === 'erledigt' && t.completedAt === date).length;
      return { label: SOURCE_LABELS.tasks, value, goal: slot.goal, share: slot.goal > 0 ? value / slot.goal : 1, text: `${value}/${slot.goal}` };
    }
    if (s.startsWith('habit:')) {
      const habit = src.habits.find((h) => h.id === s.slice(6));
      if (!habit) return { label: 'Gewohnheit', value: 0, goal: 1, share: 0, text: 'gelöscht' };
      const done = isHabitDone(src.habitLogs, habit, date);
      if (habit.target) {
        const amount = habitAmount(src.habitLogs, habit.id, date);
        const value = done ? Math.max(amount, habit.target) : amount;
        return { label: habit.name, value, goal: habit.target, share: value / habit.target, text: `${num(value)}/${num(habit.target)} ${habit.unit ?? ''}`.trim() };
      }
      return { label: habit.name, value: done ? 1 : 0, goal: 1, share: done ? 1 : 0, text: done ? 'Erledigt' : 'Offen' };
    }
    return { label: SOURCE_LABELS.habits, value: habitsDone, goal: habitsTotal, share: habitsShare, text: `${habitsDone}/${habitsTotal}` };
  };

  const rings = ringSlots(goals)
    .map((slot, i) => ({ slot, i }))
    .filter(({ slot }) => slot.source !== 'off')
    .map(({ slot, i }): RingValue => ({ source: slot.source, slot: i, color: SLOT_COLORS[i], track: SLOT_TRACKS[i], ...measure(slot) }));

  return {
    date, rings, learn, move, habitsDone, habitsTotal, habitsShare,
    closed: rings.length > 0 && rings.every((r) => r.share >= 1),
  };
}

/** Montag bis Sonntag der Woche, in der `date` liegt. */
export function weekOf(date: DateStr): DateStr[] {
  const monday = addDays(date, -((parseDate(date).getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Welche Ringe am Abend noch offen sind – für die Erinnerung. */
export function openRings(day: RingDay): string[] {
  return day.rings.filter((r) => r.share < 1).map((r) => r.label);
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
  const learnedHours = src.sessions.filter((s) => !s.mode || s.mode === 'lernen').reduce((sum, s) => sum + s.minutes, 0) / 60;
  const workouts = src.workouts.filter((w) => w.done).length;
  const closedRun = longestClosedRun(src, goals, on);
  const closedToday = ringDay(src, goals, on).closed || closedRun > 0;
  const award = (id: string, icon: string, label: string, description: string, value: number, target: number): Award => ({
    id, icon, label, description, earned: value >= target, progress: Math.min(1, value / target),
  });
  return [
    award('ringe', '⭕', 'Alle Ringe', 'Alle Ringe an einem Tag geschlossen', closedToday ? 1 : 0, 1),
    award('serie7', '🔥', '7-Tage-Serie', 'Eine Gewohnheit 7 Tage am Stück', bestStreak, 7),
    award('serie30', '🏅', '30-Tage-Serie', 'Eine Gewohnheit 30 Tage am Stück', bestStreak, 30),
    award('woche', '🌟', 'Perfekte Woche', '7 Tage hintereinander alle Ringe geschlossen', closedRun, 7),
    award('lernen20', '📚', '20 Std. gelernt', 'Insgesamt 20 Stunden im Fokus-Timer', learnedHours, 20),
    award('lernen100', '🎓', '100 Std. gelernt', 'Insgesamt 100 Stunden im Fokus-Timer', learnedHours, 100),
    award('training10', '💪', '10 Trainings', '10 erledigte Trainings', workouts, 10),
  ];
}
