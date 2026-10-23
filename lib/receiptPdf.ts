import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import type { RentalDoc } from './firestore';
import { buildReceiptSummary } from '@/utils/receiptSummary';
import { displayOrderId, fmtDay } from '@/utils/rentalDocs';

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
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// The PDF renders EXACTLY the "Your rental summary" lines of the on-screen receipt
// (buildReceiptSummary, utils/receiptSummary.ts — same lines, same order, same figures).
// It goes to the renter: no staff names. Sized to fit one A4 page for a normal rental.
export function buildReceiptHtml(rental: RentalDoc, vatPercent: number | null): string {
  const orderId = displayOrderId(rental);
  const { lines, totalLabel, totalValues } = buildReceiptSummary(rental, vatPercent);
  const name = rental.quantity > 1 ? `${rental.productName} × ${rental.quantity}` : rental.productName;
  const returned = fmtDay(rental.returnedAt ?? rental.returnAt);

  const rows = lines.map(l => {
    if (l.kind === 'row') {
      return `<tr class="${l.strong ? 'strong' : ''}"><td class="label">${escapeHtml(l.label)}</td><td class="value${l.danger ? ' danger' : ''}">${escapeHtml(l.value)}</td></tr>`;
    }
    if (l.kind === 'detail') return `<tr><td colspan="2" class="detail">${escapeHtml(l.text)}</td></tr>`;
    return `<tr><td colspan="2"><span class="pill ${l.tone}">${l.tone === 'success' ? '&#10003; ' : ''}${escapeHtml(l.label)}</span></td></tr>`;
  }).join('\n');

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1E1E1E; margin: 0; background: #FFFFFF; }
  .header { border-bottom: 3px solid #F4B400; padding-bottom: 14px; margin-bottom: 22px; }
  .brand { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
  .tagline { font-size: 11px; color: #6B6B6B; margin-top: 2px; }
  h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.4px; margin: 0 0 4px; }
  .meta { font-size: 12px; color: #6B6B6B; line-height: 1.6; margin-bottom: 18px; }
  .card { border: 1px solid #ECECEA; border-radius: 10px; padding: 16px 18px; page-break-inside: avoid; }
  .card-title { font-size: 16px; font-weight: 800; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  td { font-size: 13px; vertical-align: top; padding: 7px 0 0; }
  .label { font-weight: 500; }
  .value { text-align: right; font-weight: 600; white-space: nowrap; padding-left: 12px; }
  .value.danger { color: #C8412C; }
  tr.strong .label { font-weight: 700; }
  tr.strong .value { font-weight: 800; }
  .detail { font-size: 11px; color: #6B6B6B; padding-top: 2px; }
  .pill { display: inline-block; font-size: 11px; font-weight: 700; border-radius: 6px; padding: 4px 9px; margin-top: 4px; }
  .pill.success { background: #E8F5EE; color: #2E8B57; }
  .pill.danger { background: #FEE2E2; color: #C8412C; }
  .pill.muted { background: #ECECEA; color: #4A4A4A; }
  .divider { height: 1px; background: #ECECEA; margin: 14px 0 10px; }
  .total td { font-size: 15px; font-weight: 800; padding-top: 0; }
  .total .value { font-size: 18px; }
  .footer { margin-top: 28px; font-size: 11px; color: #6B6B6B; border-top: 1px solid #ECECEA; padding-top: 10px; }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">LANCHAI</div>
    <div class="tagline">Rent. Return. Repeat.</div>
  </div>

  <h1>${escapeHtml(name)}</h1>
  <div class="meta">
    ${[orderId ? `Order <strong>${escapeHtml(orderId)}</strong>` : null, `Returned ${escapeHtml(returned)}`].filter(Boolean).join(' &middot; ')}<br/>
    ${rental.renterName ? `${escapeHtml(rental.renterName)}<br/>` : ''}
    Pick-up: ${escapeHtml(rental.pickupLabel)} &middot; Return: ${escapeHtml(rental.returnLabel)}
  </div>

  <div class="card">
    <div class="card-title">Your rental summary</div>
    <table>
      ${rows}
    </table>
    <div class="divider"></div>
    <table class="total">
      <tr>
        <td class="label">${escapeHtml(totalLabel)}</td>
        <td class="value">${totalValues.map(escapeHtml).join('<br/>')}</td>
      </tr>
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

// Generates the PDF, names it LANCHAI-receipt-{LNC order id}.pdf, and hands it to the
// native share sheet. expo-sharing's shareAsync() resolves once the share sheet closes
// on both platforms, with no distinct signal for "user picked an app" vs. "user
// dismissed it" — so a dismissed share sheet is NOT treated as an error here, only a
// thrown error or Sharing being unavailable on the device are.
export async function downloadReceipt(rental: RentalDoc, vatPercent: number | null): Promise<ReceiptDownloadResult> {
  try {
    const html = buildReceiptHtml(rental, vatPercent);
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
