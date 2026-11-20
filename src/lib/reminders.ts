import type { Data } from '../types';
import { addDays, daysBetween, formatDate, toDateStr } from './dates';
import { formatMoney } from './life';
import { daysLabel, upcomingBirthdays } from './people';
import { contractStatus } from './subscriptions';
import { packProgress, sortLegs } from './trips';
import { loanStatus, loanWho, WARRANTY_NOTICE_DAYS, warrantyStatus } from './belongings';

export interface Notice {
  /** Feste Kennung, damit jeder Hinweis nur einmal kommt */
  id: string;
  title: string;
  body: string;
  href: string;
}

/** So viele Tage vor einer Kündigungsfrist erinnert Daywerk */
export const NOTICE_DAYS = 14;

/**
 * Hinweise, die jetzt fällig sind: Geburtstage eine Woche vorher und am Tag selbst (ab 8 Uhr),
 * Kündigungsfristen zwei Wochen vorher, Reisen am Vorabend (ab 18 Uhr), Verliehenes am Rückgabetag
 * (ab 9 Uhr) und Garantien einen Monat vor dem Ende.
 */
export function dueNotices(data: Pick<Data, 'people' | 'recurring' | 'trips'> & Partial<Pick<Data, 'loans' | 'warranties'>>, now: Date): Notice[] {
  const t = toDateStr(now);
  const hour = now.getHours();
  const out: Notice[] = [];

  for (const b of upcomingBirthdays(data.people, t, 7)) {
    const who = b.person.name;
    const age = b.age ? ` (${b.age})` : '';
    const gifts = b.person.gifts.filter((g) => !g.done).length;
    if (b.days === 0 && hour >= 8) {
      out.push({ id: `bday-${b.person.id}-${b.date}`, title: `${who} hat heute Geburtstag${age}`, body: 'Denk an deine Glückwünsche.', href: `#/menschen/${b.person.id}` });
    } else if (b.days > 0) {
      out.push({
        id: `bday7-${b.person.id}-${b.date}`,
        title: `${who} hat ${daysLabel(b.days)} Geburtstag${age}`,
        body: gifts ? `${gifts} ${gifts === 1 ? 'Geschenkidee' : 'Geschenkideen'} gemerkt.` : 'Noch keine Geschenkidee gemerkt.',
        href: `#/menschen/${b.person.id}`,
      });
    }
  }

  for (const r of data.recurring) {
    if (r.type !== 'Ausgabe') continue;
    const s = contractStatus(r, t);
    if (!s.deadline || s.state === 'gekuendigt' || s.state === 'beendet' || s.state === 'pausiert' || s.daysLeft === null) continue;
    if (s.daysLeft < 0 || s.daysLeft > NOTICE_DAYS) continue;
    out.push({
      id: `kuend-${r.id}-${s.deadline}`,
      title: `${r.description || r.category}: ${s.daysLeft === 0 ? 'heute letzter Tag zum Kündigen' : `noch ${s.daysLeft} ${s.daysLeft === 1 ? 'Tag' : 'Tage'} kündbar`}`,
      body: `Kündigen bis ${formatDate(s.deadline)} · ${formatMoney(r.amount)}`,
      href: '#/abos',
    });
  }

  for (const trip of data.trips) {
    const d = daysBetween(t, trip.start);
    if (!((d === 1 && hour >= 18) || d === 0)) continue;
    const { done, total } = packProgress(trip.packing);
    const first = sortLegs(trip.legs).find((l) => l.date >= t && l.date <= addDays(t, 1));
    const parts = [total > done ? `Noch ${total - done} von ${total} Sachen packen` : total ? 'Alles gepackt' : '', first ? `${first.title}${first.time ? ` um ${first.time}` : ''}` : ''].filter(Boolean);
    out.push({ id: `reise-${trip.id}-${trip.start}`, title: d === 0 ? `Heute geht's los: ${trip.title}` : `Morgen geht's los: ${trip.title}`, body: parts.join(' · ') || 'Gute Reise!', href: `#/reisen/${trip.id}` });
  }

  // Verliehenes und Geliehenes: am Rückgabetag (oder bis zu einer Woche danach, falls Daywerk zu war)
  for (const l of data.loans ?? []) {
    const s = loanStatus(l, t);
    if (s.daysLeft === null || s.daysLeft > 0 || s.daysLeft < -7 || (s.daysLeft === 0 && hour < 9)) continue;
    const who = loanWho(l, data.people);
    out.push({
      id: `leihe-${l.id}-${l.due}`,
      title: l.direction === 'verliehen' ? `${who} sollte ${l.title} zurückgeben` : `${l.title} an ${who} zurückgeben`,
      body: s.daysLeft === 0 ? 'Heute ist der vereinbarte Tag.' : `War bis ${formatDate(l.due!)} vereinbart.`,
      href: '#/sachen',
    });
  }

  // Garantien: einen Monat vor dem Ende, solange ein Mangel noch gemeldet werden kann
  for (const w of data.warranties ?? []) {
    const s = warrantyStatus(w, t);
    if (s.daysLeft < 0 || s.daysLeft > WARRANTY_NOTICE_DAYS) continue;
    out.push({
      id: `garantie-${w.id}-${w.until}`,
      title: `Garantie für ${w.title} endet ${s.daysLeft === 0 ? 'heute' : `in ${s.daysLeft} ${s.daysLeft === 1 ? 'Tag' : 'Tagen'}`}`,
      body: `Bis ${formatDate(w.until)}${w.store ? ` · gekauft bei ${w.store}` : ''}. Funktioniert noch alles?`,
      href: '#/sachen',
    });
  }
  return out;
}
