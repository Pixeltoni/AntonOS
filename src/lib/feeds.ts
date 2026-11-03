import type { CalEvent, CalFeed, ID } from '../types';
import { parseICS } from './ics';

/** Alle so viele Millisekunden wird ein Abo neu geladen */
export const FEED_REFRESH = 3 * 3_600_000;

/** webcal:// → https://, Leerzeichen weg. null, wenn es kein Web-Link ist. */
export function feedUrl(raw: string): string | null {
  const url = raw.trim().replace(/^webcals?:\/\//i, 'https://');
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Name aus dem Kalender selbst (X-WR-CALNAME), sonst der Host */
export function feedName(text: string, url: string): string {
  const m = text.match(/^X-WR-CALNAME:(.+)$/m);
  if (m) return m[1].trim().replace(/\\([,;\\])/g, '$1');
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Kalender';
  }
}

/**
 * Ersetzt die Termine eines Abos durch den neuen Stand. Eigene Termine bleiben unberührt;
 * die Termine des Abos bekommen dessen Farbe.
 */
export function applyFeed(events: CalEvent[], feed: Pick<CalFeed, 'id' | 'color'>, text: string, newId: () => ID): { events: CalEvent[]; count: number } {
  const incoming = parseICS(text);
  const kept = events.filter((e) => e.feedId !== feed.id);
  const fresh = incoming.map((d) => ({ ...d, id: newId(), color: feed.color, feedId: feed.id, remind: d.remind ?? null }));
  return { events: [...kept, ...fresh], count: fresh.length };
}

/** Muss das Abo neu geladen werden? */
export const feedStale = (feed: CalFeed, now: number) => !feed.lastSync || now - feed.lastSync > FEED_REFRESH;

/** Verständliche Fehlermeldung */
export function feedError(status: number | null, text?: string): string {
  if (status === null) return 'Nicht erreichbar. Im Browser blockieren viele Uni-Server den Abruf – in der iPhone-App klappt es.';
  if (status === 404) return 'Den Kalender gibt es unter diesem Link nicht (404).';
  if (status === 401 || status === 403) return 'Kein Zugriff – ist der Link noch gültig?';
  if (status >= 400) return `Der Server antwortet mit Fehler ${status}.`;
  if (text !== undefined && !text.includes('BEGIN:VCALENDAR')) return 'Unter dem Link liegt kein Kalender (.ics).';
  return '';
}
