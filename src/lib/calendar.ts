import type { DateStr, EventPriority } from '../types';
import { addDays, parseDate, toDateStr } from './dates';
import { monthLabel, monthKey } from './life';

export type CalendarMode = 'tag' | 'woche' | 'monat';

export interface CalendarEntry {
  key: string;
  start: DateStr;
  /** Letzter Tag (bei eintägigen Einträgen gleich start) */
  end: DateStr;
  /** HH:MM oder leer für ganztägig */
  time: string;
  endTime: string;
  label: string;
  kind: 'event' | 'task' | 'exam' | 'project' | 'workout';
  href?: string;
  done?: boolean;
  priority?: EventPriority;
  note?: string;
  /** Bei eigenen Terminen: zum Bearbeiten */
  eventId?: string;
}

export function onDay(e: CalendarEntry, day: DateStr): boolean {
  return e.start <= day && day <= e.end;
}

const PRIO_RANK: Record<EventPriority, number> = { hoch: 0, mittel: 1, niedrig: 2 };

/** Ganztägiges zuerst, dann nach Uhrzeit, bei Gleichstand wichtigere Termine zuerst. */
export function sortEntries(list: CalendarEntry[]): CalendarEntry[] {
  return [...list].sort((a, b) => {
    if (!a.time !== !b.time) return a.time ? 1 : -1;
    if (a.time !== b.time) return a.time.localeCompare(b.time);
    return PRIO_RANK[a.priority ?? 'niedrig'] - PRIO_RANK[b.priority ?? 'niedrig'];
  });
}

/** Montag bis Sonntag der Woche, in der `day` liegt. */
export function weekDays(day: DateStr): DateStr[] {
  const d = parseDate(day);
  const monday = toDateStr(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Springt um einen Tag, eine Woche oder einen Monat vor bzw. zurück. */
export function shiftAnchor(mode: CalendarMode, anchor: DateStr, dir: -1 | 1): DateStr {
  if (mode === 'tag') return addDays(anchor, dir);
  if (mode === 'woche') return addDays(anchor, 7 * dir);
  const d = parseDate(anchor);
  return toDateStr(new Date(d.getFullYear(), d.getMonth() + dir, 1));
}

export function rangeLabel(mode: CalendarMode, anchor: DateStr, isoWeek: (d: Date) => number): string {
  if (mode === 'monat') return monthLabel(monthKey(anchor));
  if (mode === 'tag') {
    return parseDate(anchor).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  const days = weekDays(anchor);
  const fmt = (s: DateStr, year: boolean) => parseDate(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', ...(year ? { year: 'numeric' } : {}) });
  return `KW ${isoWeek(parseDate(anchor))} · ${fmt(days[0], false)}–${fmt(days[6], true)}`;
}

/** Prüft die Eingaben eines Termins. Gibt eine Fehlermeldung oder null zurück. */
export function validateEvent(e: { title: string; start: DateStr; end: DateStr | null; startTime: string; endTime: string }): string | null {
  if (!e.title.trim()) return 'Bitte gib einen Namen ein.';
  if (!e.start) return 'Bitte wähle ein Datum.';
  if (e.end && e.end < e.start) return 'Das Enddatum liegt vor dem Startdatum.';
  if (e.endTime && !e.startTime) return 'Bitte gib auch eine Startzeit an.';
  if ((!e.end || e.end === e.start) && e.startTime && e.endTime && e.endTime < e.startTime) return 'Die Endzeit liegt vor der Startzeit.';
  return null;
}

export function timeRange(e: Pick<CalendarEntry, 'time' | 'endTime'>): string {
  if (!e.time) return 'ganztägig';
  return e.endTime ? `${e.time}–${e.endTime}` : e.time;
}
