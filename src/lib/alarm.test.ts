import { describe, expect, it } from 'vitest';
import type { Alarm } from '../types';
import { previousRing, bedtimeFor, bedtimeNotices, canSnooze, cycleTimes, durationLabel, fadeVolume, isPunctual, memorySequence, nextAlarm, nextRings, quickAlarm, repeatLabel, ShakeCounter, skipNext, snoozeOf, wakeStats, alarmTone, daysLabel, defaultAlarm, expiredOneShots, hasTask, nativeAlarms, nativeRingAgainSeconds, dueAlarms, isCorrectNumber, isCorrectPhrase, mathProblem, nextRing, RING_GRACE, silence, spotifyUri, untilLabel, youtubeId } from './alarm';

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

describe('nativeAlarms', () => {
  const base = { ...defaultAlarm(), id: 'a' };
  it('nimmt nur eingeschaltete Wecker und zerlegt die Uhrzeit', () => {
    const list = nativeAlarms([
      { ...base, id: 'b', time: '06:45', label: ' Uni ', days: [3, 1, 1] },
      { ...base, id: 'c', enabled: false },
    ]);
    expect(list).toEqual([{ id: 'b', title: 'Uni', hour: 6, minute: 45, days: [1, 3], task: true, snooze: 540, snoozeMax: 3 }]);
  });
  it('einmalige Wecker haben keine Tage und heißen „Wecker“', () => {
    expect(nativeAlarms([{ ...base, label: '', days: [] }])[0]).toMatchObject({ title: 'Wecker', days: [] });
  });
  it('klingelt während der Aufgabe erst nach der Restzeit wieder', () => {
    expect(nativeRingAgainSeconds('aufgabe', 12)).toBe(27);
    expect(nativeRingAgainSeconds('klingelt', 12)).toBe(30);
    expect(nativeRingAgainSeconds('schlummert', 300)).toBe(300);
  });
});

describe('Wecker ohne Aufgabe', () => {
  it('meldet dem iPhone, dass Stopp reicht', () => {
    const a = { ...defaultAlarm(), id: 'k', challenge: 'keine' as const };
    expect(hasTask(a)).toBe(false);
    expect(nativeAlarms([a])[0].task).toBe(false);
  });
});

describe('expiredOneShots', () => {
  const armed = new Date(2026, 10, 2, 22, 0).getTime();
  const once = { ...defaultAlarm(), id: 'o', time: '07:00', days: [], armedAt: armed };
  it('einmaliger Wecker ist nach seiner Weckzeit abgelaufen', () => {
    expect(expiredOneShots([once], new Date(2026, 10, 3, 6, 59))).toEqual([]);
    expect(expiredOneShots([once], new Date(2026, 10, 3, 7, 1)).map((a) => a.id)).toEqual(['o']);
  });
  it('wiederholende Wecker laufen nie ab', () => {
    expect(expiredOneShots([{ ...once, days: [1, 2, 3, 4, 5, 6, 7] }], new Date(2026, 10, 9))).toEqual([]);
  });
});

describe('Schlummern', () => {
  it('ältere Wecker schlummern nicht, neue 9 Minuten bis zu 3-mal', () => {
    expect(snoozeOf(alarm()).on).toBe(false);
    expect(snoozeOf(defaultAlarm())).toEqual({ on: true, minutes: 9, max: 3 });
    expect(canSnooze(defaultAlarm(), 2)).toBe(true);
    expect(canSnooze(defaultAlarm(), 3)).toBe(false);
  });
});

describe('Überspringen, Pause und festes Datum', () => {
  const mon = at('2026-11-02T06:00:00');
  it('lässt nur den nächsten aus', () => {
    const a = alarm();
    const skipped = { ...a, ...skipNext(a, mon) };
    expect(skipped.skip).toBe('2026-11-02');
    expect(nextRing(skipped, mon)).toEqual(at('2026-11-03T07:00:00'));
  });
  it('pausiert bis einschließlich zum Datum', () => {
    expect(nextRing(alarm({ pausedUntil: '2026-11-13' }), mon)).toEqual(at('2026-11-16T07:00:00'));
    expect(dueAlarms([alarm({ pausedUntil: '2026-11-02' })], at('2026-11-02T07:00:20'), [])).toEqual([]);
  });
  it('einmaliger Wecker an einem bestimmten Tag', () => {
    const a = alarm({ days: [], date: '2026-11-20' });
    expect(nextRing(a, mon)).toEqual(at('2026-11-20T07:00:00'));
    expect(nextRings(a, mon, 5)).toHaveLength(1);
    expect(dueAlarms([a], at('2026-11-02T07:00:20'), [])).toEqual([]);
    expect(repeatLabel(a)).toContain('20');
  });
  it('findet den nächsten aller Wecker', () => {
    const list = [alarm({ id: 'x', time: '08:00' }), alarm({ id: 'y', time: '06:30' })];
    expect(nextAlarm(list, mon)?.alarm.id).toBe('y');
  });
  it('stellt am iPhone Einzeltermine statt Wochenplan', () => {
    const list = nativeAlarms([alarm({ skip: '2026-11-02' })], mon);
    expect(list).toHaveLength(14);
    expect(list[0]).toMatchObject({ days: [], at: at('2026-11-03T07:00:00').getTime() });
    expect(nativeAlarms([alarm({ days: [], date: '2026-11-20' })], mon)).toHaveLength(1);
    expect(nativeAlarms([alarm({ skip: '2026-10-01' })], mon)[0].at).toBeUndefined();
  });
  it('Schnellwecker klingelt in genau N Minuten', () => {
    const q = quickAlarm(20, at('2026-11-02T23:50:00'));
    expect(q).toMatchObject({ time: '00:10', date: '2026-11-03', days: [], challenge: 'keine' });
    expect(nextRing({ ...q, id: 'q' }, at('2026-11-02T23:50:00'))).toEqual(at('2026-11-03T00:10:00'));
  });
});

describe('Schlaf', () => {
  it('rechnet Schlafenszeit und Zyklen', () => {
    expect(bedtimeFor(at('2026-11-03T07:00:00'), 480)).toEqual(at('2026-11-02T22:45:00'));
    expect(cycleTimes(at('2026-11-02T23:00:00')).map((c) => c.at)).toEqual([at('2026-11-03T03:45:00'), at('2026-11-03T05:15:00'), at('2026-11-03T06:45:00'), at('2026-11-03T08:15:00')]);
    expect(durationLabel(450)).toBe('7 Std. 30 Min.');
  });
  it('erinnert je Morgen einmal zur Schlafenszeit', () => {
    const list = bedtimeNotices([alarm(), alarm({ id: 'v', time: '06:00', days: [2] })], { goal: 480, remind: true }, at('2026-11-02T20:00:00'), 2);
    expect(list.map((n) => [n.tag, new Date(n.at)])).toEqual([
      ['schlafenszeit-2026-11-03', at('2026-11-02T21:45:00')],
      ['schlafenszeit-2026-11-04', at('2026-11-03T22:45:00')],
      ['schlafenszeit-2026-11-05', at('2026-11-04T22:45:00')],
    ]);
    expect(bedtimeNotices([alarm()], { goal: 480, remind: false }, at('2026-11-02T20:00:00'))).toEqual([]);
  });
});

describe('Aufsteh-Statistik', () => {
  const log = (date: string, wake: string, snoozes = 0) => ({ id: date, date, alarmId: 'w', ringAt: at(`${date}T07:00:00`).getTime(), offAt: at(`${date}T${wake}:00`).getTime(), snoozes });
  it('zählt pünktliche Morgen in Folge und den Schnitt', () => {
    const s = wakeStats([log('2026-10-30', '07:20', 2), log('2026-10-31', '07:04'), log('2026-11-02', '07:02')], at('2026-11-02T12:00:00'));
    expect(s.streak).toBe(2);
    expect(s.avgWake).toBe('07:09');
    expect(s.avgSnoozes).toBe(0.7);
    expect(s.recent[0].date).toBe('2026-11-02');
    expect(isPunctual(log('2026-11-02', '07:30'))).toBe(false);
  });
});

describe('Neue Aufgaben', () => {
  it('Memory-Folge ohne direkte Wiederholung', () => {
    const values = [0.1, 0.1, 0.6, 0.6, 0.9, 0.3, 0.3, 0.1, 0.7, 0.2, 0.5];
    let i = 0;
    const seq = memorySequence(8, () => values[i++ % values.length]);
    expect(seq).toHaveLength(8);
    expect(seq.every((n, i) => i === 0 || n !== seq[i - 1])).toBe(true);
  });
  it('zählt nur kräftige Bewegungen mit Abstand', () => {
    const c = new ShakeCounter();
    c.feed(0, 9.8, 0, 0);
    c.feed(25, 5, 0, 100);
    c.feed(25, 5, 0, 200);
    c.feed(-25, 5, 0, 400);
    expect(c.count).toBe(2);
  });
  it('wird sanft lauter', () => {
    expect(fadeVolume(0)).toBeCloseTo(0.1);
    expect(fadeVolume(22_500)).toBeCloseTo(0.55);
    expect(fadeVolume(90_000)).toBe(1);
  });
});

describe('previousRing', () => {
  it('findet die Weckzeit vor dem Stoppen, auch über Mitternacht', () => {
    expect(previousRing({ time: '07:00' }, at('2026-11-02T07:25:00').getTime())).toBe(at('2026-11-02T07:00:00').getTime());
    expect(previousRing({ time: '23:50' }, at('2026-11-03T00:10:00').getTime())).toBe(at('2026-11-02T23:50:00').getTime());
  });
});
