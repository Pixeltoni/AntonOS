import { describe, expect, it } from 'vitest';
import type { HabitLog } from '../types';
import { formatAmounts, habitAmount, habitSteps, isHabitDone, parseAmounts, streak } from './life';
import { awards, defaultRingGoals, longestClosedRun, openRings, ringDay, ringSlots, weekOf, type RingSources } from './rings';
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
    expect(d).toMatchObject({ learn: 45, move: 30, habitsDone: 1, habitsTotal: 1, closed: false });
    expect(d.rings.map((r) => r.share)).toEqual([0.75, 1, 1]);
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

describe('Einstellbare Ringe', () => {
  const src: RingSources = {
    sessions: [
      { id: 'a', date: T, minutes: 30, courseId: null, distractions: 0, mode: 'lernen' },
      { id: 'b', date: T, minutes: 45, courseId: null, distractions: 0, mode: 'arbeiten' },
    ],
    workouts: [],
    habits: [water, read],
    habitLogs: [{ id: 'l', habitId: 'w', date: T, amount: 0.7 }],
    tasks: [
      { id: 't1', title: 'A', courseId: null, kind: 'Aufgabe', status: 'erledigt', priority: 'mittel', due: null, completedAt: T },
      { id: 't2', title: 'B', courseId: null, kind: 'Aufgabe', status: 'offen', priority: 'mittel', due: null },
    ],
  };

  it('nutzt ohne Auswahl Lernen, Bewegung und Gewohnheiten', () => {
    expect(ringSlots(goals).map((s) => s.source)).toEqual(['learn', 'move', 'habits']);
    expect(ringDay(src, goals, T).rings.map((r) => r.label)).toEqual(['Lernen', 'Bewegung', 'Gewohnheiten']);
  });

  it('zeigt Fokuszeit, Aufgaben und eine einzelne Gewohnheit', () => {
    const custom = { ...goals, slots: [{ source: 'focus' as const, goal: 60 }, { source: 'tasks' as const, goal: 2 }, { source: 'habit:w' as const, goal: 0 }] };
    const d = ringDay(src, custom, T);
    expect(d.rings.map((r) => [r.label, r.value, r.goal, r.text])).toEqual([
      ['Fokuszeit', 75, 60, '1,3/1 Std.'],
      ['Aufgaben', 1, 2, '1/2'],
      ['Wasser', 0.7, 2, '0,7/2 l'],
    ]);
    expect(d.rings[2].share).toBeCloseTo(0.35);
    expect(openRings(d)).toEqual(['Aufgaben', 'Wasser']);
  });

  it('lässt ausgeschaltete Ringe weg', () => {
    const custom = { ...goals, slots: [{ source: 'learn' as const, goal: 30 }, { source: 'off' as const, goal: 0 }, { source: 'off' as const, goal: 0 }] };
    const d = ringDay(src, custom, T);
    expect(d.rings).toHaveLength(1);
    expect(d.rings[0].text).toBe('30/30 Min.');
    expect(d.closed).toBe(true);
  });
});

describe('Mengen zum Hinzufügen', () => {
  it('liest mehrere Mengen', () => {
    expect(parseAmounts('0,5; 0,2')).toEqual([0.2, 0.5]);
    expect(parseAmounts('0,2 0,5 0,2')).toEqual([0.2, 0.5]);
    expect(parseAmounts('0,2, 0,5')).toEqual([0.2, 0.5]);
    expect(parseAmounts('abc; -1')).toEqual([]);
    expect(formatAmounts([0.2, 0.5])).toBe('0,2; 0,5');
  });

  it('fällt auf die alte Schrittweite zurück', () => {
    expect(habitSteps({ step: 0.25 })).toEqual([0.25]);
    expect(habitSteps({ step: 0.25, steps: [0.2, 0.5] })).toEqual([0.2, 0.5]);
    expect(habitSteps({})).toEqual([1]);
  });
});
