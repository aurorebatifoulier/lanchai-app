import type { EmailShop } from './context';
import { CONTACT_EMAIL } from '../shared/shop';

// ONE shared layout for every LANCHAI email: HTML (table-based, inline styles for email
// clients) + a plain-text fallback built from the same blocks. Brand: amber #F4B400,
// carbon #1E1E1E, cream #FAFAF7, sentence case, rounded rectangles, no gradients.

const AMBER = '#F4B400';
const CARBON = '#1E1E1E';
const CREAM = '#FAFAF7';
const MUTED = '#6B6B6B';
const BORDER = '#ECECEA';
const DANGER = '#C8412C';

export type Row = { label: string; value: string; strong?: boolean; tone?: 'danger' | 'muted' };

export type Block =
  | { type: 'p'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'rows'; rows: Row[]; note?: string }
  | { type: 'item'; title: string; lines: string[] }
  | { type: 'note'; text: string }
  | { type: 'shop' };

export interface EmailContent {
  /** Short hidden preview text shown by inbox lists. */
  preheader: string;
  title: string;
  greeting?: string;
  blocks: Block[];
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const e = escapeHtml;

function rowHtml(r: Row): string {
  const color = r.tone === 'danger' ? DANGER : r.tone === 'muted' ? MUTED : CARBON;
  const weight = r.strong ? 800 : 600;
  const size = r.strong ? 15 : 13;
  return `<tr>
    <td style="padding:6px 0;font-size:${size}px;color:${r.strong ? CARBON : MUTED};font-weight:${r.strong ? 800 : 500};">${e(r.label)}</td>
    <td style="padding:6px 0;font-size:${size}px;color:${color};font-weight:${weight};text-align:right;white-space:nowrap;">${e(r.value)}</td>
  </tr>`;
}

function shopHtml(shop: EmailShop): string {
  return `<div style="border:1px solid ${BORDER};border-radius:12px;padding:14px 16px;margin:16px 0;background:#FFFFFF;">
    <div style="font-size:13px;font-weight:800;color:${CARBON};margin-bottom:4px;">Pick-up and return</div>
    <div style="font-size:13px;color:${MUTED};line-height:20px;">${e(shop.name)}<br/>${e(shop.addressLine)}, ${e(shop.city)}<br/>Open ${e(shop.hours)}</div>
  </div>`;
}

function blockHtml(b: Block, shop: EmailShop): string {
  switch (b.type) {
    case 'p':
      return `<p style="margin:0 0 14px;font-size:14px;line-height:22px;color:${CARBON};">${e(b.text)}</p>`;
    case 'heading':
      return `<div style="margin:20px 0 8px;font-size:13px;font-weight:800;color:${CARBON};">${e(b.text)}</div>`;
    case 'note':
      return `<p style="margin:0 0 14px;font-size:12px;line-height:18px;color:${MUTED};">${e(b.text)}</p>`;
    case 'rows':
      return `<div style="border:1px solid ${BORDER};border-radius:12px;padding:8px 16px;margin:0 0 14px;background:#FFFFFF;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${b.rows.map(rowHtml).join('')}</table>
        ${b.note ? `<div style="font-size:11px;color:${MUTED};padding:4px 0 6px;">${e(b.note)}</div>` : ''}
      </div>`;
    case 'item':
      return `<div style="border:1px solid ${BORDER};border-radius:12px;padding:12px 16px;margin:0 0 10px;background:#FFFFFF;">
        <div style="font-size:14px;font-weight:800;color:${CARBON};margin-bottom:4px;">${e(b.title)}</div>
        ${b.lines.map(l => `<div style="font-size:12px;color:${MUTED};line-height:19px;">${e(l)}</div>`).join('')}
      </div>`;
    case 'shop':
      return shopHtml(shop);
  }
}

function contactHtml(shop: EmailShop): string {
  const wa = shop.whatsappNumber
    ? ` · WhatsApp <a href="https://wa.me/${e(shop.whatsappNumber)}" style="color:${CARBON};">+${e(shop.whatsappNumber)}</a>`
    : '';
  return `Questions? Reply to this email or write to <a href="mailto:${CONTACT_EMAIL}" style="color:${CARBON};">${CONTACT_EMAIL}</a>${wa}.`;
}

export function renderEmail(content: EmailContent, shop: EmailShop): { html: string; text: string } {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${e(content.title)}</title></head>
<body style="margin:0;padding:0;background:${CREAM};font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${e(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding:0 4px 16px;border-bottom:3px solid ${AMBER};">
        <div style="font-size:24px;font-weight:800;color:${CARBON};letter-spacing:-0.5px;">LANCHAI</div>
        <div style="font-size:11px;color:${MUTED};margin-top:2px;">Rent. Return. Repeat.</div>
      </td></tr>
      <tr><td style="padding:24px 4px 8px;">
        <h1 style="margin:0 0 14px;font-size:22px;line-height:28px;font-weight:800;color:${CARBON};">${e(content.title)}</h1>
        ${content.greeting ? `<p style="margin:0 0 14px;font-size:14px;line-height:22px;color:${CARBON};">${e(content.greeting)}</p>` : ''}
        ${content.blocks.map(b => blockHtml(b, shop)).join('\n')}
      </td></tr>
      <tr><td style="padding:16px 4px 8px;border-top:1px solid ${BORDER};font-size:12px;line-height:18px;color:${MUTED};">
        ${contactHtml(shop)}<br/>LANCHAI · ${e(shop.city)}, Laos
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const lines: string[] = ['LANCHAI', '', content.title, ''];
  if (content.greeting) lines.push(content.greeting, '');
  for (const b of content.blocks) {
    switch (b.type) {
      case 'p': case 'note': lines.push(b.text, ''); break;
      case 'heading': lines.push(b.text, '-'.repeat(b.text.length)); break;
      case 'rows':
        for (const r of b.rows) lines.push(`${r.label}: ${r.value}`);
        if (b.note) lines.push(b.note);
        lines.push('');
        break;
      case 'item': lines.push(b.title, ...b.lines.map(l => `  ${l}`), ''); break;
      case 'shop':
        lines.push('Pick-up and return', `${shop.name}`, `${shop.addressLine}, ${shop.city}`, `Open ${shop.hours}`, '');
        break;
    }
  }
  lines.push('---', `Questions? Reply to this email or write to ${CONTACT_EMAIL}`
    + (shop.whatsappNumber ? ` · WhatsApp +${shop.whatsappNumber} (https://wa.me/${shop.whatsappNumber})` : '') + '.');
  return { html, text: lines.join('\n') };
}

export function fmtLak(n: number): string {
  return `${Math.round(n).toLocaleString('en-US')} LAK`;
}

export function fmtCurrency(n: number, currency: 'LAK' | 'USD' | 'THB'): string {
  return currency === 'LAK' ? fmtLak(n) : `${n.toLocaleString('en-US')} ${currency}`;
}
