import { describe, expect, it } from 'vitest';
import type { Meal, Recipe } from '../types';
import { mergeIngredients, missingIngredients, parseIngredients, parseSteps, plannedIngredients, scaleAmount } from './recipes';

const recipe: Recipe = { id: 'r', title: 'Ofengemüse', minutes: 40, servings: 2, ingredients: '2 Paprika\n200 g Feta\n- 1 Zucchini\n½ TL Salz\nPfeffer', steps: '1. Ofen vorheizen\n\n2) Gemüse schneiden', image: '', url: '', tags: '' };

describe('Rezepte', () => {
  it('liest Zutaten mit Mengen und Einheiten', () => {
    expect(parseIngredients(recipe.ingredients)).toEqual([
      { amount: '2', name: 'Paprika' },
      { amount: '200 g', name: 'Feta' },
      { amount: '1', name: 'Zucchini' },
      { amount: '½ TL', name: 'Salz' },
      { amount: '', name: 'Pfeffer' },
    ]);
    expect(parseIngredients('1,5 l Milch\n2-3 EL Olivenöl\n1 große Zwiebel')).toEqual([
      { amount: '1,5 l', name: 'Milch' },
      { amount: '2-3 EL', name: 'Olivenöl' },
      { amount: '1', name: 'große Zwiebel' },
    ]);
    expect(parseSteps(recipe.steps)).toEqual(['Ofen vorheizen', 'Gemüse schneiden']);
  });

  it('rechnet Mengen auf andere Portionen um', () => {
    expect(scaleAmount('200 g', 1.5)).toBe('300 g');
    expect(scaleAmount('2', 1.5)).toBe('3');
    expect(scaleAmount('1', 0.5)).toBe('½');
    expect(scaleAmount('½ TL', 2)).toBe('1 TL');
    expect(scaleAmount('1,5 l', 2)).toBe('3 l');
    expect(scaleAmount('2-3 EL', 2)).toBe('4–6 EL');
    expect(scaleAmount('etwas', 2)).toBe('etwas');
    expect(scaleAmount('125 g', 0.5)).toBe('63 g');
    expect(scaleAmount('1 Dose', 2)).toBe('2 Dosen');
  });

  it('zeigt nur, was wirklich fehlt', () => {
    const items = parseIngredients(recipe.ingredients);
    const missing = missingIngredients(items, new Set(['paprika', 'salz', 'pfeffer']), [{ name: 'Feta', done: false }, { name: 'Zucchini', done: true }]);
    expect(missing.map((i) => i.name)).toEqual(['Zucchini']);
  });

  it('fasst gleiche Zutaten der Woche zusammen', () => {
    expect(mergeIngredients([{ amount: '200 g', name: 'Feta' }, { amount: '100 g', name: 'feta' }, { amount: '1', name: 'Zwiebel' }, { amount: '2 Stück', name: 'Zwiebel' }])).toEqual([
      { amount: '300 g', name: 'Feta' },
      { amount: '1 + 2 Stück', name: 'Zwiebel' },
    ]);
    const meals: Meal[] = [
      { id: 'm1', date: '2026-10-28', slot: 'abend', recipeId: 'r', title: '', servings: 4 },
      { id: 'm2', date: '2026-10-29', slot: 'abend', recipeId: 'r', title: '' },
      { id: 'm3', date: '2026-11-10', slot: 'abend', recipeId: 'r', title: '' },
    ];
    const all = plannedIngredients(meals, [recipe], ['2026-10-28', '2026-10-29']);
    expect(all.find((i) => i.name === 'Feta')?.amount).toBe('600 g');
    expect(all.find((i) => i.name === 'Paprika')?.amount).toBe('6');
  });
});
