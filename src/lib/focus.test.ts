import { describe, expect, it } from 'vitest';
import { defaultFocusConfig, idleTimer, mmss, pause, remainingMs, skip, stackedWeek, start, stop, tick } from './focus';

const MIN = 60_000;
const cfg = { ...defaultFocusConfig(), work: 25, short: 5, long: 15, rounds: 2, courseId: 'ana' };

describe('Fokus-Timer', () => {
  it('startet, pausiert und läuft weiter', () => {
    let t = start(idleTimer(cfg), 0);
    expect(remainingMs(t, 10 * MIN)).toBe(15 * MIN);
    t = pause(t, 10 * MIN);
    expect(remainingMs(t, 99 * MIN)).toBe(15 * MIN);
    t = start(t, 100 * MIN);
    expect(t.endAt).toBe(115 * MIN);
  });

  it('wechselt automatisch zwischen Runden und Pausen und speichert Fokus-Runden', () => {
    let t = start(idleTimer(cfg), 0);
    t = { ...t, distractions: 2 };
    let r = tick(t, 25 * MIN);
    expect(r.finished).toEqual([{ session: { minutes: 25, courseId: 'ana', distractions: 2, mode: 'lernen' }, next: 'pause' }]);
    expect(r.timer).toMatchObject({ phase: 'pause', round: 1, running: true, endAt: 30 * MIN, distractions: 2 });
    r = tick(r.timer, 30 * MIN);
    expect(r.timer).toMatchObject({ phase: 'fokus', round: 2, distractions: 0 });
    r = tick(r.timer, 55 * MIN);
    expect(r.timer.phase).toBe('lange-pause');
    r = tick(r.timer, 70 * MIN);
    expect(r.finished[0].next).toBe('fertig');
    expect(r.timer.active).toBe(false);
  });

  it('holt verpasste Phasen nach, wenn die App geschlossen war', () => {
    const r = tick(start(idleTimer(cfg), 0), 200 * MIN);
    expect(r.finished.filter((f) => f.session).length).toBe(2);
    expect(r.timer.active).toBe(false);
  });

  it('wartet ohne Autostart nach jeder Phase', () => {
    const r = tick(start(idleTimer({ ...cfg, autoStart: false }), 0), 40 * MIN);
    expect(r.timer).toMatchObject({ phase: 'pause', running: false, active: true, leftMs: 5 * MIN });
    expect(r.finished.length).toBe(1);
  });

  it('speichert beim Beenden die schon gelernte Zeit', () => {
    const t = start(idleTimer(cfg), 0);
    expect(stop(t, 12 * MIN, true).session?.minutes).toBe(12);
    expect(stop(t, 12 * MIN, false).session).toBeUndefined();
    expect(stop(t, 12 * MIN, true).timer.active).toBe(false);
  });

  it('überspringt Pausen', () => {
    const r = tick(start(idleTimer(cfg), 0), 26 * MIN);
    const s = skip(r.timer, 26 * MIN);
    expect(s).toMatchObject({ phase: 'fokus', round: 2, running: true, endAt: 51 * MIN });
  });

  it('formatiert und stapelt', () => {
    expect(mmss(18 * MIN + 41_200)).toBe('18:42');
    const week = stackedWeek([
      { id: '1', date: 'a', minutes: 30, courseId: 'x', distractions: 0 },
      { id: '2', date: 'a', minutes: 50, courseId: 'y', distractions: 0 },
      { id: '3', date: 'a', minutes: 20, courseId: 'x', distractions: 0 },
    ], ['a', 'b']);
    expect(week[0]).toEqual({ date: 'a', parts: [{ courseId: 'x', minutes: 50 }, { courseId: 'y', minutes: 50 }], total: 100 });
    expect(week[1].total).toBe(0);
  });
});
