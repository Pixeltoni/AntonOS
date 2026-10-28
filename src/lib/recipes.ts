import type { DateStr, Meal, MealSlot, Recipe, ShoppingItem } from '../types';

export const MEAL_SLOTS: { id: MealSlot; label: string }[] = [
  { id: 'mittag', label: 'Mittags' },
  { id: 'abend', label: 'Abends' },
];

export interface Ingredient {
  /** Menge mit Einheit, z. B. „200 g“ (leer = ohne Menge) */
  amount: string;
  name: string;
}

const UNITS = 'g|kg|mg|ml|cl|dl|l|el|tl|msp|prise[n]?|stk\\.?|stück|zehe[n]?|dose[n]?|pck\\.?|päckchen|packung(?:en)?|bund|becher|tasse[n]?|scheibe[n]?|glas|gläser|handvoll|zweig[e]?|blatt|blätter|x';
const NUMBER = '\\d+(?:[.,]\\d+)?(?:\\s*\\/\\s*\\d+)?|[½⅓⅔¼¾]|\\d+\\s*[½⅓⅔¼¾]';
const LINE = new RegExp(`^((?:${NUMBER})(?:\\s*-\\s*(?:${NUMBER}))?\\s*(?:(?:${UNITS})\\b\\.?)?)\\s+(.+)$`, 'i');

/** „200 g Feta“, „½ TL Salz“, „2 Paprika“ – eine Zutat pro Zeile, Aufzählungszeichen werden ignoriert. */
export function parseIngredients(text: string): Ingredient[] {
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•–]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(LINE);
      return m ? { amount: m[1].trim(), name: m[2].trim() } : { amount: '', name: line };
    });
}

/** Schritte: eine Zeile bzw. ein Absatz pro Schritt, Nummern am Anfang fallen weg */
export function parseSteps(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim())
    .filter(Boolean);
}

const FRACTIONS: Record<string, number> = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75 };

function parseNumber(raw: string): number | null {
  const s = raw.replace(/\s+/g, '');
  const mixed = s.match(/^(\d+)([½⅓⅔¼¾])$/);
  if (mixed) return Number(mixed[1]) + FRACTIONS[mixed[2]];
  if (FRACTIONS[s] !== undefined) return FRACTIONS[s];
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : null;
  const v = Number(s.replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

function formatNumber(v: number, unit: string): string {
  // Gramm und Milliliter ab 10 ganzzahlig, sonst höchstens eine Nachkommastelle bzw. halbe Stücke
  const coarse = /^(g|ml|mg)$/i.test(unit) && v >= 10;
  const rounded = coarse ? Math.round(v) : Math.round(v * 10) / 10;
  const half = Math.round(v * 2) / 2;
  if (!coarse && !unit && Math.abs(half - v) < 0.06) {
    if (half === 0.5) return '½';
    if (half % 1 === 0.5) return `${Math.floor(half)}½`;
    return String(half);
  }
  return rounded.toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

const PLURALS: Record<string, string> = { dose: 'Dosen', zehe: 'Zehen', prise: 'Prisen', packung: 'Packungen', scheibe: 'Scheiben', tasse: 'Tassen', zweig: 'Zweige' };

/** „2 Dose“ → „2 Dosen“: Einheit passend zur Menge */
const unitFor = (unit: string, value: number) => (value > 1 && PLURALS[unit.toLowerCase()] ? PLURALS[unit.toLowerCase()] : unit);

/** Menge umrechnen: „200 g“ × 1,5 → „300 g“, „1–2 EL“ × 2 → „2–4 EL“. Ohne Zahl bleibt alles, wie es ist. */
export function scaleAmount(amount: string, factor: number): string {
  if (!amount || factor === 1) return amount;
  const m = amount.match(new RegExp(`^(${NUMBER})(?:\\s*-\\s*(${NUMBER}))?\\s*(.*)$`, 'i'));
  if (!m) return amount;
  const unit = m[3].trim();
  const a = parseNumber(m[1]);
  if (a === null) return amount;
  const b = m[2] ? parseNumber(m[2]) : null;
  const value = formatNumber(a * factor, unit) + (b !== null ? `–${formatNumber(b * factor, unit)}` : '');
  return unit ? `${value} ${unitFor(unit, a * factor)}` : value;
}

const nameKey = (s: string) => s.trim().toLowerCase();

/** Zutaten, die noch fehlen: ohne die als vorrätig markierten und ohne die, die schon offen auf der Einkaufsliste stehen. */
export function missingIngredients(items: Ingredient[], have: Set<string>, shopping: Pick<ShoppingItem, 'name' | 'done'>[]): Ingredient[] {
  const onList = new Set(shopping.filter((s) => !s.done).map((s) => nameKey(s.name)));
  return items.filter((i) => !have.has(nameKey(i.name)) && !onList.has(nameKey(i.name)));
}

/** Gleiche Zutaten mehrerer Rezepte zusammenfassen: „200 g Feta“ + „100 g Feta“ → „300 g Feta“. */
export function mergeIngredients(items: Ingredient[]): Ingredient[] {
  const out: Ingredient[] = [];
  for (const item of items) {
    const hit = out.find((o) => nameKey(o.name) === nameKey(item.name));
    if (!hit) {
      out.push({ ...item });
      continue;
    }
    const a = hit.amount.match(/^([\d.,]+)\s*(.*)$/);
    const b = item.amount.match(/^([\d.,]+)\s*(.*)$/);
    const singular = (u: string) => Object.entries(PLURALS).find(([, pl]) => pl.toLowerCase() === u.toLowerCase())?.[0] ?? u.toLowerCase();
    if (a && b && singular(a[2]) === singular(b[2])) {
      const sum = Number(a[1].replace(',', '.')) + Number(b[1].replace(',', '.'));
      hit.amount = `${formatNumber(sum, a[2])}${a[2] ? ` ${unitFor(a[2], sum)}` : ''}`;
    } else if (item.amount) {
      hit.amount = hit.amount ? `${hit.amount} + ${item.amount}` : item.amount;
    }
  }
  return out;
}

/** Alle Zutaten der geplanten Gerichte an diesen Tagen, passend zu den geplanten Portionen. */
export function plannedIngredients(meals: Meal[], recipes: Recipe[], days: DateStr[]): Ingredient[] {
  const all: Ingredient[] = [];
  for (const meal of meals) {
    if (!days.includes(meal.date) || !meal.recipeId) continue;
    const recipe = recipes.find((r) => r.id === meal.recipeId);
    if (!recipe) continue;
    const factor = meal.servings && recipe.servings > 0 ? meal.servings / recipe.servings : 1;
    for (const i of parseIngredients(recipe.ingredients)) all.push({ ...i, amount: scaleAmount(i.amount, factor) });
  }
  return mergeIngredients(all);
}

/** Name des Gerichts im Plan */
export function mealTitle(meal: Meal, recipes: Recipe[]): string {
  return (meal.recipeId && recipes.find((r) => r.id === meal.recipeId)?.title) || meal.title || 'Gericht';
}
