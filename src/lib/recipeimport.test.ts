import { describe, expect, it } from 'vitest';
import { cleanIngredient, decodeEntities, findRecipe, normalizeRecipeUrl, pageData, parseDuration, parseInstructions, parseYield, recipeFromPage } from './recipeimport';

const page = (jsonld: unknown, head = '') => `<!doctype html><html><head><title>Seite | Blog</title>${head}
<script type="application/ld+json">${typeof jsonld === 'string' ? jsonld : JSON.stringify(jsonld)}</script></head><body><script>var x = 1;</script></body></html>`;

// So liefert Chefkoch sein Rezept (gekürzt): Schritte als ein Text mit Zeilenumbrüchen
const chefkoch = {
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Spaghetti Carbonara',
  image: 'https://img.chefkoch-cdn.de/rezepte/1108101216891426/bilder/carbonara.jpg',
  recipeYield: '4 Portion(en)',
  prepTime: 'P0DT0H15M',
  cookTime: 'P0DT0H10M',
  totalTime: 'P0DT0H25M',
  recipeIngredient: ['500 g Spaghetti', '150 g Pancetta', '4  Eigelb', '100 g Parmesan, frisch gerieben', '1 Prise Salz'],
  recipeInstructions: 'Die Spaghetti in Salzwasser bissfest kochen.\nPancetta würfeln und knusprig braten.\n\nEigelb mit Parmesan verrühren &amp; unter die Nudeln heben.',
  recipeCategory: 'Hauptspeise',
  keywords: 'Nudeln, Pasta, Italien, Schnell, Ei, Käse',
};

// WordPress mit „WP Recipe Maker“: Rezept im @graph, Schritte in Abschnitten
const blog = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebPage', name: 'Ofengemüse' },
    {
      '@type': ['Recipe'],
      name: 'Ofengemüse mit Feta &#8211; schnell',
      image: [{ '@type': 'ImageObject', url: 'https://blog.example/ofen.jpg' }],
      recipeYield: ['2', '2 Portionen'],
      totalTime: 'PT1H5M',
      recipeIngredient: ['▢ 2 Paprika', '200g Feta', '1 EL Olivenöl'],
      recipeInstructions: [
        { '@type': 'HowToSection', name: 'Vorbereiten', itemListElement: [{ '@type': 'HowToStep', text: 'Ofen auf 200 °C vorheizen.' }, { '@type': 'HowToStep', text: 'Gemüse schneiden.' }] },
        { '@type': 'HowToSection', name: 'Backen', itemListElement: [{ '@type': 'HowToStep', name: 'Backen', text: '<p>Alles 30 Minuten backen.</p>' }] },
      ],
      recipeCuisine: 'Mediterran',
      recipeCategory: ['Hauptgericht', 'Vegetarisch'],
    },
  ],
};

describe('Rezept-Import per Link', () => {
  it('liest ein Chefkoch-Rezept', () => {
    const r = recipeFromPage(pageData(page(chefkoch)), 'https://www.chefkoch.de/rezepte/1108101216891426/Spaghetti-Carbonara.html');
    expect(r?.complete).toBe(true);
    expect(r?.recipe).toMatchObject({
      title: 'Spaghetti Carbonara',
      minutes: 25,
      servings: 4,
      image: 'https://img.chefkoch-cdn.de/rezepte/1108101216891426/bilder/carbonara.jpg',
      url: 'https://www.chefkoch.de/rezepte/1108101216891426/Spaghetti-Carbonara.html',
      tags: 'Hauptspeise, Nudeln, Pasta, Italien',
    });
    expect(r?.recipe.ingredients.split('\n')).toEqual(['500 g Spaghetti', '150 g Pancetta', '4 Eigelb', '100 g Parmesan, frisch gerieben', '1 Prise Salz']);
    expect(r?.recipe.steps.split('\n')).toEqual([
      'Die Spaghetti in Salzwasser bissfest kochen.',
      'Pancetta würfeln und knusprig braten.',
      'Eigelb mit Parmesan verrühren & unter die Nudeln heben.',
    ]);
  });

  it('findet Rezepte im @graph mit Abschnitten und Bild-Objekten', () => {
    const r = recipeFromPage(pageData(page(blog)), 'https://blog.example/ofengemuese/');
    expect(r?.recipe).toMatchObject({
      title: 'Ofengemüse mit Feta – schnell',
      minutes: 65,
      servings: 2,
      image: 'https://blog.example/ofen.jpg',
      ingredients: '2 Paprika\n200 g Feta\n1 EL Olivenöl',
      steps: 'Ofen auf 200 °C vorheizen.\nGemüse schneiden.\nAlles 30 Minuten backen.',
      tags: 'Hauptgericht, Vegetarisch, Mediterran',
    });
  });

  it('übersteht kaputtes JSON mit Zeilenumbrüchen in Texten', () => {
    const broken = '{"@type":"Recipe","name":"Linsen\nsuppe","recipeIngredient":["200 g rote Linsen"],"recipeInstructions":"Kochen."}';
    const r = recipeFromPage(pageData(page(broken)), 'https://x.example/');
    expect(r?.recipe.title).toBe('Linsen suppe');
    expect(r?.recipe.ingredients).toBe('200 g rote Linsen');
  });

  it('nimmt ohne Rezeptdaten Titel und Foto der Seite', () => {
    const html = '<html><head><title>Omas Apfelkuchen – Mein Blog</title><meta property="og:image" content="/bilder/kuchen.jpg"><meta property="og:title" content="Omas Apfelkuchen | Mein Blog"></head></html>';
    const r = recipeFromPage(pageData(html), 'https://blog.example/kuchen/');
    expect(r).toEqual({
      complete: false,
      recipe: { title: 'Omas Apfelkuchen', minutes: 0, servings: 2, ingredients: '', steps: '', image: 'https://blog.example/bilder/kuchen.jpg', url: 'https://blog.example/kuchen/', tags: '' },
    });
    expect(recipeFromPage(pageData('<html></html>'), 'https://x.example/')).toBeNull();
  });

  it('sucht auch in Listen und mainEntity', () => {
    expect(findRecipe([JSON.stringify([{ '@type': 'Organization' }, { '@type': 'WebPage', mainEntity: { '@type': 'http://schema.org/Recipe', name: 'A' } }])])?.name).toBe('A');
    expect(findRecipe(['kein json', JSON.stringify({ '@type': 'Article' })])).toBeNull();
  });

  it('versteht Dauer, Portionen und Schritte', () => {
    expect(parseDuration('PT1H30M')).toBe(90);
    expect(parseDuration('P0DT0H45M')).toBe(45);
    expect(parseDuration('PT90S')).toBe(2);
    expect(parseDuration('1 Std. 20 Min.')).toBe(80);
    expect(parseDuration('')).toBe(0);
    expect(parseYield('6 Stück')).toBe(6);
    expect(parseYield(['', '3'])).toBe(3);
    expect(parseYield(undefined)).toBe(0);
    expect(parseInstructions(['1. Wasser kochen', 'Schritt 2: Salzen', { '@type': 'HowToStep', text: 'Nudeln rein' }])).toEqual(['Wasser kochen', 'Salzen', 'Nudeln rein']);
    expect(parseInstructions('<ol><li>Schälen</li><li>Kochen</li></ol>')).toEqual(['Schälen', 'Kochen']);
  });

  it('säubert Zutaten und Entitäten', () => {
    expect(cleanIngredient('200&nbsp;g  Mehl ')).toBe('200 g Mehl');
    expect(cleanIngredient('1  Zwiebel(n) , gewürfelt')).toBe('1 Zwiebel(n), gewürfelt');
    expect(decodeEntities('Fett &amp; Zucker &#8211; &#x263A; &frac12;')).toBe('Fett & Zucker – ☺ ½');
  });

  it('erkennt Links auch ohne https:// oder mit Text drumherum', () => {
    expect(normalizeRecipeUrl('Schau mal: https://www.chefkoch.de/rezepte/1/A.html#kommentare')).toBe('https://www.chefkoch.de/rezepte/1/A.html');
    expect(normalizeRecipeUrl('chefkoch.de/rezepte/1/A.html')).toBe('https://chefkoch.de/rezepte/1/A.html');
    expect(normalizeRecipeUrl('Nudeln mit Pesto')).toBeNull();
    expect(normalizeRecipeUrl('javascript:alert(1)')).toBeNull();
  });
});
