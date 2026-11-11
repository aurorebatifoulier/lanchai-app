// Home hero carousel = admin hero slides (homeSlides, placement 'hero') + the built-in
// marketing banners (constants/homeBanners.ts), in ONE admin-controlled order.
// Built-in state lives in config/homeHero { builtIns: { [bannerId]: { published?, order? } } }
// (lib/homeHero.ts) — content stays in code. Pure (no Firebase, no assets) so it's unit
// tested: tests/unit/heroItems.test.ts.
//
// Order: one shared numbering — slides use homeSlides.order, built-ins their stored order.
// A built-in with no stored order comes after every ordered item, in config order. Equal
// numbers: the admin slide first. A built-in with no stored `published` is published.
import type { HomeSlide } from './homeSlides';

export type BuiltInState = { published?: boolean; order?: number };
export type HeroState = { builtIns: Record<string, BuiltInState> };
export const EMPTY_HERO_STATE: HeroState = { builtIns: {} };

export type HeroEntry<B extends { id: string }> =
  | { kind: 'slide'; key: string; slide: HomeSlide; published: boolean }
  | { kind: 'builtIn'; key: string; banner: B; published: boolean };

/** Every hero item (published or not), in display order — the admin list. */
export function mergeHeroList<B extends { id: string }>(
  slides: HomeSlide[], state: HeroState | null, banners: B[],
): HeroEntry<B>[] {
  const stored = state?.builtIns ?? {};
  type Row = { entry: HeroEntry<B>; order: number; rank: number; tie: number };
  const rows: Row[] = [];
  slides.filter(s => s.placement === 'hero').forEach(s => {
    rows.push({ entry: { kind: 'slide', key: `slide:${s.id}`, slide: s, published: s.published }, order: s.order, rank: 0, tie: 0 });
  });
  banners.forEach((b, i) => {
    const st = stored[b.id] ?? {};
    const hasOrder = typeof st.order === 'number' && Number.isFinite(st.order);
    rows.push({
      entry: { kind: 'builtIn', key: `builtIn:${b.id}`, banner: b, published: st.published !== false },
      order: hasOrder ? (st.order as number) : 0,
      rank: hasOrder ? 0 : 1, // never-ordered built-ins after everything else
      tie: hasOrder ? 1 : i,  // equal order → slide (0) before built-in (1); unordered → config order
    });
  });
  rows.sort((a, b) => a.rank - b.rank || a.order - b.order || a.tie - b.tie);
  return rows.map(r => r.entry);
}

/**
 * What the Home shows: published items (slides also within their dates), in order —
 * every item in admin preview. Nothing visible → all built-ins (`fallback`), so the hero
 * is never empty.
 */
export function visibleHeroItems<B extends { id: string }>(
  list: HeroEntry<B>[],
  opts: { preview?: boolean; isActive: (slide: HomeSlide) => boolean },
): { items: HeroEntry<B>[]; fallback: boolean } {
  const items = opts.preview
    ? list
    : list.filter(e => e.published && (e.kind === 'builtIn' || opts.isActive(e.slide)));
  if (items.length > 0) return { items, fallback: false };
  return {
    items: list.filter(e => e.kind === 'builtIn').map(e => ({ ...e, published: true })),
    fallback: true,
  };
}

/** Sanitises a config/homeHero document (unknown shapes → ignored). */
export function heroStateOf(data: unknown): HeroState {
  const raw = (data as { builtIns?: unknown } | null)?.builtIns;
  const builtIns: Record<string, BuiltInState> = {};
  if (raw && typeof raw === 'object') {
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
      const o = (v ?? {}) as Record<string, unknown>;
      const st: BuiltInState = {};
      if (typeof o.published === 'boolean') st.published = o.published;
      if (typeof o.order === 'number' && Number.isFinite(o.order)) st.order = o.order;
      builtIns[id] = st;
    }
  }
  return { builtIns };
}
