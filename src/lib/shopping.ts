/** Abteilungen in der Reihenfolge eines typischen Supermarkt-Rundgangs */
export const AISLES = [
  { id: 'obst', label: 'Obst & Gemüse', icon: '🥦' },
  { id: 'backwaren', label: 'Backwaren', icon: '🥖' },
  { id: 'kuehl', label: 'Milch & Kühlregal', icon: '🧀' },
  { id: 'fleisch', label: 'Fleisch & Fisch', icon: '🥩' },
  { id: 'vorrat', label: 'Vorrat & Konserven', icon: '🥫' },
  { id: 'tk', label: 'Tiefkühl', icon: '🧊' },
  { id: 'snacks', label: 'Snacks & Süßes', icon: '🍫' },
  { id: 'getraenke', label: 'Getränke', icon: '🧃' },
  { id: 'drogerie', label: 'Drogerie & Haushalt', icon: '🧴' },
  { id: 'sonstiges', label: 'Sonstiges', icon: '🛒' },
] as const;

export type AisleId = (typeof AISLES)[number]['id'];

const KEYWORDS: Record<Exclude<AisleId, 'sonstiges'>, string[]> = {
  obst: ['apfel', 'äpfel', 'banane', 'birne', 'orange', 'zitrone', 'limette', 'traube', 'beere', 'kiwi', 'mango', 'avocado', 'tomate', 'gurke', 'paprika', 'salat', 'zwiebel', 'knoblauch', 'kartoffel', 'karotte', 'möhre', 'brokkoli', 'zucchini', 'spinat', 'pilz', 'champignon', 'kräuter', 'petersilie', 'basilikum', 'ingwer', 'lauch', 'kohl', 'obst', 'gemüse', 'aubergine', 'mais', 'melone', 'ananas'],
  backwaren: ['brot', 'brötchen', 'toast', 'baguette', 'croissant', 'brezel', 'wrap', 'tortilla', 'semmel', 'knäcke'],
  kuehl: ['milch', 'joghurt', 'quark', 'käse', 'butter', 'sahne', 'schmand', 'ei', 'eier', 'mozzarella', 'feta', 'frischkäse', 'skyr', 'tofu', 'hafermilch', 'margarine', 'aufstrich', 'hummus'],
  fleisch: ['hähnchen', 'huhn', 'pute', 'rind', 'hack', 'schwein', 'wurst', 'schinken', 'salami', 'speck', 'lachs', 'thunfisch', 'fisch', 'garnele', 'fleisch', 'steak', 'würstchen'],
  vorrat: ['nudel', 'pasta', 'spaghetti', 'reis', 'mehl', 'zucker', 'salz', 'pfeffer', 'öl', 'essig', 'müsli', 'haferflocken', 'linsen', 'bohnen', 'kichererbsen', 'dose', 'tomatenmark', 'passierte', 'brühe', 'gewürz', 'honig', 'marmelade', 'nutella', 'kaffee', 'tee', 'senf', 'ketchup', 'mayo', 'sauce', 'soße', 'cornflakes'],
  tk: ['tiefkühl', 'tk-', 'pizza', 'pommes', 'eis', 'spinat tk', 'fischstäbchen'],
  snacks: ['schokolade', 'chips', 'kekse', 'gummibärchen', 'nüsse', 'riegel', 'popcorn', 'süßigkeit', 'cracker', 'kuchen'],
  getraenke: ['wasser', 'saft', 'cola', 'limo', 'bier', 'wein', 'sprudel', 'mate', 'energy', 'smoothie', 'eistee'],
  drogerie: ['zahnpasta', 'zahnbürste', 'shampoo', 'duschgel', 'seife', 'deo', 'klopapier', 'toilettenpapier', 'taschentücher', 'spülmittel', 'waschmittel', 'müllbeutel', 'küchenrolle', 'schwamm', 'creme', 'rasierer', 'tampons', 'binden', 'pflaster', 'putzmittel', 'alufolie', 'backpapier'],
};

/** Ordnet einen Artikel automatisch einer Abteilung zu (wie die Einkaufsliste in Erinnerungen). */
export function categorize(name: string): AisleId {
  const n = name.toLowerCase();
  const words = n.split(/[\s,-]+/);
  // Spezifische Abteilungen zuerst prüfen, damit z. B. „Tiefkühl-Spinat“ nicht im Gemüse landet
  const order: Exclude<AisleId, 'sonstiges'>[] = ['tk', 'drogerie', 'getraenke', 'backwaren', 'kuehl', 'fleisch', 'snacks', 'vorrat', 'obst'];
  for (const aisle of order) {
    for (const k of KEYWORDS[aisle]) {
      // Kurze Wörter (z. B. „ei“, „eis“) nur als ganzes Wort, sonst auch als Wortteil („Vollkornbrot“)
      if (k.length <= 3 ? words.includes(k) : n.includes(k)) return aisle;
    }
  }
  return 'sonstiges';
}

export interface ParsedItem {
  name: string;
  amount: string;
}

/**
 * Versteht „Milch, 6 Eier, 500 g Hack, Äpfel x3“ – mehrere Artikel durch Komma oder
 * Zeilenumbruch, Menge vorne (mit Einheit) oder als „x3“ hinten.
 */
export function parseShopping(input: string): ParsedItem[] {
  return input
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const front = s.match(/^(\d+(?:[.,]\d+)?\s*(?:x|×|g|kg|ml|l|stk\.?|stück|pck\.?|packung(?:en)?|dosen?|flaschen?|bund)?)\s+(.+)$/i);
      if (front) return { amount: front[1].trim(), name: front[2].trim() };
      const back = s.match(/^(.+?)\s+(?:x|×)\s?(\d+)$/i);
      if (back) return { amount: back[2], name: back[1].trim() };
      return { amount: '', name: s };
    })
    .map((x) => ({ ...x, name: x.name.charAt(0).toUpperCase() + x.name.slice(1) }));
}

export interface Frequent {
  name: string;
  count: number;
}

/** Merkt sich gekaufte Artikel für „Häufig gekauft“ (höchstens 30). */
export function rememberBought(frequent: Frequent[], names: string[]): Frequent[] {
  const map = new Map(frequent.map((f) => [f.name.toLowerCase(), { ...f }]));
  for (const name of names) {
    const key = name.toLowerCase();
    const hit = map.get(key);
    if (hit) hit.count++;
    else map.set(key, { name, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 30);
}
