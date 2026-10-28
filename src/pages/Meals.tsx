import { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { DateStr, ID, Meal, MealSlot, Recipe, WidgetVariant } from '../types';
import { addDays, parseDate, today } from '../lib/dates';
import { weekDays } from '../lib/calendar';
import { safeHttpUrl } from '../lib/life';
import { categorize } from '../lib/shopping';
import { MEAL_SLOTS, mealTitle, missingIngredients, parseIngredients, parseSteps, plannedIngredients, scaleAmount, type Ingredient } from '../lib/recipes';
import { Empty, PageHeader, Panel } from '../components/ui';
import { Cover, ImageInput } from '../components/widgets';
import { AddButton, Sheet } from '../components/sheet';
import { useToast } from '../components/toast';

type Draft = Omit<Recipe, 'id'>;
const blank = (): Draft => ({ title: '', minutes: 30, servings: 2, ingredients: '', steps: '', image: '', url: '', tags: '' });

const dayName = (d: DateStr) => parseDate(d).toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');
const dayLabel = (d: DateStr) => parseDate(d).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

/** Zutaten auf die Einkaufsliste – was schon offen draufsteht, kommt nicht doppelt. */
function useAddToShopping() {
  const { data, add } = useStore();
  const { show } = useToast();
  return (items: Ingredient[]) => {
    const open = new Set(data.shopping.filter((s) => !s.done).map((s) => s.name.toLowerCase()));
    const fresh = items.filter((i) => !open.has(i.name.toLowerCase()));
    for (const i of fresh) add('shopping', { name: i.name, amount: i.amount, aisle: categorize(i.name), done: false, added: today() });
    show(fresh.length ? `${fresh.length} ${fresh.length === 1 ? 'Zutat' : 'Zutaten'} auf der Einkaufsliste` : 'Steht schon alles auf der Einkaufsliste', { label: 'Ansehen', run: () => (location.hash = '#/einkauf') });
  };
}

function RecipeForm({ initial, onSave, onCancel }: { initial: Draft; onSave: (r: Draft) => void; onCancel: () => void }) {
  const [r, setR] = useState(initial);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setR((x) => ({ ...x, [k]: v }));
  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        if (r.title.trim()) onSave({ ...r, title: r.title.trim() });
      }}
    >
      <label className="full">Name<input value={r.title} onChange={(e) => set('title', e.target.value)} placeholder="z. B. Ofengemüse mit Feta" required autoFocus /></label>
      <label>Minuten<input type="number" min={0} value={r.minutes || ''} onChange={(e) => set('minutes', Math.max(0, Number(e.target.value)))} /></label>
      <label>Portionen<input type="number" min={1} value={r.servings} onChange={(e) => set('servings', Math.max(1, Number(e.target.value) || 1))} /></label>
      <label>Schlagwörter<input value={r.tags} onChange={(e) => set('tags', e.target.value)} placeholder="vegetarisch, schnell" /></label>
      <label>Link zum Original<input type="url" value={r.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…" /></label>
      <label className="full">Foto<ImageInput value={r.image} onChange={(v) => set('image', v)} /></label>
      <label className="full">Zutaten (eine pro Zeile)<textarea rows={6} value={r.ingredients} onChange={(e) => set('ingredients', e.target.value)} placeholder={'2 Paprika\n200 g Feta\n1 EL Olivenöl'} /></label>
      <label className="full">Zubereitung (ein Schritt pro Zeile)<textarea rows={6} value={r.steps} onChange={(e) => set('steps', e.target.value)} placeholder={'Ofen auf 200 °C vorheizen\nGemüse schneiden …'} /></label>
      <div className="row end">
        <button type="button" onClick={onCancel}>Abbrechen</button>
        <button className="primary" type="submit">Speichern</button>
      </div>
    </form>
  );
}

/** Fenster: Gericht für einen Tag einplanen – Rezept wählen oder freier Text wie „Mensa“ */
function PlanSheet({ date, slot, recipeId, onClose }: { date: DateStr; slot: MealSlot; recipeId?: ID; onClose: () => void }) {
  const { data, add } = useStore();
  const [day, setDay] = useState(date);
  const [when, setWhen] = useState<MealSlot>(slot);
  const [pick, setPick] = useState<ID | ''>(recipeId ?? '');
  const [title, setTitle] = useState('');
  const [query, setQuery] = useState('');
  const recipe = data.recipes.find((r) => r.id === pick);
  const [servings, setServings] = useState(recipe?.servings ?? 2);
  const list = data.recipes.filter((r) => r.title.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || a.title.localeCompare(b.title));
  return (
    <Sheet
      title="Einplanen"
      submitLabel="Einplanen"
      submitDisabled={!pick && !title.trim()}
      onClose={onClose}
      onSubmit={() => {
        add('meals', { date: day, slot: when, recipeId: pick || null, title: pick ? '' : title.trim(), servings: pick && recipe && servings !== recipe.servings ? servings : undefined });
        onClose();
      }}
    >
      <div className="row wrap">
        <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Tag" />
        <div className="segmented" role="radiogroup" aria-label="Mahlzeit">
          {MEAL_SLOTS.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={when === s.id} className={when === s.id ? 'selected' : ''} onClick={() => setWhen(s.id)}>{s.label}</button>
          ))}
        </div>
      </div>
      {data.recipes.length > 0 && (
        <>
          {data.recipes.length > 6 && <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rezept suchen …" aria-label="Rezept suchen" />}
          <ul className="list meal-pick">
            {list.map((r) => (
              <li key={r.id}>
                <label className="check grow">
                  <input type="radio" name="meal-recipe" checked={pick === r.id} onChange={() => { setPick(r.id); setServings(r.servings); }} />
                  <span className="grow">{r.favorite ? '★ ' : ''}{r.title}</span>
                  {r.minutes > 0 && <span className="muted small">{r.minutes} Min.</span>}
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      {pick ? (
        <div className="row">
          <label className="row grow">Portionen
            <input className="narrow" type="number" min={1} value={servings} onChange={(e) => setServings(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <button type="button" onClick={() => setPick('')}>Ohne Rezept</button>
        </div>
      ) : (
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={data.recipes.length ? 'oder frei eintragen, z. B. Mensa' : 'Was gibt es? z. B. Mensa, Pizza mit Lea'} aria-label="Gericht ohne Rezept" />
      )}
    </Sheet>
  );
}

/** Fenster: Zutaten der Woche prüfen und auf die Einkaufsliste setzen */
function WeekShoppingSheet({ items, onClose }: { items: Ingredient[]; onClose: () => void }) {
  const { data } = useStore();
  const addToShopping = useAddToShopping();
  const onList = new Set(data.shopping.filter((s) => !s.done).map((s) => s.name.toLowerCase()));
  const [chosen, setChosen] = useState(() => new Set(items.filter((i) => !onList.has(i.name.toLowerCase())).map((i) => i.name)));
  return (
    <Sheet
      title="Wocheneinkauf"
      submitLabel={`${chosen.size} hinzufügen`}
      submitDisabled={chosen.size === 0}
      onClose={onClose}
      onSubmit={() => {
        addToShopping(items.filter((i) => chosen.has(i.name)));
        onClose();
      }}
    >
      <p className="muted small">Alle Zutaten der geplanten Gerichte ab heute. Nimm den Haken weg, wenn du etwas noch zu Hause hast.</p>
      <ul className="list dense">
        {items.map((i) => (
          <li key={i.name}>
            <label className="check grow">
              <input type="checkbox" checked={chosen.has(i.name)} onChange={(e) => setChosen((s) => { const n = new Set(s); if (e.target.checked) n.add(i.name); else n.delete(i.name); return n; })} />
              <span className="grow">{i.name}</span>
              <span className="muted">{i.amount}</span>
              {onList.has(i.name.toLowerCase()) && <span className="muted small">schon auf der Liste</span>}
            </label>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function WeekPlan({ anchor }: { anchor: DateStr }) {
  const { data, remove } = useStore();
  const t = today();
  const days = weekDays(anchor);
  const [plan, setPlan] = useState<{ date: DateStr; slot: MealSlot } | null>(null);
  const [shopping, setShopping] = useState(false);
  const upcoming = days.filter((d) => d >= t);
  const items = plannedIngredients(data.meals, data.recipes, upcoming);
  return (
    <Panel
      title="Wochenplan"
      actions={<button type="button" onClick={() => setShopping(true)} disabled={items.length === 0} title="Alle Zutaten der Woche auf die Einkaufsliste">Zutaten → Einkaufsliste</button>}
    >
      <div className="meal-week">
        {days.map((d) => (
          <div key={d} className={`meal-day ${d === t ? 'today' : ''} ${d < t ? 'past' : ''}`}>
            <div className="meal-day-name"><strong>{dayName(d)}</strong><span className="muted small">{parseDate(d).getDate()}.</span></div>
            {MEAL_SLOTS.map((s) => {
              const meals = data.meals.filter((m) => m.date === d && m.slot === s.id);
              return (
                <div key={s.id} className="meal-slot">
                  <span className="meal-slot-label">{s.label}</span>
                  {meals.map((m) => <MealChip key={m.id} meal={m} onRemove={() => remove('meals', m.id)} />)}
                  {meals.length === 0 && (
                    <button type="button" className="meal-add" onClick={() => setPlan({ date: d, slot: s.id })} aria-label={`${s.label} am ${dayLabel(d)} einplanen`}>+</button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {data.recipes.length === 0 && <p className="muted small">Tipp: Lege unter „Rezepte“ deine Lieblingsgerichte an – dann landen die Zutaten mit einem Tipp auf der Einkaufsliste.</p>}
      {plan && <PlanSheet date={plan.date} slot={plan.slot} onClose={() => setPlan(null)} />}
      {shopping && <WeekShoppingSheet items={items} onClose={() => setShopping(false)} />}
    </Panel>
  );
}

function MealChip({ meal, onRemove }: { meal: Meal; onRemove: () => void }) {
  const { data } = useStore();
  const title = mealTitle(meal, data.recipes);
  const recipe = meal.recipeId ? data.recipes.find((r) => r.id === meal.recipeId) : undefined;
  return (
    <span className={`meal-chip ${recipe ? 'has-recipe' : ''}`}>
      {recipe ? <a href={`#/essen/${recipe.id}`}>{title}</a> : <span>{title}</span>}
      {meal.servings && <span className="muted small">{meal.servings} P.</span>}
      <button type="button" className="icon" onClick={onRemove} aria-label={`${title} aus dem Plan nehmen`} title="Entfernen">×</button>
    </span>
  );
}

function RecipeCard({ recipe }: { recipe: Recipe }) {
  const count = parseIngredients(recipe.ingredients).length;
  return (
    <a className="gallery-card" href={`#/essen/${recipe.id}`}>
      <Cover src={recipe.image} seed={recipe.id} emoji="🍽️" />
      <div className="gallery-body">
        <strong>{recipe.favorite ? '★ ' : ''}{recipe.title}</strong>
        <div className="meta">
          {recipe.minutes > 0 && <span>{recipe.minutes} Min.</span>}
          <span>{recipe.servings} {recipe.servings === 1 ? 'Portion' : 'Portionen'}</span>
          {count > 0 && <span>{count} Zutaten</span>}
        </div>
        {recipe.tags && <div className="meta">{recipe.tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => <span key={t} className="tag">{t}</span>)}</div>}
      </div>
    </a>
  );
}

function RecipeGallery() {
  const { data } = useStore();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const list = data.recipes
    .filter((r) => !q || `${r.title} ${r.tags} ${r.ingredients}`.toLowerCase().includes(q))
    .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || a.title.localeCompare(b.title));
  return (
    <>
      {data.recipes.length > 0 && <input className="recipe-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rezepte oder Zutaten suchen …" aria-label="Rezepte durchsuchen" />}
      {list.length === 0 ? <Empty>{data.recipes.length ? 'Kein Rezept gefunden.' : 'Noch keine Rezepte. Tipp: Rezept-Links aus dem Browser kannst du über „Teilen → AntonOS“ direkt speichern.'}</Empty> : (
        <div className="gallery">{list.map((r) => <RecipeCard key={r.id} recipe={r} />)}</div>
      )}
    </>
  );
}

const TAB_KEY = 'antonos:essen-ansicht';

export function Meals() {
  const { add } = useStore();
  const t = today();
  const [anchor, setAnchor] = useState(t);
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<'plan' | 'rezepte'>(() => {
    try {
      return localStorage.getItem(TAB_KEY) === 'rezepte' ? 'rezepte' : 'plan';
    } catch {
      return 'plan';
    }
  });
  const choose = (next: 'plan' | 'rezepte') => {
    setTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // egal
    }
  };
  const days = weekDays(anchor);
  const range = `${parseDate(days[0]).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })} – ${parseDate(days[6]).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}`;
  return (
    <>
      <PageHeader
        title="Essen"
        subtitle={tab === 'plan' ? `Woche ${range}` : 'Deine Rezepte'}
        actions={
          <>
            {tab === 'plan' && (
              <>
                <button onClick={() => setAnchor(addDays(anchor, -7))} aria-label="Vorige Woche">‹</button>
                <button onClick={() => setAnchor(t)}>Diese Woche</button>
                <button onClick={() => setAnchor(addDays(anchor, 7))} aria-label="Nächste Woche">›</button>
              </>
            )}
            {!adding && <AddButton label="Neues Rezept" onClick={() => setAdding(true)} />}
          </>
        }
      />
      <div className="segmented page-tabs" role="tablist" aria-label="Ansicht">
        <button type="button" role="tab" aria-selected={tab === 'plan'} className={tab === 'plan' ? 'selected' : ''} onClick={() => choose('plan')}>Wochenplan</button>
        <button type="button" role="tab" aria-selected={tab === 'rezepte'} className={tab === 'rezepte' ? 'selected' : ''} onClick={() => choose('rezepte')}>Rezepte</button>
      </div>
      {adding && (
        <Panel title="Neues Rezept">
          <RecipeForm initial={blank()} onCancel={() => setAdding(false)} onSave={(r) => { const id = add('recipes', r); setAdding(false); location.hash = `#/essen/${id}`; }} />
        </Panel>
      )}
      {tab === 'plan' ? <WeekPlan anchor={anchor} /> : <RecipeGallery />}
    </>
  );
}

/** Kochmodus: ein Schritt pro Seite, große Schrift, Bildschirm bleibt an */
function CookMode({ recipe, factor, onClose }: { recipe: Recipe; factor: number; onClose: () => void }) {
  const steps = parseSteps(recipe.steps);
  const [i, setI] = useState(0);
  const [showIngredients, setShowIngredients] = useState(steps.length === 0);
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => undefined);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((x) => Math.min(steps.length - 1, x + 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      lock?.release().catch(() => undefined);
    };
  }, [onClose, steps.length]);
  return (
    <div className="cook-mode" role="dialog" aria-modal="true" aria-label={`Kochmodus: ${recipe.title}`}>
      <div className="row between">
        <strong>{recipe.title}</strong>
        <div className="row">
          <button type="button" onClick={() => setShowIngredients((s) => !s)}>{showIngredients ? 'Schritte' : 'Zutaten'}</button>
          <button type="button" onClick={onClose}>Fertig</button>
        </div>
      </div>
      {showIngredients ? (
        <ul className="cook-ingredients">
          {parseIngredients(recipe.ingredients).map((x, k) => <li key={k}><strong>{scaleAmount(x.amount, factor)}</strong> {x.name}</li>)}
        </ul>
      ) : (
        <>
          <span className="muted">Schritt {i + 1} von {steps.length}</span>
          <p className="cook-step">{steps[i]}</p>
          <div className="row between cook-nav">
            <button type="button" onClick={() => setI(i - 1)} disabled={i === 0}>‹ Zurück</button>
            {i < steps.length - 1 ? <button type="button" className="primary" onClick={() => setI(i + 1)}>Weiter ›</button> : <button type="button" className="primary" onClick={onClose}>Guten Appetit!</button>}
          </div>
        </>
      )}
    </div>
  );
}

export function RecipeDetail({ id }: { id: ID }) {
  const { data, update, remove } = useStore();
  const addToShopping = useAddToShopping();
  const recipe = data.recipes.find((r) => r.id === id);
  const [editing, setEditing] = useState(false);
  const [servings, setServings] = useState(recipe?.servings ?? 2);
  const [have, setHave] = useState<Set<string>>(new Set());
  const [cooking, setCooking] = useState(false);
  const [planning, setPlanning] = useState(false);
  if (!recipe) return <Empty>Rezept nicht gefunden. <a href="#/essen">Zurück</a></Empty>;

  const factor = recipe.servings > 0 ? servings / recipe.servings : 1;
  const ingredients = parseIngredients(recipe.ingredients).map((i) => ({ ...i, amount: scaleAmount(i.amount, factor) }));
  const steps = parseSteps(recipe.steps);
  const missing = missingIngredients(ingredients, have, data.shopping);
  const onList = new Set(data.shopping.filter((s) => !s.done).map((s) => s.name.toLowerCase()));
  const link = safeHttpUrl(recipe.url);
  const planned = data.meals.filter((m) => m.recipeId === id && m.date >= today()).sort((a, b) => a.date.localeCompare(b.date));
  const toggleHave = (name: string) => setHave((s) => {
    const n = new Set(s);
    const k = name.toLowerCase();
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  return (
    <>
      {recipe.image && <Cover src={recipe.image} seed={recipe.id} className="banner" />}
      <PageHeader
        title={recipe.title}
        subtitle={[recipe.minutes ? `${recipe.minutes} Min.` : '', recipe.tags].filter(Boolean).join(' · ') || undefined}
        actions={
          <>
            <a className="button" href="#/essen">‹ Essen</a>
            <button onClick={() => update('recipes', id, { favorite: !recipe.favorite })} aria-pressed={!!recipe.favorite}>{recipe.favorite ? '★ Favorit' : '☆ Favorit'}</button>
            <button onClick={() => setEditing((e) => !e)}>{editing ? 'Schließen' : 'Bearbeiten'}</button>
            <button className="danger" onClick={() => { if (confirm(`Rezept „${recipe.title}“ löschen?`)) { remove('recipes', id); location.hash = '#/essen'; } }}>Löschen</button>
          </>
        }
      />
      {editing && (
        <Panel title="Rezept bearbeiten">
          <RecipeForm initial={recipe} onCancel={() => setEditing(false)} onSave={(r) => { update('recipes', id, r); setServings(r.servings); setEditing(false); }} />
        </Panel>
      )}
      <div className="row wrap recipe-actions">
        <span className="stepper" aria-label="Portionen">
          <button type="button" onClick={() => setServings(Math.max(1, servings - 1))} aria-label="Eine Portion weniger">−</button>
          <span>{servings} {servings === 1 ? 'Portion' : 'Portionen'}</span>
          <button type="button" onClick={() => setServings(servings + 1)} aria-label="Eine Portion mehr">+</button>
        </span>
        {steps.length > 0 && <button type="button" className="primary" onClick={() => setCooking(true)}>Kochen</button>}
        <button type="button" onClick={() => setPlanning(true)}>Einplanen</button>
        {link && <a className="button" href={link} target="_blank" rel="noreferrer">Original-Rezept ↗</a>}
      </div>
      {planned.length > 0 && <p className="muted small">Geplant: {planned.map((m) => `${dayLabel(m.date)} (${MEAL_SLOTS.find((s) => s.id === m.slot)?.label})`).join(', ')}</p>}
      <div className="grid-2">
        <Panel
          title="Zutaten"
          actions={ingredients.length > 0 && (
            <button type="button" className="primary" disabled={missing.length === 0} onClick={() => addToShopping(missing)}>
              {missing.length ? `${missing.length} fehlen → Einkaufsliste` : 'Alles da'}
            </button>
          )}
        >
          {ingredients.length === 0 ? <Empty>Noch keine Zutaten. Über „Bearbeiten“ eintragen – eine pro Zeile.</Empty> : (
            <>
              <p className="muted small">Hak ab, was du schon zu Hause hast.</p>
              <ul className="list ingredient-list">
                {ingredients.map((x, k) => {
                  const ok = have.has(x.name.toLowerCase());
                  return (
                    <li key={k} className={ok ? 'done' : ''}>
                      <button type="button" className="shop-check" role="checkbox" aria-checked={ok} aria-label={`${x.name} vorrätig`} onClick={() => toggleHave(x.name)} />
                      <span className="grow">{x.amount && <strong>{x.amount} </strong>}{x.name}</span>
                      {ok ? <span className="muted small">vorrätig</span> : onList.has(x.name.toLowerCase()) && <span className="muted small">auf der Liste</span>}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Panel>
        <Panel title="Zubereitung">
          {steps.length === 0 ? <Empty>{link ? 'Die Schritte stehen im Original-Rezept.' : 'Noch keine Schritte.'}</Empty> : (
            <ol className="recipe-steps">{steps.map((s, k) => <li key={k}>{s}</li>)}</ol>
          )}
        </Panel>
      </div>
      {cooking && <CookMode recipe={recipe} factor={factor} onClose={() => setCooking(false)} />}
      {planning && <PlanSheet date={today()} slot="abend" recipeId={id} onClose={() => setPlanning(false)} />}
    </>
  );
}

/** Dashboard-Widget: was es heute (und morgen) gibt */
export function MealsWidget({ variant = 'standard' }: { variant?: WidgetVariant }) {
  const { data } = useStore();
  const t = today();
  const days = variant === 'kompakt' ? [t] : [t, addDays(t, 1)];
  const rows = days.flatMap((d) => MEAL_SLOTS.map((s) => ({ d, s, meals: data.meals.filter((m) => m.date === d && m.slot === s.id) })));
  if (!rows.some((r) => r.meals.length)) return <Empty>Noch nichts geplant. <a href="#/essen">Woche planen</a></Empty>;
  return (
    <ul className="list dense">
      {rows.filter((r) => r.meals.length).map((r) => (
        <li key={`${r.d}-${r.s.id}`}>
          <span className="muted small meal-when">{r.d === t ? 'Heute' : 'Morgen'} {r.s.label.toLowerCase()}</span>
          <span className="grow">
            {r.meals.map((m) => (m.recipeId ? <a key={m.id} href={`#/essen/${m.recipeId}`}>{mealTitle(m, data.recipes)}</a> : <span key={m.id}>{mealTitle(m, data.recipes)}</span>))}
          </span>
        </li>
      ))}
    </ul>
  );
}
