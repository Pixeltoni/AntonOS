import type { ReactNode } from 'react';
import { useStore } from '../store';
import type { WidgetArea, WidgetConfig, WidgetId } from '../types';
import { addDays, formatDate, hours, relativeLabel, today } from '../lib/dates';
import { formatGrade, summary } from '../lib/grades';
import { formatMoney, safeImageSrc } from '../lib/life';
import { AREAS, DEFAULT_DASHBOARD, mergeWithDefaults, moveWidget, WIDGET_LABELS } from '../lib/layout';
import { isDue } from '../lib/srs';
import { TaskForm, TaskList } from '../components/TaskList';
import { Clock, ImageInput, MonthCalendar, PeriodBars } from '../components/widgets';
import { SpotifyPlayer } from '../components/spotify';
import { CourseBadge, Empty, Panel, Progress, Stat } from '../components/ui';
import { HabitsToday } from './Habits';
import { ProjectCard } from './Projects';
import { sortTx, TransactionList } from './Finance';
import { MediaCard, READ_KINDS, WATCH_KINDS } from './Media';
import { WorkoutList } from './Training';
import { AlbumCard } from './Albums';
import { ToolLinks } from './Tools';
import { VisionBoard } from './Goals';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return 'Guten Morgen';
  if (h < 18) return 'Hallo';
  return 'Guten Abend';
}

const QUICK_ACTIONS = [
  { label: 'Neue Notiz', icon: '📝', href: '#/notizen' },
  { label: 'Neue Aufgabe', icon: '✅', href: '#/aufgaben' },
  { label: 'Neue Ausgabe', icon: '💸', href: '#/finanzen' },
  { label: 'Neues Projekt', icon: '🚀', href: '#/projekte' },
  { label: 'Neue Lernkarte', icon: '🧠', href: '#/lernen' },
  { label: 'Neues Training', icon: '🏋️', href: '#/training' },
  { label: 'Neues Buch / Serie', icon: '📚', href: '#/lesen' },
  { label: 'Neues Album', icon: '📸', href: '#/alben' },
];

const TOP_NAV = [
  { label: 'Studium', icon: '🎓', href: '#/kurse' },
  { label: 'Projekte', icon: '🚀', href: '#/projekte' },
  { label: 'Finanzen', icon: '💰', href: '#/finanzen' },
  { label: 'Gewohnheiten', icon: '✨', href: '#/gewohnheiten' },
  { label: 'Training', icon: '🏋️', href: '#/training' },
  { label: 'Musik', icon: '🎵', href: '#/musik' },
  { label: 'Kalender', icon: '📅', href: '#/kalender' },
  { label: 'Ziele', icon: '🎯', href: '#/ziele' },
];

function Banner() {
  const { data } = useStore();
  const cover = safeImageSrc(data.settings.cover);
  return (
    <div className="banner-wrap">
      {cover ? <img className="banner" src={cover} alt="" /> : <div className="banner placeholder-banner" />}
      <div className="banner-title">
        <h1>{greeting()}, {data.settings.name || 'du'} 👋</h1>
        <p>{formatDate(today())}</p>
      </div>
    </div>
  );
}

/** Inhalt aller Widgets. Titel `null` = ohne Rahmen (z. B. Kennzahlen). */
function useWidgets(): Record<WidgetId, { title: string | null; link?: [string, string]; body: ReactNode }> {
  const { data } = useStore();
  const t = today();
  const weekEnd = addDays(t, 7);

  const open = data.tasks.filter((x) => x.status !== 'erledigt');
  const thisWeek = open.filter((x) => x.due !== null && x.due <= weekEnd);
  // Ohne Datum notierte Aufgaben (z. B. aus der Schnellnotiz) sollen nicht aus dem Blick geraten
  const upNext = open.filter((x) => x.due === null || x.due <= weekEnd);
  const dueCards = data.cards.filter((c) => isDue(c, t)).length;
  const exams = [...data.exams].filter((e) => e.date >= t).sort((a, b) => a.date.localeCompare(b.date));
  const { truncated } = summary(data.courses, data.grades);
  const weekStart = addDays(t, -6);
  const focusMinutes = data.sessions.filter((s) => s.date >= weekStart && s.date <= t).reduce((s, x) => s + x.minutes, 0);
  const activeProjects = data.projects.filter((p) => p.status === 'aktiv');
  const watching = data.media.filter((m) => WATCH_KINDS.includes(m.kind) && m.status === 'läuft');
  const reading = data.media.filter((m) => READ_KINDS.includes(m.kind) && m.status === 'läuft');
  const notes = [...data.notes].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 6);
  const workouts = [...data.workouts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const albums = [...data.albums].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const monthSpent = data.transactions.filter((x) => x.type === 'Ausgabe' && x.date.slice(0, 7) === t.slice(0, 7)).reduce((s, x) => s + x.amount, 0);

  return {
    topnav: {
      title: null,
      body: (
        <nav className="top-nav" aria-label="Bereiche">
          {TOP_NAV.map((n) => <a key={n.href} href={n.href}><span aria-hidden>{n.icon}</span> {n.label}</a>)}
        </nav>
      ),
    },
    stats: {
      title: null,
      body: (
        <div className="stats">
          <Stat label="Offene Aufgaben" value={open.length} hint={`${thisWeek.length} diese Woche`} href="#/aufgaben" />
          <Stat label="Karten fällig" value={dueCards} hint="heute wiederholen" href="#/lernen" />
          <Stat label="Nächste Prüfung" value={exams[0] ? relativeLabel(exams[0].date, t) : '–'} hint={exams[0]?.title} href="#/pruefungen" />
          <Stat label="Notenschnitt" value={formatGrade(truncated, 1)} hint={`${hours(focusMinutes)} h Fokus (7 Tage)`} href="#/noten" />
          <Stat label="Ausgaben im Monat" value={formatMoney(monthSpent)} href="#/finanzen" />
        </div>
      ),
    },
    clock: { title: '', body: <Clock /> },
    quick: {
      title: '⚡ Schnellaktionen',
      body: (
        <div className="quick">
          {QUICK_ACTIONS.map((a) => <a key={a.label} href={a.href}><span aria-hidden>{a.icon}</span> {a.label}</a>)}
        </div>
      ),
    },
    notes: {
      title: '📝 Letzte Notizen',
      link: ['#/notizen', 'Alle →'],
      body: notes.length === 0 ? <Empty>Keine Notizen.</Empty> : (
        <ul className="list">{notes.map((n) => <li key={n.id}><a href={`#/notizen/${n.id}`}>{n.title || 'Ohne Titel'}</a></li>)}</ul>
      ),
    },
    music: { title: null, body: <SpotifyPlayer compact /> },
    tools: { title: '🧰 Nützliche Tools', link: ['#/tools', 'Verwalten →'], body: <ToolLinks tools={data.tools} /> },
    tasks: {
      title: '✅ Aufgaben diese Woche',
      link: ['#/aufgaben', 'Alle →'],
      body: (
        <>
          <TaskForm compact />
          <TaskList tasks={upNext} />
        </>
      ),
    },
    projects: {
      title: '🚀 Aktive Projekte',
      link: ['#/projekte', 'Alle →'],
      body: activeProjects.length === 0 ? <Empty>Keine aktiven Projekte.</Empty> : (
        <div className="gallery small-cards">{activeProjects.map((p) => <ProjectCard key={p.id} project={p} />)}</div>
      ),
    },
    transactions: { title: '💸 Letzte Buchungen', link: ['#/finanzen', 'Finanzen →'], body: <TransactionList txs={sortTx(data.transactions).slice(0, 5)} /> },
    watching: {
      title: '📺 Gerade am Schauen',
      link: ['#/schauen', 'Alle →'],
      body: watching.length === 0 ? <Empty>Nichts am Laufen.</Empty> : <div className="gallery small-cards">{watching.map((m) => <MediaCard key={m.id} item={m} compact />)}</div>,
    },
    reading: {
      title: '📖 Gerade am Lesen',
      link: ['#/lesen', 'Alle →'],
      body: reading.length === 0 ? <Empty>Kein Buch offen.</Empty> : <div className="gallery small-cards">{reading.map((m) => <MediaCard key={m.id} item={m} compact />)}</div>,
    },
    habits: { title: '✨ Gewohnheiten heute', link: ['#/gewohnheiten', 'Alle →'], body: <HabitsToday /> },
    period: { title: '⏳ Fortschritt', body: <PeriodBars /> },
    exams: {
      title: '📅 Anstehende Prüfungen',
      link: ['#/pruefungen', 'Alle →'],
      body: exams.length === 0 ? <Empty>Keine Prüfungen.</Empty> : (
        <ul className="list">
          {exams.slice(0, 3).map((e) => (
            <li key={e.id}>
              <div className="grow">
                <div className="task-title">{e.title}</div>
                <div className="meta"><CourseBadge id={e.courseId} /></div>
              </div>
              <strong>{relativeLabel(e.date, t)}</strong>
            </li>
          ))}
        </ul>
      ),
    },
    trainings: { title: '🏋️ Letzte Trainings', link: ['#/training', 'Alle →'], body: <WorkoutList workouts={workouts} /> },
    calendar: { title: '🗓️ Monatskalender', link: ['#/kalender', 'Groß anzeigen →'], body: <MonthCalendar /> },
    courses: {
      title: '📚 Kurse',
      link: ['#/kurse', 'Alle →'],
      body: data.courses.length === 0 ? <Empty>Leg deinen ersten Kurs an.</Empty> : (
        <div className="course-grid">
          {data.courses.map((c) => {
            const tasks = data.tasks.filter((x) => x.courseId === c.id);
            const done = tasks.filter((x) => x.status === 'erledigt').length;
            return (
              <a key={c.id} className="course-card" href={`#/kurse/${c.id}`} style={{ ['--c' as string]: c.color }}>
                <strong>{c.name}</strong>
                <span className="muted">{c.code} · {c.ects} ECTS</span>
                <Progress value={tasks.length ? (done / tasks.length) * 100 : 0} color={c.color} />
                <span className="muted small">{done} von {tasks.length} Aufgaben erledigt</span>
              </a>
            );
          })}
        </div>
      ),
    },
    albums: {
      title: '📸 Letzte Alben',
      link: ['#/alben', 'Alle →'],
      body: albums.length === 0 ? <Empty>Noch keine Alben.</Empty> : <div className="gallery">{albums.map((a) => <AlbumCard key={a.id} album={a} />)}</div>,
    },
    vision: { title: '🌄 Vision Board', link: ['#/ziele', 'Ziele →'], body: <VisionBoard /> },
  };
}

function EditBar({ widget, layout, onChange }: { widget: WidgetConfig; layout: WidgetConfig[]; onChange: (l: WidgetConfig[]) => void }) {
  const set = (patch: Partial<WidgetConfig>) => onChange(layout.map((w) => (w.id === widget.id ? { ...w, ...patch } : w)));
  return (
    <div className="edit-bar">
      <strong className="grow small">{WIDGET_LABELS[widget.id]}</strong>
      <button onClick={() => onChange(moveWidget(layout, widget.id, -1))} aria-label="Nach oben" title="Nach oben">↑</button>
      <button onClick={() => onChange(moveWidget(layout, widget.id, 1))} aria-label="Nach unten" title="Nach unten">↓</button>
      <select
        value={widget.area}
        onChange={(e) => {
          // In den neuen Bereich ganz ans Ende verschieben
          const rest = layout.filter((w) => w.id !== widget.id);
          onChange([...rest, { ...widget, area: e.target.value as WidgetArea }]);
        }}
        aria-label="Bereich"
      >
        {AREAS.map((a) => <option key={a.area} value={a.area}>{a.label}</option>)}
      </select>
      <button onClick={() => set({ hidden: true })} title="Ausblenden">Ausblenden</button>
    </div>
  );
}

export function Dashboard({ editing }: { editing: boolean }) {
  const { data, updateSettings } = useStore();
  const widgets = useWidgets();
  const layout = mergeWithDefaults(data.settings.dashboard, DEFAULT_DASHBOARD, 'id');
  const save = (l: WidgetConfig[]) => updateSettings({ dashboard: l });

  const render = (w: WidgetConfig) => {
    const def = widgets[w.id];
    const content =
      def.title === null ? def.body : (
        <Panel title={def.title || undefined} actions={def.link && !editing ? <a href={def.link[0]}>{def.link[1]}</a> : undefined}>
          {def.body}
        </Panel>
      );
    if (!editing) return <div key={w.id}>{content}</div>;
    return (
      <div key={w.id} className="editable">
        <EditBar widget={w} layout={layout} onChange={save} />
        <div className="editable-body">{content}</div>
      </div>
    );
  };
  const area = (a: WidgetArea) => layout.filter((w) => w.area === a && !w.hidden).map(render);
  const hidden = layout.filter((w) => w.hidden);

  return (
    <>
      <Banner />
      {editing ? (
        <Panel
          title="🧩 Dashboard bearbeiten"
          actions={
            <div className="row">
              <button onClick={() => confirm('Dashboard auf den Standard zurücksetzen?') && save([])}>Zurücksetzen</button>
              <a className="button primary" href="#/dashboard">Fertig</a>
            </div>
          }
        >
          <p className="muted small">Verschiebe Widgets mit ↑ ↓, wähle ihren Bereich oder blende sie aus.</p>
          <div className="form-grid">
            <label>Dein Name<input value={data.settings.name} onChange={(e) => updateSettings({ name: e.target.value })} /></label>
            <label className="full">Titelbild<ImageInput value={data.settings.cover} onChange={(cover) => updateSettings({ cover })} /></label>
          </div>
          {hidden.length > 0 && (
            <div className="row wrap">
              <span className="muted small">Ausgeblendet:</span>
              {hidden.map((w) => (
                <button key={w.id} onClick={() => save(layout.map((x) => (x.id === w.id ? { ...x, hidden: false } : x)))}>
                  + {WIDGET_LABELS[w.id]}
                </button>
              ))}
            </div>
          )}
        </Panel>
      ) : (
        <div className="row end">
          <a className="button" href="#/dashboard/bearbeiten">✏️ Dashboard bearbeiten</a>
        </div>
      )}

      {area('oben')}
      <div className={`dash ${editing ? 'editing' : ''}`}>
        <div className="stack">{area('links')}</div>
        <div className="stack">{area('mitte')}</div>
        <div className="stack">{area('rechts')}</div>
      </div>
      {area('unten')}
    </>
  );
}
