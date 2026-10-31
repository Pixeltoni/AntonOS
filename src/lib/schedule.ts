import type { Data, Task } from '../types';
import { isTimedOn, startAt, type CalendarEntry } from './calendar';
import { addDays, toDateStr } from './dates';
import { dueNotices } from './reminders';

/** Eine Mitteilung, die die iOS-App im Voraus beim System anmeldet. */
export interface PlannedNotice {
  /** Gleiche Kennung wie bei den Mitteilungen im offenen AntonOS – so kommt nichts doppelt */
  tag: string;
  /** Zeitpunkt in ms */
  at: number;
  title: string;
  body: string;
  href: string;
}

/** iOS merkt sich höchstens 64 geplante Mitteilungen pro App – etwas Luft lassen. */
export const MAX_PLANNED = 60;
/** So viele Tage im Voraus wird geplant */
export const PLAN_DAYS = 14;

/** Uhrzeiten, zu denen Geburtstage, Kündigungsfristen und Reisen gemeldet werden. */
const LIFE_HOURS = [9, 18];

/**
 * Alle Mitteilungen der nächsten Tage – Termine, Aufgaben mit Erinnerung, Geburtstage,
 * Kündigungsfristen und Reisen. Die App meldet sie beim System an, damit sie auch bei
 * geschlossener App kommen. Nur Zeitpunkte nach `now`, sortiert, höchstens `MAX_PLANNED`.
 */
export function plannedNotices(
  entries: (CalendarEntry & { remind?: number | null })[],
  data: Pick<Data, 'tasks' | 'people' | 'recurring' | 'trips'>,
  now: Date,
  days = PLAN_DAYS,
): PlannedNotice[] {
  const t = toDateStr(now);
  const out: PlannedNotice[] = [];

  // Termine und Vorlesungen: Erinnerung vor dem Beginn (höchstens einen Tag vorher, darum ab gestern)
  for (let i = -1; i <= days; i++) {
    const day = addDays(t, i);
    for (const e of entries) {
      if (!e.remind || !e.time || !isTimedOn(e, day)) continue;
      const at = startAt(day, e.time) - e.remind * 60_000;
      const sameDay = toDateStr(new Date(at)) === day;
      const body = `${sameDay ? 'um' : 'morgen um'} ${e.time}${e.location ? ` · ${e.location}` : ''}${e.note ? ` · ${e.note}` : ''}`;
      out.push({ tag: e.key, at, title: e.label, body, href: e.href ?? `#/kalender/${day}` });
    }
  }

  // Aufgaben mit Erinnerung zur Uhrzeit
  for (const task of data.tasks as Task[]) {
    if (!task.remind || task.status === 'erledigt' || !task.due || !task.dueTime) continue;
    out.push({ tag: `task-${task.id}`, at: startAt(task.due, task.dueTime), title: `🔔 ${task.title}`, body: `Erinnerung · ${task.dueTime} Uhr`, href: '#/aufgaben' });
  }

  // Geburtstage, Kündigungsfristen, Reisen: jeweils beim ersten Zeitpunkt, an dem der Hinweis fällig wird
  const seen = new Set<string>();
  for (let i = 0; i <= days; i++) {
    for (const hour of LIFE_HOURS) {
      const when = new Date(now);
      when.setDate(now.getDate() + i);
      when.setHours(hour, 0, 0, 0);
      for (const n of dueNotices(data, when)) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        out.push({ tag: n.id, at: when.getTime(), title: n.title, body: n.body, href: n.href });
      }
    }
  }

  const limit = now.getTime() + (days + 1) * 86_400_000;
  return out
    .filter((p) => p.at > now.getTime() && p.at <= limit)
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_PLANNED);
}

/** Feste Zahl (32 Bit, positiv) als Kennung für das System – aus einem beliebigen Text. */
export function noticeId(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  return (h & 0x7fffffff) || 1;
}

/** Wurde diese Mitteilung schon vom System gezeigt (geplant für einen Zeitpunkt in den letzten 26 Stunden)? */
export function alreadyDelivered(log: { tag: string; at: number }[], tag: string, now: number): boolean {
  return log.some((l) => l.tag === tag && l.at <= now && l.at > now - 26 * 3_600_000);
}
