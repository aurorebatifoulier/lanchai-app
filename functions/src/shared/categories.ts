// THE category list — the ONE place to add, rename, reorder or restyle a category.
// Dependency-free: shared by the app (re-exported by constants/categoryStyle.ts,
// lib/mockData.ts, the copy files…) and Cloud Functions. The array order is the display
// order everywhere (Home, Explore, stickers, admin pickers).
//
// Adding a category: add an entry below AND add its id to the `categoryIds()` list in
// firestore.rules (rules can't import TS — tests/unit/categories.test.ts fails while the
// two lists differ; rules are deployed by hand in the console).
//
// Products carry `categories: string[]` (1–MAX_CATEGORIES, no duplicates, valid ids;
// [0] = the MAIN category: colour, sticker, chip — wherever one category is shown) and,
// as a legacy mirror, `category` = categories[0]. Older products only have `category`:
// ALWAYS read through categoriesOf() / primaryCategory() / displayCategory().

/** Palette shade names (constants/brandShades.ts SHADES keys) — resolved by the app. */
export type CategoryShade =
  | 'amber' | 'amberMid' | 'amberSoft' | 'amberLight' | 'amberDeep'
  | 'carbon' | 'carbonSoft' | 'carbonLight';

export interface CategoryConfig {
  id: string;
  label: string;
  /** MaterialCommunityIcons name (the icon set the app already uses for categories). */
  icon: string;
  bg: CategoryShade;
  fg: CategoryShade;
  /** Dark background — text / icons on it must be light. */
  dark?: boolean;
  /** Explore line shown when the category is selected. */
  line: string;
  /** Explore title when the category has no product at all. */
  emptyTitle: string;
  /** My Account sticker name. */
  stickerName: string;
  /** Search terms matched against the category field (+ admin keyword suggestions). */
  keywords: string[];
  /** Admin picker hint. */
  adminHint: string;
  /** false = internal value, admin screens only — never shown to renters. */
  clientVisible: boolean;
}

export const CATEGORY_CONFIG: readonly CategoryConfig[] = [
  {
    id: 'tools', label: 'Tools', icon: 'hammer-wrench', bg: 'carbon', fg: 'amber', dark: true,
    line: 'Fix it. Return it. Keep your weekend.',
    emptyTitle: 'The drills are still charging.',
    stickerName: 'DIY hero',
    keywords: ['drill', 'diy', 'repair', 'hammer', 'saw', 'ladder', 'screwdriver', 'garden', 'fix', 'renovation'],
    adminHint: 'DIY & garden — drills, hedge trimmers, shovels',
    clientVisible: true,
  },
  {
    id: 'home', label: 'Home', icon: 'sofa-outline', bg: 'carbonLight', fg: 'carbon',
    line: 'Feel at home. Without the boxes.',
    emptyTitle: 'The cosy stuff is still unpacking.',
    stickerName: 'Home hero',
    keywords: ['furniture', 'chair', 'table', 'fan', 'kitchen', 'appliance', 'cleaning', 'vacuum', 'mattress', 'guest bed'],
    adminHint: 'Kitchen, appliances, cleaning, bedding',
    clientVisible: true,
  },
  {
    id: 'kids', label: 'Kids', icon: 'teddy-bear', bg: 'carbonSoft', fg: 'amberSoft', dark: true,
    line: 'They grow fast. Your closet doesn’t have to.',
    emptyTitle: 'The little ones’ gear is on its way.',
    stickerName: 'Super parent',
    keywords: ['baby', 'child', 'stroller', 'pram', 'cot', 'crib', 'high chair', 'car seat', 'toy', 'toddler'],
    adminHint: 'Strollers, baby beds, playards, kids gear',
    clientVisible: true,
  },
  {
    id: 'outdoor', label: 'Outdoor', icon: 'tent', bg: 'amberLight', fg: 'amberDeep',
    line: 'Sleep under the stars. Not under a mortgage.',
    emptyTitle: 'The tents are still in their bags.',
    stickerName: 'Weekend camper',
    keywords: ['camping', 'tent', 'hiking', 'sleeping bag', 'cooler', 'picnic', 'river', 'trip', 'hammock', 'backpack'],
    adminHint: 'Camping, hiking, tents, hammocks, backpacks',
    clientVisible: true,
  },
  {
    id: 'games', label: 'Games', icon: 'dice-5-outline', bg: 'amberMid', fg: 'carbon',
    line: 'Game night tonight. Shelf space tomorrow.',
    emptyTitle: 'The dice are still rolling.',
    stickerName: 'Game master',
    keywords: ['board game', 'game', 'game night', 'dice', 'cards', 'puzzle', 'console', 'controller', 'party game', 'family game'],
    adminHint: 'Board games, card games, consoles, puzzles',
    clientVisible: true,
  },
  {
    id: 'other', label: 'Other', icon: 'package-variant-closed', bg: 'carbonLight', fg: 'carbon',
    line: '', emptyTitle: '', stickerName: '', keywords: [],
    adminHint: 'Internal — never shown to renters',
    clientVisible: false,
  },
];

export const MAX_CATEGORIES = 5;

/** Every valid id (admin + renter), display order. */
export const ALL_CATEGORY_IDS: readonly string[] = CATEGORY_CONFIG.map(c => c.id);
/** Categories renters see, display order. */
export const CLIENT_CATEGORIES: readonly CategoryConfig[] = CATEGORY_CONFIG.filter(c => c.clientVisible);
export const CLIENT_CATEGORY_IDS: readonly string[] = CLIENT_CATEGORIES.map(c => c.id);

/** Labels of retired ids, so old data (requests, promo scopes…) stays readable in admin. */
const LEGACY_LABELS: Record<string, string> = { fun: 'Fun', sports: 'Sports' };

const BY_ID = new Map(CATEGORY_CONFIG.map(c => [c.id, c]));

export function categoryConfig(id: string): CategoryConfig | undefined {
  return BY_ID.get(id);
}
export function isCategoryId(id: unknown): id is string {
  return typeof id === 'string' && BY_ID.has(id);
}
export function isClientCategory(id: unknown): boolean {
  return typeof id === 'string' && BY_ID.get(id)?.clientVisible === true;
}
/** Display label — config label, else a retired one, else the id capitalised. */
export function categoryLabel(id: string): string {
  return BY_ID.get(id)?.label ?? LEGACY_LABELS[id] ?? (id ? id.charAt(0).toUpperCase() + id.slice(1) : '');
}

/** Valid, de-duplicated, at most MAX_CATEGORIES — order kept (first = main). */
export function sanitizeCategories(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    if (isCategoryId(v) && !out.includes(v)) out.push(v);
    if (out.length >= MAX_CATEGORIES) break;
  }
  return out;
}

interface WithCategories { categories?: unknown; category?: unknown }

/**
 * A product's categories, main first. New products: their valid `categories`. Legacy
 * products (no valid `categories`): `[category]` as stored — even a retired id, so admin
 * screens and the migration can still see it; renter screens filter on top of this.
 */
export function categoriesOf(p: WithCategories | null | undefined): string[] {
  if (!p) return [];
  const list = sanitizeCategories(p.categories);
  if (list.length > 0) return list;
  return typeof p.category === 'string' && p.category ? [p.category] : [];
}

/** The main category (first one), or null. */
export function primaryCategory(p: WithCategories | null | undefined): string | null {
  return categoriesOf(p)[0] ?? null;
}

/** The product's categories renters may see, main first. */
export function clientCategoriesOf(p: WithCategories | null | undefined): string[] {
  return categoriesOf(p).filter(isClientCategory);
}

/**
 * The ONE category shown to renters (chip, badge colour, sticker): the main category when
 * renter-visible, else the next renter-visible one, else null (neutral badge, no chip).
 */
export function displayCategory(p: WithCategories | null | undefined): string | null {
  return clientCategoriesOf(p)[0] ?? null;
}

/** Product in this category (any position) — Explore / filters. */
export function inCategory(p: WithCategories | null | undefined, id: string): boolean {
  return categoriesOf(p).includes(id);
}

// ── "Notify me when items arrive" (onCategoryArrival) ───────────────────────────

type ProductLike = WithCategories & { status?: unknown; categoriesMigratedAt?: unknown };
const renterVisible = (p: ProductLike | undefined | null) => !!p && p.status !== 'draft' && p.status !== 'archived';
const stampMs = (v: unknown) => (v as { toMillis?: () => number } | null | undefined)?.toMillis?.() ?? null;

/**
 * Renter categories a product write just made it appear in: the product is renter-visible
 * after the write, and each category wasn't among its renter categories while it was
 * visible before. A category migration write (categoriesMigratedAt changed) → none.
 */
export function arrivedCategories(before: ProductLike | undefined | null, after: ProductLike | undefined | null): string[] {
  if (!renterVisible(after)) return [];
  if (before && stampMs(after!.categoriesMigratedAt) !== stampMs(before.categoriesMigratedAt)) return [];
  const had = renterVisible(before) ? clientCategoriesOf(before) : [];
  return clientCategoriesOf(after).filter(c => !had.includes(c));
}
