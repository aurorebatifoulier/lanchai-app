import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import type { RentalDoc } from './firestore';
import { formatLakAmount } from '@/utils/currency';
import { deriveReceiptData, type ReceiptData } from '@/utils/receiptData';
import { displayOrderId } from '@/utils/rentalDocs';

// Matches SettlementSummary.tsx's own currency formatter exactly — reused here rather
// than reinvented, since expo-print needs a plain HTML string and can't call that
// React component directly. formatLakAmount (utils/currency.ts) covers the LAK case.
function fmtCurrency(n: number, currency: 'LAK' | 'USD' | 'THB'): string {
  return currency === 'LAK' ? formatLakAmount(n) : `${n.toLocaleString('en-US')} ${currency}`;
}

// Defensive — product names, renter names, and charge reasons are free text that ends
// up inside an HTML string for expo-print's WebView to render.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtIssueDate(): string {
  return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Mirrors SettlementSummary.tsx's own resolution derivation exactly (that component
// can't be invoked from a plain HTML string, so this is the one deliberate, documented
// duplication of its 2-line logic — everything else routes through deriveReceiptData).
function buildSettlementSection(rental: RentalDoc, data: ReceiptData): string {
  const { depositHeldAmount, depositCurrency, depositAppliedToCharge, outstandingBalance } = data;
  const fmt = (n: number) => fmtCurrency(n, depositCurrency);
  const amountOwedToClient = Math.max(0, depositHeldAmount - depositAppliedToCharge);
  const resolution: 'writtenOff' | 'settled' | 'unsettled' = rental.outstandingWrittenOff
    ? 'writtenOff'
    : rental.outstandingSettled
    ? 'settled'
    : 'unsettled';

  const rows: string[] = [];

  if (rental.chargeAmount != null) {
    rows.push(`
      <tr><td class="label">Damage/condition charge</td><td class="value danger">${fmt(rental.chargeAmount)}</td></tr>
      ${rental.chargeReason ? `<tr><td colspan="2" class="reason">${escapeHtml(rental.chargeReason)}</td></tr>` : ''}
    `);
  }
  if (rental.lateChargeAmount != null) {
    rows.push(`
      <tr><td class="label">Late return penalty</td><td class="value danger">${fmt(rental.lateChargeAmount)}</td></tr>
      ${rental.lateChargeReason ? `<tr><td colspan="2" class="reason">${escapeHtml(rental.lateChargeReason)}</td></tr>` : ''}
    `);
  }

  rows.push(`<tr><td class="label muted">Deposit held</td><td class="value muted">${fmt(depositHeldAmount)}</td></tr>`);

  if (outstandingBalance > 0) {
    // The PDF goes to the renter: never a staff name.
    const resolutionText = resolution === 'settled'
      ? 'Settled'
      : resolution === 'writtenOff'
      ? 'Written off'
      : 'Not yet settled';
    rows.push(`
      <tr class="net-row"><td class="label">Client owes</td><td class="value danger bold">${fmt(outstandingBalance)}</td></tr>
      <tr><td colspan="2" class="reason">${resolutionText}</td></tr>
    `);
  } else if (amountOwedToClient > 0) {
    rows.push(`<tr class="net-row"><td class="label">Owed to client</td><td class="value success bold">${fmt(amountOwedToClient)}</td></tr>`);
  } else {
    rows.push(`<tr class="net-row"><td class="label" colspan="2">Fully settled — nothing owed</td></tr>`);
  }

  return rows.join('\n');
}

export function buildReceiptHtml(rental: RentalDoc, data: ReceiptData): string {
  const orderId = displayOrderId(rental);
  const { vatPct, vatHt, vatAmount, depositCurrency, chargesTotal, netInLak } = data;

  const netSection = netInLak != null
    ? `<tr class="net-row"><td class="label">Total paid</td><td class="value">${formatLakAmount(netInLak)}</td></tr>`
    : `
      <tr class="net-row"><td class="label">Rental fee paid</td><td class="value">${formatLakAmount(rental.total)}</td></tr>
      ${chargesTotal > 0 ? `<tr><td colspan="2" class="reason">+ ${fmtCurrency(chargesTotal, depositCurrency)} in charges (see above)</td></tr>` : ''}
    `;

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1E1E1E; padding: 32px; background: #FAFAF7; }
  .header { border-bottom: 3px solid #F4B400; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-size: 24px; font-weight: 800; color: #1E1E1E; letter-spacing: -0.5px; }
  .tagline { font-size: 11px; color: #6B6B6B; margin-top: 2px; }
  .meta { font-size: 12px; color: #6B6B6B; margin-top: 16px; line-height: 1.6; }
  .meta strong { color: #1E1E1E; }
  h2.section { font-size: 11px; font-weight: 800; letter-spacing: 1.4px; color: #6B6B6B; text-transform: uppercase; margin: 24px 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 6px 0; font-size: 13px; vertical-align: top; }
  .label { color: #6B6B6B; font-weight: 500; }
  .label.muted { color: #6B6B6B; }
  .value { text-align: right; font-weight: 700; color: #1E1E1E; }
  .value.muted { color: #6B6B6B; }
  .value.danger { color: #DC2626; }
  .value.success { color: #2E8B57; }
  .value.bold { font-size: 15px; }
  .reason { font-size: 11px; color: #6B6B6B; padding-top: 0; padding-bottom: 8px; }
  .net-row td { padding-top: 10px; }
  .net-row .label { font-weight: 800; color: #1E1E1E; font-size: 15px; }
  .net-row .value { font-weight: 800; color: #1E1E1E; font-size: 18px; }
  .card { border: 1px solid #ECECEA; border-radius: 8px; padding: 12px 16px; }
  .footer { margin-top: 40px; font-size: 11px; color: #6B6B6B; border-top: 1px solid #ECECEA; padding-top: 12px; }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">LANCHAI</div>
    <div class="tagline">Rent. Return. Repeat.</div>
    <div class="meta">
      ${orderId ? `Order <strong>${escapeHtml(orderId)}</strong><br/>` : ''}
      ${escapeHtml(rental.productName)}<br/>
      ${rental.renterName ? escapeHtml(rental.renterName) + '<br/>' : ''}
      Pick-up: ${escapeHtml(rental.pickupLabel)} &middot; Return: ${escapeHtml(rental.returnLabel)}
    </div>
  </div>

  <h2 class="section">Rental fee</h2>
  <div class="card">
    <table>
      <tr><td class="label muted">Subtotal (excl. VAT)</td><td class="value muted">${formatLakAmount(vatHt)}</td></tr>
      <tr><td class="label muted">VAT (${vatPct}%)</td><td class="value muted">${formatLakAmount(vatAmount)}</td></tr>
      <tr class="net-row"><td class="label">Rental fee paid</td><td class="value">${formatLakAmount(rental.total)}</td></tr>
    </table>
  </div>

  <h2 class="section">Deposit &amp; charges</h2>
  <div class="card">
    <table>
      ${buildSettlementSection(rental, data)}
    </table>
  </div>

  <h2 class="section">Total</h2>
  <div class="card">
    <table>
      ${netSection}
    </table>
  </div>

  <div class="footer">
    Issued ${fmtIssueDate()} &middot; Thank you for renting with LANCHAI.
  </div>
</body>
</html>
  `;
}

export type ReceiptDownloadResult = { ok: true } | { ok: false; reason: 'unavailable' | 'error' };

// Generates the PDF, names it LANCHAI-receipt-{reservationId}.pdf, and hands it to the
// native share sheet. expo-sharing's shareAsync() resolves once the share sheet closes
// on both platforms, with no distinct signal for "user picked an app" vs. "user
// dismissed it" — so a dismissed share sheet is NOT treated as an error here, only a
// thrown error or Sharing being unavailable on the device are.
export async function downloadReceipt(rental: RentalDoc, vatPercent: number | null): Promise<ReceiptDownloadResult> {
  try {
    const data = deriveReceiptData(rental, vatPercent);
    const html = buildReceiptHtml(rental, data);
    const { uri } = await Print.printToFileAsync({ html, base64: false });

    const sourceFile = new File(uri);
    const destFile = new File(Paths.cache, `LANCHAI-receipt-${(displayOrderId(rental) ?? 'rental').replace(/[^A-Za-z0-9-]/g, '')}.pdf`);
    if (destFile.exists) destFile.delete();
    sourceFile.copy(destFile);

    const available = await Sharing.isAvailableAsync();
    if (!available) return { ok: false, reason: 'unavailable' };

    await Sharing.shareAsync(destFile.uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'LANCHAI receipt',
      UTI: 'com.adobe.pdf',
    });
    return { ok: true };
  } catch (err) {
    console.warn('[downloadReceipt] Failed:', err);
    return { ok: false, reason: 'error' };
  }
}
