import type { Course, Grade, ID } from '../types';

export const PASS_LIMIT = 4.0;

/** Gewichteter Schnitt der Teilnoten eines Kurses, oder null ohne Noten. */
export function courseGrade(grades: Grade[], courseId: ID): number | null {
  const own = grades.filter((g) => g.courseId === courseId && g.weight > 0);
  const total = own.reduce((s, g) => s + g.weight, 0);
  if (total === 0) return null;
  return own.reduce((s, g) => s + g.value * g.weight, 0) / total;
}

export interface Summary {
  /** Nach ECTS gewichteter Schnitt aller benoteten Kurse */
  average: number | null;
  /** Nach deutscher Prüfungsordnung üblich: nach der ersten Nachkommastelle abgeschnitten */
  truncated: number | null;
  earnedEcts: number;
  plannedEcts: number;
}

export function summary(courses: Course[], grades: Grade[]): Summary {
  let weighted = 0;
  let weightSum = 0;
  let earnedEcts = 0;
  for (const c of courses) {
    const g = courseGrade(grades, c.id);
    if (g === null || c.ects <= 0) continue;
    weighted += g * c.ects;
    weightSum += c.ects;
    if (g <= PASS_LIMIT) earnedEcts += c.ects;
  }
  const average = weightSum > 0 ? weighted / weightSum : null;
  return {
    average,
    truncated: average === null ? null : Math.floor(average * 10 + 1e-9) / 10,
    earnedEcts,
    plannedEcts: courses.reduce((s, c) => s + Math.max(0, c.ects), 0),
  };
}

export function gradeLabel(value: number): string {
  if (value <= 1.5) return 'sehr gut';
  if (value <= 2.5) return 'gut';
  if (value <= 3.5) return 'befriedigend';
  if (value <= PASS_LIMIT) return 'ausreichend';
  return 'nicht bestanden';
}

export function formatGrade(value: number | null, digits = 2): string {
  return value === null ? '–' : value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
