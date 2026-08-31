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

- **Home:** carousel, categories, content sections.
- **Explore / Catalogue:** product grid, filters, sort, active-filter chips,
  favorites, "New" badges, shared SearchBar, empty state with a "Request this item"
  action that writes to the Firestore `requests` collection.
- **Chat:** real-time messaging via Firestore; admin inbox with an unread badge.
- **Authentication:** real Firebase Auth.
- Firestore security rules + an `admins` collection.
- **Product Detail screen:** five per-day pricing tiers, availability chip, badge
  types, multi-photo carousel, Google Maps directions link.

## Not built yet (roadmap)

- Booking / reservation flow.
- Admin back-office for entering real products.
- Push notifications and photo uploads — **require the Firebase Blaze (paid) plan**,
  so treat them as unavailable on the current plan unless told otherwise.

## Fonctionnalités à construire (sessions futures)

> Ces éléments ont été identifiés et partiellement préparés mais **ne sont pas encore implémentés**.
> Chaque entrée est un chantier distinct, à traiter en session dédiée avec Plan mode.

---

### 🔲 Système de reviews → averageRating (boucle complète)

**Contexte :** L'infrastructure de base est en place — le filtre rating dans l'Explore
utilise `averageRating` et les affichages UI sont conditionnels (`product.rating != null`).
Mais aucun write path n'existe : les avis ne sont jamais enregistrés, `averageRating` n'est
jamais calculé. Les 5 pièces manquantes à construire en une seule session :

1. **Écran de soumission d'avis** — formulaire étoiles + commentaire, écrit dans
   `reviews/{productId}/items/{reviewId}` (sous-collection Firestore). Accessible
   depuis l'historique de locations (`/rentals/{id}`) une fois le statut `returned`.

2. **Recalcul de `averageRating` + `reviewCount`** — après chaque écriture de review,
   lire tous les ratings de la sous-collection pour ce produit, recalculer la moyenne,
   et mettre à jour le doc produit avec `updateDoc(productRef, { averageRating, reviewCount })`.
   Côté client (pas de Cloud Function) tant qu'on est sur le plan Spark.

3. **Règles Firestore pour la collection `reviews`** — utilisateur authentifié peut créer
   (`allow create: if request.auth != null`), propriétaire de l'avis peut supprimer,
   personne ne peut modifier (pas de `allow update`). À ajouter dans `firestore.rules`
   **et** à copier-coller manuellement dans la console Firebase.

4. **Rewirer la notification "How was your rental?"** — le `deepLink` actuel dans
   `app/admin/reservations/[id].tsx` (trigger `returned`) pointe vers `/rentals/{id}`.
   Le remplacer par `/review/{productId}?reservationId={id}` une fois l'écran créé.

5. **Migrer les 4 affichages de rating** — une fois `averageRating` effectivement écrit
   en base, remplacer `product.rating` par `product.averageRating` dans :
   - `app/(tabs)/index.tsx:319`
   - `app/category/[id].tsx:178`
   - `app/product/[id].tsx:202` (header)
   - `app/product/[id].tsx:302` (section Reviews)

---

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
- **Blaze plan** gates push notifications and photo uploads.
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

- **`UserProfile.address` vs. `UserProfile.addresses`:** `address?: string` (singular)
  is the real, active field — a simple free-text field edited in
  `app/profile/personal-info.tsx`, matching the `whatsapp` single-field pattern.
  `addresses?: UserAddress[]` (plural, a labeled multi-entry address-book stub —
  `{id, label, line1, city, note}`) is dead code left over from an earlier commit:
  never read, never written, no UI anywhere. Don't assume the plural field is the
  active one, and don't merge/conflate the two without a deliberate decision to
  actually build the multi-address-book feature.
- **`PICKUP_DELAY_MS`** (`utils/availability.ts`, next to `HANDOFF_BUFFER_MS`) is a
  **display-only** constant (2 hours) — shown as informational copy on the product
  detail screen and the booking confirmation screen, but not consumed by
  `computeAvailableUnits` or any availability computation in that file. If the real
  prep-delay value ever changes, update it there; both display sites derive their
  copy from it rather than hardcoding "2".
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
  