/**
 * „Mein Tag als Zeitleiste“: alles mit Uhrzeit an einem Tag (Termine, Vorlesungen, Lernblöcke,
 * Training, Essen, eingeplante Aufgaben) vom Wecker bis zur Schlafenszeit, dazu die freien Lücken
 * und was für heute noch ohne Uhrzeit ist. Die Wochenplanung nutzt dieselbe Rechnung für die Auslastung.
 */
import type { Alarm, Data, DateStr, ID, SleepSettings, Task } from '../types';
import { addDays, parseDate, toDateStr } from './dates';
import { bedtimeFor, defaultSleep, nextRings } from './alarm';
import { onDay, type CalendarEntry } from './calendar';
import { inToday } from './things';

/** „07:30“ → 450 */
export const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** 450 → „07:30“ (auch über Mitternacht hinaus: 1470 → „00:30“) */
export const toHHMM = (min: number): string => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** „1 Std. 30 Min.“ bzw. „45 Min.“ */
export function minutesLabel(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} Min.`;
  return `${Math.floor(m / 60)} Std.${m % 60 ? ` ${m % 60} Min.` : ''}`;
}

/** Auf `step` Minuten runden (nach oben bzw. auf das Nächste) */
export const ceilTo = (min: number, step = 5) => Math.ceil(min / step) * step;
export const snapTo = (min: number, step = 15) => Math.round(min / step) * step;

export const DEFAULT_WAKE = 7 * 60 + 30;
export const DEFAULT_SLEEP = 23 * 60;
/** Ohne Schätzung plant eine Aufgabe so viele Minuten ein */
export const DEFAULT_TASK_MINUTES = 30;
export const DEFAULT_TRAINING_MINUTES = 60;
/** Kürzere Lücken zählen nicht als frei */
export const MIN_GAP = 15;

/** Essen ohne Uhrzeit: übliche Zeiten */
export const MEAL_TIMES: Record<string, [number, number]> = { mittag: [12 * 60 + 30, 13 * 60 + 15], abend: [18 * 60 + 30, 19 * 60 + 15] };

export type PlanKind = 'event' | 'lecture' | 'exam' | 'study' | 'training' | 'meal' | 'task';

export const PLAN_COLORS: Record<PlanKind, string> = {
  event: '#007AFF',
  lecture: '#5856D6',
  exam: '#FF3B30',
  study: '#30B0C7',
  training: '#34C759',
  meal: '#FF9500',
  task: '#8E8E93',
};

export interface PlanBlock {
  key: string;
  kind: PlanKind;
  title: string;
  /** Minuten seit Mitternacht */
  start: number;
  end: number;
  color: string;
  href?: string;
  /** Eingeplante Aufgabe bzw. eingeplantes Training (lässt sich verschieben oder herausnehmen) */
  taskId?: ID;
  workoutId?: ID;
  done?: boolean;
  detail?: string;
  /** Spalte bei Überschneidungen und Zahl der Spalten in der Gruppe */
  lane: number;
  lanes: number;
}

/** Für den Tag dran, aber noch ohne Uhrzeit */
export interface PlanItem {
  kind: 'task' | 'training';
  id: ID;
  title: string;
  minutes: number;
  /** Dauer geschätzt (sonst Standard) */
  estimated: boolean;
  color: string;
}

export interface Gap {
  start: number;
  end: number;
}

export interface DayPlan {
  day: DateStr;
  wake: number;
  sleep: number;
  wakeFromAlarm: boolean;
  sleepFromAlarm: boolean;
  blocks: PlanBlock[];
  gaps: Gap[];
  open: PlanItem[];
  /** Verplante Minuten zwischen Wecker und Schlafenszeit (Überschneidungen einmal gezählt) */
  busy: number;
  /** Freie Minuten in Lücken ab `MIN_GAP` */
  free: number;
  /** Minuten der offenen Aufgaben und Trainings ohne Uhrzeit */
  openMinutes: number;
}

export type PlanSources = Pick<Data, 'tasks' | 'workouts' | 'meals' | 'alarms' | 'recipes'> & { settings: { sleep?: SleepSettings } };

/** Erster Wecker an `day` (Minuten) */
export function wakeOn(alarms: Alarm[], day: DateStr): number | null {
  const start = parseDate(day);
  start.setMilliseconds(-1);
  let best: number | null = null;
  for (const a of alarms) {
    for (const ring of nextRings(a, start, 2)) {
      if (toDateStr(ring) !== day) continue;
      const m = ring.getHours() * 60 + ring.getMinutes();
      if (best === null || m < best) best = m;
    }
  }
  return best;
}

/** Schlafenszeit am Abend von `day`, damit es bis zum Wecker am nächsten Morgen reicht (Minuten, nach Mitternacht über 1440) */
export function sleepOn(alarms: Alarm[], sleep: SleepSettings, day: DateStr): number | null {
  const next = addDays(day, 1);
  const wake = wakeOn(alarms, next);
  if (wake === null) return null;
  const ring = parseDate(next);
  ring.setHours(Math.floor(wake / 60), wake % 60, 0, 0);
  const bed = bedtimeFor(ring, sleep.goal);
  const m = bed.getHours() * 60 + bed.getMinutes();
  // Vor Mitternacht am selben Abend, sonst danach
  return toDateStr(bed) === day ? m : 1440 + m;
}

/** Spalten für sich überschneidende Blöcke */
function assignLanes(list: Omit<PlanBlock, 'lane' | 'lanes'>[]): PlanBlock[] {
  const sorted = [...list].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: PlanBlock[] = [];
  let group: PlanBlock[] = [];
  let groupEnd = -1;
  let laneEnds: number[] = [];
  const close = () => {
    const lanes = Math.max(1, laneEnds.length);
    group.forEach((b) => (b.lanes = lanes));
    out.push(...group);
    group = [];
    laneEnds = [];
  };
  for (const b of sorted) {
    if (group.length && b.start >= groupEnd) close();
    let lane = laneEnds.findIndex((end) => end <= b.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(b.end);
    } else laneEnds[lane] = b.end;
    group.push({ ...b, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, b.end);
  }
  close();
  return out;
}

/** Freie Lücken zwischen `from` und `to` (ab `MIN_GAP` Minuten) */
export function findGaps(blocks: Pick<PlanBlock, 'start' | 'end'>[], from: number, to: number): Gap[] {
  const busy = blocks.map((b) => [Math.max(from, b.start), Math.min(to, b.end)] as const).filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  const gaps: Gap[] = [];
  let cursor = from;
  for (const [s, e] of busy) {
    if (s - cursor >= MIN_GAP) gaps.push({ start: cursor, end: s });
    cursor = Math.max(cursor, e);
  }
  if (to - cursor >= MIN_GAP) gaps.push({ start: cursor, end: to });
  return gaps;
}

const taskMinutes = (t: Pick<Task, 'estimate'>) => (t.estimate && t.estimate > 0 ? t.estimate : DEFAULT_TASK_MINUTES);

/** Der ganze Tag als Zeitleiste. `entries` = Kalendereinträge (mit Lernplan), wie `useCalendarEntries` sie liefert. */
export function buildDayPlan(src: PlanSources, entries: CalendarEntry[], day: DateStr): DayPlan {
  const raw: Omit<PlanBlock, 'lane' | 'lanes'>[] = [];
  for (const e of entries) {
    if (!e.time || e.kind === 'task' || e.kind === 'birthday' || e.kind === 'trip' || e.kind === 'project' || !onDay(e, day)) continue;
    const start = toMin(e.time);
    const endRaw = e.endTime ? toMin(e.endTime) : start + (e.kind === 'exam' ? 120 : 60);
    const kind: PlanKind = e.kind;
    raw.push({ key: e.key, kind, title: e.label, start, end: endRaw > start ? endRaw : start + 30, color: e.color ?? PLAN_COLORS[kind], href: e.href, done: e.done, detail: e.location || e.note });
  }
  const open: PlanItem[] = [];
  for (const w of src.workouts) {
    if (w.date !== day) continue;
    const minutes = w.minutes && w.minutes > 0 ? w.minutes : DEFAULT_TRAINING_MINUTES;
    if (w.time) {
      const start = toMin(w.time);
      raw.push({ key: `w-${w.id}`, kind: 'training', title: w.title || w.type, start, end: start + minutes, color: PLAN_COLORS.training, href: '#/training', workoutId: w.id, done: w.done, detail: w.type });
    } else if (!w.done) {
      open.push({ kind: 'training', id: w.id, title: w.title || w.type, minutes, estimated: !!w.minutes, color: PLAN_COLORS.training });
    }
  }
  for (const m of src.meals) {
    const slot = MEAL_TIMES[m.slot];
    if (m.date !== day || !slot) continue;
    const recipe = m.recipeId ? src.recipes.find((r) => r.id === m.recipeId) : undefined;
    raw.push({ key: `m-${m.id}`, kind: 'meal', title: recipe?.title || m.title || (m.slot === 'mittag' ? 'Mittagessen' : 'Abendessen'), start: slot[0], end: slot[1], color: PLAN_COLORS.meal, href: '#/essen', detail: m.slot === 'mittag' ? 'Mittag' : 'Abend' });
  }
  for (const t of src.tasks) {
    if (t.plannedTime && t.plannedFor === day) {
      const start = toMin(t.plannedTime);
      raw.push({ key: `t-${t.id}`, kind: 'task', title: t.title, start, end: start + taskMinutes(t), color: PLAN_COLORS.task, href: '#/aufgaben', taskId: t.id, done: t.status === 'erledigt' });
    } else if (t.status !== 'erledigt' && inToday(t, day) && !(t.plannedTime && t.plannedFor && t.plannedFor > day)) {
      open.push({ kind: 'task', id: t.id, title: t.title, minutes: taskMinutes(t), estimated: !!t.estimate, color: PLAN_COLORS.task });
    }
  }

  const alarmWake = wakeOn(src.alarms ?? [], day);
  const alarmSleep = sleepOn(src.alarms ?? [], src.settings.sleep ?? defaultSleep(), day);
  const earliest = Math.min(...raw.map((b) => b.start), Infinity);
  const latest = Math.max(...raw.map((b) => b.end), -Infinity);
  let wake = alarmWake ?? DEFAULT_WAKE;
  let sleep = alarmSleep ?? DEFAULT_SLEEP;
  if (sleep - wake < 6 * 60) sleep = wake + 16 * 60;
  // Was vor dem Wecker oder nach der Schlafenszeit liegt, verlängert die Zeitleiste
  if (earliest < wake) wake = Math.floor(earliest / 30) * 30;
  if (latest > sleep) sleep = Math.ceil(latest / 30) * 30;

  const blocks = assignLanes(raw);
  const gaps = findGaps(blocks, wake, sleep);
  const free = gaps.reduce((s, g) => s + g.end - g.start, 0);
  return {
    day,
    wake,
    sleep,
    wakeFromAlarm: alarmWake !== null,
    sleepFromAlarm: alarmSleep !== null,
    blocks,
    gaps,
    open: open.sort((a, b) => a.minutes - b.minutes),
    busy: busyMinutes(blocks, wake, sleep),
    free,
    openMinutes: open.reduce((s, o) => s + o.minutes, 0),
  };
}

/** Verplante Minuten zwischen `from` und `to`, Überschneidungen nur einmal */
export function busyMinutes(blocks: Pick<PlanBlock, 'start' | 'end'>[], from: number, to: number): number {
  const list = blocks.map((b) => [Math.max(from, b.start), Math.min(to, b.end)] as const).filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cursor = from;
  for (const [s, e] of list) {
    const begin = Math.max(s, cursor);
    if (e > begin) {
      total += e - begin;
      cursor = e;
    }
  }
  return total;
}

/** Erste Lücke ab `from`, in die `minutes` passen – Startzeit auf 5 Minuten gerundet, sonst null */
export function findSlot(plan: Pick<DayPlan, 'gaps'>, minutes: number, from: number): number | null {
  for (const g of plan.gaps) {
    const start = ceilTo(Math.max(g.start, from), 5);
    if (g.end - start >= minutes) return start;
  }
  return null;
}
