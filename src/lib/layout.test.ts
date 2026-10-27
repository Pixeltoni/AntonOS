import { describe, expect, it } from 'vitest';
import type { NavItem, WidgetConfig } from '../types';
import { DEFAULT_DASHBOARD, DEFAULT_SIDEBAR, groupNav, mergeWithDefaults, moveItem, moveWidget } from './layout';
import { base64url, codeChallenge, randomString } from './spotify';

describe('Dashboard-Layout', () => {
  it('nutzt ohne Anpassung den Standard', () => {
    expect(mergeWithDefaults([], DEFAULT_DASHBOARD, 'id')).toBe(DEFAULT_DASHBOARD);
  });

  it('behält die eigene Reihenfolge, entfernt Unbekanntes und ergänzt neue Widgets', () => {
    const stored = [
      { id: 'vision', area: 'oben', hidden: false },
      { id: 'gibtsnicht', area: 'links', hidden: false },
      { id: 'clock', area: 'rechts', hidden: true },
      { id: 'clock', area: 'links', hidden: false },
    ] as unknown as WidgetConfig[];
    const merged = mergeWithDefaults(stored, DEFAULT_DASHBOARD, 'id');
    expect(merged.slice(0, 2)).toEqual([
      { id: 'vision', area: 'oben', hidden: false },
      { id: 'clock', area: 'rechts', hidden: true },
    ]);
    expect(merged).toHaveLength(DEFAULT_DASHBOARD.length);
  });

  it('verschiebt nur innerhalb des eigenen Bereichs', () => {
    const list: WidgetConfig[] = [
      { id: 'clock', area: 'links', hidden: false },
      { id: 'tasks', area: 'mitte', hidden: false },
      { id: 'quick', area: 'links', hidden: false },
    ];
    expect(moveWidget(list, 'quick', -1).map((w) => w.id)).toEqual(['quick', 'tasks', 'clock']);
    expect(moveWidget(list, 'clock', -1)).toBe(list);
    expect(moveWidget(list, 'tasks', 1)).toBe(list);
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
