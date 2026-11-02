import { describe, expect, it } from 'vitest';
import { NATIVE_REDIRECT_URI, isNativeCallback, parseCallback, redirectUri } from './spotify';

describe('Spotify-Rückleitung', () => {
  it('nutzt in der App das eigene URL-Schema', () => {
    expect(redirectUri(true)).toBe('antonos://spotify-callback');
  });

  it('erkennt die Rückleitung in die App', () => {
    expect(isNativeCallback(`${NATIVE_REDIRECT_URI}?code=abc&state=xyz`)).toBe(true);
    expect(isNativeCallback(NATIVE_REDIRECT_URI)).toBe(true);
    expect(isNativeCallback('antonos://wecker?id=1')).toBe(false);
    expect(isNativeCallback('https://pixeltoni.github.io/AntonOS/?code=abc')).toBe(false);
  });

  it('liest Code, Fehler und State', () => {
    expect(parseCallback('?code=abc&state=xyz')).toEqual({ code: 'abc', state: 'xyz' });
    expect(parseCallback('?error=access_denied&state=xyz')).toEqual({ error: 'access_denied', state: 'xyz' });
  });

  it('ignoriert fremde Rückleitungen ohne State (z. B. Login der Synchronisierung)', () => {
    expect(parseCallback('?code=abc')).toBeNull();
    expect(parseCallback('')).toBeNull();
    expect(parseCallback('?state=xyz')).toBeNull();
  });
});
