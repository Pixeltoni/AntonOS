import { describe, expect, it } from 'vitest';
import type { Person, Recurring, Trip } from '../types';
import { dueNotices } from './reminders';

const lea: Person = { id: 'lea', name: 'Lea', birthday: '11-02', birthYear: 2004, group: '', note: '', color: '', gifts: [{ id: 'g', title: 'Kletterkurs', done: false, added: '2026-07-01' }], contactEvery: 0, lastContact: null, meetings: [] };
const gym: Recurring = { id: 'gym', type: 'Ausgabe', description: 'Fitnessstudio', amount: 19.9, category: 'Sport', account: 'Giro', day: 1, start: '2026-01', lastBooked: null, termEnd: '2026-11-30', noticeDays: 21, renewMonths: 12 };
const trip: Trip = { id: 'lis', title: 'Lissabon', start: '2026-11-12', end: '2026-11-16', cover: '', budget: 0, legs: [{ id: 'l', kind: 'flug', title: 'Flug MUC → LIS', date: '2026-11-12', time: '07:40', detail: '' }], packing: [{ id: 'p', title: 'Ausweis', section: 'Dokumente', done: false }], note: '' };
const at = (date: string, hour: number) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`);

describe('Hinweise', () => {
  it('erinnert an Geburtstage eine Woche vorher und am Tag', () => {
    const week = dueNotices({ people: [lea], recurring: [], trips: [] }, at('2026-10-28', 9));
    expect(week).toEqual([{ id: 'bday7-lea-2026-11-02', title: 'Lea hat in 5 Tagen Geburtstag (22)', body: '1 Geschenkidee gemerkt.', href: '#/menschen/lea' }]);
    expect(dueNotices({ people: [lea], recurring: [], trips: [] }, at('2026-11-02', 7))).toEqual([]);
    expect(dueNotices({ people: [lea], recurring: [], trips: [] }, at('2026-11-02', 8))[0].id).toBe('bday-lea-2026-11-02');
  });

  it('erinnert zwei Wochen vor einer Kündigungsfrist', () => {
    expect(dueNotices({ people: [], recurring: [gym], trips: [] }, at('2026-10-20', 9))).toEqual([]);
    const n = dueNotices({ people: [], recurring: [gym], trips: [] }, at('2026-10-28', 9));
    expect(n[0]).toMatchObject({ id: 'kuend-gym-2026-11-09', title: 'Fitnessstudio: noch 12 Tage kündbar' });
    expect(dueNotices({ people: [], recurring: [{ ...gym, endsOn: '2026-11-30' }], trips: [] }, at('2026-10-28', 9))).toEqual([]);
  });

  it('erinnert am Vorabend einer Reise', () => {
    expect(dueNotices({ people: [], recurring: [], trips: [trip] }, at('2026-11-11', 17))).toEqual([]);
    expect(dueNotices({ people: [], recurring: [], trips: [trip] }, at('2026-11-11', 19))).toEqual([
      { id: 'reise-lis-2026-11-12', title: "Morgen geht's los: Lissabon", body: 'Noch 1 von 1 Sachen packen · Flug MUC → LIS um 07:40', href: '#/reisen/lis' },
    ]);
  });
});
