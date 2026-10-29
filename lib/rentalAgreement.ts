import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { doc, getDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, functions, storage } from './firebase';
import { CHECKLIST_CATEGORIES, type ChecklistData, type ChecklistRating, type RentalDoc } from './firestore';
import { TERMS_MARKDOWN, LEGAL_EFFECTIVE_DATE, fillLegalPlaceholders } from './legalContent';
import { getPublicRetention } from './residency';
import type { ShopInfo } from './shop';
import { displayOrderId } from '@/utils/rentalDocs';
import { vteReservationLabel, vteDay } from '@/functions/src/shared/dates';
import { CONTACT_EMAIL } from '@/functions/src/shared/shop';
import { ID_DOC_TYPES } from '@/functions/src/shared/identity';
import {
  AGREEMENT_COPY as A, AGREEMENT_TEMPLATE_VERSION, agreementPdfPath, depositPerUnitOf, newAgreementId,
  type AgreementData, type AgreementMethod,
} from '@/functions/src/shared/rentalAgreement';
import { toSignatureSvg, type Signature } from '@/components/SignaturePad';

// Rental agreement signed at pick-up — app side: gathers the data, renders the HTML
// (receipt PDF style), prints it to PDF (expo-print), uploads it to
// rentalAgreements/{agreementId}/ and calls finalizeRentalAgreement (server time,
// SHA-256, links, email). Content model + wording: functions/src/shared/rentalAgreement.ts.
// Also: the paper fallback (photos → PDF), the printable blank version, and opening a
// stored agreement (renter + admin). Never includes the ID photo or a staff name.

const RATING_TEXT: Record<ChecklistRating, string> = { good: 'Good', fair: 'Fair', damaged: 'Damaged', unusable: 'Unusable' };

/** Condition summary of one item from the pick-up checklist ratings. */
export function conditionLines(categories: ChecklistData['categories'] | null | undefined): string[] {
  if (!categories) return [];
  const notGood = CHECKLIST_CATEGORIES.filter(c => categories[c.id]?.rating && categories[c.id].rating !== 'good');
  const notes = CHECKLIST_CATEGORIES.filter(c => categories[c.id]?.rating === 'good' && categories[c.id]?.note);
  if (notGood.length === 0) {
    return ['All checked: good condition', ...notes.map(c => `${c.label}: ${categories[c.id].note}`)];
  }
  return [
    ...notGood.map(c => `${c.label}: ${RATING_TEXT[categories[c.id].rating]}${categories[c.id].note ? ` — ${categories[c.id].note}` : ''}`),
    ...notes.map(c => `${c.label}: ${categories[c.id].note}`),
    'Everything else: good',
  ];
}

interface RenterBlock { name: string; phone: string | null; email: string | null; idType: string | null; idCheckedAtLabel: string | null }

/** Renter contact (Auth email via adminRenterProfile) + ID type and check date. */
export async function loadRenterBlock(renterId: string, fallbackName: string | null): Promise<RenterBlock> {
  const [profile, idSnap, userSnap] = await Promise.all([
    httpsCallable(functions, 'adminRenterProfile')({ renterId, action: 'get' })
      .then(r => r.data as { displayName?: string; firstName?: string; lastName?: string; phone?: string; email?: string })
      .catch(() => null),
    getDoc(doc(db, 'identityChecks', renterId)).catch(() => null),
    getDoc(doc(db, 'users', renterId)).catch(() => null),
  ]);
  const name = profile?.displayName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || fallbackName || 'Renter';
  const docType = idSnap?.exists() ? (idSnap.data().docType as string | undefined) : undefined;
  const checkedAt = userSnap?.exists() ? (userSnap.data().idCheckedAt as { toMillis?: () => number } | undefined) : undefined;
  return {
    name,
    phone: profile?.phone || null,
    email: profile?.email || null,
    idType: ID_DOC_TYPES.find(t => t.key === docType)?.label ?? null,
    idCheckedAtLabel: checkedAt?.toMillis ? vteDay(checkedAt.toMillis()) : null,
  };
}

export function buildAgreementData(args: {
  agreementId: string;
  reservations: RentalDoc[];
  shop: ShopInfo;
  renter: RenterBlock;
  conditions: Record<string, string[]>;
}): AgreementData {
  const { reservations: rs, shop } = args;
  const lines = rs.map(r => {
    const unit = depositPerUnitOf(r);
    return {
      reservationId: r.id,
      productName: r.productName,
      quantity: r.quantity,
      pickupLabel: r.pickupLabel,
      returnLabel: r.returnLabel,
      total: r.total ?? r.subtotal ?? 0,
      depositPerUnit: unit,
      deposit: unit * Math.max(1, r.quantity),
      condition: args.conditions[r.id] ?? [],
    };
  });
  return {
    agreementId: args.agreementId,
    orderLabel: displayOrderId(rs[0]) ?? rs[0].orderId ?? rs[0].id,
    shop: {
      name: shop.name || 'LANCHAI',
      address: [shop.addressLine, shop.city, 'Lao PDR'].map(s => s.trim()).filter(Boolean).join(', '),
      email: CONTACT_EMAIL,
      whatsapp: shop.whatsappNumber ? `+${shop.whatsappNumber}` : null,
    },
    renter: args.renter,
    lines,
    rentalTotal: lines.reduce((s, l) => s + l.total, 0),
    depositTotal: lines.reduce((s, l) => s + l.deposit, 0),
    termsEffectiveDate: LEGAL_EFFECTIVE_DATE,
    templateVersion: AGREEMENT_TEMPLATE_VERSION,
  };
}

// ── HTML ──────────────────────────────────────────────────────────────────────

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const lak = (n: number) => `${Math.round(n).toLocaleString('en-US')} LAK`;

/** Minimal Markdown → HTML for the Terms annex (headings, bullets, bold, italic, rules). */
export function markdownToHtml(md: string): string {
  const inline = (t: string) => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  const out: string[] = [];
  let list = false;
  const closeList = () => { if (list) { out.push('</ul>'); list = false; } };
  for (const raw of md.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { closeList(); continue; }
    if (line.startsWith('# ')) { closeList(); continue; } // the annex has its own title
    if (line.startsWith('## ')) { closeList(); out.push(`<h3>${inline(line.slice(3))}</h3>`); continue; }
    if (line.trim() === '---') { closeList(); out.push('<hr/>'); continue; }
    const m = /^(\s*)- (.*)$/.exec(line);
    if (m) {
      if (!list) { out.push('<ul>'); list = true; }
      out.push(`<li${m[1].length >= 2 ? ' class="sub"' : ''}>${inline(m[2])}</li>`);
      continue;
    }
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join('\n');
}

export function buildAgreementHtml(data: AgreementData, opts: {
  signatureSvg?: string;
  signedAtLabel?: string;
  /** Blank printable version: empty condition + signature lines. */
  blank?: boolean;
  /** Paper fallback: the photographed pages (data URIs) after the document. */
  paperPhotos?: string[];
  termsMarkdown: string;
}): string {
  const r = data.renter;
  const items = data.lines.map(l => `
    <div class="item">
      <div class="row"><span class="name">${esc(l.productName)} <span class="qty">${esc(A.qty(l.quantity))}</span></span></div>
      <div class="muted">${esc(A.from)}: ${esc(l.pickupLabel)} &middot; ${esc(A.to)}: ${esc(l.returnLabel)}</div>
      <table>
        <tr><td>${esc(A.rental)}</td><td class="v">${lak(l.total)}</td></tr>
        <tr><td>${esc(A.deposit)}<div class="muted small">${esc(A.depositDetail(l.quantity, l.depositPerUnit.toLocaleString('en-US')))}</div></td><td class="v">${lak(l.deposit)}</td></tr>
      </table>
      <div class="cond">
        <div class="label">${esc(opts.blank ? A.conditionBlank : A.condition)}</div>
        ${opts.blank
          ? '<div class="blankline"></div><div class="blankline"></div>'
          : l.condition.map(c => `<div>${esc(c)}</div>`).join('')}
      </div>
    </div>`).join('');

  const signature = opts.blank
    ? `<div class="sigbox"></div><div class="muted">${esc(A.signedOnBlank)}</div>`
    : opts.signatureSvg
      ? `<div class="sigbox">${opts.signatureSvg}</div><div class="muted">${esc(A.signedOn(opts.signedAtLabel ?? ''))}</div>`
      : '';

  const paper = (opts.paperPhotos ?? []).map(src =>
    `<div class="page"><img class="photo" src="${src}"/></div>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  @page { size: A4; margin: 16mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1E1E1E; margin: 0; font-size: 12px; line-height: 1.5; }
  .header { border-bottom: 3px solid #F4B400; padding-bottom: 12px; margin-bottom: 16px; }
  .brand { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
  .tagline { font-size: 10px; color: #6B6B6B; }
  h1 { font-size: 20px; font-weight: 800; margin: 0 0 4px; }
  h2 { font-size: 14px; font-weight: 800; margin: 18px 0 6px; }
  h3 { font-size: 12.5px; font-weight: 800; margin: 12px 0 4px; }
  .muted { color: #6B6B6B; } .small { font-size: 10.5px; }
  .grid { display: flex; gap: 14px; }
  .box { flex: 1; border: 1px solid #ECECEA; border-radius: 10px; padding: 10px 12px; }
  .box .t { font-weight: 800; margin-bottom: 2px; }
  .item { border: 1px solid #ECECEA; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; page-break-inside: avoid; }
  .name { font-weight: 800; font-size: 13px; } .qty { color: #6B6B6B; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  td { padding: 3px 0; vertical-align: top; } td.v { text-align: right; font-weight: 700; white-space: nowrap; }
  .cond { margin-top: 6px; border-top: 1px solid #ECECEA; padding-top: 6px; }
  .label { font-weight: 700; }
  .totals td { font-size: 13px; } .totals td.v { font-size: 14px; }
  ul { margin: 4px 0; padding-left: 18px; } li { margin: 2px 0; } li.sub { margin-left: 16px; list-style: circle; }
  .accept { font-weight: 800; font-size: 13px; margin: 16px 0 6px; }
  .sigbox { height: 110px; border: 1px solid #DCDAD3; border-radius: 10px; padding: 6px; margin-bottom: 4px; }
  .blankline { border-bottom: 1px solid #DCDAD3; height: 22px; }
  .footer { margin-top: 14px; font-size: 10px; color: #8A8A8A; }
  .annex { page-break-before: always; font-size: 10.5px; }
  .annex h2 { font-size: 15px; } .annex p { margin: 4px 0; }
  hr { border: none; border-top: 1px solid #ECECEA; margin: 10px 0; }
  .page { page-break-before: always; text-align: center; }
  .photo { max-width: 100%; max-height: 250mm; }
</style></head><body>
  <div class="header"><div class="brand">LANCHAI</div><div class="tagline">Rent. Return. Repeat.</div></div>
  <h1>${esc(opts.paperPhotos ? A.paperTitle : A.title)}</h1>
  <div class="muted">Order <strong>${esc(data.orderLabel)}</strong></div>
  ${opts.paperPhotos ? `<p>${esc(A.paperNote(opts.signedAtLabel ?? ''))}</p>` : ''}
  <p>${esc(A.intro)}</p>

  <div class="grid">
    <div class="box"><div class="t">${esc(A.lanchai)}</div>
      ${esc(data.shop.name)}<br/>${esc(data.shop.address)}<br/>${esc(data.shop.email)}${data.shop.whatsapp ? `<br/>WhatsApp ${esc(data.shop.whatsapp)}` : ''}</div>
    <div class="box"><div class="t">${esc(A.renter)}</div>
      ${esc(r.name)}${r.phone ? `<br/>${esc(r.phone)}` : ''}${r.email ? `<br/>${esc(r.email)}` : ''}<br/>
      ${esc(r.idType && r.idCheckedAtLabel ? A.idChecked(r.idType, r.idCheckedAtLabel) : A.idNotChecked)}</div>
  </div>

  <h2>${esc(A.items)}</h2>
  ${items}

  <table class="totals">
    <tr><td>${esc(A.totalRental)}</td><td class="v">${lak(data.rentalTotal)}</td></tr>
    <tr><td>${esc(A.totalDeposit)}</td><td class="v">${lak(data.depositTotal)}</td></tr>
  </table>

  <h2>${esc(A.rules)}</h2>
  <ul>${A.keyRules.map(k => `<li>${esc(k)}</li>`).join('')}</ul>
  <p class="muted">${esc(A.terms(data.termsEffectiveDate))}</p>

  <div class="accept">${esc(A.accept)}</div>
  <div class="label">${esc(A.signature)}</div>
  ${signature}

  <div class="footer">${esc(A.version(data.templateVersion, data.agreementId))}</div>

  <div class="annex">
    <h2>${esc(A.annex(data.termsEffectiveDate))}</h2>
    ${markdownToHtml(opts.termsMarkdown)}
  </div>
  ${paper}
</body></html>`;
}

/** The current Terms, placeholders filled (address, WhatsApp) — for the annex. */
export async function termsForAnnex(shop: ShopInfo): Promise<string> {
  return fillLegalPlaceholders(TERMS_MARKDOWN, shop, await getPublicRetention());
}

// ── Sign / paper / print / open ──────────────────────────────────────────────

async function uploadPdf(html: string, agreementId: string, method: AgreementMethod): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const blob: Blob = await (await fetch(uri)).blob();
  await uploadBytes(storageRef(storage, agreementPdfPath(agreementId, method)), blob, { contentType: 'application/pdf' });
}

async function finalize(agreementId: string, reservationIds: string[], method: AgreementMethod, staffName: string) {
  const r = await httpsCallable(functions, 'finalizeRentalAgreement')({ agreementId, reservationIds, method, staffName });
  return r.data as { agreementId: string; signedAtMs: number; emailed: boolean };
}

export const agreementIdFor = (reservations: RentalDoc[]) =>
  newAgreementId(reservations[0].orderId ?? reservations[0].id, Date.now());

/** Signature on the staff device → PDF → Storage → finalizeRentalAgreement. */
export async function signAgreement(args: {
  data: AgreementData; termsMarkdown: string; signature: Signature; staffName: string; reservationIds: string[];
}) {
  const html = buildAgreementHtml(args.data, {
    signatureSvg: toSignatureSvg(args.signature),
    signedAtLabel: vteReservationLabel(Date.now()),
    termsMarkdown: args.termsMarkdown,
  });
  await uploadPdf(html, args.data.agreementId, 'signature');
  return finalize(args.data.agreementId, args.reservationIds, 'signature', args.staffName);
}

/** Paper fallback: the agreement text + the photographed signed pages, as one PDF. */
export async function savePaperAgreement(args: {
  data: AgreementData; termsMarkdown: string; photoUris: string[]; staffName: string; reservationIds: string[];
}) {
  const photos: string[] = [];
  for (const uri of args.photoUris) {
    const img = await manipulateAsync(uri, [{ resize: { width: 1400 } }], { compress: 0.7, format: SaveFormat.JPEG, base64: true });
    if (img.base64) photos.push(`data:image/jpeg;base64,${img.base64}`);
  }
  const html = buildAgreementHtml(args.data, {
    blank: true, paperPhotos: photos, signedAtLabel: vteReservationLabel(Date.now()), termsMarkdown: args.termsMarkdown,
  });
  await uploadPdf(html, args.data.agreementId, 'paper');
  return finalize(args.data.agreementId, args.reservationIds, 'paper', args.staffName);
}

/** Printable blank version (system print dialog). */
export async function printBlankAgreement(data: AgreementData, termsMarkdown: string): Promise<void> {
  await Print.printAsync({ html: buildAgreementHtml(data, { blank: true, termsMarkdown }) });
}

export interface AgreementDoc {
  orderId: string; renterId: string; reservationIds: string[]; method: AgreementMethod;
  pdfPath: string; signedAt?: { toMillis: () => number }; emailSentAt?: unknown; emailResult?: string;
  supersededBy?: string;
}

export async function getAgreement(agreementId: string): Promise<AgreementDoc | null> {
  const snap = await getDoc(doc(db, 'rentalAgreements', agreementId));
  return snap.exists() ? (snap.data() as AgreementDoc) : null;
}

/** Admin only (internal/audit): who recorded it. */
export async function getAgreementStaff(agreementId: string): Promise<string | null> {
  const snap = await getDoc(doc(db, 'rentalAgreements', agreementId, 'internal', 'audit')).catch(() => null);
  return snap?.exists() ? (snap.data().staffName as string) ?? null : null;
}

/** Downloads the stored PDF and opens the share sheet (renter + admin). */
export async function openAgreementPdf(agreementId: string, orderLabel: string): Promise<'ok' | 'unavailable' | 'error'> {
  try {
    const a = await getAgreement(agreementId);
    if (!a) return 'error';
    const url = await getDownloadURL(storageRef(storage, a.pdfPath));
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    const file = new File(Paths.cache, `LANCHAI-agreement-${orderLabel.replace(/[^A-Za-z0-9-]/g, '')}.pdf`);
    if (file.exists) file.delete();
    file.create();
    file.write(bytes);
    if (!(await Sharing.isAvailableAsync())) return 'unavailable';
    await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: 'LANCHAI rental agreement', UTI: 'com.adobe.pdf' });
    return 'ok';
  } catch {
    return 'error';
  }
}
