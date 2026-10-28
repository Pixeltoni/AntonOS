import { describe, expect, it } from 'vitest';
import type { Data } from '../types';
import { demoData } from '../demo';
import { change, headline, moodInsights, weekReview, type WeekReview } from './review';

const T = '2026-10-28'; // Mittwoch

function data(): Data {
  const d = demoData();
  return {
    ...d,
    sessions: [
      { id: 's1', date: '2026-10-26', minutes: 90, courseId: 'demo-ana', distractions: 0 },
      { id: 's2', date: '2026-10-27', minutes: 30, courseId: 'demo-prog', distractions: 0 },
      { id: 's3', date: '2026-10-27', minutes: 45, courseId: null, distractions: 0, mode: 'arbeiten' },
      { id: 's4', date: '2026-10-20', minutes: 600, courseId: 'demo-ana', distractions: 0 },
    ],
    tasks: [
      { id: 't1', title: 'A', courseId: null, kind: 'Aufgabe', status: 'erledigt', priority: 'mittel', due: null, completedAt: '2026-10-27' },
      { id: 't2', title: 'B', courseId: null, kind: 'Aufgabe', status: 'erledigt', priority: 'mittel', due: null, completedAt: '2026-10-19' },
      { id: 't3', title: 'C', courseId: null, kind: 'Aufgabe', status: 'offen', priority: 'mittel', due: null },
    ],
    transactions: [
      { id: 'x1', type: 'Ausgabe', description: '', amount: 40, category: 'Lebensmittel', account: '', date: '2026-10-26' },
      { id: 'x2', type: 'Ausgabe', description: '', amount: 15, category: 'Freizeit', account: '', date: '2026-10-28' },
      { id: 'x3', type: 'Ausgabe', description: '', amount: 100, category: 'Sparen', account: '', date: '2026-10-28' },
      { id: 'x4', type: 'Ausgabe', description: '', amount: 99, category: 'Freizeit', account: '', date: '2026-10-29' },
    ],
    moods: [
      { id: 'm1', date: '2026-10-26', mood: 3, note: '' },
      { id: 'm2', date: '2026-10-27', mood: 5, note: '' },
    ],
  };
}

describe('Wochenrückblick', () => {
  it('zählt die Woche bis heute', () => {
    const w = weekReview(data(), T, T);
    expect(w.days).toEqual(['2026-10-26', '2026-10-27', '2026-10-28']);
    expect(w.learnMinutes).toBe(120);
    expect(w.courses[0]).toEqual({ courseId: 'demo-ana', minutes: 90 });
    expect(w.tasksDone).toBe(1);
    expect(w.spent).toBe(155);
    expect(w.topCategory).toEqual({ category: 'Lebensmittel', amount: 40 });
    expect(w.moodAvg).toBe(4);
    expect(w.bestDay).toBe('2026-10-27');
  });
  it('findet die Überschrift', () => {
    const w = weekReview(data(), T, T);
    const prev = weekReview(data(), '2026-10-21', '2026-10-25');
    expect(prev.learnMinutes).toBe(600);
    const base = { ...w, ringsClosed: 0, tasksDone: 0, bestStreak: null, workouts: 0 } as WeekReview;
    expect(headline({ ...base, learnMinutes: 700 }, [prev, { ...prev, learnMinutes: 100 }])).toBe('Stärkste Lernwoche seit 3 Wochen 🚀');
    expect(headline({ ...base, ringsClosed: 5 }, [prev])).toBe('5 Tage alle Ringe geschlossen ⭕');
    expect(headline({ ...base, moodAvg: null, learnMinutes: 0 }, [])).toBe('Deine Woche im Überblick');
    expect(change(150, 100)).toBe(50);
    expect(change(5, 0)).toBeNull();
  });
  it('erkennt Zusammenhänge mit der Stimmung', () => {
    const d = data();
    const days = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'];
    d.workouts = days.slice(0, 3).map((date, i) => ({ id: `w${i}`, title: 'Lauf', type: 'Laufen', date, done: true, notes: '' }));
    const moods = days.map((date, i) => ({ id: `m${i}`, date, mood: i < 3 ? 5 : 2, note: '', sleep: 7 }));
    const insights = moodInsights(d, moods);
    expect(insights[0].text).toBe('An Tagen mit Training ist deine Stimmung im Schnitt besser (+3,0).');
    expect(moodInsights(d, moods.slice(0, 4))).toEqual([]);
  });
});
