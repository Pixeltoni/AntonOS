import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { api, handleRedirect, loadToken, login, logout, accessToken, redirectUri } from '../lib/spotify';
import { safeImageSrc, spotifyEmbedUrl } from '../lib/life';
import { Empty } from './ui';

/* ---------- Minimale Typen für Web API und Web Playback SDK ---------- */

interface Image { url: string }
interface Track { name: string; uri: string; duration_ms: number; artists: { name: string }[]; album: { name: string; images: Image[] } }
interface PlaybackState {
  is_playing: boolean;
  progress_ms: number | null;
  item: Track | null;
  device: { id: string | null; name: string; volume_percent: number | null };
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
  refresh(): Promise<void>;
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
  const player = useRef<SdkPlayer | null>(null);

  // Rückkehr vom Spotify-Login verarbeiten
  useEffect(() => {
    if (!clientId) return;
    handleRedirect(clientId)
      .then((done) => done && setConnected(true))
      .catch((e: Error) => setError(e.message));
  }, [clientId]);

  const fail = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
    if (!loadToken()) setConnected(false);
  }, []);

  const refresh = useCallback(async () => {
    if (!clientId || !loadToken()) return;
    try {
      setState(await api<PlaybackState>(clientId, '/me/player?additional_types=episode'));
    } catch (e) {
      fail(e);
    }
  }, [clientId, fail]);

  // Profil laden und Wiedergabe regelmäßig abfragen
  useEffect(() => {
    if (!connected || !clientId) return;
    api<Profile>(clientId, '/me').then(setProfile).catch(fail);
    refresh();
    const timer = setInterval(() => document.visibilityState === 'visible' && refresh(), 4000);
    return () => clearInterval(timer);
  }, [connected, clientId, refresh, fail]);

  // Web Playback SDK: macht diesen Browser zu einem Spotify-Gerät (nur mit Premium)
  useEffect(() => {
    if (!connected || !clientId || profile?.product !== 'premium') return;
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
      // Läuft gerade nichts, im Browser abspielen (falls verfügbar)
      const target = state?.device?.id ? '' : deviceId ? `?device_id=${deviceId}` : '';
      await command(() => api(clientId, `/me/player/play${target}`, { method: 'PUT', body: JSON.stringify({ context_uri: uri }) }));
    },
    [clientId, deviceId, state?.device?.id, command],
  );

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
      <p className="muted small">Die Client ID ist nicht geheim. Dein Login-Token bleibt nur in diesem Browser und wird nicht ins Backup übernommen.</p>
    </div>
  );
}

function Embed() {
  const { data } = useStore();
  const embed = spotifyEmbedUrl(data.settings.spotifyUrl);
  if (!embed) return null;
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
            onClick={() => (state ? call(playing ? '/me/player/pause' : '/me/player/play', 'PUT') : s.playHere())}
            disabled={busy || (!state && !deviceId)}
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
export function SpotifyPlayer({ compact = false }: { compact?: boolean }) {
  const s = useSpotify();

  if (!s.clientId) {
    return compact ? (
      <div className="col">
        <Embed />
        <p className="small">
          <a href="#/musik">Mit deinem Spotify-Konto verbinden →</a>
        </p>
      </div>
    ) : (
      <Setup />
    );
  }

  if (!s.connected) {
    return (
      <div className="col">
        <button className="spotify-btn" onClick={s.connect}>Mit Spotify verbinden</button>
        {s.error && <p className="danger small">{s.error}</p>}
        <Embed />
      </div>
    );
  }

  const premium = s.profile?.product === 'premium';
  return (
    <div className="col">
      <NowPlaying />
      {s.error && <p className="danger small">{s.error}</p>}
      {s.profile && !premium && (
        <p className="muted small">Ohne Spotify Premium erlaubt Spotify keine Steuerung von außen. Du kannst aber die eingebettete Playlist nutzen.</p>
      )}
      {!compact && (
        <>
          <h3>Deine Playlists</h3>
          <Playlists />
          <div className="row between">
            <span className="muted small">Angemeldet als {s.profile?.display_name ?? '…'}</span>
            <button onClick={s.disconnect}>Verbindung trennen</button>
          </div>
        </>
      )}
      {!premium && <Embed />}
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
