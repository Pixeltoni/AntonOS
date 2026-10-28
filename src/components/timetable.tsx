import { useState } from 'react';
import { useStore, newId } from '../store';
import type { Course, CourseSlot } from '../types';
import { defaultSemester } from '../demo';
import { guessSemesterStart, nextOccurrence, slotSeries, WEEKDAY_NAMES } from '../lib/recurrence';
import { parseDate, today } from '../lib/dates';
import { Empty } from './ui';
import { askNotifications } from '../lib/notify';

export const SLOT_KINDS = ['Vorlesung', 'Übung', 'Tutorium', 'Seminar', 'Praktikum'];
const SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Zeiten eines Kurses bearbeiten (auf der Kursseite) */
export function CourseSlots({ course }: { course: Course }) {
  const { data, update } = useStore();
  const t = today();
  const series = slotSeries([course], data.settings.semester ?? defaultSemester(), guessSemesterStart(t));
  const next = (s: CourseSlot) => {
    const x = series.find((y) => y.slot.id === s.id);
    return x ? nextOccurrence(x.rule, x.start, t) : null;
  };
  const short = (d: string) => parseDate(d).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
  const slots = [...(course.slots ?? [])].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
  const [draft, setDraft] = useState<Omit<CourseSlot, 'id'>>({ day: 1, start: '08:15', end: '09:45', room: course.room, kind: 'Vorlesung', every: 1 });
  const [error, setError] = useState('');
  const save = (list: CourseSlot[]) => update('courses', course.id, { slots: list });

  return (
    <div className="col">
      {slots.length === 0 ? <Empty>Noch keine festen Zeiten. Trag sie einmal ein – sie erscheinen dann jede Woche im Kalender.</Empty> : (
        <ul className="list dense">
          {slots.map((s) => {
            const n = next(s);
            return (
            <li key={s.id} className="slot-row">
              <span className="slot-day" style={{ background: course.color }}>{SHORT[s.day - 1]}</span>
              <span className="grow">
                <strong>{s.start}–{s.end}</strong> · {s.kind}{s.room && ` · ${s.room}`}
                {s.every === 2 && <span className="muted small"> · alle 2 Wochen</span>}
                <br />
                <span className="muted small">
                  {n ? `Nächster Termin: ${short(n)}` : 'Keine weiteren Termine im Semester'}
                  {(s.except?.length ?? 0) > 0 && (
                    <>
                      {' · fällt aus: '}{s.except!.map(short).join(', ')}{' '}
                      <button type="button" className="link" onClick={() => save(slots.map((x) => (x.id === s.id ? { ...x, except: [] } : x)))}>zurücknehmen</button>
                    </>
                  )}
                </span>
              </span>
              {n && (
                <button type="button" className="small" onClick={() => save(slots.map((x) => (x.id === s.id ? { ...x, except: [...(x.except ?? []), n] } : x)))} title={`Termin am ${short(n)} fällt aus`}>
                  Fällt aus
                </button>
              )}
              <button className="icon" onClick={() => confirm('Diese Zeit entfernen?') && save(slots.filter((x) => x.id !== s.id))} aria-label="Zeit entfernen" title="Entfernen">×</button>
            </li>
            );
          })}
        </ul>
      )}
      <form
        className="inline-form slot-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.start || !draft.end || draft.end <= draft.start) {
            setError('Die Endzeit muss nach der Startzeit liegen.');
            return;
          }
          setError('');
          save([...slots, { ...draft, id: newId(), room: draft.room.trim(), from: draft.every === 2 ? draft.from : undefined }]);
        }}
      >
        <select value={draft.day} onChange={(e) => setDraft({ ...draft, day: Number(e.target.value) })} aria-label="Wochentag">
          {WEEKDAY_NAMES.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
        </select>
        <input type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} aria-label="Beginn" required />
        <input type="time" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} aria-label="Ende" required />
        <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} aria-label="Art">
          {SLOT_KINDS.map((k) => <option key={k}>{k}</option>)}
        </select>
        <input className="narrow" placeholder="Raum" value={draft.room} onChange={(e) => setDraft({ ...draft, room: e.target.value })} aria-label="Raum" />
        <select value={draft.every} onChange={(e) => setDraft({ ...draft, every: Number(e.target.value) as 1 | 2 })} aria-label="Rhythmus">
          <option value={1}>jede Woche</option>
          <option value={2}>alle 2 Wochen</option>
        </select>
        {draft.every === 2 && (
          <label className="row small">
            erster Termin
            <input type="date" value={draft.from ?? ''} onChange={(e) => setDraft({ ...draft, from: e.target.value || undefined })} aria-label="Erster Termin" />
          </label>
        )}
        <button type="submit">+ Zeit</button>
      </form>
      {error && <p className="danger small">{error}</p>}
      <p className="muted small">Fällt eine Vorlesung aus, tippe bei der Zeit auf „Fällt aus“ – sie verschwindet dann für diesen Tag aus dem Kalender.</p>
    </div>
  );
}

/** Wochenübersicht aller Kurszeiten (Mo–Fr, Sa/So nur wenn belegt) */
export function Timetable() {
  const { data } = useStore();
  const entries = data.courses.flatMap((c) => (c.slots ?? []).map((s) => ({ c, s })));
  if (entries.length === 0) return <Empty>Noch kein Stundenplan. Öffne einen Kurs und trag dort seine Zeiten ein.</Empty>;
  const days = entries.some((x) => x.s.day >= 6) ? 7 : 5;
  const from = Math.floor(Math.min(...entries.map((x) => minutes(x.s.start))) / 60) * 60;
  const to = Math.ceil(Math.max(...entries.map((x) => minutes(x.s.end))) / 60) * 60;
  const hourH = 44;
  const height = ((to - from) / 60) * hourH;
  const nowDay = ((new Date().getDay() + 6) % 7) + 1;
  const now = new Date().getHours() * 60 + new Date().getMinutes();

  return (
    <div className="timetable" style={{ ['--days' as string]: days }}>
      <div className="tt-head">
        <span />
        {SHORT.slice(0, days).map((d, i) => <span key={d} className={i + 1 === nowDay ? 'today' : ''}>{d}</span>)}
      </div>
      <div className="tt-body" style={{ height }}>
        <div className="tt-hours">
          {Array.from({ length: (to - from) / 60 }, (_, i) => (
            <span key={i} style={{ top: i * hourH }}>{String(from / 60 + i).padStart(2, '0')}:00</span>
          ))}
        </div>
        {Array.from({ length: days }, (_, d) => (
          <div key={d} className="tt-col">
            {entries.filter((x) => x.s.day === d + 1).map(({ c, s }) => (
              <a
                key={s.id}
                href={`#/kurse/${c.id}`}
                className="tt-slot"
                style={{ top: ((minutes(s.start) - from) / 60) * hourH, height: Math.max(26, ((minutes(s.end) - minutes(s.start)) / 60) * hourH - 3), ['--c' as string]: c.color }}
                title={`${c.name} · ${s.kind} · ${s.start}–${s.end}${s.room ? ` · ${s.room}` : ''}`}
              >
                <strong>{c.code || c.name}</strong>
                <span>{s.kind}{s.every === 2 ? ' · 14-tägig' : ''}</span>
                <span>{s.room}</span>
              </a>
            ))}
            {d + 1 === nowDay && now >= from && now <= to && <div className="tt-now" style={{ top: ((now - from) / 60) * hourH }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Vorlesungszeit und Erinnerung vor Vorlesungen */
export function SemesterSettingsForm() {
  const { data, updateSettings } = useStore();
  const sem = data.settings.semester ?? defaultSemester();
  const set = (patch: Partial<typeof sem>) => updateSettings({ semester: { ...sem, ...patch } });
  return (
    <div className="form-grid">
      <label>Vorlesungsbeginn<input type="date" value={sem.start} onChange={(e) => set({ start: e.target.value })} /></label>
      <label>Vorlesungsende<input type="date" value={sem.end} min={sem.start} onChange={(e) => set({ end: e.target.value })} /></label>
      <label>
        Erinnerung vor Vorlesungen
        <select value={sem.remind} onChange={(e) => { const remind = Number(e.target.value); set({ remind }); if (remind) void askNotifications(); }}>
          <option value={0}>Keine</option>
          <option value={10}>10 Minuten vorher</option>
          <option value={15}>15 Minuten vorher</option>
          <option value={30}>30 Minuten vorher</option>
          <option value={60}>1 Stunde vorher</option>
        </select>
      </label>
      <p className="muted small full">Ohne Datum nimmt AntonOS den üblichen Semesterbeginn an (1. Oktober bzw. 1. April) und zeigt die Kurszeiten ohne Ende.</p>
    </div>
  );
}
