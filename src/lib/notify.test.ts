import { describe, expect, it } from 'vitest';
import { notifyProblemText, type NotifyResult } from './notify';

describe('notifyProblemText', () => {
  it('erklärt jeden Fehler, aber nicht den Erfolg', () => {
    expect(notifyProblemText('ok')).toBe('');
    const problems: NotifyResult[] = ['unsupported', 'not-allowed', 'no-worker', 'error'];
    for (const p of problems) expect(notifyProblemText(p).length).toBeGreaterThan(10);
  });

  it('weist auf dem iPhone auf das Installieren hin', () => {
    expect(notifyProblemText('unsupported')).toContain('Home-Bildschirm');
  });
});
