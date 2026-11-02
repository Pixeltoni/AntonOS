/**
 * Verbindung mit Spotify über den Authorization-Code-Flow mit PKCE.
 * Das funktioniert ohne Server: Der Browser holt sich das Token direkt bei Spotify.
 * Tokens liegen getrennt von den übrigen Daten und landen nie in Backups.
 *
 * In der iOS-App öffnet sich der Login in einem Safari-Fenster innerhalb der App.
 * Spotify leitet danach auf `antonos://spotify-callback` zurück (URL-Schema in Info.plist),
 * das System gibt die Adresse an die App weiter und `completeLogin` holt das Token.
 */
import { Capacitor } from '@capacitor/core';

const TOKEN_KEY = 'antonos:spotify-token';
const VERIFIER_KEY = 'antonos:spotify-verifier';
const STATE_KEY = 'antonos:spotify-state';

export const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
].join(' ');

export interface Token {
  access: string;
  refresh: string;
  /** Ablaufzeitpunkt in ms seit 1970 */
  expiresAt: number;
}

/** Rückleitungs-Adresse der iOS-App – muss so im Spotify Developer Dashboard stehen. */
export const NATIVE_REDIRECT_URI = 'antonos://spotify-callback';

const isNative = (): boolean => Capacitor.isNativePlatform();

/** Die Adresse, zu der Spotify nach dem Login zurückleitet (im Web ohne #-Route). */
export function redirectUri(native = isNative()): string {
  return native ? NATIVE_REDIRECT_URI : location.origin + location.pathname;
}

/** Ist das die Rückleitung von Spotify in die iOS-App? */
export function isNativeCallback(url: string): boolean {
  return url === NATIVE_REDIRECT_URI || url.startsWith(`${NATIVE_REDIRECT_URI}?`) || url.startsWith(`${NATIVE_REDIRECT_URI}/?`);
}

export type Callback = { code: string; state: string } | { error: string; state: string } | null;

/** Liest code bzw. error und state aus dem Query-Teil der Rückleitung. */
export function parseCallback(search: string): Callback {
  const params = new URLSearchParams(search);
  const state = params.get('state');
  if (state === null) return null;
  const code = params.get('code');
  if (code) return { code, state };
  const error = params.get('error');
  return error ? { error, state } : null;
}

export function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomString(length = 64): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (v) => chars[v % chars.length]).join('');
}

export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

function safeGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: Storage, key: string, value: string | null) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // Speicher nicht verfügbar – dann hält die Verbindung nur bis zum Neuladen
  }
}

export function loadToken(): Token | null {
  const raw = safeGet(localStorage, TOKEN_KEY);
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as Token;
    return t.access && t.refresh ? t : null;
  } catch {
    return null;
  }
}

function saveToken(t: Token | null) {
  safeSet(localStorage, TOKEN_KEY, t && JSON.stringify(t));
}

export function logout() {
  saveToken(null);
}

/**
 * Ablage für Verifier und State während des Logins. Im Web reicht sessionStorage;
 * in der App muss es localStorage sein, falls iOS die App während des Logins beendet.
 */
const flowStorage = (): Storage => (isNative() ? localStorage : sessionStorage);

/** Leitet zum Spotify-Login weiter (in der App: Safari-Fenster über der App). */
export async function login(clientId: string) {
  const verifier = randomString(64);
  const state = randomString(16);
  safeSet(flowStorage(), VERIFIER_KEY, verifier);
  safeSet(flowStorage(), STATE_KEY, state);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await codeChallenge(verifier),
    state,
  });
  const url = `https://accounts.spotify.com/authorize?${params}`;
  if (isNative()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url, presentationStyle: 'popover' });
  } else location.assign(url);
}

async function requestToken(body: Record<string, string>): Promise<Token> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  if (!res.ok) throw new Error(`Spotify-Anmeldung fehlgeschlagen (${res.status})`);
  const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  const previous = loadToken();
  const token: Token = {
    access: json.access_token,
    refresh: json.refresh_token ?? previous?.refresh ?? '',
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  };
  saveToken(token);
  return token;
}

/**
 * Verarbeitet die Rückleitung von Spotify im Web (?code=…), falls vorhanden.
 * Gibt true zurück, wenn ein Login abgeschlossen wurde.
 */
export async function handleRedirect(clientId: string): Promise<boolean> {
  const callback = parseCallback(location.search);
  // Nur Rückleitungen verarbeiten, die wir selbst gestartet haben (nicht z. B. den Login der Synchronisierung)
  if (!callback || !safeGet(flowStorage(), STATE_KEY)) return false;

  // URL aufräumen und zur Musikseite springen
  history.replaceState(null, '', `${location.pathname}#/musik`);
  // replaceState löst kein hashchange aus – der Router soll die Musikseite aber anzeigen
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  return completeLogin(clientId, callback);
}

/** Tauscht den Code aus der Rückleitung gegen ein Token (Web und App). */
export async function completeLogin(clientId: string, callback: Callback): Promise<boolean> {
  if (!callback) return false;
  const verifier = safeGet(flowStorage(), VERIFIER_KEY);
  const state = safeGet(flowStorage(), STATE_KEY);
  safeSet(flowStorage(), VERIFIER_KEY, null);
  safeSet(flowStorage(), STATE_KEY, null);
  if ('error' in callback) throw new Error(callback.error === 'access_denied' ? 'Du hast den Zugriff abgelehnt.' : `Spotify meldet: ${callback.error}`);
  if (!verifier || !state || callback.state !== state) throw new Error('Login konnte nicht zugeordnet werden. Bitte noch einmal verbinden.');

  await requestToken({ grant_type: 'authorization_code', code: callback.code, redirect_uri: redirectUri(), client_id: clientId, code_verifier: verifier });
  return true;
}

let refreshing: Promise<Token> | null = null;

/** Gültiges Access-Token, bei Bedarf automatisch erneuert. */
export async function accessToken(clientId: string): Promise<string> {
  const t = loadToken();
  if (!t) throw new Error('Nicht mit Spotify verbunden');
  if (t.expiresAt > Date.now()) return t.access;
  refreshing ??= requestToken({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: clientId }).finally(() => {
    refreshing = null;
  });
  return (await refreshing).access;
}

export class SpotifyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Aufruf der Spotify Web API. Gibt null zurück, wenn Spotify keinen Inhalt liefert (204). */
export async function api<T>(clientId: string, path: string, init: RequestInit = {}): Promise<T | null> {
  const token = await accessToken(clientId);
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
  });
  if (res.status === 204 || res.status === 202) return null;
  if (!res.ok) {
    let message = `Spotify-Fehler ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string; reason?: string } };
      if (body.error?.reason === 'PREMIUM_REQUIRED') message = 'Für die Steuerung brauchst du Spotify Premium.';
      else if (body.error?.reason === 'NO_ACTIVE_DEVICE')
        message = isNative() ? 'Kein aktives Gerät. Öffne kurz die Spotify-App, dann lässt sie sich von hier steuern.' : 'Kein aktives Gerät. Starte die Wiedergabe „Hier im Browser“ oder öffne Spotify auf einem Gerät.';
      else if (body.error?.message) message = body.error.message;
    } catch {
      // keine JSON-Antwort
    }
    if (res.status === 401) logout();
    throw new SpotifyError(message, res.status);
  }
  return parseBody<T>(await res.text());
}

/**
 * Spotify beantwortet Steuerbefehle (Play, Pause, Weiter …) teils mit einem
 * kurzen Text statt mit JSON. Solche Antworten sind kein Fehler.
 */
export function parseBody<T>(text: string): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/* ---------- Geräte (Spotify Connect) ---------- */

export interface Device {
  id: string | null;
  name: string;
  type: string;
  is_active: boolean;
  is_restricted: boolean;
  volume_percent?: number | null;
}

/**
 * Wählt das Gerät, auf dem die Wiedergabe starten soll, wenn gerade keins aktiv ist:
 * das aktive, sonst ein Handy (in der App meist das eigene iPhone), sonst das erste steuerbare.
 */
export function pickDevice(devices: Device[], preferPhone = false): Device | null {
  const usable = devices.filter((d) => d.id && !d.is_restricted);
  return (
    usable.find((d) => d.is_active) ??
    (preferPhone ? usable.find((d) => d.type.toLowerCase() === 'smartphone') : undefined) ??
    usable[0] ??
    null
  );
}

/** Symbol für eine Geräteart von Spotify. */
export function deviceIcon(type: string): string {
  switch (type.toLowerCase()) {
    case 'smartphone':
      return '📱';
    case 'computer':
      return '💻';
    case 'tablet':
      return '📲';
    case 'speaker':
    case 'avr':
    case 'stb':
      return '🔈';
    case 'tv':
    case 'castvideo':
      return '📺';
    case 'automobile':
      return '🚗';
    default:
      return '🎧';
  }
}

/** Öffnet-Adresse für die Spotify-App, z. B. spotify:playlist:… (sonst einfach die App). */
export function spotifyAppUri(uri?: string | null): string {
  return uri && /^spotify:[a-z]+:[A-Za-z0-9]+$/.test(uri) ? uri : 'spotify:';
}
