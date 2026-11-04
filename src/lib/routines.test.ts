import { describe, expect, it } from 'vitest';
import type { Habit, Routine } from '../types';
import {
  extendStep, fromTemplate, habitCheck, isFinished, matchHabit, nextStep, pauseRun, resumeRun, ROUTINE_TEMPLATES, routineActivityState,
  routineMinutes, routineStreak, runSummary, startRun, stepLeft, stepShare, suggestedRoutine, syncRun, upcoming,
} from './routines';

const T0 = new Date(2026, 10, 9, 7, 0).getTime(); // Montag 07:00
const MIN = 60_000;
const routine: Routine = {
  id: 'r', name: 'Morgenroutine', icon: '🌅', color: '#FF9500', when: 'morgen',
  steps: [
    { id: 'a', title: 'Wasser', icon: '💧', minutes: 1 },
    { id: 'b', title: 'Dehnen', icon: '🧘', minutes: 5 },
    { id: 'c', title: 'Bett machen', icon: '🛏️', minutes: 0 },
    { id: 'd', title: 'Duschen', icon: '🚿', minutes: 10 },
  ],
};
const habits: Habit[] = [
  { id: 'h1', name: '2 Liter Wasser', icon: '💧', target: 2, unit: 'l', step: 0.25 },
  { id: 'h2', name: '10 Minuten meditieren', icon: '🧘' },
  { id: 'h3', name: '10 Seiten lesen', icon: '📖' },
];

describe('Routinen: Vorlagen und Gewohnheiten', () => {
  it('verknüpft passende Gewohnheiten über gemeinsame Wörter', () => {
    expect(matchHabit('Wasser trinken', habits)).toBe('h1');
    expect(matchHabit('Lesen', habits)).toBe('h3');
    expect(matchHabit('Meditieren', habits)).toBe('h2');
    expect(matchHabit('Dehnen', habits)).toBeNull();
    expect(matchHabit('Tee', habits)).toBeNull(); // zu kurz zum Vergleichen
  });

  it('baut aus einer Vorlage eine Routine', () => {
    let n = 0;
    const r = fromTemplate(ROUTINE_TEMPLATES[0], habits, () => `id${++n}`);
    expect(r.name).toBe('Morgenroutine');
    expect(r.steps.map((s) => s.minutes)).toEqual([1, 5, 10, 2]);
    expect(r.steps[0].habitId).toBe('h1');
    expect(routineMinutes(r)).toBe(18);
  });

  it('hakt Gewohnheiten ab – bei Mengen eine Portion', () => {
    expect(habitCheck(habits[1], [], '2026-11-09')).toEqual({ add: { habitId: 'h2', date: '2026-11-09' } });
    expect(habitCheck(habits[1], [{ id: 'l', habitId: 'h2', date: '2026-11-09' }], '2026-11-09')).toBeNull();
    expect(habitCheck(habits[0], [], '2026-11-09')).toEqual({ add: { habitId: 'h1', date: '2026-11-09', amount: 0.25 } });
    expect(habitCheck(habits[0], [{ id: 'l', habitId: 'h1', date: '2026-11-09', amount: 1 }], '2026-11-09')).toEqual({ update: { id: 'l', amount: 1.25 } });
    expect(habitCheck(habits[0], [{ id: 'l', habitId: 'h1', date: '2026-11-09', amount: 2 }], '2026-11-09')).toBeNull();
  });
});

describe('Routinen: Ablauf', () => {
  it('zählt den Schritt herunter und geht weiter', () => {
    let run = startRun(routine, T0);
    expect(stepLeft(run, routine, T0 + 20_000)).toBe(40_000);
    expect(stepShare(run, routine, T0 + 30_000)).toBeCloseTo(0.5);
    run = nextStep(run, routine, 'done', T0 + 50_000)!;
    expect(run.index).toBe(1);
    expect(run.done).toEqual(['a']);
    expect(stepLeft(run, routine, T0 + 50_000)).toBe(5 * MIN);
  });

  it('holt verpasste Zeit nach und wartet bei Schritten ohne Uhr', () => {
    const run = startRun(routine, T0);
    // gesperrt bis 07:10: Wasser (bis 07:01) und Dehnen (bis 07:06) sind vorbei, „Bett machen“ hat keine Uhr
    const { run: next, advanced } = syncRun(run, routine, T0 + 10 * MIN);
    expect(advanced.map((s) => s.id)).toEqual(['a', 'b']);
    expect(next.index).toBe(2);
    expect(next.stepStart).toBe(T0 + 6 * MIN);
    expect(syncRun(next, routine, T0 + 60 * MIN).advanced).toEqual([]);
    // abhaken, dann Duschen bis zum Ende: fertig
    const shower = nextStep(next, routine, 'done', T0 + 11 * MIN)!;
    const end = syncRun(shower, routine, T0 + 30 * MIN);
    expect(isFinished(end.run, routine)).toBe(true);
    expect(end.run.done).toEqual(['a', 'b', 'c', 'd']);
    expect(runSummary(end.run, T0 + 21 * MIN)).toEqual({ date: '2026-11-09', minutes: 21, done: 4, skipped: 0 });
  });

  it('pausiert, verlängert und überspringt', () => {
    let run = startRun(routine, T0);
    run = pauseRun(run, T0 + 20_000);
    expect(stepLeft(run, routine, T0 + 5 * MIN)).toBe(40_000);
    expect(syncRun(run, routine, T0 + 5 * MIN).advanced).toEqual([]);
    run = resumeRun(run, T0 + 5 * MIN);
    expect(stepLeft(run, routine, T0 + 5 * MIN)).toBe(40_000);
    run = extendStep(run, routine, 60, T0 + 5 * MIN);
    expect(stepLeft(run, routine, T0 + 5 * MIN)).toBe(100_000);
    run = nextStep(run, routine, 'skip', T0 + 6 * MIN)!;
    expect(run.skipped).toEqual(['a']);
    expect(run.done).toEqual([]);
  });

  it('kennt die Uhrzeiten der nächsten Schritte bis zum nächsten Schritt ohne Uhr', () => {
    const run = startRun(routine, T0);
    const list = upcoming(run, routine, T0);
    expect(list.map((x) => [new Date(x.at).getMinutes(), x.step?.id])).toEqual([[1, 'b'], [6, 'c']]);
  });

  it('zeigt die Routine als Live-Aktivität', () => {
    const s = routineActivityState(startRun(routine, T0), routine, T0)!;
    expect(s.phase).toBe('routine');
    expect(s.label).toBe('Morgenroutine');
    expect(s.goal).toBe('💧 Wasser');
    expect(s.endAt - s.startAt).toBe(MIN);
    expect(s.round).toBe(1);
    expect(s.rounds).toBe(4);
    expect(s.detail).toBe('07:01 🧘 Dehnen\n07:06 🛏️ Bett machen');
    const waiting = routineActivityState({ ...startRun(routine, T0), index: 2 }, routine, T0)!;
    expect(waiting.paused).toBe(true);
    expect(waiting.goal).toBe('🛏️ Bett machen – abhaken');
    expect(waiting.detail).toBe('Danach: 🚿 Duschen');
  });
});

describe('Routinen: Serie und Vorschlag', () => {
  it('zählt Tage in Folge', () => {
    const runs = ['2026-11-06', '2026-11-07', '2026-11-08'].map((date) => ({ date, minutes: 18, done: 4, skipped: 0 }));
    expect(routineStreak({ runs }, '2026-11-08')).toBe(3);
    expect(routineStreak({ runs }, '2026-11-09')).toBe(3); // heute noch offen
    expect(routineStreak({ runs }, '2026-11-10')).toBe(0);
  });

  it('bietet die passende Routine zur Tageszeit an, solange sie heute noch nicht lief', () => {
    expect(suggestedRoutine([routine], 'morgen', '2026-11-09')?.id).toBe('r');
    expect(suggestedRoutine([routine], 'abend', '2026-11-09')).toBeNull();
    expect(suggestedRoutine([{ ...routine, runs: [{ date: '2026-11-09', minutes: 1, done: 1, skipped: 0 }] }], 'morgen', '2026-11-09')).toBeNull();
  });
});
