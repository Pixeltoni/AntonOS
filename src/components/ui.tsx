import type { ReactNode } from 'react';
import { useStore } from '../store';
import type { Course, ID } from '../types';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

export function Panel({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      {(title || actions) && (
        <div className="panel-head">
          {title && <h2>{title}</h2>}
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
      <span className="stat-value">{value}</span>
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
