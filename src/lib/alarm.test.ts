import { describe, expect, it } from 'vitest';
import type { Alarm } from '../types';
import { alarmTone, daysLabel, dueAlarms, isCorrectNumber, isCorrectPhrase, mathProblem, nextRing, RING_GRACE, silence, spotifyUri, untilLabel, youtubeId } from './alarm';

const alarm = (patch: Partial<Alarm> = {}): Alarm => ({
  id: 'w', time: '07:00', label: '', days: [1, 2, 3, 4, 5], enabled: true, armedAt: 0, sound: 'ton', soundUrl: '',
  challenge: 'rechnen', level: 2, rounds: 3, phrase: '', qr: '', ...patch,
});
// 2026-11-02 ist ein Montag
const at = (s: string) => new Date(s);

describe('Wecker: Zeitpunkte', () => {
  it('findet das nächste Klingeln und überspringt das Wochenende', () => {
    expect(nextRing(alarm(), at('2026-11-02T06:00:00'))).toEqual(at('2026-11-02T07:00:00'));
    expect(nextRing(alarm(), at('2026-11-06T08:00:00'))).toEqual(at('2026-11-09T07:00:00'));
    expect(nextRing(alarm({ days: [] }), at('2026-11-07T08:00:00'))).toEqual(at('2026-11-08T07:00:00'));
    expect(nextRing(alarm({ enabled: false }), at('2026-11-02T06:00:00'))).toBeNull();
  });

  it('klingelt zur Weckzeit genau einmal und nicht vor dem Einschalten', () => {
    const now = at('2026-11-02T07:00:20');
    const due = dueAlarms([alarm()], now, []);
    expect(due.map((d) => d.key)).toEqual(['w@2026-11-02 07:00']);
    expect(dueAlarms([alarm()], now, ['w@2026-11-02 07:00'])).toEqual([]);
    expect(dueAlarms([alarm()], at('2026-11-02T06:59:59'), [])).toEqual([]);
    expect(dueAlarms([alarm({ armedAt: at('2026-11-02T07:00:10').getTime() })], now, [])).toEqual([]);
    expect(dueAlarms([alarm({ days: [6, 7] })], now, [])).toEqual([]);
  });

  it('klingelt noch kurz nach der Zeit, aber nicht mehr Stunden später', () => {
    const late = new Date(at('2026-11-02T07:00:00').getTime() + RING_GRACE - 1000);
    expect(dueAlarms([alarm()], late, [])).toHaveLength(1);
    expect(dueAlarms([alarm()], at('2026-11-02T09:00:00'), [])).toEqual([]);
  });

  it('klingelt auch über Mitternacht', () => {
    expect(dueAlarms([alarm({ time: '23:58', days: [] })], at('2026-11-03T00:02:00'), []).map((d) => d.key)).toEqual(['w@2026-11-02 23:58']);
  });

  it('beschreibt Tage und Restzeit', () => {
    expect(daysLabel([])).toBe('Einmalig');
    expect(daysLabel([5, 4, 3, 2, 1])).toBe('Werktags');
    expect(daysLabel([6, 7])).toBe('Wochenende');
    expect(daysLabel([1, 2, 3, 4, 5, 6, 7])).toBe('Täglich');
    expect(daysLabel([3, 1])).toBe('Mo, Mi');
    expect(untilLabel(at('2026-11-02T07:00:00'), at('2026-11-01T23:55:00'))).toBe('in 7 Std. 5 Min.');
    expect(untilLabel(at('2026-11-02T07:00:00'), at('2026-11-02T06:40:00'))).toBe('in 20 Min.');
  });
});

describe('Wecker: Aufgaben', () => {
  it('erzeugt lösbare Rechenaufgaben', () => {
    for (const level of [1, 2, 3] as const) {
      for (let i = 0; i < 50; i++) {
        const p = mathProblem(level);
        expect(Number.isInteger(p.answer)).toBe(true);
        expect(eval(p.question.replace('×', '*'))).toBe(p.answer);
      }
    }
    const p = mathProblem(1, () => 0);
    expect(p).toEqual({ question: '12 + 11', answer: 23 });
    expect(isCorrectNumber(p, ' 23 ')).toBe(true);
    expect(isCorrectNumber(p, '24')).toBe(false);
    expect(isCorrectNumber({ question: '0', answer: 0 }, '')).toBe(false);
  });

  it('prüft abgetippten Text ohne Rücksicht auf Leerzeichen und Großschreibung', () => {
    expect(isCorrectPhrase('Ich bin wach', '  ich  bin WACH ')).toBe(true);
    expect(isCorrectPhrase('Ich bin wach', 'Ich bin wac')).toBe(false);
    expect(isCorrectPhrase('', '')).toBe(false);
  });
});

describe('Wecker: Links', () => {
  it('erkennt YouTube-Links', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://m.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(youtubeId('kein link')).toBeNull();
  });

  it('erkennt Spotify-Links', () => {
    expect(spotifyUri('https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC?si=x')).toEqual({ uri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC', kind: 'track' });
    expect(spotifyUri('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')).toEqual({ uri: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M', kind: 'context' });
    expect(spotifyUri('spotify:album:1A2B3C')).toEqual({ uri: 'spotify:album:1A2B3C', kind: 'context' });
    expect(spotifyUri('https://open.spotify.com/show/abc')).toBeNull();
  });
});

describe('Wecker: Ton', () => {
  it('baut eine gültige WAV-Datei', () => {
    const data = alarmTone(8000);
    const text = (a: number, b: number) => String.fromCharCode(...data.slice(a, b));
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 12)).toBe('WAVE');
    expect(data.length).toBe(44 + 8000 * 2);
    expect(new DataView(data.buffer).getUint32(24, true)).toBe(8000);
    expect(silence().length).toBe(44 + 2000 * 2);
  });
});
