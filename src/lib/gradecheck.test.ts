import { describe, expect, it } from 'vitest';
import { checkGrade } from '../pages/Grades';

describe('Notenprüfung', () => {
  it('meldet ungültige Noten verständlich', () => {
    expect(checkGrade('1,7', '100')).toBeNull();
    expect(checkGrade('7,0', '100')).toBe('Noten gehen von 1,0 (sehr gut) bis 5,0 (nicht bestanden).');
    expect(checkGrade('', '100')).toBe('Bitte gib eine Note ein.');
    expect(checkGrade('2,0', '0')).toBe('Die Gewichtung muss zwischen 1 und 100 % liegen.');
  });
});
