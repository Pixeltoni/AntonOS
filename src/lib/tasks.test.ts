import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { collectTags, describeTaskRepeat, doneToday, dropPatch, firstRepeatDate, formatMinutes, freeMinutes, groupUpcoming, matchesQuery, moveId, nextRepeatDate, parseTags, repeatTasks, sortTasks, spawnRepeat, upcomingDate } from './tasks';

// 2026-10-28 ist ein Mittwoch
const T = '2026-10-28';
const task = (p: Partial<Task>): Task => ({ id: Math.random().toString(), title: 'x', courseId: null, kind: 'Aufgabe', status: 'offen', priority: 'mittel', due: null, ...p });

describe('Wiederkehrende Aufgaben', () => {
  it('findet den nächsten Termin', () => {
    expect(nextRepeatDate({ freq: 'taeglich' }, T)).toBe('2026-10-29');
    expect(nextRepeatDate({ freq: 'taeglich', interval: 5 }, T)).toBe('2026-11-02');
    expect(nextRepeatDate({ freq: 'werktags' }, '2026-10-30')).toBe('2026-11-02');
    expect(nextRepeatDate({ freq: 'woechentlich' }, T)).toBe('2026-11-04');
    expect(nextRepeatDate({ freq: 'woechentlich', days: [1, 4] }, T)).toBe('2026-10-29');
    expect(nextRepeatDate({ freq: 'woechentlich', days: [1, 4] }, '2026-10-29')).toBe('2026-11-02');
    expect(nextRepeatDate({ freq: 'zweiwoechentlich' }, T)).toBe('2026-11-11');
    expect(nextRepeatDate({ freq: 'monatlich' }, '2026-01-31')).toBe('2026-02-28');
    expect(nextRepeatDate({ freq: 'jaehrlich' }, T)).toBe('2027-10-28');
    expect(firstRepeatDate({ freq: 'woechentlich', days: [7] }, T)).toBe('2026-11-01');
    expect(firstRepeatDate({ freq: 'taeglich' }, T)).toBe(T);
  });
  it('beschreibt die Wiederholung', () => {
    expect(describeTaskRepeat({ freq: 'woechentlich', days: [4, 1] }, T)).toBe('Jeden Mo, Do');
    expect(describeTaskRepeat({ freq: 'woechentlich' }, T)).toBe('Jeden Mittwoch');
    expect(describeTaskRepeat({ freq: 'taeglich', interval: 5, afterDone: true }, null)).toBe('Alle 5 Tage nach Erledigung');
  });
  it('legt die nächste Aufgabe an', () => {
    const t = task({ id: 'a', due: '2026-10-26', repeat: { freq: 'woechentlich' }, subtasks: [{ id: 's', title: 'y', done: true }], spent: 30 });
    const next = spawnRepeat(t, T)!;
    expect(next.due).toBe('2026-11-02');
    expect(next.repeatOf).toBe('a');
    expect(next.subtasks?.[0].done).toBe(false);
    expect(next.spent).toBe(0);
    // ab Erledigung und ohne Frist: eingeplant statt fällig
    const after = spawnRepeat(task({ plannedFor: '2026-10-20', repeat: { freq: 'taeglich', interval: 5, afterDone: true } }), T)!;
    expect(after.plannedFor).toBe('2026-11-02');
    expect(after.due).toBeNull();
    // lange überfällig: springt auf den nächsten Termin ab heute
    expect(spawnRepeat(task({ due: '2026-09-01', repeat: { freq: 'taeglich' } }), T)!.due).toBe(T);
  });
  it('fügt beim Abhaken hinzu und nimmt beim Widerrufen zurück', () => {
    const t = task({ id: 'a', due: T, repeat: { freq: 'taeglich' } });
    const done = repeatTasks([t], [{ ...t, status: 'erledigt' }], 'a', T, () => 'b');
    expect(done.map((x) => [x.id, x.due])).toEqual([['a', T], ['b', '2026-10-29']]);
    const undone = repeatTasks(done, done.map((x) => (x.id === 'a' ? { ...x, status: 'offen' as const } : x)), 'a', T, () => 'c');
    expect(undone.map((x) => x.id)).toEqual(['a']);
    // ohne Wiederholung passiert nichts
    const plain = task({ id: 'p' });
    expect(repeatTasks([plain], [{ ...plain, status: 'erledigt' }], 'p', T, () => 'z')).toHaveLength(1);
  });
});

describe('Sortieren und Ziehen', () => {
  it('sortiert nach eigener Reihenfolge vor der Frist', () => {
    const a = task({ id: 'a', due: '2026-10-29' });
    const b = task({ id: 'b', due: '2026-10-30', order: 0 });
    const c = task({ id: 'c', due: '2026-10-27' });
    const d = task({ id: 'd', status: 'erledigt', order: -1 });
    expect(sortTasks([a, b, c, d]).map((x) => x.id)).toEqual(['b', 'c', 'a', 'd']);
  });
  it('verschiebt in der Liste', () => {
    expect(moveId(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(moveId(['a', 'b', 'c'], 'a', 9)).toEqual(['b', 'c', 'a']);
  });
  it('legt auf Listen und Tagen ab', () => {
    expect(dropPatch('smart:heute', T)).toEqual({ plannedFor: T, evening: false, someday: false });
    expect(dropPatch('list:h', T)).toEqual({ listId: 'h', courseId: null });
    expect(dropPatch('course:', T)).toEqual({ courseId: null, listId: null });
    expect(dropPatch('day:2026-11-02', T)).toEqual({ plannedFor: '2026-11-02', someday: false, evening: false });
    expect(dropPatch('smart:alle', T)).toBeNull();
  });
});

describe('Heute und Anstehend', () => {
  it('zählt heute Erledigtes', () => {
    expect(doneToday([task({ status: 'erledigt', completedAt: T, due: T }), task({ status: 'erledigt', completedAt: '2026-10-27', due: T }), task({ status: 'erledigt', completedAt: T })], T)).toHaveLength(1);
  });
  it('gruppiert Anstehendes', () => {
    const planned = task({ plannedFor: '2026-11-02', due: '2026-11-09' });
    expect(upcomingDate(planned, T)).toBe('2026-11-02');
    expect(upcomingDate(task({ plannedFor: T, due: '2026-11-09' }), T)).toBe('2026-11-09');
    expect(upcomingDate(task({ someday: true, due: T }), T)).toBeNull();
    const groups = groupUpcoming([planned, task({ due: '2026-10-20' }), task({ due: T })], T, ['2026-10-30']);
    expect(groups.map((g) => [g.key, g.tasks.length])).toEqual([['ueberfaellig', 1], [T, 1], ['2026-10-30', 0], ['2026-11-02', 1]]);
  });
});

describe('Suche, Tags, Aufwand', () => {
  it('sucht in Titel, Notiz und Tags', () => {
    const t = task({ title: 'Wäsche waschen', note: 'Buntes', tags: ['zuhause'] });
    expect(matchesQuery(t, 'wäsche bunt')).toBe(true);
    expect(matchesQuery(t, '@zuhause')).toBe(true);
    expect(matchesQuery(t, 'pc')).toBe(false);
    expect(collectTags([t, task({ tags: ['pc', 'zuhause'] })])).toEqual(['zuhause', 'pc']);
    expect(parseTags('@Zuhause, pc  pc')).toEqual(['zuhause', 'pc']);
  });
  it('formatiert Minuten und rechnet freie Zeit', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(90)).toBe('1 h 30 min');
    expect(formatMinutes(120)).toBe('2 h');
    // 8–12 Uhr, Termine 9–10 und 9:30–11 → 2 h frei
    expect(freeMinutes([[540, 600], [570, 660]], 480, 720)).toBe(120);
    expect(freeMinutes([], 600, 500)).toBe(0);
  });
});
