import { describe, expect, it } from 'vitest';
import { emptyData } from '../store';
import { defaultAlarm } from './alarm';
import type { CalendarEntry } from './calendar';
import { buildDayPlan, busyMinutes, findGaps, findSlot, minutesLabel, sleepOn, toHHMM, toMin, wakeOn } from './dayplan';

const DAY = '2026-11-04'; // Mittwoch

const entry = (key: string, time: string, endTime: string, kind: CalendarEntry['kind'] = 'event'): CalendarEntry => ({ key, start: DAY, end: DAY, time, endTime, label: key, kind });

describe('Mein Tag als Zeitleiste', () => {
  it('rechnet Uhrzeiten', () => {
    expect(toMin('07:30')).toBe(450);
    expect(toHHMM(450)).toBe('07:30');
    expect(toHHMM(1470)).toBe('00:30');
    expect(minutesLabel(90)).toBe('1 Std. 30 Min.');
    expect(minutesLabel(45)).toBe('45 Min.');
  });

  it('Wecker und Schlafenszeit', () => {
    const alarm = { ...defaultAlarm(), id: 'a', time: '06:45', days: [1, 2, 3, 4, 5], enabled: true };
    expect(wakeOn([alarm], DAY)).toBe(6 * 60 + 45);
    expect(wakeOn([alarm], '2026-11-07')).toBeNull(); // Samstag
    // Donnerstag 06:45, 8 Std. Schlaf + 15 Min. Einschlafen → 22:30
    expect(sleepOn([alarm], { goal: 480, remind: false }, DAY)).toBe(22 * 60 + 30);
    // Samstag: am Sonntag klingelt kein Wecker, also keine Schlafenszeit
    expect(sleepOn([alarm], { goal: 480, remind: false }, '2026-11-07')).toBeNull();
  });

  it('Lücken und verplante Zeit', () => {
    const blocks = [{ start: 480, end: 570 }, { start: 540, end: 600 }, { start: 610, end: 700 }];
    expect(findGaps(blocks, 450, 760)).toEqual([{ start: 450, end: 480 }, { start: 700, end: 760 }]);
    expect(busyMinutes(blocks, 450, 760)).toBe(120 + 90);
    expect(findSlot({ gaps: [{ start: 450, end: 480 }, { start: 700, end: 760 }] }, 45, 455)).toBe(700);
    expect(findSlot({ gaps: [{ start: 452, end: 520 }] }, 45, 0)).toBe(455);
    expect(findSlot({ gaps: [{ start: 450, end: 480 }] }, 60, 0)).toBeNull();
  });

  it('baut den Tag aus Terminen, Training, Essen und Aufgaben', () => {
    const d = emptyData();
    d.alarms = [{ ...defaultAlarm(), id: 'a', time: '07:00', days: [3, 4], enabled: true }];
    d.workouts = [
      { id: 'w1', title: 'Push', type: 'Krafttraining', date: DAY, done: false, notes: '', time: '17:00', minutes: 75 },
      { id: 'w2', title: 'Laufen', type: 'Laufen', date: DAY, done: false, notes: '' },
    ];
    d.meals = [{ id: 'm', date: DAY, slot: 'mittag', recipeId: null, title: 'Nudeln' }];
    const task = (id: string, extra: object) => ({ id, title: id, courseId: null, kind: 'Aufgabe' as const, status: 'offen' as const, priority: 'mittel' as const, due: null, ...extra });
    d.tasks = [
      task('geplant', { plannedFor: DAY, plannedTime: '10:00', estimate: 45 }),
      task('offen', { plannedFor: DAY, estimate: 20 }),
      task('ohne', { due: DAY }),
      task('morgen', { plannedFor: '2026-11-05', plannedTime: '09:00' }),
      task('gestern', { plannedFor: '2026-11-03', plannedTime: '09:00' }),
    ];
    const entries = [entry('Analysis', '08:15', '09:45', 'lecture'), entry('Mensa', '12:30', '13:00'), entry('Ganztägig', '', '')];
    const plan = buildDayPlan(d, entries, DAY);
    expect(plan.wake).toBe(7 * 60);
    expect(plan.wakeFromAlarm).toBe(true);
    // Donnerstag 07:00 − 8 Std. 15 Min. = 22:45
    expect(plan.sleep).toBe(22 * 60 + 45);
    expect(plan.blocks.map((b) => b.key)).toEqual(['Analysis', 't-geplant', 'm-m', 'Mensa', 'w-w1']);
    const mensa = plan.blocks.find((b) => b.key === 'Mensa')!;
    const lunch = plan.blocks.find((b) => b.key === 'm-m')!;
    expect([lunch.lanes, mensa.lanes]).toEqual([2, 2]);
    expect(lunch.lane).not.toBe(mensa.lane);
    expect(plan.open.map((o) => o.id)).toEqual(['offen', 'ohne', 'gestern', 'w2']);
    expect(plan.open.find((o) => o.id === 'ohne')).toMatchObject({ minutes: 30, estimated: false });
    expect(plan.openMinutes).toBe(20 + 30 + 30 + 60);
    // 90 + 45 + 45 (Mittag, Mensa darin) + 75
    expect(plan.busy).toBe(90 + 45 + 45 + 75);
    expect(plan.gaps[0]).toEqual({ start: 420, end: 495 });
  });

  it('Termine vor dem Wecker verlängern die Zeitleiste', () => {
    const plan = buildDayPlan(emptyData(), [entry('Früh', '06:10', '06:40')], DAY);
    expect(plan.wake).toBe(6 * 60);
    expect(plan.wakeFromAlarm).toBe(false);
  });
});
