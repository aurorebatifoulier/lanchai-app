// lib/types.ts
// Canonical TypeScript types for Firestore documents used by the admin back-office.
// The client-side rendering interface (Product) lives in lib/mockData.ts and
// shares the same field names. ProductDoc adds admin-only fields (status,
// updatedAt, quantity) and documents the Firestore write shape explicitly.

import type { Timestamp } from 'firebase/firestore';
import type { ProductCategory } from './mockData';

// ── Product ───────────────────────────────────────────────────────────────────

export type ProductStatus = 'draft' | 'published' | 'archived';

export interface ProductDoc {
  id: string;
  name: string;
  shortDesc?: string;
  description: string;
  category: ProductCategory;

  // Pricing tiers (USD) — converted to LAK for display everywhere renter-facing,
  // via the live admin-set exchange rate (config/pricing). See lib/exchangeRate.ts.
  pricePerDay: number;    // 1–2 day base rate
  price3to6: number;
  price7to13: number;
  price14to29: number;
  price30plus: number;

  retailPrice?: number;   // approximate new retail price (USD)
  deposit: number;        // refundable security deposit (USD)

  // Inventory
  quantity: number;       // stock count — exposed as stockLeft on the client Product
  available: boolean;     // shown as availability chip on the product detail screen; a
                           // manual, cosmetic listing toggle — unrelated to the computed
                           // "available" bucket on the admin inventory dashboard, and
                           // never consulted by availability math (see effectiveStock).

  // Units currently out of the bookable pool for a physical-condition reason — always
  // subtracted from quantity/stockLeft via utils/availability.ts's effectiveStock(),
  // never read directly. No per-unit identity exists in this app (a "5 chairs" product
  // is just the integer 5, not five tracked units), so these are aggregate counts, not
  // references to specific units. See products/{id}/stockAdjustments for the audit
  // trail of how these counts changed over time.
  inRepairUnits?: number; // default 0
  lostUnits?: number;     // default 0 — incremented automatically when a reservation is
                           // reported lost/stolen (app/admin/reservations/[id].tsx), or
                           // manually from this product's own edit screen, or when a
                           // return checklist itself rates the item 'unusable'
  pendingSettlementUnits?: number; // default 0 — incremented by `quantity` the moment a
                           // reservation's return checklist is submitted (so the unit
                           // stops counting as available the instant it's marked
                           // returned), decremented only by the scheduled
                           // releaseSettledStock Cloud Function once BOTH the
                           // reservation's deposit/charges are closed out
                           // (returnFinalizedAt is set) AND the 12h HANDOFF_BUFFER_MS
                           // has elapsed since returnAt — see functions/src/index.ts.
                           // Never decremented by client code directly.

  // Admin lifecycle
  status: ProductStatus;  // 'draft' = not visible to renters; 'published' = live;
                           // 'archived' = removed from catalogue (the admin inventory
                           // dashboard's "removed" bucket sums stockLeft for these)

  // Display (mirrors the client Product interface exactly)
  iconName: string;
  iconSet: 'Feather' | 'MaterialCommunityIcons' | 'Ionicons';
  cardBg: 'amber' | 'dark' | 'beige' | 'default';
  tag?: string;
  tagStyle?: 'amber' | 'dark';
  imageUrl?: string;
  images?: string[];      // photo carousel — upload gated behind Firebase Blaze plan

  // Discovery flags
  isPopular?: boolean;
  isNewThisWeek?: boolean;
  isMostRented?: boolean;

  // Counters (typically managed by cloud functions / admin in a later step)
  averageRating?: number | null; // auto-calculated from reviews; null = no reviews yet
  reviewCount?: number;
  rentalCount?: number;
  bookingsCount?: number;

  // Specs
  specs?: {
    dimensions?: string;
    weight?: string;
    material?: string;
    condition?: string;
  };

  // Timestamps — Firestore Timestamp in live data, Unix seconds in mock data
  createdAt?: Timestamp | number;
  updatedAt?: Timestamp | number;
}
