import { describe, expect, it } from 'vitest';
import { emptyData } from '../store';
import type { Card, Goal, KeyResult } from '../types';
import { goalProgress, measureResult, weekContributions } from './goals';

const DAY = '2026-11-04'; // Mittwoch, Woche 2.–8. November

function sources() {
  const d = emptyData();
  d.pots = [{ id: 'pot', name: 'Auslandssemester', icon: '✈️', target: 3000, saved: 1200, color: '#007AFF' }];
  d.transactions = [
    { id: 't1', type: 'Ausgabe', description: 'Spartopf: Auslandssemester', amount: 100, category: 'Sparen', account: 'Sparkonto', date: '2026-11-03', potId: 'pot' },
    { id: 't2', type: 'Einnahme', description: 'Oma → Spartopf Auslandssemester', amount: 50, category: 'Sparen', account: 'Sparkonto', date: '2026-11-02' },
    { id: 't3', type: 'Einnahme', description: 'Aus Spartopf: Auslandssemester', amount: 30, category: 'Sparen', account: 'Sparkonto', date: '2026-11-04', potId: 'pot' },
    { id: 't4', type: 'Ausgabe', description: 'Spartopf: Auslandssemester', amount: 500, category: 'Sparen', account: 'Sparkonto', date: '2026-10-20', potId: 'pot' },
  ];
  d.courses = [{ id: 'ana', name: 'Analysis I', code: 'MA-101', semester: '', lecturer: '', room: '', ects: 9, color: '#6366f1', slots: [] }];
  const card = (id: string, interval: number, reviewed?: string): Card => ({ id, courseId: 'ana', front: id, back: id, interval, ease: 2.5, reps: 1, lapses: 0, due: DAY, reviewed });
  d.cards = [card('a', 21, '2026-11-03'), card('b', 0), card('c', 7, '2026-10-30'), card('d', 42, '2026-11-02')];
  d.grades = [{ id: 'g1', courseId: 'ana', title: 'Zwischentest', value: 1.7, weight: 40 }];
  d.workouts = ['2026-10-12', '2026-10-14', '2026-10-20', '2026-10-27', '2026-11-02', '2026-11-03'].map((date, i) => ({ id: `w${i}`, title: 'Push', type: 'Krafttraining', date, done: true, notes: '' }));
  d.workouts.push({ id: 'plan', title: 'Pull', type: 'Krafttraining', date: '2026-11-05', done: false, notes: '' });
  d.projects = [{ id: 'p', title: 'Auslandssemester planen', area: 'Studium', status: 'aktiv', due: null, cover: '', description: '' }];
  const task = (id: string, done: boolean, completedAt?: string) => ({ id, title: id, courseId: null, kind: 'Aufgabe' as const, status: done ? ('erledigt' as const) : ('offen' as const), priority: 'mittel' as const, due: null, projectId: 'p', completedAt });
  d.tasks = [task('x', true, '2026-11-03'), task('y', true, '2026-10-01'), task('z', false), task('q', false)];
  d.habits = [{ id: 'h', name: 'Lesen', icon: '📖' }];
  d.habitLogs = ['2026-11-02', '2026-11-03', '2026-10-28', '2026-10-15'].map((date, i) => ({ id: `l${i}`, habitId: 'h', date }));
  return d;
}

const kr = (k: Partial<KeyResult> & Pick<KeyResult, 'kind'>): KeyResult => ({ id: 'kr', ...k });

describe('Ziele, die sich selbst messen', () => {
  const src = sources();

  it('Spartopf: Stand und was diese Woche dazukam', () => {
    const m = measureResult(kr({ kind: 'spartopf', refId: 'pot' }), src, DAY);
    expect(m.share).toBeCloseTo(0.4);
    expect(m.text).toBe('1.200 € von 3.000 €');
    // 100 + 50 (alte Buchung ohne Verknüpfung, am Namen erkannt) − 30
    expect(m.week).toBe('+120 € gespart');
    expect(m.label).toBe('✈️ Auslandssemester');
  });

  it('Lernkarten: zählen anteilig nach Abstand', () => {
    const m = measureResult(kr({ kind: 'karten', refId: 'ana' }), src, DAY);
    expect(m.share).toBeCloseTo((1 + 0 + 7 / 21 + 1) / 4);
    expect(m.text).toBe('2 von 4 Karten sitzen');
    expect(m.week).toBe('2 Karten wiederholt');
    expect(m.href).toBe('#/lernen/ana');
  });

  it('Training: Schnitt der letzten vier Wochen, geplante zählen nicht', () => {
    const m = measureResult(kr({ kind: 'training', target: 3 }), src, DAY);
    // 8.10.–4.11.: 12.10., 14.10., 20.10., 27.10., 2.11., 3.11. = 6
    expect(m.share).toBeCloseTo(6 / 12);
    expect(m.text).toBe('Ø 1,5 pro Woche (4 Wochen) · Ziel 3');
    expect(m.week).toBe('2 Trainings');
  });

  it('Kursnote: benoteter Anteil, gewichtet mit der Note', () => {
    const m = measureResult(kr({ kind: 'note', refId: 'ana', target: 2 }), src, DAY);
    expect(m.share).toBeCloseTo(0.4);
    expect(m.text).toBe('Kursnote 1,7 · Ziel 2,0 · 60 % offen');
    const worse = measureResult(kr({ kind: 'note', refId: 'ana', target: 1.3 }), src, DAY);
    expect(worse.share).toBeCloseTo(0.4 * ((4 - 1.7) / (4 - 1.3)));
  });

  it('Projekt, Gewohnheit und eigener Wert', () => {
    const p = measureResult(kr({ kind: 'projekt', refId: 'p' }), src, DAY);
    expect(p).toMatchObject({ share: 0.5, text: '2 von 4 Aufgaben', week: '1 Aufgabe erledigt' });
    const h = measureResult(kr({ kind: 'gewohnheit', refId: 'h', target: 5 }), src, DAY);
    expect(h.share).toBeCloseTo(4 / 20);
    expect(h.week).toBe('2 Tage');
    const own = measureResult(kr({ kind: 'manuell', current: 3, target: 12, unit: 'Bücher', label: 'Bücher lesen' }), src, DAY);
    expect(own).toMatchObject({ label: 'Bücher lesen', text: '3 von 12 Bücher', share: 0.25 });
  });

  it('gelöschte Verknüpfung', () => {
    const m = measureResult(kr({ kind: 'spartopf', refId: 'weg' }), src, DAY);
    expect(m.missing).toBe(true);
    expect(m.share).toBe(0);
  });

  it('Fortschritt eines Ziels und Beiträge der Woche', () => {
    const goal: Goal = { id: 'z', title: 'Auslandssemester', area: 'Studium', why: '', deadline: null, progress: 10, results: [kr({ kind: 'spartopf', refId: 'pot' }), kr({ kind: 'projekt', refId: 'p' })] };
    expect(goalProgress(goal, src, DAY)).toBe(45);
    expect(goalProgress({ ...goal, results: [] }, src, DAY)).toBe(10);
    expect(weekContributions([goal, { ...goal, id: 'leer', results: [kr({ kind: 'manuell' })] }], src, DAY)).toEqual([
      { goalId: 'z', title: 'Auslandssemester', items: ['+120 € gespart', '1 Aufgabe erledigt'] },
    ]);
  });
});
