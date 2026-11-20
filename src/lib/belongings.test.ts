import { describe, expect, it } from 'vitest';
import type { Loan, Warranty } from '../types';
import { belongingsHint, leftLabel, loanSentence, loanStatus, loanWho, openLoans, sortWarranties, warrantyEnd, warrantyStatus } from './belongings';
import { dueNotices } from './reminders';

const loan = (patch: Partial<Loan>): Loan => ({ id: 'l1', title: 'Buch', direction: 'verliehen', personId: null, who: 'Lea', date: '2026-11-01', due: null, returned: null, note: '', ...patch });
const warranty = (patch: Partial<Warranty>): Warranty => ({ id: 'w1', title: 'Kopfhörer', store: 'MediaMarkt', bought: '2025-01-15', months: 24, until: '2027-01-15', price: 129, photo: '', note: '', ...patch });
const at = (day: string, hour: number) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`);

describe('Garantien', () => {
  it('rechnet das Ende ab dem Kauf, auch am Monatsende', () => {
    expect(warrantyEnd('2025-01-15', 24)).toBe('2027-01-15');
    expect(warrantyEnd('2026-01-31', 1)).toBe('2026-02-28');
  });
  it('meldet „bald“ im letzten Monat und danach „abgelaufen“', () => {
    expect(warrantyStatus(warranty({}), '2026-11-20')).toEqual({ state: 'laeuft', daysLeft: 56 });
    expect(warrantyStatus(warranty({}), '2026-12-20').state).toBe('bald');
    expect(warrantyStatus(warranty({}), '2027-01-15')).toEqual({ state: 'bald', daysLeft: 0 });
    expect(warrantyStatus(warranty({}), '2027-01-16').state).toBe('abgelaufen');
  });
  it('sortiert laufende nach Ende und abgelaufene ans Ende', () => {
    const a = warranty({ id: 'a', until: '2027-06-01' });
    const b = warranty({ id: 'b', until: '2026-12-01' });
    const c = warranty({ id: 'c', until: '2026-01-01' });
    const { running, expired } = sortWarranties([a, b, c], '2026-11-20');
    expect(running.map((w) => w.id)).toEqual(['b', 'a']);
    expect(expired.map((w) => w.id)).toEqual(['c']);
  });
  it('schreibt die Restzeit verständlich', () => {
    expect(leftLabel(0)).toBe('endet heute');
    expect(leftLabel(12)).toBe('noch 12 Tage');
    expect(leftLabel(200)).toBe('noch 7 Monate');
    expect(leftLabel(730)).toBe('noch 2 Jahre');
    expect(leftLabel(-1)).toBe('abgelaufen');
  });
});

describe('Verliehen und geliehen', () => {
  const people = [{ id: 'p1', name: 'Max Huber' }];
  it('nimmt den Namen aus Menschen, sonst den eingetippten', () => {
    expect(loanWho(loan({ personId: 'p1' }), people)).toBe('Max Huber');
    expect(loanWho(loan({}), people)).toBe('Lea');
    expect(loanWho(loan({ who: ' ' }), people)).toBe('jemand');
    expect(loanSentence(loan({}), people)).toBe('Buch ist bei Lea');
    expect(loanSentence(loan({ direction: 'geliehen', personId: 'p1' }), people)).toBe('Buch von Max Huber');
  });
  it('erkennt fällige und überfällige Rückgaben', () => {
    expect(loanStatus(loan({}), '2026-11-20')).toEqual({ state: 'offen', daysLeft: null });
    expect(loanStatus(loan({ due: '2026-11-22' }), '2026-11-20')).toEqual({ state: 'faellig', daysLeft: 2 });
    expect(loanStatus(loan({ due: '2026-11-19' }), '2026-11-20').state).toBe('ueberfaellig');
    expect(loanStatus(loan({ due: '2026-11-19', returned: '2026-11-20' }), '2026-11-20').state).toBe('zurueck');
  });
  it('zeigt Überfälliges zuerst und Zurückgegebenes gar nicht', () => {
    const list = [loan({ id: 'a' }), loan({ id: 'b', due: '2026-11-25' }), loan({ id: 'c', due: '2026-11-10' }), loan({ id: 'd', returned: '2026-11-02' })];
    expect(openLoans(list).map((l) => l.id)).toEqual(['c', 'b', 'a']);
  });
  it('fasst alles für die Bereiche-Kachel zusammen', () => {
    expect(belongingsHint([], [], '2026-11-20')).toBe('');
    expect(belongingsHint([loan({}), loan({ id: 'b', direction: 'geliehen' })], [], '2026-11-20')).toBe('1 verliehen · 1 geliehen');
    expect(belongingsHint([loan({ due: '2026-11-01' })], [], '2026-11-20')).toBe('1 überfällig zurück');
    expect(belongingsHint([], [warranty({ until: '2026-11-30' })], '2026-11-20')).toBe('Kopfhörer: Garantie noch 10 Tage');
    expect(belongingsHint([], [warranty({})], '2026-11-20')).toBe('1 Garantie');
  });
});

describe('Mitteilungen', () => {
  const base = { people: [], recurring: [], trips: [] };
  it('erinnert am Rückgabetag ab 9 Uhr', () => {
    const loans = [loan({ due: '2026-11-20' })];
    expect(dueNotices({ ...base, loans }, at('2026-11-19', 12))).toEqual([]);
    expect(dueNotices({ ...base, loans }, at('2026-11-20', 8))).toEqual([]);
    const [n] = dueNotices({ ...base, loans }, at('2026-11-20', 9));
    expect(n.id).toBe('leihe-l1-2026-11-20');
    expect(n.title).toBe('Lea sollte Buch zurückgeben');
    expect(dueNotices({ ...base, loans: [loan({ due: '2026-11-20', direction: 'geliehen' })] }, at('2026-11-20', 9))[0].title).toBe('Buch an Lea zurückgeben');
    expect(dueNotices({ ...base, loans: [loan({ due: '2026-11-20', returned: '2026-11-18' })] }, at('2026-11-20', 9))).toEqual([]);
  });
  it('erinnert einen Monat vor dem Ende der Garantie', () => {
    const warranties = [warranty({})];
    expect(dueNotices({ ...base, warranties }, at('2026-12-15', 9))).toEqual([]);
    const [n] = dueNotices({ ...base, warranties }, at('2026-12-16', 9));
    expect(n.id).toBe('garantie-w1-2027-01-15');
    expect(n.title).toBe('Garantie für Kopfhörer endet in 30 Tagen');
    expect(dueNotices({ ...base, warranties }, at('2027-01-16', 9))).toEqual([]);
  });
});
