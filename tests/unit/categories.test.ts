// Categories: the ONE config (functions/src/shared/categories.ts), the main category,
// legacy single-category products, and the multi-category reading rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY_CONFIG, CLIENT_CATEGORY_IDS, ALL_CATEGORY_IDS, MAX_CATEGORIES,
  categoriesOf, primaryCategory, displayCategory, clientCategoriesOf, sanitizeCategories,
  inCategory, categoryLabel, isClientCategory, arrivedCategories,
} from '../../functions/src/shared/categories';

test('client categories in display order; other is internal', () => {
  assert.deepEqual(CLIENT_CATEGORY_IDS, ['tools', 'home', 'kids', 'outdoor', 'games']);
  assert.ok(ALL_CATEGORY_IDS.includes('other'));
  assert.equal(isClientCategory('other'), false);
  assert.equal(new Set(ALL_CATEGORY_IDS).size, ALL_CATEGORY_IDS.length, 'duplicate id in the config');
  for (const c of CATEGORY_CONFIG.filter(x => x.clientVisible)) {
    assert.ok(c.line && c.emptyTitle && c.stickerName && c.keywords.length > 0, `${c.id}: copy missing`);
  }
});

test('sanitizeCategories: valid ids only, no duplicates, order kept, at most 5', () => {
  assert.deepEqual(sanitizeCategories(['home', 'tools', 'home', 'luxury', 7]), ['home', 'tools']);
  assert.deepEqual(sanitizeCategories('tools'), []);
  assert.deepEqual(sanitizeCategories(['tools', 'home', 'kids', 'outdoor', 'games', 'other']).length, MAX_CATEGORIES);
});

test('main category = first of the array', () => {
  const p = { categories: ['home', 'tools'] };
  assert.equal(primaryCategory(p), 'home');
  assert.equal(displayCategory(p), 'home');
  assert.deepEqual(categoriesOf(p), ['home', 'tools']);
});

test('internal main category: renters see the next visible one, else nothing', () => {
  assert.equal(primaryCategory({ categories: ['other', 'kids'] }), 'other');
  assert.equal(displayCategory({ categories: ['other', 'kids'] }), 'kids');
  assert.deepEqual(clientCategoriesOf({ categories: ['other', 'kids'] }), ['kids']);
  assert.equal(displayCategory({ categories: ['other'] }), null);
});

test('legacy products (single `category`) are still read', () => {
  assert.deepEqual(categoriesOf({ category: 'kids' }), ['kids']);
  assert.equal(primaryCategory({ category: 'kids' }), 'kids');
  assert.equal(displayCategory({ category: 'kids' }), 'kids');
  // Retired id: kept for admin / migration, never shown to renters.
  assert.deepEqual(categoriesOf({ category: 'fun' }), ['fun']);
  assert.equal(displayCategory({ category: 'fun' }), null);
  assert.equal(categoryLabel('fun'), 'Fun');
  // An invalid `categories` falls back to the legacy field.
  assert.deepEqual(categoriesOf({ categories: [], category: 'tools' }), ['tools']);
  assert.deepEqual(categoriesOf({}), []);
});

test('a product is in each of its categories', () => {
  const p = { categories: ['tools', 'home'] };
  assert.ok(inCategory(p, 'tools'));
  assert.ok(inCategory(p, 'home'));
  assert.ok(!inCategory(p, 'kids'));
});

test('Explore filter: a product in 2 categories shows in both; legacy products too', async () => {
  const { filterProducts } = await import('../../utils/productFilters');
  type P = Parameters<typeof filterProducts>[0][number];
  const mk = (id: string, extra: Partial<P>) => ({ id, name: id, available: true, pricePerDay: 1, ...extra }) as P;
  const products = [
    mk('ladder', { categories: ['tools', 'home'] }),
    mk('stroller', { category: 'kids' }), // legacy
    mk('old', { category: 'sports' }),    // retired → only under "All"
  ];
  const ids = (category: string) => filterProducts(products, { category }).map(p => p.id);
  assert.deepEqual(ids('tools'), ['ladder']);
  assert.deepEqual(ids('home'), ['ladder']);
  assert.deepEqual(ids('kids'), ['stroller']);
  assert.deepEqual(ids('games'), []);
  assert.deepEqual(ids('all'), ['ladder', 'stroller', 'old']);
});

test('stickers follow the main category shown to renters', async () => {
  const { computeAccountStats } = await import('../../lib/accountStats');
  type R = Parameters<typeof computeAccountStats>[0][number];
  type P = Parameters<typeof computeAccountStats>[1][number];
  const at = (ms: number) => ({ toMillis: () => ms });
  const rental = (productId: string, ms: number) =>
    ({ productId, productName: productId, status: 'returned', returnedAt: at(ms) }) as unknown as R;
  const products = [
    { id: 'ladder', categories: ['home', 'tools'] },
    { id: 'thing', categories: ['other'] },
    { id: 'legacy', category: 'kids' },
  ] as unknown as P[];
  const st = computeAccountStats([rental('ladder', 1), rental('thing', 2), rental('legacy', 3)], products, null);
  assert.deepEqual(st.stickers, ['home', 'kids']); // config order, main category only
  assert.equal(st.stickerUnlocks.home.productName, 'ladder');
  assert.equal(st.nextSticker, 'tools');
});

test('firestore.rules category lists mirror the config', async () => {
  const { readFileSync } = await import('node:fs');
  const rules = readFileSync('firestore.rules', 'utf8');
  const listOf = (fn: string) => {
    const m = rules.match(new RegExp(`function ${fn}\\(\\)\\s*\\{\\s*return\\s*\\[([^\\]]*)\\]`));
    assert.ok(m, `${fn}() not found in firestore.rules`);
    return m[1].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean);
  };
  assert.deepEqual(listOf('categoryIds'), [...ALL_CATEGORY_IDS], 'update categoryIds() in firestore.rules');
  assert.deepEqual(listOf('clientCategoryIds'), [...CLIENT_CATEGORY_IDS], 'update clientCategoryIds() in firestore.rules');
  assert.ok(rules.includes(`c.size() <= ${MAX_CATEGORIES}`), 'MAX_CATEGORIES differs from validCategories()');
});

test('category arrival: only NEW renter categories of a visible product; never on migration', () => {
  const pub = (extra: object) => ({ status: 'published', ...extra });
  assert.deepEqual(arrivedCategories(undefined, pub({ categories: ['tools', 'home'] })), ['tools', 'home']);
  assert.deepEqual(arrivedCategories(pub({ categories: ['tools'] }), pub({ categories: ['tools', 'games'] })), ['games']);
  assert.deepEqual(arrivedCategories(pub({ category: 'tools' }), pub({ categories: ['tools'] })), []);
  assert.deepEqual(arrivedCategories({ status: 'draft', categories: ['kids'] }, pub({ categories: ['kids'] })), ['kids']);
  assert.deepEqual(arrivedCategories(pub({}), { status: 'draft', categories: ['kids'] }), []);
  assert.deepEqual(arrivedCategories(pub({}), pub({ categories: ['other'] })), []);
  const stamp = { toMillis: () => 1 };
  assert.deepEqual(arrivedCategories(pub({ category: 'fun' }), pub({ categories: ['games'], categoriesMigratedAt: stamp })), []);
});
