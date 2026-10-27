// Dry tests for lib/search.ts (no Firestore): `npm run test:search`.
import assert from 'node:assert/strict';
import { buildSearchIndex, searchProducts, isBestMatch, withinDistance, stem, normalize, suggestKeywords } from '../lib/search';
import { DEFAULT_SEARCH_GROUPS } from '../lib/searchVocabulary';

const products = [
  { id: 'tent', name: 'Camping tent', category: 'outdoor', shortDesc: '4-person tent for river weekends', rentalCount: 9 },
  { id: 'cooler', name: 'Cooler box 40L', category: 'outdoor', rentalCount: 4 },
  { id: 'speaker', name: 'Party speaker', category: 'fun', rentalCount: 7 },
  { id: 'lights', name: 'LED string lights', category: 'fun', rentalCount: 2 },
  { id: 'cot', name: 'Chicco travel cot', category: 'kids', rentalCount: 6 },
  { id: 'stroller', name: 'Baby stroller', category: 'kids', rentalCount: 3 },
  { id: 'drill', name: 'Bosch cordless drill', category: 'tools', rentalCount: 8 },
  { id: 'chairs', name: 'Folding chairs (set of 4)', category: 'home', rentalCount: 5 },
  { id: 'bike', name: 'City bike', category: 'sports', rentalCount: 1 },
];
const categories = [
  { id: 'outdoor', name: 'Outdoor' }, { id: 'fun', name: 'Fun' }, { id: 'kids', name: 'Kids' },
  { id: 'tools', name: 'Tools' }, { id: 'home', name: 'Home' }, { id: 'sports', name: 'Sports' },
];
const index = buildSearchIndex(products, {
  groups: DEFAULT_SEARCH_GROUPS, categories,
  collections: [{ title: 'Boat racing weekend', productIds: ['speaker', 'chairs', 'cooler'] }],
});
const ids = (q: string) => searchProducts(index, q).map(r => r.product.id);
const show = (q: string) => console.log(q.padEnd(14), searchProducts(index, q).map(r => `${r.product.id} ${r.score}%`).join(' · ') || '(none)');

let failed = 0;
const check = (name: string, fn: () => void) => { try { fn(); } catch (e) { failed++; console.error('✗', name, (e as Error).message); } };

check('normalize', () => assert.equal(normalize('Café  Crème!'), 'cafe creme'));
check('lao kept', () => assert.equal(normalize('ເຕັ້ນ'), 'ເຕັ້ນ'));
check('stem', () => { assert.equal(stem('drills'), 'drill'); assert.equal(stem('batteries'), 'battery'); assert.equal(stem('boxes'), 'box'); assert.equal(stem('glass'), 'glass'); });
check('distance', () => { assert.ok(withinDistance('tnet', 'tent', 1)); assert.ok(!withinDistance('tnet', 'tent', 0)); assert.ok(withinDistance('strroler', 'stroller', 2)); });
check('party', () => { const r = ids('party'); assert.equal(r[0], 'speaker'); assert.ok(r.includes('lights')); });
check('camping', () => { const r = ids('camping'); assert.ok(r.slice(0, 2).includes('tent')); assert.ok(r.includes('cooler')); assert.ok(!r.includes('drill')); });
check('baby', () => { const r = ids('baby'); assert.equal(r[0], 'stroller'); assert.ok(r.includes('cot')); });
check('tnet (typo)', () => assert.equal(ids('tnet')[0], 'tent'));
check('drills (plural)', () => assert.equal(ids('drills')[0], 'drill'));
check('boat racing', () => { const r = ids('boat racing'); ['speaker', 'chairs', 'cooler'].forEach(x => assert.ok(r.includes(x), x)); });
check('prefix while typing', () => { assert.ok(ids('te').includes('tent')); assert.ok(ids('ten').includes('tent')); assert.equal(ids('tent')[0], 'tent'); });
check('nonsense', () => assert.equal(ids('xyzq').length, 0));
check('best match', () => assert.ok(isBestMatch(searchProducts(index, 'drill'))));
check('suggest', () => { const k = suggestKeywords('Chicco travel cot', 'kids', DEFAULT_SEARCH_GROUPS); assert.ok(k.includes('chicco') && k.includes('baby')); });

['party', 'camping', 'baby', 'tnet', 'drills', 'boat racing', 'te', 'xyzq'].forEach(show);
if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('All search tests passed.');
