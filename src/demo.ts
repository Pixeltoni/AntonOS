import type { Data, Settings } from './types';
import { addDays, today } from './lib/dates';
import { START_EASE } from './lib/srs';

export const defaultSettings = (): Settings => ({ name: 'Anton', cover: '', spotifyUrl: '' });

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
      { id: ana, name: 'Analysis I', code: 'MA-101', semester: 'WiSe 26/27', lecturer: 'Prof. Weber', room: 'H 1', ects: 9, color: '#6366f1' },
      { id: prog, name: 'Einführung in die Programmierung', code: 'INF-110', semester: 'WiSe 26/27', lecturer: 'Dr. Yilmaz', room: 'PC-Pool 2', ects: 6, color: '#10b981' },
    ],
    tasks: [
      { id: 'demo-t1', title: 'Übungsblatt 3', courseId: ana, kind: 'Aufgabe', status: 'offen', priority: 'hoch', due: addDays(t, 2) },
      { id: 'demo-t2', title: 'Kapitel 4 lesen', courseId: ana, kind: 'Lektüre', status: 'in Arbeit', priority: 'mittel', due: addDays(t, 5) },
      { id: 'demo-t3', title: 'Projekt: Taschenrechner', courseId: prog, kind: 'Projekt', status: 'offen', priority: 'mittel', due: addDays(t, 14) },
      { id: 'demo-t4', title: 'Bewerbung Werkstudentenstelle', courseId: null, kind: 'Bewerbung', status: 'offen', priority: 'niedrig', due: addDays(t, 9) },
    ],
    notes: [
      {
        id: 'demo-n1', title: 'Folgen und Grenzwerte', courseId: ana, updated: new Date().toISOString(),
        content: 'Eine Folge (aₙ) konvergiert gegen a, wenn es zu jedem ε > 0 ein N gibt, sodass |aₙ − a| < ε für alle n ≥ N.',
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
      { id: 'demo-h3', name: '2 Liter Wasser', icon: '💧' },
      { id: 'demo-h4', name: 'Tagesrückblick', icon: '📝' },
    ],
    habitLogs: [1, 2, 3].flatMap((d) => [
      { id: `demo-hl1-${d}`, habitId: 'demo-h1', date: addDays(t, -d) },
      { id: `demo-hl3-${d}`, habitId: 'demo-h3', date: addDays(t, -d) },
    ]),
    transactions: [
      { id: 'demo-x1', type: 'Einnahme', description: 'Werkstudentenjob', amount: 620, category: 'Gehalt', account: 'Girokonto', date: addDays(t, -6) },
      { id: 'demo-x2', type: 'Ausgabe', description: 'WG-Zimmer', amount: 390, category: 'Miete', account: 'Girokonto', date: addDays(t, -5) },
      { id: 'demo-x3', type: 'Ausgabe', description: 'Wocheneinkauf', amount: 42.8, category: 'Lebensmittel', account: 'Girokonto', date: addDays(t, -2) },
      { id: 'demo-x4', type: 'Ausgabe', description: 'Mensa', amount: 4.5, category: 'Lebensmittel', account: 'Bar', date: addDays(t, -1) },
      { id: 'demo-x5', type: 'Ausgabe', description: 'Lehrbuch Analysis', amount: 29.99, category: 'Studium', account: 'Kreditkarte', date: addDays(t, -1) },
    ],
    media: [
      { id: 'demo-m1', kind: 'Serie', title: 'The Office', creator: 'Netflix', cover: '', status: 'läuft', rating: 4, progress: 'S3 E7' },
      { id: 'demo-m2', kind: 'Buch', title: 'Die 1%-Methode', creator: 'James Clear', cover: '', status: 'läuft', rating: 5, progress: 'S. 120' },
      { id: 'demo-m3', kind: 'Film', title: 'Interstellar', creator: '', cover: '', status: 'geplant', rating: 0, progress: '' },
    ],
    workouts: [
      { id: 'demo-w1', title: '5 km Lauf', type: 'Laufen', date: addDays(t, -2), done: true, notes: '28:40 min' },
      { id: 'demo-w2', title: 'Ganzkörper', type: 'Krafttraining', date: addDays(t, -1), done: true, notes: '' },
      { id: 'demo-w3', title: 'Dehnen & Mobility', type: 'Dehnen', date: addDays(t, 1), done: false, notes: '' },
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
    settings: defaultSettings(),
  };
}
