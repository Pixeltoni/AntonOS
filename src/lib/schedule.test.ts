import { describe, expect, it } from 'vitest';
import type { Person, Task } from '../types';
import type { CalendarEntry } from './calendar';
import { alreadyDelivered, MAX_PLANNED, noticeId, plannedNotices } from './schedule';

const at = (date: string, time: string) => new Date(`${date}T${time}:00`);
const none = { tasks: [] as Task[], people: [] as Person[], recurring: [], trips: [] };
const lecture: CalendarEntry & { remind: number } = { key: 'lec-1', start: '2026-11-02', end: '2026-11-02', time: '10:00', endTime: '11:30', label: 'Analysis', kind: 'lecture', location: 'HS 1', remind: 15 };
const task = (patch: Partial<Task>): Task => ({ id: 't', title: 'Müll rausbringen', courseId: null, kind: 'Aufgabe', status: 'offen', priority: 'mittel', due: '2026-11-01', dueTime: '19:00', remind: true, ...patch });

describe('geplante Mitteilungen der iOS-App', () => {
  it('plant Termine mit Vorlauf und Aufgaben zur Uhrzeit', () => {
    const plan = plannedNotices([lecture], { ...none, tasks: [task({})] }, at('2026-10-31', '12:00'));
    expect(plan.map((p) => [p.tag, p.at, p.title, p.body])).toEqual([
      ['task-t', at('2026-11-01', '19:00').getTime(), '🔔 Müll rausbringen', 'Erinnerung · 19:00 Uhr'],
      ['lec-1', at('2026-11-02', '09:45').getTime(), 'Analysis', 'um 10:00 · HS 1'],
    ]);
  });

  it('sagt „morgen“, wenn die Erinnerung am Vortag kommt', () => {
    const plan = plannedNotices([{ ...lecture, remind: 1440 }], none, at('2026-10-31', '12:00'));
    expect(plan[0].body).toBe('morgen um 10:00 · HS 1');
  });

  it('lässt Vergangenes, Erledigtes und Aufgaben ohne Erinnerung weg', () => {
    const tasks = [task({ id: 'a', status: 'erledigt' }), task({ id: 'b', remind: false }), task({ id: 'c', due: '2026-10-30' }), task({ id: 'd', dueTime: '' })];
    expect(plannedNotices([], { ...none, tasks }, at('2026-10-31', '12:00'))).toEqual([]);
  });

  it('meldet Geburtstage einmal eine Woche vorher und am Tag selbst', () => {
    const lea: Person = { id: 'lea', name: 'Lea', birthday: '11-10', birthYear: null, group: '', note: '', color: '', gifts: [], contactEvery: 0, lastContact: null, meetings: [] };
    const plan = plannedNotices([], { ...none, people: [lea] }, at('2026-10-31', '12:00'));
    expect(plan.map((p) => [p.tag, new Date(p.at).getHours()])).toEqual([
      ['bday7-lea-2026-11-10', 9],
      ['bday-lea-2026-11-10', 9],
    ]);
  });

  it('bleibt unter der Grenze von iOS', () => {
    const tasks = Array.from({ length: 100 }, (_, i) => task({ id: `t${i}` }));
    expect(plannedNotices([], { ...none, tasks }, at('2026-10-31', '12:00'))).toHaveLength(MAX_PLANNED);
  });

  it('erkennt schon gezeigte Mitteilungen', () => {
    const now = at('2026-11-02', '09:50').getTime();
    const log = [{ tag: 'lec-1', at: at('2026-11-02', '09:45').getTime() }, { tag: 'task-t', at: at('2026-11-02', '19:00').getTime() }];
    expect(alreadyDelivered(log, 'lec-1', now)).toBe(true);
    expect(alreadyDelivered(log, 'task-t', now)).toBe(false);
    expect(alreadyDelivered(log, 'lec-1', now + 2 * 86_400_000)).toBe(false);
  });

  it('macht aus Texten feste, positive Kennungen', () => {
    expect(noticeId('lec-1|1')).toBe(noticeId('lec-1|1'));
    expect(noticeId('lec-1|1')).not.toBe(noticeId('lec-1|2'));
    expect(noticeId('')).toBeGreaterThan(0);
  });
});
