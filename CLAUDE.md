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
  gaps found), 38 Cloud Functions (scheduled, Firestore-triggered and 18 callables, Node 22). The
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
  staff confirm, lower, or explicitly "Waive" it on the return checklist — never deducted
  automatically.
  - **Waivers (late fee and damage charge).** "Waive" + inline ConfirmBox on the return
    checklist (also inside a multi-item chain — forwarded by the draft/summary). Stores
    `lateChargeWaived` / `damageChargeWaived: true` + `…WaivedAmount` (the suggestion),
    `…WaivedReason`, `…WaivedBy` (internal), `…WaivedAt` (`submitChecklistBatch`); the
    amount field stays absent. Typing 0 no longer waives (only valid within grace).
    "Undo waiver" on the admin reservation detail until `returnFinalizedAt` (reinstates
    the suggestion, recomputes the deposit split). Renters see "Late return fee · waived
    by our team" / "Damage charge · waived by our team", no amount, never a name — via
    `buildReceiptSummary()` (`functions/src/shared/receiptSummary.ts`, re-exported by
    `utils/receiptSummary.ts`), the ONE source for the receipt screen, PDF and email.
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
  - **Late-return emails** (validated mockup): ONE email per order and run
    (`lateReturnAlerts` queues the highest stage per order, then sends with every late
    line of that order), fee = sum of `computeLatePenalty`, next deadline from the shared
    `nextLateThresholdMs()` (returnAt + 24/48/72h, `shared/latePenalty.ts`), deposit in
    its handover currency. Pills: amber (overdue, 24h), light red (48h), solid red
    (non-return). "New bookings are paused…" only when the renter is held (always past
    the grace, admins excepted). No WhatsApp number → "Email us" (mailto). The amber box
    states the next fee explicitly ("after that, the fee goes up to X") via the shared
    `lateFeeSummary()` (`templates.ts`). The alert/email decision logic is pure in
    `functions/src/lateAlerts.ts` (`dueLateAlerts`, `planLateEmails`) — dry run it with
    `cd functions && npm run build && node scripts/simulate-late-returns.js [graceHours]`
    (no emails, no Firestore). Thresholds are inclusive upper bounds (Terms §9), so each
    email goes out on the first 15-min run strictly after returnAt + grace/24/48/72h.
  - **Layout (validated mockup v3):** hero card with the logo at its top (amber pill,
    big title, amber primary button, 2 outline buttons with icons) → white cards
    (14/16px padding, 10px gap) → centered cancellation line → footer with amber top
    line. Icons are hosted PNGs (`hosting/email/icons/`, 32px shown at 16px, amber
    `#BA7517`), via `iconUrl()` — icon fonts don't work in email; button icons use
    `alt=""` so a blocked image never breaks the label. "Your items": shared dates
    shown once under the title (clock icon) when every line has the same
    pickupAt/returnAt, otherwise per item.
  - **Pick-up reminder** (validated mockup): "Ready for pick-up" hero with "Message us"
    (WhatsApp, prefilled with the order ID — hidden when no number, then "Get
    directions" goes full width), a "To pay at pick-up" card (order totals from frozen
    fields + "approx. $X · ฿Y" from config/pricing rates, hidden if a rate is missing),
    names-only items ("Portable speaker × 2"), "Pick-up" shop card, and a centered
    "Running late…" line (WhatsApp, else contact@lanchai.la).
  - **Return reminder** (validated mockup): tagline pill with "Return." highlighted,
    "Need more time?" WhatsApp button (hidden without a number), "Return by …" only,
    per-item "Included: …" from `products/{id}.whatsIncluded` (loaded at send time),
    "Before you come" card, deposit card + "Return it and earn X points" — X from
    `loyaltyPointsFor()` (`functions/src/shared/loyalty.ts`, also used by
    `applyLoyaltyPoints`), hidden for business/BtoB accounts and when 0. Centered
    "late returns may add rental days" line — never mentions the grace period.
  - **Receipt** (validated mockups A/B): "✓ Returned" hero with "Returned {day} at
    {time}" (`returnedAt`), 5 hosted star links per item → `review/<productId>` via the
    redirect page (`reviewLink()`: `rid` + `rating` 1–5 strictly validated; the review
    screen pre-selects `rating`), or a product link if the renter already reviewed it
    (`hasReviewed`). ONE summary card from `deriveReceiptData`/`deriveSettlementOutcome`
    only; late/damage charges as negative lines ("adjusted by our team" when the LAK
    charge < `latePenaltyAmount`). Loyalty card: `loyaltyPointsFor` + shared
    `pointsToNextTier`/`nextTierName` (`functions/src/shared/loyalty.ts`, re-exported by
    `lib/loyalty.ts`); hidden for excluded accounts / 0 points; "You're Platinum" only
    when the config is known.
  - **Review follow-up:** daily 18:00 job sends ONE email for returns 48–72h old if the
    product isn't reviewed yet (`emailReviewFollowUp` claim, respects
    `emailRemindersOptOut`). Blocks in `layout.ts` (`hero`/`card`/`center`); copy,
    subjects and preheaders in `templates.ts`. Dates via `functions/src/shared/dates.ts`
    (Vientiane time, from `pickupAt`/`returnAt`). Shared texts: `CANCELLATION_SUMMARY`
    (`shared/policy.ts`, keep in sync with `lib/legalContent.ts`), payment methods
    (`config/shop.paymentMethods`, default in `shared/shop.ts`, aligned with Terms §4),
    `openHoursText()` ("Open daily …").
  - **Public assets: Firebase Hosting** (`/hosting`, `firebase deploy --only hosting`):
    `email/lanchai-logo@2x.png` (mark + wordmark, no tagline, white background),
    `email/icons/*@2x.png` and
    `open/index.html`, the https → `lanchaiapp://` redirect used by every email button
    (Gmail strips custom-scheme links; allow-listed paths only; works in the installed
    build, not Expo Go). `PUBLIC_BASE_URL` in `functions/src/email/config.ts` is the
    single place to switch to https://lanchai.la. It is
    `https://lanchai-app.firebaseapp.com` on purpose — `*.web.app` doesn't resolve
    (NXDOMAIN) on some networks in Laos; never use the web.app domain in emails. Confirmation emails attach a `.ics`
    (pick-up + return) and link to Google Calendar.
  - Booking confirmation fires on `{orderId}_1` creation (single bookings are `_1`
    too) → one email per order. `admin_release` cancellations send nothing. Receipt
    fires when `returnFinalizedAt` is first set on a `returned` reservation, figures via
    the shared `deriveReceiptData` (now in `functions/src/shared/receiptData.ts`,
    re-exported by `utils/receiptData.ts`). Reminders: daily 18:00 Asia/Vientiane,
    skipped when `users/{uid}.emailRemindersOptOut` (Personal info toggle). Dates in
    emails are the stored `pickupLabel`/`returnLabel` — functions run in UTC.
- **Account → Notifications / Receipts & reports.** `app/profile/notifications.tsx` is the ONE
  place for email preferences: `emailRemindersOptOut` (pick-up/return reminders + review
  follow-up; Personal info only links here) and the news & offers consent
  `marketingOptIn` + `marketingOptInAt`/`marketingOptOutAt` (`setMarketingOptIn()`,
  server time — the users rule requires `== request.time`; OFF by default; stored only,
  NOT synced to Brevo yet — that needs a contacts-capable key, a list, a users trigger,
  an unsubscribe webhook and a Privacy policy update). `app/profile/documents.tsx`
  = "Receipts & reports" (Account row, same route; validated mockup): "Your rentals" — the 3 most recent rentals with a document,
  `<RentalDocCard>` with Receipt / Pick-up / Return buttons (greyed when missing;
  reports open `app/rentals/[id]/report.tsx?type=pickup|return`, `ChecklistSummary
  audience="renter"`: "Confirmed by you on …", never a name) — "See all" →
  `app/profile/rentals.tsx` (search, period chips, 10 per page "Load more" rendered
  client-side) — nothing else: legal texts are in Account → Legal, the business document
  in Account → Business document. One `getMyReservations` query (renterId ==,
  no orderBy), filtered/sorted/paged in code (`utils/rentalDocs.ts`) — no composite index. `canReplaceBtobDocument()`
  (`utils/btob.ts`) mirrors the rule: no document replacement once approved.
- **Password reset / email verification emails are ours, not Firebase's.**
  `functions/src/authEmails.ts`: callables `requestPasswordReset({ email })` (no auth;
  ALWAYS `{ ok: true }` whether or not the account exists — no enumeration; only a
  rate-limit hit is reported) and `requestEmailVerification()` (signed-in, own address
  only). Links from `admin.auth().generatePasswordResetLink` /
  `generateEmailVerificationLink` → default action page
  `lanchai-app.firebaseapp.com/__/auth/action`. Rate limits in `authEmailLimits/*`
  (hashed keys, sliding hour: 3/email, 3/account, 10/IP, 200 global — `AUTH_EMAIL_LIMITS`;
  no client rule → denied by the catch-all). Sent with `sendEmail({ security: true })`:
  ALWAYS to the real address, even in test mode. Never log the link. App:
  `lib/authEmails.ts` (login "Forgot password?", Security screen, signup, verify banner
  "Resend") — falls back to Firebase's own `sendPasswordResetEmail` /
  `sendEmailVerification` (Firebase Auth SMTP = Brevo, kept as fallback) unless
  rate-limited. Brevo offers no per-message way to disable click tracking, so links may
  be wrapped by Brevo's tracking domain. Firebase doesn't publish the reset-link
  lifetime — `RESET_LINK_EXPIRY_NOTE` (`templates.ts`) states no number on purpose.
  Email change isn't possible in the app (read-only, "Contact us").
- **Cancellations — `functions/src/shared/cancellation.ts` is the single source.**
  Business reality at launch: **nothing is charged before pick-up** (no advance), so
  every outcome is "nothing to pay" and no renter screen/email warns about losing money.
  `cancellationOutcome()` keeps the policy tiers (`cancelTier()`: >48h free, 24–48h
  store credit 6 months, <24h retained, premium) for the day a reservation carries an
  optional `advancePaidLak > 0` — never written today (the renter cancel screens and the
  email only show those tiers when an advance exists). The legal texts and FAQ now say:
  no advance, free cancellation any time before pick-up, nothing charged before pick-up
  (validated 2026-10-23) — never mention advances/vouchers/premium non-refund to renters.
  - Admin cancellation (`app/admin/reservations/[id].tsx`): `pending_payment`/`confirmed`
    only (an `active` rental is a return, not a cancellation), reason preset
    (`CANCEL_REASONS`) + optional text, this line or the whole order, via
    `adminCancelReservations()` — ONE batch, same `cancelledAt`, so the email trigger
    sends one grouped email. Stores `cancelledBy: 'admin'`, `cancelReason`,
    `cancelReasonText`, `cancelledAt`.
  - **Coupons:** `restoreCancelledCoupon` (`functions/src/index.ts`) gives the coupon back
    (`used: false`) once EVERY line carrying it is cancelled (renter or admin, not
    `admin_release`); idempotent via `couponRestored` on those lines.
  - Email variant (`cancellationEmailVariant`): A = renter, or admin + `customer_request`;
    B = any other admin cancellation ("We're sorry, we had to cancel" + preset sentence);
    none for `admin_release`. Partial cancellations show a green "Still reserved" banner.
- **No-show = booking hold (never automatic).** `isPickupMissed()` (`functions/src/shared/dates.ts`)
  flags a `pending_payment`/`confirmed` booking whose pick-up day (Vientiane) is over as
  "Not picked up" — an ALERT only (admin list badge, calendar day section, detail banner,
  hourly `missedPickupAlerts` admin notification once per order via
  `missedPickupAlertAt`). It never locks anything: a late pick-up still goes through the
  normal flow. Only an admin "Mark as no-show" (`adminMarkNoShow`, this item or the whole
  order, one batch) sets status **`no_show`** — final, terminal (occupancy released like a
  cancellation, coupon NOT restored), "We missed you" email (`emailReservationUpdates`).
  `syncBookingHold` adds the `noShow` reason (enforced by the existing reservations create
  rule) until an admin "Lift no-show hold" (`adminLiftNoShowHold`: stamps
  `noShowHoldLiftedAt/By/ByName` on the renter's no_show lines — status stays no_show
  for history). Legal texts (Terms §8/§10, cancellation policy, FAQ "What if I can't
  make it to my pick-up?") describe it: booking released, nothing charged, new bookings
  paused until the renter contacts us.
- **Loyalty points — server-side only, one shared rule.** Points change ONLY in Cloud
  Functions via `creditLoyaltyPoints()` (`functions/src/index.ts`), which uses the pure
  `applyLoyaltyPointsChange()` (`functions/src/shared/loyalty.ts`) for balance, tier and
  one-time tier coupons, and writes a `users/{uid}/loyaltyHistory` entry (owner-read,
  never client-writable). Sources: `applyLoyaltyPoints` (rental, `loyaltyPointsFor`) and
  `applyReviewReward` (review created for a `returned` reservation of that renter —
  `config/loyalty.reviewRewardPoints`, default 10, **whatever the rating**, once per
  reservation via `reviewRewardApplied`, no clawback if an admin deletes the review).
  Exclusion everywhere = `isLoyaltyExcluded()` (business customer or BtoB account).
- **Shop config (`config/shop`, `lib/shop.ts`) drives pickup/return slots and WhatsApp.**
  Slots are never hardcoded: every booking flow (single-item `app/booking/new.tsx`, bag
  `components/DateRangePicker.tsx`, and `<DateRangeCalendar>`'s required `timeSlots`
  prop) builds them via `getShopTimeSlots(shop)` → `buildTimeSlots(openTime, closeTime,
  lastPickupOffsetMin)` (`utils/timeSlots.ts`), 30-min steps, falling back to
  09:00–19:30 when the doc is missing/invalid. `hours` stays free display text only.
  `whatsappNumber` (digits, international format) feeds the shared
  `components/WhatsAppButton.tsx`, which renders nothing when it's empty. `useShopInfo()`
  is LIVE: one shared `onSnapshot` on `config/shop` (restarted on sign-in/out), so Shop
  settings changes reach mounted screens (Account tab) immediately — never read the shop
  once at mount or hardcode its address/hours. All of it is
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
  - `components/RentalReceipt.tsx` — the end-of-service receipt, ONE "Your rental
    summary" card aligned with the receipt email (validated mockup): rental fee (VAT in
    small grey), deposit paid, late/damage charges as negative lines with their detail,
    the outcome from `deriveSettlementOutcome` ("Deposit refunded to you" / "You paid on
    top" + Settled pill / "Balance due"), then "Total cost of your rental" — one LAK
    figure only when the charge currency is LAK, otherwise LAK and "+ X USD" on separate
    lines, never added. No staff names for renters; `staffView` (admin reservation
    detail) shows "Settled by …". Shown at `app/rentals/[id]/receipt.tsx` (title: product
    + "Order LNC-… · Returned …") and inline on the admin detail, both gated on
    `status === 'returned' && returnFinalizedAt`. Order numbers shown to renters go
    through `displayOrderId()` (`utils/rentalDocs.ts`): the LNC-… id, or nothing for
    legacy rows — never the raw Firestore id (also used by the PDF).
  - **`utils/receiptData.ts`'s `deriveReceiptData(rental, vatPercent)`** is the single
    source of every derived receipt figure (VAT split, deposit held/applied, net) —
    `RentalReceipt.tsx` calls it for the on-screen render, and `lib/receiptPdf.ts`
    calls the exact same function to build the downloadable PDF (`expo-print` +
    `expo-sharing`, both Expo Go–compatible on SDK 54; the "Download / share receipt"
    button lives inside `RentalReceipt.tsx` itself, so both the customer and admin
    receipt views get it automatically with no separate wiring). Any future receipt
    figure — on-screen or exported — must go through `deriveReceiptData`, not
    re-derive `splitHtVat`/deposit math a third time. The screen card and the PDF both
    render the SAME lines from `buildReceiptSummary()` (`utils/receiptSummary.ts`, on
    top of `deriveReceiptData`/`deriveSettlementOutcome`) — change the receipt there,
    never in one renderer only. The PDF fits one A4 page and never shows staff names.
    The PDF branding is a text "LANCHAI" wordmark in the brand colors,
    not the raster `assets/images/lanchai-logo.png` — embedding it would need a new
    `expo-asset` dependency plus base64 asset-loading, a deliberate scope cut, not an
    oversight.
- **BtoB rejection reasons — one shared list.** `functions/src/shared/btob.ts`
  (`BTOB_REJECTION_REASONS`, keys `doc_unreadable | doc_missing_expired |
  details_mismatch | not_eligible | other`) feeds the admin picker
  (`app/admin/business-accounts/[uid].tsx`), the renter screen (`app/btob-rejected.tsx`)
  and the rejection email. A rejection stores `btobRejectionReason` (the key),
  `btobRejectionText` (optional admin text, required for `other`) and
  `btobRejectionFixable` (preset value; admin choice for `other`). Fixable → email
  variant A + "Update my application" → `app/profile/business-document.tsx`, which
  resubmits via the `resubmitBusinessApplication` callable (`functions/src/account.ts`:
  back to `pending_approval`, keeps `btobPreviousRejection`, clears the decision-email
  markers so the next decision emails again, notifies admins). Final → email variant B,
  no resubmission from the app. Legacy free-text rejections (no key) are shown as final.
  `BTOB_REVIEW_TIME_NOTE` = '' removes the "within 1 business day" line everywhere.
- **New shared utilities from this feature, reuse rather than re-defining:**
  `utils/calendarGrid.ts` (`buildCalendarDays`/`chunkIntoWeeks`/`sameDay`/
  `startOfDay` — pure month-grid math, extracted from `DateRangeCalendar.tsx`, no
  selection/interaction logic) and `components/ConfirmBox.tsx` (the inline
  Alert.alert-replacement pattern, extracted from `app/admin/reservations/[id].tsx`/
  `app/admin/business-accounts/[uid].tsx` — takes an optional `cancelLabel` prop,
  default `'Keep'`).
- **VAT display is a switch, OFF by default** (LANCHAI isn't VAT-registered yet):
  `config/pricing.showVat` (Admin → Exchange rate & VAT). The ONE check is
  `vatDisplayPercent()` (`functions/src/shared/receiptData.ts`) — `useVatPercent()` /
  `getVatPercent()` (app, `lib/exchangeRate.ts`) and `getVatPercent()` (emails,
  `functions/src/email/context.ts`) both go through it and return **null = show no VAT
  anywhere** (booking summary/checkout/confirmation, `BillingSummary`, `PriceLak`,
  product "Prices include VAT", receipt screen/PDF/email via `buildReceiptSummary`,
  confirmation email, BtoB "VAT-ready" wording). Every VAT line must be gated on that
  null. When ON, everything below applies.
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

- **Legal texts (`lib/legalContent.ts`) — updated 2026-10-23, still NEED LAWYER REVIEW
  before public launch** (limitation of liability, deposit retention on non-return, ID
  copy retention, data transfers outside Laos — Singapore / Brevo France, operating before
  company registration, governing law & court, damage charges, tax/VAT once registered).
  No "DRAFT" banner is shown to renters any more; the review note lives in the file header
  and here. Address + WhatsApp come from `config/shop` via `{{SHOP_ADDRESS}}` /
  `{{WHATSAPP_LINE}}` placeholders filled by `components/LegalScreen.tsx`
  (`fillLegalPlaceholders`). Effective date: `LEGAL_EFFECTIVE_DATE`. Never mention the
  grace period, an advance, vouchers or a handling fee. Damage wording = the code: a
  share of the replacement value depending on the damage (`damagedChargePercent`), full
  replacement value if unusable/lost, staff can reduce or waive.
- **Launch feature flags — `config/features`** (`lib/features.ts`, Admin → Shop settings
  → Features; readable before sign-in by `firestore.rules`): `businessAccounts` (OFF —
  hides the Individual/Business selector and the cross-path login block; all BtoB code
  and existing BtoB accounts keep working) and `newsletter` (OFF — hides "News and
  offers" on Notifications; stored consent fields/rules untouched). Missing = OFF.
- **Shop coordinates** — `config/shop.latitude/longitude` (Shop settings → "Map
  coordinates", "lat, lng", Laos bounds) feed the shared `mapsUrl()` for every "Get
  directions" (app + emails); empty → address search. `SHOP_DISPLAY_DEFAULTS`
  (`functions/src/shared/shop.ts`) holds the real address as the fallback.

- **Identity document — required to rent (phase 1 of identity/residency, 2026-10-23).**
  `functions/src/shared/identity.ts` (types, `identityBookingDecision`) +
  `functions/src/identity.ts` (`submitIdentityDocument`, `validateIdFiles`,
  `registerIdentityDocument`). Data: `identityChecks/{uid}` (server-written; owner +
  admin read) `{status: none|on_file|rejected, docType, files (Storage PATHS, never
  URLs), source: renter|counter, version (+1 per new document — the first-pick-up check
  is tied to it), supersededFiles (kept for the retention job)}`; `users.idOnFile` /
  `idDocVersion` server-only. Storage `idDocs/{uid}/` — owner/admin read+delete,
  owner/admin create, images < 10 MB, no overwrite. Booking: `createReservations` refuses
  without an ID on file unless `idCheckAtCounter` ("I'll show my ID at the shop"), and
  always after a rejection (`id-required` / `id-rejected`); admins exempt; each line
  stores `idCheckAtCounter`. App: `lib/identity.ts`, `<IdUploadPanel>`,
  `<IdRequirementStep>` (modal on Confirm in `booking/summary.tsx` and `bag/checkout.tsx`,
  booking kept), `app/profile/identity.tsx` (now part of ID & residency).
  NEVER show these photos anywhere else or put them in emails.
- **First-pick-up ID double check (phase 2).** Tied to the CURRENT document version:
  `idCheckNeeded(user)` (`shared/identity.ts`) = no ID on file, or
  `users.idCheckedVersion !== users.idDocVersion` — so every NEW document (purge,
  replacement, rejection) requires it again; `idCheckedAt/By` stay as history.
  `reservation.firstRentalIdCheck` is set by `createReservations` and kept in sync on
  upcoming pick-ups by `syncFirstRentalIdFlags` (after every ID change). Admin: chip
  `<FirstRentalIdChip>` (list, calendar day, detail), alerts from the hourly
  `missedPickupAlerts` job (eve 18:00 + morning 07:00, markers `idCheckAlertEveAt` /
  `idCheckAlertMorningAt`), blocking `<IdCheckSection>` + `useIdCheck` at the top of the
  single handover checklist and on the handover chain summary (two confirmations, staff
  photo when no ID on file) → `recordIdCheck` callable BEFORE the checklist write.
  `<RenterIdCard>` (reservation detail): view, add/replace a counter photo, decline
  (`adminIdentityAction`, `ID_REJECTION_REASONS`, blocks bookings).
  `<RenterNameBlock>` (in both) shows the account's name big + phone/email (email from
  Auth via the `adminRenterProfile` callable) with "Edit name" (inline confirm,
  `nameEditedAt/By`, also Auth displayName + renterName on upcoming pick-ups). Once
  `users.idCheckedVersion` is set the renter can't change first/last/displayName
  (Personal info read-only + users update rule) — staff can.
- **Residency verification (phase 3).** `functions/src/shared/residency.ts` (paths,
  proof types, `RESIDENCY_REJECTION_REASONS`, `validUntilRequired`, `basisFor`) +
  `functions/src/residency.ts`: `submitResidencyRequest` (Lao national = Lao ID card on
  file as identity; foreign = ID on file + visa/permit or lease photos; notifies admins),
  `reviewResidency` (approve: customerType 'resident', residencyValidUntil — mandatory
  for foreigners —, residencyBasis, residencyVerifiedAt/By + `record`; reject: presets,
  fixable/final), `withdrawResidency` (renter: proof deleted now, back to tourist),
  `adminLegacyResident` (residents without verification: ask to verify = 30-day grace
  with basis 'legacy', or tourist now), `residencyDaily` (03:00 Vientiane: expired →
  tourist + in-app notice). `residencyRequests/{uid}` server-written, owner + admin read;
  `config/residency` not renter-readable. Deposits change only for NEW bookings (frozen).
  App: `app/profile/residency.tsx` (now part of ID & residency),
  `lib/residency.ts`. Admin: `app/admin/verifications.tsx` (tabs Identity / Residency /
  Business — the old Business accounts list, `business-accounts.tsx` now redirects; detail
  unchanged), `app/admin/residency/[uid].tsx`, `app/admin/identity/[uid].tsx` (folders
  with no sibling list file). "Valid until" uses `AdminDateTimePicker` (`dateOnly`,
  `minDaysAhead={1}`).
- **Document retention (phase 4).** Pure rules `functions/src/shared/retention.ts`
  (`identityPurgeDueMs`, `deletionBlockers`, `rentalInProgress`, `lastRentalEndMs`,
  `sanitizeRetention`), job + callables `functions/src/retention.ts`. Config
  `config/residency` {proofRetentionDays 30, idRetentionMonths 6} (Admin → Shop
  settings → Document retention). Proof of residence: deleted proofRetentionDays after
  the decision (approved/expired/rejected; a resubmission back to pending stops it),
  withdrawn → next run; replaced proofs → next run. ID: kept while any rental is
  pending/confirmed/active, then idRetentionMonths after the last returned/lost rental;
  never rented → proofRetentionDays after upload; replaced/declined ID files →
  proofRetentionDays after `supersededAt`. NOTHING is deleted while a blocker exists
  (active rental, unpaid balance, non-return, unresolved no-show, open/in_review claim)
  — retried daily. `documentRetentionDaily` (04:00 Vientiane) also writes
  `identityChecks.purgeDueAt` (shown in My ID). After an ID purge: status none,
  `idOnFile` false (next booking asks again), `idCheckedVersion` kept. Renter "Delete my
  ID" → `deleteMyIdentityDocument` (now only if the rule allows, else explains until
  when); `withdrawResidency` deletes proofs now unless blocked. Every deletion / blocked
  attempt → `docDeletionLog` (admin read, server write; uid, type, count, reason — never
  paths). Replaced/declined IDs follow the short (proofRetentionDays) retention.
- **Identity/residency emails + business ID (phase 5).** Templates `idVerifiedEmail`,
  `idDeclinedEmail`, `residencyApprovedEmail`, `residencyRejectedEmail` (A fixable / B
  final), `residencyExpiredEmail` (`email/templates.ts`) — never the documents. Sent via
  `sendAccountEmail()` (`email/triggers.ts`) from `recordIdCheck` (ID verified, ONCE per
  document version — `identityChecks.verifiedEmailVersion` claimed in a transaction),
  `adminIdentityAction` reject, `reviewResidency`, `residencyDaily`; those functions list
  `BREVO_API_KEY` in `secrets`. Links `profile/identity` / `profile/residency` are in
  `appLink` + the hosting redirect allow-list. Samples in `sendTestEmails`. Business:
  the responsible person's ID (optional field at business signup, My ID later) is
  REQUIRED before approval (admin review shows `<RenterIdCard>`, Approve disabled
  without it) and before `resubmitBusinessApplication` (`id-required`); reminders on
  `btob-pending.tsx` and `business-document.tsx`.

- **ID & residency — one screen + resident promo (2026-10-24).** `app/profile/id-residency.tsx`
  = `<IdentitySection>` + `<ResidencySection>` (`components/profile/`). The ONLY entry is
  Account → "ID & residency" (+ the header badge: Tourist/Resident → this screen,
  business → business document). `/profile/identity` and `/profile/residency` are
  redirects (old emails/notifications); emails/notifications link `profile/id-residency`
  (hosting allow-list keeps the old paths too). Receipts & reports (`app/profile/documents.tsx`) = rentals documents only.
  Promo "Residents pay a X% lower deposit": X = `residentDepositSavingPercent()`
  (`shared/residency.ts`, tourist − resident from config/loyalty); `useResidentPromo()`
  hides it for residents, business/BtoB, pending requests, or no difference.
  `<ResidentPromoHint>` under the deposit in booking summary + bag checkout,
  `<ResidentPromoCard>` on Account (dismissal per user in AsyncStorage — no Firestore
  field). Welcome email `welcomeEmail` via the `sendWelcomeEmail` callable: the app calls
  it when it sees the email verified (`(tabs)/_layout.tsx`, once per device), the server
  re-checks Auth `emailVerified` and claims `users.welcomeEmailSentAt` (once; BtoB
  skipped) — there is no server-side event for email verification.

- **Loyalty UI + referral programme (2026-10-24, validated mockup).** Every playful
  string lives in `constants/loyaltyCopy.ts` (edit there only). Shared pure helpers in
  `shared/loyalty.ts`: `tierProgress`, `tierForPoints`, `tierPerksText` /
  `defaultTierPerks` (coupon % + lower deposit for Platinum RESIDENTS only; never "early
  access" unless the admin's per-tier text says so — `config/loyalty.perksTextByTier`),
  `DEFAULT_TYPICAL_RENTAL_POINTS` (`typicalRentalPoints`), `DEFAULT_REFERRAL_REWARD_POINTS`.
  `lib/loyaltyUi.ts` (`useMyLoyalty` live, `useAveragePointsPerRental`,
  `loyaltyCardSubline`). `<LoyaltyCard>` (My Account, replaces the Tier tile + row),
  `<TierUpCelebration>` (mounted in `(tabs)/_layout.tsx`, once per tier via
  `users.celebratedTier` — renter may write only their CURRENT tier; `creditLoyaltyPoints`
  seeds it with the pre-credit tier; missing → initialised silently),
  `<BookingPointsHint>` (summary + bag checkout, `loyaltyPointsFor` per line),
  redesigned `app/profile/loyalty.tsx`. Referral: `functions/src/referral.ts`
  (`getMyInviteCode` FIRSTNAME-XXX via `inviteCodes/{code}`, `applyInviteCode` — not own
  uid/phone/email, no booking ever incl. cancelled, one referrer, no business), reward in
  `applyLoyaltyPoints` → `creditReferralIfAny` on the referred renter's FIRST returned
  rental: both sides `referralRewardPoints` via `creditLoyaltyPoints` (source
  'referral'), once (`referrals/{uid}` pending → credited), optional
  `referralMonthlyCap` (referrer only). `inviteCodes` deny-all, `referrals` admin read;
  `inviteCode`/`referredBy`/`referralCount` server-only. App: `<ReferralCard>`,
  `app/profile/invite-code.tsx`, optional signup field. Admin: referral settings in
  Loyalty, "Referred by · n referrals" in `<RenterNameBlock>`.
  Lawyer list adds: a "Loyalty programme" Terms section (no cash value, not
  transferable, may change/end, abuse → cancelled, lost on account deletion) and the
  referral mention in the Privacy policy — proposals only, legal texts unchanged.

- **My Account top (validated mockup, 2026-10-26) — brand shades only**
  (`constants/brandShades.ts`; no green/red here). Strings: `constants/accountCopy.ts`
  (greetings by Vientiane hour, stats, empty state, sticker names, promo) +
  `constants/loyaltyCopy.ts` (card lines). `components/account/AccountHeader.tsx` (white
  band inside the ScrollView — top inset applied in it; SVG dashed path drawn via a
  mask + hexagon, 4 floating MaterialCommunityIcons bubbles; all motion skipped when
  "reduce motion" is on; tier chip hidden for excluded accounts; status chip → ID &
  residency, or business document for business/BtoB). `AccountStats.tsx` +
  `lib/accountStats.ts` (`computeAccountStats`, `compactLak`): round trips = returned;
  distinct products + "LAK not spent" = ongoing + returned (LOST excluded), value =
  retailPrice (USD→LAK) once per product, "+" if some have none, hidden if none; no
  picked-up rental → "Your first rental is waiting." card. `AccountStickers.tsx`: one per
  category with a returned rental (catalogue order) + one locked next category; hidden
  with no returned rental. Tap: locked → `/category/{id}`; unlocked → bottom sheet
  (sticker, name, "Unlocked with {product}, {date}" = first returned rental of that
  category, `stickerUnlocks` from `computeAccountStats`, amber "Browse {category}"). `<LoyaltyCard>` is the LIGHT card everywhere (My Account +
  Loyalty screen). `<ResidentPromoCard>` restyled (white, light amber home circle).
  The WHOLE My Account screen now uses one design: `components/account/ui.tsx` (`UI`
  tokens — card white / radius 18 / 0.5px `SHADES.border`, section title 18/800, title
  15/700, subtitle 13/500 muted, chips — and `SectionTitle`, `RowGroup` (separators),
  `Row` (icon circle, chevron, "Soon" = same grey chip as "Tourist ›", `danger` = the
  app's `COLORS.danger` text only), `IconCircle`, `Chip`). Icon rule: AMBER = main
  contact or action needed (chat, WhatsApp, missing ID / business document, invite
  code), GREY = everything else, CARBON = staff (admin). This rule is for My Account ROWS (and
  status rows in sub-screens) only — the Loyalty "Your path" tiers use AMBER = reached
  (filled amber circle, carbon check, award on the current tier; sub-line = coupon state
  "{X}% coupon ready to use" / "{X}% coupon used") and a grey dashed lock = not reached
  ("Unlocks … · {points} points"); Bronze = "Where everyone starts." WhatsApp is a palette row (no
  green button). **Profile sub-screens** use the same `ui.tsx` tokens (`UI.screenContent`
  padding 16, `SectionTitle` + `UI.card`, `UI.btnPrimary` amber / `UI.btnSecondary` white
  + carbon outline / `UI.dangerText`, `UI.input`, `UI.choice` chips, `StatusBlock`,
  `<StatusChip>` — the ONLY place green/red appear, small —, `<CheckLine>` for
  successes, never coloured banners). Also `ToggleRow` (switch rows) and
  `UI.btnDestructive` (white, label in danger text — never a red fill). Done: batch 1 —
  Loyalty (+ `ReferralCard`), ID & residency (+ `IdUploadPanel`, also used by the booking
  ID step), Personal info; batch 2 — Receipts & reports (+ `RentalDocCard`), All rentals,
  Notifications, Pick-up location, Security, Delete account, Invite code, Business
  document. Batch 3 — FAQ + `LegalScreen` (visual only, texts
  untouched), renter chat (+ shared chat components: white incoming bubbles, one-line
  error), receipt + condition report screens (+ `RentalReceipt`, `ChecklistSummary`),
  `IdRequirementStep`, `TierUpCelebration` (carbon card + confetti kept), BtoB pending /
  rejected. `ConfirmBox` (all screens, admin included) = white card, amber confirm,
  "Keep" outlined, destructive = white button with red text (never a red fill).
  `WhatsAppButton variant="row"` = palette row (amber circle, no green) — used by the FAQ.
  Scrolling: the header scrolls inside an `Animated.ScrollView`; a fixed white
  status-bar background (insets.top) sits above it, and `AccountCompactBar` (32px avatar,
  first name, tier chip) fades/slides in below the safe area once the header is scrolled
  past (threshold = header height − 52; instant with reduce motion), with the points +
  a 26px progress ring (tierProgress) on the right → Loyalty (nothing for excluded
  accounts). The header decor is drawn BEHIND the text; the dashed path is the validated
  hand-drawn "bee flight" (`components/account/flightPath.ts`: a reference cubic path on
  a 400×230 box, scaled to the header, with only the bike / speaker loops and the tail
  nudged onto the measured bubble / hexagon positions — same nudge on each anchor and its
  control points so tangents stay smooth; loops pass partly UNDER the bubbles, which are
  drawn on top; a hidden bubble's loop is replaced by a tangent-matched bridge). Draw-on-
  mount, then a slow dot drift toward the hexagon; both off with reduce motion. It must
  stay in the BACKGROUND: round dots (dash 0.1 / gap 7, width 2), amber ≤ 30% opacity
  with a fade-in from the left edge (3% → 30% before the bike loop — the ONLY gradient
  allowed, an opacity fade on this decor), tight bike loop (partly under the bubble),
  full speaker loop at bubble radius + 11px, small (16px) hexagon in `SHADES.amberSoft`
  at 55% opacity; hexagon and tool bubble keep ~20px from the screen edge; each text
  line (greeting, name, stacked chips) is measured and any bubble that would touch one is
  hidden (never shrunk). The tent bubble is placed in the gap right of the chips, before
  the bike. Other tab screens apply the top inset
  on a non-scrolling root — not affected.

## Security follow-ups

**Done (phase 1):** reservations are created server-side only by the
`createReservations` callable (`functions/src/reservations.ts`, asia-southeast1) — the
`reservations` create rule is admin-only. It recomputes every frozen figure from server
data with the shared rules (`functions/src/shared/{pricing,availability,productAccess,
timeSlots}.ts`, re-exported by `utils/pricing.ts`, `utils/currency.ts`,
`utils/availability.ts`, `utils/timeSlots.ts`, `lib/loyalty.ts`), enforces product
state/access tier, bookingHolds, BtoB approval, phone, opening-hours slots + 2h lead
time, quantity ≤ stock **inside a transaction** (per-product `productLocks/{id}`
serializes concurrent bookings; occupancy read from `reservations`, not the async
mirror), total > 0, and consumes the coupon with the CONFIG % for its tier (never the
renter's stored percent). App: `createBooking()` (`lib/firestore.ts`) maps the
callable's `details.code` to friendly messages. Renter cancellation rule now pins
`cancelledBy == 'renter'` and `cancelledAt == request.time`.

**Done (phase 2):**
- `users/{uid}`: owner create/update are **allow-lists** (profile fields only: names,
  phones, `phoneVerified` false-only, WhatsApp, address, `photoURL`,
  `emailRemindersOptOut`, `btobDocumentUrl` (before approval, or first upload after
  approval), `updatedAt`; signup adds
  `accountType`, `btobStatus: 'pending_approval'`, `btob*` company fields,
  `btobSubmittedAt`, `createdAt`). Coupons, loyalty fields, `firstRentalDate`,
  `customerType`, `accountType` (after signup) and BtoB review fields are server/admin
  only. Account deletion is server-side (`deleteMyAccount` callable,
  `functions/src/account.ts`) — never re-create a profile client-side.
- Reviews: create rule validates shape (integer rating 1–5, text 10–2000, ids match the
  path, `createdAt == request.time`); `averageRating`/`reviewCount` recomputed by the
  `syncProductRating` trigger (renters can't write products).
- Chat: renters post only as themselves; the single exception is the fixed welcome
  message written by `initConversation` (`lanchai-business`, exact text, no media) —
  keep `lib/chat.ts`'s WELCOME_TEXT and the rule in sync.
- `requests`: field allow-list + size limits (text ≤ 1000, contact ≤ 200 or null).
- Storage: chat, claim, profile and checklist files are SDK-readable only by their
  owner/admin (checklist: admin only). Stored download URLs keep working.

**Still open:** App Check (with the EAS build, before public launch).

**Product follow-ups:**
- **PDF upload for business documents** — to do if business accounts open widely.
  Today `app/profile/business-document.tsx` uses the image picker only and
  `storage.rules` `businessDocs/` accepts `image/*` only. It would need
  `expo-document-picker`, `application/pdf` allowed in that Storage rule, and a PDF
  viewer/link in the admin review screen. Until then, never promise PDFs in copy
  (see `BTOB_REJECTION_REASONS.doc_unreadable` in `functions/src/shared/btob.ts`).

## Working with Aurore

- For any sizeable feature, use **Plan mode** first: propose the plan, get approval,
  then implement.
- Keep changes reviewable — Aurore reviews diffs before accepting.
- After changes, Aurore tests on Expo Go (physical S25 Ultra).
- You can talk with Aurore in **French**. Keep code, identifiers, comments, and
  in-app UI strings in **English**.
  