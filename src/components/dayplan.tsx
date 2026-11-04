import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useStore } from '../store';
import { today } from '../lib/dates';
import { tap } from '../lib/haptics';
import {
  buildDayPlan, findSlot, minutesLabel, snapTo, toHHMM, type DayPlan, type Gap, type PlanBlock, type PlanItem,
} from '../lib/dayplan';
import { useCalendarEntries } from './calendar';
import { Sheet } from './sheet';
import { useToast } from './toast';

/** Pixel pro Minute in der Zeitleiste */
const PX = 1.15;

/** Minuten seit Mitternacht, alle 30 Sekunden neu */
function useMinuteOfDay(): number {
  const read = () => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  };
  const [now, setNow] = useState(read);
  useEffect(() => {
    const id = setInterval(() => setNow(read()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Nächster scrollbarer Vorfahre (für das Mitscrollen beim Ziehen) */
function scrollParent(el: HTMLElement | null): HTMLElement {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight) return n;
  }
  return (document.scrollingElement as HTMLElement) ?? document.documentElement;
}

type Drag = { item: PlanItem; x: number; y: number; at: number | null; moved: boolean };

/** Aufgabe bzw. Training in der Zeitleiste: Uhrzeit, Dauer, erledigt, herausnehmen */
function BlockSheet({ block, onClose }: { block: PlanBlock; onClose: () => void }) {
  const { data, update } = useStore();
  const task = block.taskId ? data.tasks.find((x) => x.id === block.taskId) : undefined;
  const workout = block.workoutId ? data.workouts.find((x) => x.id === block.workoutId) : undefined;
  const [time, setTime] = useState(toHHMM(block.start));
  const [minutes, setMinutes] = useState(String(block.end - block.start));
  const save = () => {
    const m = Math.max(5, Math.round(Number(minutes) || 0));
    if (task) update('tasks', task.id, { plannedTime: time, estimate: m });
    else if (workout) update('workouts', workout.id, { time, minutes: m });
    onClose();
  };
  return (
    <Sheet title={block.title} submitLabel="Sichern" onClose={onClose} onSubmit={save}>
      <div className="modal-grid">
        <label>Beginn<input type="time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} /></label>
        <label>{task ? 'Geschätzt (Min.)' : 'Dauer (Min.)'}<input type="number" min={5} step={5} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
      </div>
      {task && (
        <button type="button" className={task.status === 'erledigt' ? '' : 'primary'} onClick={() => { update('tasks', task.id, { status: task.status === 'erledigt' ? 'offen' : 'erledigt' }); onClose(); }}>
          {task.status === 'erledigt' ? 'Wieder öffnen' : '✓ Erledigt'}
        </button>
      )}
      {workout && <a className="button" href="#/training" onClick={onClose}>Zum Training</a>}
      <button type="button" onClick={() => {
        if (task) update('tasks', task.id, { plannedTime: undefined });
        else if (workout) update('workouts', workout.id, { time: undefined });
        onClose();
      }}>Aus dem Plan nehmen</button>
    </Sheet>
  );
}

/** Lücke antippen: passende Aufgabe hineinlegen */
function GapSheet({ gap, plan, from, onPick, onClose }: { gap: Gap; plan: DayPlan; from: number; onPick: (item: PlanItem, start: number) => void; onClose: () => void }) {
  const start = Math.max(gap.start, Math.ceil(from / 5) * 5);
  const length = gap.end - start;
  const fits = plan.open.filter((o) => o.minutes <= length);
  const rest = plan.open.filter((o) => o.minutes > length);
  return (
    <Sheet title={`Frei ab ${toHHMM(start)}`} onClose={onClose}>
      <p className="muted small">{minutesLabel(length)} bis {toHHMM(gap.end)}. Was soll hier hinein?</p>
      {plan.open.length === 0 && <p className="muted">Für heute ist alles eingeplant 🎉</p>}
      <ul className="ios-list dp-pick">
        {[...fits, ...rest].map((o) => (
          <li key={`${o.kind}-${o.id}`}>
            <button type="button" className="grow row-button" onClick={() => { onPick(o, start); onClose(); }}>
              <span className="task-title">{o.kind === 'training' ? '🏋️ ' : ''}{o.title}</span>
              <span className={`small ${o.minutes > length ? 'danger' : 'muted'}`}>{o.estimated ? '' : '≈ '}{minutesLabel(o.minutes)}{o.minutes > length ? ' · länger als die Lücke' : ''}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/**
 * „Plan“ auf Heute: senkrechte Zeitleiste vom Wecker bis zur Schlafenszeit mit allen Blöcken,
 * freien Lücken und der Jetzt-Linie. Aufgaben ohne Uhrzeit liegen unten in einer Leiste:
 * antippen legt sie in die nächste passende Lücke, nach oben ziehen an eine bestimmte Stelle.
 */
export function DayPlanView() {
  const { data, update } = useStore();
  const entries = useCalendarEntries();
  const { show } = useToast();
  const t = today();
  const nowMin = useMinuteOfDay();
  const plan = useMemo(() => buildDayPlan(data, entries, t), [data, entries, t]);
  const lineRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const startPoint = useRef<{ x: number; y: number; item: PlanItem; id: number } | null>(null);
  const [block, setBlock] = useState<PlanBlock | null>(null);
  const [gap, setGap] = useState<Gap | null>(null);

  const top = (min: number) => (min - plan.wake) * PX;
  const height = (plan.sleep - plan.wake) * PX;
  const hours: number[] = [];
  for (let h = Math.ceil(plan.wake / 60); h * 60 <= plan.sleep; h++) hours.push(h);

  const unplace = (item: PlanItem) => (item.kind === 'task' ? update('tasks', item.id, { plannedTime: undefined }) : update('workouts', item.id, { time: undefined }));
  const place = (item: PlanItem, start: number) => {
    const time = toHHMM(start);
    if (item.kind === 'task') update('tasks', item.id, { plannedFor: t, plannedTime: time });
    else update('workouts', item.id, { time });
    tap();
    show(`„${item.title}“ um ${time} eingeplant`, { label: 'Widerrufen', run: () => unplace(item) });
  };
  const autoPlace = (item: PlanItem) => {
    const slot = findSlot(plan, item.minutes, Math.max(plan.wake, nowMin));
    if (slot === null) show(`Heute ist keine Lücke mehr für ${minutesLabel(item.minutes)} frei.`);
    else place(item, slot);
  };

  /** Minute unter dem Finger, wenn er über der Zeitleiste ist */
  const minuteAt = (y: number): number | null => {
    const rect = lineRef.current?.getBoundingClientRect();
    if (!rect || y < rect.top || y > rect.bottom) return null;
    return Math.min(plan.sleep - 15, Math.max(plan.wake, snapTo(plan.wake + (y - rect.top) / PX, 15)));
  };

  // Beim Ziehen am Rand mitscrollen
  useEffect(() => {
    if (!drag?.moved) return;
    const scroller = scrollParent(lineRef.current);
    let raf = 0;
    const loop = () => {
      const d = dragRef.current;
      if (d) {
        const edge = 90;
        const bottomEdge = window.innerHeight - 200;
        if (d.y < edge) scroller.scrollBy(0, -Math.ceil((edge - d.y) / 6));
        else if (d.y > bottomEdge) scroller.scrollBy(0, Math.ceil((d.y - bottomEdge) / 6));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [drag?.moved]);

  const onChipDown = (e: ReactPointerEvent<HTMLButtonElement>, item: PlanItem) => {
    startPoint.current = { x: e.clientX, y: e.clientY, item, id: e.pointerId };
    // Maus: Bewegungen auch außerhalb des Kärtchens bekommen und keinen Text markieren (Finger haben das von selbst)
    if (e.pointerType === 'mouse') {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };
  const onChipMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const s = startPoint.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!dragRef.current) {
      // Waagerecht = Leiste scrollen, nach oben = ziehen
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
        startPoint.current = null;
        return;
      }
      if (Math.abs(dy) < 10) return;
    }
    setDrag({ item: s.item, x: e.clientX, y: e.clientY, at: minuteAt(e.clientY), moved: true });
  };
  const onChipUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const s = startPoint.current;
    startPoint.current = null;
    const d = dragRef.current;
    setDrag(null);
    if (!s || s.id !== e.pointerId) return;
    if (d?.moved) {
      if (d.at !== null) place(d.item, d.at);
      return;
    }
    autoPlace(s.item);
  };
  const onChipCancel = () => {
    startPoint.current = null;
    setDrag(null);
  };

  const nowVisible = nowMin >= plan.wake && nowMin <= plan.sleep;
  const blockStyle = (b: PlanBlock): CSSProperties => ({
    top: top(b.start),
    height: Math.max(24, (b.end - b.start) * PX - 2),
    left: `calc(${(b.lane / b.lanes) * 100}% + 2px)`,
    width: `calc(${100 / b.lanes}% - 4px)`,
    ['--c' as string]: b.color,
  });

  return (
    <div className="dp">
      <div className="dp-summary">
        <span><b>{minutesLabel(plan.free)}</b> frei</span>
        <span><b>{minutesLabel(plan.busy)}</b> verplant</span>
        {plan.openMinutes > 0 && <span className={plan.openMinutes > plan.free ? 'warn' : ''}><b>{minutesLabel(plan.openMinutes)}</b> offen</span>}
      </div>
      <div className="dp-line" ref={lineRef} style={{ height }}>
        {hours.map((h) => (
          <div key={h} className="dp-hour" style={{ top: top(h * 60) }}><span>{toHHMM(h * 60).replace(/^0/, '')}</span></div>
        ))}
        <div className="dp-edge wake" style={{ top: 0 }}>{plan.wakeFromAlarm ? `⏰ ${toHHMM(plan.wake)} Wecker` : `☀️ ${toHHMM(plan.wake)} Tagesbeginn`}</div>
        <div className="dp-area">
          {plan.gaps.map((g) => {
            const past = g.end <= nowMin;
            const h = (g.end - g.start) * PX;
            return (
              <button key={`gap-${g.start}`} type="button" className={`dp-gap ${past ? 'past' : ''}`} style={{ top: top(g.start) + 1, height: h - 2 }} disabled={past} onClick={() => setGap(g)} aria-label={`Frei ${toHHMM(g.start)} bis ${toHHMM(g.end)}`}>
                {h >= 30 && <span>frei · {minutesLabel(g.end - g.start)}</span>}
                {!past && <i aria-hidden>+</i>}
              </button>
            );
          })}
          {plan.blocks.map((b) => {
            const movable = !!(b.taskId || b.workoutId);
            const cls = `dp-block ${b.kind} ${b.done ? 'done' : ''} ${b.end <= nowMin ? 'past' : ''} ${b.end - b.start < 35 ? 'short' : ''}`;
            const inner = (
              <>
                <strong>{b.kind === 'task' ? (b.done ? '✓ ' : '○ ') : ''}{b.title}</strong>
                <small>{toHHMM(b.start)}–{toHHMM(b.end)}{b.detail ? ` · ${b.detail}` : ''}</small>
              </>
            );
            return movable ? (
              <button key={b.key} type="button" className={cls} style={blockStyle(b)} onClick={() => setBlock(b)}>{inner}</button>
            ) : (
              <a key={b.key} className={cls} style={blockStyle(b)} href={b.href}>{inner}</a>
            );
          })}
          {drag?.moved && drag.at !== null && (
            <div className="dp-block preview" style={{ top: top(drag.at), height: Math.max(24, drag.item.minutes * PX - 2), left: 2, right: 2 }}>
              <strong>{drag.item.title}</strong>
              <small>{toHHMM(drag.at)}–{toHHMM(drag.at + drag.item.minutes)}</small>
            </div>
          )}
        </div>
        {nowVisible && <div className="dp-now" style={{ top: top(nowMin) }}><span>{toHHMM(nowMin)}</span></div>}
        <div className="dp-edge sleep" style={{ top: height }}>{plan.sleepFromAlarm ? `🌙 ${toHHMM(plan.sleep)} Schlafenszeit` : `🌙 ${toHHMM(plan.sleep)} Tagesende`}</div>
      </div>
      {plan.open.length > 0 && (
        <div className="dp-tray" aria-label="Noch ohne Uhrzeit">
          <span className="dp-tray-label">Noch ohne Uhrzeit – antippen oder nach oben ziehen</span>
          <div className="dp-chips">
            {plan.open.map((o) => (
              <button
                key={`${o.kind}-${o.id}`}
                type="button"
                className={`dp-chip ${o.kind} ${drag?.item.id === o.id ? 'dragging' : ''}`}
                onPointerDown={(e) => onChipDown(e, o)}
                onPointerMove={onChipMove}
                onPointerUp={onChipUp}
                onPointerCancel={onChipCancel}
              >
                <strong>{o.kind === 'training' ? '🏋️ ' : ''}{o.title}</strong>
                <small>{o.estimated ? '' : '≈ '}{minutesLabel(o.minutes)}</small>
              </button>
            ))}
          </div>
        </div>
      )}
      {drag?.moved && (
        <div className="dp-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden>
          {drag.item.title}{drag.at !== null ? ` · ${toHHMM(drag.at)}` : ''}
        </div>
      )}
      {block && <BlockSheet block={block} onClose={() => setBlock(null)} />}
      {gap && <GapSheet gap={gap} plan={plan} from={nowMin} onPick={place} onClose={() => setGap(null)} />}
    </div>
  );
}
