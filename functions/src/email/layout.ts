import type { EmailShop } from './context';
import { CONTACT_EMAIL } from '../shared/shop';
import { LOGO_URL, iconUrl, type EmailIcon } from './config';

// ONE shared layout for every LANCHAI email (validated mockup): cream background, the
// logo on its own white rounded tile, then white rounded cards, then a footer with an
// amber top line. Table-based with inline styles (Gmail / Outlook / Apple Mail), max
// 560px, mobile-first. A plain-text version is rendered from the same blocks.
// Brand: amber #F4B400, carbon #1E1E1E, cream #FAFAF7, sentence case, no gradients.

const AMBER = '#F4B400';
const AMBER_TINT = '#FDF3D0';
const AMBER_TEXT = '#7A5500';
const CARBON = '#1E1E1E';
const CREAM = '#FAFAF7';
const MUTED = '#6B6B6B';
const BORDER = '#ECECEA';
const DANGER = '#C8412C';
const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

export interface Button { label: string; url: string; icon?: EmailIcon }

/** Icon with descriptive alt text (shown when images are blocked). */
export interface Icon { name: EmailIcon; alt: string }

/** Content inside a white card. */
export type Inner =
  | { type: 'text'; text: string; tone?: 'muted' | 'danger'; small?: boolean }
  | { type: 'subtle'; text: string }                                  // small grey line
  | { type: 'dates'; text: string }                                   // clock icon + shared dates line
  | { type: 'stack'; lines: string[]; note?: string }                 // compact block (first line bold)
  | { type: 'line'; name: string; detail?: string | string[]; amount?: string; compact?: boolean } // item row
  | { type: 'amount'; label: string; value: string; approx?: string } // big amount + small approx line
  | { type: 'row'; label: string; value: string; strong?: boolean; tone?: 'muted' | 'danger'; gapTop?: number }
  | { type: 'bullet'; text: string; icon?: Icon }                     // icon (or amber marker) + text
  | { type: 'divider' };

export type Block =
  | {
      type: 'hero';
      pill?: string;
      /** Rich pill, e.g. the tagline with one highlighted word (overrides `pill`). */
      pillParts?: { text: string; highlight?: boolean }[];
      title: string;
      sub?: string;
      primary?: Button;
      secondary?: Button[];   // outline buttons, side by side
    }
  | { type: 'card'; title?: string; items: Inner[] }
  | { type: 'center'; text: string; link?: Button };

export interface EmailContent {
  /** Hidden preview text shown by inbox lists. */
  preheader: string;
  /** Used for the <title> and the plain-text heading. */
  title: string;
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

// ── HTML pieces ──────────────────────────────────────────────────────────────

function iconImg(name: EmailIcon, alt: string, marginRight = 8): string {
  return `<img src="${iconUrl(name)}" width="16" height="16" alt="${e(alt)}" style="display:inline-block;width:16px;height:16px;border:0;outline:none;vertical-align:-3px;margin-right:${marginRight}px;font-size:11px;color:${MUTED};"/>`;
}

function primaryButton(b: Button): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">
    <tr><td align="center" bgcolor="${AMBER}" style="border-radius:10px;">
      <a href="${e(b.url)}" style="display:block;padding:14px 18px;font-family:${FONT};font-size:15px;font-weight:800;color:${CARBON};text-decoration:none;border-radius:10px;">${e(b.label)}</a>
    </td></tr>
  </table>`;
}

function outlineButtons(buttons: Button[]): string {
  const pad = (i: number) => (buttons.length === 1 ? '0' : i === 0 ? '0 5px 0 0' : '0 0 0 5px');
  const cells = buttons.map((b, i) => `<td width="${Math.floor(100 / buttons.length)}%" style="padding:${pad(i)};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td align="center" bgcolor="#FFFFFF" style="border:1px solid ${CARBON};border-radius:10px;">
          <a href="${e(b.url)}" style="display:block;padding:11px 8px;font-family:${FONT};font-size:13px;font-weight:700;color:${CARBON};text-decoration:none;border-radius:10px;">${b.icon ? `<img src="${iconUrl(b.icon)}" width="16" height="16" alt="" style="display:inline-block;width:16px;height:16px;border:0;outline:none;vertical-align:-3px;margin-right:6px;"/>` : ''}${e(b.label)}</a>
        </td>
      </tr></table>
    </td>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;"><tr>${cells}</tr></table>`;
}

function cardWrap(inner: string): string {
  return `<tr><td style="padding:0 0 10px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid ${BORDER};border-radius:14px;">
      <tr><td style="padding:14px 16px;font-family:${FONT};">${inner}</td></tr>
    </table>
  </td></tr>`;
}

function innerHtml(it: Inner): string {
  switch (it.type) {
    case 'text': {
      const color = it.tone === 'danger' ? DANGER : it.tone === 'muted' ? MUTED : CARBON;
      return `<p style="margin:0 0 10px;font-size:${it.small ? 12 : 14}px;line-height:${it.small ? 18 : 21}px;color:${color};">${e(it.text)}</p>`;
    }
    case 'subtle':
      return `<p style="margin:0 0 10px;font-size:12px;line-height:18px;color:${MUTED};">${e(it.text)}</p>`;
    case 'dates':
      return `<p style="margin:-4px 0 12px;font-size:13px;line-height:19px;color:${MUTED};">${iconImg('clock', 'Dates', 6)}${e(it.text)}</p>`;
    case 'stack':
      return `<p style="margin:0;font-size:14px;line-height:21px;color:${MUTED};">${it.lines.map((l, i) =>
        i === 0 ? `<span style="color:${CARBON};font-weight:700;">${e(l)}</span>` : e(l)).join('<br/>')}</p>
        ${it.note ? `<p style="margin:6px 0 0;font-size:12px;line-height:18px;color:${MUTED};">${e(it.note)}</p>` : ''}`;
    case 'amount':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;"><tr>
        <td style="vertical-align:top;font-size:14px;line-height:24px;color:${CARBON};font-weight:700;">${e(it.label)}</td>
        <td style="vertical-align:top;text-align:right;white-space:nowrap;padding-left:12px;">
          <div style="font-size:18px;line-height:24px;color:${CARBON};font-weight:800;">${e(it.value)}</div>
          ${it.approx ? `<div style="font-size:12px;line-height:16px;color:${MUTED};">${e(it.approx)}</div>` : ''}
        </td>
      </tr></table>`;
    case 'line':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 ${it.compact ? 4 : 10}px;"><tr>
        <td style="vertical-align:top;font-size:14px;line-height:20px;color:${CARBON};font-weight:700;">${e(it.name)}
          ${(Array.isArray(it.detail) ? it.detail : it.detail ? [it.detail] : [])
            .map(dl => `<div style="font-size:12px;line-height:17px;color:${MUTED};font-weight:500;">${e(dl)}</div>`).join('')}
        </td>
        ${it.amount ? `<td style="vertical-align:top;text-align:right;white-space:nowrap;padding-left:12px;font-size:14px;line-height:20px;color:${CARBON};font-weight:700;">${e(it.amount)}</td>` : ''}
      </tr></table>`;
    case 'row': {
      const color = it.tone === 'danger' ? DANGER : it.tone === 'muted' ? MUTED : CARBON;
      const size = it.strong ? 15 : 13;
      const lh = it.strong ? 22 : 18;          // compact totals block
      const top = it.gapTop ?? 1;
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="padding:${top}px 0 1px;font-size:${size}px;line-height:${lh}px;color:${it.strong ? CARBON : MUTED};font-weight:${it.strong ? 800 : 500};">${e(it.label)}</td>
        <td style="padding:${top}px 0 1px 12px;text-align:right;white-space:nowrap;font-size:${size}px;line-height:${lh}px;color:${color};font-weight:${it.strong ? 800 : 600};">${e(it.value)}</td>
      </tr></table>`;
    }
    case 'bullet':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 5px;"><tr>
        <td width="24" style="vertical-align:top;padding-top:2px;">
          ${it.icon
            ? iconImg(it.icon.name, it.icon.alt, 0)
            : `<div style="width:10px;height:10px;border-radius:5px;background:${AMBER};font-size:0;line-height:0;margin-top:4px;">&nbsp;</div>`}
        </td>
        <td style="font-size:14px;line-height:21px;color:${CARBON};">${e(it.text)}</td>
      </tr></table>`;
    case 'divider':
      return `<div style="height:1px;background:${BORDER};margin:8px 0 10px;font-size:0;line-height:0;">&nbsp;</div>`;
  }
}

function blockHtml(b: Block): string {
  switch (b.type) {
    case 'hero':
      return cardWrap(`<div style="text-align:center;">
        <img src="${LOGO_URL}" width="120" alt="LANCHAI" style="display:block;margin:4px auto 14px;width:120px;height:auto;border:0;outline:none;text-decoration:none;font-family:${FONT};font-size:20px;font-weight:800;color:${CARBON};"/>
        ${b.pillParts
          ? `<span style="display:inline-block;background:${AMBER_TINT};font-size:12px;padding:5px 12px;border-radius:999px;">${b.pillParts.map(pp =>
              `<span style="color:${pp.highlight ? AMBER_TEXT : MUTED};font-weight:${pp.highlight ? 800 : 500};">${e(pp.text)}</span>`).join(' ')}</span>`
          : b.pill ? `<span style="display:inline-block;background:${AMBER_TINT};color:${AMBER_TEXT};font-size:12px;font-weight:700;padding:5px 12px;border-radius:999px;">${e(b.pill)}</span>` : ''}
        <h1 style="margin:${b.pill || b.pillParts ? 14 : 0}px 0 6px;font-size:24px;line-height:30px;font-weight:800;color:${CARBON};">${e(b.title)}</h1>
        ${b.sub ? `<p style="margin:0;font-size:13px;line-height:19px;color:${MUTED};">${e(b.sub)}</p>` : ''}
      </div>
      ${b.primary ? primaryButton(b.primary) : ''}
      ${b.secondary?.length ? outlineButtons(b.secondary) : ''}`);
    case 'card':
      return cardWrap(`${b.title ? `<div style="font-size:15px;font-weight:800;color:${CARBON};margin:0 0 12px;">${e(b.title)}</div>` : ''}${b.items.map(innerHtml).join('')}`);
    case 'center':
      return `<tr><td align="center" style="padding:6px 12px 18px;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">
        ${e(b.text)}${b.link ? ` <a href="${e(b.link.url)}" style="color:${CARBON};font-weight:700;">${e(b.link.label)}</a>` : ''}
      </td></tr>`;
  }
}

function footerHtml(shop: EmailShop): string {
  const wa = shop.whatsappNumber
    ? `<br/>WhatsApp <a href="https://wa.me/${e(shop.whatsappNumber)}" style="color:${CARBON};">+${e(shop.whatsappNumber)}</a>`
    : '';
  return `<tr><td style="padding:16px 8px 8px;border-top:3px solid ${AMBER};font-family:${FONT};font-size:12px;line-height:19px;color:${MUTED};text-align:center;">
    <div style="font-size:13px;font-weight:800;color:${CARBON};margin-bottom:6px;">Rent. Return. Repeat.</div>
    Questions? Just reply to this email or write to <a href="mailto:${CONTACT_EMAIL}" style="color:${CARBON};">${CONTACT_EMAIL}</a>${wa}
    <br/>LANCHAI · Vientiane, Laos
  </td></tr>`;
}

// ── Plain text ───────────────────────────────────────────────────────────────

function innerText(it: Inner): string[] {
  switch (it.type) {
    case 'text': case 'subtle': return [it.text];
    case 'dates': return [it.text];
    case 'stack': return [...it.lines, ...(it.note ? ['', it.note] : [])];
    case 'line': return [`${it.name}${it.amount ? `  ${it.amount}` : ''}`,
      ...(Array.isArray(it.detail) ? it.detail : it.detail ? [it.detail] : []).map(dl => `  ${dl}`)];
    case 'amount': return [`${it.label}: ${it.value}${it.approx ? ` (${it.approx})` : ''}`];
    case 'row': return [`${it.label}${it.value ? `: ${it.value}` : ''}`];
    case 'bullet': return [`- ${it.text}`];
    case 'divider': return [''];
  }
}

function blockText(b: Block): string[] {
  switch (b.type) {
    case 'hero': return [
      ...(b.pillParts ? [b.pillParts.map(pp => pp.text).join(' ')] : b.pill ? [b.pill] : []), b.title, ...(b.sub ? [b.sub] : []),
      ...(b.primary ? [`${b.primary.label}: ${b.primary.url}`] : []),
      ...(b.secondary ?? []).map(s => `${s.label}: ${s.url}`),
      '',
    ];
    case 'card': return [...(b.title ? [b.title, '-'.repeat(b.title.length)] : []), ...b.items.flatMap(innerText), ''];
    case 'center': return [b.text + (b.link ? ` ${b.link.label.replace(/\.$/, '')}: ${b.link.url}` : ''), ''];
  }
}

// ── Render ───────────────────────────────────────────────────────────────────

export function renderEmail(content: EmailContent, shop: EmailShop): { html: string; text: string } {
  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light"/><meta name="supported-color-schemes" content="light"/>
<title>${e(content.title)}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${e(content.preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${CREAM}" style="background:${CREAM};">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      ${content.blocks.map(blockHtml).join('\n')}
      ${footerHtml(shop)}
    </table>
  </td></tr>
</table>
</body></html>`;

  const lines = ['LANCHAI', '', ...content.blocks.flatMap(blockText), '---', 'Rent. Return. Repeat.',
    `Questions? Just reply to this email or write to ${CONTACT_EMAIL}.`,
    ...(shop.whatsappNumber ? [`WhatsApp: +${shop.whatsappNumber} (https://wa.me/${shop.whatsappNumber})`] : []),
    'LANCHAI · Vientiane, Laos'];
  return { html, text: lines.join('\n') };
}

export function fmtLak(n: number): string {
  return `${Math.round(n).toLocaleString('en-US')} LAK`;
}

export function fmtCurrency(n: number, currency: 'LAK' | 'USD' | 'THB'): string {
  return currency === 'LAK' ? fmtLak(n) : `${n.toLocaleString('en-US')} ${currency}`;
}
