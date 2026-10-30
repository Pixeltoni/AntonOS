import { formatMinutes } from '../lib/tasks';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import type { WidgetVariant } from '../types';
import { addDays, isoWeek, parseDate, today } from '../lib/dates';
import { formatMoney } from '../lib/life';
import { defaultRingGoals, ringDay } from '../lib/rings';
import { change, headline, lastDays, moodInsights, moodOf, MOODS, weekReview, type WeekReview } from '../lib/review';
import { notify } from '../lib/notify';
import { Rings } from '../components/rings';
import { useToast } from '../components/toast';
import { Empty, PageHeader, Panel } from '../components/ui';

const hoursText = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} Std.${m ? ` ${m} Min.` : ''}` : `${m} Min.`;
};
const weekday = (d: string) => parseDate(d).toLocaleDateString('de-DE', { weekday: 'long' });

/** „Wie geht's dir heute?“ – fünf Gesichter, ein Satz, optional Schlaf */
export function MoodCheckIn({ compact }: { compact?: boolean }) {
  const { data, add, update } = useStore();
  const t = today();
  const entry = data.moods.find((m) => m.date === t);
  const [note, setNote] = useState(entry?.note ?? '');
  useEffect(() => setNote(entry?.note ?? ''), [entry?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setMood = (mood: number) => {
    if (entry) update('moods', entry.id, { mood });
    else add('moods', { date: t, mood, note: note.trim(), sleep: null });
  };
  return (
    <div className="mood-checkin">
      {!compact && <strong>Wie geht's dir heute?</strong>}
      <div className="mood-faces" role="radiogroup" aria-label="Stimmung heute">
        {MOODS.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={entry?.mood === m.value}
            aria-label={m.label}
            title={m.label}
            className={entry?.mood === m.value ? 'on' : ''}
            style={{ ['--m' as string]: m.color }}
            onClick={() => setMood(m.value)}
          >
            {m.emoji}
          </button>
        ))}
      </div>
      {entry && !compact && (
        <div className="mood-extra">
          <input
            value={note}
            placeholder="Ein Satz zum Tag (optional) …"
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note.trim() !== entry.note && update('moods', entry.id, { note: note.trim() })}
            aria-label="Notiz zum Tag"
          />
          <label className="row small">
            😴 Schlaf
            <input
              className="narrow"
              type="number"
              min={0}
              max={16}
              step={0.5}
              value={entry.sleep ?? ''}
              placeholder="Std."
              onChange={(e) => update('moods', entry.id, { sleep: e.target.value === '' ? null : Math.min(16, Math.max(0, Number(e.target.value))) })}
              aria-label="Schlaf in Stunden"
            />
            Std.
          </label>
        </div>
      )}
      {entry && compact && <span className="muted small">Heute: {moodOf(entry.mood).label} {moodOf(entry.mood).emoji}</span>}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="story-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null || value === 0) return null;
  return <small className="story-delta">{value > 0 ? '▲' : '▼'} {Math.abs(value)} % zur Vorwoche</small>;
}

/** Wischbare Karten wie bei „Wrapped“ */
function Story({ week, prev, title, weekLabel }: { week: WeekReview; prev: WeekReview; title: string; weekLabel: string }) {
  const { data } = useStore();
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const goals = data.settings.rings ?? defaultRingGoals();
  const course = (id: string | null) => data.courses.find((c) => c.id === id);
  const maxCourse = Math.max(1, ...week.courses.map((c) => c.minutes));

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const on = () => setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, []);
  useEffect(() => {
    track.current?.scrollTo({ left: 0 });
    setIndex(0);
  }, [weekLabel]);

  const cards: { key: string; className: string; body: ReactNode }[] = [
    {
      key: 'start',
      className: 'story-1',
      body: (
        <>
          <span className="story-kicker">Dein Wochenrückblick · {weekLabel}</span>
          <h2>{title}</h2>
          <div className="story-grid">
            <Stat label="Lernzeit" value={hoursText(week.learnMinutes)} />
            <Stat label="Aufgaben erledigt" value={week.tasksDone} sub={week.estimate.tasks > 0 ? `geschätzt ${formatMinutes(week.estimate.planned)}, gearbeitet ${formatMinutes(week.estimate.worked)}` : undefined} />
            <Stat label="Ringe geschlossen" value={`${week.ringsClosed} / ${week.days.length}`} />
            <Stat label="Ausgaben" value={formatMoney(week.spent)} />
          </div>
        </>
      ),
    },
    {
      key: 'lernen',
      className: 'story-2',
      body: (
        <>
          <span className="story-kicker">📚 Lernen</span>
          <h2>{hoursText(week.learnMinutes)}</h2>
          <Delta value={change(week.learnMinutes, prev.learnMinutes)} />
          {week.courses.length === 0 ? <p>Diese Woche noch keine Lernzeit im Fokus-Timer.</p> : (
            <ul className="story-bars">
              {week.courses.slice(0, 4).map((c) => (
                <li key={String(c.courseId)}>
                  <span>{course(c.courseId)?.name ?? 'Ohne Kurs'}</span>
                  <span className="story-bar"><span style={{ width: `${(c.minutes / maxCourse) * 100}%` }} /></span>
                  <small>{hoursText(c.minutes)}</small>
                </li>
              ))}
            </ul>
          )}
          {week.courses[0] && <p>Am meisten: <strong>{course(week.courses[0].courseId)?.name ?? 'Ohne Kurs'}</strong></p>}
        </>
      ),
    },
    {
      key: 'ringe',
      className: 'story-3',
      body: (
        <>
          <span className="story-kicker">⭕ Ringe & Gewohnheiten</span>
          <h2>{week.ringsClosed} {week.ringsClosed === 1 ? 'Tag' : 'Tage'} alle Ringe zu</h2>
          <div className="story-rings">
            {week.days.map((d) => (
              <div key={d}>
                <Rings rings={ringDay(data, goals, d).rings} size={38} stroke={5} />
                <small>{parseDate(d).toLocaleDateString('de-DE', { weekday: 'narrow' })}</small>
              </div>
            ))}
          </div>
          <div className="story-grid">
            <Stat label="Gewohnheiten abgehakt" value={week.habitChecks} />
            <Stat label="Trainings" value={week.workouts} sub={week.moveMinutes ? `${week.moveMinutes} Min. Bewegung` : undefined} />
          </div>
          {week.bestStreak && <p>Längste Serie: <strong>{week.bestStreak.icon} {week.bestStreak.name} · {week.bestStreak.days} Tage</strong></p>}
        </>
      ),
    },
    {
      key: 'geld',
      className: 'story-4',
      body: (
        <>
          <span className="story-kicker">💳 Geld</span>
          <h2>{formatMoney(week.spent)} ausgegeben</h2>
          <Delta value={change(week.spent, prev.spent)} />
          <div className="story-grid">
            <Stat label="Einnahmen" value={formatMoney(week.income)} />
            <Stat label="Größter Posten" value={week.topCategory ? week.topCategory.category : '–'} sub={week.topCategory ? formatMoney(week.topCategory.amount) : undefined} />
          </div>
        </>
      ),
    },
    {
      key: 'stimmung',
      className: 'story-5',
      body: (
        <>
          <span className="story-kicker">🌈 Stimmung</span>
          <h2>{week.moodAvg === null ? 'Noch keine Stimmung eingetragen' : `Im Schnitt ${moodOf(week.moodAvg).label.toLowerCase()} ${moodOf(week.moodAvg).emoji}`}</h2>
          <div className="story-moods">
            {week.days.map((d) => {
              const m = data.moods.find((x) => x.date === d);
              return (
                <div key={d} title={m?.note || undefined}>
                  <span>{m ? moodOf(m.mood).emoji : '·'}</span>
                  <small>{parseDate(d).toLocaleDateString('de-DE', { weekday: 'narrow' })}</small>
                </div>
              );
            })}
          </div>
          {week.bestDay && (
            <p>
              Bester Tag: <strong>{weekday(week.bestDay)}</strong>
              {data.moods.find((m) => m.date === week.bestDay)?.note && <> – „{data.moods.find((m) => m.date === week.bestDay)!.note}“</>}
            </p>
          )}
        </>
      ),
    },
  ];

  return (
    <div className="story">
      <div className="story-track" ref={track} tabIndex={0} aria-label="Rückblick-Karten" onKeyDown={(e) => {
        const el = track.current;
        if (!el) return;
        if (e.key === 'ArrowRight') el.scrollTo({ left: Math.min(cards.length - 1, index + 1) * el.clientWidth, behavior: 'smooth' });
        if (e.key === 'ArrowLeft') el.scrollTo({ left: Math.max(0, index - 1) * el.clientWidth, behavior: 'smooth' });
      }}>
        {cards.map((c, i) => (
          <section key={c.key} className={`story-card ${c.className}`} aria-hidden={i !== index}>{c.body}</section>
        ))}
      </div>
      <div className="smart-stack-dots story-dots">
        {cards.map((c, i) => (
          <button key={c.key} type="button" aria-label={`Karte ${i + 1}`} className={i === index ? 'on' : ''} onClick={() => track.current?.scrollTo({ left: i * track.current.clientWidth, behavior: 'smooth' })} />
        ))}
      </div>
    </div>
  );
}

/** Erste Karte als Bild (1080 × 1350) zum Teilen oder Speichern */
function drawImage(week: WeekReview, title: string, weekLabel: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 1080;
  c.height = 1350;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 1080, 1350);
  grad.addColorStop(0, '#5856D6');
  grad.addColorStop(0.55, '#AF52DE');
  grad.addColorStop(1, '#FF2D55');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1080, 1350);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.font = '600 38px Inter, -apple-system, sans-serif';
  g.fillText(`DEIN WOCHENRÜCKBLICK · ${weekLabel.toUpperCase()}`, 90, 150);
  g.fillStyle = '#fff';
  g.font = '800 84px Inter, -apple-system, sans-serif';
  // Überschrift umbrechen
  const words = title.split(' ');
  let line = '';
  let y = 290;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > 900 && line) {
      g.fillText(line, 90, y);
      line = w;
      y += 100;
    } else line = test;
  }
  g.fillText(line, 90, y);
  const stats: [string, string][] = [
    ['Lernzeit', hoursText(week.learnMinutes)],
    ['Aufgaben erledigt', String(week.tasksDone)],
    ['Ringe geschlossen', `${week.ringsClosed} / ${week.days.length}`],
    ['Ausgaben', formatMoney(week.spent)],
  ];
  stats.forEach(([label, value], i) => {
    const x = 90 + (i % 2) * 460;
    const top = Math.max(y + 120, 620) + Math.floor(i / 2) * 260;
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.beginPath();
    g.roundRect(x, top, 430, 220, 36);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = '500 34px Inter, -apple-system, sans-serif';
    g.fillText(label, x + 36, top + 70);
    g.fillStyle = '#fff';
    g.font = '800 64px Inter, -apple-system, sans-serif';
    g.fillText(value, x + 36, top + 160);
  });
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.font = '600 34px Inter, -apple-system, sans-serif';
  g.fillText('🎓 AntonOS', 90, 1270);
  return c;
}

function MoodCalendar() {
  const { data } = useStore();
  const t = today();
  const days = lastDays(t, 28);
  const lead = (parseDate(days[0]).getDay() + 6) % 7;
  return (
    <div className="mood-calendar">
      {['M', 'D', 'M', 'D', 'F', 'S', 'S'].map((d, i) => <span key={i} className="mood-head">{d}</span>)}
      {Array.from({ length: lead }, (_, i) => <span key={`x${i}`} />)}
      {days.map((d) => {
        const m = data.moods.find((x) => x.date === d);
        return (
          <span
            key={d}
            className={`mood-cell ${d === t ? 'today' : ''}`}
            style={m ? { background: moodOf(m.mood).color } : undefined}
            title={`${parseDate(d).toLocaleDateString('de-DE')}${m ? ` · ${moodOf(m.mood).label}${m.sleep ? ` · ${m.sleep} Std. Schlaf` : ''}${m.note ? ` · ${m.note}` : ''}` : ' · keine Angabe'}`}
          >
            {m ? moodOf(m.mood).emoji : Number(d.slice(8))}
          </span>
        );
      })}
    </div>
  );
}

/** Sonntags ab 18 Uhr: Hinweis auf den neuen Rückblick (einmal pro Woche) */
export function useWeeklyReviewReminder() {
  const { show } = useToast();
  useEffect(() => {
    const KEY = 'antonos:rueckblick-erinnert';
    const check = () => {
      const now = new Date();
      if (now.getDay() !== 0 || now.getHours() < 18) return;
      const t = today();
      try {
        if (localStorage.getItem(KEY) === t) return;
        localStorage.setItem(KEY, t);
      } catch {
        return;
      }
      notify('Dein Wochenrückblick ist da 🌟', 'Schau dir an, was du diese Woche geschafft hast.', 'rueckblick').then((ok) => {
        if (!ok) show('🌟 Dein Wochenrückblick ist da', { label: 'Ansehen', run: () => (location.hash = '#/rueckblick') }, 10000);
      });
    };
    check();
    const id = setInterval(check, 5 * 60_000);
    return () => clearInterval(id);
  }, [show]);
}

/** Dashboard-Widget: Stimmung eintragen und Überschrift der Woche */
export function ReviewWidget({ variant = 'standard' }: { variant?: WidgetVariant }) {
  const { data } = useStore();
  const t = today();
  const week = weekReview(data, t, t);
  const prev = [1, 2, 3].map((i) => weekReview(data, addDays(t, -7 * i), addDays(t, -7 * i + 6)));
  return (
    <div className="col">
      <MoodCheckIn compact />
      {variant !== 'kompakt' && (
        <a href="#/rueckblick" className="review-teaser">
          <span className="muted small">Diese Woche</span>
          <strong>{headline(week, prev)}</strong>
        </a>
      )}
    </div>
  );
}

export function Review() {
  const { data } = useStore();
  const { show } = useToast();
  const t = today();
  const [offset, setOffset] = useState(0);
  const anchor = addDays(t, -7 * offset);
  const until = offset === 0 ? t : addDays(anchor, 6);
  const week = weekReview(data, anchor, until);
  const prevWeeks = [1, 2, 3, 4].map((i) => weekReview(data, addDays(anchor, -7 * i), addDays(anchor, -7 * i + 6)));
  const title = headline(week, prevWeeks);
  const weekLabel = `KW ${isoWeek(parseDate(anchor))}${offset === 0 ? ' (bisher)' : ''}`;
  const insights = moodInsights(data, data.moods);

  const share = async () => {
    const canvas = drawImage(week, title, weekLabel);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) return;
    const file = new File([blob], `antonos-rueckblick-kw${isoWeek(parseDate(anchor))}.png`, { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: 'Mein Wochenrückblick' }).catch(() => undefined);
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(a.href);
    show('Bild gespeichert');
  };

  return (
    <>
      <PageHeader
        title="Rückblick"
        subtitle="Deine Woche auf einen Blick – und wie es dir ging"
        actions={
          <>
            <button onClick={() => setOffset((o) => o + 1)} aria-label="Vorige Woche">‹</button>
            <button onClick={() => setOffset(0)} disabled={offset === 0}>Diese Woche</button>
            <button onClick={() => setOffset((o) => Math.max(0, o - 1))} disabled={offset === 0} aria-label="Nächste Woche">›</button>
          </>
        }
      />
      <div className="review-layout">
        <div className="col">
          <Story week={week} prev={prevWeeks[0]} title={title} weekLabel={weekLabel} />
          <button type="button" className="story-share" onClick={share}>📤 Als Bild teilen</button>
        </div>
        <div className="stack">
          <Panel><MoodCheckIn /></Panel>
          <Panel title="Stimmung · 4 Wochen"><MoodCalendar /></Panel>
          <Panel title="💡 Was dir guttut">
            {insights.length === 0 ? (
              <Empty>Trag ein paar Tage deine Stimmung ein – dann zeigt AntonOS hier, ob Training, Lernen oder Schlaf einen Unterschied machen.</Empty>
            ) : (
              <ul className="list insights">{insights.map((i) => <li key={i.text}>{i.text}</li>)}</ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
