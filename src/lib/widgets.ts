/**
 * iOS-Widgets: Die App rechnet hier einen kleinen Stand („Schnappschuss“) aus, den sie
 * in den gemeinsamen Speicher (App Group) legt. Die Widget-Erweiterung (ios/App/AntonOSWidgets)
 * liest nur diesen Stand – sie kennt AntonOS-Daten sonst nicht.
 *
 * Abhaken im Widget landet als Aktion in einer Warteschlange, die die App beim nächsten
 * Öffnen mit `resolveWidgetActions` übernimmt.
 */
import type { Alarm, Data, DateStr, ID, Task } from '../types';
import { addDays, daysBetween, parseDate, toDateStr } from './dates';
import { listTasks } from './tasks';
import { nextRings, repeatLabel, alarmTitle } from './alarm';
import { onDay, sortEntries, startAt, type CalendarEntry } from './calendar';
import { defaultRingGoals, ringDay, weekOf } from './rings';
import { isHabitDone, habitAmount, monthKey, streak } from './life';
import { budgetStatus } from './finance';
import { nextTrainingDay } from './training';
import { toneLabel } from './tones';

/** Erhöhen, wenn sich das Format so ändert, dass alte Widgets es nicht mehr lesen können */
export const WIDGET_SNAPSHOT_VERSION = 1;

export interface WidgetAlarmRing {
  /** Zeitpunkt (ms) */
  at: number;
  title: string;
  repeat: string;
  sound: string;
}

export interface WidgetAlarm {
  /** Nächste Weckzeiten aller Wecker samt Angaben, damit das Widget ohne App weiterzählen kann */
  rings: WidgetAlarmRing[];
}

export interface WidgetRing {
  label: string;
  share: number;
  text: string;
  color: string;
  track: string;
}

export interface WidgetAgendaItem {
  day: DateStr;
  title: string;
  /** HH:MM, leer = ganztägig */
  time: string;
  endTime: string;
  color: string;
  kind: CalendarEntry['kind'];
  location: string;
  /** Ende in ms – danach blendet das Widget den Eintrag aus */
  endsAt: number;
}

export interface WidgetTask {
  id: ID;
  title: string;
  done: boolean;
  overdue: boolean;
  /** „Heute“, „Gestern“ … leer ohne Frist */
  dueLabel: string;
}

export interface WidgetHabit {
  id: ID;
  name: string;
  icon: string;
  done: boolean;
  amount: number;
  target: number;
  unit: string;
  streak: number;
}

export interface WidgetTraining {
  title: string;
  detail: string;
  /** Aus dem Plan statt fest eingetragen */
  fromPlan: boolean;
  doneToday: boolean;
  weekDone: number;
  weekGoal: number;
}

export interface WidgetCountdown {
  kind: 'exam' | 'trip';
  title: string;
  date: DateStr;
  time: string;
  color: string;
}

export interface WidgetBudget {
  month: string;
  available: number;
  budget: number;
  spent: number;
  perDay: number;
}

export interface WidgetShoppingItem {
  id: ID;
  name: string;
  amount: string;
  done: boolean;
}

export interface WidgetSnapshot {
  version: number;
  /** Erstellt (ms) */
  at: number;
  /** Tag, für den Ringe, Gewohnheiten und Aufgaben gelten */
  day: DateStr;
  alarm: WidgetAlarm | null;
  rings: WidgetRing[];
  ringsClosed: boolean;
  agenda: WidgetAgendaItem[];
  tasks: WidgetTask[];
  tasksOpen: number;
  habits: WidgetHabit[];
  training: WidgetTraining | null;
  exam: WidgetCountdown | null;
  trip: WidgetCountdown | null;
  budget: WidgetBudget | null;
  shopping: WidgetShoppingItem[];
  shoppingOpen: number;
}

const KIND_COLORS: Record<CalendarEntry['kind'], string> = {
  event: '#007AFF',
  lecture: '#5856D6',
  exam: '#FF3B30',
  birthday: '#FF2D55',
  trip: '#34C759',
  project: '#FF9500',
  task: '#8E8E93',
  study: '#30B0C7',
};

function alarmSound(a: Alarm): string {
  if (a.sound === 'datei') return a.soundName?.trim() || 'Eigene Datei';
  if (a.sound === 'spotify') return a.soundName?.trim() || 'Spotify';
  if (a.sound === 'youtube') return 'YouTube';
  return toneLabel(a.tone);
}

/** Die nächsten Weckzeiten aller Wecker, jede mit Titel, Wiederholung und Ton ihres Weckers */
export function widgetAlarm(alarms: Alarm[], now: Date): WidgetAlarm | null {
  const rings = alarms
    .flatMap((alarm) => nextRings(alarm, now, 8).map((d) => ({ at: d.getTime(), title: alarmTitle(alarm), repeat: repeatLabel(alarm), sound: alarmSound(alarm) })))
    .sort((a, b) => a.at - b.at)
    // Gleiche Uhrzeit bei mehreren Weckern nur einmal – sonst reichen die Plätze nicht weit
    .filter((r, i, all) => i === 0 || all[i - 1].at !== r.at)
    .slice(0, 10);
  return rings.length > 0 ? { rings } : null;
}

/** Termine von heute und morgen (ohne Aufgaben – die haben ihre eigene Liste) */
export function widgetAgenda(entries: CalendarEntry[], day: DateStr, max = 10): WidgetAgendaItem[] {
  const out: WidgetAgendaItem[] = [];
  for (const d of [day, addDays(day, 1)]) {
    const list = sortEntries(entries.filter((e) => e.kind !== 'task' && !e.done && onDay(e, d)));
    for (const e of list) {
      const endsAt = e.time ? startAt(d, e.endTime || e.time) + (e.endTime ? 0 : 60 * 60_000) : startAt(addDays(d, 1), '00:00');
      out.push({ day: d, title: e.label, time: e.time, endTime: e.endTime, color: e.color ?? KIND_COLORS[e.kind], kind: e.kind, location: e.location ?? '', endsAt });
    }
  }
  return out.slice(0, max);
}

const dueLabel = (due: DateStr | null, day: DateStr): string => {
  if (!due) return '';
  const diff = daysBetween(day, due);
  if (diff === 0) return 'Heute';
  if (diff === -1) return 'Gestern';
  if (diff < 0) return `vor ${-diff} Tagen`;
  return parseDate(due).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
};

/** Gehört die offene Aufgabe zu „Heute“? (fällig, überfällig oder für heute eingeplant) */
const isToday = (t: Task, day: DateStr) => !t.someday && ((!!t.due && t.due <= day) || (!!t.plannedFor && t.plannedFor <= day));

/** Aufgaben für heute: offene zuerst (überfällige oben), danach heute erledigte */
export function widgetTasks(tasks: Task[], day: DateStr, max = 8): { tasks: WidgetTask[]; open: number } {
  const open = tasks
    .filter((t) => t.status !== 'erledigt' && isToday(t, day))
    .sort((a, b) => (a.due ?? a.plannedFor ?? '').localeCompare(b.due ?? b.plannedFor ?? '') || (a.order ?? 0) - (b.order ?? 0));
  const done = tasks.filter((t) => t.status === 'erledigt' && t.completedAt === day);
  const list = [...open, ...done].slice(0, max).map((t) => ({
    id: t.id,
    title: t.title,
    done: t.status === 'erledigt',
    overdue: t.status !== 'erledigt' && !!t.due && t.due < day,
    dueLabel: dueLabel(t.due, day),
  }));
  return { tasks: list, open: open.length };
}

/** Was heute im Training dran ist und wie viele Einheiten diese Woche geschafft sind */
export function widgetTraining(data: Pick<Data, 'workouts' | 'trainingPlan'>, day: DateStr): WidgetTraining | null {
  const week = new Set(weekOf(day));
  const thisWeek = data.workouts.filter((w) => week.has(w.date));
  const weekDone = thisWeek.filter((w) => w.done).length;
  const weekGoal = Math.max(thisWeek.length, weekDone);
  const todays = data.workouts.filter((w) => w.date === day);
  const planned = todays.find((w) => !w.done) ?? todays[0];
  if (planned) {
    const plan = data.trainingPlan.find((d) => d.id === planned.planDayId);
    const detail = plan ? plan.exercises.slice(0, 3).map((x) => x.name).join(' · ') : planned.type;
    return { title: planned.title || planned.type, detail, fromPlan: false, doneToday: planned.done, weekDone, weekGoal };
  }
  const next = nextTrainingDay(data.trainingPlan, data.workouts);
  if (!next) return weekGoal > 0 ? { title: 'Kein Training heute', detail: '', fromPlan: false, doneToday: false, weekDone, weekGoal } : null;
  return { title: next.name, detail: next.exercises.slice(0, 3).map((x) => x.name).join(' · '), fromPlan: true, doneToday: false, weekDone, weekGoal };
}

/** Kompletter Stand für alle Widgets */
export function widgetSnapshot(data: Data, entries: CalendarEntry[], now: Date): WidgetSnapshot {
  const day = toDateStr(now);
  const ring = ringDay(data, data.settings.rings ?? defaultRingGoals(), day);
  const { tasks, open } = widgetTasks(listTasks(data.tasks), day);

  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  // Heute schon vorbei? Dann zählt die nächste
  const exam = [...data.exams].filter((e) => e.date > day || (e.date === day && (!e.time || e.time >= hhmm))).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  const trip = [...(data.trips ?? [])].filter((t) => t.start >= day).sort((a, b) => a.start.localeCompare(b.start))[0];

  const month = monthKey(day);
  const finance = data.settings.finance ?? { budget: 0, categoryBudgets: [] };
  const status = budgetStatus(data.transactions, finance, month, day);
  const hasMoney = finance.budget > 0 || data.transactions.some((t) => monthKey(t.date) === month);

  const shoppingOpen = data.shopping.filter((s) => !s.done);
  const shoppingDone = data.shopping.filter((s) => s.done);

  return {
    version: WIDGET_SNAPSHOT_VERSION,
    at: now.getTime(),
    day,
    alarm: widgetAlarm(data.alarms ?? [], now),
    rings: ring.rings.map((r) => ({ label: r.label, share: Math.max(0, r.share), text: r.text, color: r.color, track: r.track })),
    ringsClosed: ring.closed,
    agenda: widgetAgenda(entries, day),
    tasks,
    tasksOpen: open,
    habits: data.habits.map((h) => ({
      id: h.id,
      name: h.name,
      icon: h.icon,
      done: isHabitDone(data.habitLogs, h, day),
      amount: habitAmount(data.habitLogs, h.id, day),
      target: h.target ?? 0,
      unit: h.unit ?? '',
      streak: streak(data.habitLogs, h, day),
    })),
    training: widgetTraining(data, day),
    exam: exam
      ? { kind: 'exam', title: exam.title, date: exam.date, time: exam.time, color: data.courses.find((c) => c.id === exam.courseId)?.color ?? '#FF9500' }
      : null,
    trip: trip ? { kind: 'trip', title: trip.title, date: trip.start, time: '', color: '#34C759' } : null,
    budget: hasMoney
      ? {
          month: parseDate(`${month}-01`).toLocaleDateString('de-DE', { month: 'long' }),
          available: Math.round(status.available * 100) / 100,
          budget: status.budget,
          spent: Math.round(status.spent * 100) / 100,
          perDay: Math.round((Math.max(0, status.available) / (status.daysLeft + 1)) * 100) / 100,
        }
      : null,
    shopping: [...shoppingOpen, ...shoppingDone].slice(0, 12).map((s) => ({ id: s.id, name: s.name, amount: s.amount, done: s.done })),
    shoppingOpen: shoppingOpen.length,
  };
}

/* ---------- Abhaken im Widget ---------- */

/** Eine Aktion aus dem Widget: gewünschter Zustand (nicht „umschalten“), damit doppeltes Übernehmen nichts kaputt macht */
export interface WidgetAction {
  kind: 'task' | 'habit' | 'shopping';
  id: ID;
  done: boolean;
  /** Tag, an dem im Widget getippt wurde (für Gewohnheiten) */
  day: DateStr;
  /** Zeitpunkt (ms) */
  at: number;
}

export type StoreOp =
  | { op: 'update'; collection: 'tasks' | 'shopping' | 'habitLogs'; id: ID; patch: Record<string, unknown> }
  | { op: 'add'; collection: 'habitLogs'; item: { habitId: ID; date: DateStr; amount?: number } }
  | { op: 'remove'; collection: 'habitLogs'; id: ID };

/** Liest die Warteschlange aus dem Speicher – kaputte Einträge fallen weg. */
export function parseWidgetActions(raw: unknown): WidgetAction[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is WidgetAction =>
      !!a && typeof a === 'object' &&
      ['task', 'habit', 'shopping'].includes((a as WidgetAction).kind) &&
      typeof (a as WidgetAction).id === 'string' &&
      typeof (a as WidgetAction).done === 'boolean' &&
      typeof (a as WidgetAction).day === 'string',
  );
}

/**
 * Was die App mit den Aktionen aus dem Widget tun muss. Pro Eintrag zählt nur die letzte Aktion;
 * was schon so ist, wie im Widget gewünscht, bleibt unberührt.
 */
export function resolveWidgetActions(data: Pick<Data, 'tasks' | 'shopping' | 'habits' | 'habitLogs'>, actions: WidgetAction[]): StoreOp[] {
  const last = new Map<string, WidgetAction>();
  for (const a of [...actions].sort((x, y) => x.at - y.at)) last.set(`${a.kind}:${a.id}:${a.kind === 'habit' ? a.day : ''}`, a);
  const ops: StoreOp[] = [];
  for (const a of last.values()) {
    if (a.kind === 'task') {
      const task = data.tasks.find((t) => t.id === a.id);
      if (task && (task.status === 'erledigt') !== a.done) ops.push({ op: 'update', collection: 'tasks', id: a.id, patch: { status: a.done ? 'erledigt' : 'offen' } });
    } else if (a.kind === 'shopping') {
      const item = data.shopping.find((s) => s.id === a.id);
      if (item && item.done !== a.done) ops.push({ op: 'update', collection: 'shopping', id: a.id, patch: { done: a.done } });
    } else {
      const habit = data.habits.find((h) => h.id === a.id);
      if (!habit) continue;
      const log = data.habitLogs.find((l) => l.habitId === a.id && l.date === a.day);
      const done = isHabitDone(data.habitLogs, habit, a.day);
      if (a.done && !done) {
        if (log) ops.push({ op: 'update', collection: 'habitLogs', id: log.id, patch: { amount: habit.target } });
        else ops.push({ op: 'add', collection: 'habitLogs', item: habit.target ? { habitId: a.id, date: a.day, amount: habit.target } : { habitId: a.id, date: a.day } });
      } else if (!a.done && log) {
        ops.push({ op: 'remove', collection: 'habitLogs', id: log.id });
      }
    }
  }
  return ops;
}

/* ---------- Links aus Widgets und Kontrollzentrum ---------- */

export type WidgetLink = { type: 'page'; hash: string } | { type: 'assistant' } | { type: 'focus'; action: 'start' | 'pause' | 'stop' };

/**
 * `antonos://open/kalender` → Seite, `antonos://assistent` → Schnell-Eintrag,
 * `antonos://fokus-start` → Fokus starten, `antonos://fokus-pause` → Pause/Weiter, `antonos://fokus-stop` → Beenden
 * (aus der Live-Aktivität). Andere Adressen (z. B. Spotify) → null.
 */
export function parseWidgetLink(url: string): WidgetLink | null {
  const m = /^antonos:\/\/([^?#]*)/i.exec(url.trim());
  if (!m) return null;
  const path = m[1].split('/').filter(Boolean);
  if (path[0] === 'assistent') return { type: 'assistant' };
  if (path[0] === 'fokus-start') return { type: 'focus', action: 'start' };
  if (path[0] === 'fokus-pause') return { type: 'focus', action: 'pause' };
  if (path[0] === 'fokus-stop') return { type: 'focus', action: 'stop' };
  if (path[0] === 'open') {
    const rest = path.slice(1).filter((p) => /^[\w-]+$/.test(p));
    return { type: 'page', hash: `#/${rest.join('/')}` };
  }
  return null;
}
