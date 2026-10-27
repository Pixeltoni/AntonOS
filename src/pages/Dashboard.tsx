import { useStore } from '../store';
import { addDays, formatDate, hours, relativeLabel, today } from '../lib/dates';
import { formatGrade, summary } from '../lib/grades';
import { formatMoney, safeImageSrc, spotifyEmbedUrl } from '../lib/life';
import { isDue } from '../lib/srs';
import { TaskForm, TaskList } from '../components/TaskList';
import { Clock, MonthCalendar, PeriodBars } from '../components/widgets';
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

function Music() {
  const { data } = useStore();
  const embed = spotifyEmbedUrl(data.settings.spotifyUrl);
  if (!embed) return <Empty>Füge in den <a href="#/einstellungen">Einstellungen</a> einen Spotify-Link zu deiner Lieblingsplaylist hinzu.</Empty>;
  return (
    <iframe
      title="Lieblingsmusik"
      src={embed}
      className="spotify"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
    />
  );
}

export function Dashboard() {
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

  return (
    <>
      <Banner />
      <nav className="top-nav" aria-label="Bereiche">
        {TOP_NAV.map((n) => <a key={n.href} href={n.href}><span aria-hidden>{n.icon}</span> {n.label}</a>)}
      </nav>

      <div className="stats">
        <Stat label="Offene Aufgaben" value={open.length} hint={`${thisWeek.length} diese Woche`} href="#/aufgaben" />
        <Stat label="Karten fällig" value={dueCards} hint="heute wiederholen" href="#/lernen" />
        <Stat label="Nächste Prüfung" value={exams[0] ? relativeLabel(exams[0].date, t) : '–'} hint={exams[0]?.title} href="#/pruefungen" />
        <Stat label="Notenschnitt" value={formatGrade(truncated, 1)} hint={`${hours(focusMinutes)} h Fokus (7 Tage)`} href="#/noten" />
        <Stat label="Ausgaben im Monat" value={formatMoney(monthSpent)} href="#/finanzen" />
      </div>

      <div className="dash">
        <div className="stack">
          <Panel><Clock /></Panel>
          <Panel title="⚡ Schnellaktionen">
            <div className="quick">
              {QUICK_ACTIONS.map((a) => <a key={a.label} href={a.href}><span aria-hidden>{a.icon}</span> {a.label}</a>)}
            </div>
          </Panel>
          <Panel title="📝 Letzte Notizen" actions={<a href="#/notizen">Alle →</a>}>
            {notes.length === 0 ? <Empty>Keine Notizen.</Empty> : (
              <ul className="list">
                {notes.map((n) => <li key={n.id}><a href={`#/notizen/${n.id}`}>{n.title || 'Ohne Titel'}</a></li>)}
              </ul>
            )}
          </Panel>
          <Panel title="🎵 Lieblingsmusik"><Music /></Panel>
          <Panel title="🧰 Nützliche Tools" actions={<a href="#/tools">Verwalten →</a>}>
            <ToolLinks tools={data.tools} />
          </Panel>
        </div>

        <div className="stack">
          <Panel title="✅ Aufgaben diese Woche" actions={<a href="#/aufgaben">Alle →</a>}>
            <TaskForm compact />
            <TaskList tasks={upNext} />
          </Panel>
          <Panel title="🚀 Aktive Projekte" actions={<a href="#/projekte">Alle →</a>}>
            {activeProjects.length === 0 ? <Empty>Keine aktiven Projekte.</Empty> : (
              <div className="gallery small-cards">{activeProjects.map((p) => <ProjectCard key={p.id} project={p} />)}</div>
            )}
          </Panel>
          <Panel title="💸 Letzte Buchungen" actions={<a href="#/finanzen">Finanzen →</a>}>
            <TransactionList txs={sortTx(data.transactions).slice(0, 5)} />
          </Panel>
          <div className="grid-2">
            <Panel title="📺 Gerade am Schauen" actions={<a href="#/schauen">Alle →</a>}>
              {watching.length === 0 ? <Empty>Nichts am Laufen.</Empty> : watching.map((m) => <MediaCard key={m.id} item={m} compact />)}
            </Panel>
            <Panel title="📖 Gerade am Lesen" actions={<a href="#/lesen">Alle →</a>}>
              {reading.length === 0 ? <Empty>Kein Buch offen.</Empty> : reading.map((m) => <MediaCard key={m.id} item={m} compact />)}
            </Panel>
          </div>
        </div>

        <div className="stack">
          <Panel title="✨ Gewohnheiten heute" actions={<a href="#/gewohnheiten">Alle →</a>}><HabitsToday /></Panel>
          <Panel title="⏳ Fortschritt"><PeriodBars /></Panel>
          <Panel title="📅 Anstehende Prüfungen">
            {exams.length === 0 ? <Empty>Keine Prüfungen.</Empty> : (
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
            )}
          </Panel>
          <Panel title="🏋️ Letzte Trainings" actions={<a href="#/training">Alle →</a>}><WorkoutList workouts={workouts} /></Panel>
        </div>
      </div>

      <Panel title="🗓️ Monatskalender" actions={<a href="#/kalender">Groß anzeigen →</a>}><MonthCalendar /></Panel>

      <Panel title="📚 Kurse" actions={<a href="#/kurse">Alle →</a>}>
        {data.courses.length === 0 ? <Empty>Leg deinen ersten Kurs an.</Empty> : (
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
        )}
      </Panel>

      <Panel title="📸 Letzte Alben" actions={<a href="#/alben">Alle →</a>}>
        {albums.length === 0 ? <Empty>Noch keine Alben.</Empty> : <div className="gallery">{albums.map((a) => <AlbumCard key={a.id} album={a} />)}</div>}
      </Panel>

      <Panel title="🌄 Vision Board" actions={<a href="#/ziele">Ziele →</a>}><VisionBoard /></Panel>
    </>
  );
}
