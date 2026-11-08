import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { clearFirestore, db } from './helpers';
import { planMigration, runMigration, describePlan, choicesTemplate } from '../scripts/migrateCategories';

// Category migration (scripts/migrateCategories.ts): the plan changes nothing; the run
// converts legacy products whose category still exists + the products chosen in the
// choices file, and never touches an undecided one. Emulators only.

before(async () => {
  await clearFirestore();
  const d = db();
  await d.doc('products/tent').set({ name: 'Tent', category: 'outdoor', status: 'published' });
  await d.doc('products/catan').set({ name: 'Catan', category: 'fun', status: 'published' });
  await d.doc('products/bike').set({ name: 'Bike', category: 'sports', status: 'published' });
  await d.doc('products/bag').set({ name: 'Designer bag', category: 'luxury', status: 'draft' });
  await d.doc('products/ladder').set({ name: 'Ladder', categories: ['tools', 'home'], category: 'tools' });
  await d.doc('promoCodes/FUN10').set({ code: 'FUN10', scope: { categoryIds: ['fun', 'kids'] } });
  await d.doc('homeSlides/s1').set({ link: { kind: 'category', id: 'sports' } });
  await d.doc('categoryWatches/u1_fun').set({ uid: 'u1', category: 'fun' });
  await d.doc('categoryWatches/u1_kids').set({ uid: 'u1', category: 'kids' });
  await d.doc('requests/r1').set({ text: 'Kayak', category: 'sports' });
});

test('dry run: lists everything, decides nothing, changes nothing', async () => {
  const plan = await planMigration(db(), {});
  assert.equal(plan.alreadyDone, 1);
  assert.deepEqual(plan.convert.map(m => [m.id, m.to]), [['tent', ['outdoor']]]);
  assert.deepEqual(plan.chosen, []);
  assert.deepEqual(plan.undecided.map(u => [u.id, u.from]).sort(), [['bag', 'luxury'], ['bike', 'sports'], ['catan', 'fun']]);
  assert.deepEqual(plan.promoCodes, [{ code: 'FUN10', retired: ['fun'] }]);
  assert.deepEqual(plan.slides, [{ id: 's1', category: 'sports' }]);
  assert.deepEqual(plan.staleWatches, [{ id: 'u1_fun', category: 'fun' }]);
  assert.deepEqual(plan.requestsByRetired, { sports: 1 });
  assert.match(describePlan(plan), /TO DECIDE/);
  // Choices file: suggestions for fun / sports, nothing for an unknown id.
  const t = choicesTemplate(plan, { bike: { name: 'Bike', from: 'sports', categories: ['kids'] } });
  assert.deepEqual(t.catan.categories, ['games']);
  assert.deepEqual(t.bike.categories, ['kids']); // an existing entry is never overwritten
  assert.deepEqual(t.bag.categories, []);
  assert.equal((await db().doc('products/tent').get()).get('categories'), undefined);
});

test('run: converts + applies choices, leaves undecided / invalid ones untouched', async () => {
  const plan = await planMigration(db(), {
    catan: { name: 'Catan', from: 'fun', categories: ['games', 'kids'] },
    bike: { name: 'Bike', from: 'sports', categories: ['outdoor', 'outdoor'] }, // invalid (duplicate)
    bag: { name: 'Designer bag', from: 'luxury', categories: [] },              // undecided
  });
  assert.deepEqual(plan.invalidChoices.map(c => c.id), ['bike']);
  const res = await runMigration(db(), plan, { deleteStaleWatches: true });
  assert.deepEqual(res, { products: 2, watches: 1 });

  const tent = (await db().doc('products/tent').get()).data()!;
  assert.deepEqual(tent.categories, ['outdoor']);
  assert.equal(tent.category, 'outdoor');
  assert.equal(tent.legacyCategory, 'outdoor');
  assert.ok(tent.categoriesMigratedAt);
  const catan = (await db().doc('products/catan').get()).data()!;
  assert.deepEqual(catan.categories, ['games', 'kids']);
  assert.equal(catan.category, 'games');
  assert.equal(catan.legacyCategory, 'fun');
  for (const id of ['bike', 'bag']) {
    const p = (await db().doc(`products/${id}`).get()).data()!;
    assert.equal(p.categories, undefined, `${id} must stay untouched`);
  }
  assert.equal((await db().doc('categoryWatches/u1_fun').get()).exists, false);
  assert.equal((await db().doc('categoryWatches/u1_kids').get()).exists, true);
  assert.equal((await db().doc('promoCodes/FUN10').get()).get('scope.categoryIds').length, 2); // report only

  const again = await planMigration(db(), {});
  assert.equal(again.convert.length + again.chosen.length, 0);
  assert.equal(again.alreadyDone, 3);
});
