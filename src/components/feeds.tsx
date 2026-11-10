import { useCallback, useEffect, useRef, useState } from 'react';
import { CapacitorHttp } from '@capacitor/core';
import { newId, useStore } from '../store';
import type { CalFeed, EventColor } from '../types';
import { applyFeed, feedError, feedName, feedStale, feedUrl } from '../lib/feeds';
import { EVENT_COLORS } from '../lib/calendar';
import { isNativeApp } from '../lib/native';
import { useToast } from './toast';

/** Lädt einen Kalender: in der iPhone-App am Browser vorbei (kein CORS), sonst per fetch. */
async function download(url: string): Promise<{ status: number | null; text: string }> {
  try {
    if (isNativeApp()) {
      const r = await CapacitorHttp.get({ url, responseType: 'text', headers: { Accept: 'text/calendar, */*' } });
      return { status: r.status, text: typeof r.data === 'string' ? r.data : String(r.data ?? '') };
    }
    const r = await fetch(url, { cache: 'no-store' });
    return { status: r.status, text: await r.text() };
  } catch {
    return { status: null, text: '' };
  }
}

/** Gibt eine Funktion zurück, die ein Abo neu lädt und die Termine ersetzt. */
function useFeedSync() {
  const { mutate } = useStore();
  return useCallback(
    async (feed: CalFeed): Promise<string> => {
      const { status, text } = await download(feed.url);
      const error = status === null || status >= 400 ? feedError(status) : feedError(status, text);
      mutate((d) => {
        const feeds = d.settings.feeds ?? [];
        if (!feeds.some((f) => f.id === feed.id)) return d;
        if (error) return { ...d, settings: { ...d.settings, feeds: feeds.map((f) => (f.id === feed.id ? { ...f, error } : f)) } };
        const { events, count } = applyFeed(d.events, feed, text, newId);
        return { ...d, events, settings: { ...d.settings, feeds: feeds.map((f) => (f.id === feed.id ? { ...f, error: undefined, lastSync: Date.now(), count } : f)) } };
      });
      return error;
    },
    [mutate],
  );
}

/** Lädt abonnierte Kalender beim Start und danach alle paar Stunden neu. */
export function useCalendarFeeds() {
  const { data } = useStore();
  const sync = useFeedSync();
  const feeds = useRef(data.settings.feeds ?? []);
  feeds.current = data.settings.feeds ?? [];
  useEffect(() => {
    const check = () => {
      if (!navigator.onLine) return;
      for (const f of feeds.current) if (feedStale(f, Date.now())) void sync(f);
    };
    const first = setTimeout(check, 3000);
    const id = setInterval(check, 15 * 60_000);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sync]);
}

const ago = (ms: number) => {
  const min = Math.round((Date.now() - ms) / 60_000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  return h < 24 ? `vor ${h} Std.` : `vor ${Math.round(h / 24)} Tagen`;
};

/** Abos verwalten: Link einfügen, Farbe, aktualisieren, entfernen */
export function FeedsPanel() {
  const { data, mutate } = useStore();
  const { show } = useToast();
  const sync = useFeedSync();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const feeds = data.settings.feeds ?? [];

  const setFeeds = (fn: (f: CalFeed[]) => CalFeed[]) => mutate((d) => ({ ...d, settings: { ...d.settings, feeds: fn(d.settings.feeds ?? []) } }));

  const subscribe = async () => {
    const clean = feedUrl(url);
    if (!clean) return show('Das ist kein gültiger Link (https:// oder webcal://)');
    if (feeds.some((f) => f.url === clean)) return show('Diesen Kalender hast du schon abonniert');
    setBusy('neu');
    const { status, text } = await download(clean);
    const error = status === null || status >= 400 ? feedError(status) : feedError(status, text);
    setBusy(null);
    if (error) return show(error, undefined, 8000);
    const colors = Object.keys(EVENT_COLORS) as EventColor[];
    const feed: CalFeed = { id: newId(), name: feedName(text, clean), url: clean, color: colors[(feeds.length + 5) % colors.length], lastSync: Date.now() };
    mutate((d) => {
      const { events, count } = applyFeed(d.events, feed, text, newId);
      return { ...d, events, settings: { ...d.settings, feeds: [...(d.settings.feeds ?? []), { ...feed, count }] } };
    });
    setUrl('');
    show(`„${feed.name}“ abonniert`);
  };

  const refresh = async (f: CalFeed) => {
    setBusy(f.id);
    const error = await sync(f);
    setBusy(null);
    show(error || `„${f.name}“ ist aktuell`, undefined, error ? 8000 : 3000);
  };

  const remove = (f: CalFeed) => {
    if (!confirm(`„${f.name}“ abbestellen? Die Termine daraus verschwinden aus dem Kalender.`)) return;
    mutate((d) => ({ ...d, events: d.events.filter((e) => e.feedId !== f.id), settings: { ...d.settings, feeds: (d.settings.feeds ?? []).filter((x) => x.id !== f.id) } }));
  };

  return (
    <div className="feeds">
      {feeds.length > 0 && (
        <ul className="ios-list">
          {feeds.map((f) => (
            <li key={f.id}>
              <span className="exam-dot" style={{ background: EVENT_COLORS[f.color]?.hex }} aria-hidden />
              <div className="grow">
                <input className="feed-name" value={f.name} aria-label="Name des Kalenders" onChange={(e) => setFeeds((all) => all.map((x) => (x.id === f.id ? { ...x, name: e.target.value } : x)))} />
                <div className={`small ${f.error ? 'danger' : 'muted'}`}>
                  {f.error ?? (f.lastSync ? `${ago(f.lastSync)} aktualisiert · ${f.count ?? 0} Termine` : 'noch nicht geladen')}
                </div>
              </div>
              <select
                aria-label="Farbe"
                value={f.color}
                onChange={(e) => {
                  const color = e.target.value as EventColor;
                  mutate((d) => ({
                    ...d,
                    events: d.events.map((ev) => (ev.feedId === f.id ? { ...ev, color } : ev)),
                    settings: { ...d.settings, feeds: (d.settings.feeds ?? []).map((x) => (x.id === f.id ? { ...x, color } : x)) },
                  }));
                }}
              >
                {(Object.keys(EVENT_COLORS) as EventColor[]).map((c) => <option key={c} value={c}>{EVENT_COLORS[c].label}</option>)}
              </select>
              <button type="button" className="icon" onClick={() => void refresh(f)} disabled={busy === f.id} aria-label={`${f.name} aktualisieren`} title="Aktualisieren">↻</button>
              <button type="button" className="icon" onClick={() => remove(f)} aria-label={`${f.name} abbestellen`} title="Abbestellen">✕</button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="row wrap"
        onSubmit={(e) => {
          e.preventDefault();
          void subscribe();
        }}
      >
        <input className="grow" type="url" inputMode="url" placeholder="webcal://… oder https://….ics" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Link zum Kalender" />
        <button type="submit" className="primary" disabled={!url.trim() || busy === 'neu'}>{busy === 'neu' ? 'Lädt …' : 'Abonnieren'}</button>
      </form>
      <p className="muted small">
        Den Link findest du meist im Campus-Portal oder in Moodle unter „Kalender exportieren“ bzw. „Abonnieren“. Daywerk lädt ihn alle drei Stunden neu – Änderungen an Räumen oder Zeiten kommen so von selbst.
        {!isNativeApp() && ' Im Browser blockieren manche Server den Abruf; in der iPhone-App klappt es immer.'}
      </p>
    </div>
  );
}
