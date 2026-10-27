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

const NAV = [
  { path: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { path: 'kurse', label: 'Kurse', icon: '📚' },
  { path: 'aufgaben', label: 'Aufgaben', icon: '✅' },
  { path: 'notizen', label: 'Notizen', icon: '📝' },
  { path: 'lernen', label: 'Lernkarten', icon: '🧠' },
  { path: 'pruefungen', label: 'Prüfungen', icon: '📅' },
  { path: 'noten', label: 'Noten', icon: '📊' },
  { path: 'ziele', label: 'Ziele', icon: '🎯' },
  { path: 'fokus', label: 'Fokus', icon: '⏱️' },
  { path: 'einstellungen', label: 'Einstellungen', icon: '⚙️' },
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
    default:
      return <Dashboard />;
  }
}

export function App() {
  const route = useRoute();
  const { data } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const current = route[0] ?? 'dashboard';
  const t = today();
  const counts: Record<string, number> = {
    aufgaben: data.tasks.filter((x) => x.status !== 'erledigt' && x.due !== null && x.due <= t).length,
    lernen: data.cards.filter((c) => isDue(c, t)).length,
  };

  return (
    <div className="layout">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <span>🎓 AntonOS</span>
          <button className="icon menu-toggle" onClick={() => setMenuOpen((o) => !o)} aria-label="Menü">☰</button>
        </div>
        <nav onClick={() => setMenuOpen(false)}>
          {NAV.map((n) => (
            <a key={n.path} href={`#/${n.path}`} className={current === n.path ? 'active' : ''}>
              <span aria-hidden>{n.icon}</span>
              <span className="grow">{n.label}</span>
              {counts[n.path] > 0 && <span className="count">{counts[n.path]}</span>}
            </a>
          ))}
        </nav>
      </aside>
      <main>
        <Page route={route} />
      </main>
    </div>
  );
}
