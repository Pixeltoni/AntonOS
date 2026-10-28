import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import type { CalEvent, DateStr, EventPriority, RepeatFreq } from '../types';
import { addDays, formatDate, isoWeek, parseDate, today } from '../lib/dates';
import { monthGrid, monthKey } from '../lib/life';
import { describeRepeat, guessSemesterStart, REPEAT_LABELS, slotSeries } from '../lib/recurrence';
import { defaultSemester } from '../demo';
import { askNotifications, notify } from '../lib/notify';
import { useToast } from './toast';
import { dueReminders, isTimedOn, layoutTimed, onDay, rangeLabel, shiftAnchor, sortEntries, timeRange, validateEvent, weekDays, type CalendarEntry, type CalendarMode } from '../lib/calendar';

export const PRIORITIES: { value: EventPriority; label: string }[] = [
  { value: 'niedrig', label: 'Niedrig' },
  { value: 'mittel', label: 'Mittel' },
  { value: 'hoch', label: 'Hoch' },
];

/** Alle Einträge für den Kalender: eigene Termine plus Fristen aus anderen Bereichen. */
export function useCalendarEntries(): (CalendarEntry & { remind?: number | null })[] {
  const { data } = useStore();
  const single = (date: DateStr) => ({ start: date, end: date, endTime: '' });
  return [
    ...data.events.map((e) => ({
      key: `ev-${e.id}`,
      start: e.start,
      end: e.end && e.end >= e.start ? e.end : e.start,
      time: e.startTime,
      endTime: e.endTime,
      label: e.title,
      kind: 'event' as const,
      priority: e.priority,
      note: e.note,
      eventId: e.id,
      recur: e.repeat ?? undefined,
      remind: e.remind ?? null,
    })),
    // Stundenplan: Kurszeiten als wöchentliche Serien
    ...slotSeries(data.courses, data.settings.semester ?? defaultSemester(), guessSemesterStart(today())).map((s) => ({
      key: `l-${s.slot.id}`,
      start: s.start,
      end: s.start,
      time: s.slot.start,
      endTime: s.slot.end,
      // Lange Kursnamen als Kürzel, damit sie in Monats- und Wochenansicht lesbar bleiben
      label: s.course.name.length > 16 && s.course.code ? s.course.code : s.course.name,
      note: [s.course.name.length > 16 && s.course.code ? s.course.name : '', s.slot.kind, s.slot.room].filter(Boolean).join(' · '),
      kind: 'lecture' as const,
      href: `#/kurse/${s.course.id}`,
      recur: s.rule,
      color: s.course.color,
      remind: data.settings.semester?.remind || null,
    })),
    ...data.tasks.filter((t) => t.due).map((t) => ({ key: `t-${t.id}`, ...single(t.due!), time: '', label: t.title, kind: 'task' as const, href: '#/aufgaben', done: t.status === 'erledigt' })),
    ...data.exams.map((e) => ({ key: `x-${e.id}`, ...single(e.date), time: e.time, label: e.title, kind: 'exam' as const, href: '#/pruefungen' })),
    ...data.projects.filter((p) => p.due).map((p) => ({ key: `p-${p.id}`, ...single(p.due!), time: '', label: p.title, kind: 'project' as const, href: `#/projekte/${p.id}`, done: p.status === 'abgeschlossen' })),
    ...data.workouts.map((w) => ({ key: `w-${w.id}`, ...single(w.date), time: '', label: w.title, kind: 'workout' as const, href: '#/training', done: w.done })),
  ];
}

const REMINDED_KEY = 'antonos:erinnert';

/** Erinnert vor Terminen und Vorlesungen – solange AntonOS offen ist (bzw. als App im Hintergrund läuft). */
export function useEventReminders() {
  const entries = useCalendarEntries();
  const { show } = useToast();
  const ref = useRef(entries);
  ref.current = entries;
  useEffect(() => {
    const check = () => {
      let done: string[] = [];
      try {
        done = JSON.parse(localStorage.getItem(REMINDED_KEY) ?? '[]');
      } catch {
        done = [];
      }
      const due = dueReminders(ref.current, new Date()).filter((r) => !done.includes(r.id));
      if (due.length === 0) return;
      for (const { entry, day } of due) {
        const when = day === today() ? `um ${entry.time}` : `morgen um ${entry.time}`;
        const body = `${when}${entry.note ? ` · ${entry.note}` : ''}`;
        notify(entry.label, body, entry.key).then((ok) => {
          if (!ok) show(`⏰ ${entry.label} ${body}`, undefined, 10000);
        });
      }
      try {
        // Nur die letzten 200 merken
        localStorage.setItem(REMINDED_KEY, JSON.stringify([...done, ...due.map((r) => r.id)].slice(-200)));
      } catch {
        // dann eben ohne Merken
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [show]);
}

type Draft = Omit<CalEvent, 'id'>;
const blank = (date: DateStr): Draft => ({ title: '', note: '', start: date, end: null, startTime: '', endTime: '', priority: 'mittel' });

/** Fenster zum Anlegen und Bearbeiten eines Termins. */
const REMINDERS: { value: number; label: string }[] = [
  { value: 0, label: 'Keine' },
  { value: 5, label: '5 Minuten vorher' },
  { value: 15, label: '15 Minuten vorher' },
  { value: 30, label: '30 Minuten vorher' },
  { value: 60, label: '1 Stunde vorher' },
  { value: 1440, label: '1 Tag vorher' },
];

/** Fenster zum Anlegen und Bearbeiten eines Termins. `occurrence` = angeklickter Tag einer Serie. */
export function EventModal({ initial, eventId, occurrence, onClose }: { initial: Draft; eventId?: string; occurrence?: DateStr; onClose: () => void }) {
  const { add, update, remove } = useStore();
  const [e, setE] = useState<Draft>(initial);
  const [multiDay, setMultiDay] = useState(!!initial.end && initial.end !== initial.start);
  const [allDay, setAllDay] = useState(!initial.startTime);
  const [error, setError] = useState('');
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setE((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = (ev: React.FormEvent) => {
    ev.preventDefault();
    // „22:00 bis 02:00“ an einem Tag heißt: endet am nächsten Tag
    const overnight = !multiDay && !allDay && !!e.startTime && !!e.endTime && e.endTime < e.startTime;
    const final: Draft = {
      ...e,
      title: e.title.trim(),
      note: e.note.trim(),
      end: overnight ? addDays(e.start, 1) : multiDay && e.end && e.end !== e.start ? e.end : null,
      startTime: allDay ? '' : e.startTime,
      endTime: allDay ? '' : e.endTime,
      repeat: e.repeat ? { ...e.repeat, until: e.repeat.until || null } : null,
      remind: !allDay && e.remind ? e.remind : null,
    };
    const problem = validateEvent(final);
    if (problem) {
      setError(problem);
      return;
    }
    if (final.remind) void askNotifications();
    if (eventId) update('events', eventId, final);
    else add('events', final);
    onClose();
  };

  // Als Portal direkt in <body>, damit Glas-Effekte der Kästen das Fenster nicht einsperren
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-label={eventId ? 'Termin bearbeiten' : 'Neuer Termin'} onSubmit={save}>
        <div className="row between">
          <h2>{eventId ? 'Termin bearbeiten' : 'Neuer Termin'}</h2>
          <button type="button" className="icon" onClick={onClose} aria-label="Schließen">×</button>
        </div>

        <label>
          Name
          <input autoFocus value={e.title} onChange={(x) => set('title', x.target.value)} placeholder="z. B. Lerngruppe" required />
        </label>

        <div className="modal-grid">
          <label>
            {multiDay ? 'Von' : 'Datum'}
            <input type="date" value={e.start} onChange={(x) => set('start', x.target.value)} required />
          </label>
          {multiDay && (
            <label>
              Bis
              <input type="date" value={e.end ?? ''} min={e.start} onChange={(x) => set('end', x.target.value || null)} />
            </label>
          )}
        </div>
        <div className="row wrap">
          <label className="row small">
            <input type="checkbox" checked={multiDay} onChange={(x) => { setMultiDay(x.target.checked); if (x.target.checked && !e.end) set('end', e.start); }} />
            Mehrere Tage
          </label>
          <label className="row small">
            <input type="checkbox" checked={allDay} onChange={(x) => setAllDay(x.target.checked)} />
            Ganztägig
          </label>
        </div>
        {!allDay && (
          <div className="modal-grid">
            <label>
              Uhrzeit von
              <input type="time" value={e.startTime} onChange={(x) => set('startTime', x.target.value)} required />
            </label>
            <label>
              bis (optional)
              <input type="time" value={e.endTime} onChange={(x) => set('endTime', x.target.value)} />
            </label>
          </div>
        )}
        {!allDay && !multiDay && e.startTime && e.endTime && e.endTime < e.startTime && (
          <p className="small muted">🌙 Endet am nächsten Tag um {e.endTime}.</p>
        )}

        <div className="modal-grid">
          <label>
            Wiederholen
            <select
              value={e.repeat?.freq ?? ''}
              onChange={(x) => set('repeat', x.target.value ? { freq: x.target.value as RepeatFreq, until: e.repeat?.until ?? null, except: e.repeat?.except ?? [] } : null)}
            >
              <option value="">Nie</option>
              {(Object.keys(REPEAT_LABELS) as RepeatFreq[]).map((f) => <option key={f} value={f}>{REPEAT_LABELS[f]}</option>)}
            </select>
          </label>
          {e.repeat && (
            <label>
              Endet am (optional)
              <input type="date" value={e.repeat.until ?? ''} min={e.start} onChange={(x) => set('repeat', { ...e.repeat!, until: x.target.value || null })} />
            </label>
          )}
          {!allDay && (
            <label>
              Erinnerung
              <select value={e.remind ?? 0} onChange={(x) => set('remind', Number(x.target.value) || null)}>
                {REMINDERS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
          )}
        </div>
        {e.repeat && (
          <p className="small muted">
            🔁 {describeRepeat(e.repeat, e.start)}
            {(e.repeat.except?.length ?? 0) > 0 && (
              <>
                {' · '}{e.repeat.except!.length} ausgelassen{' '}
                <button type="button" className="link" onClick={() => set('repeat', { ...e.repeat!, except: [] })}>wiederherstellen</button>
              </>
            )}
          </p>
        )}

        <div className="col">
          <span className="small muted">Wichtigkeit</span>
          <div className="segmented prio-picker" role="radiogroup" aria-label="Wichtigkeit">
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={e.priority === p.value}
                className={`prio-${p.value} ${e.priority === p.value ? 'selected' : ''}`}
                onClick={() => set('priority', p.value)}
              >
                <span className="prio-dot" aria-hidden /> {p.label}
              </button>
            ))}
          </div>
        </div>

        <label>
          Notiz
          <textarea rows={3} value={e.note} onChange={(x) => set('note', x.target.value)} placeholder="Ort, Details, Link …" />
        </label>

        {error && <p className="danger small" role="alert">{error}</p>}

        <div className="row between">
          {eventId ? (
            <div className="row wrap">
              {initial.repeat && occurrence && (
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    update('events', eventId, { repeat: { ...initial.repeat!, except: [...(initial.repeat!.except ?? []), occurrence] } });
                    onClose();
                  }}
                >
                  Nur am {parseDate(occurrence).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })} löschen
                </button>
              )}
              <button type="button" className="danger" onClick={() => { if (confirm(initial.repeat ? 'Alle Termine dieser Serie löschen?' : 'Termin löschen?')) { remove('events', eventId); onClose(); } }}>
                {initial.repeat ? 'Serie löschen' : 'Löschen'}
              </button>
            </div>
          ) : <span />}
          <div className="row">
            <button type="button" onClick={onClose}>Abbrechen</button>
            <button type="submit" className="primary">Speichern</button>
          </div>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function EntryChip({ e, day, onOpen, showTime = true }: { e: CalendarEntry; day?: DateStr; onOpen: (e: CalendarEntry, day?: DateStr) => void; showTime?: boolean }) {
  const cls = `cal-item ${e.kind} ${e.priority ? `prio-${e.priority}` : ''} ${e.done ? 'done' : ''}`;
  const text = (
    <>
      {showTime && e.time && <span className="cal-time">{e.time}</span>}
      {e.priority === 'hoch' && <span aria-label="wichtig">❗</span>}
      {e.label}
    </>
  );
  const title = `${e.label} · ${timeRange(e)}${e.note ? `\n${e.note}` : ''}`;
  if (e.eventId) {
    return (
      <button type="button" className={cls} style={entryStyle(e)} title={title} onClick={(ev) => { ev.stopPropagation(); onOpen(e, day); }}>
        {text}
      </button>
    );
  }
  return <a className={cls} style={entryStyle(e)} href={e.href} title={title} onClick={(ev) => ev.stopPropagation()}>{text}</a>;
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
/** Unter dieser Breite wird der Kalender kompakt wie auf dem iPhone dargestellt */
const COMPACT_WIDTH = 640;

const MODE_KEY = 'antonos:kalender-ansicht';
function loadMode(fallback: CalendarMode): CalendarMode {
  try {
    const m = localStorage.getItem(MODE_KEY);
    if (m === 'tag' || m === 'woche' || m === 'monat') return m;
  } catch {
    // keine gespeicherte Ansicht
  }
  return fallback;
}

/** Breite des Kalenders – entscheidet über die kompakte Darstellung (auch im schmalen Dashboard-Kasten). */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

function useNowMinutes(): number {
  const [m, setM] = useState(nowMinutes);
  useEffect(() => {
    const timer = setInterval(() => setM(nowMinutes()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return m;
}

/** Kursfarbe für Vorlesungen */
const entryStyle = (e: CalendarEntry) => (e.color ? ({ ['--c' as string]: e.color } as React.CSSProperties) : undefined);

const dotClass = (e: CalendarEntry) => `cal-dot ${e.kind} ${e.priority ? `prio-${e.priority}` : ''}`;

/** Wochenleiste mit Datums-Kreisen wie oben im iPhone-Kalender. */
function WeekStrip({ anchor, entries, onPick }: { anchor: DateStr; entries: CalendarEntry[]; onPick: (d: DateStr) => void }) {
  const t = today();
  return (
    <div className="week-strip" role="tablist" aria-label="Woche">
      {weekDays(anchor).map((d, i) => {
        const has = entries.some((e) => onDay(e, d));
        return (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={d === anchor}
            className={`ws-day ${d === anchor ? 'selected' : ''} ${d === t ? 'today' : ''}`}
            onClick={() => onPick(d)}
          >
            <span className="ws-name">{WEEKDAYS[i]}</span>
            <span className="ws-num">{Number(d.slice(8))}</span>
            <span className={`ws-dot ${has ? 'on' : ''}`} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

/** Terminliste eines Tages im Stil der iPhone-Listenansicht. */
function DayList({ day, entries, onOpen, onNew, hideEmpty = false }: { day: DateStr; entries: CalendarEntry[]; onOpen: (e: CalendarEntry, day?: DateStr) => void; onNew: () => void; hideEmpty?: boolean }) {
  const items = sortEntries(entries.filter((e) => onDay(e, day)));
  if (hideEmpty && items.length === 0) return null;
  return (
    <div className="day-list" data-day={day}>
      <div className="day-list-head">
        <strong>{parseDate(day).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
        <button type="button" className="link" onClick={onNew}>+ Termin</button>
      </div>
      {items.length === 0 ? (
        <p className="muted small day-list-empty">Keine Termine</p>
      ) : (
        <ul>
          {items.map((e) => {
            const body = (
              <>
                <span className={`dl-bar ${dotClass(e)}`} style={entryStyle(e)} aria-hidden />
                <span className="dl-main">
                  <span className={`dl-title ${e.done ? 'done' : ''}`}>
                    {e.priority === 'hoch' && '❗ '}
                    {e.label}
                  </span>
                  {e.note && <span className="dl-note">{e.note}</span>}
                </span>
                <span className="dl-time">
                  {e.time ? (
                    <>
                      <span>{e.time}</span>
                      {e.endTime && <span className="muted">{e.endTime}</span>}
                    </>
                  ) : (
                    <span className="muted">ganztägig</span>
                  )}
                </span>
              </>
            );
            return (
              <li key={e.key}>
                {e.eventId ? (
                  <button type="button" className="dl-row" onClick={() => onOpen(e, day)}>{body}</button>
                ) : (
                  <a className="dl-row" href={e.href}>{body}</a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Zeitleiste eines Tages: Termine als Blöcke nach Uhrzeit und Dauer, rote Linie für „jetzt“. */
function Timeline({ day, entries, compact, onOpen, onNew }: {
  day: DateStr;
  entries: CalendarEntry[];
  compact: boolean;
  onOpen: (e: CalendarEntry, day?: DateStr) => void;
  onNew: (time: string) => void;
}) {
  const hourH = compact ? 48 : 52;
  const scroller = useRef<HTMLDivElement>(null);
  const now = useNowMinutes();
  const isToday = day === today();
  const blocks = layoutTimed(entries, day);
  const allDay = sortEntries(entries.filter((e) => onDay(e, day) && !isTimedOn(e, day)));

  // Beim Öffnen zur aktuellen Uhrzeit (heute) bzw. zum ersten Termin oder 8 Uhr scrollen
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = isToday ? now - 90 : blocks.length ? blocks[0].start - 30 : 8 * 60;
    el.scrollTop = Math.max(0, (target / 60) * hourH);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  return (
    <div className="timeline-wrap">
      {allDay.length > 0 && (
        <div className="tl-allday">
          <span className="tl-allday-label">ganztägig</span>
          <div className="tl-allday-items">
            {allDay.map((e) => <EntryChip key={e.key} e={e} day={day} onOpen={onOpen} />)}
          </div>
        </div>
      )}
      <div className="timeline" ref={scroller}>
        <div
          className="tl-canvas"
          style={{ height: 24 * hourH }}
          onClick={(ev) => {
            const y = ev.clientY - (ev.currentTarget as HTMLElement).getBoundingClientRect().top;
            const hour = Math.min(23, Math.max(0, Math.floor(y / hourH)));
            onNew(`${String(hour).padStart(2, '0')}:00`);
          }}
          title="Klicken für neuen Termin"
        >
          {HOURS.map((h) => (
            <div key={h} className="tl-hour" style={{ top: h * hourH }}>
              <span>{String(h).padStart(2, '0')}:00</span>
            </div>
          ))}
          {blocks.map((b) => {
            const e = b.entry;
            const height = Math.max(22, ((b.end - b.start) / 60) * hourH - 2);
            const style = {
              ...entryStyle(e),
              top: (b.start / 60) * hourH + 1,
              height,
              left: `calc(var(--tl-gutter) + (100% - var(--tl-gutter) - 6px) * ${b.col / b.cols})`,
              width: `calc((100% - var(--tl-gutter) - 6px) / ${b.cols} - 3px)`,
            };
            const inner = (
              <>
                <strong>{e.priority === 'hoch' && '❗ '}{e.label}</strong>
                {height > 34 && <span>{timeRange(e)}</span>}
                {height > 54 && e.note && <span className="tl-note">{e.note}</span>}
              </>
            );
            const cls = `tl-event ${e.kind} ${e.priority ? `prio-${e.priority}` : ''} ${e.done ? 'done' : ''}`;
            return e.eventId ? (
              <button key={e.key} type="button" className={cls} style={style} onClick={(ev) => { ev.stopPropagation(); onOpen(e, day); }} title={`${e.label} · ${timeRange(e)}`}>
                {inner}
              </button>
            ) : (
              <a key={e.key} className={cls} style={style} href={e.href} onClick={(ev) => ev.stopPropagation()} title={`${e.label} · ${timeRange(e)}`}>
                {inner}
              </a>
            );
          })}
          {isToday && (
            <div className="tl-now" style={{ top: (now / 60) * hourH }} aria-label="Jetzt">
              <span>{`${String(Math.floor(now / 60)).padStart(2, '0')}:${String(now % 60).padStart(2, '0')}`}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Kalender mit Tages-, Wochen- und Monatsansicht und eigenen Terminen. */
export function CalendarView({ defaultMode = 'monat', remember = false }: { defaultMode?: CalendarMode; remember?: boolean }) {
  const { data } = useStore();
  const t = today();
  const [mode, setModeState] = useState<CalendarMode>(() => (remember ? loadMode(defaultMode) : defaultMode));
  const [anchor, setAnchor] = useState(t);
  const [modal, setModal] = useState<{ initial: Draft; eventId?: string; occurrence?: DateStr } | null>(null);
  const entries = useCalendarEntries();
  const [rootRef, width] = useWidth();
  const compact = width < COMPACT_WIDTH;

  const setMode = (m: CalendarMode) => {
    setModeState(m);
    if (remember) {
      try {
        localStorage.setItem(MODE_KEY, m);
      } catch {
        // Ansicht wird dann nicht gemerkt
      }
    }
  };
  const openNew = (date: DateStr, time = '') => setModal({ initial: { ...blank(date), startTime: time } });
  const openEntry = (e: CalendarEntry, day?: DateStr) => {
    const ev = data.events.find((x) => x.id === e.eventId);
    if (ev) setModal({ initial: { ...ev }, eventId: ev.id, occurrence: day });
  };
  const goDay = (d: DateStr) => {
    setAnchor(d);
    setMode('tag');
  };
  const dayEntries = (d: DateStr) => sortEntries(entries.filter((e) => onDay(e, d)));
  const title = compact
    ? mode === 'monat'
      ? parseDate(anchor).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
      : mode === 'woche'
        ? `${parseDate(anchor).toLocaleDateString('de-DE', { month: 'short' })} · KW ${isoWeek(parseDate(anchor))}`
        : parseDate(anchor).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
    : rangeLabel(mode, anchor, isoWeek);

  const segmented = (
    <div className="segmented cal-modes" role="radiogroup" aria-label="Ansicht">
      {(['tag', 'woche', 'monat'] as CalendarMode[]).map((m) => (
        <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'selected' : ''} onClick={() => setMode(m)}>
          {m === 'tag' ? 'Tag' : m === 'woche' ? 'Woche' : 'Monat'}
        </button>
      ))}
    </div>
  );

  return (
    <div className={`calendar ${compact ? 'compact' : ''}`} ref={rootRef}>
      {compact ? (
        <div className="cal-toolbar-compact">
          <div className="row between">
            <div className="row">
              <button className="icon cal-arrow" onClick={() => setAnchor(shiftAnchor(mode, anchor, -1))} aria-label="Zurück">‹</button>
              <strong className="cal-big-title">{title}</strong>
              <button className="icon cal-arrow" onClick={() => setAnchor(shiftAnchor(mode, anchor, 1))} aria-label="Weiter">›</button>
            </div>
            <div className="row">
              <button className="cal-today" onClick={() => setAnchor(t)}>Heute</button>
              <button className="cal-plus" onClick={() => openNew(anchor)} aria-label="Neuer Termin">+</button>
            </div>
          </div>
          {segmented}
        </div>
      ) : (
        <div className="cal-toolbar">
          <div className="row">
            <button onClick={() => setAnchor(shiftAnchor(mode, anchor, -1))} aria-label="Zurück">‹</button>
            <button onClick={() => setAnchor(t)}>Heute</button>
            <button onClick={() => setAnchor(shiftAnchor(mode, anchor, 1))} aria-label="Weiter">›</button>
            <strong className="cal-title">{title}</strong>
          </div>
          <div className="row">
            {segmented}
            <button className="primary" onClick={() => openNew(mode === 'monat' && monthKey(anchor) !== monthKey(t) ? anchor : mode === 'monat' ? t : anchor)}>
              + Termin
            </button>
          </div>
        </div>
      )}

      {mode === 'monat' && compact && (
        <>
          <div className="mini-month">
            {WEEKDAYS.map((d) => <span key={d} className="mm-head">{d.slice(0, 1)}</span>)}
            {monthGrid(parseDate(anchor).getFullYear(), parseDate(anchor).getMonth()).map((d) => {
              const items = dayEntries(d);
              return (
                <button
                  key={d}
                  type="button"
                  className={`mm-day ${monthKey(d) !== monthKey(anchor) ? 'other' : ''} ${d === t ? 'today' : ''} ${d === anchor ? 'selected' : ''}`}
                  onClick={() => setAnchor(d)}
                  aria-label={`${formatDate(d)}, ${items.length} Einträge`}
                >
                  <span className="mm-num">{Number(d.slice(8))}</span>
                  <span className="mm-dots" aria-hidden>
                    {items.slice(0, 3).map((e) => <span key={e.key} className={dotClass(e)} style={entryStyle(e)} />)}
                  </span>
                </button>
              );
            })}
          </div>
          <DayList day={anchor} entries={entries} onOpen={openEntry} onNew={() => openNew(anchor)} />
        </>
      )}

      {mode === 'monat' && !compact && (
        <div className="cal-grid">
          {WEEKDAYS.map((d) => <div key={d} className="cal-head">{d}</div>)}
          {monthGrid(parseDate(anchor).getFullYear(), parseDate(anchor).getMonth()).map((d) => {
            const items = dayEntries(d);
            return (
              <div
                key={d}
                className={`cal-day ${monthKey(d) !== monthKey(anchor) ? 'other' : ''} ${d === t ? 'today' : ''}`}
                onClick={() => openNew(d)}
                title={`${formatDate(d)} – klicken für neuen Termin`}
              >
                <button type="button" className="cal-num" onClick={(ev) => { ev.stopPropagation(); goDay(d); }} aria-label={`${formatDate(d)} als Tag anzeigen`}>
                  {Number(d.slice(8))}
                </button>
                {items.slice(0, 3).map((e) => <EntryChip key={e.key} e={e} day={d} onOpen={openEntry} />)}
                {items.length > 3 && (
                  <button type="button" className="cal-more" onClick={(ev) => { ev.stopPropagation(); goDay(d); }}>
                    +{items.length - 3} weitere
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {mode === 'woche' && compact && (
        <>
          <WeekStrip
            anchor={anchor}
            entries={entries}
            onPick={(d) => {
              setAnchor(d);
              rootRef.current?.querySelector(`[data-day="${d}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }}
          />
          <div className="week-agenda">
            {weekDays(anchor).map((d) => (
              <DayList key={d} day={d} entries={entries} onOpen={openEntry} onNew={() => openNew(d)} hideEmpty={d !== anchor} />
            ))}
          </div>
        </>
      )}

      {mode === 'woche' && !compact && (
        <div className="cal-week">
          {weekDays(anchor).map((d, i) => (
            <div key={d} className={`cal-week-day ${d === t ? 'today' : ''}`} onClick={() => openNew(d)}>
              <button type="button" className="cal-week-head" onClick={(ev) => { ev.stopPropagation(); goDay(d); }}>
                <span>{WEEKDAYS[i]}</span>
                <strong>{parseDate(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</strong>
              </button>
              <div className="cal-week-items">
                {dayEntries(d).map((e) => <EntryChip key={e.key} e={e} day={d} onOpen={openEntry} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {mode === 'tag' && (
        <>
          {compact && (
            <>
              <WeekStrip anchor={anchor} entries={entries} onPick={setAnchor} />
              <p className="tl-date">{parseDate(anchor).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </>
          )}
          <Timeline day={anchor} entries={entries} compact={compact} onOpen={openEntry} onNew={(time) => openNew(anchor, time)} />
        </>
      )}

      {!compact && (
        <div className="row wrap small muted cal-legend">
          <span className="cal-item event prio-hoch">Termin: hoch</span>
          <span className="cal-item event prio-mittel">mittel</span>
          <span className="cal-item event prio-niedrig">niedrig</span>
          <span className="cal-item task">Aufgabe</span>
          <span className="cal-item exam">Prüfung</span>
          <span className="cal-item project">Projekt</span>
          <span className="cal-item workout">Training</span>
          <span className="cal-item lecture">Vorlesung</span>
        </div>
      )}

      {modal && <EventModal initial={modal.initial} eventId={modal.eventId} occurrence={modal.occurrence} onClose={() => setModal(null)} />}
    </div>
  );
}
