import type { Appearance, Data, FinanceSettings, SemesterSettings, Settings } from './types';
import { addDays, today } from './lib/dates';
import { START_EASE } from './lib/srs';
import { defaultRingGoals } from './lib/rings';
import { PUSH_PULL_TEMPLATE } from './lib/training';

export const defaultSettings = (): Settings => ({
  name: 'Anton',
  cover: '',
  spotifyUrl: '',
  spotifyClientId: '',
  dashboard: [],
  sidebar: [],
  sidebarLayout: 2,
  appearance: defaultAppearance(),
  rings: defaultRingGoals(),
  finance: defaultFinance(),
  shoppingFrequent: [],
  semester: defaultSemester(),
});

export const defaultSemester = (): SemesterSettings => ({ start: '', end: '', remind: 0 });

export const defaultFinance = (): FinanceSettings => ({ budget: 0, categoryBudgets: [] });

export function defaultAppearance(): Appearance {
  return { theme: 'system' };
}

/** Beispieldaten für den ersten Start, damit man sofort sieht, wie alles zusammenspielt. */
export function demoData(): Data {
  const t = today();
  const ana = 'demo-ana';
  const prog = 'demo-prog';
  const card = (id: string, courseId: string, front: string, back: string) => ({
    id, courseId, front, back, interval: 0, ease: START_EASE, reps: 0, lapses: 0, due: t,
  });

  return {
    courses: [
      { id: ana, name: 'Analysis I', code: 'MA-101', semester: 'WiSe 26/27', lecturer: 'Prof. Weber', room: 'H 1', ects: 9, color: '#6366f1', slots: [
        { id: 'demo-sl1', day: 1, start: '08:15', end: '09:45', room: 'H 1', kind: 'Vorlesung', every: 1 },
        { id: 'demo-sl2', day: 3, start: '08:15', end: '09:45', room: 'H 1', kind: 'Vorlesung', every: 1 },
        { id: 'demo-sl3', day: 4, start: '12:15', end: '13:45', room: 'S 3', kind: 'Übung', every: 1 },
      ] },
      { id: prog, name: 'Einführung in die Programmierung', code: 'INF-110', semester: 'WiSe 26/27', lecturer: 'Dr. Yilmaz', room: 'PC-Pool 2', ects: 6, color: '#10b981', slots: [
        { id: 'demo-sl4', day: 2, start: '10:15', end: '11:45', room: 'PC-Pool 2', kind: 'Vorlesung', every: 1 },
        { id: 'demo-sl5', day: 5, start: '10:15', end: '11:45', room: 'PC-Pool 2', kind: 'Tutorium', every: 1 },
      ] },
    ],
    tasks: [
      { id: 'demo-t1', title: 'Übungsblatt 3', courseId: ana, kind: 'Aufgabe', status: 'offen', priority: 'hoch', due: addDays(t, 2) },
      { id: 'demo-t2', title: 'Kapitel 4 lesen', courseId: ana, kind: 'Lektüre', status: 'in Arbeit', priority: 'mittel', due: addDays(t, 5) },
      { id: 'demo-t3', title: 'Projekt: Taschenrechner', courseId: prog, kind: 'Projekt', status: 'offen', priority: 'mittel', due: addDays(t, 14) },
      { id: 'demo-t4', title: 'Bewerbung Werkstudentenstelle', courseId: null, kind: 'Bewerbung', status: 'offen', priority: 'niedrig', due: addDays(t, 9) },
    ],
    notes: [
      {
        id: 'demo-n1', title: 'Folgen und Grenzwerte', courseId: ana, updated: new Date().toISOString(), pinned: true,
        content: '**Konvergenz**: Eine Folge (aₙ) konvergiert gegen a, wenn es zu jedem ε > 0 ein N gibt, sodass |aₙ − a| < ε für alle n ≥ N.\n\n## Zum Üben #klausur\n- [x] Beispiele aus VL 3\n- [ ] Monotoniekriterium üben\n- [ ] [[Übungsblatt 3]], Aufgabe 2',
      },
    ],
    cards: [
      card('demo-c1', ana, 'Wann heißt eine Folge beschränkt?', 'Wenn es ein M gibt mit |aₙ| ≤ M für alle n.'),
      card('demo-c2', ana, 'Was besagt der Satz von Bolzano-Weierstraß?', 'Jede beschränkte Folge in ℝ besitzt eine konvergente Teilfolge.'),
      card('demo-c3', prog, 'Was ist eine Schleifeninvariante?', 'Eine Aussage, die vor und nach jedem Schleifendurchlauf gilt.'),
    ],
    exams: [
      { id: 'demo-e1', title: 'Klausur Analysis I', courseId: ana, date: addDays(t, 40), time: '09:00', location: 'Audimax' },
    ],
    grades: [
      { id: 'demo-g1', courseId: prog, title: 'Klausur', value: 1.7, weight: 80 },
      { id: 'demo-g2', courseId: prog, title: 'Projekt', value: 1.3, weight: 20 },
    ],
    goals: [
      { id: 'demo-z1', title: 'Analysis-Klausur mit 2,0 oder besser', area: 'Studium', why: 'Grundlage für alle weiteren Mathe-Module', deadline: addDays(t, 40), progress: 30 },
      { id: 'demo-z2', title: '3× pro Woche Sport', area: 'Gesundheit', why: 'Mehr Energie beim Lernen', deadline: null, progress: 50 },
    ],
    sessions: [
      { id: 'demo-s1', date: addDays(t, -1), minutes: 50, courseId: ana, distractions: 2 },
    ],
    projects: [
      { id: 'demo-p1', title: 'Auslandssemester planen', area: 'Studium', status: 'aktiv', due: addDays(t, 60), cover: '', description: 'Bewerbung, Learning Agreement, Wohnung, Finanzierung.' },
      { id: 'demo-p2', title: 'Finanzen ordnen', area: 'Finanzen', status: 'aktiv', due: addDays(t, 20), cover: '', description: 'Abos prüfen, Budget aufstellen, Notgroschen anlegen.' },
    ],
    habits: [
      { id: 'demo-h1', name: '10 Minuten meditieren', icon: '🧘' },
      { id: 'demo-h2', name: '10 Seiten lesen', icon: '📖' },
      { id: 'demo-h3', name: '2 Liter Wasser', icon: '💧', target: 2, unit: 'l', step: 0.25 },
      { id: 'demo-h4', name: 'Tagesrückblick', icon: '📝' },
    ],
    habitLogs: [1, 2, 3].flatMap((d) => [
      { id: `demo-hl1-${d}`, habitId: 'demo-h1', date: addDays(t, -d) },
      { id: `demo-hl3-${d}`, habitId: 'demo-h3', date: addDays(t, -d), amount: 2 },
    ]),
    transactions: [
      { id: 'demo-x1', type: 'Einnahme', description: 'Werkstudentenjob', amount: 620, category: 'Gehalt', account: 'Girokonto', date: addDays(t, -6) },
      { id: 'demo-x2', type: 'Ausgabe', description: 'WG-Zimmer', amount: 390, category: 'Miete', account: 'Girokonto', date: addDays(t, -5) },
      { id: 'demo-x3', type: 'Ausgabe', description: 'Wocheneinkauf', amount: 42.8, category: 'Lebensmittel', account: 'Girokonto', date: addDays(t, -2) },
      { id: 'demo-x4', type: 'Ausgabe', description: 'Mensa', amount: 4.5, category: 'Lebensmittel', account: 'Bar', date: addDays(t, -1) },
      { id: 'demo-x5', type: 'Ausgabe', description: 'Lehrbuch Analysis', amount: 29.99, category: 'Studium', account: 'Kreditkarte', date: addDays(t, -1) },
    ],
    recurring: [
      { id: 'demo-r1', type: 'Ausgabe', description: 'WG-Zimmer', amount: 390, category: 'Miete', account: 'Girokonto', day: 1, start: t.slice(0, 7), lastBooked: t.slice(0, 7) },
      { id: 'demo-r2', type: 'Ausgabe', description: 'Spotify', amount: 6.99, category: 'Abos', account: 'Kreditkarte', day: 15, start: t.slice(0, 7), lastBooked: null },
    ],
    pots: [
      { id: 'demo-pot1', name: 'Auslandssemester', icon: '✈️', target: 3000, saved: 1150, color: '#007AFF' },
    ],
    moods: [
      { id: 'demo-mo1', date: addDays(t, -3), mood: 3, note: '', sleep: 6.5 },
      { id: 'demo-mo2', date: addDays(t, -2), mood: 4, note: 'Lauf am Morgen 🏃', sleep: 7.5 },
      { id: 'demo-mo3', date: addDays(t, -1), mood: 5, note: 'Übungsblatt geschafft', sleep: 8 },
    ],
    shopping: [
      { id: 'demo-sh1', name: 'Hafermilch', amount: '2', aisle: 'kuehl', done: false, added: t },
      { id: 'demo-sh2', name: 'Bananen', amount: '', aisle: 'obst', done: false, added: t },
      { id: 'demo-sh3', name: 'Vollkornbrot', amount: '', aisle: 'backwaren', done: false, added: t },
      { id: 'demo-sh4', name: 'Spaghetti', amount: '500 g', aisle: 'vorrat', done: false, added: t },
    ],
    media: [
      { id: 'demo-m1', kind: 'Serie', title: 'The Office', creator: 'Netflix', cover: '', status: 'läuft', rating: 4, progress: 'S3 E7' },
      { id: 'demo-m2', kind: 'Buch', title: 'Die 1%-Methode', creator: 'James Clear', cover: '', status: 'läuft', rating: 5, progress: 'S. 120' },
      { id: 'demo-m3', kind: 'Film', title: 'Interstellar', creator: '', cover: '', status: 'geplant', rating: 0, progress: '' },
    ],
    workouts: [
      { id: 'demo-w1', title: '5 km Lauf', type: 'Laufen', date: addDays(t, -2), done: true, notes: '28:40 min', minutes: 29 },
      { id: 'demo-w2', title: 'Ganzkörper', type: 'Krafttraining', date: addDays(t, -1), done: true, notes: '', minutes: 45 },
      { id: 'demo-w3', title: 'Dehnen & Mobility', type: 'Dehnen', date: addDays(t, 1), done: false, notes: '' },
    ],
    trainingPlan: PUSH_PULL_TEMPLATE.map((d, i) => ({ id: `demo-tp${i}`, name: d.name, exercises: d.exercises.map((e, k) => ({ id: `demo-tp${i}-${k}`, ...e })) })),
    events: [
      { id: 'demo-ev1', title: 'Lerngruppe Analysis', note: '', location: 'Bibliothek, Raum 2.14', start: addDays(t, 1), end: null, startTime: '14:00', endTime: '16:00', priority: 'mittel', repeat: { freq: 'woechentlich', until: null, except: [] }, remind: 15, color: 'lila' },
      { id: 'demo-ev2', title: 'Zahnarzt', note: '', start: addDays(t, 3), end: null, startTime: '09:30', endTime: '', priority: 'hoch' },
      { id: 'demo-ev3', title: 'Wochenende in Hamburg', note: 'Zug um 8:12', start: addDays(t, 11), end: addDays(t, 13), startTime: '', endTime: '', priority: 'niedrig', color: 'gruen' },
    ],
    albums: [
      { id: 'demo-a1', title: 'Ersti-Woche', date: addDays(t, -30), cover: '', tags: 'Uni, Freunde', description: '' },
    ],
    tools: [
      { id: 'demo-tl1', name: 'Moodle', url: 'https://moodle.org/', category: 'Studium' },
      { id: 'demo-tl2', name: 'Google Scholar', url: 'https://scholar.google.com/', category: 'Studium' },
      { id: 'demo-tl3', name: 'DeepL', url: 'https://www.deepl.com/', category: 'Produktivität' },
      { id: 'demo-tl4', name: 'Claude', url: 'https://claude.ai/', category: 'KI' },
    ],
    settings: { ...defaultSettings(), finance: { budget: 1200, categoryBudgets: [{ category: 'Lebensmittel', amount: 200 }, { category: 'Freizeit', amount: 80 }] } },
  };
}
