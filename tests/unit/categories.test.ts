// Categories: the ONE config (functions/src/shared/categories.ts), the main category,
// legacy single-category products, and the multi-category reading rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY_CONFIG, CLIENT_CATEGORY_IDS, ALL_CATEGORY_IDS, MAX_CATEGORIES,
  categoriesOf, primaryCategory, displayCategory, clientCategoriesOf, sanitizeCategories,
  inCategory, categoryLabel, isClientCategory,
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
