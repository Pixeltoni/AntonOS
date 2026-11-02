import { describe, expect, it } from 'vitest';
import { alarmSoundFile, isSong, SONGS, synthTone, toneLabel, NATIVE_TONE_SECONDS, TONES, toneFile, toneLoop, toneOf, toneWav } from './tones';

describe('Wecktöne', () => {
  it('jeder Ton ist hörbar und nicht übersteuert', () => {
    for (const t of TONES) {
      const loop = toneLoop(t.id);
      const peak = loop.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      expect(peak).toBeGreaterThan(0.5);
      expect(peak).toBeLessThanOrEqual(0.8001);
    }
  });
  it('Datei fürs iPhone ist kürzer als 30 Sekunden', () => {
    const file = toneWav('glocke', NATIVE_TONE_SECONDS, 8000);
    expect(file.length).toBe(44 + NATIVE_TONE_SECONDS * 8000 * 2);
    expect(NATIVE_TONE_SECONDS).toBeLessThan(30);
  });
  it('unbekannte Töne fallen auf den Standard zurück', () => {
    expect(toneOf(undefined)).toBe('aufgang');
    expect(toneOf('gibtsnicht')).toBe('aufgang');
    expect(toneFile('puls')).toBe('antonos-puls.wav');
  });
  it('eigenes Lied: zuerst der Ausschnitt, sonst der Weckton', () => {
    expect(alarmSoundFile({ id: 'x1', sound: 'datei', tone: 'glocke' })).toBe('antonos-eigen-x1.wav|antonos-glocke.wav');
    expect(alarmSoundFile({ id: 'x1', sound: 'spotify', tone: 'glocke' })).toBe('antonos-glocke.wav');
    expect(alarmSoundFile({ id: 'x1', sound: 'ton', tone: undefined })).toBe('antonos-aufgang.wav');
  });
  it('eigene Lieder: gültiger Ton, Datei im App-Paket, im Browser der Standardton', () => {
    const id = SONGS[0].id;
    expect(isSong(id)).toBe(true);
    expect(toneOf(id)).toBe(id);
    expect(toneFile(id)).toBe(`antonos-${id}.wav`);
    expect(synthTone(id)).toBe('aufgang');
    expect(synthTone('glocke')).toBe('glocke');
    expect(toneLabel(id)).toBe(SONGS[0].label);
    expect(toneLabel('gibtsnicht')).toBe('Sonnenaufgang');
  });
});
