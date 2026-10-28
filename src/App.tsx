import { useEffect, useState } from 'react';
import { useRingReminder } from './components/rings';
import { FocusPill } from './components/focus';
import { openSpotlight, SHORTCUT, Spotlight } from './components/spotlight';
import { useEventReminders } from './components/calendar';
import { OfflineBanner, ShareSheet, useAppBadge } from './components/pwa';
import { Icon, Logo, NavIcon, PAGE_ICONS } from './components/icons';
import { useRecurringBookings } from './pages/Finance';
import { useStore } from './store';
import type { NavItem } from './types';
import { today } from './lib/dates';
import { isDue } from './lib/srs';
import { DEFAULT_SIDEBAR, groupNav, mergeWithDefaults, moveItem } from './lib/layout';
import { MiniPlayer, SpotifyProvider } from './components/spotify';
import { AppearanceLayer } from './components/appearance';
import { ConflictBanner, SyncBadge } from './components/sync';
import { UpdateBanner } from './components/update';
import { Dashboard } from './pages/Dashboard';
import { CourseDetail, Courses } from './pages/Courses';
import { Tasks } from './pages/Tasks';
import { Notes } from './pages/Notes';
import { Shopping } from './pages/Shopping';
import { Review, useWeeklyReviewReminder } from './pages/Review';
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
import { Music } from './pages/Music';

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
    case 'musik':
      return <Music />;
    case 'projekte':
      return param ? <ProjectDetail id={param} /> : <Projects />;
    case 'gewohnheiten':
      return <Habits />;
    case 'finanzen':
      return <Finance />;
    case 'einkauf':
      return <Shopping />;
    case 'rueckblick':
      return <Review />;
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
      return <Dashboard editing={param === 'bearbeiten'} />;
  }
}

function SidebarEditor({ items, onChange, onDone }: { items: NavItem[]; onChange: (items: NavItem[]) => void; onDone: () => void }) {
  const groups = [...new Set(items.map((i) => i.group).filter(Boolean))];
  const set = (index: number, patch: Partial<NavItem>) => onChange(items.map((x, i) => (i === index ? { ...x, ...patch } : x)));
  return (
    <div className="sidebar-editor">
      <p className="muted small">Umbenennen, verschieben, Gruppe wählen oder ausblenden. Ein Emoji ersetzt das Symbol – leer lassen für das Standard-Symbol.</p>
      <datalist id="nav-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
      {items.map((item, i) => (
        <div key={item.path} className={`nav-edit ${item.hidden ? 'is-hidden' : ''}`}>
          <div className="row">
            <span className="nav-edit-icon" title="Standard-Symbol"><NavIcon item={item} /></span>
            <input className="emoji-input" value={item.icon} placeholder="Emoji" onChange={(e) => set(i, { icon: e.target.value })} aria-label={`Eigenes Emoji für ${item.label} (leer = Standard-Symbol)`} maxLength={4} />
            <input className="grow" value={item.label} onChange={(e) => set(i, { label: e.target.value })} aria-label={`Name für ${item.path}`} />
          </div>
          <div className="row">
            <input className="grow" list="nav-groups" placeholder="ohne Gruppe" value={item.group} onChange={(e) => set(i, { group: e.target.value })} aria-label={`Gruppe für ${item.label}`} />
            <button className="icon" onClick={() => onChange(moveItem(items, i, -1))} aria-label={`${item.label} nach oben`} title="Nach oben">↑</button>
            <button className="icon" onClick={() => onChange(moveItem(items, i, 1))} aria-label={`${item.label} nach unten`} title="Nach unten">↓</button>
            {item.path !== 'einstellungen' && (
              <button className="icon" onClick={() => set(i, { hidden: !item.hidden })} aria-label={item.hidden ? `${item.label} einblenden` : `${item.label} ausblenden`} title={item.hidden ? 'Einblenden' : 'Ausblenden'}>
                {item.hidden ? '🙈' : '👁'}
              </button>
            )}
          </div>
        </div>
      ))}
      <div className="row between">
        <button onClick={() => confirm('Sidebar auf den Standard zurücksetzen?') && onChange([])}>Zurücksetzen</button>
        <button className="primary" onClick={onDone}>Fertig</button>
      </div>
    </div>
  );
}

function Shell() {
  const route = useRoute();
  const { data, saveFailed, updateSettings } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingSidebar, setEditingSidebar] = useState(false);
  const current = route[0] ?? 'dashboard';
  const routeKey = route.join('/');
  useRingReminder();
  useRecurringBookings();
  useEventReminders();
  useAppBadge();
  useWeeklyReviewReminder();

  // Auf dem Handy schließt sich das Menü bei jedem Seitenwechsel
  useEffect(() => setMenuOpen(false), [routeKey]);

  // Solange das Menü offen ist: Seite dahinter nicht mitscrollen, Escape schließt
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);
  const t = today();
  const counts: Record<string, number> = {
    aufgaben: data.tasks.filter((x) => x.status !== 'erledigt' && x.due !== null && x.due <= t).length,
    lernen: data.cards.filter((c) => isDue(c, t)).length,
    gewohnheiten: data.habits.filter((h) => !data.habitLogs.some((l) => l.habitId === h.id && l.date === t)).length,
  };
  const items = mergeWithDefaults(data.settings.sidebar, DEFAULT_SIDEBAR, 'path', 'group');

  return (
    <div className="layout">
      <AppearanceLayer />
      <aside className={`sidebar ${menuOpen ? 'open' : ''} ${editingSidebar ? 'editing' : ''}`}>
        <div className="brand">
          <span className="brand-name">
            <span className="nav-icon" aria-hidden><Logo /></span>
            <span className="nav-text">AntonOS</span>
          </span>
          <button className="icon search-toggle" onClick={openSpotlight} aria-label="Suchen"><Icon icon={PAGE_ICONS.suche} size={22} /></button>
          <button className="icon menu-toggle" onClick={() => setMenuOpen((o) => !o)} aria-label={menuOpen ? 'Menü schließen' : 'Menü öffnen'} aria-expanded={menuOpen}>
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
        <nav
          onClick={(e) => {
            // Jeder Link im Menü schließt es – auch wenn er auf die aktuelle Seite zeigt
            if ((e.target as HTMLElement).closest('a')) setMenuOpen(false);
          }}
        >
          {editingSidebar ? (
            <SidebarEditor items={items} onChange={(sidebar) => updateSettings({ sidebar })} onDone={() => setEditingSidebar(false)} />
          ) : (
            groupNav(items.filter((i) => !i.hidden)).map((section, i) => (
              <div key={i} className="nav-group" onClick={() => setMenuOpen(false)}>
                {section.group && <span className="nav-label">{section.group}</span>}
                {section.items.map((n) => (
                  <a key={n.path} href={`#/${n.path}`} className={current === n.path ? 'active' : ''} title={n.label}>
                    <span className="nav-icon" aria-hidden><NavIcon item={n} /></span>
                    <span className="grow nav-text">{n.label}</span>
                    {counts[n.path] > 0 && <span className="count">{counts[n.path]}</span>}
                  </a>
                ))}
              </div>
            ))
          )}
          {!editingSidebar && (
            <div className="nav-group nav-footer">
              <button className="nav-button" onClick={() => { setMenuOpen(false); openSpotlight(); }} title={`Suchen (${SHORTCUT})`}>
                <span className="nav-icon" aria-hidden><Icon icon={PAGE_ICONS.suche} /></span>
                <span className="nav-text grow">Suchen</span>
                <kbd className="nav-kbd nav-text">{SHORTCUT}</kbd>
              </button>
              <SyncBadge />
              <button className="nav-button" onClick={() => setEditingSidebar(true)} title="Sidebar bearbeiten">
                <span className="nav-icon" aria-hidden><Icon icon={PAGE_ICONS.bearbeiten} /></span>
                <span className="nav-text">Sidebar bearbeiten</span>
              </button>
              <a className="nav-button" href="#/dashboard/bearbeiten" onClick={() => setMenuOpen(false)} title="Dashboard bearbeiten">
                <span className="nav-icon" aria-hidden><Icon icon={PAGE_ICONS['dashboard-bearbeiten']} /></span>
                <span className="nav-text">Dashboard bearbeiten</span>
              </a>
            </div>
          )}
        </nav>
      </aside>
      <main className={current === 'dashboard' ? 'wide' : ''}>
        {saveFailed && (
          <p className="alert" role="alert">
            Speichern fehlgeschlagen – vermutlich ist der Browser-Speicher voll. Entferne große hochgeladene Bilder oder nutze
            Bild-Links statt Uploads, und lade ein <a href="#/einstellungen">Backup</a> herunter.
          </p>
        )}
        <OfflineBanner />
        <UpdateBanner />
        <ConflictBanner />
        <Page route={route} />
      </main>
      <MiniPlayer hidden={current === 'musik' || current === 'dashboard'} />
      <FocusPill hidden={current === 'fokus'} />
      <Spotlight />
      <ShareSheet />
    </div>
  );
}

export function App() {
  return (
    <SpotifyProvider>
      <Shell />
    </SpotifyProvider>
  );
}
