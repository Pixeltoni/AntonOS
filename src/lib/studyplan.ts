import type { DateStr, Exam, FocusSession, ID, StudySettings } from '../types';
import { addDays, daysBetween, toDateStr } from './dates';
import { isTimedOn, toMin, fromMin, type CalendarEntry } from './calendar';

export const defaultStudy = (): StudySettings => ({ from: '09:00', to: '20:00', maxPerDay: 180 });

/** Ein geplanter Lernblock */
export interface StudyBlock {
  examId: ID;
  courseId: ID | null;
  day: DateStr;
  start: string;
  end: string;
  minutes: number;
}

export interface StudyStatus {
  examId: ID;
  /** Ziel und bisher gelernte Minuten */
  goal: number;
  done: number;
  /** Minuten im Rückstand gegenüber einem gleichmäßigen Plan (≤ 0 = im Plan) */
  behind: number;
  /** Noch nicht eingeplante Minuten (keine freie Zeit mehr bis zur Prüfung) */
  unplanned: number;
  daysLeft: number;
}

/** Puffer vor und nach Terminen (Minuten) */
const BUFFER = 15;
const MIN_BLOCK = 30;
const MAX_BLOCK = 120;

/** Gelernte Minuten für eine Prüfung: Fokus-Sitzungen des Kurses ab Planbeginn bis vor der Prüfung */
export function studiedFor(exam: Exam, sessions: FocusSession[], from: DateStr): number {
  return sessions
    .filter((s) => s.courseId === exam.courseId && s.date >= from && s.date < exam.date && (s.mode ?? 'lernen') === 'lernen')
    .reduce((sum, s) => sum + s.minutes, 0);
}

const roundUp = (m: number, step: number) => Math.ceil(m / step) * step;

/** Freie Lücken eines Tages im Zeitfenster (Minuten seit Mitternacht) */
export function freeGaps(busy: [number, number][], from: number, to: number): [number, number][] {
  const sorted = busy
    .map(([a, b]) => [Math.max(from, a - BUFFER), Math.min(to, b + BUFFER)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const gaps: [number, number][] = [];
  let cursor = from;
  for (const [a, b] of sorted) {
    if (a > cursor) gaps.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (to > cursor) gaps.push([cursor, to]);
  return gaps.filter(([a, b]) => b - a >= MIN_BLOCK);
}

/** Belegte Zeiten eines Tages aus dem Kalender (Termine, Vorlesungen, Prüfungen mit Uhrzeit) */
function busyOn(entries: CalendarEntry[], day: DateStr): [number, number][] {
  return entries
    .filter((e) => e.kind !== 'task' && !e.done && isTimedOn(e, day))
    .map((e) => {
      const start = toMin(e.time);
      const end = e.endTime ? toMin(e.endTime) : start + 60;
      return [start, end > start ? end : start + 30] as [number, number];
    });
}

/**
 * Verteilt die noch offene Lernzeit jeder Prüfung gleichmäßig auf die Tage bis zur Prüfung –
 * in freie Lücken des Kalenders, mit Puffer um Termine. Wird jeden Tag neu gerechnet:
 * Verpasste Blöcke landen so automatisch auf den übrigen Tagen.
 */
export function planStudy(
  exams: Exam[],
  sessions: FocusSession[],
  entries: CalendarEntry[],
  settings: StudySettings,
  now: Date,
): { blocks: StudyBlock[]; status: StudyStatus[] } {
  const t = toDateStr(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const from = toMin(settings.from);
  const to = toMin(settings.to);
  const blocks: StudyBlock[] = [];
  const status: StudyStatus[] = [];
  const planned = (day: DateStr) => blocks.filter((b) => b.day === day);

  const active = exams.filter((e) => (e.studyHours ?? 0) > 0 && e.date > t).sort((a, b) => a.date.localeCompare(b.date));
  for (const exam of active) {
    const start = exam.planFrom && exam.planFrom <= t ? exam.planFrom : t;
    const goal = Math.round((exam.studyHours ?? 0) * 60);
    const done = studiedFor(exam, sessions, start);
    const doneToday = studiedFor(exam, sessions.filter((s) => s.date === t), t);
    let left = Math.max(0, goal - done);
    const days: DateStr[] = [];
    for (let d = t; d < exam.date; d = addDays(d, 1)) days.push(d);

    days.forEach((day, i) => {
      if (left <= 0) return;
      // Gleichmäßig auf die übrigen Tage verteilen, in halben Stunden
      let quota = Math.min(left, roundUp(left / (days.length - i), MIN_BLOCK));
      const usedToday = planned(day).reduce((s, b) => s + b.minutes, 0) + (day === t ? doneToday : 0);
      quota = Math.min(quota, settings.maxPerDay - usedToday);
      if (quota < MIN_BLOCK) return;
      const busy = [...busyOn(entries, day), ...planned(day).map((b) => [toMin(b.start), toMin(b.end)] as [number, number])];
      if (day === t) busy.push([0, roundUp(nowMin, 15) + BUFFER]);
      for (const [a, b] of freeGaps(busy, from, to)) {
        if (quota < MIN_BLOCK) break;
        let cursor = a;
        while (b - cursor >= MIN_BLOCK && quota >= MIN_BLOCK) {
          const len = Math.min(MAX_BLOCK, quota, Math.floor((b - cursor) / MIN_BLOCK) * MIN_BLOCK);
          blocks.push({ examId: exam.id, courseId: exam.courseId, day, start: fromMin(cursor), end: fromMin(cursor + len), minutes: len });
          quota -= len;
          left -= len;
          cursor += len + BUFFER;
        }
      }
    });

    const span = Math.max(1, daysBetween(start, exam.date));
    const elapsed = Math.max(0, daysBetween(start, t));
    const expected = Math.round((goal * elapsed) / span);
    status.push({ examId: exam.id, goal, done, behind: expected - done, unplanned: Math.max(0, left), daysLeft: daysBetween(t, exam.date) });
  }
  return { blocks, status };
}

/** „im Plan“ oder „2 Std. im Rückstand“ */
export function statusLabel(s: StudyStatus): string {
  if (s.done >= s.goal) return 'Ziel erreicht';
  if (s.behind <= 30) return 'im Plan';
  const h = Math.round(s.behind / 30) / 2;
  return `${h.toLocaleString('de-DE')} Std. im Rückstand`;
}
