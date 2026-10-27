export type ID = string;

/** Datum im Format YYYY-MM-DD */
export type DateStr = string;

export interface Course {
  id: ID;
  name: string;
  code: string;
  semester: string;
  lecturer: string;
  room: string;
  ects: number;
  color: string;
}

export type TaskStatus = 'offen' | 'in Arbeit' | 'erledigt';
export type TaskKind = 'Aufgabe' | 'Lektüre' | 'Projekt' | 'Bewerbung';
export type Priority = 'niedrig' | 'mittel' | 'hoch';

export interface Task {
  id: ID;
  title: string;
  courseId: ID | null;
  projectId?: ID | null;
  kind: TaskKind;
  status: TaskStatus;
  priority: Priority;
  due: DateStr | null;
}

export interface Note {
  id: ID;
  title: string;
  courseId: ID | null;
  content: string;
  updated: string;
}

export interface Card {
  id: ID;
  courseId: ID | null;
  front: string;
  back: string;
  /** Tage bis zur nächsten Wiederholung */
  interval: number;
  /** Leichtigkeitsfaktor (SM-2), min. 1.3 */
  ease: number;
  /** Anzahl erfolgreicher Wiederholungen in Folge */
  reps: number;
  lapses: number;
  due: DateStr;
}

export interface Exam {
  id: ID;
  title: string;
  courseId: ID | null;
  date: DateStr;
  time: string;
  location: string;
}

export interface Grade {
  id: ID;
  courseId: ID;
  title: string;
  /** Deutsche Note 1,0 – 5,0 */
  value: number;
  /** Gewichtung innerhalb des Kurses in Prozent */
  weight: number;
}

export type GoalArea = 'Studium' | 'Karriere' | 'Gesundheit' | 'Persönlich' | 'Finanzen';

export interface Goal {
  id: ID;
  title: string;
  area: GoalArea;
  why: string;
  deadline: DateStr | null;
  progress: number;
  /** Bild-URL oder Data-URL für das Vision Board */
  image?: string;
}

export type ProjectStatus = 'geplant' | 'aktiv' | 'pausiert' | 'abgeschlossen';

export interface Project {
  id: ID;
  title: string;
  area: string;
  status: ProjectStatus;
  due: DateStr | null;
  cover: string;
  description: string;
}

export interface Habit {
  id: ID;
  name: string;
  icon: string;
}

export interface HabitLog {
  id: ID;
  habitId: ID;
  date: DateStr;
}

export type TxType = 'Ausgabe' | 'Einnahme';

export interface Transaction {
  id: ID;
  type: TxType;
  description: string;
  /** Betrag in Euro, immer positiv */
  amount: number;
  category: string;
  account: string;
  date: DateStr;
}

export type MediaKind = 'Serie' | 'Film' | 'Buch' | 'Hörbuch';
export type MediaStatus = 'geplant' | 'läuft' | 'fertig' | 'abgebrochen';

export interface Media {
  id: ID;
  kind: MediaKind;
  title: string;
  /** Autor/in, Plattform o. Ä. */
  creator: string;
  cover: string;
  status: MediaStatus;
  /** 0 = unbewertet, sonst 1–5 Sterne */
  rating: number;
  progress: string;
}

export interface Workout {
  id: ID;
  title: string;
  type: string;
  date: DateStr;
  done: boolean;
  notes: string;
}

export interface Album {
  id: ID;
  title: string;
  date: DateStr;
  cover: string;
  tags: string;
  description: string;
}

export interface Tool {
  id: ID;
  name: string;
  url: string;
  category: string;
}

export interface Settings {
  name: string;
  cover: string;
  spotifyUrl: string;
}

export interface FocusSession {
  id: ID;
  date: DateStr;
  minutes: number;
  courseId: ID | null;
  distractions: number;
}

export interface Data {
  courses: Course[];
  tasks: Task[];
  notes: Note[];
  cards: Card[];
  exams: Exam[];
  grades: Grade[];
  goals: Goal[];
  sessions: FocusSession[];
  projects: Project[];
  habits: Habit[];
  habitLogs: HabitLog[];
  transactions: Transaction[];
  media: Media[];
  workouts: Workout[];
  albums: Album[];
  tools: Tool[];
  settings: Settings;
}

/** Alle Listen-Sammlungen in `Data` (also alles außer den Einstellungen) */
export type Collection = { [K in keyof Data]: Data[K] extends unknown[] ? K : never }[keyof Data];
