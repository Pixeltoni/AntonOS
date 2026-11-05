import { useEffect, useState } from 'react';
import { useRingReminder } from './components/rings';
import { FocusPill } from './components/focus';
import { openSpotlight, SHORTCUT, Spotlight } from './components/spotlight';
import { ASSISTANT_SHORTCUT, Assistant, openAssistant, useTaskReminders } from './components/assistant';
import { useEventReminders } from './components/calendar';
import { OfflineBanner, ShareSheet, useAppBadge } from './components/pwa';
import { useFocusLock } from './components/focuslock';
import { Icon, Logo, NavIcon, PAGE_ICONS } from './components/icons';
import { useRecurringBookings } from './pages/Finance';
import { useStore } from './store';
import { today } from './lib/dates';
import { listTasks } from './lib/tasks';
import { isDue } from './lib/srs';
import { isHabitDone } from './lib/life';
import { groupNav } from './lib/layout';
import { pageColor } from './lib/areas';
import { SidebarEditor } from './components/navedit';
import { PlusButton, TabBar, useNavItems, useSheetSwipe } from './components/shell';
import { Today } from './pages/Today';
import { Areas } from './pages/Areas';
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
import { WeekPlanner } from './pages/WeekPlan';
import { Routines } from './pages/Routines';
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
import { Meals, RecipeDetail } from './pages/Meals';
import { Subscriptions } from './pages/Subscriptions';
import { People, PersonDetail } from './pages/People';
import { TripDetail, Trips } from './pages/Trips';
import { Pet } from './pages/Pet';
import { useLifeReminders } from './components/reminders';
import { useNativeNotifications } from './components/native';
import { useNativeWidgets } from './components/ioswidgets';
import { AlarmRinger } from './components/alarm';
import { Alarms } from './pages/Alarms';
import { useCalendarFeeds } from './components/feeds';
import { Evening, useDayCloseReminder } from './pages/Evening';
import { LockGate, useNativeExtras } from './components/extras';

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

/** Startseite: am iPhone „Heute“, am großen Bildschirm die Übersicht mit Widgets */
const START = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 800px)').matches ? 'heute' : 'dashboard';

function Page({ route }: { route: string[] }) {
  const [page = START, param = null] = route;
  switch (page) {
    case 'heute':
      return <Today />;
    case 'bereiche':
      return <Areas />;
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
    case 'routinen':
      return <Routines key={route.join('/')} start={param === 'start' ? route[2] ?? null : null} />;
    case 'wecker':
      return <Alarms />;
    case 'finanzen':
      return <Finance />;
    case 'einkauf':
      return <Shopping />;
    case 'rueckblick':
      return <Review />;
    case 'wochenplan':
      return <WeekPlanner key={param ?? ''} param={param} />;
    case 'abend':
      return <Evening />;
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
    case 'essen':
      return param ? <RecipeDetail key={param} id={param} /> : <Meals />;
    case 'abos':
      return <Subscriptions />;
    case 'menschen':
      return param ? <PersonDetail key={param} id={param} /> : <People />;
    case 'reisen':
      return param ? <TripDetail key={param} id={param} /> : <Trips />;
    case 'knubbel':
      return <Pet />;
    default:
      return <Dashboard editing={param === 'bearbeiten'} />;
  }
}

function Shell() {
  const route = useRoute();
  const { data, saveFailed, updateSettings } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingSidebar, setEditingSidebar] = useState(false);
  const current = route[0] ?? START;
  const routeKey = route.join('/');
  useRingReminder();
  useRecurringBookings();
  useEventReminders();
  useTaskReminders();
  useAppBadge();
  useWeeklyReviewReminder();
  useLifeReminders();
  useNativeNotifications();
  useNativeWidgets();
  useCalendarFeeds();
  useDayCloseReminder();
  useNativeExtras();
  useFocusLock();
  useSheetSwipe();

  // Auf dem Handy schließt sich das Menü bei jedem Seitenwechsel
  useEffect(() => setMenuOpen(false), [routeKey]);

  // Solange das Menü offen ist, schließt Escape (Scrollsperre dahinter: lib/mobile.ts)
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);
  const t = today();
  const counts: Record<string, number> = {
    aufgaben: listTasks(data.tasks).filter((x) => x.status !== 'erledigt' && x.due !== null && x.due <= t).length,
    lernen: data.cards.filter((c) => isDue(c, t)).length,
    gewohnheiten: data.habits.filter((h) => !isHabitDone(data.habitLogs, h, t)).length,
  };
  const items = useNavItems();

  return (
    <div className="layout area-tint" style={{ ['--accent' as string]: pageColor(current, items) }}>
      <AppearanceLayer />
      <aside className={`sidebar ${menuOpen ? 'open' : ''} ${editingSidebar ? 'editing' : ''}`}>
        <div className="brand">
          <span className="brand-name">
            <span className="nav-icon" aria-hidden><Logo /></span>
            <span className="nav-text">AntonOS</span>
          </span>
          <button className="icon search-toggle assistant-toggle" onClick={openAssistant} aria-label="Assistentin"><Icon icon={PAGE_ICONS.assistentin} size={22} /></button>
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
                  <a key={n.path} href={`#/${n.path}`} className={current === n.path ? 'active' : ''} title={n.label} style={{ ['--area' as string]: pageColor(n.path, items) }}>
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
              <button className="nav-button" onClick={() => { setMenuOpen(false); openAssistant(); }} title={`Assistentin (${ASSISTANT_SHORTCUT})`}>
                <span className="nav-icon" aria-hidden><Icon icon={PAGE_ICONS.assistentin} /></span>
                <span className="nav-text grow">Assistentin</span>
                <kbd className="nav-kbd nav-text">{ASSISTANT_SHORTCUT}</kbd>
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
        <LockGate key={current} page={current}>
          <Page route={route} />
        </LockGate>
      </main>
      <TabBar current={current} />
      <PlusButton />
      <MiniPlayer hidden={current === 'musik' || current === 'dashboard'} />
      <FocusPill hidden={current === 'fokus'} />
      <Spotlight />
      <Assistant />
      <ShareSheet />
      <AlarmRinger />
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
