import type { Alarm, DayCloseSettings, DateStr, Task } from '../types';
import { addDays, parseDate, toDateStr } from './dates';
import { nextRing } from './alarm';
import { startAt } from './calendar';

export const defaultDayClose = (): DayCloseSettings => ({ enabled: true, time: '21:30' });

/** Offene Aufgaben, die heute dran sind oder schon überfällig – Kandidaten für „auf morgen“. */
export function openForToday(tasks: Task[], day: DateStr): Task[] {
  return tasks.filter((t) => {
    if (t.status === 'erledigt' || t.someday) return false;
    const planned = t.plannedFor ?? null;
    return (t.due !== null && t.due <= day) || (planned !== null && planned <= day);
  });
}

/** Schiebt eine Aufgabe auf morgen: Datum, „Wann?“ und Abends werden angepasst. */
export function toTomorrow(t: Task, day: DateStr): Partial<Task> {
  const tomorrow = addDays(day, 1);
  const patch: Partial<Task> = { evening: false };
  if (t.due !== null && t.due <= day) patch.due = tomorrow;
  if (t.plannedFor) patch.plannedFor = tomorrow;
  return patch;
}

/** Der Wecker, der morgen als erster klingelt (innerhalb des morgigen Tages). */
export function tomorrowAlarm(alarms: Alarm[], now: Date): { alarm: Alarm; at: Date } | null {
  const tomorrow = addDays(toDateStr(now), 1);
  let best: { alarm: Alarm; at: Date } | null = null;
  for (const alarm of alarms) {
    if (!alarm.enabled) continue;
    const at = nextRing(alarm, now);
    if (!at || toDateStr(at) !== tomorrow) continue;
    if (!best || at < best.at) best = { alarm, at };
  }
  return best;
}

/** Erinnerungen zum Tagesabschluss für die nächsten Tage (heute nur, wenn noch nicht abgeschlossen). */
export function dayCloseNotices(settings: DayCloseSettings, now: Date, days = 7): { tag: string; at: number; title: string; body: string; href: string }[] {
  if (!settings.enabled || !/^\d{2}:\d{2}$/.test(settings.time)) return [];
  const t = toDateStr(now);
  const out = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(t, i);
    if (settings.last === day) continue;
    const at = startAt(day, settings.time);
    if (at <= now.getTime()) continue;
    out.push({ tag: `abend-${day}`, at, title: '🌙 Tag abschließen', body: 'Wie war dein Tag? Offenes auf morgen schieben und den Wecker prüfen.', href: '#/abend' });
  }
  return out;
}

/** Ist die Erinnerung jetzt fällig (offenes Daywerk)? Ab der Uhrzeit bis Mitternacht. */
export function dayCloseDue(settings: DayCloseSettings, now: Date): DateStr | null {
  if (!settings.enabled || !/^\d{2}:\d{2}$/.test(settings.time)) return null;
  const t = toDateStr(now);
  if (settings.last === t) return null;
  return now.getTime() >= startAt(t, settings.time) ? t : null;
}

/** Wochentag und Datum, z. B. „Mittwoch, 4. November“ */
export const dayTitle = (day: DateStr) => parseDate(day).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
