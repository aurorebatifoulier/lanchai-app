// Reservation state machine — THE source of truth for every admin action on a booking
// (approved table, 2026-11-20). Pure, dependency-free; used by:
//   • firestore.rules — the block between the "reservationMachine" markers is GENERATED
//     from this file (`npm run rules:machine`); tests/unit/reservationMachine.test.ts
//     fails while it is out of date;
//   • the callables (submitReturn, refusePickup, resolveOwnerAlert) — canDo() inside
//     their transaction, on the status they re-read;
//   • the app — buttons come from allowedActions(); screens listen live.
// Default = FORBIDDEN: an action is allowed only by an explicit transition below.

export type Phase =
  | 'booked' | 'pickup_refused' | 'out'
  | 'return_review' | 'to_settle_refund' | 'to_settle_balance' | 'settled'
  | 'lost_to_settle' | 'lost_settled' | 'cancelled' | 'no_show_held' | 'no_show_lifted'
  | 'archived';

export const PHASES: Phase[] = [
  'booked', 'pickup_refused', 'out',
  'return_review', 'to_settle_refund', 'to_settle_balance', 'settled',
  'lost_to_settle', 'lost_settled', 'cancelled', 'no_show_held', 'no_show_lifted',
  'archived',
];

/** Every reservation status the code writes (lib/firestore.ts ReservationStatus). */
export const STATUSES = ['pending_payment', 'confirmed', 'active', 'returned', 'cancelled', 'lost', 'no_show'] as const;
export type MachineStatus = typeof STATUSES[number];

export type MachineRole = 'owner' | 'staff' | 'renter';
/** client = a Firestore write checked by the generated rules; server = a callable. */
export type Channel = 'client' | 'server';

export type MachineAction =
  | 'handover' | 'renter_cancel' | 'cancel' | 'force_release'
  | 'no_show' | 'lift_no_show' | 'refuse_pickup' | 'close_refusal' | 'return'
  | 'report_lost' | 'damage_confirm' | 'damage_reduce' | 'damage_waive' | 'undo_waiver'
  | 'refund_deposit' | 'record_balance_paid' | 'write_off' | 'settle_lost'
  | 'report_incident' | 'archive' | 'release_units';

export const ACTIONS: MachineAction[] = [
  'handover', 'renter_cancel', 'cancel', 'force_release',
  'no_show', 'lift_no_show', 'refuse_pickup', 'close_refusal', 'return',
  'report_lost', 'damage_confirm', 'damage_reduce', 'damage_waive', 'undo_waiver',
  'refund_deposit', 'record_balance_paid', 'write_off', 'settle_lost',
  'report_incident', 'archive', 'release_units',
];

/** Not built — forbidden everywhere (listed so the table says so explicitly). */
export const NOT_BUILT = ['edit_dates', 'extend', 'found_after_lost'] as const;

/** Retired (2026-11-27): payment is recorded AS PART OF the pick-up (submitHandover).
 *  No advance is ever taken (Terms §4), so nothing needs a separate "confirm payment".
 *  Kept only to label old audit entries; forbidden everywhere. */
export const RETIRED = ['confirm_payment'] as const;

export interface Transition {
  action: MachineAction;
  roles: MachineRole[];
  channel: Channel;
  from: Phase[];
  /** Phases the document may end in. Empty = the reservation isn't written. */
  to: Phase[];
}

// One "booked" phase = status pending_payment OR confirmed (legacy) — both pay at pick-up.
const PRE: Phase[] = ['booked'];
const PRE_OR_REFUSED: Phase[] = [...PRE, 'pickup_refused'];
const TO_SETTLE: Phase[] = ['to_settle_refund', 'to_settle_balance'];
const ARCHIVABLE: Phase[] = [
  'return_review', 'to_settle_refund', 'to_settle_balance', 'settled', 'lost_to_settle', 'lost_settled',
  'cancelled', 'no_show_held', 'no_show_lifted',
];

export const MACHINE: Transition[] = [
  // Every pick-up goes through submitHandover (server, the 4-step Pick-up flow): payment,
  // deposit, checklist, agreement and ID check in ONE transaction; a unit must be
  // PHYSICALLY in the shop (unitsOnHand).
  { action: 'handover', roles: ['owner', 'staff'], channel: 'server', from: PRE, to: ['out'] },
  // D2: after a refused pick-up, only an owner may hand over (it closes the alert).
  { action: 'handover', roles: ['owner'], channel: 'server', from: ['pickup_refused'], to: ['out'] },
  { action: 'renter_cancel', roles: ['renter'], channel: 'client', from: PRE_OR_REFUSED, to: ['cancelled'] },
  { action: 'cancel', roles: ['owner', 'staff'], channel: 'client', from: PRE_OR_REFUSED, to: ['cancelled'] },
  // D4: never on an item that is out.
  { action: 'force_release', roles: ['owner'], channel: 'client', from: PRE, to: ['cancelled'] },
  { action: 'no_show', roles: ['owner', 'staff'], channel: 'client', from: PRE_OR_REFUSED, to: ['no_show_held'] },
  { action: 'lift_no_show', roles: ['owner'], channel: 'client', from: ['no_show_held'], to: ['no_show_lifted'] },
  { action: 'refuse_pickup', roles: ['owner', 'staff'], channel: 'server', from: PRE, to: ['pickup_refused'] },
  { action: 'close_refusal', roles: ['owner'], channel: 'server', from: ['pickup_refused'], to: PRE },
  // The server decides the outcome (submitReturn).
  { action: 'return', roles: ['owner', 'staff'], channel: 'server', from: ['out'],
    to: ['settled', 'to_settle_refund', 'to_settle_balance', 'return_review'] },
  // Every return — staff AND owner — goes through submitReturn (3-step flow, owner fee
  // decisions passed as adjustments). There is no client-side return write any more.
  // Never after a return (the item came back).
  { action: 'report_lost', roles: ['owner'], channel: 'client', from: ['out'], to: ['lost_to_settle'] },
  { action: 'damage_confirm', roles: ['owner'], channel: 'client', from: ['return_review'], to: TO_SETTLE },
  { action: 'damage_reduce', roles: ['owner'], channel: 'client', from: ['return_review'], to: TO_SETTLE },
  { action: 'damage_waive', roles: ['owner'], channel: 'client', from: ['return_review'], to: TO_SETTLE },
  { action: 'undo_waiver', roles: ['owner'], channel: 'client', from: TO_SETTLE, to: TO_SETTLE },
  // D3: staff close a DECIDED settlement (refund / balance paid), never a write-off.
  { action: 'refund_deposit', roles: ['owner', 'staff'], channel: 'client', from: ['to_settle_refund'], to: ['settled'] },
  { action: 'record_balance_paid', roles: ['owner', 'staff'], channel: 'client', from: ['to_settle_balance'], to: ['settled'] },
  { action: 'write_off', roles: ['owner'], channel: 'client', from: ['to_settle_balance'], to: ['settled'] },
  // D1: a lost item is settled too (paid, written off, or the deposit covered it).
  { action: 'settle_lost', roles: ['owner'], channel: 'client', from: ['lost_to_settle'], to: ['lost_settled'] },
  { action: 'report_incident', roles: ['owner', 'staff'], channel: 'client',
    from: ['out', 'return_review', ...TO_SETTLE, 'settled', 'lost_to_settle', 'lost_settled'], to: [] },
  // Archive = data fix for test / broken bookings, CLOSED ones only (a pending or out
  // booking would keep occupying stock and triggering alerts — cancel or return it first).
  { action: 'archive', roles: ['owner'], channel: 'client', from: ARCHIVABLE, to: ['archived'] },
  // Data check: give back the units an archived test booking still holds out of stock.
  { action: 'release_units', roles: ['owner'], channel: 'client', from: ['archived'], to: ['archived'] },
];

/** Fields each client action may write on the reservation (+ COMMON_KEYS). */
export const COMMON_KEYS = ['updatedAt', 'lastAuditId', 'lastAction'];
export const ACTION_KEYS: Partial<Record<MachineAction, string[]>> = {
  handover: ['status', 'handoverChecklist', 'earlyHandover', 'earlyHandoverPlannedAt', 'pickupRefusedOpen'],
  renter_cancel: ['status', 'cancelledAt', 'cancelledBy'],
  cancel: ['status', 'cancelledAt', 'cancelledBy', 'cancelReason', 'cancelReasonText'],
  force_release: ['status', 'cancelledAt', 'cancelledBy', 'releasedBy', 'releasedAt'],
  no_show: ['status', 'noShowAt', 'noShowBy', 'noShowByName'],
  lift_no_show: ['noShowHoldLiftedAt', 'noShowHoldLiftedBy', 'noShowHoldLiftedByName'],
  return: [
    'status', 'returnChecklist', 'returnedAt', 'stockReleasedAt',
    'chargeAmount', 'chargeReason', 'chargeSeverity', 'chargePercent', 'chargeUnits',
    'lateChargeAmount', 'lateChargeReason',
    'lateChargeWaived', 'lateChargeWaivedAmount', 'lateChargeWaivedReason', 'lateChargeWaivedBy', 'lateChargeWaivedAt',
    'damageChargeWaived', 'damageChargeWaivedAmount', 'damageChargeWaivedReason', 'damageChargeWaivedPercent',
    'damageChargeWaivedBy', 'damageChargeWaivedAt',
    'chargeCurrency', 'depositAppliedToCharge', 'outstandingBalance',
  ],
  report_lost: [
    'status', 'chargeAmount', 'chargeCurrency', 'chargeReason', 'chargeSeverity', 'chargePercent', 'chargeUnits',
    'lateChargeAmount', 'lateChargeReason', 'depositAppliedToCharge', 'outstandingBalance',
  ],
  damage_confirm: ['chargeReviewPending', 'chargeReviewedAt', 'chargeReviewedBy'],
  damage_reduce: ['chargeReviewPending', 'chargeReviewedAt', 'chargeReviewedBy', 'chargeAmount', 'damageChargeSuggested',
    'depositAppliedToCharge', 'outstandingBalance'],
  damage_waive: ['chargeReviewPending', 'chargeReviewedAt', 'chargeReviewedBy',
    'damageChargeWaived', 'damageChargeWaivedAmount', 'damageChargeWaivedReason', 'damageChargeWaivedPercent',
    'damageChargeWaivedBy', 'damageChargeWaivedAt', 'chargeAmount', 'chargeReason', 'chargePercent',
    'depositAppliedToCharge', 'outstandingBalance'],
  undo_waiver: ['lateChargeWaived', 'lateChargeAmount', 'lateChargeReason',
    'damageChargeWaived', 'chargeAmount', 'chargeReason', 'chargePercent',
    'chargeCurrency', 'depositAppliedToCharge', 'outstandingBalance'],
  refund_deposit: ['depositReturned', 'depositReturnedBy', 'depositReturnedAt', 'stockReleaseHandling', 'returnFinalizedAt'],
  record_balance_paid: ['outstandingSettled', 'outstandingSettledAt', 'outstandingSettledBy', 'returnFinalizedAt'],
  write_off: ['outstandingWrittenOff', 'outstandingWrittenOffAt', 'outstandingWrittenOffBy', 'outstandingWrittenOffNotes', 'returnFinalizedAt'],
  settle_lost: ['depositReturned', 'depositReturnedBy', 'depositReturnedAt',
    'outstandingSettled', 'outstandingSettledAt', 'outstandingSettledBy',
    'outstandingWrittenOff', 'outstandingWrittenOffAt', 'outstandingWrittenOffBy', 'outstandingWrittenOffNotes',
    'returnFinalizedAt'],
  archive: ['archived', 'archivedAt', 'archivedBy', 'archivedReason', 'returnFinalizedAt', 'stockReleasedAt'],
  release_units: ['unitsReleasedAt', 'unitsReleased'],
};

/** Extra VALUE constraints per client action, as firestore.rules expressions (the
 *  generated block appends them). Pins who / when for the actions that need it. */
export const ACTION_RULE_EXTRA: Partial<Record<MachineAction, string>> = {
  cancel: "request.resource.data.cancelledBy == 'admin' && request.resource.data.cancelledAt == request.time",
  force_release: "request.resource.data.cancelledBy == 'admin_release'",
  no_show: 'request.resource.data.noShowBy == request.auth.uid',
  lift_no_show: 'request.resource.data.noShowHoldLiftedBy == request.auth.uid',
  archive: "request.resource.data.archived == true && request.resource.data.archivedReason is string && request.resource.data.archivedReason.size() >= 3",
  handover: "request.resource.data.get('pickupRefusedOpen', false) != true",
};

// ── Phase ──────────────────────────────────────────────────────────────────────
export interface MachineDoc {
  status?: unknown;
  archived?: unknown;
  pickupRefusedOpen?: unknown;
  chargeReviewPending?: unknown;
  returnFinalizedAt?: unknown;
  outstandingBalance?: unknown;
  noShowHoldLiftedAt?: unknown;
}

/** The ONE phase of a reservation (firestore.rules resPhase() is generated from the same
 *  order of checks). Unknown status → null (nothing is allowed). */
export function phaseOf(r: MachineDoc): Phase | null {
  if (r.archived === true) return 'archived';
  const s = r.status;
  const finalized = r.returnFinalizedAt != null;
  switch (s) {
    case 'pending_payment':
    case 'confirmed': return r.pickupRefusedOpen === true ? 'pickup_refused' : 'booked';
    case 'active': return 'out';
    case 'returned':
      if (r.chargeReviewPending === true) return 'return_review';
      if (finalized) return 'settled';
      return typeof r.outstandingBalance === 'number' && r.outstandingBalance > 0 ? 'to_settle_balance' : 'to_settle_refund';
    case 'lost': return finalized ? 'lost_settled' : 'lost_to_settle';
    case 'cancelled': return 'cancelled';
    case 'no_show': return r.noShowHoldLiftedAt != null ? 'no_show_lifted' : 'no_show_held';
    default: return null;
  }
}

/** Is `action` allowed for `role` from this reservation's current phase (any channel
 *  unless one is given)? */
export function canDo(r: MachineDoc, action: MachineAction, role: MachineRole, channel?: Channel): boolean {
  const p = phaseOf(r);
  if (!p) return false;
  return MACHINE.some(t => t.action === action && t.roles.includes(role) && t.from.includes(p)
    && (!channel || t.channel === channel));
}

/** Is the move from → to allowed for this action / role / channel? */
export function transitionAllowed(action: MachineAction, role: MachineRole, from: Phase | null, to: Phase | null, channel: Channel): boolean {
  if (!from || !to) return false;
  return MACHINE.some(t => t.action === action && t.roles.includes(role) && t.channel === channel
    && t.from.includes(from) && (t.to.length === 0 ? to === from : t.to.includes(to)));
}

export function allowedActions(r: MachineDoc, role: MachineRole): MachineAction[] {
  return ACTIONS.filter(a => canDo(r, a, role));
}

export const PHASE_LABELS: Record<Phase, string> = {
  booked: 'Booked · pays at pick-up',
  pickup_refused: 'Pick-up refused',
  out: 'Out with the renter',
  return_review: 'Returned · damage to review',
  to_settle_refund: 'Returned · deposit to settle',
  to_settle_balance: 'Returned · balance due',
  settled: 'Returned · settled',
  lost_to_settle: 'Lost · to settle',
  lost_settled: 'Lost · settled',
  cancelled: 'Cancelled',
  no_show_held: 'No-show · bookings paused',
  no_show_lifted: 'No-show · hold lifted',
  archived: 'Archived',
};

// ── Data check (admin): what contradicts the table ─────────────────────────────
export interface ViolationDoc extends MachineDoc {
  returnChecklist?: unknown;
  handoverChecklist?: unknown;
  depositReturned?: unknown;
  returnedAt?: { toMillis?: () => number } | null;
}
export function machineViolations(r: ViolationDoc, nowMs = Date.now()): string[] {
  if (r.archived === true) return [];
  const out: string[] = [];
  const s = r.status;
  const pre = s === 'pending_payment' || s === 'confirmed';
  if (phaseOf(r) == null) out.push(`Unknown status "${String(s)}"`);
  if (s === 'lost' && r.returnChecklist) out.push('Reported lost AFTER a return checklist');
  if (s === 'active' && r.returnChecklist) out.push('Out with the renter but has a return checklist');
  if (pre && r.handoverChecklist) out.push('Not picked up but has a handover checklist');
  if ((s === 'cancelled' || s === 'no_show') && r.handoverChecklist) out.push(`${s === 'cancelled' ? 'Cancelled' : 'No-show'} after a handover`);
  if (r.returnFinalizedAt != null && s !== 'returned' && s !== 'lost') out.push(`Settled but status is ${String(s)}`);
  if (r.chargeReviewPending === true && (s !== 'returned' || r.returnFinalizedAt != null)) out.push('Damage review open on a closed booking');
  if (r.depositReturned === true && typeof r.outstandingBalance === 'number' && r.outstandingBalance > 0) out.push('Deposit returned AND a balance is still due');
  const returnedMs = r.returnedAt?.toMillis?.() ?? null;
  const stale = returnedMs != null ? nowMs - returnedMs > 14 * 86_400_000 : true;
  if ((s === 'returned' || s === 'lost') && r.returnFinalizedAt == null && r.chargeReviewPending !== true && stale) {
    out.push(s === 'lost' ? 'Lost, never settled' : 'Returned more than 14 days ago, deposit never settled');
  }
  return out;
}
