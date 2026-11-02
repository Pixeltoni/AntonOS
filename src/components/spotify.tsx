import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import type { WidgetVariant } from '../types';
import { App as NativeApp } from '@capacitor/app';
import { api, completeLogin, deviceIcon, handleRedirect, isNativeCallback, loadToken, login, logout, accessToken, parseCallback, findPhone, pickDevice, redirectUri, spotifyAppUri, SpotifyError, type Device } from '../lib/spotify';
import { isNativeApp } from '../lib/native';
import { safeImageSrc, spotifyEmbedUrl } from '../lib/life';
import { Empty, Panel } from './ui';

/* ---------- Minimale Typen für Web API und Web Playback SDK ---------- */

interface Image { url: string }
interface Track { name: string; uri: string; duration_ms: number; artists: { name: string }[]; album: { name: string; images: Image[] } }
interface PlaybackContext { type: string; uri: string; external_urls?: { spotify?: string } }
interface PlaybackState {
  is_playing: boolean;
  context: PlaybackContext | null;
  progress_ms: number | null;
  item: Track | null;
  device: { id: string | null; name: string; type?: string; volume_percent: number | null };
  shuffle_state: boolean;
}
interface Playlist { id: string; name: string; uri: string; images: Image[] | null; tracks?: { total: number }; items?: { total: number } }
interface Profile { display_name: string | null; product?: string }

interface SdkPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  activateElement(): Promise<void>;
  addListener(event: string, cb: (arg: never) => void): void;
}
declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: { Player: new (opts: { name: string; getOAuthToken: (cb: (t: string) => void) => void; volume: number }) => SdkPlayer };
  }
}

/* ---------- Kontext ---------- */

interface SpotifyCtx {
  clientId: string;
  connected: boolean;
  profile: Profile | null;
  state: PlaybackState | null;
  deviceId: string | null;
  error: string;
  busy: boolean;
  connect(): void;
  disconnect(): void;
  command(action: () => Promise<unknown>): Promise<void>;
  playContext(uri: string): Promise<void>;
  playHere(): Promise<void>;
  /** Wiedergabe fortsetzen oder starten – sucht bei Bedarf selbst ein Gerät. */
  resume(): Promise<void>;
  /** Wiedergabe auf ein anderes Gerät schieben. */
  transfer(id: string): Promise<void>;
  /** Spotify-App öffnen (optional direkt mit Playlist/Album). */
  openApp(uri?: string | null): void;
  /** Nur in der App: auf dem eigenen iPhone abspielen. */
  playOnPhone(): Promise<void>;
  devices: Device[];
  loadDevices(): Promise<Device[]>;
  refresh(): Promise<PlaybackState | null>;
}

const Ctx = createContext<SpotifyCtx | null>(null);

export function useSpotify(): SpotifyCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSpotify außerhalb von SpotifyProvider');
  return c;
}

export function SpotifyProvider({ children }: { children: ReactNode }) {
  const { data } = useStore();
  const clientId = data.settings.spotifyClientId.trim();
  const [connected, setConnected] = useState(() => loadToken() !== null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [state, setState] = useState<PlaybackState | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const player = useRef<SdkPlayer | null>(null);
  /** In der App: Was nach dem Öffnen der Spotify-App abgespielt werden soll, sobald AntonOS wieder vorne ist. */
  const pending = useRef<{ body: Record<string, unknown> | null; at: number; phone?: boolean } | null>(null);

  // Rückkehr vom Spotify-Login verarbeiten
  useEffect(() => {
    if (!clientId) return;
    handleRedirect(clientId)
      .then((done) => done && setConnected(true))
      .catch((e: Error) => setError(e.message));
  }, [clientId]);

  // iOS-App: Spotify leitet auf antonos://spotify-callback zurück, das System reicht die Adresse hierher
  useEffect(() => {
    if (!clientId || !isNativeApp()) return;
    const handle = NativeApp.addListener('appUrlOpen', ({ url }) => {
      if (!isNativeCallback(url)) return;
      void import('@capacitor/browser').then(({ Browser }) => Browser.close()).catch(() => undefined);
      location.hash = '#/musik';
      completeLogin(clientId, parseCallback(url.slice(url.indexOf('?'))))
        .then((done) => {
          if (done) {
            setError('');
            setConnected(true);
          }
        })
        .catch((e: Error) => setError(e.message));
    });
    return () => void handle.then((h) => h.remove());
  }, [clientId]);

  const fail = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
    if (!loadToken()) setConnected(false);
  }, []);

  const refresh = useCallback(async (): Promise<PlaybackState | null> => {
    if (!clientId || !loadToken()) return null;
    try {
      const next = await api<PlaybackState>(clientId, '/me/player?additional_types=episode');
      setState(next);
      return next;
    } catch (e) {
      fail(e);
      return null;
    }
  }, [clientId, fail]);

  const loadDevices = useCallback(async (): Promise<Device[]> => {
    if (!clientId || !loadToken()) return [];
    try {
      const list = (await api<{ devices: Device[] }>(clientId, '/me/player/devices'))?.devices ?? [];
      setDevices(list);
      return list;
    } catch {
      return [];
    }
  }, [clientId]);

  const openApp = useCallback((uri?: string | null) => {
    // In der App reicht iOS spotify:-Adressen an die Spotify-App weiter
    if (isNativeApp()) location.href = spotifyAppUri(uri);
    else window.open(uri ? `https://open.spotify.com/${uri.split(':').slice(1).join('/')}` : 'https://open.spotify.com/', '_blank', 'noopener');
  }, []);

  /**
   * Startet die Wiedergabe (body null = fortsetzen). Ist kein Gerät aktiv, sucht AntonOS selbst eins;
   * findet es keins, öffnet es in der App die Spotify-App und spielt nach der Rückkehr weiter.
   */
  const start = useCallback(
    async (body: Record<string, unknown> | null, allowOpen = true) => {
      const send = (device?: string | null) =>
        api(clientId, `/me/player/play${device ? `?device_id=${device}` : ''}`, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });
      if (state?.device?.id) {
        try {
          await send();
          return;
        } catch (e) {
          if (!(e instanceof SpotifyError) || e.status !== 404) throw e;
        }
      }
      const target = deviceId ?? pickDevice(await loadDevices(), isNativeApp())?.id;
      if (target) {
        await send(target);
        return;
      }
      if (isNativeApp() && allowOpen) {
        pending.current = { body, at: Date.now() };
        openApp(typeof body?.context_uri === 'string' ? body.context_uri : null);
        return;
      }
      throw new Error(
        isNativeApp()
          ? 'Spotify ist noch auf keinem Gerät bereit. Tippe in der Spotify-App einmal auf Play, dann übernimmt AntonOS.'
          : 'Kein aktives Gerät. Starte die Wiedergabe „Hier im Browser“ oder öffne Spotify auf einem Gerät.',
      );
    },
    [clientId, state?.device?.id, deviceId, loadDevices, openApp],
  );

  // Profil laden und Wiedergabe regelmäßig abfragen
  useEffect(() => {
    if (!connected || !clientId) return;
    api<Profile>(clientId, '/me').then(setProfile).catch(fail);
    refresh();
    loadDevices();
    const timer = setInterval(() => document.visibilityState === 'visible' && refresh(), 4000);
    return () => clearInterval(timer);
  }, [connected, clientId, refresh, loadDevices, fail]);

  // Beim Zurückkehren (Tab oder App wieder vorne) sofort aktualisieren statt auf den nächsten Takt zu warten
  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    if (!connected || !clientId) return;
    const back = async () => {
      const now = await refresh();
      void loadDevices();
      const wanted = pending.current;
      pending.current = null;
      if (!wanted || Date.now() - wanted.at > 3 * 60_000) return;
      // „Dieses iPhone“ gewählt: Wiedergabe aufs iPhone holen, sobald es als Gerät auftaucht
      if (wanted.phone) {
        if (now?.is_playing && now.device.type?.toLowerCase() === 'smartphone') return;
        for (const wait of [800, 2000, 4000]) {
          await new Promise((r) => setTimeout(r, wait));
          const phone = findPhone(await loadDevices());
          if (!phone?.id) continue;
          try {
            await api(clientId, '/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [phone.id], play: true }) });
            setError('');
            setTimeout(() => void refresh(), 600);
            setTimeout(() => void loadDevices(), 900);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
          return;
        }
        setError('Das iPhone hat sich bei Spotify noch nicht gemeldet. Tippe in der Spotify-App einmal auf Play, dann erscheint es hier.');
        return;
      }
      // Nach dem Ausflug in die Spotify-App: dort Gewähltes weiterspielen, falls noch nichts läuft
      if (now?.is_playing) return;
      // Die Spotify-App braucht nach dem Start einen Moment, bis sie als Gerät auftaucht
      for (const wait of [800, 2000, 4000]) {
        await new Promise((r) => setTimeout(r, wait));
        try {
          await startRef.current(wanted.body, false);
          setError('');
          setTimeout(() => void refresh(), 600);
          return;
        } catch (e) {
          if (wait === 4000) setError(e instanceof Error ? e.message : String(e));
        }
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && void back();
    document.addEventListener('visibilitychange', onVisible);
    const handle = isNativeApp() ? NativeApp.addListener('appStateChange', ({ isActive }) => isActive && void back()) : null;
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void handle?.then((h) => h.remove());
    };
  }, [connected, clientId, refresh, loadDevices]);


  // Web Playback SDK: macht diesen Browser zu einem Spotify-Gerät (nur mit Premium).
  // In der iOS-App fehlt dem WebView der Kopierschutz dafür – dort steuert AntonOS nur andere Geräte.
  useEffect(() => {
    if (!connected || !clientId || profile?.product !== 'premium' || isNativeApp()) return;
    let cancelled = false;
    const setup = () => {
      if (cancelled || !window.Spotify) return;
      const p = new window.Spotify.Player({
        name: 'AntonOS',
        getOAuthToken: (cb) => void accessToken(clientId).then(cb).catch(fail),
        volume: 0.6,
      });
      p.addListener('ready', ({ device_id }: { device_id: string }) => setDeviceId(device_id));
      p.addListener('not_ready', () => setDeviceId(null));
      p.addListener('player_state_changed', () => void refresh());
      p.addListener('initialization_error', ({ message }: { message: string }) => setError(`Player: ${message}`));
      p.addListener('authentication_error', ({ message }: { message: string }) => setError(`Anmeldung: ${message}`));
      p.addListener('account_error', () => setError('Für die Wiedergabe im Browser brauchst du Spotify Premium.'));
      p.connect();
      player.current = p;
    };
    if (window.Spotify) setup();
    else {
      window.onSpotifyWebPlaybackSDKReady = setup;
      if (!document.getElementById('spotify-sdk')) {
        const s = document.createElement('script');
        s.id = 'spotify-sdk';
        s.src = 'https://sdk.scdn.co/spotify-player.js';
        document.body.appendChild(s);
      }
    }
    return () => {
      cancelled = true;
      player.current?.disconnect();
      player.current = null;
      setDeviceId(null);
    };
  }, [connected, clientId, profile?.product, refresh, fail]);

  const command = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true);
      setError('');
      try {
        await action();
        setTimeout(refresh, 400);
      } catch (e) {
        fail(e);
      } finally {
        setBusy(false);
      }
    },
    [refresh, fail],
  );

  const playHere = useCallback(async () => {
    if (!deviceId) return;
    await player.current?.activateElement();
    await command(() => api(clientId, '/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [deviceId], play: true }) }));
  }, [clientId, deviceId, command]);

  const playContext = useCallback(
    async (uri: string) => {
      await player.current?.activateElement();
      await command(() => start({ context_uri: uri }));
    },
    [start, command],
  );

  const resume = useCallback(async () => {
    if (deviceId && !state?.device?.id) return playHere();
    await command(() => start(null));
  }, [deviceId, state?.device?.id, playHere, start, command]);

  const transfer = useCallback(
    async (id: string) => {
      await command(() => api(clientId, '/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [id], play: true }) }));
      setTimeout(() => void loadDevices(), 800);
    },
    [clientId, command, loadDevices],
  );

  /** In der App: Wiedergabe aufs eigene iPhone holen – notfalls über einen kurzen Abstecher in die Spotify-App. */
  const playOnPhone = useCallback(async () => {
    const phone = findPhone(await loadDevices());
    if (phone?.id) {
      await command(() => api(clientId, '/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [phone.id], play: true }) }));
      setTimeout(() => void loadDevices(), 800);
      return;
    }
    pending.current = { body: null, at: Date.now(), phone: true };
    openApp(state?.context?.uri ?? null);
  }, [clientId, command, loadDevices, openApp, state?.context?.uri]);

  const value: SpotifyCtx = {
    clientId,
    connected,
    profile,
    state,
    deviceId,
    error,
    busy,
    connect: () => {
      setError('');
      login(clientId).catch(fail);
    },
    disconnect: () => {
      logout();
      player.current?.disconnect();
      setConnected(false);
      setProfile(null);
      setState(null);
    },
    command,
    playContext,
    playHere,
    resume,
    transfer,
    openApp,
    playOnPhone,
    devices,
    loadDevices,
    refresh,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ---------- Oberfläche ---------- */

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

function Setup() {
  const { data, updateSettings } = useStore();
  const [id, setId] = useState(data.settings.spotifyClientId);
  const uri = redirectUri();
  return (
    <div className="col spotify-setup">
      <p>So verbindest du AntonOS einmalig mit deinem Spotify-Konto:</p>
      <ol className="small">
        <li>Öffne das <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer">Spotify Developer Dashboard</a> und melde dich an.</li>
        <li>Klicke auf <strong>Create app</strong>. Name und Beschreibung sind egal (z. B. „AntonOS“).</li>
        <li>
          Trage als <strong>Redirect URI</strong> genau diese Adresse ein:
          <div className="row">
            <code className="grow">{uri}</code>
            <button type="button" onClick={() => navigator.clipboard?.writeText(uri)}>Kopieren</button>
          </div>
        </li>
        {isNativeApp() && (
          <li>
            Nutzt du AntonOS auch im Browser? Dann trage dort zusätzlich die Adresse ein, die AntonOS im Browser hier anzeigt – eine Spotify-App kann mehrere Redirect URIs haben.
          </li>
        )}
        <li>Wähle bei den APIs <strong>Web API</strong> und <strong>Web Playback SDK</strong> aus und speichere.</li>
        <li>Kopiere die <strong>Client ID</strong> aus den Einstellungen der App hier hinein:</li>
      </ol>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          updateSettings({ spotifyClientId: id.trim() });
        }}
      >
        <input className="grow" placeholder="Client ID" value={id} onChange={(e) => setId(e.target.value)} aria-label="Spotify Client ID" />
        <button className="primary" type="submit" disabled={!/^[a-f0-9]{32}$/i.test(id.trim())}>Speichern</button>
      </form>
      <p className="muted small">Die Client ID ist nicht geheim. Dein Login-Token bleibt nur auf diesem Gerät und wird nicht ins Backup übernommen.</p>
    </div>
  );
}

/** In der App braucht die Spotify-App im Dashboard eine zweite Redirect URI. */
function NativeRedirectHint() {
  const uri = redirectUri();
  return (
    <div className="muted small">
      Klappt der Login in der App nicht („Invalid redirect URI“)? Trage im{' '}
      <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer">Spotify Developer Dashboard</a> bei deiner App zusätzlich diese Redirect URI ein:
      <div className="row">
        <code className="grow">{uri}</code>
        <button type="button" onClick={() => navigator.clipboard?.writeText(uri)}>Kopieren</button>
      </div>
    </div>
  );
}

function Embed() {
  const { data } = useStore();
  const embed = spotifyEmbedUrl(data.settings.spotifyUrl);
  // In der iPhone-App spielt die eingebettete Playlist nur 30-Sekunden-Ausschnitte – dort lieber die Spotify-App
  if (!embed || isNativeApp()) return null;
  return <iframe title="Spotify-Playlist" src={embed} className="spotify" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" />;
}

export function NowPlaying({ mini = false }: { mini?: boolean }) {
  const s = useSpotify();
  const { state, deviceId, busy, clientId } = s;
  const track = state?.item;
  const cover = safeImageSrc(track?.album.images[0]?.url);
  const playing = state?.is_playing ?? false;
  const call = (path: string, method = 'POST') => s.command(() => api(clientId, path, { method }));

  return (
    <div className={`now-playing ${mini ? 'mini' : ''}`}>
      {cover ? <img src={cover} alt="" className="np-cover" /> : <div className="np-cover placeholder">🎵</div>}
      <div className="np-info">
        <strong className="np-title">{track?.name ?? 'Gerade läuft nichts'}</strong>
        <span className="muted small">{track ? track.artists.map((a) => a.name).join(', ') : 'Wähle eine Playlist oder starte die Wiedergabe.'}</span>
        {track && !mini && (
          <div className="np-progress">
            <span className="small muted">{fmt(state?.progress_ms ?? 0)}</span>
            <div className="progress grow"><span style={{ width: `${((state?.progress_ms ?? 0) / track.duration_ms) * 100}%` }} /></div>
            <span className="small muted">{fmt(track.duration_ms)}</span>
          </div>
        )}
        <div className="np-controls">
          <button onClick={() => call('/me/player/previous')} disabled={busy || !state} aria-label="Zurück">⏮</button>
          <button
            className="primary"
            onClick={() => (playing ? call('/me/player/pause', 'PUT') : s.resume())}
            disabled={busy}
            aria-label={playing ? 'Pause' : 'Abspielen'}
          >
            {playing ? '⏸' : '▶'}
          </button>
          <button onClick={() => call('/me/player/next')} disabled={busy || !state} aria-label="Weiter">⏭</button>
          {!mini && state?.device?.volume_percent != null && (
            <input
              type="range"
              min={0}
              max={100}
              defaultValue={state.device.volume_percent}
              key={state.device.id}
              onChange={(e) => {
                const v = e.target.value;
                void s.command(() => api(clientId, `/me/player/volume?volume_percent=${v}`, { method: 'PUT' }));
              }}
              aria-label="Lautstärke"
            />
          )}
        </div>
        {!mini && (
          <span className="muted small">
            {state?.device ? `🔊 ${state.device.name}` : 'Kein aktives Gerät'}
            {deviceId && state?.device?.id !== deviceId && (
              <> · <button className="link" onClick={() => s.playHere()}>Hier im Browser abspielen</button></>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------- Spotify-Karte im Stil des Spotify-Players ---------- */

const FALLBACK_COLOR = '#8a3b12';

/** Durchschnittsfarbe eines Covers, abgedunkelt für gut lesbare weiße Schrift. */
function useCoverColor(url: string | null): string {
  const [color, setColor] = useState(FALLBACK_COLOR);
  useEffect(() => {
    if (!url) {
      setColor(FALLBACK_COLOR);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 8;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, 8, 8);
        const px = ctx.getImageData(0, 0, 8, 8).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < px.length; i += 4) {
          r += px[i];
          g += px[i + 1];
          b += px[i + 2];
        }
        const n = px.length / 4;
        [r, g, b] = [r / n, g / n, b / n];
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const k = lum > 0.42 ? 0.42 / lum : 1;
        setColor(`rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`);
      } catch {
        setColor(FALLBACK_COLOR);
      }
    };
    img.onerror = () => setColor(FALLBACK_COLOR);
    img.src = url;
  }, [url]);
  return color;
}

function SpotifyLogo() {
  return (
    <svg className="sp-logo" viewBox="0 0 24 24" aria-label="Spotify" role="img">
      <circle cx="12" cy="12" r="12" fill="#fff" />
      <path
        fill="#000"
        d="M17.5 16.6a.75.75 0 0 1-1 .25c-2.8-1.7-6.3-2.1-10.4-1.1a.75.75 0 1 1-.35-1.45c4.5-1 8.4-.6 11.5 1.3.35.2.46.66.25 1Zm1.45-3.25a.94.94 0 0 1-1.3.3c-3.2-2-8.1-2.55-11.9-1.4a.94.94 0 1 1-.55-1.8c4.35-1.3 9.75-.68 13.4 1.6.45.27.6.86.35 1.3Zm.13-3.4C15.2 7.65 8.85 7.45 5.15 8.57a1.12 1.12 0 1 1-.65-2.15c4.25-1.3 11.3-1.05 15.75 1.6a1.12 1.12 0 0 1-1.17 1.93Z"
      />
    </svg>
  );
}

interface Queue { currently_playing: Track | null; queue: Track[] }

/** Name und Link der aktuellen Playlist bzw. des Albums. */
function useContextInfo(context: PlaybackContext | null, track: Track | null | undefined) {
  const { clientId } = useSpotify();
  const [info, setInfo] = useState<{ uri: string; name: string; image: string | null } | null>(null);
  const uri = context?.uri ?? null;
  useEffect(() => {
    if (!uri) {
      setInfo(null);
      return;
    }
    const [, type, id] = uri.split(':');
    if (type !== 'playlist' && type !== 'album') {
      setInfo(null);
      return;
    }
    let cancelled = false;
    api<{ name: string; images: Image[] | null }>(clientId, `/${type}s/${id}?fields=name,images`)
      .then((r) => !cancelled && r && setInfo({ uri, name: r.name, image: r.images?.[0]?.url ?? null }))
      .catch(() => !cancelled && setInfo(null));
    return () => {
      cancelled = true;
    };
  }, [uri, clientId]);
  if (info && info.uri === uri) return info;
  return track ? { uri: track.uri, name: track.album.name, image: track.album.images[0]?.url ?? null } : null;
}

/** Spotify-Fenster: Cover, Titel, Steuerung und die nächsten Titel – wie der Spotify-Player. */
export function SpotifyCard({ rows: maxRows = 5 }: { rows?: number }) {
  const s = useSpotify();
  const { state, clientId, busy, deviceId } = s;
  const track = state?.item ?? null;
  const ctx = useContextInfo(state?.context ?? null, track);
  const cover = safeImageSrc(ctx?.image ?? track?.album.images[0]?.url);
  const bg = useCoverColor(cover);
  const playing = state?.is_playing ?? false;
  const [queue, setQueue] = useState<Track[]>([]);
  const call = (path: string, method = 'POST') => s.command(() => api(clientId, path, { method }));

  // Warteschlange neu laden, sobald ein anderer Titel läuft
  useEffect(() => {
    if (!track) {
      setQueue([]);
      return;
    }
    let cancelled = false;
    api<Queue>(clientId, '/me/player/queue')
      .then((q) => !cancelled && setQueue((q?.queue ?? []).slice(0, 12)))
      .catch(() => !cancelled && setQueue([]));
    return () => {
      cancelled = true;
    };
  }, [track?.uri, clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const playTrack = (t: Track) =>
    s.command(() =>
      api(clientId, '/me/player/play', {
        method: 'PUT',
        body: JSON.stringify(state?.context?.uri ? { context_uri: state.context.uri, offset: { uri: t.uri } } : { uris: [t.uri] }),
      }),
    );

  const rows = track ? [track, ...queue.filter((t) => t.uri !== track.uri)].slice(0, maxRows) : [];
  const link = state?.context?.external_urls?.spotify ?? 'https://open.spotify.com/';

  return (
    <div className="sp-card" style={{ ['--sp-bg' as string]: bg }}>
      <div className="sp-head">
        {cover ? <img className="sp-cover" src={cover} alt="" /> : <div className="sp-cover placeholder">🎵</div>}
        <div className="sp-meta">
          <strong className="sp-title">{ctx?.name ?? 'Spotify'}</strong>
          <span className="sp-sub">{track ? track.artists.map((a) => a.name).join(', ') : 'Gerade läuft nichts'}</span>
          {isNativeApp() ? (
            <button type="button" className="sp-save" onClick={() => s.openApp(state?.context?.uri ?? track?.uri)}>
              <span aria-hidden>⊕</span> In Spotify öffnen
            </button>
          ) : (
            <a className="sp-save" href={link} target="_blank" rel="noopener noreferrer">
              <span aria-hidden>⊕</span> Auf Spotify öffnen
            </a>
          )}
        </div>
        <SpotifyLogo />
      </div>

      <div className="sp-bar">
        <div className="sp-progress" aria-hidden>
          <span style={{ width: track ? `${((state?.progress_ms ?? 0) / track.duration_ms) * 100}%` : 0 }} />
        </div>
        <div className="sp-controls">
          <button className="sp-btn" onClick={() => call('/me/player/previous')} disabled={busy || !state} aria-label="Zurück">⏮</button>
          <button className="sp-btn" onClick={() => call('/me/player/next')} disabled={busy || !state} aria-label="Weiter">⏭</button>
          <button
            className="sp-play"
            onClick={() => (playing ? call('/me/player/pause', 'PUT') : s.resume())}
            disabled={busy}
            aria-label={playing ? 'Pause' : 'Abspielen'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
        </div>
      </div>

      {maxRows === 0 ? null : rows.length > 0 ? (
        <ol className="sp-list">
          {rows.map((t, i) => (
            <li key={`${t.uri}-${i}`} className={i === 0 ? 'current' : ''}>
              <button onClick={() => (i === 0 ? undefined : playTrack(t))} disabled={busy} title={i === 0 ? 'Läuft gerade' : `${t.name} abspielen`}>
                <span className="sp-num">{i === 0 && playing ? '♫' : i + 1}</span>
                <span className="sp-track">
                  <span className="sp-name">{t.name}</span>
                  <span className="sp-artist">{t.artists.map((a) => a.name).join(', ')}</span>
                </span>
                <span className="sp-dur">{fmt(t.duration_ms)}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="sp-empty">Starte unten eine Playlist oder spiele etwas in der Spotify-App ab.</p>
      )}

      <div className="sp-foot">
        <span>{state?.device ? `${deviceIcon(state.device.type ?? '')} ${state.device.name}` : 'Kein aktives Gerät'}</span>
        {deviceId && state?.device?.id !== deviceId && (
          <button className="link" onClick={() => s.playHere()}>Hier im Browser abspielen</button>
        )}
        {isNativeApp() && !state?.device && (
          <button className="link" onClick={() => s.openApp()}>Spotify öffnen</button>
        )}
      </div>
    </div>
  );
}

/** Geräte zum Hin- und Herschieben der Wiedergabe (Spotify Connect). */
function Devices() {
  const s = useSpotify();
  const activeId = s.state?.device?.id ?? null;
  const list = s.devices.filter((d) => d.id);
  // iOS meldet das iPhone bei Spotify nur, solange die Spotify-App aktiv ist – deshalb ein fester Knopf
  const phoneListed = list.some((d) => d.type.toLowerCase() === 'smartphone');
  const phoneButton = isNativeApp() && !phoneListed && (
    <button disabled={s.busy} onClick={() => void s.playOnPhone()} title="Öffnet kurz Spotify, danach spielt die Musik auf diesem iPhone">
      📱 Dieses iPhone
    </button>
  );
  return (
    <div className="col">
      <div className="row between">
        <h3>Geräte</h3>
        <button className="link small" onClick={() => void s.loadDevices()} disabled={s.busy}>Aktualisieren</button>
      </div>
      {list.length === 0 && !phoneButton ? (
        <p className="muted small">
          Gerade ist kein Gerät online. Öffne Spotify auf deinem Handy, Laptop oder Lautsprecher{isNativeApp() ? '' : ' oder spiele hier im Browser ab'}.
          {isNativeApp() && (
            <>
              {' '}
              <button className="link" onClick={() => s.openApp()}>Spotify öffnen</button>
            </>
          )}
        </p>
      ) : (
        <div className="row wrap">
          {phoneButton}
          {list.map((d) => {
            const active = d.id === activeId || (!activeId && d.is_active);
            return (
              <button
                key={d.id}
                className={active ? 'primary' : ''}
                disabled={s.busy || d.is_restricted || active}
                onClick={() => void s.transfer(d.id!)}
                title={active ? 'Spielt hier' : `Wiedergabe auf ${d.name} übertragen`}
              >
                {deviceIcon(d.type)} {d.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Playlists() {
  const s = useSpotify();
  const [lists, setLists] = useState<Playlist[] | null>(null);
  useEffect(() => {
    api<{ items: Playlist[] }>(s.clientId, '/me/playlists?limit=50')
      .then((r) => setLists(r?.items.filter(Boolean) ?? []))
      .catch(() => setLists([]));
  }, [s.clientId]);
  if (lists === null) return <p className="muted small">Lade Playlists …</p>;
  if (lists.length === 0) return <Empty>Keine Playlists gefunden.</Empty>;
  return (
    <div className="playlists">
      {lists.map((p) => {
        const img = safeImageSrc(p.images?.[0]?.url);
        return (
          <button key={p.id} className="playlist" onClick={() => s.playContext(p.uri)} title={`${p.name} abspielen`}>
            {img ? <img src={img} alt="" loading="lazy" /> : <span className="np-cover placeholder">🎵</span>}
            <span className="small">{p.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Das Spotify-Fenster: Einrichtung, Login, Player und Playlists. */
export function SpotifyPlayer({ compact = false, variant = 'standard' }: { compact?: boolean; variant?: WidgetVariant }) {
  const s = useSpotify();
  // Auf dem Dashboard steht die Spotify-Karte ohne eigenen Rahmen, alles andere im Panel
  const frame = (body: ReactNode) => (compact ? <Panel title="🎵 Musik" actions={<a href="#/musik">Öffnen →</a>}>{body}</Panel> : body);

  if (!s.clientId) {
    return frame(
      compact ? (
        <div className="col">
          <Embed />
          <p className="small">
            <a href="#/musik">Mit deinem Spotify-Konto verbinden →</a>
          </p>
        </div>
      ) : (
        <Setup />
      ),
    );
  }

  if (!s.connected) {
    return frame(
      <div className="col">
        <button className="spotify-btn" onClick={s.connect}>Mit Spotify verbinden</button>
        {s.error && <p className="danger small">{s.error}</p>}
        {isNativeApp() && <NativeRedirectHint />}
        <Embed />
      </div>,
    );
  }

  const premium = s.profile?.product === 'premium';
  return (
    <div className="col">
      <SpotifyCard rows={compact ? (variant === 'kompakt' ? 0 : variant === 'detail' ? 10 : 5) : 10} />
      {s.error && <p className="danger small">{s.error}</p>}
      {s.profile && !premium && (
        <p className="muted small">Ohne Spotify Premium erlaubt Spotify keine Steuerung von außen. {isNativeApp() ? 'Spiel deine Musik direkt in der Spotify-App ab.' : 'Du kannst aber die eingebettete Playlist nutzen.'}</p>
      )}
      {!compact && (
        <>
          <Devices />
          <h3>Deine Playlists</h3>
          <Playlists />
          <div className="row between">
            <span className="muted small">Angemeldet als {s.profile?.display_name ?? '…'}</span>
            <button onClick={s.disconnect}>Verbindung trennen</button>
          </div>
        </>
      )}
      {!premium && <Embed />}
      {!premium && isNativeApp() && (
        <button onClick={() => s.openApp()}>Spotify-App öffnen</button>
      )}
    </div>
  );
}

/** Kleines schwebendes Fenster, damit die Musik auf allen Seiten steuerbar bleibt. */
export function MiniPlayer({ hidden }: { hidden: boolean }) {
  const s = useSpotify();
  const [closed, setClosed] = useState(false);
  if (hidden || closed || !s.connected || !s.state?.item) return null;
  return (
    <aside className="mini-player" aria-label="Musik">
      <NowPlaying mini />
      <div className="col">
        <a href="#/musik" className="small" title="Musik öffnen">⤢</a>
        <button className="icon" onClick={() => setClosed(true)} aria-label="Mini-Player schließen">×</button>
      </div>
    </aside>
  );
}
