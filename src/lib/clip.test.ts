import { describe, expect, it } from 'vitest';
import { CLIP_RATE, CLIP_SECONDS, clampClipStart, clipFile, clipSamples, clipWav, maxClipStart, mmss } from './clip';

const sine = (seconds: number, rate: number, f = 440, amp = 0.3) => Float32Array.from({ length: seconds * rate }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / rate));

describe('clip', () => {
  it('Dateiname nur mit sicheren Zeichen', () => {
    expect(clipFile('abc-123')).toBe('antonos-eigen-abc-123.wav');
    expect(clipFile('a/b c.d')).toBe('antonos-eigen-abcd.wav');
  });

  it('Start begrenzen', () => {
    expect(maxClipStart(200)).toBe(171);
    expect(maxClipStart(10)).toBe(0);
    expect(clampClipStart(500, 200)).toBe(171);
    expect(clampClipStart(-3, 200)).toBe(0);
    expect(clampClipStart(undefined, 200)).toBe(0);
    expect(clampClipStart(12.4, 200)).toBe(12);
  });

  it('mm:ss', () => {
    expect(mmss(0)).toBe('0:00');
    expect(mmss(83)).toBe('1:23');
  });

  it('schneidet höchstens 29 Sekunden aus und rechnet um', () => {
    const rate = 44100;
    const song = sine(60, rate);
    const out = clipSamples([song, song], rate, 10);
    expect(out.length).toBe(CLIP_SECONDS * CLIP_RATE);
    // Auf 0,9 normalisiert, Anfang und Ende ausgeblendet
    const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak).toBeGreaterThan(0.85);
    expect(peak).toBeLessThanOrEqual(0.9001);
    expect(Math.abs(out[0])).toBeLessThan(0.01);
    expect(Math.abs(out[out.length - 1])).toBeLessThan(0.01);
  });

  it('kurze Lieder bleiben kurz, Start hinter dem Ende ergibt nichts', () => {
    const rate = 8000;
    expect(clipSamples([sine(5, rate)], rate, 0).length).toBe(Math.floor(5 * CLIP_RATE));
    expect(clipSamples([sine(5, rate)], rate, 9).length).toBe(0);
    expect(clipSamples([], rate, 0).length).toBe(0);
  });

  it('WAV mit richtigem Kopf', () => {
    const rate = 22050;
    const bytes = clipWav([sine(2, rate)], rate, 0);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
    expect(new DataView(bytes.buffer).getUint32(24, true)).toBe(CLIP_RATE);
    expect(bytes.length).toBe(44 + 2 * 2 * CLIP_RATE);
  });
});
