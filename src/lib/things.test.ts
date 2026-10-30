import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { deadlineLabel, inSomeday, inToday, logbook, setWhen, whenOf } from './things';

const T = '2026-10-28';
const task = (p: Partial<Task>): Task => ({ id: Math.random().toString(), title: 'x', courseId: null, kind: 'Aufgabe', status: 'offen', priority: 'mittel', due: null, ...p });

describe('Things: Heute, Abends, Irgendwann', () => {
  it('zeigt das Richtige in „Heute“', () => {
    expect(inToday(task({ due: '2026-10-27' }), T)).toBe(true);
    expect(inToday(task({ plannedFor: '2026-10-26' }), T)).toBe(true);
    expect(inToday(task({ plannedFor: '2026-10-29' }), T)).toBe(false);
    expect(inToday(task({ due: T, someday: true }), T)).toBe(false);
    expect(inToday(task({ due: T, status: 'erledigt' }), T)).toBe(false);
    expect(inSomeday(task({ someday: true }))).toBe(true);
  });
  it('setzt und liest „Wann“', () => {
    expect(setWhen('abends', T)).toEqual({ plannedFor: T, evening: true, someday: false });
    expect(whenOf(task(setWhen('abends', T)), T)).toBe('abends');
    expect(whenOf(task(setWhen('irgendwann', T)), T)).toBe('irgendwann');
    expect(whenOf(task(setWhen('', T)), T)).toBe('');
    expect(whenOf(task(setWhen('morgen', T)), T)).toBe('morgen');
    expect(setWhen('datum', T, '2026-11-05').plannedFor).toBe('2026-11-05');
    expect(whenOf(task(setWhen('datum', T, '2026-11-05')), T)).toBe('datum');
  });
  it('führt ein Logbuch', () => {
    const log = logbook([
      task({ status: 'erledigt', completedAt: '2026-10-27' }),
      task({ status: 'erledigt', completedAt: T }),
      task({ status: 'erledigt' }),
      task({}),
    ], T);
    expect(log.map((g) => [g.label, g.tasks.length])).toEqual([['Heute', 1], ['Gestern', 1], ['Früher', 1]]);
  });
  it('zählt Tage bis zur Frist', () => {
    expect(deadlineLabel('2026-11-09', T)).toBe('noch 12 Tage');
    expect(deadlineLabel('2026-10-29', T)).toBe('morgen fällig');
    expect(deadlineLabel('2026-10-26', T)).toBe('2 Tage überfällig');
  });
});
