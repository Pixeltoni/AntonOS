/**
 * Verbindung mit Spotify über den Authorization-Code-Flow mit PKCE.
 * Das funktioniert ohne Server: Der Browser holt sich das Token direkt bei Spotify.
 * Tokens liegen getrennt von den übrigen Daten und landen nie in Backups.
 */

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

/** Die Adresse, zu der Spotify nach dem Login zurückleitet (ohne #-Route). */
export function redirectUri(): string {
  return location.origin + location.pathname;
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

/** Leitet zum Spotify-Login weiter. */
export async function login(clientId: string) {
  const verifier = randomString(64);
  const state = randomString(16);
  safeSet(sessionStorage, VERIFIER_KEY, verifier);
  safeSet(sessionStorage, STATE_KEY, state);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await codeChallenge(verifier),
    state,
  });
  location.assign(`https://accounts.spotify.com/authorize?${params}`);
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
 * Verarbeitet die Rückleitung von Spotify (?code=…), falls vorhanden.
 * Gibt true zurück, wenn ein Login abgeschlossen wurde.
 */
export async function handleRedirect(clientId: string): Promise<boolean> {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const error = params.get('error');
  if (!code && !error) return false;

  // URL aufräumen und zur Musikseite springen
  history.replaceState(null, '', `${location.pathname}#/musik`);
  // replaceState löst kein hashchange aus – der Router soll die Musikseite aber anzeigen
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  if (error) throw new Error(error === 'access_denied' ? 'Du hast den Zugriff abgelehnt.' : `Spotify meldet: ${error}`);

  const verifier = safeGet(sessionStorage, VERIFIER_KEY);
  const state = safeGet(sessionStorage, STATE_KEY);
  safeSet(sessionStorage, VERIFIER_KEY, null);
  safeSet(sessionStorage, STATE_KEY, null);
  if (!verifier || !state || params.get('state') !== state) throw new Error('Login konnte nicht zugeordnet werden. Bitte noch einmal verbinden.');

  await requestToken({ grant_type: 'authorization_code', code: code!, redirect_uri: redirectUri(), client_id: clientId, code_verifier: verifier });
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
      else if (body.error?.reason === 'NO_ACTIVE_DEVICE') message = 'Kein aktives Gerät. Starte die Wiedergabe „Hier im Browser“ oder öffne Spotify auf einem Gerät.';
      else if (body.error?.message) message = body.error.message;
    } catch {
      // keine JSON-Antwort
    }
    if (res.status === 401) logout();
    throw new SpotifyError(message, res.status);
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : null;
}
