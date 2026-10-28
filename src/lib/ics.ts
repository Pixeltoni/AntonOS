import type { CalEvent, DateStr, Recurrence, RepeatFreq } from '../types';
import { addDays, toDateStr } from './dates';

type Draft = Omit<CalEvent, 'id'>;

const pad = (n: number) => String(n).padStart(2, '0');

/** Sonderzeichen nach RFC 5545 maskieren */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const unesc = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

/** Lange Zeilen nach 74 Zeichen umbrechen (Fortsetzung beginnt mit Leerzeichen) */
function fold(line: string): string {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  parts.push(rest);
  return parts.join('\r\n');
}

const icsDate = (d: DateStr) => d.replace(/-/g, '');
const icsDateTime = (d: DateStr, t: string) => `${icsDate(d)}T${t.replace(':', '')}00`;

const FREQ: Record<RepeatFreq, string> = {
  taeglich: 'FREQ=DAILY',
  woechentlich: 'FREQ=WEEKLY',
  zweiwoechentlich: 'FREQ=WEEKLY;INTERVAL=2',
  monatlich: 'FREQ=MONTHLY',
  jaehrlich: 'FREQ=YEARLY',
};

/** Eigene Termine als iCalendar-Datei (für Google, Apple, Outlook). Zeiten gelten als Ortszeit. */
export function toICS(events: CalEvent[], stamp: Date = new Date()): string {
  const dtstamp = `${toDateStr(stamp).replace(/-/g, '')}T${pad(stamp.getHours())}${pad(stamp.getMinutes())}00`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AntonOS//Kalender//DE', 'CALSCALE:GREGORIAN'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.id}@antonos`, `DTSTAMP:${dtstamp}`, `SUMMARY:${esc(e.title)}`);
    const last = e.end && e.end > e.start ? e.end : e.start;
    if (e.startTime) {
      lines.push(`DTSTART:${icsDateTime(e.start, e.startTime)}`);
      if (e.endTime) lines.push(`DTEND:${icsDateTime(last, e.endTime)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(e.start)}`, `DTEND;VALUE=DATE:${icsDate(addDays(last, 1))}`);
    }
    if (e.repeat) {
      const until = e.repeat.until ? `;UNTIL=${icsDate(e.repeat.until)}${e.startTime ? 'T235959' : ''}` : '';
      lines.push(`RRULE:${FREQ[e.repeat.freq]}${until}`);
      for (const x of e.repeat.except ?? []) {
        lines.push(e.startTime ? `EXDATE:${icsDateTime(x, e.startTime)}` : `EXDATE;VALUE=DATE:${icsDate(x)}`);
      }
    }
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.note) lines.push(`DESCRIPTION:${esc(e.note)}`);
    if (e.priority === 'hoch') lines.push('PRIORITY:1');
    else if (e.priority === 'niedrig') lines.push('PRIORITY:9');
    if (e.remind) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-PT${e.remind}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

function parseLine(line: string): Prop | null {
  // Doppelpunkt außerhalb von Anführungszeichen trennt Name;Parameter von Wert
  let quoted = false;
  let i = 0;
  for (; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ':' && !quoted) break;
  }
  if (i >= line.length) return null;
  const [name, ...rawParams] = line.slice(0, i).split(';');
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const [k, v = ''] = p.split('=');
    params[k.toUpperCase()] = v.replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value: line.slice(i + 1) };
}

/** Datum und Uhrzeit (Ortszeit) aus 20261105, 20261105T140000 oder 20261105T130000Z */
function parseStamp(value: string): { date: DateStr; time: string } | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  if (!m[4]) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: '' };
  if (m[7]) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
    return { date: toDateStr(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  }
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
}

function parseRule(value: string): Recurrence | null {
  const parts = Object.fromEntries(value.split(';').map((p) => p.split('=') as [string, string]));
  const interval = Number(parts.INTERVAL ?? 1);
  let freq: RepeatFreq | null = null;
  if (parts.FREQ === 'DAILY' && interval === 1) freq = 'taeglich';
  else if (parts.FREQ === 'WEEKLY' && interval === 1) freq = 'woechentlich';
  else if (parts.FREQ === 'WEEKLY' && interval === 2) freq = 'zweiwoechentlich';
  else if (parts.FREQ === 'MONTHLY' && interval === 1) freq = 'monatlich';
  else if (parts.FREQ === 'YEARLY' && interval === 1) freq = 'jaehrlich';
  if (!freq) return null;
  const until = parts.UNTIL ? parseStamp(parts.UNTIL)?.date ?? null : null;
  return { freq, until, except: [] };
}

/**
 * Liest Termine aus einer .ics-Datei. Unterstützt ganztägige und mehrtägige Termine,
 * einfache Wiederholungen (täglich, (zwei)wöchentlich, monatlich, jährlich) mit
 * Ende und Ausnahmen, Ort, Beschreibung und Erinnerung. Zeitzonen-Angaben (TZID)
 * werden als Ortszeit gelesen, UTC-Zeiten (…Z) umgerechnet.
 */
export function parseICS(text: string): Draft[] {
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const out: Draft[] = [];
  let cur: Prop[] | null = null;
  let inAlarm = false;
  let alarm: number | null = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line === 'BEGIN:VEVENT') {
      cur = [];
      alarm = null;
      continue;
    }
    if (!cur) continue;
    if (line === 'BEGIN:VALARM') {
      inAlarm = true;
      continue;
    }
    if (line === 'END:VALARM') {
      inAlarm = false;
      continue;
    }
    if (inAlarm) {
      const p = parseLine(line);
      const m = p?.name === 'TRIGGER' && p.value.match(/^-P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/);
      if (m && alarm === null) alarm = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) || null;
      continue;
    }
    if (line === 'END:VEVENT') {
      const ev = toDraft(cur, alarm);
      if (ev) out.push(ev);
      cur = null;
      continue;
    }
    const p = parseLine(line);
    if (p) cur.push(p);
  }
  return out;
}

function toDraft(props: Prop[], alarm: number | null): Draft | null {
  const get = (n: string) => props.find((p) => p.name === n);
  const startProp = get('DTSTART');
  const start = startProp && parseStamp(startProp.value);
  if (!start) return null;
  const endProp = get('DTEND');
  let finish = endProp ? parseStamp(endProp.value) : null;
  let endDate: DateStr | null = null;
  let endTime = '';
  if (!start.time) {
    // Ganztägig: DTEND ist der Tag nach dem letzten Tag
    if (finish && addDays(finish.date, -1) > start.date) endDate = addDays(finish.date, -1);
  } else if (finish && finish.time) {
    endTime = finish.time;
    if (finish.date > start.date) endDate = finish.date;
  } else {
    const dur = get('DURATION')?.value.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/);
    if (dur) {
      const [h, m] = start.time.split(':').map(Number);
      const total = h * 60 + m + Number(dur[1] ?? 0) * 1440 + Number(dur[2] ?? 0) * 60 + Number(dur[3] ?? 0);
      finish = { date: addDays(start.date, Math.floor(total / 1440)), time: `${pad(Math.floor((total % 1440) / 60))}:${pad(total % 60)}` };
      endTime = finish.time;
      if (finish.date > start.date) endDate = finish.date;
    }
  }
  const rule = get('RRULE');
  const repeat = rule ? parseRule(rule.value) : null;
  if (repeat) {
    for (const p of props.filter((x) => x.name === 'EXDATE')) {
      for (const v of p.value.split(',')) {
        const d = parseStamp(v);
        if (d) repeat.except!.push(d.date);
      }
    }
  }
  const prio = Number(get('PRIORITY')?.value ?? 0);
  return {
    title: unesc(get('SUMMARY')?.value ?? '').trim() || 'Ohne Titel',
    note: unesc(get('DESCRIPTION')?.value ?? '').trim(),
    location: unesc(get('LOCATION')?.value ?? '').trim(),
    start: start.date,
    end: endDate,
    startTime: start.time,
    endTime,
    priority: prio >= 1 && prio <= 4 ? 'hoch' : prio >= 6 ? 'niedrig' : 'mittel',
    repeat,
    remind: start.time ? alarm : null,
    color: null,
  };
}

/** Schon vorhandene Termine (gleicher Name, Tag und Beginn) beim Import überspringen. */
export function newEventsOnly(existing: Pick<CalEvent, 'title' | 'start' | 'startTime'>[], incoming: Draft[]): Draft[] {
  const key = (e: Pick<CalEvent, 'title' | 'start' | 'startTime'>) => `${e.title.trim().toLowerCase()}|${e.start}|${e.startTime}`;
  const seen = new Set(existing.map(key));
  return incoming.filter((e) => {
    const k = key(e);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
