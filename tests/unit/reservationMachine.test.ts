// Reservation state machine (functions/src/shared/reservationMachine.ts): phases, the
// approved table, the generated firestore.rules block, and completeness against the code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  phaseOf, canDo, allowedActions, machineViolations, transitionAllowed,
  PHASES, ACTIONS, STATUSES, MACHINE, ACTION_KEYS, RETIRED, type Phase,
} from '../../functions/src/shared/reservationMachine';
import { withMachineBlock } from '../../utils/machineRules';

const ROOT = join(__dirname, '..', '..');

test('phaseOf: every status, flag and the archived override', () => {
  const T = { toMillis: () => 1 };
  assert.equal(phaseOf({ status: 'pending_payment' }), 'booked');
  assert.equal(phaseOf({ status: 'confirmed' }), 'booked'); // legacy: one "booked" phase
  assert.equal(phaseOf({ status: 'confirmed', pickupRefusedOpen: true }), 'pickup_refused');
  assert.equal(phaseOf({ status: 'active', pickupRefusedOpen: true }), 'out'); // a stale flag never counts
  assert.equal(phaseOf({ status: 'returned', chargeReviewPending: true, returnFinalizedAt: T }), 'return_review');
  assert.equal(phaseOf({ status: 'returned' }), 'to_settle_refund');
  assert.equal(phaseOf({ status: 'returned', outstandingBalance: 5 }), 'to_settle_balance');
  assert.equal(phaseOf({ status: 'returned', outstandingBalance: 5, returnFinalizedAt: T }), 'settled');
  assert.equal(phaseOf({ status: 'lost' }), 'lost_to_settle');
  assert.equal(phaseOf({ status: 'lost', returnFinalizedAt: T }), 'lost_settled');
  assert.equal(phaseOf({ status: 'no_show' }), 'no_show_held');
  assert.equal(phaseOf({ status: 'no_show', noShowHoldLiftedAt: T }), 'no_show_lifted');
  assert.equal(phaseOf({ status: 'returned', archived: true }), 'archived');
  assert.equal(phaseOf({ status: 'weird' }), null);
});

test('payment is part of the pick-up: confirm_payment is retired, handover is server-only', () => {
  assert.ok((RETIRED as readonly string[]).includes('confirm_payment'));
  assert.ok(!(ACTIONS as string[]).includes('confirm_payment'));
  assert.ok(MACHINE.every(t => t.action !== 'handover' || t.channel === 'server'));
  for (const st of ['pending_payment', 'confirmed']) {
    assert.equal(canDo({ status: st }, 'handover', 'staff', 'server'), true);
    assert.equal(canDo({ status: st }, 'handover', 'staff', 'client'), false);
  }
});

test('the reported bug: no lost/stolen after a return, whatever the role', () => {
  for (const p of [{ status: 'returned' }, { status: 'returned', returnFinalizedAt: 1 }, { status: 'returned', chargeReviewPending: true }]) {
    assert.equal(canDo(p, 'report_lost', 'owner'), false);
    assert.equal(canDo(p, 'report_lost', 'staff'), false);
  }
  assert.equal(canDo({ status: 'active' }, 'report_lost', 'owner'), true);
  assert.equal(canDo({ status: 'active' }, 'report_lost', 'staff'), false);
});

test('approved decisions D1–D6', () => {
  assert.equal(canDo({ status: 'lost' }, 'settle_lost', 'owner'), true);                              // D1
  assert.equal(canDo({ status: 'lost' }, 'settle_lost', 'staff'), false);
  assert.equal(canDo({ status: 'confirmed', pickupRefusedOpen: true }, 'handover', 'staff'), false);  // D2
  assert.equal(canDo({ status: 'confirmed', pickupRefusedOpen: true }, 'handover', 'owner'), true);
  assert.equal(canDo({ status: 'returned' }, 'refund_deposit', 'staff'), true);                       // D3
  assert.equal(canDo({ status: 'returned', outstandingBalance: 9 }, 'record_balance_paid', 'staff'), true);
  assert.equal(canDo({ status: 'returned', outstandingBalance: 9 }, 'write_off', 'staff'), false);
  assert.equal(canDo({ status: 'active' }, 'force_release', 'owner'), false);                         // D4
  assert.equal(canDo({ status: 'lost' }, 'return', 'owner'), false);                                  // D5
  assert.equal(transitionAllowed('return', 'owner', 'out', 'settled', 'client'), false);              // D6-ish
});

test('nothing on an archived booking but releasing its held units', () => {
  assert.deepEqual(allowedActions({ status: 'returned', archived: true }, 'owner'), ['release_units']);
  assert.deepEqual(allowedActions({ status: 'returned', archived: true }, 'staff'), []);
  assert.equal(canDo({ status: 'active' }, 'archive', 'owner'), false);
  assert.equal(canDo({ status: 'cancelled' }, 'archive', 'owner'), true);
});

test('table integrity: known phases / actions, client actions have keys', () => {
  for (const t of MACHINE) {
    assert.ok(ACTIONS.includes(t.action), t.action);
    for (const p of [...t.from, ...t.to]) assert.ok(PHASES.includes(p as Phase), p);
    if (t.channel === 'client' && t.roles.some(r => r !== 'renter') && t.action !== 'report_incident') {
      assert.ok(ACTION_KEYS[t.action]?.length, `${t.action} needs ACTION_KEYS`);
    }
  }
  for (const a of ACTIONS) assert.ok(MACHINE.some(t => t.action === a), `${a} has no transition`);
});

test('firestore.rules machine block is up to date (npm run rules:machine)', () => {
  const rules = readFileSync(join(ROOT, 'firestore.rules'), 'utf8');
  assert.equal(withMachineBlock(rules), rules, 'run `npm run rules:machine` and commit firestore.rules');
});

// ── Completeness: the code may not use a status / action the table doesn't know ──
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (['node_modules', 'lib', '.expo', 'tests', 'test', 'scripts'].includes(name)) return [];
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}
const SOURCES = ['app', 'components', 'lib', 'functions/src', 'hooks', 'utils']
  .flatMap(d => sourceFiles(join(ROOT, d)));

test('every ReservationStatus is in the table', () => {
  const src = readFileSync(join(ROOT, 'lib/firestore.ts'), 'utf8');
  const block = src.slice(src.indexOf('export type ReservationStatus'), src.indexOf(';', src.indexOf('export type ReservationStatus')));
  const statuses = [...block.matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort();
  assert.deepEqual(statuses, [...STATUSES].sort());
});

test('every status written in the code is in the table', () => {
  const bad: string[] = [];
  for (const f of SOURCES) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/\bstatus:\s*'([a-z_]+)'/g)) {
      if (/reservations|Reservation|rental|Rental|checklist|status\.ts/.test(f) || /firestore\.ts$/.test(f)) {
        if (!(STATUSES as readonly string[]).includes(m[1]) && !['open', 'in_review', 'resolved', 'rejected', 'published', 'draft', 'archived', 'new', 'ordered', 'declined', 'added', 'pending', 'approved', 'none', 'on_file', 'credited'].includes(m[1])) {
          bad.push(`${relative(ROOT, f)}: ${m[1]}`);
        }
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('every lastAction / machine action used in the code is in the table', () => {
  const bad: string[] = [];
  for (const f of SOURCES) {
    const text = readFileSync(f, 'utf8');
    const found = [
      ...[...text.matchAll(/lastAction:\s*'([a-z_]+)'/g)].map(m => m[1]),
      ...[...text.matchAll(/runAction\(\s*'([a-z_]+)'/g)].map(m => m[1]),
      ...[...text.matchAll(/canDo\([^,]+,\s*'([a-z_]+)'/g)].map(m => m[1]),
      ...[...text.matchAll(/can\('([a-z_]+)'\)/g)].map(m => m[1]),
    ];
    for (const a of found) if (!(ACTIONS as string[]).includes(a)) bad.push(`${relative(ROOT, f)}: ${a}`);
  }
  assert.deepEqual(bad, []);
});

test('data check flags the reported case', () => {
  assert.deepEqual(machineViolations({ status: 'lost', returnChecklist: {}, returnFinalizedAt: 1 }), ['Reported lost AFTER a return checklist']);
  assert.deepEqual(machineViolations({ status: 'returned', archived: true }), []);
});
