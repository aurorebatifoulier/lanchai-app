// Display defaults for config/shop, used whenever that doc (or a field of it) is
// missing — by the app (lib/shop.ts's SHOP_FALLBACK) and by the emails, so both always
// show the same shop info. Dependency-free (see latePenalty.ts for why it lives here).

// Payment methods shown to renters (emails "What to bring"; editable as
// config/shop.paymentMethods). Kept aligned with Terms §4 (lib/legalContent.ts).
export const DEFAULT_PAYMENT_METHODS = 'Cash (LAK, USD or THB), bank transfer or QR payment';

export const SHOP_DISPLAY_DEFAULTS = {
  name:           'LANCHAI',
  addressLine:    '9 Khouvieng Road, Shop N°43, Beung Khahiong Village, Sisattanak District',
  city:           '01000 Vientiane',
  hours:          'Daily 9:00–20:00',
  whatsappNumber: '',
  paymentMethods: DEFAULT_PAYMENT_METHODS,
};

export const CONTACT_EMAIL = 'contact@lanchai.la';

/**
 * "Open daily 9:00–20:00" from the free-text hours ("Daily 9:00–20:00"). Only a
 * leading "Daily"/"Every" is lowercased after "Open" — never a day name like "Mon–Sat".
 */
export function openHoursText(hours: string): string {
  const h = hours.trim();
  return /^(Daily|Every)\b/.test(h) ? `Open ${h.charAt(0).toLowerCase()}${h.slice(1)}` : `Open ${h}`;
}

/** Google Maps link: exact coordinates when set in config/shop, otherwise the address. */
export function mapsUrl(shop: {
  name: string; addressLine: string; city: string; latitude?: number; longitude?: number;
}): string {
  if (shop.latitude != null && shop.longitude != null) {
    return `https://maps.google.com/?q=${shop.latitude},${shop.longitude}`;
  }
  const q = encodeURIComponent(`${shop.name} ${shop.addressLine} ${shop.city} Laos`);
  return `https://maps.google.com/?q=${q}`;
}
