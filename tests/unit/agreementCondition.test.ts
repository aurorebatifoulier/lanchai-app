// Rental agreement condition (template .6): accessories from the product's "What's
// included" list (quantities parsed, × booked quantity), wording fixes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIncluded, accessoriesFor, AGREEMENT_COPY, AGREEMENT_PDF_PHOTOS_PER_ITEM } from '../../functions/src/shared/rentalAgreement';

test('"What\'s included" lines → name + quantity', () => {
  assert.deepEqual(parseIncluded('2 × Carrying bag'), { name: 'Carrying bag', qty: 2 });
  assert.deepEqual(parseIncluded('3x Tent pegs'), { name: 'Tent pegs', qty: 3 });
  assert.deepEqual(parseIncluded('Strap x2'), { name: 'Strap', qty: 2 });
  assert.deepEqual(parseIncluded('Pump'), { name: 'Pump', qty: 1 });
  assert.deepEqual(parseIncluded('3D glasses'), { name: '3D glasses', qty: 1 });
  assert.deepEqual(parseIncluded('Xbox controller'), { name: 'Xbox controller', qty: 1 });
  assert.equal(parseIncluded('   '), null);
});

test('accessories for a booking line: per unit × quantity; none listed → null', () => {
  assert.deepEqual(accessoriesFor(['2 × Carrying bag', 'Pump', ''], 2), [
    { name: 'Carrying bag', qty: 4, handedOver: true },
    { name: 'Pump', qty: 2, handedOver: true },
  ]);
  assert.equal(accessoriesFor([], 1), null);
  assert.equal(accessoriesFor(undefined, 1), null);
});

test('wording: discount (not coupon only), defects never charged, photos capped in the PDF', () => {
  assert.equal(AGREEMENT_COPY.rentalTotal, 'Rental after discount');
  assert.match(AGREEMENT_COPY.defectsNote, /not charged at return/);
  assert.equal(AGREEMENT_PDF_PHOTOS_PER_ITEM, 8);
});
