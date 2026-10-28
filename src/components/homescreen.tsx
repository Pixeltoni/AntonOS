import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import type { WidgetConfig, WidgetId, WidgetSize, WidgetVariant } from '../types';
import { addDays, parseDate, relativeLabel, today } from '../lib/dates';
import { onDay, sortEntries } from '../lib/calendar';
import { stackOrder, WIDGET_LABELS, type StackPage } from '../lib/layout';
import { monthKey } from '../lib/life';
import { useCalendarEntries } from './calendar';
import { Icon, stripEmoji, WIDGET_ICONS } from './icons';
import { RingsWidget } from './rings';
import { FocusWidget } from './focus';
import { useBudgetStatus, WalletCard } from '../pages/Finance';

/** Klein: Wochentag, große Tageszahl und die nächsten Termine – wie das iOS-Kalender-Widget */
export function TodayWidget() {
  const entries = useCalendarEntries();
  const t = today();
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const todays = sortEntries(entries.filter((e) => onDay(e, t) && !e.done)).filter((e) => !e.time || (e.endTime || e.time) >= hhmm);
  const tomorrow = sortEntries(entries.filter((e) => onDay(e, addDays(t, 1)) && !e.done));
  const d = parseDate(t);
  return (
    <a className="ios-widget today-widget" href="#/kalender">
      <span className="today-weekday">{d.toLocaleDateString('de-DE', { weekday: 'long' })}</span>
      <span className="today-day">{d.getDate()}</span>
      <ul>
        {todays.slice(0, 2).map((e) => (
          <li key={e.key} className={e.kind}>
            <strong>{e.label}</strong>
            <span>{e.time ? `${e.time}${e.endTime ? `–${e.endTime}` : ''}` : 'ganztägig'}</span>
          </li>
        ))}
        {todays.length === 0 && (
          <li className="muted">
            {tomorrow.length > 0 ? <>Morgen: {tomorrow[0].label}{tomorrow[0].time && ` · ${tomorrow[0].time}`}</> : 'Keine Termine mehr heute'}
          </li>
        )}
      </ul>
    </a>
  );
}

/** Klein: Tage bis zur nächsten Prüfung */
export function CountdownWidget() {
  const { data } = useStore();
  const t = today();
  const next = [...data.exams].filter((e) => e.date >= t).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next) {
    return (
      <a className="ios-widget countdown-widget" href="#/pruefungen">
        <span className="ios-widget-label">Nächste Prüfung</span>
        <span className="countdown-big">–</span>
        <span className="muted small">Keine Prüfung geplant</span>
      </a>
    );
  }
  const days = Math.round((parseDate(next.date).getTime() - parseDate(t).getTime()) / 86_400_000);
  const course = data.courses.find((c) => c.id === next.courseId);
  return (
    <a className="ios-widget countdown-widget" href="#/pruefungen" style={{ ['--c' as string]: course?.color ?? '#FF9500' }}>
      <span className="ios-widget-label">Nächste Prüfung</span>
      <span className="countdown-big">{days === 0 ? 'Heute' : days}</span>
      {days > 0 && <span className="countdown-unit">{days === 1 ? 'Tag' : 'Tage'}</span>}
      <span className="countdown-title">{next.title}</span>
    </a>
  );
}

function StackTasks() {
  const { data } = useStore();
  const t = today();
  const open = data.tasks
    .filter((x) => x.status !== 'erledigt')
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));
  return (
    <a className="stack-tasks" href="#/aufgaben">
      <span className="stack-tasks-head">
        <span className="ios-widget-label">Aufgaben</span>
        <strong>{open.length}</strong>
      </span>
      <ul>
        {open.slice(0, 3).map((x) => (
          <li key={x.id}>
            <span className="stack-check" aria-hidden />
            <span className="grow">{x.title}</span>
            {x.due && <span className={`muted small ${x.due < t ? 'danger' : ''}`}>{relativeLabel(x.due, t)}</span>}
          </li>
        ))}
        {open.length === 0 && <li className="muted">Alles erledigt 🎉</li>}
      </ul>
    </a>
  );
}

function StackBudget() {
  const month = monthKey(today());
  return <a href="#/finanzen" className="stack-plain"><WalletCard status={useBudgetStatus(month)} month={month} compact /></a>;
}

const STACK_PAGES: Record<StackPage, { label: string; render: () => ReactNode }> = {
  heute: { label: 'Kalender', render: () => <TodayWidget /> },
  aufgaben: { label: 'Aufgaben', render: () => <StackTasks /> },
  ringe: { label: 'Ringe', render: () => <RingsWidget variant="standard" /> },
  budget: { label: 'Budget', render: () => <StackBudget /> },
  fokus: { label: 'Fokus', render: () => <div className="stack-plain stack-focus"><FocusWidget /></div> },
  pruefung: { label: 'Prüfung', render: () => <CountdownWidget /> },
};

/**
 * Mehrere Widgets übereinander zum Durchwischen. Beim Öffnen steht oben,
 * was zur Tageszeit passt (morgens Kalender, tagsüber Aufgaben, abends Ringe).
 */
export function SmartStack() {
  const [order] = useState(() => stackOrder(new Date().getHours()));
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement>(null);

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="smart-stack" aria-roledescription="Smart Stack" aria-label={`Smart Stack: ${STACK_PAGES[order[index]]?.label ?? ''}`}>
      <div className="smart-stack-track" ref={track} tabIndex={0} onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(Math.min(order.length - 1, index + 1));
        if (e.key === 'ArrowLeft') go(Math.max(0, index - 1));
      }}>
        {order.map((p, i) => (
          <div key={p} className="smart-stack-page" aria-hidden={i !== index}>
            {STACK_PAGES[p].render()}
          </div>
        ))}
      </div>
      <div className="smart-stack-dots" role="tablist">
        {order.map((p, i) => (
          <button key={p} type="button" role="tab" aria-selected={i === index} aria-label={STACK_PAGES[p].label} className={i === index ? 'on' : ''} onClick={() => go(i)} />
        ))}
      </div>
    </div>
  );
}

const GALLERY_SIZES: { size: WidgetSize; label: string }[] = [
  { size: 's', label: 'Klein' },
  { size: 'm', label: 'Mittel' },
  { size: 'l', label: 'Groß' },
];

/** Widget-Galerie mit Live-Vorschau zum Hinzufügen ausgeblendeter Widgets */
export function WidgetGallery({
  layout,
  render,
  onAdd,
  onClose,
}: {
  layout: WidgetConfig[];
  render: (id: WidgetId, variant: WidgetVariant) => ReactNode;
  onAdd: (id: WidgetId, size: WidgetSize) => void;
  onClose: () => void;
}) {
  const hidden = layout.filter((w) => w.hidden);
  const [selected, setSelected] = useState<WidgetId | null>(hidden[0]?.id ?? null);
  const [size, setSize] = useState<WidgetSize>('s');
  const current = hidden.find((w) => w.id === selected) ?? hidden[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal gallery-modal" role="dialog" aria-modal="true" aria-label="Widget hinzufügen">
        <div className="row between">
          <h2>Widget hinzufügen</h2>
          <button type="button" className="icon" onClick={onClose} aria-label="Schließen">×</button>
        </div>
        {!current ? (
          <p className="muted">Alle Widgets sind schon auf deinem Dashboard. Blende eins aus, um es hier wiederzufinden.</p>
        ) : (
          <div className="gallery-layout">
            <ul className="gallery-list">
              {hidden.map((w) => (
                <li key={w.id}>
                  <button type="button" className={current.id === w.id ? 'on' : ''} onClick={() => setSelected(w.id)}>{WIDGET_ICONS[w.id] && <Icon icon={WIDGET_ICONS[w.id]!} size={15} />} {stripEmoji(WIDGET_LABELS[w.id])}</button>
                </li>
              ))}
            </ul>
            <div className="gallery-preview-wrap">
              <div className={`gallery-preview size-${size}`} aria-hidden>
                {render(current.id, size === 's' ? 'kompakt' : 'standard')}
              </div>
              <div className="segmented focus-modes" role="radiogroup" aria-label="Größe">
                {GALLERY_SIZES.map((s) => (
                  <button key={s.size} type="button" role="radio" aria-checked={size === s.size} className={size === s.size ? 'on' : ''} onClick={() => setSize(s.size)}>
                    {s.label}
                  </button>
                ))}
              </div>
              <button type="button" className="primary" onClick={() => onAdd(current.id, size)}>+ Hinzufügen</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Anordnen per Ziehen: Griff gedrückt halten und auf ein anderes Widget ziehen.
 * Funktioniert mit Maus, Stift und Finger (Pointer Events).
 */
export function useDragReorder(onDrop: (fromId: WidgetId, toId: WidgetId) => void) {
  const [drag, setDrag] = useState<{ id: WidgetId; over: WidgetId | null } | null>(null);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  const start = (id: WidgetId) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    let over: WidgetId | null = null;
    setDrag({ id, over });
    const move = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-widget]');
      const next = (el?.dataset.widget as WidgetId | undefined) ?? null;
      if (next !== over) {
        over = next;
        setDrag({ id, over });
      }
      // Am Rand automatisch weiterscrollen
      if (ev.clientY < 70) window.scrollBy(0, -14);
      else if (ev.clientY > window.innerHeight - 70) window.scrollBy(0, 14);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (over && over !== id) dropRef.current(id, over);
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  return { drag, start };
}
