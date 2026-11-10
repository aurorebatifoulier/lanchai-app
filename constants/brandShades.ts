// Brand palette shades ONLY (amber #F4B400, carbon #1E1E1E, cream #FAFAF7 and their
// tints) — used by the My Account top (header decor, stats, loyalty card, stickers,
// resident promo). No other hues.
export const SHADES = {
  amber: '#F4B400',
  amberMid: '#F2C76E',     // soft amber fill (stickers, bubbles)
  amberSoft: '#FAC775',    // discreet end point (header flight-path hexagon)
  amberLight: '#F7ECD9',   // light amber circles, gauge track
  amberPale: '#FBF4E6',
  amberWash: '#F9F0E0',    // halfway amberLight → amberPale (Home search field fill)
  amberDeep: '#8A5A00',    // amber-brown icons/text on light amber
  amberText: '#95600D',    // dark amber TEXT (links, "See all", "Edit") — ≥ 4.5:1 on white / cream / light amber; same as the email icons
  carbon: '#1E1E1E',
  carbonSoft: '#3A3A3A',   // circles on carbon cards
  carbonMuted: '#6B6B6B',  // secondary text
  carbonFaint: '#B8B6B0',  // dashed / locked / disabled — DECORATIVE only, never readable text on a light background
  carbonPlaceholder: '#77756F', // input placeholders (≥ 4.5:1 on white)
  carbonLight: '#EFEEEA',  // light grey circles
  cream: '#FAFAF7',
  white: '#FFFFFF',
  border: '#E8E6DF',      // card borders (0.5px) and row separators
} as const;
