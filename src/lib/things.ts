import type { DateStr, Task } from '../types';
import { addDays } from './dates';

export type When = '' | 'heute' | 'abends' | 'irgendwann';

const open = (t: Task) => t.status !== 'erledigt';

/** In „Heute“: fällig bis heute oder für heute (bzw. früher) eingeplant – nicht „Irgendwann“. */
export function inToday(t: Task, day: DateStr): boolean {
  if (!open(t) || t.someday) return false;
  return (t.due !== null && t.due <= day) || (!!t.plannedFor && t.plannedFor <= day);
}

export const inSomeday = (t: Task) => open(t) && !!t.someday;

/** Aktueller „Wann“-Wert einer Aufgabe */
export function whenOf(t: Task, day: DateStr): When {
  if (t.someday) return 'irgendwann';
  if (t.plannedFor && t.plannedFor <= day) return t.evening ? 'abends' : 'heute';
  return '';
}

/** Änderung für „Wann“ – wie das Kalender-Menü in Things */
export function setWhen(when: When, day: DateStr): Pick<Task, 'plannedFor' | 'evening' | 'someday'> {
  if (when === 'heute') return { plannedFor: day, evening: false, someday: false };
  if (when === 'abends') return { plannedFor: day, evening: true, someday: false };
  if (when === 'irgendwann') return { plannedFor: null, evening: false, someday: true };
  return { plannedFor: null, evening: false, someday: false };
}

/** Logbuch: erledigte Aufgaben nach Tag, neueste zuerst */
export function logbook(tasks: Task[], day: DateStr): { label: string; date: string; tasks: Task[] }[] {
  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    if (open(t)) continue;
    const key = t.completedAt ?? t.due ?? '';
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : b.localeCompare(a)))
    .map(([date, list]) => ({
      date,
      label: date === '' ? 'Früher' : date === day ? 'Heute' : date === addDays(day, -1) ? 'Gestern' : new Date(`${date}T12:00`).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }),
      tasks: list,
    }));
}

/** Tage bis zu einer Frist (negativ = vorbei) als kurzer Text */
export function deadlineLabel(due: DateStr, day: DateStr): string {
  const diff = Math.round((new Date(`${due}T12:00`).getTime() - new Date(`${day}T12:00`).getTime()) / 86_400_000);
  if (diff < 0) return `${-diff} ${diff === -1 ? 'Tag' : 'Tage'} überfällig`;
  if (diff === 0) return 'heute fällig';
  if (diff === 1) return 'morgen fällig';
  return `noch ${diff} Tage`;
}
