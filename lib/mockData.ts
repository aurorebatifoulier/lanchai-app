import type { Timestamp } from 'firebase/firestore';
import type { LoyaltyTier } from './firestore';

export type ProductCategory =
  | 'fun'
  | 'tools'
  | 'outdoor'
  | 'sports'
  | 'kids'
  | 'home';

export interface Product {
  id: string;
  name: string;
  shortDesc: string;
  description: string;
  category: ProductCategory;
  pricePerDay: number;       // 1–2 day rate (base rate used by catalogue) — USD
  price3to6: number;         // 3–6 day rate — USD
  price7to13: number;        // 7–13 day rate — USD
  price14to29: number;       // 14–29 day rate — USD
  price30plus: number;       // 30+ day rate — USD
  deposit: number;           // USD
  /** Returned rentals per Vientiane month, "2026-10" → n (applyRentalCount). Home podium. */
  rentalsByMonth?: Record<string, number>;
  retailPrice?: number;          // approximate new retail price — USD
  reviewCount: number;
  rentalCount: number;
  averageRating?: number;
  available: boolean;
  /** Listing lifecycle (lib/types.ts ProductDoc): drafts/archived are never shown to renters. */
  status?: 'draft' | 'published' | 'archived';
  stockLeft: number;
  // Units currently out of the bookable pool (repair/lost/pending settlement) — see
  // utils/availability.ts's effectiveStock(), the required way to read adjusted stock.
  inRepairUnits?: number;
  lostUnits?: number;
  pendingSettlementUnits?: number;
  perfectFor?:    string[];
  keyFeatures?:   { icon: string; text: string }[];
  whatsIncluded?: string[];
  /** Search keywords (lowercase, ≤ 20) — Admin product form; lib/search.ts. */
  keywords?: string[];
  basicInfo?:     { label: string; value: string }[];
  techSpecs?:     { label: string; value: string }[];
  goodToKnow?:    string[];
  usageExamples?: string[];
  iconName: string;
  iconSet: 'Feather' | 'MaterialCommunityIcons' | 'Ionicons';
  /** Legacy per-product colour — no longer read or written (old docs may still carry it). */
  cardBg?: 'amber' | 'dark' | 'beige' | 'default';
  tag?: string;
  tagStyle?: 'amber' | 'dark';
  imageUrl?: string;
  images?: string[];          // carousel slides (4+ per product)
  isPopular?: boolean;        // "Popular" badge
  isNewThisWeek?: boolean;    // "New this week" badge
  isMostRented?: boolean;     // "Most rented" badge
  isPremium?: boolean;        // Premium badge + Premium Home section + non-refundable advance
  showInPopular?: boolean;    // manually controls "Popular near you" Home section
  showInNew?: boolean;        // manually controls "New arrivals" Home section
  bookingsCount?: number;
  createdAt?: number;
  // Loyalty Phase 2 — tier-gated access. Absent accessMode reads as 'public'. Products
  // are never hidden — non-public modes only badge + disable booking for renters below
  // minTierRequired. earlyAccessUntil only applies to 'earlyAccess' (auto-expires to
  // 'public' at that time); 'exclusive' never auto-expires.
  accessMode?: 'public' | 'earlyAccess' | 'exclusive';
  minTierRequired?: LoyaltyTier;
  earlyAccessUntil?: Timestamp;
}

export const CATEGORIES = [
  { id: 'all',     name: 'All',     icon: 'grid',      iconSet: 'Feather' as const },
  { id: 'fun',     name: 'Fun',     icon: 'book-open', iconSet: 'Feather' as const },
  { id: 'tools',   name: 'Tools',   icon: 'tool',      iconSet: 'Feather' as const },
  { id: 'outdoor', name: 'Outdoor', icon: 'compass',   iconSet: 'Feather' as const },
  { id: 'sports',  name: 'Sports',  icon: 'target',    iconSet: 'Feather' as const },
  { id: 'kids',    name: 'Kids',    icon: 'smile',     iconSet: 'Feather' as const },
  { id: 'home',    name: 'Home',    icon: 'home',      iconSet: 'Feather' as const },
];

export const CATEGORY_DETAILS: Record<string, { label: string; description: string }> = {
  'fun':     { label: 'Fun',     description: 'Books (kids & novels) and board games' },
  'tools':   { label: 'Tools',   description: 'DIY, hardware & garden equipment' },
  'outdoor': { label: 'Outdoor', description: 'Camping, hiking, tents & outdoor gear' },
  'sports':  { label: 'Sports',  description: 'Archery, pétanque, golf & sports equipment' },
  'kids':    { label: 'Kids',    description: 'Strollers, baby beds, playards & kids gear' },
  'home':    { label: 'Home',    description: 'Kitchen, appliances, cleaning & bedding' },
};
