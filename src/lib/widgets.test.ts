import { describe, expect, it } from 'vitest';
import type { Alarm, Card, Habit, HabitLog, ShoppingItem, Task, Workout } from '../types';
import { emptyData } from '../store';
import { defaultAlarm } from './alarm';
import type { CalendarEntry } from './calendar';
import { addDays } from './dates';
import { parseWidgetActions, parseWidgetLink, resolveWidgetActions, widgetAgenda, widgetAlarm, widgetCards, widgetSnapshot, widgetTasks, widgetTraining, type WidgetAction } from './widgets';

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

  it('gleiche Weckzeiten mehrerer Wecker zählen nur einmal', () => {
    const same = (id: string): Alarm => ({ ...defaultAlarm(), id, time: '07:00', days: [1, 2, 3, 4, 5, 6, 7], enabled: true, armedAt: 0 });
    const w = widgetAlarm([same('a'), same('b'), same('c')], now)!;
    expect(new Set(w.rings.map((r) => r.at)).size).toBe(w.rings.length);
    expect(w.rings.length).toBe(8);
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
    data.habits.push({ id: 'g', name: 'Lesen', icon: '📖' });
    data.habitLogs = [{ id: 'l', habitId: 'h', date: DAY, amount: 1 }, { id: 'm', habitId: 'g', date: addDays(DAY, -1) }, { id: 'n', habitId: 'g', date: DAY }];
    data.shopping = [
      { id: 's1', name: 'Eier', amount: '', aisle: 'kuehl', done: true, added: DAY },
      { id: 's2', name: 'Milch', amount: '1', aisle: 'kuehl', done: false, added: DAY },
    ];
    data.exams = [{ id: 'e', title: 'Lineare Algebra', courseId: null, date: '2026-11-14', time: '09:00', location: '' }];
    const s = widgetSnapshot(data, [], now);
    expect(s.habits[0]).toMatchObject({ done: false, amount: 1, target: 2, unit: 'l', step: 1 });
    expect(s.habits[1]).toMatchObject({ done: true, step: 0, streak: 2, week: [false, false, false, false, false, true, true] });
    expect(s.shopping.map((x) => x.id)).toEqual(['s2', 's1']);
    expect(s.shoppingOpen).toBe(1);
    expect(s.exam).toMatchObject({ title: 'Lineare Algebra', date: '2026-11-14' });
    // Heutige Prüfung, deren Uhrzeit vorbei ist, zählt nicht mehr
    data.exams.push({ id: 'f', title: 'Vorbei', courseId: null, date: DAY, time: '08:00', location: '' }, { id: 'g', title: 'Gleich', courseId: null, date: DAY, time: '11:00', location: '' });
    expect(widgetSnapshot(data, [], now).exam?.title).toBe('Gleich');
  });

  it('Lernkarten: überfällige zuerst, neue zum Schluss, mit Kurs', () => {
    const base = { courseId: null, interval: 3, ease: 2.5, reps: 2, lapses: 0 };
    const cards: Card[] = [
      { id: 'neu', ...base, reps: 0, front: 'Neu', back: 'x', due: DAY },
      { id: 'alt', ...base, courseId: 'ana', front: 'Grenzwert von 1/n?', back: '0', due: '2026-11-01' },
      { id: 'heute', ...base, front: 'Heute', back: 'y'.repeat(400), due: DAY },
      { id: 'morgen', ...base, front: 'Morgen', back: 'z', due: '2026-11-05' },
    ];
    const r = widgetCards(cards, [{ id: 'ana', name: 'Analysis I', code: 'ANA', color: '#FF9500' }], DAY);
    expect(r.due).toBe(3);
    expect(r.cards.map((c) => c.id)).toEqual(['alt', 'heute', 'neu']);
    expect(r.cards[0]).toMatchObject({ course: 'Analysis I', color: '#FF9500' });
    expect(r.cards[1].back.length).toBe(260);
    expect(r.cards[1].back.endsWith('…')).toBe(true);
  });
});

describe('resolveWidgetActions', () => {
  const habits: Habit[] = [{ id: 'lesen', name: 'Lesen', icon: '📖' }, { id: 'wasser', name: 'Wasser', icon: '💧', target: 2 }];
  const habitLogs: HabitLog[] = [{ id: 'l1', habitId: 'lesen', date: DAY }, { id: 'l2', habitId: 'wasser', date: DAY, amount: 1 }];
  const shopping: ShoppingItem[] = [{ id: 'milch', name: 'Milch', amount: '', aisle: 'kuehl', done: false, added: DAY }];
  const card = (id: string, extra: Partial<Card> = {}): Card => ({ id, courseId: null, front: `Frage ${id}`, back: `Antwort ${id}`, interval: 0, ease: 2.5, reps: 0, lapses: 0, due: DAY, ...extra });
  const cards: Card[] = [card('k1'), card('k2', { interval: 6, reps: 2, due: '2026-11-01' })];
  const data = { tasks: [task('t'), task('u', { status: 'erledigt', completedAt: DAY })], shopping, habits, habitLogs, cards };
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

  it('Mengen-Gewohnheiten: Plus im Widget setzt die gewünschte Menge', () => {
    const plus = (amount: number, at = 1): WidgetAction => ({ ...act('habit', 'wasser', amount >= 2, at), amount });
    expect(resolveWidgetActions(data, [plus(1.5)])).toEqual([{ op: 'update', collection: 'habitLogs', id: 'l2', patch: { amount: 1.5 } }]);
    expect(resolveWidgetActions(data, [plus(1.5, 1), plus(2, 2)])).toEqual([{ op: 'update', collection: 'habitLogs', id: 'l2', patch: { amount: 2 } }]);
    expect(resolveWidgetActions(data, [plus(1)])).toEqual([]);
    expect(resolveWidgetActions(data, [plus(0)])).toEqual([{ op: 'remove', collection: 'habitLogs', id: 'l2' }]);
    expect(resolveWidgetActions({ ...data, habitLogs: [] }, [plus(0.5)])).toEqual([{ op: 'add', collection: 'habitLogs', item: { habitId: 'wasser', date: DAY, amount: 0.5 } }]);
  });

  it('Lernkarten: jede Bewertung zählt der Reihe nach', () => {
    // Gewusst: wie „Gut“ in der Lern-Sitzung
    expect(resolveWidgetActions(data, [act('card', 'k2', true)])).toEqual([
      { op: 'update', collection: 'cards', id: 'k2', patch: { interval: 15, ease: 2.5, reps: 3, lapses: 0, due: '2026-11-17', reviewed: DAY } },
    ]);
    // Erst „Nochmal“, später doch gewusst
    const [op] = resolveWidgetActions(data, [act('card', 'k1', true, 2), act('card', 'k1', false, 1)]);
    expect(op).toEqual({ op: 'update', collection: 'cards', id: 'k1', patch: { interval: 1, ease: 2.3, reps: 1, lapses: 1, due: '2026-11-03', reviewed: DAY } });
    expect(resolveWidgetActions(data, [act('card', 'weg', true)])).toEqual([]);
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
    expect(parseWidgetLink('antonos://fokus-start')).toEqual({ type: 'focus', action: 'start' });
    expect(parseWidgetLink('antonos://fokus-pause')).toEqual({ type: 'focus', action: 'pause' });
    expect(parseWidgetLink('antonos://fokus-stop')).toEqual({ type: 'focus', action: 'stop' });
    expect(parseWidgetLink('antonos://satzpause-plus')).toEqual({ type: 'rest', action: 'plus' });
    expect(parseWidgetLink('antonos://satzpause-skip')).toEqual({ type: 'rest', action: 'skip' });
    expect(parseWidgetLink('antonos://routine-weiter')).toEqual({ type: 'routine', action: 'next' });
    expect(parseWidgetLink('antonos://routine-plus')).toEqual({ type: 'routine', action: 'plus' });
    expect(parseWidgetLink('antonos://spotify-callback?code=1')).toBeNull();
    expect(parseWidgetLink('https://example.com')).toBeNull();
  });
});
