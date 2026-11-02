import { describe, expect, it } from 'vitest';
import type { Alarm, Habit, HabitLog, ShoppingItem, Task, Workout } from '../types';
import { emptyData } from '../store';
import { defaultAlarm } from './alarm';
import type { CalendarEntry } from './calendar';
import { parseWidgetActions, parseWidgetLink, resolveWidgetActions, widgetAgenda, widgetAlarm, widgetSnapshot, widgetTasks, widgetTraining, type WidgetAction } from './widgets';

const DAY = '2026-11-02'; // Montag
const now = new Date(2026, 10, 2, 9, 30);

const task = (id: string, patch: Partial<Task> = {}): Task => ({
  id, title: id, courseId: null, kind: 'Aufgabe' as Task['kind'], status: 'offen', priority: 'mittel' as Task['priority'], due: DAY, ...patch,
});

describe('widgetAlarm', () => {
  it('nimmt den nächsten Wecker und merkt sich die folgenden Weckzeiten', () => {
    const a: Alarm = { ...defaultAlarm(), id: 'a', time: '06:45', days: [1, 2, 3, 4, 5], enabled: true, armedAt: 0, label: '' };
    const b: Alarm = { ...defaultAlarm(), id: 'b', time: '10:00', days: [], date: DAY, enabled: true, armedAt: 0, label: 'Vorlesung' };
    const w = widgetAlarm([a, b], now)!;
    expect(w.rings[0].title).toBe('Vorlesung');
    expect(new Date(w.rings[0].at).getHours()).toBe(10);
    // Danach der andere Wecker – mit seinen eigenen Angaben
    expect(w.rings[1]).toMatchObject({ title: 'Wecker', repeat: 'Werktags' });
    expect(new Date(w.rings[1].at).getDate()).toBe(3);
    expect(w.rings.map((r) => r.at)).toEqual(w.rings.map((r) => r.at).sort((x, y) => x - y));
  });

  it('ohne eingeschaltete Wecker: null', () => {
    expect(widgetAlarm([{ ...defaultAlarm(), id: 'x', enabled: false, armedAt: 0 }], now)).toBeNull();
  });
});

describe('widgetAgenda', () => {
  const entry = (patch: Partial<CalendarEntry>): CalendarEntry => ({ key: patch.label ?? 'x', start: DAY, end: DAY, time: '', endTime: '', label: 'x', kind: 'event', ...patch });

  it('zeigt heute und morgen, ohne Aufgaben, ganztägig zuerst', () => {
    const list = widgetAgenda([
      entry({ label: 'Analysis', time: '10:15', endTime: '11:45', kind: 'lecture' }),
      entry({ label: 'Geburtstag', kind: 'birthday' }),
      entry({ label: 'Aufgabe', kind: 'task' }),
      entry({ label: 'Morgen', start: '2026-11-03', end: '2026-11-03', time: '08:00' }),
    ], DAY);
    expect(list.map((e) => e.title)).toEqual(['Geburtstag', 'Analysis', 'Morgen']);
    expect(list[1].endsAt).toBe(new Date(2026, 10, 2, 11, 45).getTime());
    expect(list[0].endsAt).toBe(new Date(2026, 10, 3).getTime());
    expect(list[2].day).toBe('2026-11-03');
  });
});

describe('widgetTasks', () => {
  it('offene von heute und überfällige, danach heute erledigte', () => {
    const { tasks, open } = widgetTasks([
      task('heute'),
      task('alt', { due: '2026-10-30' }),
      task('später', { due: '2026-11-10' }),
      task('geplant', { due: null, plannedFor: DAY }),
      task('irgendwann', { due: null, someday: true }),
      task('fertig', { status: 'erledigt', completedAt: DAY }),
      task('gestern fertig', { status: 'erledigt', completedAt: '2026-11-01' }),
    ], DAY);
    expect(tasks.map((t) => t.id)).toEqual(['alt', 'heute', 'geplant', 'fertig']);
    expect(open).toBe(3);
    expect(tasks.find((t) => t.id === 'alt')).toMatchObject({ overdue: true, dueLabel: 'vor 3 Tagen' });
    expect(tasks.find((t) => t.id === 'fertig')?.done).toBe(true);
  });
});

describe('widgetTraining', () => {
  const plan = [{ id: 'p', name: 'Push', exercises: [{ id: 'e1', name: 'Bankdrücken', sets: 3, reps: '8' }, { id: 'e2', name: 'Dips', sets: 3, reps: '10' }] }] as never;
  const w = (id: string, date: string, done: boolean, patch: Partial<Workout> = {}): Workout => ({ id, title: 'Laufen', type: 'Laufen', date, done, notes: '', ...patch });

  it('heute eingetragenes Training mit Wochenstand', () => {
    const t = widgetTraining({ trainingPlan: plan, workouts: [w('1', DAY, false, { planDayId: 'p', title: 'Push' }), w('2', '2026-11-04', false), w('3', '2026-10-30', true)] }, DAY)!;
    expect(t).toMatchObject({ title: 'Push', detail: 'Bankdrücken · Dips', weekDone: 0, weekGoal: 2, fromPlan: false });
  });

  it('sonst der nächste Tag aus dem Plan', () => {
    expect(widgetTraining({ trainingPlan: plan, workouts: [] }, DAY)).toMatchObject({ title: 'Push', fromPlan: true });
    expect(widgetTraining({ trainingPlan: [], workouts: [] }, DAY)).toBeNull();
  });
});

describe('widgetSnapshot', () => {
  it('rechnet aus leeren Daten einen gültigen Stand', () => {
    const s = widgetSnapshot(emptyData(), [], now);
    expect(s.day).toBe(DAY);
    expect(s.alarm).toBeNull();
    expect(s.budget).toBeNull();
    expect(s.rings.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it('Gewohnheiten, Einkauf und Countdown', () => {
    const data = emptyData();
    data.habits = [{ id: 'h', name: 'Wasser', icon: '💧', target: 2, unit: 'l' }];
    data.habitLogs = [{ id: 'l', habitId: 'h', date: DAY, amount: 1 }];
    data.shopping = [
      { id: 's1', name: 'Eier', amount: '', aisle: 'kuehl', done: true, added: DAY },
      { id: 's2', name: 'Milch', amount: '1', aisle: 'kuehl', done: false, added: DAY },
    ];
    data.exams = [{ id: 'e', title: 'Lineare Algebra', courseId: null, date: '2026-11-14', time: '09:00', location: '' }];
    const s = widgetSnapshot(data, [], now);
    expect(s.habits[0]).toMatchObject({ done: false, amount: 1, target: 2, unit: 'l' });
    expect(s.shopping.map((x) => x.id)).toEqual(['s2', 's1']);
    expect(s.shoppingOpen).toBe(1);
    expect(s.exam).toMatchObject({ title: 'Lineare Algebra', date: '2026-11-14' });
    // Heutige Prüfung, deren Uhrzeit vorbei ist, zählt nicht mehr
    data.exams.push({ id: 'f', title: 'Vorbei', courseId: null, date: DAY, time: '08:00', location: '' }, { id: 'g', title: 'Gleich', courseId: null, date: DAY, time: '11:00', location: '' });
    expect(widgetSnapshot(data, [], now).exam?.title).toBe('Gleich');
  });
});

describe('resolveWidgetActions', () => {
  const habits: Habit[] = [{ id: 'lesen', name: 'Lesen', icon: '📖' }, { id: 'wasser', name: 'Wasser', icon: '💧', target: 2 }];
  const habitLogs: HabitLog[] = [{ id: 'l1', habitId: 'lesen', date: DAY }, { id: 'l2', habitId: 'wasser', date: DAY, amount: 1 }];
  const shopping: ShoppingItem[] = [{ id: 'milch', name: 'Milch', amount: '', aisle: 'kuehl', done: false, added: DAY }];
  const data = { tasks: [task('t'), task('u', { status: 'erledigt', completedAt: DAY })], shopping, habits, habitLogs };
  const act = (kind: WidgetAction['kind'], id: string, done: boolean, at = 1): WidgetAction => ({ kind, id, done, day: DAY, at });

  it('übernimmt nur Änderungen und pro Eintrag die letzte Aktion', () => {
    expect(resolveWidgetActions(data, [act('task', 't', true, 1), act('task', 't', false, 2), act('task', 'u', true), act('shopping', 'milch', true)])).toEqual([
      { op: 'update', collection: 'shopping', id: 'milch', patch: { done: true } },
    ]);
    expect(resolveWidgetActions(data, [act('task', 't', true)])).toEqual([{ op: 'update', collection: 'tasks', id: 't', patch: { status: 'erledigt' } }]);
  });

  it('Gewohnheiten: abhaken füllt das Tagesziel, zurücknehmen löscht den Eintrag', () => {
    expect(resolveWidgetActions(data, [act('habit', 'wasser', true)])).toEqual([{ op: 'update', collection: 'habitLogs', id: 'l2', patch: { amount: 2 } }]);
    expect(resolveWidgetActions(data, [act('habit', 'lesen', false)])).toEqual([{ op: 'remove', collection: 'habitLogs', id: 'l1' }]);
    expect(resolveWidgetActions({ ...data, habitLogs: [] }, [act('habit', 'lesen', true)])).toEqual([{ op: 'add', collection: 'habitLogs', item: { habitId: 'lesen', date: DAY } }]);
    expect(resolveWidgetActions(data, [act('habit', 'gelöscht', true)])).toEqual([]);
  });

  it('ignoriert kaputte Einträge in der Warteschlange', () => {
    expect(parseWidgetActions([null, { kind: 'x', id: 'a', done: true, day: DAY }, act('task', 't', true), 'quatsch'])).toEqual([act('task', 't', true)]);
    expect(parseWidgetActions('nichts')).toEqual([]);
  });
});

describe('parseWidgetLink', () => {
  it('erkennt Seiten, Schnell-Eintrag und Fokus', () => {
    expect(parseWidgetLink('antonos://open/kalender')).toEqual({ type: 'page', hash: '#/kalender' });
    expect(parseWidgetLink('antonos://open')).toEqual({ type: 'page', hash: '#/' });
    expect(parseWidgetLink('antonos://assistent')).toEqual({ type: 'assistant' });
    expect(parseWidgetLink('antonos://fokus-start')).toEqual({ type: 'focus' });
    expect(parseWidgetLink('antonos://spotify-callback?code=1')).toBeNull();
    expect(parseWidgetLink('https://example.com')).toBeNull();
  });
});
