import { describe, expect, it } from 'vitest';
import { joinSpeech, transcriptOf } from './speech';

const r = (transcript: string, isFinal: boolean) => ({ isFinal, 0: { transcript } });

describe('Spracheingabe', () => {
  it('setzt endgültige und vorläufige Ergebnisse zusammen', () => {
    expect(transcriptOf([r('Erinnere mich morgen', true), r(' um 8', true), r('dass ich', false)])).toEqual({
      final: 'Erinnere mich morgen um 8',
      interim: 'dass ich',
    });
    expect(transcriptOf([])).toEqual({ final: '', interim: '' });
  });

  it('verbindet Teile aus mehreren Sitzungen sauber', () => {
    expect(joinSpeech('Notiz ', '', ' Idee für die App')).toBe('Notiz Idee für die App');
  });
});
