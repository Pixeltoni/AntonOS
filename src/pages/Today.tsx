import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { addDays, isoWeek, parseDate, today } from '../lib/dates';
import { areaHints, dayPhase, greeting, storyWeek, todaySections, type TodaySection } from '../lib/areas';
import { onDay, sortEntries } from '../lib/calendar';
import { inToday } from '../lib/things';
import { listTasks } from '../lib/tasks';
import { defaultDayClose, tomorrowAlarm } from '../lib/dayclose';
import { headline, weekReview } from '../lib/review';
import { useCalendarEntries } from '../components/calendar';
import { TaskList } from '../components/TaskList';
import { RingsWidget } from '../components/rings';
import { Icon, PAGE_ICONS } from '../components/icons';
import { GoalsThisWeek } from '../components/goals';
import { DayPlanView } from '../components/dayplan';
import { weekContributions } from '../lib/goals';
import { MealsWidget } from './Meals';
import { MoodCheckIn, useStoryCards } from './Review';

const STORY_KEY = 'antonos:story-gesehen';
const VIEW_KEY = 'antonos:heute-ansicht';

/** Übersicht oder Plan (Zeitleiste) – gemerkt auf diesem Gerät */
function useTodayView(): ['uebersicht' | 'plan', (v: 'uebersicht' | 'plan') => void] {
  const [view, setView] = useState<'uebersicht' | 'plan'>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'plan' ? 'plan' : 'uebersicht';
    } catch {
      return 'uebersicht';
    }
  });
  const set = (v: 'uebersicht' | 'plan') => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // egal
    }
  };
  return [view, set];
}
const readSeen = () => {
  try {
    return localStorage.getItem(STORY_KEY) ?? '';
  } catch {
    return '';
  }
};

/** Minuten-Takt, damit Tageszeit und „nächster Termin“ aktuell bleiben */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function Section({ title, link, children }: { title?: string; link?: [string, string]; children: ReactNode }) {
  return (
    <section className="today-section">
      {(title || link) && (
        <div className="today-section-head">
          {title && <h2>{title}</h2>}
          {link && <a href={link[0]}>{link[1]}</a>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Die Wochen-Story im Vollbild – Tippen rechts/links blättert, wie bei Instagram */
function StoryViewer({ onClose }: { onClose: () => void }) {
  const { data } = useStore();
  const t = today();
  const range = storyWeek(t);
  const week = weekReview(data, range.day, range.until);
  const prevWeeks = [1, 2, 3, 4].map((i) => weekReview(data, addDays(range.day, -7 * i), addDays(range.day, -7 * i + 6)));
  const weekLabel = `KW ${isoWeek(parseDate(range.day))}`;
  const cards = useStoryCards(week, prevWeeks[0], headline(week, prevWeeks), weekLabel);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORY_KEY, weekLabel);
    } catch {
      /* egal */
    }
  }, [weekLabel]);

  const next = () => (index >= cards.length - 1 ? onClose() : setIndex(index + 1));
  const prev = () => setIndex(Math.max(0, index - 1));

  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setTimeout(next, 7000);
    return () => clearTimeout(id);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const card = cards[index];
  return createPortal(
    <div className="story-viewer" role="dialog" aria-modal="true" aria-label="Wochenrückblick">
      <div className="story-progress" aria-hidden="true">
        {cards.map((c, i) => (
          <span key={c.key}>
            <i className={i < index ? 'done' : i === index ? (paused ? 'run paused' : 'run') : ''} />
          </span>
        ))}
      </div>
      <button type="button" className="story-close" onClick={onClose} aria-label="Schließen">✕</button>
      <section
        key={card.key}
        className={`story-card story-full ${card.className}`}
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerCancel={() => setPaused(false)}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          if (e.clientX - r.left < r.width / 3) prev();
          else next();
        }}
      >
        {card.body}
      </section>
      <a className="story-more" href="#/rueckblick" onClick={onClose}>Ganzer Rückblick</a>
    </div>,
    document.body,
  );
}

function StoryBubble({ onOpen }: { onOpen: () => void }) {
  const range = storyWeek(today());
  const label = `KW ${isoWeek(parseDate(range.day))}`;
  const seen = readSeen() === label;
  return (
    <button type="button" className={`story-bubble ${seen ? 'seen' : ''}`} onClick={onOpen} aria-label={`Wochenrückblick ${label} ansehen`}>
      <span className="story-bubble-ring"><span>🌟</span></span>
      <small>{range.current ? 'Diese Woche' : label}</small>
    </button>
  );
}

/** „Heute“ – ruhige Startseite am iPhone, wie Heute in Things oder die Übersicht in Fitness */
export function Today() {
  const { data } = useStore();
  const now = useNow();
  const t = today();
  const entries = useCalendarEntries();
  const [story, setStory] = useState(false);
  const [view, setView] = useTodayView();
  const dayClose = { ...defaultDayClose(), ...(data.settings.dayClose ?? {}) };
  const phase = dayPhase(now, dayClose.time);
  const name = data.settings.name.trim().split(' ')[0];
  const hints = useMemo(() => areaHints(data, t, now), [data, t, now]);

  const time = hhmm(now);
  const todays = sortEntries(entries.filter((e) => onDay(e, t) && !e.done && e.kind !== 'task'));
  const upcoming = todays.filter((e) => !e.time || (e.endTime || e.time) >= time);
  const timed = upcoming.filter((e) => e.time);
  const nextEvent = timed[0] ?? upcoming[0];
  const tomorrow = sortEntries(entries.filter((e) => onDay(e, addDays(t, 1)) && !e.done && e.kind !== 'task'));

  const tasks = listTasks(data.tasks)
    .filter((x) => x.status !== 'erledigt' && (inToday(x, t) || (x.due !== null && x.due <= t)));
  const alarm = tomorrowAlarm(data.alarms, now);
  const mealsToday = data.meals.some((m) => m.date === t);
  const closed = dayClose.last === t;

  const render = (s: TodaySection): ReactNode => {
    switch (s) {
      case 'termin': {
        if (!nextEvent && phase === 'abend') return null;
        if (!nextEvent) {
          return (
            <a className="today-hero quiet" href="#/kalender">
              <small>Keine Termine mehr heute</small>
              <strong>{tomorrow[0] ? `Morgen: ${tomorrow[0].label}` : 'Freier Tag im Kalender'}</strong>
              {tomorrow[0]?.time && <small>{tomorrow[0].time} Uhr</small>}
            </a>
          );
        }
        const minutes = nextEvent.time ? (Number(nextEvent.time.slice(0, 2)) * 60 + Number(nextEvent.time.slice(3))) - (now.getHours() * 60 + now.getMinutes()) : null;
        const when = !nextEvent.time ? 'Ganztägig' : minutes !== null && minutes <= 0 ? 'Läuft gerade' : minutes !== null && minutes < 60 ? `In ${minutes} Min.` : `Um ${nextEvent.time}`;
        const rest = upcoming.filter((e) => e !== nextEvent);
        return (
          <>
            <a className="today-hero" href={nextEvent.href ?? '#/kalender'} style={nextEvent.color ? { ['--hero' as string]: nextEvent.color } : undefined}>
              <small>{when}{nextEvent.location ? ` · ${nextEvent.location}` : ''}</small>
              <strong>{nextEvent.label}</strong>
              {nextEvent.time && <small>{nextEvent.time}{nextEvent.endTime ? ` – ${nextEvent.endTime}` : ''} Uhr</small>}
            </a>
            {rest.length > 0 && (
              <ul className="ios-group today-list">
                {rest.slice(0, 4).map((e) => (
                  <li key={e.key}>
                    <span className="today-dot" style={{ background: e.color ?? 'var(--accent)' }} />
                    <span className="grow">{e.label}</span>
                    <span className="muted small">{e.time || 'ganztägig'}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        );
      }
      case 'aufgaben':
        return (
          <Section title="Aufgaben" link={['#/aufgaben', 'Alle']}>
            <div className="ios-group today-tasks">
              <TaskList tasks={tasks} compact sortable={false} emptyText={phase === 'abend' ? 'Alles erledigt für heute 🎉' : 'Nichts für heute geplant.'} />
            </div>
          </Section>
        );
      case 'ringe':
        return (
          <Section>
            <RingsWidget variant="standard" />
          </Section>
        );
      case 'ziele':
        return weekContributions(data.goals, data, t).length ? (
          <Section title="Für deine Ziele diese Woche" link={['#/ziele', 'Ziele']}>
            <GoalsThisWeek />
          </Section>
        ) : null;
      case 'essen':
        return mealsToday ? (
          <Section title="Essen" link={['#/essen', 'Plan']}>
            <div className="ios-group today-pad"><MealsWidget variant="kompakt" /></div>
          </Section>
        ) : null;
      case 'abschluss':
        return (
          <section className="today-evening">
            <div className="row between">
              <strong>{closed ? 'Tag abgeschlossen ✓' : 'Tag abschließen'}</strong>
              <a href="#/abend">{closed ? 'Ansehen' : 'Los'}</a>
            </div>
            <MoodCheckIn compact />
          </section>
        );
      case 'wecker':
        return (
          <a className="today-alarm" href="#/wecker">
            <span>{alarm ? `Wecker morgen${alarm.alarm.label ? ` · ${alarm.alarm.label}` : ''}` : 'Kein Wecker für morgen'}</span>
            <strong>{alarm ? hhmm(alarm.at) : 'Stellen'}</strong>
          </a>
        );
      case 'demnaechst': {
        const rows = (['pruefungen', 'menschen', 'reisen', 'lernen'] as const).filter((k) => hints[k]);
        if (!rows.length) return null;
        const labels: Record<string, string> = { pruefungen: 'Prüfung', menschen: 'Geburtstag', reisen: 'Reise', lernen: 'Lernkarten' };
        return (
          <Section title="Demnächst">
            <ul className="ios-group today-list">
              {rows.map((k) => (
                <li key={k}>
                  <a href={`#/${k}`}>
                    <span className="today-ico"><Icon icon={PAGE_ICONS[k]} size={16} /></span>
                    <span className="grow">{hints[k]}</span>
                    <span className="muted small">{labels[k]}</span>
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        );
      }
    }
  };

  const date = parseDate(t).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <div className={`today phase-${phase}`}>
      <header className="today-head">
        <div className="grow">
          <span className="today-date">{date}</span>
          <h1>{greeting(now)}{name ? `, ${name}` : ''}</h1>
        </div>
        <StoryBubble onOpen={() => setStory(true)} />
      </header>
      <div className="segmented today-view" role="radiogroup" aria-label="Ansicht">
        {(['uebersicht', 'plan'] as const).map((v) => (
          <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? 'selected' : ''} onClick={() => setView(v)}>
            {v === 'plan' ? 'Plan' : 'Übersicht'}
          </button>
        ))}
      </div>
      {view === 'plan' ? <DayPlanView /> : todaySections(phase).map((s) => {
        const node = render(s);
        return node ? <div key={s} className="today-block">{node}</div> : null;
      })}
      {story && <StoryViewer onClose={() => setStory(false)} />}
    </div>
  );
}
