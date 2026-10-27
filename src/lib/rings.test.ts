import { describe, expect, it } from 'vitest';
import type { HabitLog } from '../types';
import { habitAmount, isHabitDone, streak } from './life';
import { awards, defaultRingGoals, longestClosedRun, openRings, ringDay, weekOf, type RingSources } from './rings';
import { addDays } from './dates';

const T = '2026-10-27';
const goals = { ...defaultRingGoals(), learnMinutes: 60, moveMinutes: 30 };
const water = { id: 'w', name: 'Wasser', icon: '💧', target: 2, unit: 'l', step: 0.25 };
const read = { id: 'r', name: 'Lesen', icon: '📖' };

const day = (d: string, learn: number, move: number | undefined, habits: boolean): RingSources => ({
  sessions: [{ id: `s${d}`, date: d, minutes: learn, courseId: null, distractions: 0 }],
  workouts: move === undefined ? [] : [{ id: `w${d}`, title: 'x', type: 'Laufen', date: d, done: true, notes: '', minutes: move || undefined }],
  habits: [read],
  habitLogs: habits ? [{ id: `l${d}`, habitId: 'r', date: d }] : [],
});
const merge = (...parts: RingSources[]): RingSources => ({
  sessions: parts.flatMap((p) => p.sessions),
  workouts: parts.flatMap((p) => p.workouts),
  habits: [read],
  habitLogs: parts.flatMap((p) => p.habitLogs),
});

describe('Mengen-Gewohnheiten', () => {
  const logs: HabitLog[] = [
    { id: '1', habitId: 'w', date: T, amount: 1.25 },
    { id: '2', habitId: 'w', date: addDays(T, -1), amount: 2 },
    { id: '3', habitId: 'w', date: addDays(T, -2) },
  ];
  it('sind erst mit erreichtem Ziel erledigt', () => {
    expect(habitAmount(logs, 'w', T)).toBe(1.25);
    expect(isHabitDone(logs, water, T)).toBe(false);
    expect(isHabitDone(logs, water, addDays(T, -1))).toBe(true);
    // alte Einträge ohne Menge zählen als erledigt
    expect(isHabitDone(logs, water, addDays(T, -2))).toBe(true);
    expect(streak(logs, water, T)).toBe(2);
    // ohne Ziel reicht ein Eintrag
    expect(isHabitDone(logs, 'w', T)).toBe(true);
  });
});

describe('Aktivitätsringe', () => {
  it('rechnet Lernen, Bewegung und Gewohnheiten', () => {
    const d = ringDay(day(T, 45, 0, true), goals, T);
    expect(d).toMatchObject({ learn: 45, move: 30, habitsDone: 1, habitsTotal: 1, learnShare: 0.75, moveShare: 1, closed: false });
    expect(openRings(d)).toEqual(['Lernen']);
    expect(ringDay(day(T, 60, 40, true), goals, T).closed).toBe(true);
    expect(ringDay(day(T, 60, 40, true), goals, addDays(T, 1)).learn).toBe(0);
  });

  it('zählt nur erledigte Trainings', () => {
    const src = day(T, 0, 50, false);
    src.workouts[0].done = false;
    expect(ringDay(src, goals, T).move).toBe(0);
  });

  it('liefert die Woche ab Montag', () => {
    expect(weekOf(T)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  });

  it('vergibt Auszeichnungen', () => {
    const perfect = merge(...Array.from({ length: 7 }, (_, i) => day(addDays(T, -i), 60, 30, true)));
    expect(longestClosedRun(perfect, goals, T)).toBe(7);
    const earned = awards(perfect, goals, T).filter((a) => a.earned).map((a) => a.id);
    expect(earned).toEqual(['ringe', 'serie7', 'woche']);
    const none = awards(day(T, 30, undefined, false), goals, T);
    expect(none.find((a) => a.id === 'lernen20')?.progress).toBeCloseTo(0.025);
    expect(none.some((a) => a.earned)).toBe(false);
  });
});
