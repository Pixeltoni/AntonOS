import { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { CalEvent, DateStr, EventPriority } from '../types';
import { formatDate, isoWeek, parseDate, today } from '../lib/dates';
import { monthGrid, monthKey } from '../lib/life';
import { onDay, rangeLabel, shiftAnchor, sortEntries, timeRange, validateEvent, weekDays, type CalendarEntry, type CalendarMode } from '../lib/calendar';

export const PRIORITIES: { value: EventPriority; label: string }[] = [
  { value: 'niedrig', label: 'Niedrig' },
  { value: 'mittel', label: 'Mittel' },
  { value: 'hoch', label: 'Hoch' },
];

/** Alle Einträge für den Kalender: eigene Termine plus Fristen aus anderen Bereichen. */
export function useCalendarEntries(): CalendarEntry[] {
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
    })),
    ...data.tasks.filter((t) => t.due).map((t) => ({ key: `t-${t.id}`, ...single(t.due!), time: '', label: t.title, kind: 'task' as const, href: '#/aufgaben', done: t.status === 'erledigt' })),
    ...data.exams.map((e) => ({ key: `x-${e.id}`, ...single(e.date), time: e.time, label: e.title, kind: 'exam' as const, href: '#/pruefungen' })),
    ...data.projects.filter((p) => p.due).map((p) => ({ key: `p-${p.id}`, ...single(p.due!), time: '', label: p.title, kind: 'project' as const, href: `#/projekte/${p.id}`, done: p.status === 'abgeschlossen' })),
    ...data.workouts.map((w) => ({ key: `w-${w.id}`, ...single(w.date), time: '', label: w.title, kind: 'workout' as const, href: '#/training', done: w.done })),
  ];
}

type Draft = Omit<CalEvent, 'id'>;
const blank = (date: DateStr): Draft => ({ title: '', note: '', start: date, end: null, startTime: '', endTime: '', priority: 'mittel' });

/** Fenster zum Anlegen und Bearbeiten eines Termins. */
export function EventModal({ initial, eventId, onClose }: { initial: Draft; eventId?: string; onClose: () => void }) {
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
    const final: Draft = {
      ...e,
      title: e.title.trim(),
      note: e.note.trim(),
      end: multiDay && e.end && e.end !== e.start ? e.end : null,
      startTime: allDay ? '' : e.startTime,
      endTime: allDay ? '' : e.endTime,
    };
    const problem = validateEvent(final);
    if (problem) {
      setError(problem);
      return;
    }
    if (eventId) update('events', eventId, final);
    else add('events', final);
    onClose();
  };

  return (
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
            <button type="button" className="danger" onClick={() => { if (confirm('Termin löschen?')) { remove('events', eventId); onClose(); } }}>
              Löschen
            </button>
          ) : <span />}
          <div className="row">
            <button type="button" onClick={onClose}>Abbrechen</button>
            <button type="submit" className="primary">Speichern</button>
          </div>
        </div>
      </form>
    </div>
  );
}

function EntryChip({ e, onOpen, showTime = true }: { e: CalendarEntry; onOpen: (e: CalendarEntry) => void; showTime?: boolean }) {
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
      <button type="button" className={cls} title={title} onClick={(ev) => { ev.stopPropagation(); onOpen(e); }}>
        {text}
      </button>
    );
  }
  return <a className={cls} href={e.href} title={title} onClick={(ev) => ev.stopPropagation()}>{text}</a>;
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

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

/** Kalender mit Tages-, Wochen- und Monatsansicht und eigenen Terminen. */
export function CalendarView({ defaultMode = 'monat', remember = false }: { defaultMode?: CalendarMode; remember?: boolean }) {
  const { data } = useStore();
  const t = today();
  const [mode, setModeState] = useState<CalendarMode>(() => (remember ? loadMode(defaultMode) : defaultMode));
  const [anchor, setAnchor] = useState(t);
  const [modal, setModal] = useState<{ initial: Draft; eventId?: string } | null>(null);
  const entries = useCalendarEntries();

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
  const openEntry = (e: CalendarEntry) => {
    const ev = data.events.find((x) => x.id === e.eventId);
    if (ev) setModal({ initial: { ...ev }, eventId: ev.id });
  };
  const goDay = (d: DateStr) => {
    setAnchor(d);
    setMode('tag');
  };
  const dayEntries = (d: DateStr) => sortEntries(entries.filter((e) => onDay(e, d)));

  return (
    <div className="calendar">
      <div className="cal-toolbar">
        <div className="row">
          <button onClick={() => setAnchor(shiftAnchor(mode, anchor, -1))} aria-label="Zurück">‹</button>
          <button onClick={() => setAnchor(t)}>Heute</button>
          <button onClick={() => setAnchor(shiftAnchor(mode, anchor, 1))} aria-label="Weiter">›</button>
          <strong className="cal-title">{rangeLabel(mode, anchor, isoWeek)}</strong>
        </div>
        <div className="row">
          <div className="segmented" role="radiogroup" aria-label="Ansicht">
            {(['tag', 'woche', 'monat'] as CalendarMode[]).map((m) => (
              <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'selected' : ''} onClick={() => setMode(m)}>
                {m === 'tag' ? 'Tag' : m === 'woche' ? 'Woche' : 'Monat'}
              </button>
            ))}
          </div>
          <button className="primary" onClick={() => openNew(mode === 'monat' && monthKey(anchor) !== monthKey(t) ? anchor : mode === 'monat' ? t : anchor)}>
            + Termin
          </button>
        </div>
      </div>

      {mode === 'monat' && (
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
                {items.slice(0, 3).map((e) => <EntryChip key={e.key} e={e} onOpen={openEntry} />)}
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

      {mode === 'woche' && (
        <div className="cal-week">
          {weekDays(anchor).map((d, i) => (
            <div key={d} className={`cal-week-day ${d === t ? 'today' : ''}`} onClick={() => openNew(d)}>
              <button type="button" className="cal-week-head" onClick={(ev) => { ev.stopPropagation(); goDay(d); }}>
                <span>{WEEKDAYS[i]}</span>
                <strong>{parseDate(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</strong>
              </button>
              <div className="cal-week-items">
                {dayEntries(d).map((e) => <EntryChip key={e.key} e={e} onOpen={openEntry} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {mode === 'tag' && (() => {
        const items = dayEntries(anchor);
        const allDay = items.filter((e) => !e.time);
        return (
          <div className="cal-dayview">
            <div className="cal-allday">
              <span className="small muted">Ganztägig</span>
              <div className="col">
                {allDay.length === 0 ? <span className="muted small">–</span> : allDay.map((e) => <EntryChip key={e.key} e={e} onOpen={openEntry} />)}
              </div>
            </div>
            <div className="cal-hours">
              {HOURS.map((h) => {
                const hh = String(h).padStart(2, '0');
                const inHour = items.filter((e) => e.time && e.time.slice(0, 2) === hh);
                return (
                  <div key={h} className="cal-hour" onClick={() => openNew(anchor, `${hh}:00`)} title={`Neuer Termin um ${hh}:00`}>
                    <span className="cal-hour-label">{hh}:00</span>
                    <div className="cal-hour-items">
                      {inHour.map((e) => (
                        <div key={e.key} className="cal-hour-entry">
                          <EntryChip e={e} onOpen={openEntry} showTime={false} />
                          <span className="small muted">{timeRange(e)}{e.note ? ` · ${e.note}` : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <div className="row wrap small muted cal-legend">
        <span className="cal-item event prio-hoch">Termin: hoch</span>
        <span className="cal-item event prio-mittel">mittel</span>
        <span className="cal-item event prio-niedrig">niedrig</span>
        <span className="cal-item task">Aufgabe</span>
        <span className="cal-item exam">Prüfung</span>
        <span className="cal-item project">Projekt</span>
        <span className="cal-item workout">Training</span>
      </div>

      {modal && <EventModal initial={modal.initial} eventId={modal.eventId} onClose={() => setModal(null)} />}
    </div>
  );
}
