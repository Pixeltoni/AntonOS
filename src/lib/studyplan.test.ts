import { describe, expect, it } from 'vitest';
import type { Exam, FocusSession } from '../types';
import type { CalendarEntry } from './calendar';
import { freeGaps, planStudy, statusLabel } from './studyplan';

const at = (date: string, time: string) => new Date(`${date}T${time}:00`);
const exam = (patch: Partial<Exam>): Exam => ({ id: 'x', title: 'Klausur Analysis', courseId: 'ana', date: '2026-11-10', time: '10:00', location: '', studyHours: 10, planFrom: '2026-11-03', ...patch });
const session = (date: string, minutes: number, courseId = 'ana'): FocusSession => ({ id: `${date}-${minutes}`, date, minutes, courseId, distractions: 0, mode: 'lernen' });
const settings = { from: '09:00', to: '20:00', maxPerDay: 180 };
const lecture = (day: string, time: string, endTime: string): CalendarEntry => ({ key: `l-${day}-${time}`, start: day, end: day, time, endTime, label: 'Vorlesung', kind: 'lecture' });

describe('Lernplan', () => {
  it('findet Lücken mit Puffer um Termine', () => {
    expect(freeGaps([[600, 690]], 540, 1200)).toEqual([[540, 585], [705, 1200]]);
    expect(freeGaps([[540, 1200]], 540, 1200)).toEqual([]);
  });

  it('verteilt die offene Zeit gleichmäßig bis zum Vortag der Prüfung', () => {
    const { blocks, status } = planStudy([exam({})], [], [], settings, at('2026-11-03', '07:00'));
    const perDay = new Map<string, number>();
    blocks.forEach((b) => perDay.set(b.day, (perDay.get(b.day) ?? 0) + b.minutes));
    expect([...perDay.keys()]).toEqual(['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09']);
    expect([...perDay.values()].reduce((a, b) => a + b, 0)).toBe(600);
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(120);
    expect(status[0]).toMatchObject({ goal: 600, done: 0, unplanned: 0, daysLeft: 7 });
  });

  it('plant um Vorlesungen herum und heute erst ab jetzt', () => {
    const { blocks } = planStudy([exam({ studyHours: 2, date: '2026-11-04' })], [], [lecture('2026-11-03', '14:00', '16:00')], settings, at('2026-11-03', '13:10'));
    expect(blocks.map((b) => [b.start, b.end])).toEqual([['16:15', '18:15']]);
  });

  it('zieht gelernte Zeit ab und meldet Rückstand', () => {
    const sessions = [session('2026-11-03', 60), session('2026-11-04', 30, 'andere')];
    const { status } = planStudy([exam({})], sessions, [], settings, at('2026-11-07', '08:00'));
    expect(status[0].done).toBe(60);
    // nach 4 von 7 Tagen wären ~343 Minuten fällig
    expect(statusLabel(status[0])).toBe('4,5 Std. im Rückstand');
  });

  it('teilt freie Zeit zwischen Prüfungen und hält das Tageslimit', () => {
    const { blocks } = planStudy([exam({ id: 'a', studyHours: 20 }), exam({ id: 'b', courseId: 'la', studyHours: 20 })], [], [], settings, at('2026-11-03', '07:00'));
    const perDay = new Map<string, number>();
    blocks.forEach((b) => perDay.set(b.day, (perDay.get(b.day) ?? 0) + b.minutes));
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(180);
    expect(blocks.some((b) => b.examId === 'b')).toBe(true);
  });

  it('ignoriert Prüfungen ohne Plan oder in der Vergangenheit', () => {
    expect(planStudy([exam({ studyHours: null }), exam({ id: 'alt', date: '2026-11-01' })], [], [], settings, at('2026-11-03', '07:00')).status).toEqual([]);
  });
});
