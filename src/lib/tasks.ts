import type { DateStr, ID, Task, TaskRepeat } from '../types';
import { addDays, addMonths, parseDate } from './dates';
import { setWhen } from './things';

const open = (t: Task) => t.status !== 'erledigt';

/** Wochentag 1 (Montag) bis 7 (Sonntag) */
const weekday = (d: DateStr) => ((parseDate(d).getDay() + 6) % 7) + 1;

export const WEEKDAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const WEEKDAY_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

/* ---------- Wiederholen ---------- */

/** Nächster Termin der Wiederholung nach `base` (nie `base` selbst) */
export function nextRepeatDate(rule: TaskRepeat, base: DateStr): DateStr {
  switch (rule.freq) {
    case 'taeglich':
      return addDays(base, Math.max(1, rule.interval ?? 1));
    case 'werktags': {
      let d = addDays(base, 1);
      while (weekday(d) > 5) d = addDays(d, 1);
      return d;
    }
    case 'woechentlich': {
      const days = rule.days?.length ? rule.days : [weekday(base)];
      let d = addDays(base, 1);
      for (let i = 0; i < 7 && !days.includes(weekday(d)); i++) d = addDays(d, 1);
      return d;
    }
    case 'zweiwoechentlich':
      return addDays(base, 14);
    case 'monatlich':
      return addMonths(base, 1);
    case 'jaehrlich':
      return addMonths(base, 12);
  }
}

/** Erster passender Tag ab `from` (einschließlich) – für neue Aufgaben ohne Datum */
export function firstRepeatDate(rule: TaskRepeat, from: DateStr): DateStr {
  if (rule.freq === 'werktags' && weekday(from) > 5) return nextRepeatDate(rule, from);
  if (rule.freq === 'woechentlich' && rule.days?.length && !rule.days.includes(weekday(from))) return nextRepeatDate(rule, from);
  return from;
}

/** Kurzer Text wie „Jeden Mo, Do“ oder „Alle 5 Tage nach Erledigung“ */
export function describeTaskRepeat(rule: TaskRepeat, anchor: DateStr | null): string {
  const wd = anchor ? WEEKDAY_LONG[weekday(anchor) - 1] : '';
  let text: string;
  switch (rule.freq) {
    case 'taeglich':
      text = (rule.interval ?? 1) > 1 ? `Alle ${rule.interval} Tage` : 'Täglich';
      break;
    case 'werktags':
      text = 'Werktags';
      break;
    case 'woechentlich':
      text = rule.days?.length
        ? `Jeden ${[...rule.days].sort().map((d) => WEEKDAY_SHORT[d - 1]).join(', ')}`
        : wd ? `Jeden ${wd}` : 'Wöchentlich';
      break;
    case 'zweiwoechentlich':
      text = wd ? `Jeden 2. ${wd}` : 'Alle 2 Wochen';
      break;
    case 'monatlich':
      text = anchor ? `Monatlich am ${Number(anchor.slice(8))}.` : 'Monatlich';
      break;
    case 'jaehrlich':
      text = 'Jährlich';
      break;
  }
  return rule.afterDone ? `${text} nach Erledigung` : text;
}

/** Die nächste Aufgabe einer Wiederholung, wenn `task` an `doneDay` erledigt wird */
export function spawnRepeat(task: Task, doneDay: DateStr): Omit<Task, 'id'> | null {
  const rule = task.repeat;
  if (!rule) return null;
  const anchor = task.due ?? task.plannedFor ?? doneDay;
  let next = nextRepeatDate(rule, rule.afterDone ? doneDay : anchor);
  // Lange überfällig: nicht lauter alte Termine nachholen
  for (let i = 0; i < 1000 && next < doneDay; i++) next = nextRepeatDate(rule, next);
  const { id, completedAt: _done, ...rest } = task;
  return {
    ...rest,
    status: 'offen',
    repeatOf: id,
    due: task.due ? next : null,
    plannedFor: task.due ? null : next,
    someday: false,
    spent: 0,
    subtasks: (task.subtasks ?? []).map((s) => ({ ...s, done: false })),
  };
}

/**
 * Nach einer Änderung an Aufgabe `id`: wurde sie gerade erledigt und wiederholt sich,
 * kommt die nächste dazu; wird sie wieder geöffnet, verschwindet die noch offene Nachfolgerin.
 */
export function repeatTasks(before: Task[], after: Task[], id: ID, day: DateStr, makeId: () => ID): Task[] {
  const prev = before.find((t) => t.id === id);
  const next = after.find((t) => t.id === id);
  if (!prev || !next) return after;
  if (open(prev) && !open(next) && next.repeat && !after.some((t) => t.repeatOf === id)) {
    const spawn = spawnRepeat(next, day);
    if (spawn) return [...after, { ...spawn, id: makeId() }];
  }
  if (!open(prev) && open(next)) return after.filter((t) => !(t.repeatOf === id && open(t)));
  return after;
}

/* ---------- Sortieren, Ziehen, Ablegen ---------- */

const PRIO_RANK = { hoch: 0, mittel: 1, niedrig: 2 } as const;

/** Offene zuerst, dann eigene Reihenfolge, dann Frist, Uhrzeit und Priorität */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (open(a) !== open(b)) return open(a) ? -1 : 1;
    if ((a.order ?? null) !== null || (b.order ?? null) !== null) {
      if (a.order === undefined) return 1;
      if (b.order === undefined) return -1;
      if (a.order !== b.order) return a.order - b.order;
    }
    if (a.due !== b.due) return a.due === null ? 1 : b.due === null ? -1 : a.due.localeCompare(b.due);
    if ((a.dueTime ?? '') !== (b.dueTime ?? '')) return (a.dueTime || '99').localeCompare(b.dueTime || '99');
    return PRIO_RANK[a.priority] - PRIO_RANK[b.priority];
  });
}

/** Verschiebt `id` in der Liste `ids` an Position `to` (gezählt ohne das Element selbst) */
export function moveId(ids: ID[], id: ID, to: number): ID[] {
  const rest = ids.filter((x) => x !== id);
  rest.splice(Math.max(0, Math.min(to, rest.length)), 0, id);
  return rest;
}

/**
 * Was passiert, wenn eine Aufgabe auf ein Ziel gezogen wird:
 * „smart:heute“, „course:<id>“ (leer = ohne Kurs), „list:<id>“, „project:<id>“, „day:<Datum>“.
 */
export function dropPatch(target: string, day: DateStr): Partial<Task> | null {
  const [kind, ...restParts] = target.split(':');
  const value = restParts.join(':');
  switch (kind) {
    case 'smart':
      if (value === 'heute') return setWhen('heute', day);
      if (value === 'irgendwann') return setWhen('irgendwann', day);
      if (value === 'markiert') return { flagged: true };
      return null;
    case 'course':
      return { courseId: value || null, listId: null };
    case 'list':
      return { listId: value, courseId: null };
    case 'project':
      return { projectId: value };
    case 'day':
      return value ? { plannedFor: value, someday: false, evening: false } : null;
    default:
      return null;
  }
}

/* ---------- Heute ---------- */

/** Heute erledigte Aufgaben, die für heute dran waren */
export function doneToday(tasks: Task[], day: DateStr): Task[] {
  return tasks.filter((t) => !open(t) && t.completedAt === day && !t.someday && ((t.due !== null && t.due <= day) || (!!t.plannedFor && t.plannedFor <= day)));
}

/* ---------- Anstehend ---------- */

/** Tag, an dem eine Aufgabe in „Anstehend“ steht: eingeplanter Tag in der Zukunft, sonst die Frist */
export function upcomingDate(t: Task, day: DateStr): DateStr | null {
  if (!open(t) || t.someday) return null;
  if (t.plannedFor && t.plannedFor > day) return t.plannedFor;
  return t.due;
}

export interface UpcomingGroup {
  key: string;
  date: DateStr | null;
  tasks: Task[];
}

/** Nach Tagen gruppiert, Überfälliges zuerst; `extraDays` erscheinen auch ohne Aufgaben (z. B. wegen Terminen) */
export function groupUpcoming(tasks: Task[], day: DateStr, extraDays: DateStr[] = []): UpcomingGroup[] {
  const groups = new Map<string, Task[]>();
  for (const d of extraDays) if (d >= day) groups.set(d, []);
  for (const t of tasks) {
    const date = upcomingDate(t, day);
    if (!date) continue;
    const key = date < day ? 'ueberfaellig' : date;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === 'ueberfaellig' ? -1 : b === 'ueberfaellig' ? 1 : a.localeCompare(b)))
    .map(([key, list]) => ({ key, date: key === 'ueberfaellig' ? null : key, tasks: list }));
}

/* ---------- Suchen, Tags ---------- */

export function matchesQuery(t: Task, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [t.title, t.note ?? '', ...(t.tags ?? []).map((x) => `@${x}`), ...(t.subtasks ?? []).map((s) => s.title)].join(' ').toLowerCase();
  return q.split(/\s+/).every((part) => hay.includes(part));
}

/** Alle Tags der Aufgaben, häufigste zuerst */
export function collectTags(tasks: Task[]): string[] {
  const count = new Map<string, number>();
  for (const t of tasks) for (const tag of t.tags ?? []) count.set(tag, (count.get(tag) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag);
}

/** „zuhause, @pc“ → ['zuhause', 'pc'] */
export function parseTags(text: string): string[] {
  return [...new Set(text.split(/[,\s]+/).map((x) => x.replace(/^[@#]/, '').trim().toLowerCase()).filter(Boolean))];
}

/* ---------- Aufwand ---------- */

/** 45 → „45 min“, 90 → „1 h 30 min“, 120 → „2 h“ */
export function formatMinutes(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/**
 * Freie Minuten im Zeitfenster [from, to) (Minuten seit Mitternacht),
 * abzüglich belegter Blöcke (Überschneidungen zählen nur einmal).
 */
export function freeMinutes(busy: [number, number][], from: number, to: number): number {
  if (to <= from) return 0;
  const blocks = busy
    .map(([s, e]) => [Math.max(s, from), Math.min(e, to)] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  let used = 0;
  let cursor = from;
  for (const [s, e] of blocks) {
    if (e <= cursor) continue;
    used += e - Math.max(s, cursor);
    cursor = e;
  }
  return to - from - used;
}
