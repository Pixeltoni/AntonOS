import type { CalEvent, DateStr, EventColor, EventPriority, Recurrence } from '../types';
import { addDays, daysBetween, parseDate, toDateStr } from './dates';
import { monthLabel, monthKey } from './life';
import { occursOn } from './recurrence';

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
  kind: 'event' | 'task' | 'exam' | 'project' | 'workout' | 'lecture';
  href?: string;
  done?: boolean;
  priority?: EventPriority;
  note?: string;
  /** Bei eigenen Terminen: zum Bearbeiten */
  eventId?: string;
  /** Wiederholung; start/end beschreiben dann das erste Vorkommen */
  recur?: Recurrence;
  /** Eigene Farbe, z. B. die Kursfarbe bei Vorlesungen */
  color?: string;
  /** Ort eines eigenen Termins */
  location?: string;
}

export type EntryKind = CalendarEntry['kind'];

/** Arten von Einträgen in der Reihenfolge der Filterleiste */
export const KIND_LABELS: Record<EntryKind, string> = {
  event: 'Termine',
  lecture: 'Vorlesungen',
  task: 'Aufgaben',
  exam: 'Prüfungen',
  project: 'Projekte',
  workout: 'Trainings',
};

/** Gedämpfte Notion-Palette für eigene Termine */
export const EVENT_COLORS: Record<EventColor, { label: string; hex: string }> = {
  grau: { label: 'Grau', hex: '#91918e' },
  braun: { label: 'Braun', hex: '#a27763' },
  orange: { label: 'Orange', hex: '#d9730d' },
  gelb: { label: 'Gelb', hex: '#cb912f' },
  gruen: { label: 'Grün', hex: '#448361' },
  blau: { label: 'Blau', hex: '#337ea9' },
  lila: { label: 'Lila', hex: '#9065b0' },
  rosa: { label: 'Rosa', hex: '#c14c8a' },
  rot: { label: 'Rot', hex: '#d44c47' },
};

/** Termin über mehrere Tage (bzw. ohne Uhrzeit über Tagesgrenzen hinweg)? */
export const isMultiDay = (e: CalendarEntry) => e.end > e.start;

export function onDay(e: CalendarEntry, day: DateStr): boolean {
  if (e.recur) return occursOn(e.recur, e.start, e.end, day);
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
export function validateEvent(e: { title: string; start: DateStr; end: DateStr | null; startTime: string; endTime: string; repeat?: Recurrence | null }): string | null {
  if (!e.title.trim()) return 'Bitte gib einen Namen ein.';
  if (!e.start) return 'Bitte wähle ein Datum.';
  if (e.end && e.end < e.start) return 'Das Enddatum liegt vor dem Startdatum.';
  if (e.endTime && !e.startTime) return 'Bitte gib auch eine Startzeit an.';
  if ((!e.end || e.end === e.start) && e.startTime && e.endTime && e.endTime < e.startTime) return 'Die Endzeit liegt vor der Startzeit.';
  if (e.repeat?.until && e.repeat.until < e.start) return 'Die Wiederholung endet vor dem ersten Termin.';
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
  return !!e.time && e.start === e.end && onDay(e, day);
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

/** Startzeitpunkt (ms) eines Vorkommens an `day` um `time` */
export function startAt(day: DateStr, time: string): number {
  const [h, m] = time.split(':').map(Number);
  const d = parseDate(day);
  d.setHours(h, m || 0, 0, 0);
  return d.getTime();
}

/**
 * Welche Erinnerungen jetzt fällig sind: Termine mit Uhrzeit heute oder morgen, deren
 * Erinnerungszeitpunkt erreicht, deren Beginn aber noch nicht vorbei ist.
 */
export function dueReminders(entries: (CalendarEntry & { remind?: number | null })[], now: Date): { entry: CalendarEntry; day: DateStr; id: string }[] {
  const t = toDateStr(now);
  const out: { entry: CalendarEntry; day: DateStr; id: string }[] = [];
  for (const day of [t, addDays(t, 1)]) {
    for (const e of entries) {
      if (!e.remind || !e.time || !isTimedOn(e, day)) continue;
      const start = startAt(day, e.time);
      if (now.getTime() >= start - e.remind * 60_000 && now.getTime() < start) out.push({ entry: e, day, id: `${e.key}@${day}` });
    }
  }
  return out;
}

export interface SpanSegment {
  entry: CalendarEntry;
  /** Spalte des ersten Tages (0 = erster Tag von `days`) */
  col: number;
  /** Anzahl der Tage */
  span: number;
  /** Zeile des Balkens */
  lane: number;
  /** Fängt vor bzw. endet nach dem sichtbaren Zeitraum */
  before: boolean;
  after: boolean;
}

/**
 * Mehrtägige Einträge als durchgehende Balken über die Tage `days` (z. B. eine
 * Kalenderwoche): zusammenhängende Tage werden zu einem Abschnitt, Abschnitte
 * bekommen die erste freie Zeile.
 */
export function spanLanes(entries: CalendarEntry[], days: DateStr[]): { segments: SpanSegment[]; lanes: number } {
  const found: Omit<SpanSegment, 'lane'>[] = [];
  for (const entry of entries) {
    if (!isMultiDay(entry)) continue;
    let i = 0;
    while (i < days.length) {
      if (!onDay(entry, days[i])) {
        i++;
        continue;
      }
      const col = i;
      while (i < days.length && onDay(entry, days[i])) i++;
      found.push({
        entry,
        col,
        span: i - col,
        before: onDay(entry, addDays(days[col], -1)) && col === 0,
        after: onDay(entry, addDays(days[i - 1], 1)) && i === days.length,
      });
    }
  }
  found.sort((a, b) => a.col - b.col || b.span - a.span || a.entry.key.localeCompare(b.entry.key));
  const laneEnd: number[] = [];
  const segments = found.map((s) => {
    let lane = laneEnd.findIndex((end) => end <= s.col);
    if (lane === -1) lane = laneEnd.length;
    laneEnd[lane] = s.col + s.span;
    return { ...s, lane };
  });
  return { segments, lanes: laneEnd.length };
}

export const toMin = (hhmm: string) => toMinutes(hhmm);
export const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

type Timing = Pick<CalEvent, 'start' | 'end' | 'startTime' | 'endTime'>;

/**
 * Verschiebt einen Termin um Tage und Minuten (Ziehen im Kalender). Die Dauer bleibt
 * gleich; die Uhrzeit wird auf 0:00 bis 23:45 begrenzt.
 */
export function moveEvent(e: Timing, dayDelta: number, minuteDelta = 0): Timing {
  const start = addDays(e.start, dayDelta);
  const end = e.end ? addDays(e.end, dayDelta) : null;
  if (!e.startTime || minuteDelta === 0) return { ...e, start, end };
  const from = toMinutes(e.startTime);
  const next = Math.min(23 * 60 + 45, Math.max(0, from + minuteDelta));
  const shift = next - from;
  let endTime = e.endTime;
  let endDay = end;
  if (e.endTime) {
    const sameDay = !end || end === start;
    let to = toMinutes(e.endTime) + shift;
    if (sameDay) {
      // Rutscht das Ende über Mitternacht, endet der Termin am nächsten Tag
      if (to >= 24 * 60) {
        to -= 24 * 60;
        endDay = addDays(start, 1);
      } else if (to < 0) to = 0;
    }
    endTime = fromMin(to);
  }
  return { start, end: endDay, startTime: fromMin(next), endTime };
}

/** Ändert das Ende eines Termins mit Uhrzeit (Ziehen an der Unterkante), mindestens 15 Minuten lang. */
export function resizeEvent(e: Timing, minuteDelta: number): Timing {
  if (!e.startTime) return e;
  const from = toMinutes(e.startTime);
  const to = e.endTime ? toMinutes(e.endTime) : from + 60;
  const next = Math.min(24 * 60 - 1, Math.max(from + 15, to + minuteDelta));
  return { ...e, end: null, endTime: next === 24 * 60 - 1 ? '23:59' : fromMin(next) };
}

type Draftish = Omit<CalEvent, 'id'>;

/** Für das Bearbeiten-Fenster: ein Vorkommen einer Serie mit dem angeklickten Datum. */
export function occurrenceDraft(series: Draftish, occurrence: DateStr): Draftish {
  const span = series.end ? daysBetween(series.start, series.end) : 0;
  return { ...series, start: occurrence, end: series.end ? addDays(occurrence, span) : null };
}

/**
 * „Nur diesen Termin ändern“: Das Vorkommen fällt aus der Serie heraus und wird ein
 * eigener Termin mit den neuen Angaben.
 */
export function detachOccurrence(series: Draftish, occurrence: DateStr, edited: Draftish): { seriesPatch: Partial<CalEvent>; single: Draftish } {
  const rule = series.repeat!;
  return {
    seriesPatch: { repeat: { ...rule, except: [...(rule.except ?? []), occurrence] } },
    single: { ...edited, repeat: null },
  };
}

/**
 * „Alle Termine ändern“ aus einem Vorkommen heraus: Eine Datumsverschiebung im
 * Fenster verschiebt die ganze Serie um genauso viele Tage.
 */
export function editWholeSeries(series: Draftish, occurrence: DateStr, edited: Draftish): Draftish {
  const delta = daysBetween(occurrence, edited.start);
  const start = addDays(series.start, delta);
  const span = edited.end ? daysBetween(edited.start, edited.end) : 0;
  return { ...edited, start, end: edited.end ? addDays(start, span) : null };
}
