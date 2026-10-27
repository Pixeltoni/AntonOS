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

export interface TimedBlock {
  entry: CalendarEntry;
  /** Minuten seit Mitternacht */
  start: number;
  end: number;
  /** Spalte und Spaltenzahl bei überlappenden Terminen */
  col: number;
  cols: number;
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Termine mit Uhrzeit, die an diesem Tag beginnen und enden – der Rest gilt dort als ganztägig. */
export function isTimedOn(e: CalendarEntry, day: DateStr): boolean {
  return !!e.time && e.start === day && e.end === day;
}

/**
 * Ordnet Termine für die Zeitleiste an (wie im iPhone-Kalender): Position und
 * Länge nach Uhrzeit, überlappende Termine teilen sich die Breite nebeneinander.
 */
export function layoutTimed(entries: CalendarEntry[], day: DateStr): TimedBlock[] {
  const blocks = entries
    .filter((e) => isTimedOn(e, day))
    .map((entry) => {
      const start = toMinutes(entry.time);
      let end = entry.endTime ? toMinutes(entry.endTime) : start + 60;
      if (end <= start) end = start + 30;
      return { entry, start, end: Math.min(end, 24 * 60), col: 0, cols: 1 };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  let cluster: TimedBlock[] = [];
  let clusterEnd = -1;
  const columnsEnd: number[] = [];
  const close = () => {
    const cols = Math.max(1, ...cluster.map((b) => b.col + 1));
    cluster.forEach((b) => (b.cols = cols));
    cluster = [];
    columnsEnd.length = 0;
  };
  for (const b of blocks) {
    if (b.start >= clusterEnd && cluster.length) close();
    let col = columnsEnd.findIndex((end) => end <= b.start);
    if (col === -1) col = columnsEnd.length;
    columnsEnd[col] = b.end;
    b.col = col;
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  if (cluster.length) close();
  return blocks;
}
