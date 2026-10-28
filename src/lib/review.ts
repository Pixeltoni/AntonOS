import type { Data, DateStr, MoodEntry } from '../types';
import { addDays } from './dates';
import { streak } from './life';
import { defaultRingGoals, ringDay, weekOf } from './rings';

export const MOODS = [
  { value: 1, emoji: '😖', label: 'Schlecht', color: '#FF453A' },
  { value: 2, emoji: '🙁', label: 'Nicht so gut', color: '#FF9F0A' },
  { value: 3, emoji: '😐', label: 'Okay', color: '#FFD60A' },
  { value: 4, emoji: '🙂', label: 'Gut', color: '#34C759' },
  { value: 5, emoji: '😄', label: 'Super', color: '#30B0C7' },
] as const;

export const moodOf = (value: number) => MOODS[Math.min(5, Math.max(1, Math.round(value))) - 1];

export interface WeekReview {
  days: DateStr[];
  learnMinutes: number;
  /** Lernminuten pro Kurs, absteigend */
  courses: { courseId: string | null; minutes: number }[];
  tasksDone: number;
  ringsClosed: number;
  habitChecks: number;
  bestStreak: { name: string; icon: string; days: number } | null;
  workouts: number;
  moveMinutes: number;
  spent: number;
  income: number;
  topCategory: { category: string; amount: number } | null;
  moodAvg: number | null;
  moodDays: number;
  bestDay: DateStr | null;
}

/** Zahlen einer Woche (Montag bis Sonntag, in der `day` liegt) – nur Tage bis `until`. */
export function weekReview(data: Data, day: DateStr, until: DateStr): WeekReview {
  const days = weekOf(day).filter((d) => d <= until);
  const inWeek = (d: string | undefined | null) => !!d && days.includes(d.slice(0, 10));
  const goals = data.settings.rings ?? defaultRingGoals();

  const sessions = data.sessions.filter((s) => inWeek(s.date));
  const byCourse = new Map<string | null, number>();
  for (const s of sessions) if (!s.mode || s.mode === 'lernen') byCourse.set(s.courseId, (byCourse.get(s.courseId) ?? 0) + s.minutes);
  const courses = [...byCourse].map(([courseId, minutes]) => ({ courseId, minutes })).sort((a, b) => b.minutes - a.minutes);

  const rings = days.map((d) => ringDay(data, goals, d));
  const workouts = data.workouts.filter((w) => w.done && inWeek(w.date));
  const txs = data.transactions.filter((t) => inWeek(t.date));
  const cats = new Map<string, number>();
  for (const t of txs) if (t.type === 'Ausgabe' && t.category !== 'Sparen') cats.set(t.category, (cats.get(t.category) ?? 0) + t.amount);
  const top = [...cats].sort((a, b) => b[1] - a[1])[0];
  const moods = data.moods.filter((m) => inWeek(m.date));
  const last = days[days.length - 1] ?? day;
  const streaks = data.habits.map((h) => ({ name: h.name, icon: h.icon, days: streak(data.habitLogs, h, last) })).sort((a, b) => b.days - a.days);
  const best = [...moods].sort((a, b) => b.mood - a.mood)[0];

  return {
    days,
    learnMinutes: courses.reduce((s, c) => s + c.minutes, 0),
    courses,
    // Ältere Aufgaben ohne Erledigt-Datum zählen am Fälligkeitstag
    tasksDone: data.tasks.filter((t) => t.status === 'erledigt' && inWeek(t.completedAt ?? t.due)).length,
    ringsClosed: rings.filter((r) => r.closed).length,
    habitChecks: rings.reduce((s, r) => s + r.habitsDone, 0),
    bestStreak: streaks[0] && streaks[0].days > 0 ? streaks[0] : null,
    workouts: workouts.length,
    moveMinutes: rings.reduce((s, r) => s + r.move, 0),
    spent: txs.filter((t) => t.type === 'Ausgabe').reduce((s, t) => s + t.amount, 0),
    income: txs.filter((t) => t.type === 'Einnahme').reduce((s, t) => s + t.amount, 0),
    topCategory: top ? { category: top[0], amount: top[1] } : null,
    moodAvg: moods.length ? moods.reduce((s, m) => s + m.mood, 0) / moods.length : null,
    moodDays: moods.length,
    bestDay: best && best.mood >= 4 ? best.date : null,
  };
}

/** Überschrift für die erste Karte – das Bemerkenswerteste der Woche */
export function headline(week: WeekReview, previous: WeekReview[]): string {
  const prevLearn = previous.map((w) => w.learnMinutes);
  if (week.learnMinutes >= 60 && prevLearn.length >= 2 && week.learnMinutes > Math.max(...prevLearn)) return `Stärkste Lernwoche seit ${prevLearn.length + 1} Wochen 🚀`;
  if (week.ringsClosed >= 5) return `${week.ringsClosed} Tage alle Ringe geschlossen ⭕`;
  if (week.tasksDone >= 10) return `${week.tasksDone} Aufgaben erledigt – starke Woche ✅`;
  if (week.bestStreak && week.bestStreak.days >= 7) return `${week.bestStreak.icon} ${week.bestStreak.days} Tage am Stück: ${week.bestStreak.name}`;
  if (week.workouts >= 3) return `${week.workouts} Trainings diese Woche 💪`;
  if (prevLearn.length && week.learnMinutes > prevLearn[0] && week.learnMinutes > 0) return 'Mehr gelernt als letzte Woche 📈';
  if (week.moodAvg !== null && week.moodAvg >= 4) return 'Eine richtig gute Woche 😄';
  return 'Deine Woche im Überblick';
}

/** Veränderung in Prozent gegenüber dem Vorwert (null, wenn es keinen gibt) */
export function change(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

export interface Insight {
  text: string;
  /** Wie stark der Unterschied ist (für die Reihenfolge) */
  strength: number;
}

/**
 * Zusammenhänge zwischen Stimmung und dem Tag: Training, Lernzeit, Schlaf.
 * Erst ab je 3 Tagen mit und ohne – sonst ist es Zufall.
 */
export function moodInsights(data: Data, moods: MoodEntry[]): Insight[] {
  const goals = data.settings.rings ?? defaultRingGoals();
  const compare = (label: string, test: (m: MoodEntry) => boolean): Insight | null => {
    const yes = moods.filter(test);
    const no = moods.filter((m) => !test(m));
    if (yes.length < 3 || no.length < 3) return null;
    const avg = (l: MoodEntry[]) => l.reduce((s, m) => s + m.mood, 0) / l.length;
    const diff = avg(yes) - avg(no);
    if (Math.abs(diff) < 0.3) return null;
    return { text: `${label} ist deine Stimmung im Schnitt ${diff > 0 ? 'besser' : 'schlechter'} (${diff > 0 ? '+' : ''}${diff.toFixed(1).replace('.', ',')}).`, strength: Math.abs(diff) };
  };
  return [
    compare('An Tagen mit Training', (m) => data.workouts.some((w) => w.done && w.date === m.date)),
    compare('An Tagen mit mindestens einer Stunde Lernen', (m) => ringDay(data, goals, m.date).learn >= 60),
    compare('Nach mindestens 7 Stunden Schlaf', (m) => (m.sleep ?? 0) >= 7),
    compare('An Tagen mit allen Gewohnheiten', (m) => ringDay(data, goals, m.date).habitsShare >= 1),
  ].filter((x): x is Insight => x !== null).sort((a, b) => b.strength - a.strength);
}

/** Letzte `n` Tage bis `until` (älteste zuerst) */
export const lastDays = (until: DateStr, n: number): DateStr[] => Array.from({ length: n }, (_, i) => addDays(until, i - n + 1));
