import { describe, expect, it } from 'vitest';
import type { Course, Grade } from '../types';
import { courseNeed, degreeNeed, truncateGrade } from './grades';

const course = (id: string, ects: number): Course => ({ id, name: id, code: '', semester: '', lecturer: '', room: '', ects, color: '#000' });
const grade = (courseId: string, value: number, weight: number): Grade => ({ id: `${courseId}-${value}-${weight}`, courseId, title: 'Teil', value, weight });

describe('Notenziel', () => {
  it('schneidet nach der ersten Nachkommastelle ab', () => {
    expect(truncateGrade(2.09)).toBe(2);
    expect(truncateGrade(1.94)).toBe(1.9);
    expect(truncateGrade(2.3)).toBe(2.3);
  });

  it('findet die nötige Note für den offenen Teil eines Kurses', () => {
    // Übung 1,3 zählt 30 %, die Klausur (70 %) fehlt noch
    const n = courseNeed([grade('a', 1.3, 30)], 'a', 2.0)!;
    expect(n.open).toBe(70);
    expect(n.needed).toBe(2.3);
    expect(n.best).toBe(1.0);
  });

  it('ohne Noten entspricht die nötige Note dem Ziel', () => {
    expect(courseNeed([], 'a', 2.0)?.needed).toBe(2.0);
    expect(courseNeed([], 'a', 1.5)?.needed).toBe(1.3);
  });

  it('meldet sichere und verlorene Ziele', () => {
    expect(courseNeed([grade('a', 1.0, 80)], 'a', 2.0)?.needed).toBe(4.0);
    const lost = courseNeed([grade('a', 4.0, 80)], 'a', 2.0)!;
    expect(lost.needed).toBeNull();
    expect(lost.best).toBe(3.4);
    expect(courseNeed([grade('a', 2.0, 100)], 'a', 2.0)).toBeNull();
  });

  it('rechnet den nötigen Schnitt fürs ganze Studium', () => {
    const courses = [course('a', 60), course('b', 60)];
    const grades = [grade('a', 2.0, 100), grade('b', 2.0, 100)];
    // 120 von 180 ECTS mit 2,0 – für 1,9 muss der Schnitt unter 2,0 bleiben
    const n = degreeNeed(courses, grades, 180, 1.9)!;
    expect(n.graded).toBe(120);
    expect(n.open).toBe(60);
    expect(n.current).toBe(2);
    expect(n.needed).toBe(1.9);
    expect(degreeNeed(courses, grades, 180, 1.6)?.needed).toBe(1.0);
    expect(degreeNeed(courses, grades, 180, 1.5)?.needed).toBeNull();
    expect(degreeNeed(courses, grades, 180, 1.5)?.best).toBe(1.6);
    expect(degreeNeed(courses, grades, 180, 3.0)?.needed).toBe(4);
    expect(degreeNeed(courses, grades, 120, 2.0)).toBeNull();
  });
});
