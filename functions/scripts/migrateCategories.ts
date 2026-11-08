// Category migration — the logic (the CLI is scripts/migrate-categories.ts).
// Converts every product to the multi-category model of shared/categories.ts:
//   `categories: string[]` (main first) + `category` = main (legacy mirror),
//   `legacyCategory` = the old single value (audit), `categoriesMigratedAt` (server time —
//   onCategoryArrival ignores these writes, so no "New in …" notification goes out).
// Products whose old category still exists (tools / home / kids / outdoor) are converted
// as is. Products with a retired / unknown / missing category are NEVER decided here:
// they take the categories written in the choices file (category-choices.json), else
// they stay untouched (the app keeps reading them through categoriesOf()).
// planMigration() only READS; runMigration() applies the plan it is given.
import * as admin from 'firebase-admin';
import { CLIENT_CATEGORY_IDS, isClientCategory, isCategoryId, sanitizeCategories, MAX_CATEGORIES } from '../src/shared/categories';

type Db = admin.firestore.Firestore;

/** Suggestions pre-filled in the choices file for retired ids — to review, never applied as such. */
export const RETIRED_SUGGESTIONS: Record<string, string[]> = { fun: ['games'], sports: ['outdoor'] };

/** One entry of category-choices.json (keyed by product id). `categories` empty = undecided. */
export interface CategoryChoice { name: string; from: string | null; categories: string[] }
export type ChoicesFile = Record<string, CategoryChoice>;

export interface ProductMove { id: string; name: string; status: string; from: string | null; to: string[] }
export interface Undecided { id: string; name: string; status: string; from: string | null }
export interface InvalidChoice { id: string; name: string; categories: unknown }

export interface MigrationPlan {
  /** Already on `categories` — nothing to do. */
  alreadyDone: number;
  /** Old category still exists → [it]. */
  convert: ProductMove[];
  /** Retired / unknown / missing category, WITH a valid choice in the file → applied. */
  chosen: ProductMove[];
  /** Retired / unknown / missing category, no (or an empty) choice → left untouched. */
  undecided: Undecided[];
  /** A choice that isn't a list of 1–5 valid ids → left untouched, fix the file. */
  invalidChoices: InvalidChoice[];
  /** Related data pointing at a retired category (report only, except watches with the flag). */
  promoCodes: { code: string; retired: string[] }[];
  slides: { id: string; category: string }[];
  staleWatches: { id: string; category: string }[];
  requestsByRetired: Record<string, number>;
}

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);

/** Products needing a decision, for the choices file (suggestions for fun / sports). */
export function choicesTemplate(plan: MigrationPlan, existing: ChoicesFile): ChoicesFile {
  const out: ChoicesFile = { ...existing };
  for (const u of plan.undecided) {
    if (out[u.id]) continue; // never overwrite what was already written / edited
    out[u.id] = { name: u.name, from: u.from, categories: (u.from && RETIRED_SUGGESTIONS[u.from]) ?? [] };
  }
  return out;
}

export async function planMigration(db: Db, choices: ChoicesFile): Promise<MigrationPlan> {
  const plan: MigrationPlan = {
    alreadyDone: 0, convert: [], chosen: [], undecided: [], invalidChoices: [],
    promoCodes: [], slides: [], staleWatches: [], requestsByRetired: {},
  };
  for (const d of (await db.collection('products').get()).docs) {
    const p = d.data();
    const name = str(p.name, '(no name)');
    const status = str(p.status, 'published');
    if (sanitizeCategories(p.categories).length > 0) { plan.alreadyDone++; continue; }
    const from = typeof p.category === 'string' && p.category ? p.category : null;
    if (from && isClientCategory(from)) { plan.convert.push({ id: d.id, name, status, from, to: [from] }); continue; }
    const choice = choices[d.id];
    if (!choice || !Array.isArray(choice.categories) || choice.categories.length === 0) {
      plan.undecided.push({ id: d.id, name, status, from });
      continue;
    }
    const to = sanitizeCategories(choice.categories);
    const valid = to.length === choice.categories.length && to.length <= MAX_CATEGORIES;
    if (!valid) plan.invalidChoices.push({ id: d.id, name, categories: choice.categories });
    else plan.chosen.push({ id: d.id, name, status, from, to });
  }
  for (const d of (await db.collection('promoCodes').get()).docs) {
    const ids = d.get('scope.categoryIds');
    const retired = Array.isArray(ids) ? ids.filter((x: unknown) => !isClientCategory(x)).map(String) : [];
    if (retired.length) plan.promoCodes.push({ code: d.id, retired });
  }
  for (const d of (await db.collection('homeSlides').get()).docs) {
    const link = d.get('link');
    if (link?.kind === 'category' && !isClientCategory(link.id)) plan.slides.push({ id: d.id, category: str(link.id) });
  }
  for (const d of (await db.collection('categoryWatches').get()).docs) {
    const c = str(d.get('category'));
    if (!isClientCategory(c)) plan.staleWatches.push({ id: d.id, category: c });
  }
  for (const d of (await db.collection('requests').get()).docs) {
    const c = d.get('category');
    if (typeof c === 'string' && c && !isClientCategory(c)) plan.requestsByRetired[c] = (plan.requestsByRetired[c] ?? 0) + 1;
  }
  return plan;
}

/** Human-readable plan (product names and ids only — no personal data). */
export function describePlan(plan: MigrationPlan): string {
  const L: string[] = [];
  const row = (m: { id: string; name: string; status: string }) => `${m.name} [${m.status}] (${m.id})`;
  L.push(`Renter categories (display order): ${CLIENT_CATEGORY_IDS.join(', ')} · internal: other`);
  L.push(`Already migrated: ${plan.alreadyDone}`);
  L.push(`\nWILL CONVERT (old category still exists) — ${plan.convert.length}`);
  plan.convert.forEach(m => L.push(`  ${row(m)}: ${m.from} → [${m.to.join(', ')}]`));
  L.push(`\nWILL APPLY YOUR CHOICE (category-choices.json) — ${plan.chosen.length}`);
  plan.chosen.forEach(m => L.push(`  ${row(m)}: ${m.from ?? '(none)'} → [${m.to.join(', ')}]`));
  L.push(`\nTO DECIDE (retired / unknown / no category, no choice yet) — left untouched — ${plan.undecided.length}`);
  plan.undecided.forEach(u => L.push(`  ${row(u)}: ${u.from ?? '(none)'}`));
  if (plan.invalidChoices.length) {
    L.push(`\nINVALID CHOICES (need 1–${MAX_CATEGORIES} ids among ${CLIENT_CATEGORY_IDS.join(', ')}, other) — left untouched — ${plan.invalidChoices.length}`);
    plan.invalidChoices.forEach(c => L.push(`  ${c.name} (${c.id}): ${JSON.stringify(c.categories)}`));
  }
  L.push('\nRELATED DATA ON RETIRED CATEGORIES (report only)');
  L.push(`  Promo codes: ${plan.promoCodes.length ? plan.promoCodes.map(p => `${p.code} (${p.retired.join(', ')})`).join(' · ') : 'none'} → edit their scope in Admin → Promo codes`);
  L.push(`  Home slides: ${plan.slides.length ? plan.slides.map(s => `${s.id} (${s.category})`).join(' · ') : 'none'} → renters see no link; edit in Admin → Home slides`);
  const watchCounts = Object.entries(plan.staleWatches.reduce<Record<string, number>>((a, w) => ({ ...a, [w.category]: (a[w.category] ?? 0) + 1 }), {}));
  L.push(`  "Notify me" watches: ${watchCounts.length ? watchCounts.map(([c, n]) => `${c} × ${n}`).join(' · ') : 'none'} → never fire; delete with --delete-stale-watches`);
  const req = Object.entries(plan.requestsByRetired);
  L.push(`  Item requests: ${req.length ? req.map(([c, n]) => `${c} × ${n}`).join(' · ') : 'none'} → kept as history (label shown in admin)`);
  return L.join('\n');
}

/** Applies the plan: converted + chosen products, optionally the stale watches. */
export async function runMigration(db: Db, plan: MigrationPlan, opts: { deleteStaleWatches?: boolean } = {}, log: (l: string) => void = () => {}): Promise<{ products: number; watches: number }> {
  const moves = [...plan.convert, ...plan.chosen];
  for (const m of moves) {
    // Belt and braces: the plan was built from the same rule.
    if (sanitizeCategories(m.to).length !== m.to.length || !m.to.every(isCategoryId)) throw new Error(`Invalid categories for ${m.id}`);
  }
  for (let i = 0; i < moves.length; i += 400) {
    const batch = db.batch();
    for (const m of moves.slice(i, i + 400)) {
      batch.update(db.collection('products').doc(m.id), {
        categories: m.to,
        category: m.to[0],
        legacyCategory: m.from ?? admin.firestore.FieldValue.delete(),
        categoriesMigratedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
  log(`${moves.length} products migrated`);
  let watches = 0;
  if (opts.deleteStaleWatches) {
    for (const w of plan.staleWatches) { await db.collection('categoryWatches').doc(w.id).delete(); watches++; }
    log(`${watches} stale "Notify me" watches deleted`);
  }
  return { products: moves.length, watches };
}
