import { describe, expect, it } from 'vitest';
import type { Person } from '../types';
import { ageOn, birthdayFromDate, contactDue, initials, nextBirthday, sinceLabel, upcomingBirthdays } from './people';

const person = (p: Partial<Person>): Person => ({ id: Math.random().toString(), name: 'Lea Meier', birthday: '', birthYear: null, group: 'Freunde', note: '', color: '#FF2D55', gifts: [], contactEvery: 0, lastContact: null, meetings: [], ...p });

describe('Menschen', () => {
  it('findet den nächsten Geburtstag und das Alter', () => {
    const lea = person({ birthday: '11-02', birthYear: 2004 });
    expect(nextBirthday(lea, '2026-10-28')).toBe('2026-11-02');
    expect(nextBirthday(lea, '2026-11-02')).toBe('2026-11-02');
    expect(nextBirthday(lea, '2026-11-03')).toBe('2027-11-02');
    expect(ageOn(lea, '2026-11-02')).toBe(22);
    expect(nextBirthday(person({ birthday: '02-29' }), '2026-01-10')).toBe('2026-02-28');
    expect(nextBirthday(person({ birthday: '02-29' }), '2027-12-01')).toBe('2028-02-29');
    expect(nextBirthday(person({}), '2026-01-10')).toBeNull();
  });

  it('sortiert anstehende Geburtstage', () => {
    const list = upcomingBirthdays([person({ name: 'Jonas', birthday: '12-04' }), person({ name: 'Lea', birthday: '11-02', birthYear: 2004 }), person({ name: 'Ohne' })], '2026-10-28', 30);
    expect(list.map((b) => [b.person.name, b.days, b.age])).toEqual([['Lea', 5, 22]]);
  });

  it('erinnert ans Melden', () => {
    expect(contactDue(person({ contactEvery: 28, lastContact: '2026-09-15' }), '2026-10-28')).toBe(43);
    expect(contactDue(person({ contactEvery: 28, lastContact: '2026-10-20' }), '2026-10-28')).toBeNull();
    expect(contactDue(person({ contactEvery: 28 }), '2026-10-28')).toBe(0);
    expect(contactDue(person({}), '2026-10-28')).toBeNull();
    expect(sinceLabel('2026-09-15', '2026-10-28')).toBe('vor 6 Wochen');
  });

  it('macht Initialen und liest das Datumsfeld', () => {
    expect(initials('Lea Meier')).toBe('LM');
    expect(initials('papa')).toBe('P');
    expect(initials('Anna Lena von Berg')).toBe('AB');
    expect(birthdayFromDate('2004-11-02', true)).toEqual({ birthday: '11-02', birthYear: 2004 });
    expect(birthdayFromDate('2004-11-02', false)).toEqual({ birthday: '11-02', birthYear: null });
  });
});
