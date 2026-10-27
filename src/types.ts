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
  note?: string;
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

export type EventPriority = 'niedrig' | 'mittel' | 'hoch';

/** Eigener Kalendertermin */
export interface CalEvent {
  id: ID;
  title: string;
  note: string;
  start: DateStr;
  /** Letzter Tag bei mehrtägigen Terminen, sonst null */
  end: DateStr | null;
  /** Uhrzeit HH:MM, leer = ganztägig */
  startTime: string;
  endTime: string;
  priority: EventPriority;
}

export interface Tool {
  id: ID;
  name: string;
  url: string;
  category: string;
}

export type WidgetId =
  | 'topnav' | 'stats' | 'clock' | 'quick' | 'notes' | 'music' | 'tools' | 'tasks' | 'projects'
  | 'transactions' | 'watching' | 'reading' | 'habits' | 'period' | 'exams' | 'trainings'
  | 'calendar' | 'courses' | 'albums' | 'vision';

/** Breite im 12-Spalten-Raster: ¼, ⅓, ½, ⅔ oder ganze Breite */
export type WidgetSize = 's' | 'm' | 'l' | 'xl' | 'full';
/** Höhe: automatisch nach Inhalt oder fest (mit Scrollen) */
export type WidgetHeight = 'auto' | 's' | 'm' | 'l';
/** Wie viel Information ein Kasten zeigt */
export type WidgetVariant = 'kompakt' | 'standard' | 'detail';

export interface WidgetConfig {
  id: WidgetId;
  size: WidgetSize;
  height: WidgetHeight;
  variant: WidgetVariant;
  hidden: boolean;
}

export type BackgroundKind = 'standard' | 'farbe' | 'verlauf' | 'bild';
export type ThemeMode = 'system' | 'hell' | 'dunkel';

export interface Appearance {
  theme: ThemeMode;
  background: BackgroundKind;
  color: string;
  /** Kennung eines vordefinierten Verlaufs */
  gradient: string;
  /** Bild-URL oder hochgeladenes Bild */
  image: string;
  /** Abdunkeln des Hintergrunds in Prozent (0–80) */
  dim: number;
  /** Halbdurchsichtige Kästen mit Unschärfe-Effekt */
  glass: boolean;
  /** Wie milchig die Glas-Kästen sind (0–100) */
  glassLevel: number;
  /** Akzentfarbe, leer = Standard */
  accent: string;
}

export interface NavItem {
  path: string;
  label: string;
  icon: string;
  group: string;
  hidden: boolean;
}

export interface Settings {
  name: string;
  cover: string;
  spotifyUrl: string;
  /** Client-ID einer eigenen Spotify-App für die Verbindung mit dem Konto */
  spotifyClientId: string;
  /** Reihenfolge, Größe, Ansicht und Sichtbarkeit der Dashboard-Widgets (leer = Standard) */
  dashboard: WidgetConfig[];
  /** Reihenfolge, Namen und Sichtbarkeit der Sidebar-Einträge (leer = Standard) */
  sidebar: NavItem[];
  appearance: Appearance;
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
  events: CalEvent[];
  albums: Album[];
  tools: Tool[];
  settings: Settings;
}

/** Alle Listen-Sammlungen in `Data` (also alles außer den Einstellungen) */
export type Collection = { [K in keyof Data]: Data[K] extends unknown[] ? K : never }[keyof Data];
