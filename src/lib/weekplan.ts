import type { Data, DateStr, FocusMeasure, ID, Priority, Task, Transaction, TrainingDay, WeekFocus, WeekPlan, Workout } from '../types';
import { addDays, daysBetween, isoWeek, parseDate, toDateStr } from './dates';
import { onDay, type CalendarEntry } from './calendar';
import { weekdayOf } from './recurrence';
import { buildDayPlan, taskMinutes, toMin, type PlanSources } from './dayplan';
import { inTaskList } from './tasks';
import { nextTrainingDay } from './training';
import { nextBooking } from './finance';
import { isHabitDone, monthKey } from './life';
import { studiedFor } from './studyplan';
import { isRunning } from './subscriptions';

/* ---------- Welche Woche ---------- */

/** Montag der Woche, in der `day` liegt */
export function mondayOf(day: DateStr): DateStr {
  return addDays(day, 1 - weekdayOf(day));
}

/** Die sieben Tage ab Montag */
export const daysOf = (monday: DateStr): DateStr[] => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

/** Welche Woche geplant wird: samstags und sonntags die nächste, sonst die laufende (jeweils ihr Montag) */
export function planningWeek(t: DateStr): DateStr {
  const monday = mondayOf(t);
  return weekdayOf(t) >= 6 ? addDays(monday, 7) : monday;
}

export const weekNumber = (monday: DateStr): number => isoWeek(parseDate(monday));

const MONTHS_SHORT = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];

/** „16.–22. Nov.“ bzw. über den Monatswechsel „30. Nov. – 6. Dez.“ */
export function weekRange(monday: DateStr): string {
  const a = parseDate(monday);
  const b = parseDate(addDays(monday, 6));
  const month = (d: Date) => MONTHS_SHORT[d.getMonth()];
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}.–${b.getDate()}. ${month(b)}`;
  return `${a.getDate()}. ${month(a)} – ${b.getDate()}. ${month(b)}`;
}

export const planFor = (plans: WeekPlan[] | undefined, monday: DateStr): WeekPlan | undefined => (plans ?? []).find((p) => p.week === monday);

/**
 * Was „Heute“ zur Wochenplanung zeigt: den Plan der laufenden Woche und ob gerade geplant werden sollte –
 * samstags und sonntags die nächste Woche, montags und dienstags die laufende, falls noch offen.
 */
export function weekPrompt(plans: WeekPlan[] | undefined, t: DateStr): { current?: WeekPlan; plan: DateStr | null } {
  const monday = mondayOf(t);
  const next = planningWeek(t);
  const current = planFor(plans, monday);
  const due = next !== monday ? !planFor(plans, next)?.doneAt : weekdayOf(t) <= 2 && !current?.doneAt;
  return { current, plan: due ? next : null };
}

/** Höchstens so viele Wochenziele – mehr ist kein Fokus mehr */
export const MAX_FOCUS = 3;

/* ---------- Aufgaben auf Tage verteilen ---------- */

type TaskLike = Pick<Task, 'id' | 'title' | 'status' | 'someday' | 'plannedFor' | 'plannedTime' | 'due' | 'estimate' | 'priority' | 'flagged' | 'projectId'>;

/** Tag dieser Woche, an dem eine Aufgabe in „Heute“ auftaucht: der eingeplante Tag, sonst die Frist */
export function taskDay(t: TaskLike, days: DateStr[]): DateStr | null {
  if (t.status === 'erledigt' || t.someday) return null;
  if (t.plannedFor) return days.includes(t.plannedFor) ? t.plannedFor : null;
  return t.due && days.includes(t.due) ? t.due : null;
}

const PRIORITY: Record<Priority, number> = { hoch: 0, mittel: 1, niedrig: 2 };

/** Frist zuerst (ohne Frist zuletzt), dann markiert, dann Priorität */
export function byUrgency(a: TaskLike, b: TaskLike): number {
  return (a.due ?? '9999').localeCompare(b.due ?? '9999')
    || Number(!!b.flagged) - Number(!!a.flagged)
    || PRIORITY[a.priority] - PRIORITY[b.priority]
    || a.title.localeCompare(b.title);
}

/**
 * Offene Aufgaben ohne Tag in dieser Woche (keine aus Projekten, nichts für „Irgendwann“
 * und nichts, das bewusst erst für später eingeplant ist) – Wichtiges zuerst.
 */
export function unplannedTasks<T extends TaskLike>(tasks: T[], days: DateStr[]): T[] {
  const end = days[days.length - 1];
  return tasks
    .filter((t) => inTaskList(t) && t.status !== 'erledigt' && !t.someday && !taskDay(t, days) && !(t.plannedFor && t.plannedFor > end))
    .sort(byUrgency);
}

/** Muss diese Woche passieren: Frist bis Sonntag, markiert, hohe Priorität oder ein liegen gebliebener Plan */
export function isPressing(t: TaskLike, days: DateStr[]): boolean {
  const end = days[days.length - 1];
  return (t.due !== null && t.due <= end) || !!t.flagged || t.priority === 'hoch' || (!!t.plannedFor && t.plannedFor < days[0]);
}

export type LoadLevel = 'frei' | 'locker' | 'mittel' | 'voll' | 'zuviel';

export interface DayLoad {
  day: DateStr;
  /** Minuten zwischen Aufstehen und Schlafenszeit */
  awake: number;
  /** Termine, Vorlesungen, Essen und alles mit Uhrzeit */
  fixed: number;
  /** Aufgaben und Trainings ohne Uhrzeit */
  planned: number;
  /** Freie Zeit, die nach allem bleibt */
  free: number;
  /** Zeit, die für weitere Aufgaben noch vernünftig ist */
  room: number;
  /** Anteil der wachen Zeit, der verplant ist */
  share: number;
  level: LoadLevel;
  /** Anzahl Aufgaben an dem Tag */
  tasks: number;
}

/** Höchstens dieser Teil der freien Zeit wird mit Aufgaben gefüllt – der Rest bleibt Puffer und Freizeit */
export const TASK_SHARE = 0.45;

export function loadLevel(share: number): LoadLevel {
  if (share < 0.15) return 'frei';
  if (share < 0.35) return 'locker';
  if (share < 0.55) return 'mittel';
  if (share < 0.8) return 'voll';
  return 'zuviel';
}

export const LOAD_LABELS: Record<LoadLevel, string> = { frei: 'frei', locker: 'locker', mittel: 'gut gefüllt', voll: 'voll', zuviel: 'zu viel' };

/** Auslastung je Tag: feste Termine aus der Zeitleiste plus alles, was ohne Uhrzeit für den Tag geplant ist */
export function weekLoads(src: PlanSources, entries: CalendarEntry[], days: DateStr[]): DayLoad[] {
  const tasks = src.tasks.filter((t) => inTaskList(t) && t.status !== 'erledigt');
  return days.map((day) => {
    const timed = tasks.filter((t) => t.plannedTime && t.plannedFor === day);
    const plan = buildDayPlan({ ...src, tasks: timed }, entries, day);
    const loose = tasks.filter((t) => taskDay(t, days) === day && !(t.plannedTime && t.plannedFor === day));
    const planned = plan.openMinutes + loose.reduce((s, t) => s + taskMinutes(t), 0);
    const awake = Math.max(1, plan.sleep - plan.wake);
    const share = (plan.busy + planned) / awake;
    return {
      day,
      awake,
      fixed: plan.busy,
      planned,
      free: Math.max(0, plan.free - planned),
      room: Math.max(0, Math.round(plan.free * TASK_SHARE) - planned),
      share,
      level: loadLevel(share),
      tasks: timed.length + loose.length,
    };
  });
}

export interface Placement {
  taskId: ID;
  day: DateStr;
}

/**
 * Verteilt Aufgaben auf die Woche: dringende zuerst, jeweils auf den Tag mit dem meisten Platz –
 * möglichst vor dem Abgabetag (ein Tag Puffer), Überfälliges so früh wie möglich. Mit `keepWeekend`
 * bleiben Samstag und Sonntag frei, außer eine Frist lässt keinen anderen Tag zu. Was ohne Frist nicht
 * mehr passt, bleibt übrig; Aufgaben in `onlyEarly` werden nur vor ihrer Frist eingeplant, sonst gar nicht.
 */
export function distribute(
  tasks: TaskLike[],
  loads: Pick<DayLoad, 'day' | 'room'>[],
  opts: { from: DateStr; keepWeekend?: boolean; onlyEarly?: ID[] },
): { placed: Placement[]; left: ID[] } {
  const room = new Map(loads.map((l) => [l.day, l.room]));
  const days = loads.map((l) => l.day).filter((d) => d >= opts.from);
  const end = loads[loads.length - 1]?.day ?? opts.from;
  const onlyEarly = new Set(opts.onlyEarly ?? []);
  const placed: Placement[] = [];
  const left: ID[] = [];
  const most = (pool: DateStr[]) => pool.reduce((best, d) => (room.get(d)! > room.get(best)! ? d : best), pool[0]);
  const workdaysFirst = (list: DateStr[]) => {
    const work = opts.keepWeekend ? list.filter((d) => weekdayOf(d) <= 5) : list;
    return work.length ? work : list;
  };
  for (const t of [...tasks].sort(byUrgency)) {
    const m = taskMinutes(t);
    const overdue = t.due !== null && t.due < opts.from;
    const window = overdue || !t.due ? days : days.filter((d) => d <= t.due!);
    const early = t.due && !overdue ? window.filter((d) => d < t.due!) : window;
    const pools = (onlyEarly.has(t.id) ? [early] : early.length < window.length ? [early, window] : [window]).filter((p) => p.length).map(workdaysFirst);
    let pick: DateStr | undefined;
    for (const pool of pools) {
      const fits = pool.filter((d) => room.get(d)! >= m);
      if (fits.length) {
        pick = overdue ? fits[0] : most(fits);
        break;
      }
    }
    const must = t.due !== null && t.due <= end && !onlyEarly.has(t.id);
    if (!pick && must && pools.length) {
      const last = pools[pools.length - 1];
      pick = overdue ? last[0] : most(last);
    }
    if (!pick) {
      left.push(t.id);
      continue;
    }
    room.set(pick, room.get(pick)! - m);
    placed.push({ taskId: t.id, day: pick });
  }
  return { placed, left };
}

/** Ab dieser Dauer lohnt es sich, eine Aufgabe vor ihrem Abgabetag einzuplanen */
export const AHEAD_MINUTES = 60;

/** Große Aufgaben mit Frist in dieser Woche, aber ohne eingeplanten Tag – stehen sonst erst am Abgabetag da */
export function aheadTasks<T extends TaskLike>(tasks: T[], days: DateStr[], from: DateStr): T[] {
  return tasks.filter((t) => inTaskList(t) && t.status !== 'erledigt' && !t.someday && !t.plannedFor && t.due !== null && t.due > from && days.includes(t.due) && taskMinutes(t) >= AHEAD_MINUTES);
}

/**
 * „Verteilen“-Knopf: Dringendes ohne Tag und große Aufgaben, die sonst erst am Abgabetag dastehen.
 * Die großen zählen bisher an ihrem Abgabetag – diese Zeit wird dort für die Rechnung wieder frei.
 */
export function autoPlan(tasks: TaskLike[], loads: Pick<DayLoad, 'day' | 'room'>[], days: DateStr[], opts: { from: DateStr; keepWeekend?: boolean }): { placed: Placement[]; left: ID[] } {
  const pressing = unplannedTasks(tasks, days).filter((t) => isPressing(t, days));
  const ahead = aheadTasks(tasks, days, opts.from);
  const freed = loads.map((l) => ({ day: l.day, room: l.room + ahead.filter((t) => t.due === l.day).reduce((s, t) => s + taskMinutes(t), 0) }));
  const result = distribute([...pressing, ...ahead], freed, { ...opts, onlyEarly: ahead.map((t) => t.id) });
  // Große Aufgaben, die nicht früher passen, bleiben einfach an ihrem Abgabetag – das ist kein „übrig“
  return { placed: result.placed, left: result.left.filter((id) => !ahead.some((t) => t.id === id)) };
}

/* ---------- Termine ---------- */

/** Was im Kalender zählt (ohne Aufgaben und Lernblöcke, die sich um Termine herum legen) */
export const isAppointment = (e: CalendarEntry) => e.kind !== 'task' && e.kind !== 'study';

export interface Clash {
  day: DateStr;
  a: string;
  b: string;
  time: string;
}

/** Termine mit Uhrzeit, die sich am selben Tag überschneiden */
export function clashes(entries: CalendarEntry[], days: DateStr[]): Clash[] {
  const out: Clash[] = [];
  for (const day of days) {
    const list = entries
      .filter((e) => e.time && isAppointment(e) && e.kind !== 'birthday' && e.kind !== 'trip' && e.kind !== 'project' && !e.done && onDay(e, day))
      .map((e) => {
        const start = toMin(e.time);
        const end = e.endTime && toMin(e.endTime) > start ? toMin(e.endTime) : start + (e.kind === 'exam' ? 120 : 60);
        return { e, start, end };
      })
      .sort((x, y) => x.start - y.start);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length && list[j].start < list[i].end; j++) {
        out.push({ day, a: list[i].e.label, b: list[j].e.label, time: list[j].e.time });
      }
    }
  }
  return out;
}

/* ---------- Wochenziele ---------- */

export type FocusSources = Pick<Data, 'workouts' | 'habits' | 'habitLogs' | 'sessions'>;

export interface FocusState {
  done: boolean;
  /** 0–1 */
  share: number;
  /** z. B. „2 / 3“ oder „1:30 / 4 Std.“, ohne Messung leer */
  text: string;
}

const hoursText = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}:${String(m).padStart(2, '0')}` : String(h);
};

/** Gemessener Stand eines Wochenziels in der Woche ab `monday` */
export function measureFocus(measure: FocusMeasure, src: FocusSources, monday: DateStr): number {
  const days = daysOf(monday);
  const inWeek = (d: DateStr) => d >= days[0] && d <= days[6];
  if (measure.kind === 'training') return src.workouts.filter((w) => w.done && inWeek(w.date)).length;
  if (measure.kind === 'gewohnheit') {
    const habit = src.habits.find((h) => h.id === measure.refId);
    return habit ? days.filter((d) => isHabitDone(src.habitLogs, habit, d)).length : 0;
  }
  return src.sessions
    .filter((s) => inWeek(s.date) && (s.mode ?? 'lernen') === 'lernen' && (!measure.refId || s.courseId === measure.refId))
    .reduce((sum, s) => sum + s.minutes, 0);
}

export function focusState(f: Pick<WeekFocus, 'done' | 'measure'>, src: FocusSources, monday: DateStr): FocusState {
  if (!f.measure || !(f.measure.target > 0)) return { done: f.done, share: f.done ? 1 : 0, text: '' };
  const current = measureFocus(f.measure, src, monday);
  const target = f.measure.target;
  const reached = current >= target;
  const text = f.measure.kind === 'lernen' ? `${hoursText(current)} / ${hoursText(target)} Std.` : `${current} / ${target}`;
  return { done: f.done || reached, share: f.done ? 1 : Math.min(1, current / target), text };
}

export interface FocusSuggestion extends Omit<WeekFocus, 'id' | 'done'> {
  key: string;
  /** Woher der Vorschlag kommt, z. B. „Klausur am Do“ */
  hint: string;
}

export type SuggestionSources = FocusSources & Pick<Data, 'exams' | 'courses' | 'tasks' | 'goals' | 'projects' | 'pots' | 'weekPlans'>;

const shortDay = (d: DateStr) => parseDate(d).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** Lernzeit pro Woche bis zu einer Prüfung: Rest des Lernplans gleichmäßig verteilt, sonst nach Nähe */
export function weeklyStudyMinutes(exam: Data['exams'][number], sessions: Data['sessions'], monday: DateStr): number {
  const weeks = Math.max(1, Math.ceil((daysBetween(monday, exam.date) + 1) / 7));
  if (exam.studyHours && exam.studyHours > 0) {
    const from = exam.planFrom ?? addDays(exam.date, -28);
    const rest = Math.max(0, exam.studyHours * 60 - studiedFor(exam, sessions, from));
    return Math.max(60, roundTo(rest / weeks, 30));
  }
  return weeks <= 2 ? 240 : 120;
}

/**
 * Vorschläge für die Wochenziele: Offenes von letzter Woche, Lernen für nahe Prüfungen,
 * ein Schritt je eigenem Ziel, wichtige Aufgaben und Projekte mit naher Frist.
 */
export function focusSuggestions(src: SuggestionSources, monday: DateStr): FocusSuggestion[] {
  const days = daysOf(monday);
  const end = days[6];
  const out: FocusSuggestion[] = [];
  const seen = new Set<string>();
  const push = (s: FocusSuggestion) => {
    const id = s.measure ? `${s.measure.kind}:${s.measure.refId ?? ''}` : s.text.toLowerCase();
    if (seen.has(id) || seen.has(s.text.toLowerCase())) return;
    seen.add(id);
    seen.add(s.text.toLowerCase());
    out.push(s);
  };

  const last = planFor(src.weekPlans, addDays(monday, -7));
  for (const f of last?.focus ?? []) {
    if (focusState(f, src, last!.week).done) continue;
    push({ key: `alt-${f.id}`, text: f.text, icon: f.icon, measure: f.measure, goalId: f.goalId, hint: 'Von letzter Woche' });
  }

  const course = (id: ID | null | undefined) => src.courses.find((c) => c.id === id);
  for (const exam of [...src.exams].filter((e) => e.date >= monday && e.date <= addDays(monday, 20)).sort((a, b) => a.date.localeCompare(b.date))) {
    const minutes = weeklyStudyMinutes(exam, src.sessions, monday);
    const name = course(exam.courseId)?.name ?? exam.title;
    push({
      key: `exam-${exam.id}`,
      icon: '📚',
      text: `${hoursText(minutes)} Std. für ${name} lernen`,
      measure: { kind: 'lernen', refId: exam.courseId, target: minutes },
      hint: `${exam.title} am ${shortDay(exam.date)}`,
    });
  }

  for (const goal of src.goals) {
    for (const r of goal.results ?? []) {
      const base = { goalId: goal.id, hint: goal.title };
      if (r.kind === 'training' && r.target) {
        push({ ...base, key: `goal-${r.id}`, icon: '🏋️', text: `${r.target}× trainieren`, measure: { kind: 'training', target: r.target } });
      } else if (r.kind === 'gewohnheit' && r.target) {
        const h = src.habits.find((x) => x.id === r.refId);
        if (h) push({ ...base, key: `goal-${r.id}`, icon: h.icon, text: `${h.name} an ${r.target} Tagen`, measure: { kind: 'gewohnheit', refId: h.id, target: Math.min(7, r.target) } });
      } else if ((r.kind === 'note' || r.kind === 'karten') && course(r.refId)) {
        push({ ...base, key: `goal-${r.id}`, icon: '📚', text: `3 Std. für ${course(r.refId)!.name} lernen`, measure: { kind: 'lernen', refId: r.refId, target: 180 } });
      } else if (r.kind === 'spartopf') {
        const p = src.pots.find((x) => x.id === r.refId);
        if (p && p.saved < p.target) push({ ...base, key: `goal-${r.id}`, icon: p.icon || '🐷', text: `Etwas für „${p.name}“ zurücklegen` });
      } else if (r.kind === 'projekt') {
        const p = src.projects.find((x) => x.id === r.refId);
        if (p && p.status !== 'abgeschlossen') push({ ...base, key: `goal-${r.id}`, icon: '🚀', text: `„${p.title}“ voranbringen` });
      }
    }
  }

  for (const t of src.tasks.filter((x) => inTaskList(x) && x.status !== 'erledigt' && !x.someday && x.due !== null && x.due <= end && (x.priority === 'hoch' || x.flagged)).sort(byUrgency).slice(0, 3)) {
    push({ key: `task-${t.id}`, icon: '✅', text: t.title, hint: t.due! < monday ? 'Überfällig' : `Frist ${shortDay(t.due!)}` });
  }

  for (const p of src.projects.filter((x) => x.status !== 'abgeschlossen' && x.status !== 'pausiert' && x.due && x.due >= monday && x.due <= addDays(monday, 13))) {
    push({ key: `projekt-${p.id}`, icon: '🚀', text: `„${p.title}“ fertig machen`, hint: `Frist ${shortDay(p.due!)}` });
  }
  return out.slice(0, 8);
}

/* ---------- Training ---------- */

/** Wie viele Trainings die Woche haben soll: das höchste Wochenziel aus „Ziele“, sonst 3 */
export function trainingTarget(goals: Data['goals']): number {
  const targets = goals.flatMap((g) => (g.results ?? []).filter((r) => r.kind === 'training' && r.target).map((r) => r.target!));
  return targets.length ? Math.max(...targets) : 3;
}

/**
 * Welcher Tag des Trainingsplans an den Daten `dates` dran wäre – geplante Trainings davor
 * zählen schon als gemacht, damit die Reihenfolge (Push, Pull, Beine …) weiterläuft.
 */
export function rotationFor(allDays: TrainingDay[], workouts: Pick<Workout, 'done' | 'planDayId' | 'date'>[], dates: DateStr[]): (TrainingDay | null)[] {
  const sim = workouts.filter((w) => w.done).map((w) => ({ done: true, planDayId: w.planDayId, date: w.date }));
  return [...dates].sort().map((date) => {
    const pick = nextTrainingDay(allDays, sim);
    if (pick) sim.push({ done: true, planDayId: pick.id, date });
    return pick;
  });
}

/* ---------- Budget ---------- */

/** Ausgaben für den Alltag: ohne feste Zahlungen (Miete, Abos), Sparen und Reisen mit eigenem Budget */
export const isEverydaySpend = (tx: Transaction): boolean => tx.type === 'Ausgabe' && !tx.id.startsWith('rec-') && !tx.potId && !tx.tripId && tx.category !== 'Sparen';

export function spentBetween(txs: Transaction[], from: DateStr, to: DateStr): number {
  return txs.filter((tx) => isEverydaySpend(tx) && tx.date >= from && tx.date <= to).reduce((s, tx) => s + tx.amount, 0);
}

export interface FixedPayment {
  id: ID;
  description: string;
  amount: number;
  date: DateStr;
}

export interface BudgetPlan {
  /** Vorschlag für die Woche in Euro (auf 5 € gerundet) */
  suggestion: number;
  /** monat = aus dem Monatsbudget, schnitt = wie in den letzten vier Wochen, keins = nichts zum Rechnen */
  basis: 'monat' | 'schnitt' | 'keins';
  monthBudget: number;
  /** Bisherige Ausgaben im Monat (alle, wie beim Monatsbudget) */
  monthSpent: number;
  /** Feste Zahlungen, die bis Monatsende noch kommen */
  fixedLeft: number;
  /** Tage ab Wochenbeginn (bzw. heute) bis Monatsende */
  daysLeft: number;
  /** Alltagsausgaben pro Woche im Schnitt der letzten vier Wochen */
  average: number;
  /** Feste Zahlungen, die in dieser Woche abgebucht werden */
  fixedWeek: FixedPayment[];
}

const round5 = (n: number) => Math.max(0, Math.round(n / 5) * 5);

function monthEnd(key: string): DateStr {
  const [y, m] = key.split('-').map(Number);
  return toDateStr(new Date(y, m, 0));
}

/** Wochenbudget-Vorschlag: was vom Monatsbudget nach festen Zahlungen bleibt, auf die restlichen Tage verteilt */
export function budgetPlan(src: Pick<Data, 'transactions' | 'recurring' | 'settings'>, monday: DateStr, t: DateStr): BudgetPlan {
  const from = monday > t ? monday : t;
  const key = monthKey(from);
  const last = monthEnd(key);
  const first = `${key}-01`;
  const monthBudget = src.settings.finance?.budget ?? 0;
  const monthSpent = src.transactions.filter((tx) => tx.type === 'Ausgabe' && monthKey(tx.date) === key && tx.date < from).reduce((s, tx) => s + tx.amount, 0);
  const expenses = src.recurring.filter((r) => r.type === 'Ausgabe' && r.amount > 0 && isRunning(r, from));
  let fixedLeft = 0;
  const since = t > first ? t : first;
  for (const r of expenses) {
    const next = nextBooking(r, since);
    if (next && next >= since && next <= last && !src.transactions.some((tx) => tx.id === `rec-${r.id}-${key}`)) fixedLeft += r.amount;
  }
  const sunday = addDays(monday, 6);
  const fixedWeek: FixedPayment[] = [];
  for (const r of expenses) {
    const next = nextBooking(r, monday);
    if (next && next >= monday && next <= sunday) fixedWeek.push({ id: r.id, description: r.description, amount: r.amount, date: next });
  }
  fixedWeek.sort((a, b) => a.date.localeCompare(b.date));
  const daysLeft = daysBetween(from, last) + 1;
  const average = spentBetween(src.transactions, addDays(from, -28), addDays(from, -1)) / 4;
  let suggestion = 0;
  let basis: BudgetPlan['basis'] = 'keins';
  if (monthBudget > 0) {
    basis = 'monat';
    suggestion = round5((Math.max(0, monthBudget - monthSpent - fixedLeft) / Math.max(1, daysLeft)) * 7);
  } else if (average > 0) {
    basis = 'schnitt';
    suggestion = round5(average);
  }
  return { suggestion, basis, monthBudget, monthSpent, fixedLeft, daysLeft, average, fixedWeek };
}
