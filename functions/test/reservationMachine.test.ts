// GENERATED FROM THE TABLE: every server-side action (submitReturn, refusePickup,
// resolveOwnerAlert) × every phase × role — allowed iff canDo(phase, action, role,
// 'server') (functions/src/shared/reservationMachine.ts); the callables re-read the
// status inside their transaction.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { fns, call, set, UID, seedBookingWorld } from './helpers';
import { PHASES, canDo, type Phase, type MachineAction } from '../src/shared/reservationMachine';

const OWNER = 'ownerOooo1';
const STAFF = 'staffSsss1';
const STAFF_OFF = 'staffOff01';
const H = 3_600_000;
const T0 = Timestamp.fromMillis(Date.UTC(2026, 10, 1));
const IDS = ['mainItem', 'cleanliness', 'basicUsage', 'power', 'accessories', 'cables', 'protectiveCase', 'storageCase', 'other'];

const SEED: Record<Phase, Record<string, unknown>> = {
  awaiting_payment: { status: 'pending_payment' },
  confirmed: { status: 'confirmed' },
  pickup_refused: { status: 'confirmed', pickupRefusedOpen: true },
  out: { status: 'active' },
  return_review: { status: 'returned', chargeReviewPending: true },
  to_settle_refund: { status: 'returned', outstandingBalance: 0 },
  to_settle_balance: { status: 'returned', outstandingBalance: 100 },
  settled: { status: 'returned', returnFinalizedAt: T0 },
  lost_to_settle: { status: 'lost' },
  lost_settled: { status: 'lost', returnFinalizedAt: T0 },
  cancelled: { status: 'cancelled' },
  no_show_held: { status: 'no_show' },
  no_show_lifted: { status: 'no_show', noShowHoldLiftedAt: T0 },
  archived: { status: 'returned', archived: true, returnFinalizedAt: T0 },
};
const ROLES = [['owner', OWNER], ['staff', STAFF], ['staffOff', STAFF_OFF]] as const;
const SERVER_ACTIONS: MachineAction[] = ['return', 'refuse_pickup', 'close_refusal'];

const idOf = (phase: Phase, action: string, role: string) => `x_${phase}_${action}_${role}`;
const photo = (id: string) => `https://firebasestorage.googleapis.com/v0/b/x/o/reservations%2F${id}%2Freturn%2F1.jpg`;

before(async () => {
  await seedBookingWorld();
  await set('products/tent', { name: 'Camping tent', retailPrice: 100, stockLeft: 50, categories: ['outdoor'] });
  await set(`admins/${OWNER}`, { role: 'owner', active: true, name: 'Olga', email: 'olga@example.com' });
  await set(`admins/${STAFF}`, { role: 'staff', active: true, name: 'Sam' });
  await set(`admins/${STAFF_OFF}`, { role: 'staff', active: false, name: 'Old' });
  for (const phase of PHASES) for (const action of SERVER_ACTIONS) for (const [role] of ROLES) {
    await set(`reservations/${idOf(phase, action, role)}`, {
      renterId: UID.A, renterName: 'Ann', productId: 'tent', productName: 'Camping tent', orderId: 'LNC-1',
      quantity: 1, pricePerDay: 100_000, deposit: 500_000,
      pickupAt: Timestamp.fromMillis(Date.now() - 48 * H), returnAt: Timestamp.fromMillis(Date.now() + 5 * H),
      handoverChecklist: { depositCurrency: 'LAK', depositAmount: 500_000 },
      ...SEED[phase],
    });
  }
});

function run(action: MachineAction, id: string, uid: string) {
  if (action === 'return') {
    return call(fns.submitReturn, { items: [{
      reservationId: id, categories: Object.fromEntries(IDS.map(k => [k, { rating: 'good' }])),
      photos: [photo(id)], clientConfirmedByName: 'Ann', clientConfirmed: true, chargeUnits: 1,
    }] }, uid);
  }
  if (action === 'refuse_pickup') return call(fns.refusePickup, { reservationIds: [id], reason: 'Photo does not match' }, uid);
  return call(fns.resolveOwnerAlert, { kind: 'pickup', id }, uid);
}

for (const action of SERVER_ACTIONS) {
  test(`server action ${action}: every phase × role follows the table`, async () => {
    for (const phase of PHASES) {
      for (const [role, uid] of ROLES) {
        const allowed = role !== 'staffOff' && canDo(SEED[phase], action, role, 'server');
        const p = run(action, idOf(phase, action, role), uid);
        if (allowed) await p;
        else await assert.rejects(p, `${action} from ${phase} as ${role} must be refused`);
      }
    }
  });
}
