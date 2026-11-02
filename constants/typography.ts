// THE type scale (2026-11-02) — every renter screen uses these sizes; admin screens follow
// where they use the shared UI tokens. Line heights ≈ 1.2–1.45× the size. Change a level
// here, never per screen. Colours stay with each style (brandShades).
export const TYPE = {
  /** Screen title (tabs, stack screens). */
  screenTitle: { fontSize: 24, fontWeight: '700', lineHeight: 29, letterSpacing: -0.4 },
  /** Big numbers only (stats, podium rank, hero figures, slide titles). */
  display: { fontSize: 22, fontWeight: '800', lineHeight: 27, letterSpacing: -0.3 },
  /** Section titles, sheet titles, header titles of stack screens. */
  sectionTitle: { fontSize: 17, fontWeight: '700', lineHeight: 22 },
  /** Product name on a card, card titles. */
  cardTitle: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  body: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  /** Dates, prices, meta. */
  secondary: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  /** Chips and small labels. */
  small: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  /** Full-width buttons (bottom bars, forms). */
  button: { fontSize: 15, fontWeight: '600' },
  /** Buttons INSIDE cards (Rent again, Review, Extend, Directions, Notify me…). */
  buttonCard: { fontSize: 14, fontWeight: '600' },
  /** Tab chips (My rentals, filters). */
  tab: { fontSize: 13, fontWeight: '600' },
} as const;

/** Heights: full-width buttons 46 (secondary 44), in-card buttons 40 (radius 12), tab /
 *  filter chips 32 / 30 (padding 12), category circles 48 (label 12). */
export const SIZES = {
  btn: 46,
  btnSecondary: 44,
  btnCard: 40,
  btnCardRadius: 12,
  tab: 32,
  chip: 30,
  chipPadX: 12,
  categoryCircle: 48,
} as const;

/** System font size is respected but capped (lib/fontScaleCap.ts). */
export const MAX_FONT_SCALE = 1.3;
