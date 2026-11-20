// Generates the firestore.rules block that mirrors the reservation state machine
// (functions/src/shared/reservationMachine.ts). Pure. Written into firestore.rules
// between the markers by `npm run rules:machine`; tests/unit/reservationMachine.test.ts
// fails while the file is out of date.
import { MACHINE, COMMON_KEYS, ACTION_KEYS, ACTION_RULE_EXTRA, type Phase } from '../functions/src/shared/reservationMachine';

export const MACHINE_BEGIN = '    // <reservationMachine:generated>';
export const MACHINE_END = '    // </reservationMachine:generated>';

const list = (xs: readonly string[]) => `[${xs.map(x => `'${x}'`).join(', ')}]`;

export function machineRulesBlock(): string {
  const clauses = MACHINE
    .filter(t => t.channel === 'client')
    .map(t => {
      const roles = t.roles.filter(r => r !== 'renter');
      if (roles.length === 0) return null; // renter writes keep their own rule
      const keys = [...(ACTION_KEYS[t.action] ?? []), ...COMMON_KEYS];
      const to = t.to.length === 0 ? 'to == from' : `to in ${list(t.to as Phase[])}`;
      const extra = ACTION_RULE_EXTRA[t.action];
      return `(a == '${t.action}' && role in ${list(roles)} && from in ${list(t.from)} && ${to}\n`
        + `          && keys.hasOnly(${list(keys)})${extra ? `\n          && ${extra}` : ''})`;
    })
    .filter((c): c is string => c != null);

  return [
    MACHINE_BEGIN,
    '    // GENERATED from functions/src/shared/reservationMachine.ts by `npm run rules:machine`.',
    '    // Do not edit by hand. Every admin client write on a reservation names its action',
    '    // (`lastAction`); it is allowed only from the CURRENT phase of the stored document,',
    '    // for the caller\'s role, to an allowed phase, writing only that action\'s fields.',
    '    function resPhase(d) {',
    "      return d.get('archived', false) == true ? 'archived'",
    "        : d.get('status', '') == 'pending_payment' ? (d.get('pickupRefusedOpen', false) == true ? 'pickup_refused' : 'awaiting_payment')",
    "        : d.get('status', '') == 'confirmed' ? (d.get('pickupRefusedOpen', false) == true ? 'pickup_refused' : 'confirmed')",
    "        : d.get('status', '') == 'active' ? 'out'",
    "        : d.get('status', '') == 'returned' ? (d.get('chargeReviewPending', false) == true ? 'return_review'",
    "            : d.get('returnFinalizedAt', null) != null ? 'settled'",
    "            : (d.get('outstandingBalance', 0) is number && d.get('outstandingBalance', 0) > 0) ? 'to_settle_balance' : 'to_settle_refund')",
    "        : d.get('status', '') == 'lost' ? (d.get('returnFinalizedAt', null) != null ? 'lost_settled' : 'lost_to_settle')",
    "        : d.get('status', '') == 'cancelled' ? 'cancelled'",
    "        : d.get('status', '') == 'no_show' ? (d.get('noShowHoldLiftedAt', null) != null ? 'no_show_lifted' : 'no_show_held')",
    "        : 'unknown';",
    '    }',
    '    function machineClientWrite() {',
    "      let a = request.resource.data.get('lastAction', '');",
    '      let from = resPhase(resource.data);',
    '      let to = resPhase(request.resource.data);',
    "      let role = adminDoc().data.get('role', 'owner');",
    '      let keys = request.resource.data.diff(resource.data).affectedKeys();',
    '      return isAdmin() && (',
    `        ${clauses.join('\n        || ')}`,
    '      );',
    '    }',
    MACHINE_END,
  ].join('\n');
}

/** firestore.rules with the generated block replaced (throws if the markers are missing). */
export function withMachineBlock(rules: string): string {
  const b = rules.indexOf(MACHINE_BEGIN);
  const e = rules.indexOf(MACHINE_END);
  if (b < 0 || e < 0 || e < b) throw new Error('reservationMachine markers not found in firestore.rules');
  return rules.slice(0, b) + machineRulesBlock() + rules.slice(e + MACHINE_END.length);
}
