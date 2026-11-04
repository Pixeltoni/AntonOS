/**
 * Ziele, die sich selbst messen: Ein Ziel bekommt Schlüsselergebnisse, deren Stand AntonOS
 * aus den eigenen Daten liest (Spartopf, Lernkarten, Training, Noten, Projekt, Gewohnheit).
 */
import type { Data, DateStr, Goal, ID, KeyResult, KeyResultKind } from '../types';
import { addDays } from './dates';
import { weekOf } from './rings';
import { courseGrade, degreeNeed, formatGrade, summary, truncateGrade } from './grades';
import { isHabitDone } from './life';

export const RESULT_KINDS: { kind: KeyResultKind; label: string; icon: string; hint: string }[] = [
  { kind: 'spartopf', label: 'Spartopf', icon: '🐷', hint: 'Wie viel schon gespart ist' },
  { kind: 'karten', label: 'Lernkarten', icon: '🗂️', hint: 'Wie gut die Karten sitzen' },
  { kind: 'training', label: 'Training', icon: '🏋️', hint: 'Trainings pro Woche' },
  { kind: 'note', label: 'Kursnote', icon: '🎯', hint: 'Note in einem Kurs' },
  { kind: 'schnitt', label: 'Notenschnitt', icon: '🎓', hint: 'Schnitt im Studium' },
  { kind: 'projekt', label: 'Projekt', icon: '📁', hint: 'Erledigte Aufgaben' },
  { kind: 'gewohnheit', label: 'Gewohnheit', icon: '✅', hint: 'Tage pro Woche' },
  { kind: 'manuell', label: 'Eigener Wert', icon: '✏️', hint: 'Zählst du selbst' },
];

/** Standard-Ziel je Art */
export const defaultTarget = (kind: KeyResultKind): number | undefined =>
  kind === 'training' ? 3 : kind === 'gewohnheit' ? 5 : kind === 'note' || kind === 'schnitt' ? 2 : kind === 'manuell' ? 10 : undefined;

/** Ab diesem Abstand (Tage) gilt eine Lernkarte als gelernt */
export const CARD_KNOWN_DAYS = 21;

export type GoalSources = Pick<Data, 'pots' | 'transactions' | 'cards' | 'courses' | 'grades' | 'workouts' | 'projects' | 'tasks' | 'habits' | 'habitLogs' | 'settings'>;

export interface Measure {
  /** Erreicht, 0–1 */
  share: number;
  /** Name, z. B. „✈️ Auslandssemester“ */
  label: string;
  /** Stand, z. B. „1.240 € von 3.000 €“ */
  text: string;
  /** Beitrag diese Woche, z. B. „+120 € gespart“ (leer = nichts) */
  week: string;
  /** Verknüpfter Eintrag wurde gelöscht */
  missing: boolean;
  href: string;
}

const clamp = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const euro = (v: number) => `${v.toLocaleString('de-DE', { maximumFractionDigits: v % 1 ? 2 : 0 })} €`;
const num = (v: number) => v.toLocaleString('de-DE', { maximumFractionDigits: 1 });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const inRange = (d: DateStr | undefined, from: DateStr, to: DateStr) => !!d && d >= from && d <= to;

/** Wie gut das Erreichte zur Wunschnote passt: 1 = Ziel erreicht, 0 = gerade nicht bestanden */
function gradeQuality(grade: number, target: number): number {
  if (truncateGrade(grade) <= target + 1e-9) return 1;
  return target >= 4 ? 0 : clamp((4 - grade) / (4 - target));
}

/** Liest den Stand eines Schlüsselergebnisses aus den Daten */
export function measureResult(kr: KeyResult, src: GoalSources, day: DateStr): Measure {
  const week = weekOf(day);
  const [from, to] = [week[0], week[6]];
  const last28 = addDays(day, -27);
  const target = kr.target ?? defaultTarget(kr.kind) ?? 1;
  const base = (label: string, href: string) => ({ label: kr.label?.trim() || label, href, missing: false, week: '' });
  const gone = (label: string, href: string): Measure => ({ ...base(label, href), share: 0, text: 'Verknüpfung fehlt – bitte neu wählen', missing: true });

  switch (kr.kind) {
    case 'spartopf': {
      const pot = src.pots.find((p) => p.id === kr.refId);
      if (!pot) return gone('Spartopf', '#/finanzen');
      // Buchungen dieser Woche: rein (vom Konto oder von außen) minus raus
      let moved = 0;
      for (const t of src.transactions) {
        if (t.category !== 'Sparen' || !inRange(t.date, from, to)) continue;
        const own = t.potId ? t.potId === pot.id : t.description.endsWith(`Spartopf: ${pot.name}`) || t.description.endsWith(`Spartopf ${pot.name}`);
        if (!own) continue;
        moved += t.description.startsWith('Aus Spartopf') ? -t.amount : t.amount;
      }
      return {
        ...base(`${pot.icon} ${pot.name}`, '#/finanzen'),
        share: pot.target > 0 ? clamp(pot.saved / pot.target) : 0,
        text: `${euro(pot.saved)} von ${euro(pot.target)}`,
        week: moved > 0 ? `+${euro(Math.round(moved * 100) / 100)} gespart` : moved < 0 ? `${euro(Math.round(-moved * 100) / 100)} entnommen` : '',
      };
    }
    case 'karten': {
      const course = kr.refId ? src.courses.find((c) => c.id === kr.refId) : null;
      if (kr.refId && !course) return gone('Lernkarten', '#/lernen');
      const cards = src.cards.filter((c) => !kr.refId || c.courseId === kr.refId);
      const known = cards.filter((c) => c.interval >= CARD_KNOWN_DAYS).length;
      // Jede Karte zählt anteilig, je länger ihr Abstand ist – so wächst der Fortschritt schon beim Lernen
      const share = cards.length ? cards.reduce((s, c) => s + clamp(c.interval / CARD_KNOWN_DAYS), 0) / cards.length : 0;
      const learned = cards.filter((c) => inRange(c.reviewed, from, to)).length;
      return {
        ...base(course ? `Lernkarten ${course.name}` : 'Alle Lernkarten', course ? `#/lernen/${course.id}` : '#/lernen'),
        share,
        text: cards.length ? `${known} von ${plural(cards.length, 'Karte', 'Karten')} sitzen` : 'Noch keine Karten',
        week: learned ? `${plural(learned, 'Karte', 'Karten')} wiederholt` : '',
      };
    }
    case 'training': {
      const done = src.workouts.filter((w) => w.done);
      const recent = done.filter((w) => inRange(w.date, last28, day)).length;
      const now = done.filter((w) => inRange(w.date, from, to)).length;
      return {
        ...base(`${num(target)}× Training pro Woche`, '#/training'),
        share: clamp(recent / (4 * target)),
        text: `Ø ${num(recent / 4)} pro Woche (4 Wochen) · Ziel ${num(target)}`,
        week: now ? plural(now, 'Training', 'Trainings') : '',
      };
    }
    case 'note': {
      const course = src.courses.find((c) => c.id === kr.refId);
      if (!course) return gone('Kursnote', '#/noten');
      const own = src.grades.filter((g) => g.courseId === course.id && g.weight > 0);
      const used = Math.min(100, own.reduce((s, g) => s + g.weight, 0));
      const grade = courseGrade(src.grades, course.id);
      const label = `${course.name} mit ${formatGrade(target, 1)}`;
      if (grade === null) return { ...base(label, '#/noten'), share: 0, text: `Noch keine Note · Ziel ${formatGrade(target, 1)}` };
      return {
        ...base(label, '#/noten'),
        share: clamp((used / 100) * gradeQuality(grade, target)),
        text: `Kursnote ${formatGrade(truncateGrade(grade), 1)} · Ziel ${formatGrade(target, 1)}${used < 100 ? ` · ${100 - used} % offen` : ''}`,
      };
    }
    case 'schnitt': {
      const planned = summary(src.courses, src.grades).plannedEcts;
      const total = src.settings.degree?.ects || planned || 180;
      const need = degreeNeed(src.courses, src.grades, total, target);
      const s = summary(src.courses, src.grades);
      const label = `Schnitt ${formatGrade(target, 1)}`;
      if (s.average === null) return { ...base(label, '#/noten'), share: 0, text: `Noch keine Noten · Ziel ${formatGrade(target, 1)}` };
      const graded = need ? need.graded : total;
      const hint = need ? (need.needed === null ? ' · nicht mehr erreichbar' : ` · in den übrigen ECTS Ø ${formatGrade(need.needed, 1)}`) : '';
      return {
        ...base(label, '#/noten'),
        share: clamp((graded / total) * gradeQuality(s.average, target)),
        text: `Schnitt ${formatGrade(s.truncated, 1)}${hint}`,
      };
    }
    case 'projekt': {
      const project = src.projects.find((p) => p.id === kr.refId);
      if (!project) return gone('Projekt', '#/projekte');
      const tasks = src.tasks.filter((x) => x.projectId === project.id);
      const done = tasks.filter((x) => x.status === 'erledigt');
      const thisWeek = done.filter((x) => inRange(x.completedAt, from, to)).length;
      return {
        ...base(project.title, `#/projekte/${project.id}`),
        share: project.status === 'abgeschlossen' ? 1 : tasks.length ? done.length / tasks.length : 0,
        text: tasks.length ? `${done.length} von ${plural(tasks.length, 'Aufgabe', 'Aufgaben')}` : 'Noch keine Aufgaben',
        week: thisWeek ? `${plural(thisWeek, 'Aufgabe', 'Aufgaben')} erledigt` : '',
      };
    }
    case 'gewohnheit': {
      const habit = src.habits.find((h) => h.id === kr.refId);
      if (!habit) return gone('Gewohnheit', '#/gewohnheiten');
      let recent = 0;
      let now = 0;
      for (let d = last28; d <= day; d = addDays(d, 1)) {
        if (!isHabitDone(src.habitLogs, habit, d)) continue;
        recent += 1;
        if (d >= from) now += 1;
      }
      return {
        ...base(`${habit.icon} ${habit.name} an ${num(target)} Tagen pro Woche`, '#/gewohnheiten'),
        share: clamp(recent / (4 * target)),
        text: `Ø ${num(recent / 4)} Tage pro Woche (4 Wochen) · Ziel ${num(target)}`,
        week: now ? plural(now, 'Tag', 'Tage') : '',
      };
    }
    default: {
      const current = kr.current ?? 0;
      const unit = kr.unit?.trim() ?? '';
      return {
        ...base('Eigener Wert', '#/ziele'),
        share: target > 0 ? clamp(current / target) : 0,
        text: `${num(current)} von ${num(target)}${unit ? ` ${unit}` : ''}`,
      };
    }
  }
}

/** Fortschritt eines Ziels in Prozent: aus den Schlüsselergebnissen, sonst von Hand */
export function goalProgress(goal: Goal, src: GoalSources, day: DateStr): number {
  const results = goal.results ?? [];
  if (!results.length) return goal.progress;
  const shares = results.map((r) => measureResult(r, src, day).share);
  return Math.round((shares.reduce((s, v) => s + v, 0) / shares.length) * 100);
}

export interface WeekContribution {
  goalId: ID;
  title: string;
  items: string[];
}

/** Was diese Woche auf welches Ziel eingezahlt hat (nur Ziele mit Beitrag) */
export function weekContributions(goals: Goal[], src: GoalSources, day: DateStr): WeekContribution[] {
  return goals
    .map((g) => ({ goalId: g.id, title: g.title, items: (g.results ?? []).map((r) => measureResult(r, src, day).week).filter(Boolean) }))
    .filter((c) => c.items.length > 0);
}
