import { describe, expect, it } from 'vitest';
import { decide, type SyncMeta } from './cloud';

const T1 = '2026-10-27T10:00:00.000+00:00';
const T2 = '2026-10-27T11:00:00+00:00';
const meta = (patch: Partial<SyncMeta> = {}): SyncMeta => ({ userId: 'u1', lastSynced: T1, dirty: false, ...patch });

describe('Synchronisierung', () => {
  it('lädt hoch, wenn die Cloud noch leer ist', () => {
    expect(decide(null, meta(), 'u1')).toBe('hochladen');
  });
  it('tut nichts, wenn beide Seiten gleich sind', () => {
    expect(decide('2026-10-27T10:00:00Z', meta(), 'u1')).toBe('nichts');
  });
  it('lädt lokale Änderungen hoch, wenn die Cloud unverändert ist', () => {
    expect(decide(T1, meta({ dirty: true }), 'u1')).toBe('hochladen');
  });
  it('übernimmt Änderungen von anderen Geräten', () => {
    expect(decide(T2, meta(), 'u1')).toBe('herunterladen');
  });
  it('fragt nach, wenn beide Seiten geändert wurden', () => {
    expect(decide(T2, meta({ dirty: true }), 'u1')).toBe('konflikt');
  });
  it('übernimmt beim ersten Login eines unbenutzten Geräts die Cloud', () => {
    expect(decide(T2, meta({ userId: null, lastSynced: null }), 'u1')).toBe('herunterladen');
  });
  it('fragt nach, wenn das Gerät schon eigene Einträge hat, statt sie zu überschreiben', () => {
    expect(decide(T2, meta({ userId: null, lastSynced: null, dirty: true }), 'u1')).toBe('konflikt');
    expect(decide(T2, meta({ userId: 'anderes-konto' }), 'u1')).toBe('konflikt');
  });
});

describe('Versionen', () => {
  it('erkennt Cloud-Stände von neueren App-Versionen', async () => {
    const { isNewerSchema, SCHEMA_VERSION } = await import('./version');
    expect(isNewerSchema({ schemaVersion: SCHEMA_VERSION + 1 })).toBe(true);
    expect(isNewerSchema({ schemaVersion: SCHEMA_VERSION })).toBe(false);
    expect(isNewerSchema({})).toBe(false);
    expect(isNewerSchema(null)).toBe(false);
  });

  it('verliert beim Laden keine Bereiche, die diese Version nicht kennt', async () => {
    const { normalize } = await import('../store');
    const raw = { tasks: [{ id: 't' }], zukunft: [{ id: 'z' }], schemaVersion: 9 };
    const data = normalize(raw) as unknown as Record<string, unknown>;
    expect(data.zukunft).toEqual([{ id: 'z' }]);
    expect(data.tasks).toEqual([{ id: 't' }]);
    expect(data.events).toEqual([]);
    expect(data.schemaVersion).toBe(9);
  });
});
