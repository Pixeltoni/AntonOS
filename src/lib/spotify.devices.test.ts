import { describe, expect, it } from 'vitest';
import { deviceIcon, findPhone, pickDevice, spotifyAppUri, type Device } from './spotify';

const dev = (over: Partial<Device>): Device => ({ id: 'x', name: 'Gerät', type: 'Computer', is_active: false, is_restricted: false, ...over });

describe('Gerätewahl', () => {
  it('nimmt das aktive Gerät', () => {
    expect(pickDevice([dev({ id: 'a' }), dev({ id: 'b', is_active: true })])?.id).toBe('b');
  });

  it('bevorzugt in der App das Handy', () => {
    const list = [dev({ id: 'laptop' }), dev({ id: 'iphone', type: 'Smartphone' })];
    expect(pickDevice(list, true)?.id).toBe('iphone');
    expect(pickDevice(list, false)?.id).toBe('laptop');
  });

  it('überspringt gesperrte Geräte und solche ohne ID', () => {
    expect(pickDevice([dev({ id: null }), dev({ id: 'r', is_restricted: true }), dev({ id: 'ok' })])?.id).toBe('ok');
    expect(pickDevice([])).toBeNull();
  });

  it('findet das Handy', () => {
    expect(findPhone([dev({ id: 'laptop' }), dev({ id: 'iphone', type: 'Smartphone' })])?.id).toBe('iphone');
    expect(findPhone([dev({ id: 'laptop' })])).toBeNull();
  });

  it('liefert Symbole und App-Adressen', () => {
    expect(deviceIcon('Smartphone')).toBe('📱');
    expect(deviceIcon('Unbekannt')).toBe('🎧');
    expect(spotifyAppUri('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M')).toBe('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M');
    expect(spotifyAppUri('javascript:alert(1)')).toBe('spotify:');
    expect(spotifyAppUri(null)).toBe('spotify:');
  });
});
