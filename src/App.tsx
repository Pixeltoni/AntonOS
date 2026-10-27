import { useEffect, useState } from 'react';
import { useStore } from './store';
import { today } from './lib/dates';
import { isDue } from './lib/srs';
import { Dashboard } from './pages/Dashboard';
import { CourseDetail, Courses } from './pages/Courses';
import { Tasks } from './pages/Tasks';
import { Notes } from './pages/Notes';
import { Flashcards } from './pages/Flashcards';
import { Exams } from './pages/Exams';
import { Grades } from './pages/Grades';
import { Goals } from './pages/Goals';
import { Focus } from './pages/Focus';
import { Settings } from './pages/Settings';
import { Habits } from './pages/Habits';
import { ProjectDetail, Projects } from './pages/Projects';
import { Finance } from './pages/Finance';
import { MediaPage } from './pages/Media';
import { Training } from './pages/Training';
import { Albums } from './pages/Albums';
import { Tools } from './pages/Tools';
import { Calendar } from './pages/Calendar';

const NAV: { group: string; items: { path: string; label: string; icon: string }[] }[] = [
  {
    group: '',
    items: [
      { path: 'dashboard', label: 'Dashboard', icon: '🏠' },
      { path: 'kalender', label: 'Kalender', icon: '🗓️' },
    ],
  },
  {
    group: 'Studium',
    items: [
      { path: 'kurse', label: 'Kurse', icon: '📚' },
      { path: 'aufgaben', label: 'Aufgaben', icon: '✅' },
      { path: 'notizen', label: 'Notizen', icon: '📝' },
      { path: 'lernen', label: 'Lernkarten', icon: '🧠' },
      { path: 'pruefungen', label: 'Prüfungen', icon: '📅' },
      { path: 'noten', label: 'Noten', icon: '📊' },
      { path: 'fokus', label: 'Fokus', icon: '⏱️' },
    ],
  },
  {
    group: 'Leben',
    items: [
      { path: 'projekte', label: 'Projekte', icon: '🚀' },
      { path: 'gewohnheiten', label: 'Gewohnheiten', icon: '✨' },
      { path: 'ziele', label: 'Ziele', icon: '🎯' },
      { path: 'finanzen', label: 'Finanzen', icon: '💰' },
      { path: 'training', label: 'Training', icon: '🏋️' },
    ],
  },
  {
    group: 'Sammlungen',
    items: [
      { path: 'schauen', label: 'Watchlist', icon: '📺' },
      { path: 'lesen', label: 'Leseliste', icon: '📖' },
      { path: 'alben', label: 'Alben', icon: '📸' },
      { path: 'tools', label: 'Tools', icon: '🧰' },
    ],
  },
  { group: '', items: [{ path: 'einstellungen', label: 'Einstellungen', icon: '⚙️' }] },
];

function useRoute(): string[] {
  const read = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

function Page({ route }: { route: string[] }) {
  const [page = 'dashboard', param = null] = route;
  switch (page) {
    case 'kurse':
      return param ? <CourseDetail id={param} /> : <Courses />;
    case 'aufgaben':
      return <Tasks />;
    case 'notizen':
      return <Notes selected={param} />;
    case 'lernen':
      return <Flashcards key={param ?? ''} courseId={param} />;
    case 'pruefungen':
      return <Exams />;
    case 'noten':
      return <Grades />;
    case 'ziele':
      return <Goals />;
    case 'fokus':
      return <Focus />;
    case 'einstellungen':
      return <Settings />;
    case 'kalender':
      return <Calendar />;
    case 'projekte':
      return param ? <ProjectDetail id={param} /> : <Projects />;
    case 'gewohnheiten':
      return <Habits />;
    case 'finanzen':
      return <Finance />;
    case 'schauen':
      return <MediaPage key="schauen" mode="schauen" />;
    case 'lesen':
      return <MediaPage key="lesen" mode="lesen" />;
    case 'training':
      return <Training />;
    case 'alben':
      return <Albums />;
    case 'tools':
      return <Tools />;
    default:
      return <Dashboard />;
  }
}

export function App() {
  const route = useRoute();
  const { data, saveFailed } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const current = route[0] ?? 'dashboard';
  const t = today();
  const counts: Record<string, number> = {
    aufgaben: data.tasks.filter((x) => x.status !== 'erledigt' && x.due !== null && x.due <= t).length,
    lernen: data.cards.filter((c) => isDue(c, t)).length,
    gewohnheiten: data.habits.filter((h) => !data.habitLogs.some((l) => l.habitId === h.id && l.date === t)).length,
  };

  return (
    <div className="layout">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <span>🎓 AntonOS</span>
          <button className="icon menu-toggle" onClick={() => setMenuOpen((o) => !o)} aria-label="Menü">☰</button>
        </div>
        <nav onClick={() => setMenuOpen(false)}>
          {NAV.map((section, i) => (
            <div key={i} className="nav-group">
              {section.group && <span className="nav-label">{section.group}</span>}
              {section.items.map((n) => (
                <a key={n.path} href={`#/${n.path}`} className={current === n.path ? 'active' : ''}>
                  <span aria-hidden>{n.icon}</span>
                  <span className="grow">{n.label}</span>
                  {counts[n.path] > 0 && <span className="count">{counts[n.path]}</span>}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main>
        {saveFailed && (
          <p className="alert" role="alert">
            Speichern fehlgeschlagen – vermutlich ist der Browser-Speicher voll. Entferne große hochgeladene Bilder oder nutze
            Bild-Links statt Uploads, und lade ein <a href="#/einstellungen">Backup</a> herunter.
          </p>
        )}
        <Page route={route} />
      </main>
    </div>
  );
}
