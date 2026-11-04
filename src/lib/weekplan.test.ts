import { describe, expect, it } from 'vitest';
import { emptyData } from '../store';
import type { CalendarEntry } from './calendar';
import type { Task, Transaction } from '../types';
import {
  autoPlan, budgetPlan, byUrgency, clashes, daysOf, distribute, focusState, focusSuggestions, isPressing, loadLevel, mondayOf, planningWeek,
  rotationFor, spentBetween, taskDay, trainingTarget, unplannedTasks, weekLoads, weekPrompt, weekRange, weeklyStudyMinutes,
} from './weekplan';

const MON = '2026-11-09';
const DAYS = daysOf(MON);
const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, courseId: null, kind: 'Aufgabe', status: 'offen', priority: 'mittel', due: null, ...extra });
const tx = (id: string, amount: number, date: string, extra: Partial<Transaction> = {}): Transaction => ({ id, type: 'Ausgabe', description: id, amount, category: 'Lebensmittel', account: 'Giro', date, ...extra });

describe('Woche planen: welche Woche', () => {
  it('plant samstags und sonntags die nächste Woche, sonst die laufende', () => {
    expect(mondayOf('2026-11-12')).toBe(MON);
    expect(mondayOf(MON)).toBe(MON);
    expect(mondayOf('2026-11-15')).toBe(MON); // Sonntag gehört noch zur Woche
    expect(planningWeek('2026-11-11')).toBe(MON);
    expect(planningWeek('2026-11-14')).toBe('2026-11-16');
    expect(planningWeek('2026-11-15')).toBe('2026-11-16');
    expect(DAYS).toHaveLength(7);
    expect(DAYS[6]).toBe('2026-11-15');
  });

  it('erinnert am Wochenende an die nächste Woche und montags an die laufende', () => {
    expect(weekPrompt([], '2026-11-15').plan).toBe('2026-11-16');
    expect(weekPrompt([{ id: 'p', week: '2026-11-16', focus: [], doneAt: '2026-11-15' }], '2026-11-15').plan).toBeNull();
    expect(weekPrompt([], MON).plan).toBe(MON);
    expect(weekPrompt([], '2026-11-11').plan).toBeNull(); // Mittwoch: nicht mehr drängeln
    const p = { id: 'q', week: MON, focus: [], doneAt: '2026-11-08' };
    expect(weekPrompt([p], '2026-11-10')).toEqual({ current: p, plan: null });
  });

  it('beschreibt die Woche kurz', () => {
    expect(weekRange(MON)).toBe('9.–15. Nov.');
    expect(weekRange('2026-11-30')).toBe('30. Nov. – 6. Dez.');
  });
});

describe('Woche planen: Aufgaben', () => {
  it('findet den Tag einer Aufgabe in der Woche', () => {
    expect(taskDay(task('a', { plannedFor: '2026-11-11' }), DAYS)).toBe('2026-11-11');
    expect(taskDay(task('b', { due: '2026-11-13' }), DAYS)).toBe('2026-11-13');
    // eingeplant vor der Woche, Frist in der Woche: liegen geblieben, also noch ohne Tag
    expect(taskDay(task('c', { plannedFor: '2026-11-02', due: '2026-11-13' }), DAYS)).toBeNull();
    expect(taskDay(task('d', { plannedFor: '2026-11-11', status: 'erledigt' }), DAYS)).toBeNull();
  });

  it('listet, was noch keinen Tag hat – Dringendes zuerst', () => {
    const list = unplannedTasks([
      task('irgendwann', { someday: true }),
      task('später', { plannedFor: '2026-11-20' }),
      task('projekt', { projectId: 'p' }),
      task('fertig', { status: 'erledigt' }),
      task('mittwoch', { plannedFor: '2026-11-11' }),
      task('ohne'),
      task('markiert', { flagged: true }),
      task('frist', { due: '2026-11-25' }),
      task('überfällig', { due: '2026-11-02' }),
    ], DAYS);
    expect(list.map((t) => t.id)).toEqual(['überfällig', 'frist', 'markiert', 'ohne']);
    expect(isPressing(task('x', { due: '2026-11-02' }), DAYS)).toBe(true);
    expect(isPressing(task('x', { due: '2026-11-25' }), DAYS)).toBe(false);
    expect(isPressing(task('x', { priority: 'hoch' }), DAYS)).toBe(true);
    expect(isPressing(task('x', { plannedFor: '2026-11-03' }), DAYS)).toBe(true);
    expect([task('b', { priority: 'hoch' }), task('a')].sort(byUrgency).map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('misst die Auslastung je Tag', () => {
    const d = emptyData();
    const lecture: CalendarEntry = { key: 'v', start: '2026-11-10', end: '2026-11-10', time: '09:00', endTime: '15:00', label: 'Vorlesung', kind: 'lecture' };
    d.tasks = [task('a', { plannedFor: '2026-11-10', estimate: 60 }), task('b', { due: '2026-11-10' }), task('c', { plannedFor: '2026-11-10', plannedTime: '16:00', estimate: 30 })];
    d.workouts = [{ id: 'w', title: 'Push', type: 'Krafttraining', date: '2026-11-10', done: false, notes: '', minutes: 60 }];
    const loads = weekLoads(d, [lecture], DAYS);
    const tue = loads[1];
    expect(tue.fixed).toBe(360 + 30); // Vorlesung + Aufgabe mit Uhrzeit
    expect(tue.planned).toBe(60 + 30 + 60); // Aufgaben ohne Uhrzeit + Training ohne Uhrzeit
    expect(tue.tasks).toBe(3);
    expect(tue.level).toBe(loadLevel(tue.share));
    expect(loads[0].fixed).toBe(0);
    expect(loads[0].level).toBe('frei');
    expect(loads[0].room).toBeGreaterThan(tue.room);
    expect(loadLevel(0.9)).toBe('zuviel');
  });

  it('verteilt Dringendes auf Tage mit Platz bis zur Frist', () => {
    const loads = DAYS.map((day, i) => ({ day, room: [60, 200, 120, 30, 100, 300, 300][i] }));
    const { placed, left } = distribute([
      task('frist-mi', { due: '2026-11-11', estimate: 90 }),
      task('überfällig', { due: '2026-11-01', estimate: 45 }),
      task('ohne-frist', { flagged: true, estimate: 240 }),
      task('zu-groß', { flagged: true, estimate: 600 }),
      task('frist-do-voll', { due: '2026-11-12', estimate: 400 }),
    ], loads, { from: MON, keepWeekend: true });
    const at = Object.fromEntries(placed.map((p) => [p.taskId, p.day]));
    expect(at['überfällig']).toBe(MON); // so früh wie möglich
    expect(at['frist-mi']).toBe('2026-11-10'); // Dienstag hat bis Mittwoch am meisten Platz
    expect(at['frist-do-voll']).toBeDefined(); // Frist: kommt trotzdem unter
    expect(left).toContain('zu-groß');
    expect(Object.values(at).some((d) => d >= '2026-11-14')).toBe(false); // Wochenende bleibt frei
  });

  it('nimmt das Wochenende, wenn die Frist keine andere Wahl lässt, und nichts vor heute', () => {
    const loads = DAYS.map((day) => ({ day, room: 120 }));
    const { placed } = distribute([task('so', { due: '2026-11-15', estimate: 30 })], loads, { from: '2026-11-14', keepWeekend: true });
    expect(placed).toEqual([{ taskId: 'so', day: '2026-11-14' }]);
    const free = distribute([task('frei', { flagged: true })], loads, { from: '2026-11-12', keepWeekend: false });
    expect(free.placed[0].day >= '2026-11-12').toBe(true);
  });
});

describe('Woche planen: Puffer vor Fristen', () => {
  it('plant mit einem Tag Puffer vor der Frist', () => {
    const loads = DAYS.map((day, i) => ({ day, room: [100, 100, 300, 100, 100, 0, 0][i] }));
    // Frist Mittwoch: Mittwoch hätte am meisten Platz, aber Montag und Dienstag gehen vor
    expect(distribute([task('a', { due: '2026-11-11', estimate: 60 })], loads, { from: MON }).placed[0].day).toBe(MON);
    // passt vorher nicht: dann eben am Abgabetag
    expect(distribute([task('b', { due: '2026-11-11', estimate: 200 })], loads, { from: MON }).placed[0].day).toBe('2026-11-11');
    // nur vorab erlaubt: sonst gar nicht
    expect(distribute([task('c', { due: '2026-11-11', estimate: 200 })], loads, { from: MON, onlyEarly: ['c'] })).toEqual({ placed: [], left: ['c'] });
  });

  it('verteilt Dringendes und große Aufgaben, die sonst erst am Abgabetag dastünden', () => {
    const tasks = [
      task('gross', { due: '2026-11-12', estimate: 120 }),
      task('klein', { due: '2026-11-12', estimate: 20 }),
      task('markiert', { flagged: true, estimate: 30 }),
      task('egal'),
    ];
    const loads = DAYS.map((day) => ({ day, room: 150 }));
    const { placed, left } = autoPlan(tasks, loads, DAYS, { from: MON, keepWeekend: true });
    const at = Object.fromEntries(placed.map((p) => [p.taskId, p.day]));
    expect(Object.keys(at).sort()).toEqual(['gross', 'markiert']);
    expect(at.gross < '2026-11-12').toBe(true);
    expect(left).toEqual([]);
    // passt die große nirgends vorher hin, bleibt sie still am Abgabetag
    const full = DAYS.map((day) => ({ day, room: day === '2026-11-12' ? 0 : 30 }));
    expect(autoPlan([tasks[0]], full, DAYS, { from: MON })).toEqual({ placed: [], left: [] });
  });
});

describe('Woche planen: Termine', () => {
  it('findet Überschneidungen', () => {
    const e = (key: string, time: string, endTime: string, start = '2026-11-11'): CalendarEntry => ({ key, start, end: start, time, endTime, label: key, kind: 'event' });
    const list = clashes([e('Zahnarzt', '10:00', '11:00'), e('Vorlesung', '10:30', '12:00'), e('Kaffee', '12:00', '12:30'), e('Sport', '18:00', '', '2026-11-12')], DAYS);
    expect(list).toEqual([{ day: '2026-11-11', a: 'Zahnarzt', b: 'Vorlesung', time: '10:30' }]);
  });
});

describe('Woche planen: Wochenziele', () => {
  it('misst Wochenziele selbst', () => {
    const d = emptyData();
    d.workouts = [
      { id: 'a', title: 'A', type: 'Laufen', date: '2026-11-10', done: true, notes: '' },
      { id: 'b', title: 'B', type: 'Laufen', date: '2026-11-12', done: true, notes: '' },
      { id: 'c', title: 'C', type: 'Laufen', date: '2026-11-13', done: false, notes: '' },
      { id: 'd', title: 'D', type: 'Laufen', date: '2026-11-08', done: true, notes: '' },
    ];
    expect(focusState({ done: false, measure: { kind: 'training', target: 3 } }, d, MON)).toEqual({ done: false, share: 2 / 3, text: '2 / 3' });
    expect(focusState({ done: true }, d, MON).done).toBe(true);
    d.sessions = [
      { id: 's1', date: '2026-11-10', minutes: 50, courseId: 'ana', distractions: 0 },
      { id: 's2', date: '2026-11-11', minutes: 40, courseId: 'ana', distractions: 0, mode: 'lernen' },
      { id: 's3', date: '2026-11-11', minutes: 30, courseId: 'lin', distractions: 0 },
    ];
    expect(focusState({ done: false, measure: { kind: 'lernen', refId: 'ana', target: 90 } }, d, MON)).toEqual({ done: true, share: 1, text: '1:30 / 1:30 Std.' });
    d.habits = [{ id: 'h', name: 'Wasser', icon: '💧', color: '#00f', frequency: 'täglich', created: '2026-01-01' } as never];
    d.habitLogs = [{ id: 'l1', habitId: 'h', date: '2026-11-09' }, { id: 'l2', habitId: 'h', date: '2026-11-10' }] as never;
    expect(focusState({ done: false, measure: { kind: 'gewohnheit', refId: 'h', target: 5 } }, d, MON).text).toBe('2 / 5');
  });

  it('schlägt Lernzeit, Ziele, wichtige Aufgaben und Offenes von letzter Woche vor', () => {
    const d = emptyData();
    d.courses = [{ id: 'ana', name: 'Analysis I' } as never];
    d.exams = [{ id: 'e', title: 'Analysis-Klausur', courseId: 'ana', date: '2026-11-19', time: '10:00', location: '' }];
    d.goals = [
      { id: 'g', title: 'Fit', area: 'Gesundheit', why: '', deadline: null, progress: 0, results: [{ id: 'r', kind: 'training', target: 3 }] },
      { id: 'g2', title: 'Note', area: 'Studium', why: '', deadline: null, progress: 0, results: [{ id: 'r2', kind: 'note', refId: 'ana', target: 2 }] },
    ];
    d.tasks = [task('Blatt 4 abgeben', { due: '2026-11-12', priority: 'hoch' }), task('Unwichtig', { due: '2026-11-12' })];
    d.weekPlans = [{ id: 'p', week: '2026-11-02', focus: [{ id: 'f1', text: 'Bewerbung schreiben', done: false }, { id: 'f2', text: 'Erledigt', done: true }] }];
    const list = focusSuggestions(d, MON);
    expect(list.map((s) => s.text)).toEqual(['Bewerbung schreiben', '4 Std. für Analysis I lernen', '3× trainieren', 'Blatt 4 abgeben']);
    expect(list[1].measure).toEqual({ kind: 'lernen', refId: 'ana', target: 240 });
    expect(list[0].hint).toBe('Von letzter Woche');
    expect(trainingTarget(d.goals)).toBe(3);
    expect(trainingTarget([])).toBe(3);
  });

  it('verteilt den Rest eines Lernplans auf die Wochen bis zur Prüfung', () => {
    const exam = { id: 'e', title: 'K', courseId: 'ana', date: '2026-11-26', time: '', location: '', studyHours: 12, planFrom: '2026-11-01' };
    const sessions = [{ id: 's', date: '2026-11-05', minutes: 120, courseId: 'ana', distractions: 0 }];
    // 10 Std. Rest auf 3 Wochen → 200 Min. → auf 30 Min. gerundet 210
    expect(weeklyStudyMinutes(exam, sessions, MON)).toBe(210);
    expect(weeklyStudyMinutes({ ...exam, studyHours: null }, sessions, MON)).toBe(120);
  });
});

describe('Woche planen: Training', () => {
  it('führt die Reihenfolge des Trainingsplans weiter', () => {
    const plan = [{ id: 'push', name: 'Push', exercises: [] }, { id: 'pull', name: 'Pull', exercises: [] }, { id: 'beine', name: 'Beine', exercises: [] }];
    const done = [{ done: true, planDayId: 'push', date: '2026-11-06' }, { done: true, planDayId: 'pull', date: '2026-11-07' }];
    expect(rotationFor(plan, done, ['2026-11-13', '2026-11-09', '2026-11-11']).map((d) => d?.name)).toEqual(['Beine', 'Push', 'Pull']);
    expect(rotationFor([], done, ['2026-11-09'])).toEqual([null]);
  });
});

describe('Woche planen: Budget', () => {
  it('rechnet das Wochenbudget aus dem Monatsbudget', () => {
    const d = emptyData();
    d.settings.finance = { ...d.settings.finance, budget: 900 };
    d.transactions = [tx('a', 300, '2026-11-03'), tx('rec-miete-2026-11', 400, '2026-11-01', { category: 'Miete' })];
    d.recurring = [
      { id: 'abo', type: 'Ausgabe', description: 'Spotify', amount: 10, category: 'Abos', account: 'Giro', day: 20, start: '2026-01', lastBooked: '2026-10' },
      { id: 'miete', type: 'Ausgabe', description: 'Miete', amount: 400, category: 'Miete', account: 'Giro', day: 1, start: '2026-01', lastBooked: '2026-11' },
      { id: 'handy', type: 'Ausgabe', description: 'Handy', amount: 20, category: 'Abos', account: 'Giro', day: 12, start: '2026-01', lastBooked: '2026-10' },
    ];
    const b = budgetPlan(d, MON, '2026-11-08');
    expect(b.basis).toBe('monat');
    expect(b.monthSpent).toBe(700);
    expect(b.fixedLeft).toBe(30); // Spotify am 20., Handy am 12.
    expect(b.daysLeft).toBe(22); // 9.–30. November
    // (900 − 700 − 30) / 22 × 7 ≈ 54 → 55
    expect(b.suggestion).toBe(55);
    expect(b.fixedWeek).toEqual([{ id: 'handy', description: 'Handy', amount: 20, date: '2026-11-12' }]);
  });

  it('nimmt ohne Monatsbudget den Schnitt der letzten Wochen – ohne feste Zahlungen und Sparen', () => {
    const d = emptyData();
    d.settings.finance = { ...d.settings.finance, budget: 0 };
    d.transactions = [
      tx('a', 100, '2026-10-20'), tx('b', 80, '2026-11-02'), tx('rec-x-2026-11', 500, '2026-11-01'),
      tx('s', 50, '2026-11-03', { category: 'Sparen', potId: 'p' }), tx('alt', 999, '2026-09-01'), tx('ein', 1000, '2026-11-01', { type: 'Einnahme' }),
    ];
    expect(spentBetween(d.transactions, '2026-10-01', '2026-11-30')).toBe(180);
    const b = budgetPlan(d, MON, '2026-11-08');
    expect(b.basis).toBe('schnitt');
    expect(b.average).toBe(45);
    expect(b.suggestion).toBe(45);
    expect(budgetPlan(emptyData(), MON, '2026-11-08').basis).toBe('keins');
  });
});
