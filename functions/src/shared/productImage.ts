// Product photos — full size (`images`, ~1600 px: product page gallery only) and their
// small copies (`thumbs`, 600 px JPEG, SAME ORDER as `images`) for every card, rail,
// bag / order thumbnail and email. Written by the admin product form (lib/productThumbs.ts).
// Dependency-free: shared by the app and Cloud Functions.

export const THUMB_WIDTH = 600;

type WithImages = { images?: unknown; thumbs?: unknown } | null | undefined;

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((u): u is string => typeof u === 'string' && u.length > 0) : [];

/** True when `thumbs` lines up with `images` (same length) — otherwise never trust it. */
export function thumbsAligned(p: WithImages): boolean {
  const images = strings(p?.images);
  const thumbs = strings(p?.thumbs);
  return images.length > 0 && thumbs.length === images.length;
}

/** The small copy of photo `i`, or the full-size photo when no aligned thumbnail exists. */
export function productThumb(p: WithImages, i = 0): string | null {
  const images = strings(p?.images);
  if (!images[i]) return null;
  return thumbsAligned(p) ? strings(p?.thumbs)[i] : images[i];
}
