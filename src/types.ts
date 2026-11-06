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
  /** Notenziel für den Kurs, z. B. 2,0 (leer = keins) */
  target?: number | null;
  /** Klausurzulassung über Übungsblätter (leer = keine) */
  admission?: Admission | null;
}

/** Klausurzulassung: so viele Punkte aus den Übungsblättern braucht man */
export interface Admission {
  /** Geplante Anzahl Übungsblätter im Semester */
  sheets: number;
  /** Punkte pro Blatt (Vorgabe für neue Blätter) */
  maxPerSheet: number;
  /** Nötig: Prozent der Gesamtpunkte bzw. feste Punktzahl */
  required: number;
  unit: 'prozent' | 'punkte';
}

/** Übungsblatt eines Kurses – die Abgabe steht zusätzlich als Aufgabe in der Liste */
export interface ExerciseSheet {
  id: ID;
  courseId: ID;
  /** Nummer des Blatts */
  number: number;
  /** Abgabetag (leer = ohne Frist) */
  due: DateStr | null;
  /** Uhrzeit der Abgabe HH:MM, optional */
  dueTime?: string;
  /** Erreichte Punkte, leer = noch nicht korrigiert */
  points: number | null;
  /** Mögliche Punkte */
  max: number;
  /** Aufgabe zur Abgabe (wird beim Anlegen erstellt) */
  taskId?: ID | null;
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
  /** Zur Uhrzeit mit einer Mitteilung erinnern (von der Assistentin) */
  remind?: boolean;
  flagged?: boolean;
  subtasks?: Subtask[];
  /** Tag, an dem die Aufgabe erledigt wurde (für den Rückblick) */
  completedAt?: DateStr;
  /** Wie in Things: ab diesem Tag in „Heute“ (ohne Frist) */
  plannedFor?: DateStr | null;
  /** In der Zeitleiste von „Heute“ eingeplant um HH:MM (am Tag `plannedFor`) */
  plannedTime?: string;
  /** In „Heute“ unter „Heute Abend“ */
  evening?: boolean;
  /** „Irgendwann“ – ohne Datum, taucht nicht im Alltag auf */
  someday?: boolean;
  /** Abschnitt innerhalb eines Projekts */
  section?: string;
  /** Wiederholung: beim Abhaken entsteht die nächste Aufgabe */
  repeat?: TaskRepeat | null;
  /** Vorgänger einer wiederholten Aufgabe (zum Widerrufen) */
  repeatOf?: ID;
  /** Eigene Reihenfolge (per Ziehen), kleinere zuerst */
  order?: number;
  /** Eigene Liste (z. B. Haushalt), sonst Kurs oder ohne Liste */
  listId?: ID | null;
  /** Tags wie „zuhause“ (ohne @) */
  tags?: string[];
  /** Erinnern, sobald man an diesem Ort ankommt (siehe Settings.places) */
  placeId?: ID | null;
  /** Geschätzter Aufwand in Minuten */
  estimate?: number;
  /** Im Fokus-Timer gearbeitete Minuten */
  spent?: number;
}

export interface TaskRepeat {
  freq: RepeatFreq | 'werktags';
  /** Bei „täglich“: alle n Tage */
  interval?: number;
  /** Bei „wöchentlich“: Wochentage 1 (Mo) bis 7 (So); leer = Wochentag der Fälligkeit */
  days?: number[];
  /** Nächste ab Erledigung statt ab Fälligkeit */
  afterDone?: boolean;
}

/** Eigene Aufgabenliste neben den Kursen */
export interface TodoList {
  id: ID;
  name: string;
  color: string;
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
  /** Zuletzt wiederholt (für „diese Woche gelernt“) */
  reviewed?: DateStr;
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
  /** Lernplan: so viele Stunden bis zur Prüfung lernen (leer = kein Plan) */
  studyHours?: number | null;
  /** Lernplan: ab diesem Tag zählt die Lernzeit */
  planFrom?: DateStr;
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
  /** Fortschritt in Prozent, von Hand (gilt nur ohne Schlüsselergebnisse) */
  progress: number;
  /** Bild-URL oder Data-URL für das Vision Board */
  image?: string;
  /** Messbare Schlüsselergebnisse – der Fortschritt rechnet sich daraus selbst */
  results?: KeyResult[];
}

/** Woran sich ein Ziel misst – AntonOS liest den Stand aus den eigenen Daten */
export type KeyResultKind = 'spartopf' | 'karten' | 'training' | 'note' | 'schnitt' | 'projekt' | 'gewohnheit' | 'manuell';

export interface KeyResult {
  id: ID;
  kind: KeyResultKind;
  /** Spartopf, Kurs (Lernkarten, Note), Projekt oder Gewohnheit; bei Lernkarten null = alle Karten */
  refId?: ID | null;
  /** Ziel: Trainings bzw. Tage pro Woche, Wunschnote, Zielwert (eigener Wert) */
  target?: number;
  /** Nur beim eigenen Wert: aktueller Stand und Einheit */
  current?: number;
  unit?: string;
  /** Eigener Name (leer = automatisch) */
  label?: string;
}

/** Woran sich ein Wochenziel selbst misst: Trainings, Tage einer Gewohnheit oder Lernminuten (eines Kurses) in der Woche */
export interface FocusMeasure {
  kind: 'training' | 'gewohnheit' | 'lernen';
  /** Gewohnheit bzw. Kurs (beim Lernen null = alle Kurse) */
  refId?: ID | null;
  /** Trainings, Tage oder Minuten */
  target: number;
}

/** Eines von höchstens drei Wochenzielen aus der Wochenplanung */
export interface WeekFocus {
  id: ID;
  text: string;
  icon?: string;
  /** Von Hand abgehakt (bei `measure` zählt zusätzlich der gemessene Stand) */
  done: boolean;
  measure?: FocusMeasure;
  /** Vorschlag kam aus diesem Ziel */
  goalId?: ID;
}

/** Wochenplanung am Sonntag: Wochenziele, Budget und ob die Woche „steht“ */
export interface WeekPlan {
  id: ID;
  /** Montag der geplanten Woche */
  week: DateStr;
  focus: WeekFocus[];
  /** Bestätigtes Wochenbudget für den Alltag (ohne Miete, Abos und Sparen); leer = keins */
  budget?: number | null;
  /** Tag, an dem die Planung abgeschlossen wurde */
  doneAt?: DateStr | null;
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

/** Ein Schritt einer Routine, z. B. „Dehnen“ (5 Min.) */
export interface RoutineStep {
  id: ID;
  title: string;
  icon: string;
  /** Dauer in Minuten (0 = ohne Uhr, einfach abhaken) */
  minutes: number;
  /** Beim Erledigen wird diese Gewohnheit abgehakt (bei Mengen: eine Portion) */
  habitId?: ID | null;
}

/** Ein abgeschlossener Durchlauf (für Serie und Statistik) */
export interface RoutineRun {
  date: DateStr;
  /** Gebrauchte Minuten */
  minutes: number;
  done: number;
  skipped: number;
}

/** Geführte Routine: Schritte mit Dauer, Start per Knopf, nach dem Wecker oder beim Ankommen an einem Ort */
export interface Routine {
  id: ID;
  name: string;
  icon: string;
  color: string;
  steps: RoutineStep[];
  /** Startet von selbst, wenn dieser Wecker ausgeschaltet wird */
  alarmId?: ID | null;
  /** Meldet sich beim Ankommen an diesem Ort (iPhone-App) */
  placeId?: ID | null;
  /** Tageszeit, zu der „Heute“ sie anbietet */
  when?: 'morgen' | 'tag' | 'abend' | null;
  /** Letzte Durchläufe, neueste zuletzt */
  runs?: RoutineRun[];
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
  /** Buchung in einen bzw. aus einem Spartopf */
  potId?: ID;
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
  /** Korrekturen des Kontostands – zählen weder als Einnahme noch als Ausgabe */
  balanceCorrections?: BalanceCorrection[];
}

/** Korrektur des Kontostands: verschiebt den Stand ab `date` um `amount` (kann negativ sein) */
export interface BalanceCorrection {
  id: ID;
  date: DateStr;
  amount: number;
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
  /** Geplante Uhrzeit HH:MM (Zeitleiste und Wochenplanung) */
  time?: string;
  /** Trainingstag aus dem Trainingsplan (z. B. Push) */
  planDayId?: ID;
  /** Aus Apple Health übernommen (Kennung des Workouts dort) */
  healthId?: string;
  /** Eingetragene Übungen mit Gewicht und Wiederholungen */
  exercises?: ExerciseLog[];
  /** Gemeinsame Kennung, wenn das Training als Serie (z. B. jeden Mo + Do) geplant wurde */
  seriesId?: ID;
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
  /** Eigenes Training außerhalb der Reihenfolge (z. B. Körpertraining): zählt nie als „Als Nächstes“ */
  separate?: boolean;
  /** Nur Wiederholungen zählen, kein Gewicht (z. B. Körpertraining). Leer = bei „Körpertraining“ an */
  repsOnly?: boolean;
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
  /** Kommt aus einem abonnierten Kalender (wird beim Aktualisieren ersetzt) */
  feedId?: ID;
}

/** Abonnierter Kalender (ICS-Link, z. B. Stundenplan aus dem Campus-Portal) */
export interface CalFeed {
  id: ID;
  name: string;
  url: string;
  color: EventColor;
  /** Letzter erfolgreicher Abruf (ms) */
  lastSync: number | null;
  /** Fehlermeldung des letzten Abrufs */
  error?: string;
  /** Anzahl der Termine beim letzten Abruf */
  count?: number;
}

/** Abend-Abschluss: Erinnerung und wann zuletzt abgeschlossen */
export interface DayCloseSettings {
  enabled: boolean;
  /** Uhrzeit der Erinnerung HH:MM */
  time: string;
  /** Zuletzt abgeschlossener Tag */
  last?: DateStr;
}

/** Lernplan: in welchem Zeitfenster Lernblöcke geplant werden */
export interface StudySettings {
  from: string;
  to: string;
  /** Höchstens so viele Minuten pro Tag */
  maxPerDay: number;
}

/** Face ID für private Bereiche (nur iPhone-App) */
export interface LockSettings {
  enabled: boolean;
  /** Gesperrte Seiten (Pfade wie „finanzen“) */
  pages: string[];
}

/** Ort für Erinnerungen beim Ankommen */
export interface Place {
  id: ID;
  name: string;
  lat: number;
  lon: number;
  /** Radius in Metern */
  radius: number;
  /** einkauf = Einkaufsliste zeigen, zuhause = Packliste beim Losgehen vor einer Reise */
  kind: 'einkauf' | 'zuhause' | 'ort';
}

/** Apple Health: was übernommen wird */
export interface HealthSettings {
  enabled: boolean;
  workouts: boolean;
  sleep: boolean;
  steps: boolean;
  /** Letzter Abgleich (ms) */
  lastSync?: number;
}

/** Tageswerte aus Apple Health */
export interface HealthDay {
  id: ID;
  date: DateStr;
  steps: number;
  /** Schlaf in der Nacht vor diesem Tag, Minuten */
  sleepMinutes: number;
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
  /** Eigenes Hintergrundbild (Link oder hochgeladen als data:-URL), leer = keins */
  image: string;
  /** Schleier über dem Bild in Prozent (0–80), damit Schrift lesbar bleibt */
  dim: number;
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
  /** Schlafziel und Erinnerung zur Schlafenszeit (Wecker) */
  sleep?: SleepSettings;
  /** Abonnierte Kalender */
  feeds?: CalFeed[];
  /** Tag abschließen am Abend */
  dayClose?: DayCloseSettings;
  /** Lernplan bis zur Prüfung */
  study?: StudySettings;
  /** Face ID für private Bereiche */
  lock?: LockSettings;
  /** Orte für Erinnerungen beim Ankommen */
  places?: Place[];
  /** Apple Health */
  health?: HealthSettings;
  /** Die drei frei wählbaren Seiten vorne in der Tab-Leiste am iPhone (leer = Standard) */
  tabs?: string[];
  /** Bereiche-Seite: Favoriten (Seiten) und eingeklappte Gruppen */
  areas?: AreaSettings;
  /** Ganzes Studium: ECTS bis zum Abschluss und Wunsch-Schnitt */
  degree?: DegreeSettings;
  /** Länge der Satzpause beim Training in Sekunden */
  restSeconds?: number;
  /** iPhone: im Fokus ausgewählte Apps über die Bildschirmzeit sperren (Auswahl liegt bei iOS) */
  focusLock?: boolean;
}

export interface AreaSettings {
  favorites?: string[];
  collapsed?: string[];
}

/** Notenziel fürs ganze Studium */
export interface DegreeSettings {
  /** ECTS bis zum Abschluss, z. B. 180 im Bachelor */
  ects: number;
  /** Wunsch-Schnitt (leer = keiner) */
  target: number | null;
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
  /** Versuche, eine im Fokus gesperrte App zu öffnen (Ablenkungs-Sperre am iPhone) */
  blocked?: number;
  /** Fokus-Modus (ältere Einträge ohne Modus zählen als Lernen) */
  mode?: FocusMode;
  /** Aufgabe, an der gearbeitet wurde */
  taskId?: ID | null;
}

/** keine = einfach ausschalten */
export type AlarmChallenge = 'rechnen' | 'text' | 'qr' | 'schuetteln' | 'memory' | 'keine';
/** ton = Weckton; datei = eigenes Lied (Ausschnitt als echter Weckton); spotify/youtube = Lied, am gesperrten iPhone erst der Weckton */
export type AlarmSound = 'ton' | 'datei' | 'youtube' | 'spotify';

export interface Alarm {
  id: ID;
  /** Weckzeit HH:MM */
  time: string;
  label: string;
  /** Wochentage 1 = Montag … 7 = Sonntag; leer = einmalig */
  days: number[];
  enabled: boolean;
  /** Zeitpunkt des Einschaltens (ms) – frühere Weckzeiten klingeln nicht nach */
  armedAt: number;
  sound: AlarmSound;
  /** YouTube- bzw. Spotify-Link */
  soundUrl: string;
  /** Name der eigenen Audiodatei (die Datei selbst liegt nur auf dem Gerät) bzw. des Spotify-Titels */
  soundName?: string;
  challenge: AlarmChallenge;
  /** Rechnen: 1 leicht, 2 mittel, 3 schwer */
  level: 1 | 2 | 3;
  /** Rechnen: Anzahl der Aufgaben */
  rounds: number;
  /** Text: eigener Satz (leer = zufälliger) */
  phrase: string;
  /** QR: Inhalt des hinterlegten Codes */
  qr: string;
  /** Einmaliger Wecker an diesem Tag (nur ohne Wochentage) */
  date?: DateStr;
  /** Dieser eine Tag wird übersprungen („Nur den nächsten auslassen“) */
  skip?: DateStr;
  /** Bis einschließlich zu diesem Tag pausiert (z. B. Urlaub) */
  pausedUntil?: DateStr;
  /** Schlummern erlaubt */
  snooze?: boolean;
  /** Schlummer-Dauer in Minuten */
  snoozeMinutes?: number;
  /** Höchstens so oft schlummern */
  snoozeMax?: number;
  /** Klang beginnt leise und wird lauter */
  fadeIn?: boolean;
  /** Ein paar Minuten nach dem Ausschalten fragen, ob man wach ist */
  wakeCheck?: boolean;
  /** Minuten bis zum Wach-Check */
  wakeCheckMinutes?: number;
  /** Nach dem Ausschalten den Guten-Morgen-Bildschirm zeigen (Standard: an) */
  morning?: boolean;
  /** Lied läuft nach dem Stopp weiter: während der Aufgabe, Spotify auch danach */
  keepMusic?: boolean;
  /** Eigenes Lied: Start des Weckton-Ausschnitts in Sekunden */
  clipStart?: number;
  /** Weckton (siehe lib/tones.ts) */
  tone?: string;
}

/** Ein Aufstehen: wann der Wecker klingelte, wann er aus war, wie oft geschlummert */
export interface WakeLog {
  id: ID;
  date: DateStr;
  alarmId: ID;
  /** Geplante Weckzeit (ms) */
  ringAt: number;
  /** Aufgabe gelöst bzw. ausgeschaltet (ms) */
  offAt: number;
  snoozes: number;
}

export interface SleepSettings {
  /** Schlafziel in Minuten */
  goal: number;
  /** Zur Schlafenszeit erinnern */
  remind: boolean;
}

export interface Data {
  courses: Course[];
  tasks: Task[];
  taskLists: TodoList[];
  notes: Note[];
  cards: Card[];
  exams: Exam[];
  grades: Grade[];
  /** Übungsblätter für die Klausurzulassung */
  sheets: ExerciseSheet[];
  goals: Goal[];
  /** Wochenplanung (Wochenziele und Budget je Woche) */
  weekPlans: WeekPlan[];
  sessions: FocusSession[];
  projects: Project[];
  habits: Habit[];
  habitLogs: HabitLog[];
  /** Geführte Routinen (Morgen, Abend, Lernen …) */
  routines: Routine[];
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
  alarms: Alarm[];
  wakeLogs: WakeLog[];
  /** Tageswerte aus Apple Health (Schritte, Schlaf) */
  healthDays: HealthDay[];
  settings: Settings;
}

/** Alle Listen-Sammlungen in `Data` (also alles außer den Einstellungen) */
export type Collection = { [K in keyof Data]-?: Data[K] extends unknown[] ? K : never }[keyof Data];
