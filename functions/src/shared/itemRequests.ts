// "Ask for an item" requests — requests/{id}, created by renters (Explore), handled by
// staff in Admin → Item requests. Dependency-free: shared by the app and functions.
//   { text, contact, category | null, renterId, renterName, status, createdAt,
//     statusAt?, statusBy?, productId?, productName?, renterNotified?: { [status]: Timestamp } }

export const ITEM_REQUEST_STATUSES = ['new', 'ordered', 'declined', 'added'] as const;
export type ItemRequestStatus = typeof ITEM_REQUEST_STATUSES[number];

/** Categories a renter may tag a request with (same ids as the catalogue). */
export const ITEM_REQUEST_CATEGORIES = ['fun', 'tools', 'outdoor', 'sports', 'kids', 'home'] as const;

/** Short quote of the request for notifications ("“Stand-up paddle…”"). */
export function requestQuote(text: string, max = 60): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return `“${t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t}”`;
}

/** In-app message to the renter, ONCE per status (renterNotified.{status}). */
export function itemRequestRenterMessage(
  status: Exclude<ItemRequestStatus, 'new'>,
  ctx: { text: string; productName?: string | null },
): { title: string; body: string } {
  switch (status) {
    case 'ordered':
      return { title: 'Good news, we’ve ordered it!', body: `${requestQuote(ctx.text)} We’ll tell you when it’s in.` };
    case 'declined':
      return { title: 'We couldn’t get this one', body: `${requestQuote(ctx.text)} Thanks for the idea, though. Keep them coming!` };
    case 'added':
      return { title: 'Good news, we added it!', body: `${ctx.productName || 'Your item'} is now in the catalogue.` };
  }
}
