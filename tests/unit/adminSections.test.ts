// Admin dashboard config (constants/adminSections.ts): one list, groups in order, every
// route an existing screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ADMIN_GROUPS, ADMIN_SECTIONS, ADMIN_TOOLS, ADMIN_ROUTE_ROLES, sectionsFor, canOpenAdminRoute } from '../../constants/adminSections';

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
  assert.deepEqual(titles('settings'), ['Shop and exchange rate', 'Tools', 'Team']);
});

test('unique ids; every route is an existing screen file', () => {
  const all = [...ADMIN_SECTIONS, ...ADMIN_TOOLS];
  assert.equal(new Set(all.map(x => x.id)).size, all.length);
  for (const x of all) assert.ok(existsSync(routeFile(x.route)), `${x.route} → ${routeFile(x.route)}`);
});

test('saved replies are not on the dashboard', () => {
  assert.ok(!ADMIN_SECTIONS.some(x => x.route === '/admin/saved-replies'));
});

test('settings group ends with Team (owner)', () => {
  assert.deepEqual(ADMIN_SECTIONS.filter(x => x.group === 'settings').map(x => x.title), ['Shop and exchange rate', 'Tools', 'Team']);
});

test('staff see only the counter sections', () => {
  assert.deepEqual(sectionsFor('staff').map(x => x.id), ['rentals', 'claims', 'stock', 'requests', 'products']);
  assert.equal(sectionsFor('owner').length, ADMIN_SECTIONS.length);
});

// Every screen file under app/admin → its route ("/admin/reservations/[id]/checklist").
function adminRoutes(dir = join(ROOT, 'app/admin'), base = '/admin'): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (e.isDirectory()) return adminRoutes(join(dir, e.name), `${base}/${e.name}`);
    if (!e.name.endsWith('.tsx') || e.name === '_layout.tsx') return [];
    const name = e.name.replace(/\.tsx$/, '');
    return [name === 'index' ? base : `${base}/${name}`];
  });
}

test('every admin route is classified (owner = default deny for staff)', () => {
  const routes = adminRoutes();
  const missing = routes.filter(r => !(r in ADMIN_ROUTE_ROLES));
  assert.deepEqual(missing, [], 'add these to ADMIN_ROUTE_ROLES');
  const stale = Object.keys(ADMIN_ROUTE_ROLES).filter(r => !routes.includes(r));
  assert.deepEqual(stale, [], 'no file for these routes');
});

test('dashboard sections are consistent with the route table', () => {
  for (const x of ADMIN_SECTIONS) {
    const r = ADMIN_ROUTE_ROLES[x.route];
    assert.ok(r, x.route);
    if (x.minRole === 'staff') assert.equal(r, 'staff', `${x.route} is a staff section but an owner route`);
  }
});

test('route guard: staff blocked from owner routes, owners never blocked', () => {
  assert.equal(canOpenAdminRoute('staff', ['admin', 'reservations', '[id]', 'checklist']), true);
  assert.equal(canOpenAdminRoute('staff', ['admin']), true);
  assert.equal(canOpenAdminRoute('staff', ['admin', 'promo-codes']), false);
  assert.equal(canOpenAdminRoute('staff', ['admin', 'shop-settings']), false);
  assert.equal(canOpenAdminRoute('staff', ['admin', 'not-listed']), false);
  assert.equal(canOpenAdminRoute('owner', ['admin', 'team']), true);
});
