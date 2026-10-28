import { useEffect, useRef, useState } from 'react';
import type { WidgetVariant } from '../types';
import { addDays, formatDate, isoWeek, relativeLabel, today } from '../lib/dates';
import { onDay, sortEntries } from '../lib/calendar';
import { useCalendarEntries } from './calendar';
import { periodProgress, safeImageSrc } from '../lib/life';
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
export function ImageInput({ value, onChange, label = 'Bild', maxSize = 900 }: { value: string; onChange: (v: string) => void; label?: string; maxSize?: number }) {
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
          if (f) onChange(await resizeImage(f, maxSize).catch(() => ''));
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

export function Clock({ variant = 'standard' }: { variant?: WidgetVariant }) {
  const now = useNow(1000);
  const s = now.getSeconds();
  const m = now.getMinutes() + s / 60;
  const h = (now.getHours() % 12) + m / 60;
  const hand = (deg: number, len: number, width: number, cls = '') => (
    <line x1="50" y1="50" x2={50 + len * Math.sin((deg * Math.PI) / 180)} y2={50 - len * Math.cos((deg * Math.PI) / 180)} strokeWidth={width} className={cls} />
  );
  return (
    <div className={`clock ${variant}`}>
      {variant !== 'kompakt' && (
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
      )}
      <div className="clock-text">
        <strong>{now.toLocaleTimeString('de-DE', variant === 'kompakt' ? { hour: '2-digit', minute: '2-digit' } : undefined)}</strong>
        <span className="muted">{now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        {variant === 'detail' && <span className="muted small">KW {isoWeek(now)} · {now.getFullYear()}</span>}
      </div>
    </div>
  );
}

export function PeriodBars({ variant = 'standard' }: { variant?: WidgetVariant }) {
  const now = useNow(60_000);
  const p = periodProgress(now);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysInYear = new Date(now.getFullYear(), 1, 29).getMonth() === 1 ? 366 : 365;
  const rest = (share: number, total: number, unit: string) => {
    const left = ((100 - share) / 100) * total;
    return `noch ${left < 10 ? left.toLocaleString('de-DE', { maximumFractionDigits: 1 }) : Math.round(left)} ${unit}`;
  };
  const all: [string, number, string][] = [
    ['Tag', p.day, rest(p.day, 24, 'Std.')],
    ['Woche', p.week, rest(p.week, 7, 'Tage')],
    ['Monat', p.month, rest(p.month, daysInMonth, 'Tage')],
    ['Jahr', p.year, rest(p.year, daysInYear, 'Tage')],
  ];
  const rows = variant === 'kompakt' ? [all[0], all[3]] : all;
  return (
    <div className="period">
      {rows.map(([label, v, left]) => (
        <div key={label} className="period-row">
          <Progress value={v} />
          <span className="muted small">
            {label}: {Math.floor(v)} %{variant === 'detail' && ` · ${left}`}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Terminliste für die nächsten Tage – die kompakte Variante des Kalenders. */
export function Agenda({ days }: { days: number }) {
  const entries = useCalendarEntries();
  const t = today();
  const list = Array.from({ length: days }, (_, i) => addDays(t, i))
    .map((d) => ({ d, items: sortEntries(entries.filter((e) => onDay(e, d) && !e.done)) }))
    .filter((x) => x.items.length > 0);
  if (list.length === 0) return <p className="empty">Keine Termine in den nächsten {days} Tagen.</p>;
  return (
    <ul className="agenda">
      {list.map(({ d, items }) => (
        <li key={d}>
          <span className="agenda-day">{d === t ? 'Heute' : relativeLabel(d, t) === 'morgen' ? 'Morgen' : formatDate(d).slice(0, 9)}</span>
          <div className="col">
            {items.map((e) => (
              <a
                key={e.key}
                href={e.href ?? '#/kalender'}
                className={`cal-item ${e.kind} ${e.priority ? `prio-${e.priority}` : ''} ${e.kind === 'event' && e.color ? 'colored' : ''}`}
                style={e.color ? ({ ['--c' as string]: e.color } as React.CSSProperties) : undefined}
              >
                {e.priority === 'hoch' && <span className="prio-flag" aria-label="wichtig" />}
                {e.time && <span className="cal-time">{e.time}</span>}
                <span className="cal-label">{e.label}</span>
              </a>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
