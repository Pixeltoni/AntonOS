import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useStore } from '../store';
import type { Course, ID } from '../types';
import { emojiIcon, leadingEmoji } from './icons';
import { countDuration, tween } from '../lib/motion';

/**
 * Kopf jeder Seite mit großem Titel wie in iOS. Am iPhone wandert der Titel beim
 * Scrollen klein in eine durchscheinende Leiste oben.
 */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = heading.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <>
      <div className={`nav-compact ${compact ? 'show' : ''}`} aria-hidden="true"><span>{title}</span></div>
      <header className="page-header">
        <div>
          <h1 ref={heading}>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {actions && <div className="row">{actions}</div>}
      </header>
    </>
  );
}

export function Panel({ title: rawTitle, icon, actions, children }: { title?: string; icon?: LucideIcon; actions?: ReactNode; children: ReactNode }) {
  // Titel wie „🎨 Design“ bekommen statt des Emojis das passende Linien-Symbol
  // (nur bekannte Emojis – eigene in Namen bleiben stehen)
  const emoji = rawTitle ? leadingEmoji(rawTitle) : '';
  const mapped = emoji ? emojiIcon(emoji) : undefined;
  const title = mapped ? rawTitle!.slice(emoji.length).trim() : rawTitle;
  const Glyph = icon ?? mapped;
  return (
    <section className="panel">
      {(title || actions) && (
        <div className="panel-head">
          {title && <h2>{Glyph && <Glyph size={17} strokeWidth={2} aria-hidden="true" className="panel-icon" />}{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function useCourse(id: ID | null): Course | undefined {
  const { data } = useStore();
  return id ? data.courses.find((c) => c.id === id) : undefined;
}

export function CourseBadge({ id }: { id: ID | null }) {
  const course = useCourse(id);
  if (!course) return null;
  return (
    <a className="badge" href={`#/kurse/${course.id}`} style={{ ['--c' as string]: course.color }}>
      {course.code || course.name}
    </a>
  );
}

export function CourseSelect({
  value,
  onChange,
  allowNone = true,
  noneLabel = 'Kein Kurs',
}: {
  value: ID | null;
  onChange: (id: ID | null) => void;
  allowNone?: boolean;
  noneLabel?: string;
}) {
  const { data } = useStore();
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} aria-label="Kurs">
      {allowNone && <option value="">{noneLabel}</option>}
      {data.courses.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

export function Progress({ value, color }: { value: number; color?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="progress" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${v}%`, background: color }} />
    </div>
  );
}

export function Stat({ label, value, hint, href }: { label: string; value: ReactNode; hint?: string; href?: string }) {
  const body = (
    <>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{typeof value === 'number' ? <CountUp value={value} /> : value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </>
  );
  return href ? (
    <a className="stat" href={href}>
      {body}
    </a>
  ) : (
    <div className="stat">{body}</div>
  );
}

/** Kleiner Kuchen für den Projektfortschritt wie in Things */
export function ProgressPie({ share, color = '#007AFF', size = 16 }: { share: number; color?: string; size?: number }) {
  const r = size / 2 - 1;
  const c = size / 2;
  const a = Math.min(0.9999, Math.max(0, share)) * 2 * Math.PI;
  const x = c + (r - 1.5) * Math.sin(a);
  const y = c - (r - 1.5) * Math.cos(a);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="pie">
      <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth="1.5" />
      {share > 0 && <path d={`M${c} ${c} L${c} ${c - r + 1.5} A${r - 1.5} ${r - 1.5} 0 ${a > Math.PI ? 1 : 0} 1 ${x} ${y} Z`} fill={color} />}
    </svg>
  );
}

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Zahl, die beim ersten Anzeigen und bei jeder Änderung weich hochzählt
 * (wie auf den modernen Websites). Mit „Bewegung reduzieren“ steht sie sofort da.
 */
export function CountUp({ value, format = (v) => String(Math.round(v)) }: { value: number; format?: (v: number) => string }) {
  const [shown, setShown] = useState(() => (reducedMotion() ? value : 0));
  const from = useRef(shown);
  useEffect(() => {
    const start = from.current;
    const duration = reducedMotion() ? 0 : countDuration(start, value);
    if (duration === 0) {
      from.current = value;
      setShown(value);
      return;
    }
    let frame = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const v = tween(start, value, now - t0, duration);
      from.current = v;
      setShown(v);
      if (v !== value) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span className="count-up">{format(shown)}</span>;
}
