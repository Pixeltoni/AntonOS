import { describe, expect, it } from 'vitest';
import type { Admission, ExerciseSheet } from '../types';
import { admissionState, describeAdmission, nextSheetNumber } from './sheets';

const rule: Admission = { sheets: 10, maxPerSheet: 20, required: 50, unit: 'prozent' };
const sheet = (number: number, points: number | null, max = 20): ExerciseSheet => ({ id: `s${number}`, courseId: 'a', number, due: null, points, max });

describe('Klausurzulassung', () => {
  it('rechnet mit angelegten und noch fehlenden Blättern', () => {
    const s = admissionState(rule, [sheet(1, 14), sheet(2, 12), sheet(3, null)]);
    expect(s.total).toBe(200);
    expect(s.required).toBe(100);
    expect(s.earned).toBe(26);
    expect(s.graded).toBe(2);
    expect(s.open).toBe(8);
    expect(s.openMax).toBe(160);
    expect(s.share).toBeCloseTo(0.65);
    expect(s.needShare).toBeCloseTo(74 / 160);
    expect(s.status).toBe('auf Kurs');
  });

  it('erkennt knapp, geschafft und unmöglich', () => {
    expect(admissionState(rule, [sheet(1, 6), sheet(2, 8)]).status).toBe('knapp');
    const done = admissionState({ ...rule, sheets: 5 }, [1, 2, 3, 4, 5].map((n) => sheet(n, 20)));
    expect(done.status).toBe('geschafft');
    const lost = admissionState({ ...rule, sheets: 4 }, [sheet(1, 0), sheet(2, 0), sheet(3, 0)]);
    expect(lost.status).toBe('unmöglich');
    expect(describeAdmission(lost)).toBe('Nicht mehr zu schaffen: Selbst mit allen restlichen Punkten fehlen 20.');
  });

  it('kennt feste Punktzahlen und mehr Blätter als geplant', () => {
    const s = admissionState({ sheets: 2, maxPerSheet: 10, required: 15, unit: 'punkte' }, [sheet(1, 9, 10), sheet(2, 8, 10), sheet(3, null, 12)]);
    expect(s.total).toBe(32);
    expect(s.required).toBe(15);
    expect(s.status).toBe('geschafft');
  });

  it('beschreibt den Stand ohne korrigierte Blätter', () => {
    const s = admissionState(rule, []);
    expect(s.status).toBe('offen');
    expect(describeAdmission(s)).toBe('Nötig sind 100 von 200 Punkten (50 %).');
  });

  it('zählt die Blätter weiter', () => {
    expect(nextSheetNumber([])).toBe(1);
    expect(nextSheetNumber([sheet(1, null), sheet(4, null)])).toBe(5);
  });
});
