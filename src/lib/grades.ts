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

/** Notenstufen einer einzelnen bestandenen Prüfung */
export const GRADE_STEPS = [1.0, 1.3, 1.7, 2.0, 2.3, 2.7, 3.0, 3.3, 3.7, 4.0] as const;

/** Mögliche Notenziele (eine Nachkommastelle) */
export const TARGET_STEPS = [1.0, 1.3, 1.5, 1.7, 2.0, 2.3, 2.5, 2.7, 3.0, 3.3, 3.5, 3.7, 4.0] as const;

/** Nach der ersten Nachkommastelle abschneiden (wie in den meisten Prüfungsordnungen): 2,08 → 2,0 */
export const truncateGrade = (value: number) => Math.floor(value * 10 + 1e-9) / 10;

export interface CourseNeed {
  /** Noch offene Gewichtung in Prozent */
  open: number;
  /** Schlechteste Notenstufe in den offenen Teilen, mit der das Ziel klappt; null = nicht mehr erreichbar */
  needed: number | null;
  /** Bestmögliche Kursnote (alles Offene mit 1,0), abgeschnitten */
  best: number;
}

/**
 * „Was brauche ich noch?“ für einen Kurs: Die offenen Teile sind alles, was zu 100 % Gewichtung fehlt.
 * Gesucht ist die schlechteste Notenstufe dafür, mit der die Kursnote (abgeschnitten) das Ziel erreicht.
 * null, wenn schon alles benotet ist.
 */
export function courseNeed(grades: Grade[], courseId: ID, target: number): CourseNeed | null {
  const own = grades.filter((g) => g.courseId === courseId && g.weight > 0);
  const used = own.reduce((s, g) => s + g.weight, 0);
  const open = 100 - used;
  if (open <= 1e-6) return null;
  const sum = own.reduce((s, g) => s + g.value * g.weight, 0);
  const result = (x: number) => (sum + x * open) / 100;
  const ok = GRADE_STEPS.filter((x) => truncateGrade(result(x)) <= target + 1e-9);
  return { open, needed: ok.length ? ok[ok.length - 1] : null, best: truncateGrade(result(1)) };
}

export interface DegreeNeed {
  /** Benotete ECTS */
  graded: number;
  /** Noch offene ECTS bis zum Abschluss */
  open: number;
  /** Bisheriger Schnitt (exakt), null ohne Noten */
  current: number | null;
  /** Nötiger Schnitt in den offenen ECTS (eine Nachkommastelle, sicher gerundet); null = nicht mehr erreichbar */
  needed: number | null;
  /** Bestmöglicher Abschluss (alles Offene mit 1,0), abgeschnitten */
  best: number;
}

/**
 * Notenziel fürs ganze Studium: Welchen Schnitt brauche ich in den restlichen ECTS,
 * damit der Abschluss-Schnitt (abgeschnitten) das Ziel erreicht? Zählt wie `summary` alle benoteten Kurse.
 */
export function degreeNeed(courses: Course[], grades: Grade[], totalEcts: number, target: number): DegreeNeed | null {
  let sum = 0;
  let graded = 0;
  for (const c of courses) {
    const g = courseGrade(grades, c.id);
    if (g === null || c.ects <= 0) continue;
    sum += g * c.ects;
    graded += c.ects;
  }
  const open = totalEcts - graded;
  if (open <= 0) return null;
  // Abgeschnitten ≤ Ziel heißt: der Schnitt bleibt unter Ziel + 0,1
  const limit = ((target + 0.1) * (graded + open) - sum) / open;
  let needed: number | null;
  if (limit > 4 + 1e-9) needed = 4;
  else if (limit <= 1 + 1e-9) needed = null;
  else needed = Math.max(1, (Math.ceil(limit * 10 - 1e-9) - 1) / 10);
  return { graded, open, current: graded > 0 ? sum / graded : null, needed, best: truncateGrade((sum + open) / (graded + open)) };
}
