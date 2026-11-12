// Admin dashboard config (constants/adminSections.ts): one list, groups in order, every
// route an existing screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ADMIN_GROUPS, ADMIN_SECTIONS, ADMIN_TOOLS } from '../../constants/adminSections';

const ROOT = join(__dirname, '..', '..');
const routeFile = (route: string) => join(ROOT, 'app', `${route.replace(/^\//, '').split('?')[0]}.tsx`);

test('groups in the agreed order, each with at least one entry', () => {
  assert.deepEqual(ADMIN_GROUPS.map(g => g.id), ['operations', 'customers', 'catalogue', 'marketing', 'settings']);
  for (const g of ADMIN_GROUPS) assert.ok(ADMIN_SECTIONS.some(x => x.group === g.id), g.id);
});

test('entries per group, in order', () => {
  const titles = (g: string) => ADMIN_SECTIONS.filter(x => x.group === g).map(x => x.title);
  assert.deepEqual(titles('operations'), ['Rentals', 'Verifications', 'Claims', 'Stock']);
  assert.deepEqual(titles('customers'), ['Item requests', 'Reviews']);
  assert.deepEqual(titles('catalogue'), ['Products', 'Packs and collections']);
  assert.deepEqual(titles('marketing'), ['App content', 'Promo codes', 'Loyalty', 'Broadcast']);
  assert.deepEqual(titles('settings'), ['Shop and exchange rate', 'Tools']);
});

test('unique ids; every route is an existing screen file', () => {
  const all = [...ADMIN_SECTIONS, ...ADMIN_TOOLS];
  assert.equal(new Set(all.map(x => x.id)).size, all.length);
  for (const x of all) assert.ok(existsSync(routeFile(x.route)), `${x.route} → ${routeFile(x.route)}`);
});

test('saved replies are not on the dashboard; phase 1 = everything visible to staff', () => {
  assert.ok(!ADMIN_SECTIONS.some(x => x.route === '/admin/saved-replies'));
  assert.ok(ADMIN_SECTIONS.every(x => x.minRole === 'staff'));
});
