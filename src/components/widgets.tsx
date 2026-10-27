import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import type { DateStr } from '../types';
import { formatDate, today } from '../lib/dates';
import { monthGrid, monthKey, monthLabel, periodProgress, safeImageSrc, shiftMonth } from '../lib/life';
import { Progress } from './ui';

/** Liest ein Bild ein und verkleinert es, damit der Browser-Speicher nicht überläuft. */
function resizeImage(file: File, maxSize = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Bild konnte nicht gelesen werden'));
    };
    img.src = url;
  });
}

/** Bild per URL oder Upload wählen. */
export function ImageInput({ value, onChange, label = 'Bild' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const file = useRef<HTMLInputElement>(null);
  const isUpload = value.startsWith('data:');
  return (
    <div className="row">
      <input
        className="grow"
        placeholder={`${label}: URL einfügen …`}
        value={isUpload ? '(hochgeladenes Bild)' : value}
        readOnly={isUpload}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label}-URL`}
      />
      <button type="button" onClick={() => file.current?.click()} title="Bild hochladen">📷</button>
      {value && <button type="button" className="icon" onClick={() => onChange('')} aria-label="Bild entfernen">×</button>}
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onChange(await resizeImage(f).catch(() => ''));
        }}
      />
    </div>
  );
}

const GRADIENTS = [
  ['#f97316', '#7c2d12'],
  ['#6366f1', '#1e1b4b'],
  ['#10b981', '#064e3b'],
  ['#ec4899', '#500724'],
  ['#0ea5e9', '#0c4a6e'],
  ['#eab308', '#713f12'],
];

/** Titelbild oder – ohne Bild – ein farbiger Verlauf mit Emoji. */
export function Cover({ src, seed, emoji, className = '' }: { src?: string; seed: string; emoji?: string; className?: string }) {
  const safe = safeImageSrc(src);
  if (safe) return <img className={`cover ${className}`} src={safe} alt="" loading="lazy" />;
  const hash = [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);
  const [a, b] = GRADIENTS[hash % GRADIENTS.length];
  return (
    <div className={`cover placeholder ${className}`} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}>
      {emoji}
    </div>
  );
}

export function Stars({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <span className="stars" aria-label={`${value} von 5 Sternen`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button key={n} type="button" className={n <= value ? 'on' : ''} onClick={() => onChange(n === value ? 0 : n)} aria-label={`${n} Sterne`}>
            ★
          </button>
        ) : (
          <span key={n} className={n <= value ? 'on' : ''}>★</span>
        ),
      )}
    </span>
  );
}

function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function Clock() {
  const now = useNow(1000);
  const s = now.getSeconds();
  const m = now.getMinutes() + s / 60;
  const h = (now.getHours() % 12) + m / 60;
  const hand = (deg: number, len: number, width: number, cls = '') => (
    <line x1="50" y1="50" x2={50 + len * Math.sin((deg * Math.PI) / 180)} y2={50 - len * Math.cos((deg * Math.PI) / 180)} strokeWidth={width} className={cls} />
  );
  return (
    <div className="clock">
      <svg viewBox="0 0 100 100" role="img" aria-label={now.toLocaleTimeString('de-DE')}>
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * 30 * Math.PI) / 180;
          return <line key={i} x1={50 + 40 * Math.sin(a)} y1={50 - 40 * Math.cos(a)} x2={50 + 45 * Math.sin(a)} y2={50 - 45 * Math.cos(a)} strokeWidth={i % 3 === 0 ? 2 : 1} />;
        })}
        {hand(h * 30, 24, 3)}
        {hand(m * 6, 34, 2)}
        {hand(s * 6, 38, 1, 'second')}
        <circle cx="50" cy="50" r="2" />
      </svg>
      <div className="clock-text">
        <strong>{now.toLocaleTimeString('de-DE')}</strong>
        <span className="muted">{now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      </div>
    </div>
  );
}

export function PeriodBars() {
  const p = periodProgress(useNow(60_000));
  const rows: [string, number][] = [['Tag', p.day], ['Woche', p.week], ['Monat', p.month], ['Jahr', p.year]];
  return (
    <div className="period">
      {rows.map(([label, v]) => (
        <div key={label} className="period-row">
          <Progress value={v} />
          <span className="muted small">{label}: {Math.floor(v)} %</span>
        </div>
      ))}
    </div>
  );
}

interface CalendarEntry {
  date: DateStr;
  label: string;
  href: string;
  kind: 'task' | 'exam' | 'project' | 'workout';
  done?: boolean;
}

function useCalendarEntries(): CalendarEntry[] {
  const { data } = useStore();
  return [
    ...data.tasks.filter((t) => t.due).map((t) => ({ date: t.due!, label: t.title, href: '#/aufgaben', kind: 'task' as const, done: t.status === 'erledigt' })),
    ...data.exams.map((e) => ({ date: e.date, label: e.title, href: '#/pruefungen', kind: 'exam' as const })),
    ...data.projects.filter((p) => p.due).map((p) => ({ date: p.due!, label: p.title, href: `#/projekte/${p.id}`, kind: 'project' as const, done: p.status === 'abgeschlossen' })),
    ...data.workouts.map((w) => ({ date: w.date, label: w.title, href: '#/training', kind: 'workout' as const, done: w.done })),
  ];
}

export function MonthCalendar() {
  const t = today();
  const [month, setMonth] = useState(monthKey(t));
  const entries = useCalendarEntries();
  const [y, m] = month.split('-').map(Number);
  const days = monthGrid(y, m - 1);

  return (
    <div className="calendar">
      <div className="row between">
        <strong>{monthLabel(month)}</strong>
        <div className="row">
          <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Voriger Monat">‹</button>
          <button onClick={() => setMonth(monthKey(t))}>Heute</button>
          <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Nächster Monat">›</button>
        </div>
      </div>
      <div className="cal-grid">
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => <div key={d} className="cal-head">{d}</div>)}
        {days.map((d) => {
          const items = entries.filter((e) => e.date === d);
          return (
            <div key={d} className={`cal-day ${monthKey(d) !== month ? 'other' : ''} ${d === t ? 'today' : ''}`} title={formatDate(d)}>
              <span className="cal-num">{Number(d.slice(8))}</span>
              {items.slice(0, 3).map((e, i) => (
                <a key={i} href={e.href} className={`cal-item ${e.kind} ${e.done ? 'done' : ''}`} title={e.label}>{e.label}</a>
              ))}
              {items.length > 3 && <span className="muted small">+{items.length - 3}</span>}
            </div>
          );
        })}
      </div>
      <div className="row wrap small muted">
        <span className="cal-item task">Aufgabe</span>
        <span className="cal-item exam">Prüfung</span>
        <span className="cal-item project">Projekt</span>
        <span className="cal-item workout">Training</span>
      </div>
    </div>
  );
}
