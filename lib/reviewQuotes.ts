import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from './firebase';
import { cached, HOME_TTL } from './homeCache';
import type { Product } from './mockData';

// Explore surprise cards — short, real, published review quotes. Reviews live at
// reviews/{productId}/reviews/{reservationId} (readable by signed-in users);
// collectionGroup('reviews') is broken on this project (CLAUDE.md), so we read per
// product: the 5 products with the most reviews and an average ≥ 4, their 5 latest
// reviews each (single orderBy, no index) — ≤ 25 reads, cached 10 min. Kept: rating ≥ 4,
// text 10–110 characters; only the reviewer's first name is shown.
export interface ReviewQuote { productId: string; productName: string; firstName: string; rating: number; text: string }

const MAX_PRODUCTS = 5;
const PER_PRODUCT = 5;
const MAX_LEN = 110;

export async function getReviewQuotes(products: Product[]): Promise<ReviewQuote[]> {
  const top = products
    .filter(p => (p.reviewCount ?? 0) > 0 && (p.averageRating ?? 0) >= 4)
    .sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0))
    .slice(0, MAX_PRODUCTS);
  const key = `reviewQuotes:${top.map(p => p.id).join(',')}`;
  return cached(key, HOME_TTL.config, async () => {
    const lists = await Promise.all(top.map(p =>
      getDocs(query(collection(db, 'reviews', p.id, 'reviews'), orderBy('createdAt', 'desc'), limit(PER_PRODUCT)))
        .then(snap => snap.docs.map(d => d.data() as { rating?: unknown; text?: unknown; reviewerName?: unknown }))
        .catch(() => [] as { rating?: unknown; text?: unknown; reviewerName?: unknown }[])
        .then(rows => rows.flatMap(r => {
          const text = typeof r.text === 'string' ? r.text.trim() : '';
          const rating = typeof r.rating === 'number' ? r.rating : 0;
          if (rating < 4 || text.length < 10 || text.length > MAX_LEN) return [];
          const firstName = String(r.reviewerName ?? '').trim().split(/\s+/)[0] || 'A renter';
          return [{ productId: p.id, productName: p.name, firstName, rating, text }];
        })),
    ));
    // Interleave products so consecutive quotes come from different items.
    const out: ReviewQuote[] = [];
    for (let i = 0; i < PER_PRODUCT; i++) for (const l of lists) if (l[i]) out.push(l[i]);
    return out;
  });
}
