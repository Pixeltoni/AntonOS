import type { DateStr, Person } from '../types';
import { daysBetween } from './dates';

export const PERSON_GROUPS = ['Familie', 'Freunde', 'Uni', 'WG', 'Arbeit'];
export const PERSON_COLORS = ['#FF2D55', '#34C759', '#5AC8FA', '#AF52DE', '#FF9500', '#007AFF', '#A2845E'];

/** Abstände für „Melde dich mal“ */
export const CONTACT_INTERVALS: { days: number; label: string }[] = [
  { days: 0, label: 'Nie erinnern' },
  { days: 7, label: 'Jede Woche' },
  { days: 14, label: 'Alle 2 Wochen' },
  { days: 28, label: 'Alle 4 Wochen' },
  { days: 90, label: 'Alle 3 Monate' },
  { days: 180, label: 'Alle 6 Monate' },
];

/** „Lea Meier“ → „LM“, „Papa“ → „P“ */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts.length === 1 ? parts[0][0] : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Geburtstag in einem bestimmten Jahr – der 29. Februar fällt in anderen Jahren auf den 28. */
export function birthdayIn(birthday: string, year: number): DateStr {
  const mmdd = birthday === '02-29' && !isLeap(year) ? '02-28' : birthday;
  return `${year}-${mmdd}`;
}

/** Nächster Geburtstag ab heute (heute zählt mit), oder null ohne Geburtstag */
export function nextBirthday(p: Pick<Person, 'birthday'>, on: DateStr): DateStr | null {
  if (!/^\d{2}-\d{2}$/.test(p.birthday)) return null;
  const year = Number(on.slice(0, 4));
  const thisYear = birthdayIn(p.birthday, year);
  return thisYear >= on ? thisYear : birthdayIn(p.birthday, year + 1);
}

/** Alter an einem Tag (null ohne Geburtsjahr) */
export function ageOn(p: Pick<Person, 'birthYear'>, date: DateStr): number | null {
  return p.birthYear ? Number(date.slice(0, 4)) - p.birthYear : null;
}

export interface UpcomingBirthday {
  person: Person;
  date: DateStr;
  days: number;
  /** Wie alt die Person an dem Tag wird */
  age: number | null;
}

/** Geburtstage der nächsten `days` Tage, die nächsten zuerst */
export function upcomingBirthdays(people: Person[], on: DateStr, days = 366): UpcomingBirthday[] {
  return people
    .map((person) => {
      const date = nextBirthday(person, on);
      return date ? { person, date, days: daysBetween(on, date), age: ageOn(person, date) } : null;
    })
    .filter((x): x is UpcomingBirthday => !!x && x.days <= days)
    .sort((a, b) => a.days - b.days || a.person.name.localeCompare(b.person.name));
}

/** „heute“, „morgen“, „in 5 Tagen“ */
export function daysLabel(days: number): string {
  if (days === 0) return 'heute';
  if (days === 1) return 'morgen';
  return `in ${days} Tagen`;
}

/**
 * Tage seit dem letzten Kontakt, wenn es Zeit wird, sich zu melden – sonst null.
 * Ohne eingetragenen Kontakt gilt die Person sofort als „dran“.
 */
export function contactDue(p: Pick<Person, 'contactEvery' | 'lastContact'>, on: DateStr): number | null {
  if (!(p.contactEvery > 0)) return null;
  if (!p.lastContact) return 0;
  const since = daysBetween(p.lastContact, on);
  return since >= p.contactEvery ? since : null;
}

/** „vor 6 Wochen“, „vor 3 Tagen“, „heute“ */
export function sinceLabel(from: DateStr, on: DateStr): string {
  const d = daysBetween(from, on);
  if (d <= 0) return 'heute';
  if (d === 1) return 'gestern';
  if (d < 14) return `vor ${d} Tagen`;
  if (d < 60) return `vor ${Math.round(d / 7)} Wochen`;
  if (d < 365) return `vor ${Math.round(d / 30)} Monaten`;
  const y = Math.floor(d / 365);
  return y === 1 ? 'vor über einem Jahr' : `vor über ${y} Jahren`;
}

/** Geburtstag aus einem Datumsfeld (YYYY-MM-DD) übernehmen */
export function birthdayFromDate(value: string, yearKnown: boolean): Pick<Person, 'birthday' | 'birthYear'> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { birthday: '', birthYear: null };
  return { birthday: value.slice(5), birthYear: yearKnown ? Number(value.slice(0, 4)) : null };
}
