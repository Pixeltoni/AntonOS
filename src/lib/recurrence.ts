import type { Course, CourseSlot, DateStr, Recurrence, RepeatFreq } from '../types';
import { addDays, daysBetween, parseDate } from './dates';

export const REPEAT_LABELS: Record<RepeatFreq, string> = {
  taeglich: 'Täglich',
  woechentlich: 'Wöchentlich',
  zweiwoechentlich: 'Alle 2 Wochen',
  monatlich: 'Monatlich',
  jaehrlich: 'Jährlich',
};

export const WEEKDAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

/** Beginnt an `day` ein Vorkommen der Serie, die am `start` angefangen hat? */
export function startsOn(rule: Recurrence, start: DateStr, day: DateStr): boolean {
  if (day < start) return false;
  if (rule.until && day > rule.until) return false;
  if (rule.except?.includes(day)) return false;
  const diff = daysBetween(start, day);
  switch (rule.freq) {
    case 'taeglich':
      return true;
    case 'woechentlich':
      return diff % 7 === 0;
    case 'zweiwoechentlich':
      return diff % 14 === 0;
    case 'monatlich':
      return day.slice(8) === start.slice(8);
    case 'jaehrlich':
      return day.slice(5) === start.slice(5);
  }
}

/**
 * Liegt `day` in einem Vorkommen? Mehrtägige Serien (z. B. Freitag bis Sonntag) zählen
 * an jedem Tag ihrer Dauer.
 */
export function occursOn(rule: Recurrence, start: DateStr, end: DateStr, day: DateStr): boolean {
  const span = Math.max(0, daysBetween(start, end));
  for (let k = 0; k <= span; k++) if (startsOn(rule, start, addDays(day, -k))) return true;
  return false;
}

/** Nächstes Vorkommen ab `from` (einschließlich), höchstens zwei Jahre voraus */
export function nextOccurrence(rule: Recurrence, start: DateStr, from: DateStr): DateStr | null {
  let d = from < start ? start : from;
  for (let i = 0; i < 740; i++, d = addDays(d, 1)) {
    if (rule.until && d > rule.until) return null;
    if (startsOn(rule, start, d)) return d;
  }
  return null;
}

/** Wochentag 1 (Montag) bis 7 (Sonntag) */
export const weekdayOf = (d: DateStr) => ((parseDate(d).getDay() + 6) % 7) + 1;

/** Erster Tag ab `from`, der auf den Wochentag `day` (1–7) fällt */
export function firstWeekday(from: DateStr, day: number): DateStr {
  return addDays(from, (day - weekdayOf(from) + 7) % 7);
}

/** Beschreibung wie „Jeden Mittwoch bis 12.02.2027“ */
export function describeRepeat(rule: Recurrence, start: DateStr): string {
  const wd = WEEKDAY_NAMES[weekdayOf(start) - 1];
  const base = {
    taeglich: 'Jeden Tag',
    woechentlich: `Jeden ${wd}`,
    zweiwoechentlich: `Jeden 2. ${wd}`,
    monatlich: `Jeden Monat am ${Number(start.slice(8))}.`,
    jaehrlich: `Jedes Jahr am ${parseDate(start).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}`,
  }[rule.freq];
  return rule.until ? `${base} bis ${parseDate(rule.until).toLocaleDateString('de-DE')}` : base;
}

export interface SlotSeries {
  slot: CourseSlot;
  course: Pick<Course, 'id' | 'name' | 'color'>;
  start: DateStr;
  rule: Recurrence;
}

/**
 * Macht aus den Kurszeiten Serien für den Kalender: ab Semesterbeginn (bzw. dem
 * Startdatum der Zeit) wöchentlich oder alle 2 Wochen bis zum Semesterende.
 */
export function slotSeries(courses: Pick<Course, 'id' | 'name' | 'color' | 'slots'>[], semester: { start: DateStr; end: DateStr }, fallbackStart: DateStr): SlotSeries[] {
  const out: SlotSeries[] = [];
  for (const course of courses) {
    for (const slot of course.slots ?? []) {
      const from = slot.from || semester.start || fallbackStart;
      out.push({
        slot,
        course,
        start: firstWeekday(from, slot.day),
        rule: { freq: slot.every === 2 ? 'zweiwoechentlich' : 'woechentlich', until: semester.end || null, except: slot.except ?? [] },
      });
    }
  }
  return out;
}
