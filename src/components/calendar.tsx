import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import type { CalEvent, DateStr, EventColor, EventPriority, RepeatFreq } from '../types';
import { addDays, daysBetween, formatDate, isoWeek, parseDate, today } from '../lib/dates';
import { monthGrid, monthKey } from '../lib/life';
import { describeRepeat, guessSemesterStart, REPEAT_LABELS, slotSeries } from '../lib/recurrence';
import { defaultSemester } from '../demo';
import { askNotifications, notify } from '../lib/notify';
import { useToast } from './toast';
import {
  detachOccurrence, dueReminders, editWholeSeries, EVENT_COLORS, fromMin, isMultiDay, isTimedOn, KIND_LABELS, layoutTimed, moveEvent, occurrenceDraft, onDay,
  rangeLabel, resizeEvent, shiftAnchor, sortEntries, spanLanes, timeRange, validateEvent, weekDays, type CalendarEntry, type CalendarMode, type EntryKind,
} from '../lib/calendar';
import { parseEventQuickAdd } from '../lib/quickadd';
import { ageOn, birthdayIn } from '../lib/people';

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
      location: e.location || undefined,
      color: e.color ? EVENT_COLORS[e.color]?.hex : undefined,
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
    // Geburtstage im letzten, diesem und den nächsten beiden Jahren
    ...(data.people ?? []).filter((p) => p.birthday).flatMap((p) => {
      const year = Number(today().slice(0, 4));
      return [year - 1, year, year + 1, year + 2].map((y) => {
        const date = birthdayIn(p.birthday, y);
        const age = ageOn(p, date);
        return { key: `b-${p.id}-${y}`, ...single(date), time: '', label: `${p.name}${age && age > 0 ? ` (${age})` : ''}`, note: 'Geburtstag', kind: 'birthday' as const, href: `#/menschen/${p.id}`, color: p.color || undefined };
      });
    }),
    ...(data.trips ?? []).map((tr) => ({ key: `r-${tr.id}`, start: tr.start, end: tr.end >= tr.start ? tr.end : tr.start, time: '', endTime: '', label: tr.title, note: 'Reise', kind: 'trip' as const, href: `#/reisen/${tr.id}` })),
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
        const body = `${when}${entry.location ? ` · ${entry.location}` : ''}${entry.note ? ` · ${entry.note}` : ''}`;
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
const blank = (date: DateStr): Draft => ({ title: '', note: '', location: '', start: date, end: null, startTime: '', endTime: '', priority: 'mittel', color: null });

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
  const { show } = useToast();
  // Bei Serien zeigt das Fenster das angeklickte Vorkommen
  const inSeries = !!eventId && !!initial.repeat && !!occurrence;
  const [e, setE] = useState<Draft>(() => (inSeries ? occurrenceDraft(initial, occurrence!) : initial));
  const [multiDay, setMultiDay] = useState(!!initial.end && initial.end !== initial.start);
  const [allDay, setAllDay] = useState(!initial.startTime);
  const [error, setError] = useState('');
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setE((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** Eingaben bereinigen und prüfen; null bei Fehler */
  const finalDraft = (): Draft | null => {
    // „22:00 bis 02:00“ an einem Tag heißt: endet am nächsten Tag
    const overnight = !multiDay && !allDay && !!e.startTime && !!e.endTime && e.endTime < e.startTime;
    const final: Draft = {
      ...e,
      title: e.title.trim(),
      note: e.note.trim(),
      location: (e.location ?? '').trim(),
      end: overnight ? addDays(e.start, 1) : multiDay && e.end && e.end !== e.start ? e.end : null,
      startTime: allDay ? '' : e.startTime,
      endTime: allDay ? '' : e.endTime,
      repeat: e.repeat ? { ...e.repeat, until: e.repeat.until || null } : null,
      remind: !allDay && e.remind ? e.remind : null,
    };
    const problem = validateEvent(final);
    if (problem) {
      setError(problem);
      return null;
    }
    return final;
  };

  const save = (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const final = finalDraft();
    if (!final) return;
    if (final.remind) void askNotifications();
    const scope = ((ev.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value;
    if (inSeries && scope === 'one') {
      const { seriesPatch, single } = detachOccurrence(initial, occurrence!, final);
      update('events', eventId!, seriesPatch);
      add('events', single);
    } else if (inSeries) {
      update('events', eventId!, editWholeSeries(initial, occurrence!, final));
    } else if (eventId) update('events', eventId, final);
    else add('events', final);
    onClose();
  };

  const duplicate = () => {
    const final = finalDraft();
    if (!final) return;
    add('events', inSeries ? { ...final, repeat: null } : final);
    show(`„${final.title}“ dupliziert`);
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
        <label>
          Ort (optional)
          <input value={e.location ?? ''} onChange={(x) => set('location', x.target.value)} placeholder="z. B. Bibliothek, Raum 2.14" />
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

        <div className="col">
          <span className="small muted">Farbe</span>
          <div className="color-picker" role="radiogroup" aria-label="Farbe">
            <button type="button" role="radio" aria-checked={!e.color} className={`swatch auto ${!e.color ? 'on' : ''}`} onClick={() => set('color', null)} title="Nach Wichtigkeit">
              Auto
            </button>
            {(Object.keys(EVENT_COLORS) as EventColor[]).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={e.color === c}
                aria-label={EVENT_COLORS[c].label}
                title={EVENT_COLORS[c].label}
                className={`swatch ${e.color === c ? 'on' : ''}`}
                style={{ ['--c' as string]: EVENT_COLORS[c].hex } as React.CSSProperties}
                onClick={() => set('color', c)}
              />
            ))}
          </div>
        </div>

        <label>
          Notiz
          <textarea rows={3} value={e.note} onChange={(x) => set('note', x.target.value)} placeholder="Ort, Details, Link …" />
        </label>

        {error && <p className="danger small" role="alert">{error}</p>}
        {inSeries && <p className="small muted">🔁 Wiederkehrender Termin: Änderungen nur für diesen Tag oder für alle Termine speichern.</p>}

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
              <button type="button" onClick={duplicate}>Duplizieren</button>
              <button type="button" className="danger" onClick={() => { if (confirm(initial.repeat ? 'Alle Termine dieser Serie löschen?' : 'Termin löschen?')) { remove('events', eventId); onClose(); } }}>
                {initial.repeat ? 'Serie löschen' : 'Löschen'}
              </button>
            </div>
          ) : <span />}
          <div className="row wrap">
            <button type="button" onClick={onClose}>Abbrechen</button>
            {inSeries ? (
              <>
                <button type="submit" value="one">Nur diesen</button>
                <button type="submit" value="all" className="primary">Alle Termine</button>
              </>
            ) : (
              <button type="submit" className="primary">Speichern</button>
            )}
          </div>
        </div>
      </form>
    </div>,
    document.body,
  );
}


type OpenFn = (e: CalendarEntry, day?: DateStr) => void;

/** Eigene Termine ohne Wiederholung lassen sich ziehen */
const movable = (e: CalendarEntry) => !!e.eventId && !e.recur;

const DRAG_TYPE = 'application/x-antonos-termin';

/** Kleiner roter Punkt für wichtige Termine */
const PrioFlag = ({ e }: { e: CalendarEntry }) => (e.priority === 'hoch' ? <span className="prio-flag" aria-label="wichtig" /> : null);

const entryClass = (base: string, e: CalendarEntry) =>
  `${base} ${e.kind} ${e.priority ? `prio-${e.priority}` : ''} ${e.done ? 'done' : ''} ${e.kind === 'event' && e.color ? 'colored' : ''}`;

const entryTitle = (e: CalendarEntry) => `${e.label} · ${timeRange(e)}${e.location ? `\n📍 ${e.location}` : ''}${e.note ? `\n${e.note}` : ''}`;

function EntryChip({ e, day, onOpen, showTime = true, className = '', style }: {
  e: CalendarEntry;
  day?: DateStr;
  onOpen: OpenFn;
  showTime?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const cls = `${entryClass('cal-item', e)} ${className}`;
  const text = (
    <>
      <PrioFlag e={e} />
      {showTime && e.time && <span className="cal-time">{e.time}</span>}
      <span className="cal-label">{e.label}</span>
    </>
  );
  const full = { ...entryStyle(e), ...style };
  if (e.eventId) {
    return (
      <button
        type="button"
        className={cls}
        style={full}
        title={entryTitle(e)}
        draggable={movable(e) && !!day}
        onDragStart={(ev) => {
          ev.dataTransfer.setData(DRAG_TYPE, `${e.eventId}|${day}`);
          ev.dataTransfer.effectAllowed = 'move';
        }}
        onClick={(ev) => { ev.stopPropagation(); onOpen(e, day); }}
      >
        {text}
      </button>
    );
  }
  return <a className={cls} style={full} href={e.href} title={entryTitle(e)} onClick={(ev) => ev.stopPropagation()}>{text}</a>;
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
/** Unter dieser Breite wird der Kalender kompakt wie auf dem iPhone dargestellt */
const COMPACT_WIDTH = 640;
/** Einträge pro Tag in der Monatsansicht, danach „+n weitere“ */
const MONTH_ITEMS = 4;

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

const FILTER_KEY = 'antonos:kalender-filter';
function loadHidden(): EntryKind[] {
  try {
    const list = JSON.parse(localStorage.getItem(FILTER_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((k) => k in KIND_LABELS) : [];
  } catch {
    return [];
  }
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

/** Kursfarbe für Vorlesungen bzw. eigene Farbe für Termine */
const entryStyle = (e: CalendarEntry) => (e.color ? ({ ['--c' as string]: e.color } as React.CSSProperties) : undefined);

const dotClass = (e: CalendarEntry) => entryClass('cal-dot', e);

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
function DayList({ day, entries, onOpen, onNew, hideEmpty = false }: { day: DateStr; entries: CalendarEntry[]; onOpen: OpenFn; onNew: () => void; hideEmpty?: boolean }) {
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
            const sub = [e.location && `📍 ${e.location}`, e.note].filter(Boolean).join(' · ');
            const body = (
              <>
                <span className={`dl-bar ${dotClass(e)}`} style={entryStyle(e)} aria-hidden />
                <span className="dl-main">
                  <span className={`dl-title ${e.done ? 'done' : ''}`}>
                    <PrioFlag e={e} />
                    {e.label}
                  </span>
                  {sub && <span className="dl-note">{sub}</span>}
                </span>
                <span className="dl-time">
                  {e.time && !isMultiDay(e) ? (
                    <>
                      <span>{e.time}</span>
                      {e.endTime && <span className="muted">{e.endTime}</span>}
                    </>
                  ) : (
                    <span className="muted">{isMultiDay(e) ? `bis ${parseDate(e.end).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}` : 'ganztägig'}</span>
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

/** Mehrtägiger Eintrag als Balken über mehrere Spalten */
function SpanBar({ seg, days, row, colOffset = 0, onOpen }: { seg: ReturnType<typeof spanLanes>['segments'][number]; days: DateStr[]; row: number; colOffset?: number; onOpen: OpenFn }) {
  return (
    <EntryChip
      e={seg.entry}
      day={days[seg.col]}
      onOpen={onOpen}
      showTime={!seg.before}
      className={`cal-bar ${seg.before ? 'before' : ''} ${seg.after ? 'after' : ''}`}
      style={{ gridColumn: `${seg.col + 1 + colOffset} / span ${seg.span}`, gridRow: row }}
    />
  );
}

interface DragState {
  entry: CalendarEntry;
  col: number;
  mode: 'move' | 'resize';
  x0: number;
  y0: number;
  colW: number;
  active: boolean;
  timer?: ReturnType<typeof setTimeout>;
  dayDelta: number;
  minDelta: number;
}

/**
 * Zeitraster für einen oder mehrere Tage: Termine als Blöcke nach Uhrzeit und Dauer,
 * rote Linie für „jetzt“. Eigene Termine lassen sich verschieben (auch auf andere Tage)
 * und an der Unterkante verlängern – am Handy nach kurzem Gedrückthalten.
 */
function Timeline({ days, entries, compact, onOpen, onNew, onPickDay, onMove, onResize }: {
  days: DateStr[];
  entries: CalendarEntry[];
  compact: boolean;
  onOpen: OpenFn;
  onNew: (day: DateStr, time: string) => void;
  onPickDay?: (d: DateStr) => void;
  onMove: (e: CalendarEntry, dayDelta: number, minuteDelta: number) => void;
  onResize: (e: CalendarEntry, minuteDelta: number) => void;
}) {
  const hourH = compact ? 48 : 52;
  const n = days.length;
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  const [preview, setPreview] = useState<{ key: string; mode: 'move' | 'resize'; dayDelta: number; minDelta: number } | null>(null);
  const now = useNowMinutes();
  const t = today();
  const todayCol = days.indexOf(t);
  const columns = days.map((d) => layoutTimed(entries, d));
  const { segments, lanes } = spanLanes(entries, days);
  const singles = days.map((d) => sortEntries(entries.filter((e) => onDay(e, d) && !isTimedOn(e, d) && !isMultiDay(e))));
  const hasAllDay = segments.length > 0 || singles.some((x) => x.length > 0);
  const colLeft = (i: number) => `calc(var(--tl-gutter) + (100% - var(--tl-gutter)) * ${i / n})`;
  const colWidth = `calc((100% - var(--tl-gutter)) / ${n})`;

  // Beim Öffnen zur aktuellen Uhrzeit (heute) bzw. zum ersten Termin oder 8 Uhr scrollen
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const first = Math.min(...columns.map((c) => (c.length ? c[0].start : Infinity)));
    const target = todayCol >= 0 ? now - 90 : Number.isFinite(first) ? first - 30 : 8 * 60;
    el.scrollTop = Math.max(0, (target / 60) * hourH);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.join()]);

  // Während des Ziehens am Handy nicht scrollen
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const block = (ev: TouchEvent) => {
      if (drag.current?.active) ev.preventDefault();
    };
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, []);

  const startDrag = (ev: React.PointerEvent, entry: CalendarEntry, col: number, mode: 'move' | 'resize') => {
    if (!movable(entry) || ev.button > 0) return;
    ev.stopPropagation();
    const rect = canvas.current!.getBoundingClientRect();
    const gutter = parseFloat(getComputedStyle(canvas.current!).getPropertyValue('--tl-gutter')) || 52;
    const state: DragState = { entry, col, mode, x0: ev.clientX, y0: ev.clientY, colW: (rect.width - gutter) / n, active: ev.pointerType !== 'touch', dayDelta: 0, minDelta: 0 };
    if (!state.active) {
      state.timer = setTimeout(() => {
        state.active = true;
        navigator.vibrate?.(10);
        setPreview({ key: entry.key, mode, dayDelta: 0, minDelta: 0 });
      }, 350);
    }
    drag.current = state;
    (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
  };

  const moveDrag = (ev: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = ev.clientX - d.x0;
    const dy = ev.clientY - d.y0;
    if (!d.active) {
      // Bewegt, bevor das Gedrückthalten erkannt wurde: das ist Scrollen
      if (Math.hypot(dx, dy) > 8) {
        clearTimeout(d.timer);
        drag.current = null;
      }
      return;
    }
    d.minDelta = Math.round((dy / hourH) * 4) * 15;
    d.dayDelta = d.mode === 'move' ? Math.max(-d.col, Math.min(n - 1 - d.col, Math.round(dx / d.colW))) : 0;
    setPreview({ key: d.entry.key, mode: d.mode, dayDelta: d.dayDelta, minDelta: d.minDelta });
  };

  /** Den Klick direkt nach dem Loslassen nicht als „Öffnen“ werten */
  const swallowClick = () => {
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 50);
  };

  const endDrag = (cancel = false) => {
    const d = drag.current;
    drag.current = null;
    setPreview(null);
    if (!d) return;
    clearTimeout(d.timer);
    if (cancel || !d.active || (!d.dayDelta && !d.minDelta)) {
      // Langes Drücken ohne Bewegung öffnet nicht noch zusätzlich das Fenster
      if (d.active && d.timer) swallowClick();
      return;
    }
    swallowClick();
    if (d.mode === 'move') onMove(d.entry, d.dayDelta, d.minDelta);
    else onResize(d.entry, d.minDelta);
  };

  const dragHandlers = { onPointerMove: moveDrag, onPointerUp: () => endDrag(), onPointerCancel: () => endDrag(true) };

  return (
    <div className={`timeline-wrap ${n > 1 ? 'multi' : ''}`} style={{ ['--cols' as string]: n } as React.CSSProperties}>
      {n > 1 && (
        <div className="tl-heads">
          <span />
          {days.map((d, i) => (
            <button key={d} type="button" className={`tl-head ${d === t ? 'today' : ''} ${i >= 5 ? 'weekend' : ''}`} onClick={() => onPickDay?.(d)} title="Als Tag anzeigen">
              <span>{WEEKDAYS[(parseDate(d).getDay() + 6) % 7]}</span>
              <strong>{Number(d.slice(8))}</strong>
            </button>
          ))}
        </div>
      )}
      {hasAllDay && (
        <div className="tl-allday" style={{ gridTemplateRows: `repeat(${lanes + 1}, auto)` }}>
          <span className="tl-allday-label" style={{ gridRow: `1 / span ${lanes + 1}` }}>ganztägig</span>
          {segments.map((seg) => <SpanBar key={`${seg.entry.key}-${seg.col}`} seg={seg} days={days} row={seg.lane + 1} colOffset={1} onOpen={onOpen} />)}
          {singles.map((list, i) => (
            <div key={days[i]} className="tl-allday-items" style={{ gridColumn: i + 2, gridRow: lanes + 1 }}>
              {list.map((e) => <EntryChip key={e.key} e={e} day={days[i]} onOpen={onOpen} />)}
            </div>
          ))}
        </div>
      )}
      <div className="timeline" ref={scroller}>
        <div
          className="tl-canvas"
          ref={canvas}
          style={{ height: 24 * hourH }}
          onClick={(ev) => {
            const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
            const gutter = parseFloat(getComputedStyle(ev.currentTarget).getPropertyValue('--tl-gutter')) || 52;
            const x = ev.clientX - rect.left - gutter;
            if (x < 0) return;
            const col = Math.min(n - 1, Math.floor(x / ((rect.width - gutter) / n)));
            const half = Math.min(47, Math.max(0, Math.floor(((ev.clientY - rect.top) / hourH) * 2)));
            onNew(days[col], fromMin(half * 30));
          }}
          title="Klicken für neuen Termin"
        >
          {HOURS.map((h) => (
            <div key={h} className="tl-hour" style={{ top: h * hourH }}>
              <span>{String(h).padStart(2, '0')}:00</span>
            </div>
          ))}
          {n > 1 && days.map((d, i) => <div key={d} className={`tl-col ${i >= 5 ? 'weekend' : ''} ${d === t ? 'today' : ''}`} style={{ left: colLeft(i), width: colWidth }} aria-hidden />)}
          {columns.map((blocks, i) =>
            blocks.map((b) => {
              const e = b.entry;
              const p = preview?.key === e.key ? preview : null;
              const start = b.start + (p?.mode === 'move' ? p.minDelta : 0);
              const end = Math.max(start + 15, b.end + (p ? p.minDelta : 0));
              const col = i + (p?.dayDelta ?? 0);
              const height = Math.max(22, ((end - start) / 60) * hourH - 2);
              const style = {
                ...entryStyle(e),
                top: (start / 60) * hourH + 1,
                height,
                left: `calc(${colLeft(col)} + ${colWidth} * ${b.col / b.cols} + 1px)`,
                width: `calc(${colWidth} / ${b.cols} - 4px)`,
              };
              const range = p ? `${fromMin(Math.max(0, start))}–${fromMin(Math.min(end, 24 * 60 - 1))}` : timeRange(e);
              const inner = (
                <>
                  <strong><PrioFlag e={e} />{e.label}</strong>
                  {height > 34 && <span>{range}</span>}
                  {height > 54 && (e.location || e.note) && <span className="tl-note">{e.location ? `📍 ${e.location}` : e.note}</span>}
                  {movable(e) && <span className="tl-resize" aria-hidden onPointerDown={(ev) => startDrag(ev, e, i, 'resize')} onClick={(ev) => ev.stopPropagation()} {...dragHandlers} />}
                </>
              );
              const cls = `${entryClass('tl-event', e)} ${p ? 'dragging' : ''} ${movable(e) ? 'movable' : ''}`;
              return e.eventId ? (
                <button
                  key={e.key}
                  type="button"
                  className={cls}
                  style={style}
                  onPointerDown={(ev) => startDrag(ev, e, i, 'move')}
                  {...dragHandlers}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (suppressClick.current) return;
                    onOpen(e, days[i]);
                  }}
                  title={entryTitle(e)}
                >
                  {inner}
                </button>
              ) : (
                <a key={e.key} className={cls} style={style} href={e.href} onClick={(ev) => ev.stopPropagation()} title={entryTitle(e)}>
                  {inner}
                </a>
              );
            }),
          )}
          {todayCol >= 0 && (
            <div className="tl-now" style={{ top: (now / 60) * hourH, left: colLeft(todayCol), width: colWidth }} aria-label="Jetzt">
              <span>{fromMin(now)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Eine Zeile der Monatsansicht: Tage, mehrtägige Balken und einzelne Einträge. */
function MonthWeek({ days, anchor, entries, onOpen, onNew, onPickDay, onDropOn }: {
  days: DateStr[];
  anchor: DateStr;
  entries: CalendarEntry[];
  onOpen: OpenFn;
  onNew: (d: DateStr) => void;
  onPickDay: (d: DateStr) => void;
  onDropOn: (eventId: string, from: DateStr, to: DateStr) => void;
}) {
  const t = today();
  const { segments, lanes } = spanLanes(entries, days);
  const shownLanes = Math.min(lanes, MONTH_ITEMS - 1);
  const [over, setOver] = useState<DateStr | null>(null);
  return (
    <div className="cal-mweek" style={{ gridTemplateRows: `26px ${'22px '.repeat(shownLanes)}1fr` }}>
      {days.map((d, i) => (
        <div
          key={d}
          className={`cal-day ${monthKey(d) !== monthKey(anchor) ? 'other' : ''} ${d === t ? 'today' : ''} ${i >= 5 ? 'weekend' : ''} ${over === d ? 'drop' : ''}`}
          style={{ gridColumn: i + 1, gridRow: '1 / -1' }}
          onClick={() => onNew(d)}
          onDragOver={(ev) => {
            if (!ev.dataTransfer.types.includes(DRAG_TYPE)) return;
            ev.preventDefault();
            setOver(d);
          }}
          onDragLeave={() => setOver((x) => (x === d ? null : x))}
          onDrop={(ev) => {
            setOver(null);
            const [id, from] = ev.dataTransfer.getData(DRAG_TYPE).split('|');
            if (id && from) onDropOn(id, from, d);
          }}
          title={`${formatDate(d)} – klicken für neuen Termin`}
        >
          <div className="cal-day-top">
            {i === 0 && <span className="cal-kw">KW {isoWeek(parseDate(d))}</span>}
            <button type="button" className="cal-num" onClick={(ev) => { ev.stopPropagation(); onPickDay(d); }} aria-label={`${formatDate(d)} als Tag anzeigen`}>
              {Number(d.slice(8))}
            </button>
          </div>
        </div>
      ))}
      {segments.filter((s) => s.lane < shownLanes).map((seg) => <SpanBar key={`${seg.entry.key}-${seg.col}`} seg={seg} days={days} row={seg.lane + 2} onOpen={onOpen} />)}
      {days.map((d, i) => {
        const items = sortEntries(entries.filter((e) => onDay(e, d) && !isMultiDay(e)));
        const hiddenBars = segments.filter((s) => s.lane >= shownLanes && s.col <= i && i < s.col + s.span).length;
        const room = Math.max(1, MONTH_ITEMS - shownLanes);
        const more = Math.max(0, items.length - room) + hiddenBars;
        return (
          <div key={d} className="cal-day-items" style={{ gridColumn: i + 1, gridRow: shownLanes + 2 }}>
            {items.slice(0, room).map((e) => <EntryChip key={e.key} e={e} day={d} onOpen={onOpen} />)}
            {more > 0 && (
              <button type="button" className="cal-more" onClick={(ev) => { ev.stopPropagation(); onPickDay(d); }}>
                +{more} weitere
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Filterleiste: Arten von Einträgen ein- und ausblenden */
function KindFilter({ hidden, onToggle }: { hidden: EntryKind[]; onToggle: (k: EntryKind) => void }) {
  return (
    <div className="cal-filter" role="group" aria-label="Einträge filtern">
      {(Object.keys(KIND_LABELS) as EntryKind[]).map((k) => (
        <button key={k} type="button" aria-pressed={!hidden.includes(k)} className={`cal-filter-chip ${hidden.includes(k) ? 'off' : ''}`} onClick={() => onToggle(k)}>
          <span className={`cal-dot ${k}`} aria-hidden />
          {KIND_LABELS[k]}
        </button>
      ))}
    </div>
  );
}

/** Kalender mit Tages-, Wochen- und Monatsansicht und eigenen Terminen. `remember` = eigene Seite (Ansicht merken, Tastenkürzel). */
export function CalendarView({ defaultMode = 'monat', remember = false }: { defaultMode?: CalendarMode; remember?: boolean }) {
  const { data, add, update } = useStore();
  const { show } = useToast();
  const t = today();
  const [mode, setModeState] = useState<CalendarMode>(() => (remember ? loadMode(defaultMode) : defaultMode));
  const [anchor, setAnchor] = useState(t);
  const [modal, setModal] = useState<{ initial: Draft; eventId?: string; occurrence?: DateStr } | null>(null);
  const [hidden, setHidden] = useState<EntryKind[]>(loadHidden);
  const [quick, setQuick] = useState('');
  const all = useCalendarEntries();
  const entries = all.filter((e) => !hidden.includes(e.kind));
  const [rootRef, width] = useWidth();
  const compact = width < COMPACT_WIDTH;
  const bodyRef = useRef<HTMLDivElement>(null);

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
  const toggleKind = (k: EntryKind) => {
    const next = hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k];
    setHidden(next);
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(next));
    } catch {
      // Filter gilt dann nur bis zum Neuladen
    }
  };
  /** Tag für neue Termine: im Monat der heutige Tag, falls der Monat gerade sichtbar ist */
  const newDay = mode === 'monat' && monthKey(anchor) === monthKey(t) ? t : anchor;
  const openNew = (date: DateStr, time = '') => setModal({ initial: { ...blank(date), startTime: time } });
  const openEntry = (e: CalendarEntry, day?: DateStr) => {
    const ev = data.events.find((x) => x.id === e.eventId);
    if (ev) setModal({ initial: { ...ev }, eventId: ev.id, occurrence: day });
  };
  const goDay = (d: DateStr) => {
    setAnchor(d);
    setMode('tag');
  };
  const move = (eventId: string, dayDelta: number, minuteDelta = 0) => {
    const ev = data.events.find((x) => x.id === eventId);
    if (!ev || ev.repeat) return;
    const before = { start: ev.start, end: ev.end, startTime: ev.startTime, endTime: ev.endTime };
    update('events', eventId, moveEvent(ev, dayDelta, minuteDelta));
    show(`„${ev.title}“ verschoben`, { label: 'Widerrufen', run: () => update('events', eventId, before) });
  };
  const resize = (eventId: string, minuteDelta: number) => {
    const ev = data.events.find((x) => x.id === eventId);
    if (!ev || ev.repeat) return;
    const before = { end: ev.end, endTime: ev.endTime };
    update('events', eventId, resizeEvent(ev, minuteDelta));
    show(`„${ev.title}“ geändert`, { label: 'Widerrufen', run: () => update('events', eventId, before) });
  };

  const submitQuick = (ev: React.FormEvent) => {
    ev.preventDefault();
    const q = parseEventQuickAdd(quick, t, newDay);
    if (!q.title) return;
    const id = add('events', {
      ...blank(q.start),
      title: q.title,
      end: q.end,
      startTime: q.startTime,
      endTime: q.startTime ? q.endTime : '',
      priority: q.priority ?? 'mittel',
      location: q.location,
      repeat: q.repeat ? { freq: q.repeat, until: null, except: [] } : null,
    });
    setQuick('');
    setAnchor(q.start);
    const when = `${parseDate(q.start).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })}${q.startTime ? ` ${q.startTime}` : ''}`;
    show(`„${q.title}“ am ${when} eingetragen`, {
      label: 'Bearbeiten',
      run: () => setModal({ initial: { ...blank(q.start), title: q.title, end: q.end, startTime: q.startTime, endTime: q.startTime ? q.endTime : '', priority: q.priority ?? 'mittel', location: q.location, repeat: q.repeat ? { freq: q.repeat, until: null, except: [] } : null }, eventId: id }),
    });
  };

  // Pfeiltasten blättern, T = heute, N = neuer Termin, D/W/M = Ansicht (nur auf der Kalenderseite)
  const keyRef = useRef({ mode, anchor, modal, newDay });
  keyRef.current = { mode, anchor, modal, newDay };
  useEffect(() => {
    if (!remember) return;
    const onKey = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement | null;
      if (ev.metaKey || ev.ctrlKey || ev.altKey || keyRef.current.modal) return;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const k = ev.key.toLowerCase();
      if (ev.key === 'ArrowLeft') goRef.current(-1);
      else if (ev.key === 'ArrowRight') goRef.current(1);
      else if (k === 't') goTodayRef.current();
      else if (k === 'n') openNew(keyRef.current.newDay);
      else if (k === 'd') setMode('tag');
      else if (k === 'w') setMode('woche');
      else if (k === 'm') setMode('monat');
      else return;
      ev.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remember]);

  // Blättern mit Übergang: alte Ansicht gleitet hinaus, neue von der Gegenseite herein
  const navRef = useRef({ mode, anchor });
  navRef.current = { mode, anchor };
  const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const slideIn = (dir: -1 | 1, from = 0.3) => {
    const el = bodyRef.current;
    if (!el || reduceMotion() || !el.animate) return;
    const w = el.getBoundingClientRect().width;
    el.animate(
      [{ transform: `translateX(${dir * w * from}px)`, opacity: 0.35 }, { transform: 'translateX(0)', opacity: 1 }],
      { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  };
  const goTo = (next: DateStr, dir: -1 | 1) => {
    setAnchor(next);
    slideIn(dir);
  };
  const go = (dir: -1 | 1) => goTo(shiftAnchor(navRef.current.mode, navRef.current.anchor, dir), dir);
  const goToday = () => {
    const a = navRef.current.anchor;
    if (a === today()) return;
    goTo(today(), today() > a ? 1 : -1);
  };
  const goRef = useRef(go);
  goRef.current = go;
  const goTodayRef = useRef(goToday);
  goTodayRef.current = goToday;

  // Wischen: die Ansicht folgt dem Finger und gleitet beim Loslassen weiter (nicht beim Ziehen von Terminen)
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    let start: { x: number; y: number; at: number } | null = null;
    let axis: 'x' | 'y' | null = null;
    let dx = 0;
    const reset = (animate: boolean) => {
      if (animate && el.animate && !reduceMotion()) {
        el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }], { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      }
      el.style.transform = '';
    };
    const onStart = (ev: TouchEvent) => {
      const target = ev.target as HTMLElement;
      if (ev.touches.length !== 1 || target.closest('.tl-event, input, textarea, .cal-filter')) {
        start = null;
        return;
      }
      start = { x: ev.touches[0].clientX, y: ev.touches[0].clientY, at: Date.now() };
      axis = null;
      dx = 0;
    };
    const onMove = (ev: TouchEvent) => {
      if (!start) return;
      const x = ev.touches[0].clientX - start.x;
      const y = ev.touches[0].clientY - start.y;
      if (!axis) {
        if (Math.hypot(x, y) < 8) return;
        axis = Math.abs(x) > Math.abs(y) * 1.2 ? 'x' : 'y';
      }
      if (axis !== 'x') return;
      ev.preventDefault();
      dx = x;
      el.style.transform = `translateX(${x}px)`;
    };
    const onEnd = () => {
      if (!start || axis !== 'x') {
        start = null;
        return;
      }
      const velocity = Math.abs(dx) / Math.max(1, Date.now() - start.at);
      start = null;
      const w = el.getBoundingClientRect().width;
      if (Math.abs(dx) < w * 0.22 && velocity < 0.45) {
        reset(true);
        return;
      }
      const dir: -1 | 1 = dx < 0 ? 1 : -1;
      if (!el.animate || reduceMotion()) {
        reset(false);
        goRef.current(dir);
        return;
      }
      const out = el.animate([{ transform: `translateX(${dx}px)`, opacity: 1 }, { transform: `translateX(${-dir * w}px)`, opacity: 0.2 }], {
        duration: Math.max(90, Math.min(200, ((w - Math.abs(dx)) / Math.max(velocity, 1.2)) | 0)),
        easing: 'cubic-bezier(0.4, 0, 1, 1)',
        fill: 'forwards',
      });
      out.onfinish = () => {
        el.style.transform = '';
        goRef.current(dir);
        out.cancel();
      };
    };
    const onCancel = () => {
      if (start && axis === 'x') reset(true);
      start = null;
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onCancel);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const quickAdd = (
    <form className="cal-quick" onSubmit={submitQuick}>
      <input
        value={quick}
        onChange={(x) => setQuick(x.target.value)}
        placeholder="Schnell eintragen: „Lerngruppe morgen 14-16 Uhr @Bibliothek“"
        aria-label="Termin schnell eintragen"
        enterKeyHint="done"
      />
    </form>
  );

  const timelineProps = {
    entries,
    compact,
    onOpen: openEntry,
    onNew: (d: DateStr, time: string) => openNew(d, time),
    onPickDay: goDay,
    onMove: (e: CalendarEntry, dd: number, dm: number) => e.eventId && move(e.eventId, dd, dm),
    onResize: (e: CalendarEntry, dm: number) => e.eventId && resize(e.eventId, dm),
  };

  const grid = monthGrid(parseDate(anchor).getFullYear(), parseDate(anchor).getMonth());
  const weeks = Array.from({ length: grid.length / 7 }, (_, i) => grid.slice(i * 7, i * 7 + 7));

  return (
    <div className={`calendar ${compact ? 'compact' : ''}`} ref={rootRef}>
      {compact ? (
        <div className="cal-toolbar-compact">
          <div className="row between">
            <div className="row">
              <button className="icon cal-arrow" onClick={() => go(-1)} aria-label="Zurück">‹</button>
              <strong className="cal-big-title">{title}</strong>
              <button className="icon cal-arrow" onClick={() => go(1)} aria-label="Weiter">›</button>
            </div>
            <div className="row">
              <button className="cal-today" onClick={goToday}>Heute</button>
              <button className="cal-plus" onClick={() => openNew(anchor)} aria-label="Neuer Termin">+</button>
            </div>
          </div>
          {segmented}
          {quickAdd}
        </div>
      ) : (
        <>
          <div className="cal-toolbar">
            <div className="row">
              <button onClick={() => go(-1)} aria-label="Zurück" title="Zurück (←)">‹</button>
              <button onClick={goToday} title="Heute (T)">Heute</button>
              <button onClick={() => go(1)} aria-label="Weiter" title="Weiter (→)">›</button>
              <strong className="cal-title">{title}</strong>
            </div>
            <div className="row">
              {segmented}
              <button className="primary" onClick={() => openNew(newDay)} title="Neuer Termin (N)">+ Termin</button>
            </div>
          </div>
          {quickAdd}
        </>
      )}

      <KindFilter hidden={hidden} onToggle={toggleKind} />

      <div className="cal-body" ref={bodyRef}>

      {mode === 'monat' && compact && (
        <>
          <div className="mini-month">
            {WEEKDAYS.map((d) => <span key={d} className="mm-head">{d.slice(0, 1)}</span>)}
            {grid.map((d) => {
              const items = sortEntries(entries.filter((e) => onDay(e, d)));
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
        <div className="cal-month">
          <div className="cal-heads">
            {WEEKDAYS.map((d, i) => <div key={d} className={`cal-head ${i >= 5 ? 'weekend' : ''}`}>{d}</div>)}
          </div>
          {weeks.map((days) => (
            <MonthWeek
              key={days[0]}
              days={days}
              anchor={anchor}
              entries={entries}
              onOpen={openEntry}
              onNew={(d) => openNew(d)}
              onPickDay={goDay}
              onDropOn={(id, from, to) => from !== to && move(id, daysBetween(from, to))}
            />
          ))}
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

      {mode === 'woche' && !compact && <Timeline days={weekDays(anchor)} {...timelineProps} />}

      {mode === 'tag' && (
        <>
          {compact && (
            <>
              <WeekStrip anchor={anchor} entries={entries} onPick={setAnchor} />
              <p className="tl-date">{parseDate(anchor).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </>
          )}
          <Timeline days={[anchor]} {...timelineProps} />
        </>
      )}

      </div>

      {modal && <EventModal initial={modal.initial} eventId={modal.eventId} occurrence={modal.occurrence} onClose={() => setModal(null)} />}
    </div>
  );
}
