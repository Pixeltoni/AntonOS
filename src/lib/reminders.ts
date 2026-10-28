import type { Data } from '../types';
import { addDays, daysBetween, formatDate, toDateStr } from './dates';
import { formatMoney } from './life';
import { daysLabel, upcomingBirthdays } from './people';
import { contractStatus } from './subscriptions';
import { packProgress, sortLegs } from './trips';

export interface Notice {
  /** Feste Kennung, damit jeder Hinweis nur einmal kommt */
  id: string;
  title: string;
  body: string;
  href: string;
}

/** So viele Tage vor einer Kündigungsfrist erinnert AntonOS */
export const NOTICE_DAYS = 14;

/**
 * Hinweise, die jetzt fällig sind: Geburtstage eine Woche vorher und am Tag selbst (ab 8 Uhr),
 * Kündigungsfristen zwei Wochen vorher und Reisen am Vorabend (ab 18 Uhr).
 */
export function dueNotices(data: Pick<Data, 'people' | 'recurring' | 'trips'>, now: Date): Notice[] {
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
  return out;
}
