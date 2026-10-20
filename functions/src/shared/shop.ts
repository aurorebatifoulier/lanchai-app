// Display defaults for config/shop, used whenever that doc (or a field of it) is
// missing — by the app (lib/shop.ts's SHOP_FALLBACK) and by the emails, so both always
// show the same shop info. Dependency-free (see latePenalty.ts for why it lives here).
export const SHOP_DISPLAY_DEFAULTS = {
  name:           'LANCHAI · Setthathirath shop',
  addressLine:    '14 Setthathirath Road',
  city:           'Vientiane',
  hours:          'Daily 9:00–20:00',
  whatsappNumber: '',
};

export const CONTACT_EMAIL = 'contact@lanchai.la';
