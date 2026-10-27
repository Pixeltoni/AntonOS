import { describe, expect, it } from 'vitest';
import type { NavItem, WidgetConfig } from '../types';
import { DEFAULT_DASHBOARD, DEFAULT_SIDEBAR, groupNav, mergeWithDefaults, moveItem, moveTo, normalizeWidgets, stackOrder } from './layout';
import { base64url, codeChallenge, parseBody, randomString } from './spotify';

describe('Dashboard-Layout', () => {
  it('nutzt ohne Anpassung den Standard', () => {
    expect(mergeWithDefaults(normalizeWidgets([]), DEFAULT_DASHBOARD, 'id')).toBe(DEFAULT_DASHBOARD);
  });

  it('behält die eigene Reihenfolge, entfernt Unbekanntes und ergänzt neue Widgets', () => {
    const stored = normalizeWidgets([
      { id: 'vision', size: 's', height: 'm', variant: 'kompakt', hidden: false },
      { id: 'gibtsnicht', size: 'm' },
      { id: 'clock', size: 'full', hidden: true },
      { id: 'clock', size: 's' },
    ]);
    const merged = mergeWithDefaults(stored, DEFAULT_DASHBOARD, 'id');
    expect(merged.slice(0, 2)).toEqual([
      { id: 'vision', size: 's', height: 'm', variant: 'kompakt', hidden: false },
      { id: 'clock', size: 'full', height: 'auto', variant: 'standard', hidden: true },
    ]);
    expect(merged).toHaveLength(DEFAULT_DASHBOARD.length);
  });

  it('übernimmt Anpassungen aus dem alten Spalten-Format', () => {
    const old = [
      { id: 'tasks', area: 'mitte', hidden: false },
      { id: 'clock', area: 'links', hidden: true },
      { id: 'stats', area: 'oben', hidden: false },
    ] as unknown as WidgetConfig[];
    expect(normalizeWidgets(old)).toEqual([
      { id: 'stats', size: 'full', height: 'auto', variant: 'standard', hidden: false },
      { id: 'clock', size: 's', height: 'auto', variant: 'standard', hidden: true },
      { id: 'tasks', size: 'l', height: 'auto', variant: 'standard', hidden: false },
    ]);
  });
});

describe('Sidebar', () => {
  it('gruppiert aufeinanderfolgende Einträge', () => {
    const items: NavItem[] = [
      { path: 'a', label: 'A', icon: '', group: '', hidden: false },
      { path: 'b', label: 'B', icon: '', group: 'X', hidden: false },
      { path: 'c', label: 'C', icon: '', group: 'X', hidden: false },
      { path: 'd', label: 'D', icon: '', group: '', hidden: false },
    ];
    expect(groupNav(items).map((s) => [s.group, s.items.length])).toEqual([['', 1], ['X', 2], ['', 1]]);
  });

  it('verschiebt Einträge und bleibt an den Rändern stehen', () => {
    expect(moveItem([1, 2, 3], 2, -1)).toEqual([1, 3, 2]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  });

  it('ergänzt neue Seiten bei alten Anpassungen', () => {
    const stored = DEFAULT_SIDEBAR.filter((i) => i.path !== 'musik').map((i) => ({ ...i, label: i.label.toUpperCase() }));
    const merged = mergeWithDefaults(stored, DEFAULT_SIDEBAR, 'path');
    expect(merged[0].label).toBe('DASHBOARD');
    expect(merged[merged.length - 1].path).toBe('musik');
  });
});

describe('Spotify PKCE', () => {
  it('akzeptiert Text-Antworten auf Steuerbefehle ohne Fehler', () => {
    expect(parseBody('akDfO7_-Z1xyz')).toBeNull();
    expect(parseBody('')).toBeNull();
    expect(parseBody<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });
  it('berechnet die Code-Challenge nach RFC 7636', async () => {
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
  it('kodiert URL-sicher ohne Füllzeichen', () => {
    expect(base64url(new Uint8Array([251, 255, 191]))).toBe('-_-_');
  });
  it('erzeugt zufällige Zeichenketten aus erlaubten Zeichen', () => {
    const s = randomString(64);
    expect(s).toMatch(/^[A-Za-z0-9\-._~]{64}$/);
    expect(randomString(64)).not.toBe(s);
  });
});

describe('Homescreen', () => {
  it('verschiebt per Ziehen', () => {
    expect(moveTo(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveTo(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    const same = ['a'];
    expect(moveTo(same, 0, 5)).toBe(same);
  });
  it('ordnet den Smart Stack nach Tageszeit', () => {
    expect(stackOrder(8)[0]).toBe('heute');
    expect(stackOrder(14)[0]).toBe('aufgaben');
    expect(stackOrder(20)[0]).toBe('ringe');
    expect(stackOrder(2)).toHaveLength(6);
  });
});
