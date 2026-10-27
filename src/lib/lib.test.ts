import { describe, expect, it } from 'vitest';
import type { Card, Course, Grade } from '../types';
import { addDays, daysBetween, relativeLabel } from './dates';
import { review, START_EASE } from './srs';
import { courseGrade, summary } from './grades';

const D = '2026-10-27';
const newCard: Card = { id: 'c', courseId: null, front: 'f', back: 'b', interval: 0, ease: START_EASE, reps: 0, lapses: 0, due: D };

describe('dates', () => {
  it('rechnet über Monatsgrenzen', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(daysBetween('2026-10-25', '2026-10-27')).toBe(2);
  });
  it('beschriftet relativ', () => {
    expect(relativeLabel(D, D)).toBe('heute');
    expect(relativeLabel('2026-10-28', D)).toBe('morgen');
    expect(relativeLabel('2026-10-24', D)).toBe('vor 3 Tagen');
  });
});

describe('Spaced Repetition', () => {
  it('plant neue Karten nach 1 bzw. 4 Tagen', () => {
    expect(review(newCard, 'gut', D).due).toBe('2026-10-28');
    expect(review(newCard, 'leicht', D).interval).toBe(4);
  });
  it('verlängert das Intervall bei „gut“', () => {
    let c = review(newCard, 'gut', D);
    c = review(c, 'gut', D);
    expect(c.interval).toBe(6);
    c = review(c, 'gut', D);
    expect(c.interval).toBe(15);
  });
  it('setzt bei „nochmal“ zurück und senkt die Leichtigkeit', () => {
    const c = review({ ...newCard, reps: 4, interval: 30 }, 'nochmal', D);
    expect(c).toMatchObject({ reps: 0, interval: 1, lapses: 1, ease: 2.3 });
  });
  it('unterschreitet die Mindest-Leichtigkeit nicht', () => {
    expect(review({ ...newCard, ease: 1.35 }, 'nochmal', D).ease).toBe(1.3);
  });
});

describe('Noten', () => {
  const courses: Course[] = [
    { id: 'a', name: 'A', code: '', semester: '', lecturer: '', room: '', ects: 10, color: '' },
    { id: 'b', name: 'B', code: '', semester: '', lecturer: '', room: '', ects: 5, color: '' },
    { id: 'c', name: 'C', code: '', semester: '', lecturer: '', room: '', ects: 5, color: '' },
  ];
  const grades: Grade[] = [
    { id: '1', courseId: 'a', title: 'Klausur', value: 1.0, weight: 50 },
    { id: '2', courseId: 'a', title: 'Hausarbeit', value: 2.0, weight: 50 },
    { id: '3', courseId: 'b', title: 'Klausur', value: 2.7, weight: 100 },
    { id: '4', courseId: 'c', title: 'Klausur', value: 5.0, weight: 100 },
  ];

  it('gewichtet Teilnoten im Kurs', () => {
    expect(courseGrade(grades, 'a')).toBe(1.5);
    expect(courseGrade(grades, 'x')).toBeNull();
  });
  it('gewichtet nach ECTS, schneidet ab und zählt nur bestandene ECTS', () => {
    const s = summary(courses, grades);
    // (1,5·10 + 2,7·5 + 5,0·5) / 20 = 2,675
    expect(s.average).toBeCloseTo(2.675);
    expect(s.truncated).toBe(2.6);
    expect(s.earnedEcts).toBe(15);
    expect(s.plannedEcts).toBe(20);
  });
});
