import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from './quickadd';

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
      title: 'Version 2.0 testen #unbekannt', due: null, dueTime: '', priority: null, courseId: null,
    });
    expect(parseQuickAdd('Programm #MA-101', T, courses).courseId).toBe('ana');
  });
});
