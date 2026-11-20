// GENERATED FROM THE TABLE: for every phase × client action × role (owner, staff,
// deactivated staff), a write with that action's canonical fields is attempted on a
// fresh reservation in that phase — allowed iff the state machine
// (functions/src/shared/reservationMachine.ts) allows the move. Proves the generated
// firestore.rules block matches the TypeScript table, case by case.
import { describe, test, before } from 'node:test';
import { doc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { setupRulesEnv, as, ok, no, UID, auditedUpdate, seedExtra } from './env';
import {
  PHASES, MACHINE, phaseOf, transitionAllowed, type Phase, type MachineAction,
} from '../../functions/src/shared/reservationMachine';

setupRulesEnv();
const T0 = Timestamp.fromMillis(Date.UTC(2026, 10, 1));
const P = 'fs:reservations/{reservationId}';

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

type Role = 'owner' | 'staff' | 'staffOff';
const ROLES: Role[] = ['owner', 'staff', 'staffOff'];
const UIDS: Record<Role, string> = { owner: UID.OWNER, staff: UID.STAFF, staffOff: UID.STAFF_OFF };

/** Canonical client write of each action (serverTimestamp = a non-null value). */
function payload(action: MachineAction, uid: string): Record<string, unknown> {
  const now = serverTimestamp();
  switch (action) {
    case 'confirm_payment': return { status: 'confirmed' };
    case 'handover': return { status: 'active', handoverChecklist: { photos: [] }, pickupRefusedOpen: false };
    case 'cancel': return { status: 'cancelled', cancelledBy: 'admin', cancelReason: 'customer_request', cancelReasonText: '', cancelledAt: now };
    case 'force_release': return { status: 'cancelled', cancelledBy: 'admin_release', releasedBy: 'X', releasedAt: now, cancelledAt: now };
    case 'no_show': return { status: 'no_show', noShowAt: now, noShowBy: uid, noShowByName: 'X' };
    case 'lift_no_show': return { noShowHoldLiftedAt: now, noShowHoldLiftedBy: uid, noShowHoldLiftedByName: 'X' };
    case 'return': return { status: 'returned', returnChecklist: { photos: [] }, returnedAt: now, stockReleasedAt: null, outstandingBalance: 0 };
    case 'report_lost': return { status: 'lost', chargeAmount: 1, chargeCurrency: 'LAK', outstandingBalance: 0 };
    case 'damage_confirm': return { chargeReviewPending: false, chargeReviewedAt: now, chargeReviewedBy: 'X' };
    case 'damage_reduce': return { chargeReviewPending: false, chargeAmount: 1, outstandingBalance: 0 };
    case 'damage_waive': return { chargeReviewPending: false, damageChargeWaived: true, outstandingBalance: 0 };
    case 'undo_waiver': return { lateChargeWaived: false, outstandingBalance: 0 };
    case 'refund_deposit': return { depositReturned: true, depositReturnedBy: 'X', returnFinalizedAt: now };
    case 'record_balance_paid': return { outstandingSettled: true, returnFinalizedAt: now };
    case 'write_off': return { outstandingWrittenOff: true, returnFinalizedAt: now };
    case 'settle_lost': return { outstandingSettled: true, returnFinalizedAt: now };
    case 'archive': return { archived: true, archivedReason: 'test booking', archivedAt: now };
    case 'release_units': return { unitsReleasedAt: now, unitsReleased: 1 };
    default: return {};
  }
}

const CLIENT_ACTIONS = [...new Set(MACHINE
  .filter(t => t.channel === 'client' && t.roles.some(r => r !== 'renter') && t.action !== 'report_incident')
  .map(t => t.action))];

const docId = (phase: Phase, action: string, role: Role) => `m_${phase}_${action}_${role}`;

/** Expected result from the TypeScript table (+ the payload's resulting phase). */
function expected(phase: Phase, action: MachineAction, role: Role): boolean {
  if (role === 'staffOff') return false;
  const merged: Record<string, unknown> = { ...SEED[phase] };
  for (const [k, v] of Object.entries(payload(action, UIDS[role]))) merged[k] = v === null ? null : v;
  return transitionAllowed(action, role, phase, phaseOf(merged), 'client');
}

describe('state machine × rules (generated from the table)', () => {
  // Inside the describe: runs after setupRulesEnv's root before() has started the env.
  before(async () => {
    const docs: Record<string, Record<string, unknown>> = {};
    const base = { renterId: UID.A, productId: 'p1', total: 1 };
    for (const phase of PHASES) {
      for (const action of CLIENT_ACTIONS) {
        for (const role of ROLES) docs[`reservations/${docId(phase, action, role)}`] = { ...base, ...SEED[phase] };
      }
      docs[`reservations/r_${phase}`] = { ...base, ...SEED[phase] };
    }
    await seedExtra(docs);
  });

  for (const phase of PHASES) {
    test(`from ${phase}`, async () => {
      for (const action of CLIENT_ACTIONS) {
        for (const role of ROLES) {
          const uid = UIDS[role];
          const write = auditedUpdate(as[role]().firestore(), uid, role === 'owner' ? 'owner' : 'staff',
            `reservations/${docId(phase, action, role)}`, { ...payload(action, uid), lastAction: action });
          if (expected(phase, action, role)) await ok(P, write);
          else await no(P, write);
        }
      }
    });
  }

  test('a write without lastAction, with a field outside the action, or to the wrong phase is refused', async () => {
    const owner = as.owner().firestore();
    await no(P, auditedUpdate(owner, UID.OWNER, 'owner', 'reservations/r_out', { status: 'lost' }));
    await no(P, auditedUpdate(owner, UID.OWNER, 'owner', 'reservations/r_out', { status: 'lost', total: 0, lastAction: 'report_lost' }));
    await no(P, auditedUpdate(owner, UID.OWNER, 'owner', 'reservations/r_out', { status: 'returned', returnFinalizedAt: serverTimestamp(), lastAction: 'return' }));
  });

  test('renters: cancel only before pick-up, never an archived booking', async () => {
    const renter = as.A().firestore();
    const cancel = { status: 'cancelled', cancelledBy: 'renter', cancelledAt: serverTimestamp() };
    await ok(P, updateDoc(doc(renter, 'reservations/r_pickup_refused'), cancel));
    await no(P, updateDoc(doc(renter, 'reservations/r_out'), cancel));
    await no(P, updateDoc(doc(renter, 'reservations/r_archived'), cancel));
  });
});
