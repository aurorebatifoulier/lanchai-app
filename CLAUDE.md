@AGENTS.md
# CLAUDE.md — LANCHAI

Project context for Claude Code. Read this before working on the codebase.

## Overview

LANCHAI is a mobile app for renting objects and services in Vientiane, Laos —
"rent instead of buy" for a city audience of expats, travelers, digital nomads,
and young professionals.

- Taglines: "Rent. Return. Repeat." / "Why buy it when you can rent it?"
- Built by Aurore (French entrepreneur based in Vientiane) and a co-founder. Pre-launch.
- Customer contact channel: WhatsApp Business (used for contact, not as a catalogue).

## Tech stack

- React Native with Expo, **SDK 54** (new architecture enabled).
- Routing: **expo-router** (file-based routing under `app/`).
- Language: **TypeScript**.
- Backend: **Firebase** — Firestore + Authentication. **Region: `asia-southeast1`**
  (keep all Firebase config consistent with this region).
- Cloud Functions (`functions/`): **Node.js 22** runtime (`functions/package.json`'s
  `engines.node` — the sole place the runtime is pinned; `firebase.json` has no
  separate runtime override, confirmed via search). Migrated from Node 20 in
  2026-08 ahead of its 2026-10-30 deprecation. `firebase-admin@12.7.0`/
  `firebase-functions@7.3.2` both only declare a lower-bound `engines.node` (no
  upper cap), so future dependency bumps here are unlikely to block a future
  runtime bump either — still worth a quick `engines` check before the next one.
- Linting: ESLint (`eslint.config.js`).
- Tested on a physical Android device (Samsung S25 Ultra) via **Expo Go**.
- Repo: `aurorebatifoulier/lanchai-app`, default branch `master`.
- Expo plugins in use: `expo-router`, `expo-image-picker`, `expo-splash-screen`.

## Project structure

High-level map — verify against the actual tree when unsure.

- `app/` — screens and routes (expo-router file-based routing)
- `components/` — reusable UI components
- `constants/` — colors, theme, static config
- `contexts/` — React contexts (e.g. auth)
- `hooks/` — custom React hooks
- `lib/` — Firebase initialization and shared libraries
- `utils/` — helper functions
- `assets/` — images and icons
- `firestore.rules` — Firestore security rules (see Gotchas)
- `app.json` — Expo config

## Brand & design system

Follow these strictly for any UI work.

- Colors: **Amber `#F4B400`**, **Carbon `#1E1E1E`**, **Cream `#FAFAF7`**.
- **No gradients.**
- Shapes: rounded rectangles.
- Text: **sentence case everywhere** (not Title Case, not ALL CAPS) — including
  buttons, labels, and headings.
- Overall feel: clean, modern, uncluttered, friendly.
- In-app copy is in **English** (international / expat audience).

## What's already built

Renter and admin surfaces are both essentially feature-complete — see
`docs/STATUS_REPORT_2026-10.md` for the full file-by-file inventory (a point-in-time
audit; re-verify anything load-bearing against the actual code rather than trusting
a snapshot indefinitely).

- **Renter:** Home, Explore/Catalogue (filters, sort, search, favorites), product
  detail, booking flow (single-item + multi-item Bag), My Rentals (cancellation, QR
  codes, downloadable PDF receipt), reviews (submission screen + `averageRating`
  recompute — fully built, see below), favorites, chat (text/image/video), in-app
  notifications, loyalty (points/tiers/coupons + tier-gated early access/exclusive
  access), BtoB accounts, claims/disputes, onboarding, account management (incl.
  deletion, password change, email verification).
- **Admin:** products, reservations, inventory/stock dashboard, admin calendar,
  handover/return checklists (single-item + chained multi-item), damage/loss/late
  assessment, return closeout + settlement + PDF receipt, multi-currency deposits,
  exchange-rate/VAT settings, reviews moderation, broadcasts, BtoB validation, claims
  handling.
- **Backend:** real Firebase Auth, Firestore security rules (admin-gated throughout,
  cross-checked against every collection/subcollection actually used in code with no
  gaps found), 15 Cloud Functions (scheduled, Firestore-triggered and 1 callable, Node 22). The
  project is on the **Blaze (paid) plan** — Storage uploads (chat images/videos,
  claim evidence, product photos, profile photos, business documents) and Cloud
  Functions are live in production, not just configured. Do not reintroduce a
  "treat Storage/Functions as unavailable" assumption anywhere in this codebase.
- **Reviews → `averageRating`** (previously tracked here as a future roadmap item —
  it's done): submission screen at `app/review/[productId].tsx`, `submitReview()`
  (`lib/firestore.ts`) writes to `reviews/{productId}/reviews/{reservationId}` and
  recomputes `averageRating`/`reviewCount` client-side (no Cloud Function — fine,
  since Blaze doesn't require one here, it's just how it was built), the "How was
  your rental?" notification already deep-links to `/review/{productId}`, Firestore
  rules already cover the collection, and all 4 rating-display sites already read
  `product.averageRating`. Admin moderation (`app/admin/reviews.tsx`) uses the
  documented per-product-loop workaround, not `collectionGroup` (see Gotchas below).

## Not built yet (roadmap)

- **Device push notifications** (FCM / `expo-notifications`) — not implemented.
  This is distinct from the in-app, Firestore-backed notification inbox
  (`notifications/{uid}/items`, `app/notifications.tsx`), which is already built and
  working — this item is specifically about OS-level push when the app isn't open.

## Key product decisions

- Deposit / caution model: three item-value tiers × customer-type modifiers, with an
  optional damage-waiver surcharge.
- Customer requests for unavailable items flow into the Firestore `requests` collection.
- WhatsApp Business = contact point only.

## Gotchas

- **Firestore rules:** editing `firestore.rules` locally does NOT deploy them. They
  only take effect after being manually copy-pasted into the Firebase console. Flag
  this whenever rules change.
- **Firebase region** is `asia-southeast1` — don't introduce config that assumes a
  different region.
- **Firebase plan is Blaze (paid), not Spark.** Storage uploads and Cloud Functions
  are live in production. Device push notifications (FCM) are still genuinely
  unbuilt, but that's a missing-feature gap, not a plan restriction — see "Not built
  yet" above.
- **`Timestamp.now()` vs `serverTimestamp()`:** default to `serverTimestamp()`
  everywhere, including inside `writeBatch`es on plain top-level fields — this
  codebase's own `submitChecklistBatch`, `cancelReservations`, and the
  `extraBatchWork` pattern (`app/admin/reservations/[id].tsx`'s `runAction`) all
  already do this without issue. `Timestamp.now()` has exactly two, unrelated,
  non-batched call sites in the whole codebase (`addFavorite`, `submitRequest`) —
  there is no precedent for it inside a batch. The only place `serverTimestamp()`
  is actually unsafe is as a sentinel value **inside an array element** (a Firestore
  SDK limitation, not a batching one) — e.g. a coupon pushed into an array field
  uses `Timestamp.now()` for exactly that reason. Don't generalize that one
  array-element case into "avoid `serverTimestamp()` in batches" — plain top-level
  fields in a batch are fine.
- **Choix délibéré — lecture publique des photos produits :** `storage.rules` a `allow read: if true` sur `match /products/{productId}/{imageId}`. C'est voulu — nécessaire pour que le catalogue s'affiche pour les visiteurs non connectés. Conséquence acceptée : les URLs d'images produits peuvent être hotlinkées/scrapées. Aucun impact à l'échelle actuelle. Ne pas restreindre cette règle.
- **Convention de routing à préserver :** `app/admin/reservations.tsx` (la liste) et
  `app/admin/reservations/[id].tsx` (le détail) coexistent volontairement. Cela
  fonctionne dans expo-router TANT QU'aucun fichier `index.tsx` n'est ajouté dans le
  dossier `app/admin/reservations/`. Ne PAS créer un `app/admin/reservations/index.tsx`
  — cela créerait un conflit de route avec `app/admin/reservations.tsx`. Si un jour on
  veut restructurer, déplacer la liste dans le dossier en tant qu'`index.tsx` ET
  supprimer le fichier `reservations.tsx` en même temps.
- **`[id].tsx` file + `[id]/` folder coexisting under the same route breaks navigation:**
  found in `app/admin/reservations/` — `app/admin/reservations/[id].tsx` (the detail
  screen) and the `app/admin/reservations/[id]/` folder (nested screens like
  `checklist.tsx`) both define routes for the same dynamic `[id]` segment. expo-router
  builds this without error, but it causes unexpected `router.back()` behavior when
  navigating between the detail screen and its nested children. **Avoid:** don't let a
  `[segment].tsx` file and a `[segment]/` folder coexist for the same dynamic segment. If
  a dynamic route needs nested children, put the detail screen itself inside the folder
  as `[id]/index.tsx` and delete the flat `[id].tsx` file, so only one place owns that
  segment.
- **Prefer `router.replace()` over `router.back()` for post-action navigation:**
  `router.back()` returns to whatever screen is on top of the navigation history stack,
  which isn't always the screen the user actually expects — depending on how they
  arrived, it can land on a stale or wrong screen. **Found and fixed in the Rental
  Checklist submission flow** (`app/admin/reservations/[id]/checklist.tsx`): after
  submitting, navigating with `router.back()` could return to a stale screen instead of
  the reservation detail; switched to `router.replace('/admin/reservations/{id}')` so the
  destination is explicit and independent of navigation history. Use this pattern for any
  post-submit/post-action navigation, not just this screen.
- **Fabric/Android new-arch layout bug (SDK 54):** Sur Android avec la nouvelle
  architecture (Fabric renderer), une `ScrollView` ou `FlatList` avec `flex: 1` calcule
  mal l'espace disponible quand elle a **plusieurs frères directs** dans un flex column
  (header + chips + liste = 3 frères → la liste démarre au milieu de l'écran).
  **Fix obligatoire :** regrouper TOUS les éléments fixes dans un seul wrapper
  `<View style={{ flexShrink: 0 }}>` avant la liste. Structure correcte :
  ```
  <View root flex:1>
    <View style={{ flexShrink: 0 }}>   ← un seul frère fixe
      <View header />
      <ScrollView horizontal chips />
    </View>
    <ScrollView style={{ flex: 1 }} />  ← liste, seul autre frère
  </View>
  ```
  Screens où ce fix est appliqué : `app/admin/reservations.tsx`,
  `app/admin/products.tsx`, `app/(tabs)/reservations.tsx`, `app/admin/reviews.tsx`.

- **`collectionGroup()` broken for `reviews` on this project:** Any
  `collectionGroup('reviews')` query — whether `onSnapshot` or `getDocs`, with any
  security rule including `allow read: if true` — consistently fails with
  `permission-denied`. Direct `getDoc()` reads on the exact same documents at
  `reviews/{productId}/reviews/{reservationId}` succeed every time. Root cause was
  never conclusively identified despite exhaustive debugging (rules, auth timing,
  token refresh, offline cache, single Firebase app instance all ruled out).
  **Workaround in use:** `app/admin/reviews.tsx` fetches all products first, then
  queries each product's reviews subcollection individually via
  `collection(db, 'reviews', productId, 'reviews')` — no `collectionGroup`.
  **If `collectionGroup` is ever needed for another collection, test it in isolation
  early** before building a feature around it.

- **No composite indexes on this project — and no `firestore.indexes.json`.**
  `firebase firestore:indexes` returns `"indexes": []` (only a `reviews.createdAt`
  field override exists). Any query that combines an equality with a range/inequality
  on a *different* field, or a `where` + `orderBy` on different fields, needs a
  composite index and fails at runtime with `FAILED_PRECONDITION` (this silently broke
  `expireEarlyAccess` on every run until fixed in `45abf47`). Equality-only filters
  (incl. `in`), a range on a single field, or a single `orderBy` are fine. **Prefer
  filtering in code when the result set is small** (as `expireEarlyAccess` now does:
  equality-only query, date filtered in memory). Otherwise create the index through a
  tracked `firestore.indexes.json` (start from `firebase firestore:indexes >
  firestore.indexes.json` so the existing `reviews.createdAt` override is kept — the
  CLI offers to delete anything missing from the file), wire it in `firebase.json`
  (`"firestore": { "indexes": "firestore.indexes.json" }` — indexes only, rules stay
  manual), and deploy with `firebase deploy --only firestore:indexes`.

- **`UserProfile.address` vs. `UserProfile.addresses`:** `address?: string` (singular)
  is the real, active field — a simple free-text field edited in
  `app/profile/personal-info.tsx`, matching the `whatsapp` single-field pattern.
  `addresses?: UserAddress[]` (plural, a labeled multi-entry address-book stub —
  `{id, label, line1, city, note}`) is dead code left over from an earlier commit:
  never read, never written, no UI anywhere. Don't assume the plural field is the
  active one, and don't merge/conflate the two without a deliberate decision to
  actually build the multi-address-book feature.
- **`PICKUP_DELAY_MS`** (`utils/availability.ts`, next to `HANDOFF_BUFFER_MS`, 2 hours)
  is the single source for the same-day pickup lead time: it's both the "Ready within
  Xh" copy (product detail + booking confirmation) AND the filter in
  `utils/timeSlots.ts`'s `getAvailableTimeSlots` (today's first slot = now + this delay,
  rounded up to 30 min). Not consumed by `computeAvailableUnits`. Change it there only —
  never hardcode the delay in copy or slot logic.
- **Return time follows pickup time** in both booking flows via
  `hooks/useLinkedReturnTime.ts`, until the renter picks a return time by hand.
- **Late-return penalty — progressive, single shared calculation.** Rule (FAQ / Terms §9
  are the source of truth): measured from the scheduled `returnAt`, not cumulative —
  ]grace;24h] = 1 day, ]24;48h] = 1.5 days, ]48;72h] = 2 days (upper bounds inclusive),
  capped at 2 days beyond 72h. Base = `reservation.pricePerDay` (booked tier rate,
  pre-coupon) × `quantity`, rounded UP to the nearest 1,000 LAK. Always a suggestion:
  staff confirm, lower, or waive (enter 0) it on the return checklist — never deducted
  automatically.
  - **`functions/src/shared/latePenalty.ts`** (`computeLatePenalty`) is the ONLY place
    this is computed. It lives under `functions/` because `firebase deploy` only uploads
    that folder; the app imports it as `@/functions/src/shared/latePenalty`. Keep it
    dependency-free. Put any future app↔functions shared logic in `functions/src/shared/`.
  - **Internal grace period** (default 2h, `config/latePolicy.graceHours`, edited in
    Admin → Shop settings): within it the suggestion is 0. It must NEVER be visible to
    renters — no "0 LAK"/"free"/grace wording in any renter screen, notification, FAQ or
    terms. `config/latePolicy` is admin-read-only in `firestore.rules` (excluded from the
    renter-readable `config/*` rule); only admin screens use `lib/latePolicy.ts`.
  - `lateReturnAlerts` recalculates `latePenaltyAmount`/`latePenaltyDays` every run and
    notifies at 0h/+1h (warnings), end of grace, 24h, 48h, and >72h (sets `nonReturnAt`
    — a flag only: status stays `active`, no automatic lost/stolen). On catch-up it sends
    only the highest due alert. Renter screens render the stored amount only when > 0;
    admin screens (checklist, reservation detail, lost/stolen) compute it live.
  - `utils/overdue.ts` severities follow the tiers (light ≤24h, moderate ≤48h, high
    ≤72h, severe >72h); every overdue chip uses `overdueChipColors()`.
- **Booking hold — new bookings paused on overdue return / unpaid balance.**
  `bookingHolds/{uid}` is written only by the `syncBookingHold` Cloud Function (on every
  reservation write): present while the renter has an `active` reservation past the
  grace period, or `outstandingBalance > 0` not settled/written off. Admins are never
  held. Enforced server-side by the `reservations` create rule (`!exists(bookingHolds)`),
  mirrored client-side in `addReservation`/`addReservationBatch` (`BookingHoldError`) and
  surfaced via `useBookingHold()` + `<BookingHoldNotice>` on `app/booking/new.tsx`,
  `app/booking/summary.tsx`, `app/bag.tsx` and `app/bag/checkout.tsx`.
- **Transactional emails (Brevo) — `functions/src/email/`.** One `sendEmail()` (plain
  `fetch` to Brevo's API, key in the `BREVO_API_KEY` Firebase secret — every sending
  function lists it in `secrets`), one shared HTML + text layout (`layout.ts`), all
  copy in `templates.ts`. Never throws; retries only 429/5xx/network; on 401/403 it
  stops and alerts admins in-app (once per 24h, `config/emailHealth`).
  - **Test mode is the default.** Unless `config/emailSettings.live === true`, every
    email is redirected to `redirectAllTo` (or `lanchai.laos@gmail.com`). Toggled in
    Admin → Shop settings, which also has "Send test emails" — to the test inbox, never
    the admin's own address (callable
    `sendTestEmails`, region `asia-southeast1` — the app's `functions` instance in
    `lib/firebase.ts` is pinned to that region).
  - **Idempotency:** one map field per email type on the doc it's about
    (`emailConfirmation`, `emailCancellation`, `emailReceipt`, `emailPickupReminder`,
    `emailReturnReminder` on reservations; `emailBtobApproved/Rejected` on users),
    claimed in a transaction before sending (`claim.ts`). Late-return emails reuse the
    `lateAlert*` flags of `lateReturnAlerts` (end of grace, 24h, 48h, 72h only — the
    0h/+1h warnings stay in-app). Grace period never mentioned to renters.
  - **Layout (validated mockup):** logo tile → hero card (amber pill, big title, amber
    primary button, 2 outline buttons) → white cards → centered cancellation line →
    footer with amber top line. Blocks in `layout.ts` (`hero`/`card`/`center`); copy,
    subjects and preheaders in `templates.ts`. Dates via `functions/src/shared/dates.ts`
    (Vientiane time, from `pickupAt`/`returnAt`). Shared texts: `CANCELLATION_SUMMARY`
    (`shared/policy.ts`, keep in sync with `lib/legalContent.ts`), payment methods
    (`config/shop.paymentMethods`, default in `shared/shop.ts`, aligned with Terms §4),
    `openHoursText()` ("Open daily …").
  - **Public assets: Firebase Hosting** (`/hosting`, `firebase deploy --only hosting`):
    `email/lanchai-logo@2x.png` (mark + wordmark, no tagline, white background) and
    `open/index.html`, the https → `lanchaiapp://` redirect used by every email button
    (Gmail strips custom-scheme links; allow-listed paths only; works in the installed
    build, not Expo Go). `PUBLIC_BASE_URL` in `functions/src/email/config.ts` is the
    single place to switch to https://lanchai.la. Confirmation emails attach a `.ics`
    (pick-up + return) and link to Google Calendar.
  - Booking confirmation fires on `{orderId}_1` creation (single bookings are `_1`
    too) → one email per order. `admin_release` cancellations send nothing. Receipt
    fires when `returnFinalizedAt` is first set on a `returned` reservation, figures via
    the shared `deriveReceiptData` (now in `functions/src/shared/receiptData.ts`,
    re-exported by `utils/receiptData.ts`). Reminders: daily 18:00 Asia/Vientiane,
    skipped when `users/{uid}.emailRemindersOptOut` (Personal info toggle). Dates in
    emails are the stored `pickupLabel`/`returnLabel` — functions run in UTC.
- **Shop config (`config/shop`, `lib/shop.ts`) drives pickup/return slots and WhatsApp.**
  Slots are never hardcoded: every booking flow (single-item `app/booking/new.tsx`, bag
  `components/DateRangePicker.tsx`, and `<DateRangeCalendar>`'s required `timeSlots`
  prop) builds them via `getShopTimeSlots(shop)` → `buildTimeSlots(openTime, closeTime,
  lastPickupOffsetMin)` (`utils/timeSlots.ts`), 30-min steps, falling back to
  09:00–19:30 when the doc is missing/invalid. `hours` stays free display text only.
  `whatsappNumber` (digits, international format) feeds the shared
  `components/WhatsAppButton.tsx`, which renders nothing when it's empty. All of it is
  edited at `app/admin/shop-settings.tsx`. `components/AdminDateTimePicker.tsx` keeps its
  own full-day slot list on purpose (staff can log off-hours handovers).
- **Product stock condition — no per-unit identity, counts only.** Products have no
  concept of individual tracked units anywhere in this codebase — a "5 chairs"
  product is one Firestore document with `stockLeft: 5`, a plain integer. So
  `inRepairUnits`/`lostUnits` (`lib/mockData.ts`'s `Product`, `lib/types.ts`'s
  `ProductDoc`) are aggregate counts, not references to specific units — there is
  deliberately **no** single `status: 'available'|'in_repair'|'lost'|'removed'` enum
  on products (that shape was considered and rejected: it would take an entire
  multi-unit product off the market for one broken unit, and would also collide with
  the pre-existing `ProductDoc.status: 'draft'|'published'|'archived'` listing-
  lifecycle field). "Removed from catalogue" maps onto that existing `archived`
  value instead of a new one.
  - **`effectiveStock()`** (`utils/availability.ts`) is the required source of truth
    for bookable stock everywhere — `Math.max(0, stockLeft - inRepairUnits - lostUnits
    - pendingSettlementUnits)`. Never read `product.stockLeft` directly for an
    availability check or "X available" copy; every renter-facing call site
    (`app/bag.tsx`, `app/booking/new.tsx`, `app/category/[id].tsx`,
    `<DateRangeCalendar>`/`<DateRangePicker>`'s `totalStock` prop) already goes
    through it. See "Return closeout" below for `pendingSettlementUnits`.
  - Every change to `inRepairUnits`/`lostUnits` goes through
    `adjustProductStockCondition`/`addStockAdjustmentToBatch` (`lib/firestore.ts`),
    which atomically pairs the count change with an append-only audit doc at
    `products/{id}/stockAdjustments/{adjustmentId}` (admin-only, no update/delete
    ever — see `firestore.rules`). There is no path that changes the counts without
    also logging why.
  - **Reporting a reservation lost/stolen** (`app/admin/reservations/[id].tsx`'s
    "Report lost/stolen" action) now atomically increments the product's
    `lostUnits` by that reservation's quantity in the SAME batch as the reservation's
    own status/charge update, via `runAction`'s optional `extraBatchWork` param —
    this closes a real gap: that action used to write only to the reservation,
    leaving admins to remember a separate, easily-forgotten manual product edit.
  - Admin inventory dashboard: `/admin/inventory` (live overview by status/unit
    count) and `/admin/inventory/{id}` (per-product calendar + release action) —
    same `[id].tsx`-file-plus-list-file routing convention as
    `app/admin/reservations.tsx`.
  - **`releaseReservation`** (`lib/firestore.ts`) force-clears a stuck-blocked
    reservation by setting its status to `'cancelled'` — a single, non-batched write
    on the reservation itself. It deliberately does NOT write to
    `reservationOccupancy` directly (that collection's rule denies all client writes
    unconditionally, admin included); `functions/src/index.ts`'s
    `syncReservationOccupancy` auto-deletes the mirror as a side effect of the
    reservation reaching a terminal status. If a "release" ever needs to avoid
    touching the reservation doc itself, that's a different problem requiring a new
    Cloud Function — this function doesn't solve that case.
- **Return closeout — deposit settlement gates stock release.** Returning the deposit
  is part of validating a return: a unit does not go back into available stock until
  the deposit/charges are closed out, on top of the existing 12h `HANDOFF_BUFFER_MS`.
  - The instant a return checklist is submitted (`app/admin/reservations/[id]/checklist.tsx`,
    `submitChecklistBatch` in `lib/firestore.ts`, and the defensive "Mark as returned"
    fallback in `app/admin/reservations/[id].tsx`), the product's `pendingSettlementUnits`
    is incremented by the reservation's `quantity` in the SAME batch as the reservation
    write, via `addStockAdjustmentToBatch` — exactly the same pattern as `lostUnits`. A
    checklist rated `'unusable'` (a true write-off) increments `lostUnits` instead,
    mirroring "Report lost/stolen" — closes a real pre-existing gap where a checklist-
    rated write-off silently stayed bookable.
  - `returnFinalizedAt` (`RentalDoc`) is the single canonical "financial side of this
    return is closed" signal — written by **all three** closing actions (deposit
    returned, outstanding balance settled, outstanding balance written off), never
    derived from any one of those fields alone (any single one can legitimately never
    apply to a given reservation — gating on just one leaked stock on every reservation
    closed via the other two).
  - **Release is deliberately NOT synchronous with settlement.** `reservationOccupancy`
    is only date-range-scoped (see `syncReservationOccupancy` above) — it structurally
    cannot express "keep this unit out of the pool indefinitely until an admin acts," so
    `pendingSettlementUnits` (a plain aggregate count, like `inRepairUnits`/`lostUnits`)
    is the mechanism, and `OCCUPYING_STATUSES`/the occupancy Cloud Function are untouched
    by this feature. A new scheduled Cloud Function, `releaseSettledStock`
    (`functions/src/index.ts`, every 15 min, same shape as `lateReturnAlerts`), decrements
    `pendingSettlementUnits` only once **both** `returnFinalizedAt` is set **and**
    `now >= returnAt + HANDOFF_BUFFER_MS` — releasing synchronously at settlement would
    give a unit zero handoff buffer, since settlement now happens ~10 minutes after
    return. For a damaged-but-returnable item, the admin's `stockReleaseHandling`
    choice (`'release' | 'repair'`, entered on the "Mark deposit as returned" dialog,
    only shown when `chargeSeverity === 'damaged'`) tells the cron to transfer into
    `inRepairUnits` instead of releasing. `stockReleasedAt` is the cron's own
    idempotency marker (`null` until processed) — never set client-side.
  - This is backend timing logic only — no renter/admin-facing color or escalation.
    Do NOT reintroduce time-based urgency UI here; the admin inventory dashboard's
    "Needs attention" section surfaces stuck items (`pendingSettlementUnits > 0`) in
    the same neutral, informational style as its existing `overdue`/`soldOutPublished`
    entries, matching the earlier, deliberate removal of the old 48h deposit-urgency
    chip system.
  - `components/RentalReceipt.tsx` — the end-of-service settlement receipt, pure
    aggregation of already-persisted figures (no new financial math): rental fee via
    `<BillingSummary>` (now supports omitting its `deposit`/`depositLabel` props to
    avoid duplicating the deposit line shown separately below it), deposit/charges via
    `<SettlementSummary>` unchanged, and a Net total — `total + depositAppliedToCharge
    + outstandingBalance`, shown as one LAK figure only when `chargeCurrency` is LAK
    (the rental fee is always LAK but the deposit/charge currency is a staff choice at
    handover and can be USD/THB; forcing those into one blended LAK figure would need a
    new current-rate conversion that could make a closed receipt's numbers drift later,
    so a currency mismatch is shown as two separate figures instead). Rendered inline
    on the admin reservation detail screen and at the customer route
    `app/rentals/[id]/receipt.tsx` (first use of the `[id].tsx`+`[id]/child.tsx`
    coexistence pattern outside `app/admin/reservations/` — see the gotcha above), both
    gated on `status === 'returned' && returnFinalizedAt` being set.
  - **`utils/receiptData.ts`'s `deriveReceiptData(rental, vatPercent)`** is the single
    source of every derived receipt figure (VAT split, deposit held/applied, net) —
    `RentalReceipt.tsx` calls it for the on-screen render, and `lib/receiptPdf.ts`
    calls the exact same function to build the downloadable PDF (`expo-print` +
    `expo-sharing`, both Expo Go–compatible on SDK 54; the "Download / share receipt"
    button lives inside `RentalReceipt.tsx` itself, so both the customer and admin
    receipt views get it automatically with no separate wiring). Any future receipt
    figure — on-screen or exported — must go through `deriveReceiptData`, not
    re-derive `splitHtVat`/deposit math a third time. The one deliberate exception:
    `lib/receiptPdf.ts` re-expresses `SettlementSummary.tsx`'s tiny internal
    owed/resolution derivation itself (documented inline as intentionally mirroring
    it), since a plain HTML string can't invoke a React component — that component
    itself was left untouched rather than refactored, since it's already reused in 3
    other places. The PDF branding is a text "LANCHAI" wordmark in the brand colors,
    not the raster `assets/images/lanchai-logo.png` — embedding it would need a new
    `expo-asset` dependency plus base64 asset-loading, a deliberate scope cut, not an
    oversight.
- **New shared utilities from this feature, reuse rather than re-defining:**
  `utils/calendarGrid.ts` (`buildCalendarDays`/`chunkIntoWeeks`/`sameDay`/
  `startOfDay` — pure month-grid math, extracted from `DateRangeCalendar.tsx`, no
  selection/interaction logic) and `components/ConfirmBox.tsx` (the inline
  Alert.alert-replacement pattern, extracted from `app/admin/reservations/[id].tsx`/
  `app/admin/business-accounts/[uid].tsx` — takes an optional `cancelLabel` prop,
  default `'Keep'`).
- **VAT is 10%, VAT-inclusive (TTC), and already baked into every displayed price** —
  never add it on top of a total. Single source of truth for the rate:
  `DEFAULT_VAT_PERCENT` + `useVatPercent()` (`lib/exchangeRate.ts`), a Firestore-backed
  hook reading `config/pricing.vatPercent` (admin-editable at
  `app/admin/exchange-rate.tsx`) that returns `null` while loading/unconfigured —
  callers must always fall back with `vatPercent ?? DEFAULT_VAT_PERCENT`. To extract
  the VAT amount from a tax-inclusive total, always reuse `splitHtVat(amountLak,
  vatPercent)` (`utils/currency.ts`) — it returns `{ ht, vat, ttc }` with `ht` rounded
  and `vat = amountLak - ht`, guaranteeing `ht + vat === ttc` exactly. Never hand-roll
  `total * 0.10` (wrong — treats VAT as additive) or `total / 11` (right for 10% but
  bypasses the shared rounding convention) elsewhere. `formatLakAmount(amountLak)`
  (`utils/currency.ts`) formats an already-LAK figure as `"12,345 LAK"` for note lines —
  distinct from `formatLak`, which converts from USD first.
  `components/PriceLak.tsx` shows a full inline HT/VAT/TTC breakdown, but only for
  `customerType === 'business'`, independently on every price it renders — this
  remains true everywhere EXCEPT the 3 screens below. The 3 Summary/confirmation
  screens (`app/booking/summary.tsx`, `app/bag/checkout.tsx`,
  `app/booking/confirmation.tsx`) don't use `PriceLak` at all — every price row on
  these 3 screens is a plain `<Text>{formatLakAmount(amount)}</Text>`, identical for
  every customer type, and the rental amount is shown as a proper invoice build-up:
  **Subtotal (excl. VAT) → VAT (X%) → Total to pay**, always via
  `splitHtVat(amountLak, vatPercent)` (never hand-rolled), immediately above the
  existing deposit-refund note. On `summary.tsx`/`checkout.tsx` — both of which have
  a coupon feature — the build-up is derived from the actual post-discount amount
  charged (`finalTotal`), NOT the pre-discount rental line item, so
  `Subtotal (excl. VAT) + VAT` always reconciles exactly to `Total to pay` even when
  a coupon is applied; `summary.tsx`'s separate pre-discount line is labeled
  "Rental fee" (not "Subtotal") specifically to avoid two differently-valued rows
  both saying "Subtotal" on screen. **The refundable deposit is never run through
  `splitHtVat`/shown with a VAT breakdown anywhere on these 3 screens** — it's a
  security deposit, not a taxable sale, so it renders as a plain amount only; this
  was a small correctness fix, since `PriceLak` previously showed a business-only
  HT/VAT/TTC split on deposit rows, which was never actually correct. Follow this
  same build-up pattern (Subtotal excl. VAT → VAT → Total, plain `<Text>`, deposit
  excluded from VAT math, no `PriceLak`) for any future screen that shows a final
  payable total; `PriceLak`'s business-only breakdown is otherwise still the
  convention used everywhere else pricing is shown (`app/bag.tsx`,
  `app/rentals/[id].tsx`, `app/booking/new.tsx`, `app/product/[id].tsx`).

## Working with Aurore

- For any sizeable feature, use **Plan mode** first: propose the plan, get approval,
  then implement.
- Keep changes reviewable — Aurore reviews diffs before accepting.
- After changes, Aurore tests on Expo Go (physical S25 Ultra).
- You can talk with Aurore in **French**. Keep code, identifiers, comments, and
  in-app UI strings in **English**.
  