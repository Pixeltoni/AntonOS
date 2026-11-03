import type { Data, Place } from '../types';
import { addDays, toDateStr } from './dates';
import { packProgress } from './trips';
import type { NativePlaceNotice } from './native';

/** iOS überwacht höchstens 20 Bereiche pro App */
export const MAX_PLACES = 20;

export const PLACE_KINDS: { id: Place['kind']; label: string; hint: string }[] = [
  { id: 'einkauf', label: '🛒 Geschäft', hint: 'Zeigt beim Ankommen die Einkaufsliste' },
  { id: 'ort', label: '📍 Ort', hint: 'Erinnert an Aufgaben, die du diesem Ort zuordnest' },
  { id: 'zuhause', label: '🏠 Zuhause', hint: 'Beim Losgehen vor einer Reise: noch nicht Eingepacktes' },
];

const list = (names: string[], max = 4) => names.slice(0, max).join(', ') + (names.length > max ? ` und ${names.length - max} mehr` : '');

/** Mitteilungen für die Orte nach aktuellem Stand (Einkaufsliste, Aufgaben, Packliste) */
export function placeNotices(data: Pick<Data, 'shopping' | 'tasks' | 'trips' | 'settings'>, now: Date): NativePlaceNotice[] {
  const t = toDateStr(now);
  const out: NativePlaceNotice[] = [];
  for (const p of data.settings.places ?? []) {
    const base = { id: p.id, lat: p.lat, lon: p.lon, radius: Math.max(100, Math.min(1000, p.radius || 150)) };
    if (p.kind === 'einkauf') {
      const open = data.shopping.filter((s) => !s.done).map((s) => (s.amount ? `${s.amount} ${s.name}` : s.name));
      if (open.length) out.push({ ...base, title: `🛒 Du bist bei ${p.name}`, body: `${open.length} ${open.length === 1 ? 'Sache' : 'Sachen'} auf der Einkaufsliste: ${list(open)}`, onExit: false, href: '#/einkauf' });
    } else if (p.kind === 'ort') {
      const tasks = data.tasks.filter((x) => x.placeId === p.id && x.status !== 'erledigt').map((x) => x.title);
      if (tasks.length) out.push({ ...base, title: `📍 ${p.name}`, body: list(tasks, 3), onExit: false, href: '#/aufgaben' });
    } else {
      const trip = data.trips.find((tr) => tr.start >= t && tr.start <= addDays(t, 1));
      const left = trip ? trip.packing.filter((x) => !x.done).map((x) => x.title) : [];
      if (trip && left.length) {
        const { done, total } = packProgress(trip.packing);
        out.push({ ...base, title: `🧳 ${trip.title}: noch nicht eingepackt`, body: `${done} von ${total} eingepackt – fehlt noch: ${list(left)}`, onExit: true, href: `#/reisen/${trip.id}` });
      }
    }
  }
  return out.slice(0, MAX_PLACES);
}
