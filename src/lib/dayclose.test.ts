import { describe, expect, it } from 'vitest';
import type { Alarm, Task } from '../types';
import { defaultAlarm } from './alarm';
import { dayCloseDue, dayCloseNotices, openForToday, tomorrowAlarm, toTomorrow } from './dayclose';

const at = (date: string, time: string) => new Date(`${date}T${time}:00`);
const task = (patch: Partial<Task>): Task => ({ id: 't', title: 'Wäsche', courseId: null, kind: 'Aufgabe', status: 'offen', priority: 'mittel', due: null, ...patch });
const alarm = (patch: Partial<Alarm>): Alarm => ({ ...defaultAlarm(), id: 'a', armedAt: 0, ...patch });

describe('Tag abschließen', () => {
  it('findet offene Aufgaben von heute und überfällige, nicht Irgendwann oder Erledigtes', () => {
    const tasks = [
      task({ id: 'heute', due: '2026-11-03' }),
      task({ id: 'alt', due: '2026-11-01' }),
      task({ id: 'geplant', plannedFor: '2026-11-03' }),
      task({ id: 'morgen', due: '2026-11-04' }),
      task({ id: 'fertig', due: '2026-11-03', status: 'erledigt' }),
      task({ id: 'irgendwann', due: '2026-11-03', someday: true }),
    ];
    expect(openForToday(tasks, '2026-11-03').map((t) => t.id)).toEqual(['heute', 'alt', 'geplant']);
  });

  it('schiebt Fälligkeit und „Wann?“ auf morgen, aber keine spätere Deadline', () => {
    expect(toTomorrow(task({ due: '2026-11-01', evening: true }), '2026-11-03')).toEqual({ due: '2026-11-04', evening: false });
    expect(toTomorrow(task({ due: '2026-11-10', plannedFor: '2026-11-03' }), '2026-11-03')).toEqual({ plannedFor: '2026-11-04', evening: false });
  });

  it('nimmt den ersten Wecker, der morgen klingelt', () => {
    const now = at('2026-11-03', '21:30'); // Dienstag
    const alarms = [alarm({ id: 'spaet', time: '08:00', days: [3] }), alarm({ id: 'frueh', time: '06:45', days: [3] }), alarm({ id: 'aus', time: '05:00', days: [3], enabled: false }), alarm({ id: 'do', time: '05:00', days: [4] })];
    const r = tomorrowAlarm(alarms, now);
    expect(r?.alarm.id).toBe('frueh');
    expect(tomorrowAlarm([alarm({ days: [4] })], now)).toBeNull();
  });

  it('plant die Erinnerung jeden Abend, heute nur, wenn noch nicht abgeschlossen', () => {
    const s = { enabled: true, time: '21:30' };
    const now = at('2026-11-03', '12:00');
    expect(dayCloseNotices(s, now, 2).map((n) => n.tag)).toEqual(['abend-2026-11-03', 'abend-2026-11-04']);
    expect(dayCloseNotices({ ...s, last: '2026-11-03' }, now, 2).map((n) => n.tag)).toEqual(['abend-2026-11-04']);
    expect(dayCloseNotices({ ...s, enabled: false }, now)).toEqual([]);
  });

  it('ist im offenen Daywerk ab der Uhrzeit fällig', () => {
    const s = { enabled: true, time: '21:30' };
    expect(dayCloseDue(s, at('2026-11-03', '21:00'))).toBeNull();
    expect(dayCloseDue(s, at('2026-11-03', '21:31'))).toBe('2026-11-03');
    expect(dayCloseDue({ ...s, last: '2026-11-03' }, at('2026-11-03', '22:00'))).toBeNull();
  });
});
