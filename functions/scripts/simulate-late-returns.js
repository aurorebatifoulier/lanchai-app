// Dry run of the late-return sequence — NO emails, NO Firestore. Uses the compiled
// functions logic (npm run build first): computeLatePenalty, dueLateAlerts,
// planLateEmails (lib/lateAlerts.js — the same code lateReturnAlerts runs) and the real
// lateReturnEmail / lateFeeSummary templates.
//   node scripts/simulate-late-returns.js [graceHours]
const { computeLatePenalty, sanitizeGraceHours } = require('../lib/shared/latePenalty');
const { dueLateAlerts, planLateEmails } = require('../lib/lateAlerts');
const { lateReturnEmail, lateFeeSummary } = require('../lib/email/templates');
const { vteDay, vteTime } = require('../lib/shared/dates');

const graceHours = sanitizeGraceHours(process.argv[2] === undefined ? undefined : Number(process.argv[2])); // = config/latePolicy.graceHours
const H = 3_600_000;
// Return due Mon 26 Oct 2026 10:00 Vientiane (UTC+7) = 03:00 UTC.
const RETURN_AT = Date.UTC(2026, 9, 26, 3, 0);
const vte = (d, h, m = 0, s = 0) => Date.UTC(2026, 9, d, h - 7, m, s); // Vientiane wall time → ms
const at = ms => `${vteDay(ms)} ${vteTime(ms)}`;
const lak = n => `${n.toLocaleString('en-US')} LAK`;
const shop = { name: 'LANCHAI', addressLine: '—', city: 'Vientiane', hours: '', whatsappNumber: '8562000000000', paymentMethods: '' };
const IN_APP = {
  lateAlert0h: 'Return due now', lateAlert1h: 'Return is 1 hour late', lateAlertGrace: 'Return overdue',
  lateAlert24h: 'Return over 24 hours late', lateAlert48h: 'Return over 48 hours late', lateAlert72h: 'Treated as a non-return',
};

function freshOrders() {
  const base = { status: 'active', renterId: 'renter-1', returnAtMs: RETURN_AT, pickupAtMs: RETURN_AT - 2 * 24 * H, deposit: 500000,
    handoverChecklist: { depositAmount: 500000, depositCurrency: 'LAK' }, pickupLabel: '', returnLabel: '', durationDays: 2, subtotal: 0 };
  return [
    { ...base, id: 'ORDER-A_1', orderId: 'ORDER-A', productName: 'Camping tent', pricePerDay: 150000, quantity: 1 },
    { ...base, id: 'ORDER-B_1', orderId: 'ORDER-B', productName: 'Portable speaker', pricePerDay: 30000, quantity: 2, deposit: 200000,
      handoverChecklist: { depositAmount: 200000, depositCurrency: 'LAK' } },
    { ...base, id: 'ORDER-B_2', orderId: 'ORDER-B', productName: 'Electric drill', pricePerDay: 40000, quantity: 1, deposit: 150000,
      handoverChecklist: { depositAmount: 150000, depositCurrency: 'LAK' } },
  ];
}

// One lateReturnAlerts run at `now` over the in-memory reservations (flags mutate).
function run(label, now, docs) {
  console.log(`\n▶ ${label}  (${at(now)}, ${((now - RETURN_AT) / H).toFixed(2)}h after due)`);
  const rows = [];
  for (const d of docs.filter(x => x.status === 'active')) {
    const penalty = computeLatePenalty({ returnAtMs: d.returnAtMs, nowMs: now, pricePerDay: d.pricePerDay, quantity: d.quantity, graceHours });
    const due = dueLateAlerts(d, penalty, d.returnAtMs, now);
    const highest = due.length ? due[due.length - 1] : null;
    if (highest) for (const k of due) d[k] = true;
    d.latePenaltyAmount = penalty.amountLak; d.latePenaltyDays = penalty.days;
    rows.push({ id: d.id, orderId: d.orderId, renterId: d.renterId, penalty, highest });
    console.log(`  ${d.id.padEnd(10)} stage=${penalty.stage.padEnd(9)} fee=${lak(penalty.amountLak).padEnd(12)} in-app: ${highest ? `"${IN_APP[highest]}"${due.length > 1 ? ` (+${due.length - 1} lower flag(s) marked done)` : ''}` : 'none'}`);
  }
  const batches = planLateEmails(rows);
  const emailed = new Set(batches.map(b => b.orderId));
  for (const b of batches) {
    const lines = b.lines.map(l => ({ r: { ...docs.find(x => x.id === l.id), latePenaltyAmount: l.amountLak, latePenaltyDays: l.days }, stage: l.stage }));
    const mail = lateReturnEmail('', b.stage, lines, shop, { firstName: 'Aurore', orderId: b.orderId, holdActive: true });
    const s = lateFeeSummary(lines, b.stage);
    console.log(`  ✉ ${b.orderId}: EMAIL ${b.stage} — "${mail.subject}" · ${lines.length} line(s) · fee ${lak(s.amountLak)}`
      + (s.nextAmountLak != null ? ` · next ${lak(s.nextAmountLak)} after ${at(s.next)}` : s.next != null ? ` · non-return after ${at(s.next)}` : ''));
  }
  for (const o of new Set(docs.map(d => d.orderId))) if (!emailed.has(o)) console.log(`  ✉ ${o}: no email`);
}

console.log(`Grace (config/latePolicy, internal): ${graceHours}h · return due ${at(RETURN_AT)}`);
console.log('ORDER-A = tent 150,000/day × 1 · ORDER-B = speaker 30,000/day × 2 + drill 40,000/day × 1');

console.log('\n══ Scenario 1: every run in sequence ══');
const docs = freshOrders();
for (const [label, ms] of [
  ['Mon 10:00 (due)', vte(26, 10)], ['Mon 11:00 (+1h)', vte(26, 11)], ['Mon 11:59', vte(26, 11, 59)],
  ['Mon 12:00:00 exactly', vte(26, 12)], ['Mon 12:00:20 (real cron latency)', vte(26, 12, 0, 20)], ['Mon 12:15 (next run)', vte(26, 12, 15)],
  ['Tue 09:59', vte(27, 9, 59)], ['Tue 10:00', vte(27, 10)], ['Tue 10:15', vte(27, 10, 15)],
  ['Wed 10:00', vte(28, 10)], ['Wed 10:15', vte(28, 10, 15)],
  ['Thu 10:00', vte(29, 10)], ['Thu 10:15', vte(29, 10, 15)], ['Thu 10:30 (idempotency)', vte(29, 10, 30)],
]) run(label, ms, docs);

console.log('\n══ Scenario 2: catch-up (function down from Mon 09:00 to Wed 11:00) ══');
const docs2 = freshOrders();
run('Mon 09:00', vte(26, 9), docs2);
run('Wed 11:00 (catch-up)', vte(28, 11), docs2);
run('Wed 11:15 (next run)', vte(28, 11, 15), docs2);

console.log('\n══ Scenario 3: ORDER-A returned Mon 11:30 → status returned ══');
const docs3 = freshOrders();
run('Mon 11:00', vte(26, 11), docs3);
docs3[0].status = 'returned';
run('Mon 12:15', vte(26, 12, 15), docs3);
