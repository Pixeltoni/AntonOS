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
  /** Feste Zeiten im Stundenplan (Vorlesung, Übung …) */
  slots?: CourseSlot[];
}

/** Wöchentliche Zeit eines Kurses */
export interface CourseSlot {
  id: ID;
  /** 1 = Montag … 7 = Sonntag */
  day: number;
  start: string;
  end: string;
  room: string;
  /** Vorlesung, Übung, Tutorium, Seminar, Praktikum */
  kind: string;
  /** 1 = jede Woche, 2 = alle 2 Wochen */
  every: 1 | 2;
  /** Erster Termin (wichtig bei „alle 2 Wochen“), sonst Semesterbeginn */
  from?: DateStr;
  /** Ausgefallene Termine */
  except?: DateStr[];
}

export type RepeatFreq = 'taeglich' | 'woechentlich' | 'zweiwoechentlich' | 'monatlich' | 'jaehrlich';

export interface Recurrence {
  freq: RepeatFreq;
  /** Letzter möglicher Tag, null = ohne Ende */
  until: DateStr | null;
  /** Einzelne ausgelassene Tage */
  except?: DateStr[];
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
  /** Uhrzeit HH:MM, optional */
  dueTime?: string;
  flagged?: boolean;
  subtasks?: Subtask[];
  /** Tag, an dem die Aufgabe erledigt wurde (für den Rückblick) */
  completedAt?: DateStr;
  /** Wie in Things: ab diesem Tag in „Heute“ (ohne Frist) */
  plannedFor?: DateStr | null;
  /** In „Heute“ unter „Heute Abend“ */
  evening?: boolean;
  /** „Irgendwann“ – ohne Datum, taucht nicht im Alltag auf */
  someday?: boolean;
  /** Abschnitt innerhalb eines Projekts */
  section?: string;
}

export interface Subtask {
  id: ID;
  title: string;
  done: boolean;
}

export interface Note {
  id: ID;
  title: string;
  courseId: ID | null;
  content: string;
  updated: string;
  /** Oben in der Liste angeheftet */
  pinned?: boolean;
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
  /** Aus dieser Notiz erstellt */
  noteId?: ID;
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
  /** Abschnitte wie in Things, z. B. „Bewerbung“, „Wohnung“ */
  sections?: string[];
}

export interface Habit {
  id: ID;
  name: string;
  icon: string;
  /** Tagesziel bei Mengen-Gewohnheiten, z. B. 2 (Liter) */
  target?: number;
  /** Einheit, z. B. „l“ oder „Seiten“ */
  unit?: string;
  /** Schrittweite für den Plus-Knopf, z. B. 0,25 (ältere Gewohnheiten) */
  step?: number;
  /** Mehrere Mengen zum Hinzufügen, z. B. [0,2, 0,5] – je ein Plus-Knopf */
  steps?: number[];
}

export interface HabitLog {
  id: ID;
  habitId: ID;
  date: DateStr;
  /** Eingetragene Menge bei Mengen-Gewohnheiten */
  amount?: number;
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
  /** Gehört zu dieser Reise (Reisebudget) */
  tripId?: ID;
}

/** Wiederkehrende Zahlung (Miete, Abos, Gehalt), wird jeden Monat automatisch gebucht */
export interface Recurring {
  id: ID;
  type: TxType;
  description: string;
  amount: number;
  category: string;
  account: string;
  /** Tag im Monat (1–31; in kürzeren Monaten der letzte Tag) */
  day: number;
  /** Erster Monat (YYYY-MM) */
  start: string;
  /** Zuletzt automatisch gebuchter Monat (YYYY-MM) */
  lastBooked: string | null;
  paused?: boolean;
  /** Alle wie viele Monate gebucht wird: 1 = monatlich (Standard), 3, 6 oder 12 = jährlich */
  every?: number;
  /** Ende der aktuellen Vertragslaufzeit (leer = jederzeit kündbar) */
  termEnd?: DateStr | null;
  /** Kündigungsfrist in Tagen vor Laufzeitende */
  noticeDays?: number;
  /** Ohne Kündigung verlängert sich der Vertrag um so viele Monate (0 = endet von selbst) */
  renewMonths?: number;
  /** Gekündigt zum: danach wird nicht mehr gebucht */
  endsOn?: DateStr | null;
}

/** Spartopf mit Ziel, z. B. „Auslandssemester“ */
export interface SavingsPot {
  id: ID;
  name: string;
  icon: string;
  target: number;
  saved: number;
  color: string;
}

export interface FinanceSettings {
  /** Monatsbudget für Ausgaben (0 = keins) */
  budget: number;
  /** Budget pro Kategorie */
  categoryBudgets: { category: string; amount: number }[];
}

/** Artikel auf der Einkaufsliste */
export interface ShoppingItem {
  id: ID;
  name: string;
  /** Menge als Text, z. B. „6“ oder „500 g“ */
  amount: string;
  /** Abteilung im Supermarkt (siehe lib/shopping) */
  aisle: string;
  done: boolean;
  added: string;
}

/** Rezept mit Zutaten und Schritten */
export interface Recipe {
  id: ID;
  title: string;
  /** Zubereitungszeit in Minuten */
  minutes: number;
  /** Portionen, für die die Mengen gelten */
  servings: number;
  /** Eine Zutat pro Zeile, z. B. „200 g Feta“ */
  ingredients: string;
  /** Ein Schritt pro Zeile */
  steps: string;
  image: string;
  /** Link zum Original-Rezept */
  url: string;
  tags: string;
  favorite?: boolean;
}

export type MealSlot = 'mittag' | 'abend';

/** Eintrag im Essensplan: ein Rezept oder freier Text (z. B. „Mensa“) */
export interface Meal {
  id: ID;
  date: DateStr;
  slot: MealSlot;
  recipeId: ID | null;
  title: string;
  /** Portionen (leer = wie im Rezept) */
  servings?: number;
}

/** Ein Mensch, der dir wichtig ist */
export interface Person {
  id: ID;
  name: string;
  /** Geburtstag als MM-TT (leer = unbekannt) */
  birthday: string;
  /** Geburtsjahr, falls bekannt (für das Alter) */
  birthYear: number | null;
  /** Familie, Freunde, Uni, WG … */
  group: string;
  note: string;
  color: string;
  gifts: Gift[];
  /** Erinnern, wenn du dich so viele Tage nicht gemeldet hast (0 = nie) */
  contactEvery: number;
  lastContact: DateStr | null;
  meetings: Meeting[];
}

export interface Gift {
  id: ID;
  title: string;
  done: boolean;
  added: DateStr;
}

export interface Meeting {
  id: ID;
  date: DateStr;
  note: string;
}

export type TripLegKind = 'flug' | 'zug' | 'bus' | 'auto' | 'unterkunft' | 'sonstiges';

/** Etappe einer Reise: Flug, Zug, Unterkunft … */
export interface TripLeg {
  id: ID;
  kind: TripLegKind;
  title: string;
  date: DateStr;
  time: string;
  /** z. B. Gleis, Platz, Buchungsnummer, Adresse */
  detail: string;
}

export interface PackItem {
  id: ID;
  title: string;
  section: string;
  done: boolean;
}

export interface Trip {
  id: ID;
  title: string;
  start: DateStr;
  end: DateStr;
  cover: string;
  /** Reisebudget in Euro (0 = keins) */
  budget: number;
  legs: TripLeg[];
  packing: PackItem[];
  note: string;
}

/** Eigene Packlisten-Vorlage */
export interface PackTemplate {
  name: string;
  items: { title: string; section: string }[];
}

/** Stimmung eines Tages (1 = schlecht … 5 = super) */
export interface MoodEntry {
  id: ID;
  date: DateStr;
  mood: number;
  note: string;
  /** Schlaf in Stunden, optional */
  sleep?: number | null;
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
  /** Dauer in Minuten (für den Bewegungsring) */
  minutes?: number;
  /** Trainingstag aus dem Trainingsplan (z. B. Push) */
  planDayId?: ID;
  /** Eingetragene Übungen mit Gewicht und Wiederholungen */
  exercises?: ExerciseLog[];
}

/** Ein Satz: Gewicht in kg (0 = Körpergewicht) und Wiederholungen */
export interface SetLog {
  weight: number;
  reps: number;
}

export interface ExerciseLog {
  exerciseId: ID;
  name: string;
  sets: SetLog[];
}

export interface PlanExercise {
  id: ID;
  name: string;
  /** Geplante Anzahl Sätze */
  sets: number;
  /** Ziel-Wiederholungen als Text, z. B. „8–12“ */
  reps?: string;
}

/** Ein Tag im Trainingsplan, z. B. Push oder Pull */
export interface TrainingDay {
  id: ID;
  name: string;
  exercises: PlanExercise[];
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

/** Farben im Notion-Stil für eigene Termine */
export type EventColor = 'grau' | 'braun' | 'orange' | 'gelb' | 'gruen' | 'blau' | 'lila' | 'rosa' | 'rot';

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
  /** Wiederholung, z. B. jeden Mittwoch */
  repeat?: Recurrence | null;
  /** Erinnerung so viele Minuten vorher (leer = keine) */
  remind?: number | null;
  /** Ort, z. B. Raum oder Adresse */
  location?: string;
  /** Eigene Farbe; leer = Farbe nach Wichtigkeit */
  color?: EventColor | null;
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
  | 'calendar' | 'courses' | 'albums' | 'vision' | 'rings' | 'focus' | 'budget' | 'stack' | 'today' | 'countdown' | 'shopping' | 'review'
  | 'birthdays' | 'meals' | 'trip';

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

export type ThemeMode = 'system' | 'hell' | 'dunkel';

export interface Appearance {
  theme: ThemeMode;
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
  /** Version der Sidebar-Ordnung (siehe SIDEBAR_LAYOUT) */
  sidebarLayout?: number;
  appearance: Appearance;
  /** Tagesziele der Aktivitätsringe */
  rings: RingGoals;
  finance: FinanceSettings;
  /** Häufig gekaufte Artikel für Vorschläge */
  shoppingFrequent: { name: string; count: number }[];
  /** Vorlesungszeit für den Stundenplan und Erinnerung vor Vorlesungen */
  semester: SemesterSettings;
  /** Eigene Packlisten-Vorlagen */
  packTemplates?: PackTemplate[];
}

export interface SemesterSettings {
  /** Erster und letzter Vorlesungstag (leer = ohne Grenze) */
  start: DateStr;
  end: DateStr;
  /** Minuten vor einer Vorlesung erinnern (0 = nie) */
  remind: number;
}

/**
 * Was ein Aktivitätsring zeigt: Lernen (Fokus-Timer im Lernmodus), Fokuszeit gesamt,
 * Bewegung (Training), alle Gewohnheiten, erledigte Aufgaben oder eine einzelne Gewohnheit.
 */
export type RingSource = 'learn' | 'focus' | 'move' | 'habits' | 'tasks' | `habit:${string}` | 'off';

export interface RingSlot {
  source: RingSource;
  /** Tagesziel (Minuten bzw. Aufgaben); bei Gewohnheiten ohne Bedeutung */
  goal: number;
}

export interface RingGoals {
  /** Lernminuten pro Tag (aus dem Fokus-Timer) – ältere Einstellung, gilt ohne `slots` */
  learnMinutes: number;
  /** Bewegungsminuten pro Tag (aus dem Training) – ältere Einstellung, gilt ohne `slots` */
  moveMinutes: number;
  /** Die drei Ringe von außen nach innen */
  slots?: RingSlot[];
  /** Abends erinnern, wenn ein Ring noch offen ist */
  reminder: boolean;
  reminderTime: string;
}

export type FocusMode = 'lernen' | 'arbeiten' | 'lesen';

export interface FocusSession {
  id: ID;
  date: DateStr;
  minutes: number;
  courseId: ID | null;
  distractions: number;
  /** Fokus-Modus (ältere Einträge ohne Modus zählen als Lernen) */
  mode?: FocusMode;
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
  recurring: Recurring[];
  pots: SavingsPot[];
  shopping: ShoppingItem[];
  recipes: Recipe[];
  meals: Meal[];
  people: Person[];
  trips: Trip[];
  moods: MoodEntry[];
  media: Media[];
  workouts: Workout[];
  trainingPlan: TrainingDay[];
  events: CalEvent[];
  /** Datenformat-Version der AntonOS-Version, die zuletzt gespeichert hat */
  schemaVersion?: number;
  albums: Album[];
  tools: Tool[];
  settings: Settings;
}

/** Alle Listen-Sammlungen in `Data` (also alles außer den Einstellungen) */
export type Collection = { [K in keyof Data]-?: Data[K] extends unknown[] ? K : never }[keyof Data];
