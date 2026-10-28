import { useEffect } from 'react';
import { useStore } from '../store';
import type { DateStr, WidgetVariant } from '../types';
import { today } from '../lib/dates';
import { defaultRingGoals, openRings, RING_COLORS, RING_TRACKS, ringDay, weekOf, type RingDay, type RingValue } from '../lib/rings';
import { useToast } from './toast';
import { notify } from '../lib/notify';

type RingArc = Pick<RingValue, 'share' | 'color' | 'track'>;

/** Ineinanderliegende Ringe wie bei Apple Fitness. Über 100 % läuft der Ring weiter. */
export function Rings({ rings, size = 120, stroke }: { rings: RingArc[]; size?: number; stroke?: number }) {
  const sw = stroke ?? Math.max(3, Math.round(size / 9));
  const gap = Math.max(1, Math.round(sw / 6));
  return (
    <svg className="rings" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {rings.map((ring, i) => {
        const r = size / 2 - sw / 2 - i * (sw + gap);
        if (r <= 0) return null;
        const c = 2 * Math.PI * r;
        const share = Math.max(0, ring.share);
        return (
          <g key={i} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ring.track} strokeWidth={sw} />
            {share > 0 && (
              <circle
                className="ring-arc"
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={ring.color}
                strokeWidth={sw}
                strokeLinecap="round"
                strokeDasharray={`${Math.min(share, 1) * c} ${c}`}
              />
            )}
            {share > 1 && (
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={ring.color}
                strokeWidth={sw}
                strokeLinecap="round"
                strokeDasharray={`${Math.min(share - 1, 1) * c} ${c}`}
                style={{ filter: 'brightness(1.25)' }}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function useRingDay(date: DateStr = today()): RingDay {
  const { data } = useStore();
  return ringDay(data, data.settings.rings ?? defaultRingGoals(), date);
}

function Legend({ day }: { day: RingDay }) {
  return (
    <dl className="ring-legend">
      {day.rings.map((r) => (
        <div key={r.slot}>
          <dt>{r.label}</dt>
          <dd style={{ color: r.color }}>{r.text}</dd>
        </div>
      ))}
    </dl>
  );
}

function WeekStrip() {
  const { data } = useStore();
  const goals = data.settings.rings ?? defaultRingGoals();
  const t = today();
  return (
    <div className="ring-week" aria-label="Diese Woche">
      {weekOf(t).map((d) => {
        const day = ringDay(data, goals, d);
        const future = d > t;
        return (
          <div key={d} className={`ring-week-day ${d === t ? 'today' : ''} ${future ? 'future' : ''}`} title={`${d}${day.closed ? ' · alle Ringe geschlossen' : ''}`}>
            <span>{new Date(`${d}T12:00`).toLocaleDateString('de-DE', { weekday: 'narrow' })}</span>
            <Rings rings={future ? day.rings.map((r) => ({ ...r, share: 0 })) : day.rings} size={30} stroke={4} />
          </div>
        );
      })}
    </div>
  );
}

/** Einzelner kleiner Ring, z. B. in jeder Gewohnheitszeile */
export function MiniRing({ share, color = RING_COLORS.habits, track = RING_TRACKS.habits, size = 34 }: { share: number; color?: string; track?: string; size?: number }) {
  const sw = Math.max(3, Math.round(size / 7));
  const r = size / 2 - sw / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg className="rings" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={sw} />
        {share > 0 && <circle className="ring-arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${Math.min(share, 1) * c} ${c}`} />}
      </g>
    </svg>
  );
}

/** Dunkle Karte mit den Ringen von heute und der Woche – oben auf der Gewohnheiten-Seite. */
export function RingsCard() {
  const day = useRingDay();
  return (
    <section className="rings-card" aria-label="Aktivitätsringe heute">
      <div className="rings-card-main">
        <Rings rings={day.rings} size={150} />
        <div>
          <h2>Heute</h2>
          <Legend day={day} />
          {day.closed && <p className="rings-closed">Alle Ringe geschlossen 🎉</p>}
        </div>
      </div>
      <WeekStrip />
    </section>
  );
}

/** Dashboard-Widget */
export function RingsWidget({ variant = 'standard' }: { variant?: WidgetVariant }) {
  const day = useRingDay();
  if (variant === 'kompakt') {
    return (
      <a className="rings-widget kompakt" href="#/gewohnheiten" aria-label="Aktivitätsringe">
        <Rings rings={day.rings} size={96} />
      </a>
    );
  }
  return (
    <div className="rings-widget">
      <div className="rings-widget-row">
        <Rings rings={day.rings} size={variant === 'detail' ? 120 : 96} />
        <Legend day={day} />
      </div>
      {variant === 'detail' && <WeekStrip />}
    </div>
  );
}

const REMINDED_KEY = 'antonos:ring-reminder';

/**
 * Erinnert am Abend, wenn ein Ring noch offen ist – als System-Mitteilung, falls erlaubt,
 * sonst als Hinweis in der App. Funktioniert, solange AntonOS geöffnet ist.
 */
export function useRingReminder() {
  const { data } = useStore();
  const { show } = useToast();
  const goals = data.settings.rings ?? defaultRingGoals();

  useEffect(() => {
    if (!goals.reminder) return;
    const check = () => {
      const t = today();
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (hhmm < goals.reminderTime) return;
      try {
        if (localStorage.getItem(REMINDED_KEY) === t) return;
        localStorage.setItem(REMINDED_KEY, t);
      } catch {
        return;
      }
      const open = openRings(ringDay(data, goals, t));
      if (open.length === 0) return;
      const text = `Noch offen: ${open.join(', ')}`;
      notify('AntonOS – schließ deine Ringe', text, 'ringe').then((ok) => {
        if (!ok) show(`⭕ ${text}`, { label: 'Ansehen', run: () => (location.hash = '#/gewohnheiten') }, 10000);
      });
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [data, goals, show]);
}
