import { describe, expect, it } from 'vitest';
import { parseEventQuickAdd, parseQuickAdd } from './quickadd';

// Dienstag, 27.10.2026
const T = '2026-10-27';
const courses = [
  { id: 'ana', name: 'Analysis I', code: 'MA-101' },
  { id: 'prog', name: 'Einführung in die Programmierung', code: 'INF-110' },
];

describe('Schnelleingabe', () => {
  it('erkennt Datum, Uhrzeit, Priorität und Kurs', () => {
    expect(parseQuickAdd('Übungsblatt 4 morgen 10 Uhr !!! #analysis', T, courses)).toEqual({
      title: 'Übungsblatt 4',
      due: '2026-10-28',
      dueTime: '10:00',
      priority: 'hoch',
      courseId: 'ana',
      evening: false,
      someday: false,
    });
  });

  it('versteht relative Angaben und Wochentage', () => {
    expect(parseQuickAdd('Lesen heute', T).due).toBe(T);
    expect(parseQuickAdd('Lesen übermorgen', T).due).toBe('2026-10-29');
    expect(parseQuickAdd('Abgabe in 3 Tagen', T).due).toBe('2026-10-30');
    expect(parseQuickAdd('Abgabe in 2 Wochen', T).due).toBe('2026-11-10');
    expect(parseQuickAdd('Treffen Freitag', T).due).toBe('2026-10-30');
    expect(parseQuickAdd('Treffen am Dienstag', T).due).toBe('2026-11-03');
  });

  it('versteht Kalenderdaten mit und ohne Jahr', () => {
    expect(parseQuickAdd('Klausur 5.11.', T).due).toBe('2026-11-05');
    expect(parseQuickAdd('Klausur am 03.02.2027', T).due).toBe('2027-02-03');
    expect(parseQuickAdd('Geburtstag 1.3.', T).due).toBe('2027-03-01');
  });

  it('versteht Uhrzeiten', () => {
    expect(parseQuickAdd('Call 14:30 morgen', T)).toMatchObject({ dueTime: '14:30', due: '2026-10-28', title: 'Call' });
    expect(parseQuickAdd('Sport um 18', T)).toMatchObject({ dueTime: '18:00', due: T, title: 'Sport' });
  });

  it('nutzt die Apple-Prioritäten', () => {
    expect(parseQuickAdd('A !', T).priority).toBe('niedrig');
    expect(parseQuickAdd('A !!', T).priority).toBe('mittel');
    expect(parseQuickAdd('A', T).priority).toBeNull();
  });

  it('lässt normalen Text und unbekannte Kurse unverändert', () => {
    expect(parseQuickAdd('Version 2.0 testen #unbekannt', T, courses)).toEqual({
      title: 'Version 2.0 testen #unbekannt', due: null, dueTime: '', priority: null, courseId: null, evening: false, someday: false,
    });
    expect(parseQuickAdd('Programm #MA-101', T, courses).courseId).toBe('ana');
  });
});

describe('Things-Wörter', () => {
  it('versteht „heute abend“ und „irgendwann“', () => {
    expect(parseQuickAdd('Lea anrufen heute abend', T)).toMatchObject({ title: 'Lea anrufen', evening: true, due: null });
    expect(parseQuickAdd('Spanisch lernen irgendwann', T)).toMatchObject({ title: 'Spanisch lernen', someday: true, due: null });
    expect(parseQuickAdd('Abendessen heute', T)).toMatchObject({ due: T, evening: false });
  });
});

describe('Schnelleingabe für Termine', () => {
  const t = '2026-10-28'; // Mittwoch
  it('erkennt Zeitraum, Tag und Ort', () => {
    expect(parseEventQuickAdd('Lerngruppe morgen 14-16 Uhr @Bibliothek', t)).toMatchObject({
      title: 'Lerngruppe', start: '2026-10-29', startTime: '14:00', endTime: '16:00', location: 'Bibliothek', repeat: null, end: null,
    });
    expect(parseEventQuickAdd('Sprechstunde von 9 bis 11:30 freitag', t)).toMatchObject({ title: 'Sprechstunde', start: '2026-10-30', startTime: '09:00', endTime: '11:30' });
  });
  it('erkennt Wiederholungen', () => {
    expect(parseEventQuickAdd('Chor jeden Mittwoch 19 Uhr', t)).toMatchObject({ title: 'Chor', start: '2026-10-28', startTime: '19:00', repeat: 'woechentlich' });
    expect(parseEventQuickAdd('Miete monatlich 1.11.', t)).toMatchObject({ title: 'Miete', start: '2026-11-01', repeat: 'monatlich' });
  });
  it('erkennt mehrtägige Zeiträume und nimmt sonst den gewählten Tag', () => {
    expect(parseEventQuickAdd('Skiurlaub 27.12.-2.1.', t)).toMatchObject({ title: 'Skiurlaub', start: '2026-12-27', end: '2027-01-02', startTime: '' });
    expect(parseEventQuickAdd('Blatt 3-4 abgeben !!!', t, '2026-11-02')).toMatchObject({ title: 'Blatt 3-4 abgeben', start: '2026-11-02', startTime: '', priority: 'hoch' });
  });
});
