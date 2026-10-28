import { useEffect } from 'react';
import { useStore } from '../store';
import type { DateStr, WidgetVariant } from '../types';
import { today } from '../lib/dates';
import { defaultRingGoals, openRings, RING_COLORS, RING_TRACKS, ringDay, weekOf, type RingDay } from '../lib/rings';
import { useToast } from './toast';
import { notify } from '../lib/notify';

const KEYS = ['learn', 'move', 'habits'] as const;

/** Drei ineinanderliegende Ringe wie bei Apple Fitness. Über 100 % läuft der Ring weiter. */
export function Rings({ day, size = 120, stroke }: { day: Pick<RingDay, 'learnShare' | 'moveShare' | 'habitsShare'>; size?: number; stroke?: number }) {
  const sw = stroke ?? Math.max(3, Math.round(size / 9));
  const gap = Math.max(1, Math.round(sw / 6));
  const shares = [day.learnShare, day.moveShare, day.habitsShare];
  return (
    <svg className="rings" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {KEYS.map((k, i) => {
        const r = size / 2 - sw / 2 - i * (sw + gap);
        if (r <= 0) return null;
        const c = 2 * Math.PI * r;
        const share = Math.max(0, shares[i]);
        return (
          <g key={k} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={RING_TRACKS[k]} strokeWidth={sw} />
            {share > 0 && (
              <circle
                className="ring-arc"
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={RING_COLORS[k]}
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
                stroke={RING_COLORS[k]}
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

const fmtHours = (min: number) => (min / 60).toLocaleString('de-DE', { maximumFractionDigits: 1 });

function Legend({ day }: { day: RingDay }) {
  const { data } = useStore();
  const goals = data.settings.rings ?? defaultRingGoals();
  const inHours = goals.learnMinutes >= 60;
  const learnGoal = inHours ? `${fmtHours(goals.learnMinutes)} Std.` : `${goals.learnMinutes} Min.`;
  const learnNow = inHours ? fmtHours(day.learn) : String(day.learn);
  return (
    <dl className="ring-legend">
      <div>
        <dt>Lernen</dt>
        <dd style={{ color: RING_COLORS.learn }}>{learnNow}/{learnGoal}</dd>
      </div>
      <div>
        <dt>Bewegung</dt>
        <dd style={{ color: RING_COLORS.move }}>{day.move}/{goals.moveMinutes} Min.</dd>
      </div>
      <div>
        <dt>Gewohnheiten</dt>
        <dd style={{ color: RING_COLORS.habits }}>{day.habitsDone}/{day.habitsTotal}</dd>
      </div>
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
            <Rings day={future ? { learnShare: 0, moveShare: 0, habitsShare: 0 } : day} size={30} stroke={4} />
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
        <Rings day={day} size={150} />
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
        <Rings day={day} size={96} />
      </a>
    );
  }
  return (
    <div className="rings-widget">
      <div className="rings-widget-row">
        <Rings day={day} size={variant === 'detail' ? 120 : 96} />
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
