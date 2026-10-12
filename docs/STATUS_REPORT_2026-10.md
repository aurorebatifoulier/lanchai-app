# LANCHAI — Status Report

**Audit date:** 2026-10 (resuming after a ~6-week break; last known commit `425686f`, 2026-08-31)
**Method:** Read-only static audit — direct repo inspection (git, `tsc`, `functions` build) plus three parallel deep-dive research passes (renter-facing inventory, admin inventory, Firebase backend + code health). No files were modified, installed, or deleted during this audit; this report is the only file created.

---

## Executive summary

The app is in a **stable, far more complete state than CLAUDE.md's own roadmap suggests** — both the renter and admin surfaces are essentially fully built (18/18 renter areas, 15/15 admin areas reach at least a working state; only 2 renter areas are marked partial, both for content/polish reasons, not missing engineering). `tsc` is clean, the Cloud Functions build is clean on Node 22, and the Firestore/Storage rules have **zero** gaps or mismatches against the code that uses them. Nothing has been committed since `425686f`; the working tree is clean and in sync with `origin/master`. The two biggest open questions are not code problems: whether the project is actually on the **Blaze plan** (CLAUDE.md says photo uploads require it and should be treated as unavailable, yet extensive Storage upload code is live across chat/claims/products/profile — a direct contradiction that needs resolving before assuming any of those flows work in production), and the **legal documents** (Terms/Privacy/Cancellation), which are explicit, unreviewed "DRAFT v0.1" text with multiple `[TO COMPLETE]` placeholders. One genuine UI bug was found (`app/category/[id].tsx`'s filter chips are cosmetic-only), and CLAUDE.md itself has drifted in two places (the reviews-system roadmap note is stale — that feature is fully built — and the Blaze/photo-upload caution needs re-checking). Overall: **this reads as a feature-complete v1 candidate blocked mainly by business/content/ops decisions, not missing engineering.**

---

## 1. Repo state

| Check | Result |
|---|---|
| `git status` | Clean. The only untracked entry is `.claude/worktrees/`, created by this audit's own background research agents — not pre-existing work, safe to ignore/clean up. |
| Last commit | `425686f2` — "chore: migrate Cloud Functions runtime to Node.js 22" — 2026-08-31 20:13:12 +0700 |
| Commits since `425686f` | **None.** `git log 425686f..HEAD` is empty. |
| Sync with `origin/master` | `0 ahead, 0 behind` after `git fetch` — fully in sync. |
| `npx tsc --noEmit` | **Clean**, exit code 0. |

Nothing happened in the repo during the break. You're picking up exactly where you left off.

---

## 2. Tech stack snapshot

- **Expo SDK** `~54.0.34`, **React** `19.1.0`, **React Native** `0.81.5`, new architecture enabled.
- **Key dependencies**: `firebase ^12.14.0`, `expo-router ~6.0.23`, `react-native-reanimated ~4.1.1` / `react-native-worklets 0.5.1`, plus the recently-added `expo-print`/`expo-sharing`/`expo-file-system`/`expo-media-library` (receipt PDF + claim media download, from the last session).
- **Nothing looks outdated or deprecated** for an SDK 54 app — no legacy packages (no `moment`, no class-component-only libs, nothing pinned to an ancient major version). Not checked against the live npm registry (would require network access, skipped to stay strictly local).
- **`eas.json`**: three build profiles — `development` (dev client, internal), `preview` (internal, Android APK + iOS simulator build), `production` (auto-increment). `submit.production` is present but empty (no store credentials configured yet).
- **`app.json`**: `ios.bundleIdentifier` = `android.package` = `com.lanchai.app` — consistent. EAS project ID is set (`14284447-1346-4dac-9b0a-a50b52d59dd3`), confirming `eas init` was run. Firebase config is read from `EXPO_PUBLIC_FIREBASE_*` env vars (fixed specifically for EAS Build compatibility, per the 2026-08-06 commit "fix: read Firebase config from env vars so EAS Build can resolve it").
- **Has an EAS build ever run?** **Not verifiable statically.** No local build artifacts (`.ipa`/`.apk`/`.aab`), no `.easignore`. Git history shows a dedicated "EAS setup" commit and the env-var fix commit (both 2026-08-06), which strongly suggests at least one build was *attempted* around then — but nothing in the repo confirms one *succeeded*. Check the EAS dashboard (expo.dev) directly for build history.
- **Apple Sign-In requirement**: confirmed **not applicable** — grepped for every social/third-party auth provider (`GoogleSignin`, `expo-apple-authentication`, `GoogleAuthProvider`, etc.); none exist. Auth is Firebase email/password only, so Apple's "must also offer Sign in with Apple" rule doesn't trigger.

---

## 3. Feature inventory

Legend: ✅ complete · 🟡 partial · 🔴 stub-placeholder · ⏸ explicitly "Soon"/disabled

### Renter-facing

| Area | Status | Main files | Notes |
|---|---|---|---|
| Home | ✅ | `app/(tabs)/index.tsx` | Carousel, categories, live content sections. 4 hero images are intentional `image: null` placeholders awaiting real photography (documented in code with target filenames). |
| Explore / Catalogue | 🟡 | `app/(tabs)/explore.tsx`, `app/category/[id].tsx` | Explore screen is ✅ fully wired (filters, sort, chips, favorites, badges). `app/category/[id].tsx`'s sub-filter chips (All/Available now/Best rated/Lowest price) and its "Filters"/"Popular" toolbar buttons **don't actually filter anything** — `activeFilter` only drives chip highlight styling, never a `.filter()` call, and the two toolbar buttons have no `onPress` at all. Real bug, see §6/§7. |
| Search + "Request this item" | ✅ | `lib/firestore.ts` (`submitRequest`) | Writes to `requests` collection. Minor note: the write is wrapped in try/catch with no re-throw, so the UI shows "Request sent!" even if the Firestore write silently fails. |
| Product detail | ✅ | `app/product/[id].tsx` | Pricing tiers, availability, badges, carousel, Maps link, full reviews section. |
| Booking flow (single + Bag) | ✅ | `app/booking/{new,summary,confirmation}.tsx`, `app/bag.tsx`, `app/bag/checkout.tsx` | Both paths write real reservations (`addReservation`/`addReservationBatch`) and reach confirmation with QR + VAT-split totals. |
| Shared `DateRangeCalendar` | ✅ | `components/DateRangeCalendar.tsx` | Confirmed both `app/booking/new.tsx` and `components/DateRangePicker.tsx` import and render it directly; `DateRangePicker.tsx` has no month-grid code of its own. Migration is clean — no duplication here. (A *different*, admin-side calendar duplication exists — see §6.) |
| My Rentals + rental detail | ✅ | `app/(tabs)/reservations.tsx`, `app/rentals/[id].tsx`, `app/rentals/[id]/receipt.tsx` | Tabs, cancellation tiers, QR, claim status, receipt link correctly gated on `status === 'returned' && returnFinalizedAt`. |
| QR codes | ✅ | `components/QRThumb.tsx`, `components/QRLightbox.tsx` | Wired into confirmation, My Rentals, and rental detail. Real `react-native-qrcode-svg` rendering. |
| Reviews → `averageRating` | ✅ | `app/review/[productId].tsx`, `lib/firestore.ts:614-645` | **Fully built — CLAUDE.md's roadmap section describing this as missing is stale.** Submission screen exists, `submitReview()` writes the review and recomputes `averageRating`/`reviewCount` client-side, the "How was your rental?" notification already deep-links to `/review/{productId}`, and all 4 rating-display sites already read `product.averageRating`. See §7a. |
| Favorites / Liked | ✅ | `app/liked.tsx` | Own search/filter/sort, optimistic add/remove with rollback. |
| Chat (images/videos) | ✅ | `app/chat.tsx`, `lib/chat.ts`, `components/MediaViewer.tsx` | Both image and video attachment paths upload for real (`uploadChatImage`/`uploadChatVideo`, 50MB video cap). `components/chat/VideoLightbox.tsx` is confirmed **fully deleted** — zero references anywhere, superseded by the shared `MediaViewer`. |
| Notifications | ✅ | `app/notifications.tsx` | Live Firestore listener, merges the `broadcasts` collection, filter chips, time-bucketed grouping, batched mark-all-read. |
| Loyalty (Phase 1 + 2) | ✅ | `lib/loyalty.ts`, `utils/productAccess.ts`, `app/profile/loyalty.tsx` | Points/tiers/coupons UI complete; points/tier itself are server-computed by a Cloud Function (`applyLoyaltyPoints`) — code is complete, but whether that function is actively firing in production isn't verifiable statically. Tier-gated access (early access/exclusive) correctly enforced everywhere a product renders. |
| BtoB path | ✅ | `app/login.tsx`, `app/btob-pending.tsx`, `app/profile/business-document.tsx` | Signup, document upload, pending-approval state, gated booking until an approved account also has its document on file. |
| Claims/disputes | ✅ | `app/claim/[reservationId].tsx`, `lib/claims.ts` | Full submit flow: type, description, required photo/video evidence, real Storage upload, duplicate-claim guard. |
| Onboarding/splash | ✅ | `app/onboarding.tsx`, `lib/onboarding.ts` | 3-slide, shows once via `AsyncStorage`. Background images are explicit `picsum.photos` placeholders (seeded, stable) awaiting real photography. |
| Account (incl. deletion, password, email verification) | ✅ | `app/profile/{personal-info,security,delete-account}.tsx`, `app/(tabs)/_layout.tsx` | Deletion has a genuine rollback path if Auth deletion fails after Firestore succeeds. Email verification banner/polling/resend lives in the tab layout, not `account.tsx` itself, but is genuinely implemented. |
| FAQ / legal | 🟡 | `app/profile/faq.tsx`, `app/legal/*.tsx`, `lib/legalContent.ts` | FAQ is ✅ real, specific content. Legal screens (Terms, Privacy, Cancellation policy) render real markdown through a shared component, but the content itself is explicitly marked **"DRAFT v0.1 — not legal advice"** with multiple unfilled `[TO COMPLETE: ...]` fields. Functionally wired, not launch-ready content — see §5/§7d. |

### Admin back-office

| Area | Status | Main files | Notes |
|---|---|---|---|
| Products admin | ✅ | `app/admin/product-form.tsx`, `app/admin/products.tsx` | Full CRUD, up to 10 photos with crop/compress/retry, status transitions, stock-condition (`inRepairUnits`/`lostUnits`) editable with audit trail. `pendingSettlementUnits` is deliberately *not* editable here — only surfaced read-only on the inventory dashboard (it's cron-managed). |
| Reservations admin | ✅ | `app/admin/reservations.tsx`, `app/admin/reservations/[id].tsx` | List with bulk actions, detail with every status transition behind a `ConfirmBox`, settlement actions embedded. |
| Inventory/stock dashboard | ✅ | `app/admin/inventory.tsx`, `app/admin/inventory/[id].tsx` | 6 live buckets, "Needs attention" surfacing, per-product calendar + release action. |
| Admin calendar | ✅ | `app/admin/calendar.tsx`, `app/admin/calendar/[date].tsx` | Month grid with status dots, day drill-down, full admin-task CRUD. |
| Checklists (pickup/return) | ✅ | `app/admin/reservations/[id]/checklist.tsx`, `app/admin/checklist-summary.tsx` | Single-item and chained multi-item flows both confirmed working end to end. Return checklist shows the read-only "At pickup: {rating}" reference per category, as intended. |
| Damage/loss/late assessment | ✅ | `utils/damageCharge.ts`, `utils/overdue.ts`, `functions/src/index.ts` | Charge tiers (good/fair → 0%, damaged → 60% default, unusable → fixed 100%) and late-penalty flow confirmed. **Note:** the damaged-charge default percent is configured on `app/admin/loyalty.tsx`, not `app/admin/exchange-rate.tsx` — easy to look in the wrong screen later. |
| Return closeout + settlement + PDF receipt | ✅ | `components/SettlementActions.tsx`, `components/RentalReceipt.tsx`, `lib/receiptPdf.ts` | All three settlement paths confirmed wired to `returnFinalizedAt`; PDF generation confirmed using real `expo-print`/`expo-sharing` imports, not stubs; both on-screen and PDF renderers share one `deriveReceiptData()`. |
| Deposits multi-currency | ✅ | `app/admin/reservations/[id]/checklist.tsx`, `components/MultiCurrencyAmount.tsx` | Real LAK/USD/THB choice, locked at handover, carried through every later charge computation. Blocks with an explicit message if a rate isn't configured. |
| Exchange rate + VAT settings | ✅ | `app/admin/exchange-rate.tsx`, `lib/exchangeRate.ts` | One `config/pricing` doc, confirmed as the single source every `useExchangeRate`/`useThbRate`/`useVatPercent` hook reads. |
| Reviews moderation | ✅ | `app/admin/reviews.tsx` | Confirmed using the documented per-product-loop workaround, not `collectionGroup` (which is known-broken for this project). |
| Broadcasts | ✅ | `app/admin/broadcast.tsx`, `app/notifications.tsx` | **Exists and is fully wired** (the audit brief allowed for "doesn't exist" — it does, completely). Admin composes → `broadcasts` collection → merged live into every user's notification feed. |
| BtoB validation | ✅ | `app/admin/business-accounts/[uid].tsx` | Approve/reject with reason, document viewing, notification to applicant either way. |
| Claims handling | ✅ | `app/admin/claims.tsx`, `app/admin/claims/[id].tsx` | Evidence viewing via `MediaViewer`, response flow confirmed to notify the renter on every response, not just resolution. |
| Admin dashboard home | ✅ | `app/admin/index.tsx` | 10 cards, all route to real, substantial screens — no dead stub cards found. `/admin/scan` (QR scanner) exists but has no dashboard card, only reachable from the reservations list header — minor discoverability gap, not broken. |
| Admin auth guard | ✅ | `contexts/AuthContext.tsx`, `app/admin/_layout.tsx` | Confirmed matches CLAUDE.md exactly: live listener on `admins/{uid}` existence, not a `role` field. |

---

## 4. Firebase backend

### Firestore collections in use

| Collection | Purpose | Key file(s) |
|---|---|---|
| `admins/{uid}` | Admin registry (existence = is-admin) | `contexts/AuthContext.tsx` |
| `products/{id}` | Catalogue | `lib/firestore.ts`, `app/admin/product-form.tsx` |
| `products/{id}/stockAdjustments/{id}` | Append-only stock-change audit log | `lib/firestore.ts`, `functions/src/index.ts` |
| `reservations/{id}` | Central booking record | `lib/firestore.ts`, most of `app/admin/reservations*` |
| `reservationOccupancy/{id}` | PII-free availability mirror | written only by `syncReservationOccupancy`; read by `utils/availability.ts` |
| `users/{uid}` | Profile, loyalty, BtoB, coupons | `lib/firestore.ts` |
| `users/{uid}/favorites/{id}` | Favourites | `lib/firestore.ts` |
| `users/{uid}/bag/{id}` | Cart | `lib/bag.ts` |
| `requests/{id}` | "Request this item" submissions | `lib/firestore.ts` |
| `conversations/{uid}` + `/messages/{id}` | Chat threads/messages | `lib/chat.ts` |
| `notifications/{uid}/items/{id}` | In-app notification inbox | `lib/notifications.ts` |
| `config/{pricing,loyalty,shop}` | Admin-set app config | `lib/exchangeRate.ts`, `lib/loyalty.ts`, `lib/shop.ts` |
| `broadcasts/{id}` | Announcements to all users | `app/admin/broadcast.tsx` |
| `adminTasks/{id}` | Admin calendar tasks | `app/admin/calendar*.tsx` |
| `reviews/{productId}` (root) | Path ancestor only, no real fields (rules-coverage artifact) | — |
| `reviews/{productId}/reviews/{reservationId}` | Reviews | `lib/firestore.ts`, `app/admin/reviews.tsx` |
| `claims/{id}` | Disputes | `lib/claims.ts`, `app/admin/claims*.tsx` |

One drift note: CLAUDE.md's old roadmap text names the target path as `reviews/{productId}/items/{reviewId}` — the collection actually live and rule-covered is `reviews/{productId}/reviews/{reservationId}`. Not a bug (the feature is built against the real path), just worth knowing if you ever re-read that old note.

### `firestore.rules` — summary & cross-check

14 `match` blocks, each confirmed gated by `isAdmin()`, `isOwner()`, or a tight field-level allowlist. **Cross-referenced against every collection path used in code — zero gaps found** (no collection is used in app code without a matching rule) **and zero overly-permissive rules found** beyond the one CLAUDE.md already documents and sanctions (Storage's public product-photo read — not even a Firestore rule). The two trickiest allowlists (`users` document creation blocking self-granted `customerType`/loyalty fields; `conversations` update restricted to two exact field-shapes) were spot-checked against the actual client write calls and match exactly — no false-strict mismatch either.

### `storage.rules` — summary & cross-check

9 match blocks (8 real paths + deny-all). Every `uploadBytes`/`ref(storage, ...)` call site in the app was checked against this table — **every upload path matches a rule exactly**, no gaps. Same one deliberate public-read exception as documented.

**Manual re-publish reminder (per CLAUDE.md's standing gotcha — rules changes don't deploy themselves):** there's no way to diff "what's live in the Firebase console" against "what's in this repo" from here. Given reviews/claims/broadcasts/adminTasks rules were likely added incrementally across several past sessions, the safe, zero-cost move is to **re-paste the entire current `firestore.rules` and the entire current `storage.rules` into the console now** — don't try to diff mentally, just overwrite both in full to guarantee they match git.

### Cloud Functions

All 9 pinned to **`asia-southeast1`**, runtime confirmed **Node.js 22** (`functions/package.json`'s `engines.node`), `firebase.json` has no separate runtime override. `cd functions && npm run build` → **clean, exit 0**.

| Function | Trigger | Purpose |
|---|---|---|
| `lateReturnAlerts` | scheduled, every 15 min | 0h/+1h/+2h overdue-return alerts |
| `releaseSettledStock` | scheduled, every 15 min | Releases `pendingSettlementUnits` once settled + 12h buffer elapsed |
| `applyRentalCount` | `onDocumentUpdated` on `reservations/{id}` | Increments product rental/booking counts on return |
| `applyLoyaltyPoints` | `onDocumentUpdated` on `reservations/{id}` | Loyalty points/tier/coupons on return |
| `expireEarlyAccess` | scheduled, every 15 min | Flips expired early-access products to public |
| `notifyProductAccessGrant` | `onDocumentWritten` on `products/{id}` | Notifies eligible members on new gated access |
| `notifyBtobSignup` | `onDocumentWritten` on `users/{uid}` | Notifies admins of new BtoB signup |
| `notifyClaimFiled` | `onDocumentWritten` on `claims/{id}` | Notifies admins of new claim |
| `syncReservationOccupancy` | `onDocumentWritten` on `reservations/{id}` | Maintains PII-free availability mirror |

---

## 5. Placeholders & hardcoded values

| Item | Location | Detail |
|---|---|---|
| VAT rate | `lib/exchangeRate.ts:14` (`DEFAULT_VAT_PERCENT = 10`) | Explicit code comment: "Placeholder default used whenever `config/pricing.vatPercent` hasn't been set yet." Admin-editable at `app/admin/exchange-rate.tsx:487`, which itself shows "Not set yet — ... currently see a {10}% placeholder" when unconfigured. **Confirm `config/pricing.vatPercent` is actually set in the console**, not relying on the code fallback. |
| Late penalty formula | `functions/src/index.ts:39` | Flat `pricePerDay` (one day's rate), explicitly "indicative," staff-editable at checklist time. The FAQ copy (`app/profile/faq.tsx`) describes a *tiered* escalation (1 day / 1.5 days / 2 days by lateness bracket) that **no code implements** — the FAQ text and actual behavior don't match. |
| Shop address/hours | `lib/shop.ts:14-19` (`SHOP_FALLBACK`) | Hardcoded `"14 Setthathirath Road"` / `"Daily 9:00–20:00"`, used whenever `config/shop` doesn't exist in Firestore. **Not verifiable statically whether `config/shop` is actually populated** — if not, users are currently seeing this hardcoded fallback. |
| Pickup time slots | `utils/timeSlots.ts` | Hardcoded 09:00–19:30 in 30-minute increments — not Firestore-configurable at all (unlike shop hours, which at least has a config override path). |
| Hero carousel images | `app/(tabs)/index.tsx:64,72,80,88` | 4 slides, all `image: null` → tint placeholder. Target filenames documented inline (`hero-lifestyle.jpg`, `hero-outdoor.jpg`, `hero-creator.jpg`, `hero-tools.jpg`), recommended size 1080×480. |
| Onboarding images | `app/onboarding.tsx:31,36,41` | 3 slides using seeded `picsum.photos` URLs — explicit placeholder per the file's own comment at line 18. |
| `lib/mockData.ts` | whole file | **Not actually demo/placeholder data** despite the name — contains only the `Product` TypeScript interface and real `CATEGORIES`/`CATEGORY_DETAILS` constants. Misleading filename, not a content gap. |
| Legal content | `lib/legalContent.ts` | Entire file marked "DRAFT v0.1" (line 2). `TERMS_MARKDOWN` (line 5): `[TO COMPLETE: effective date]`, `[TO COMPLETE: registered legal entity name]`, `[TO COMPLETE: business address]`, and in §17 `[TO COMPLETE: dispute-resolution method / competent court]`. `CANCELLATION_TERMS_MARKDOWN` (lines 9–66): `"Draft — must be reviewed before launch"` plus a `[TO COMPLETE: voucher delivery method...]` at the end. `PRIVACY_MARKDOWN` (line 68): same DRAFT header plus its own effective-date/entity/address placeholders and a `[TO COMPLETE: data-protection rights under Lao law]`. |
| TODO | `app/admin/broadcast.tsx:186` | *"Auto-trigger on product publish requires a Cloud Function — EAS build phase TODO. Use this form to send manually for now."* — a deliberately deferred automation, not a bug. |
| FIXME / HACK / lorem / test-credentials | — | **None found** anywhere in `app/`, `components/`, `lib/`, `utils/`, `functions/src/`. |

---

## 6. Code health

### Dead code / orphaned files

- **`lib/types.ts` — the entire file is orphaned.** Defines `ProductDoc`/`ProductStatus`, documented as "canonical types for the admin back-office" — but grepped every import form and found **zero references outside the file itself**. The admin product form uses `lib/mockData.ts`'s types instead. Worth a deliberate decision: delete it, or actually wire it in.
- **`components/DepositInfoAccordion.tsx`** — a self-contained "How does the deposit work?" FAQ component, confirmed zero import references anywhere.
- **`UserProfile.addresses`/`UserAddress`** — confirmed still dead, exactly as CLAUDE.md states, but it actually lives in `lib/firestore.ts` (line ~511/490), not `lib/types.ts` as one might assume from the name.
- **5 unused Expo-template boilerplate files**, never referenced: `components/external-link.tsx`, `components/haptic-tab.tsx`, `components/hello-wave.tsx`, `components/parallax-scroll-view.tsx`, `components/ui/collapsible.tsx`. Leftovers from the original scaffold.

### Duplicated logic

- VAT math (`splitHtVat`) and direct `stockLeft` reads (`effectiveStock()`): **no violations found** — both are consistently used everywhere.
- **`formatLakAmount` reimplemented locally** (byte-for-byte) in 3 files instead of importing it: `app/(tabs)/account.tsx:32-34`, `app/admin/reservations/[id].tsx:42-44`, `app/admin/calendar/[date].tsx:47-49`.
- **An identical `formatKip` helper** (`₭${...}`, which doesn't exist in `utils/currency.ts` at all) is duplicated across 3 files: `app/liked.tsx:41-43`, `app/(tabs)/explore.tsx:61-63`, `components/FilterSheet.tsx:26-28`.
- **Calendar-grid logic duplicated on the admin side**: `components/AdminDateTimePicker.tsx:31-51` is a verbatim copy of `utils/calendarGrid.ts`'s `buildCalendarDays`/`sameDay`; `app/admin/calendar.tsx:56-84`'s `buildCells` independently reimplements the same grid algorithm with a different output shape. (This is separate from the renter-side `DateRangeCalendar` consolidation in §3, which is clean.)

### CLAUDE.md gotcha-violation sweep

| Gotcha | Result |
|---|---|
| `Alert.alert(` in `app/`/`components/` | **Zero** — only one hit, a comment in `ConfirmBox.tsx` explaining why it's avoided. |
| `SafeAreaView` from `'react-native'` | **Zero** — every import site uses `react-native-safe-area-context`. |
| `collectionGroup(` live usage | **Zero** — the only hit is the explanatory comment in `app/admin/reviews.tsx` documenting the workaround. |
| `serverTimestamp()` inside an array/`arrayUnion` | **Zero** — no `arrayUnion` calls exist; the one array-of-coupons case already correctly uses `Timestamp.now()`. |
| Storage URL passed as a router param | **Zero.** |
| `overflow:'hidden'` on an `expo-image` | **Not fully verified** — confirmed which files use `expo-image`, but didn't confirm line-by-line whether `overflow:'hidden'` attaches to the same style object in every case. Worth a tighter follow-up grep if this matters. |
| Plain `useEffect` vs `useFocusEffect` on tab screens | 3 of 5 tab screens already correctly focus-aware. Two one-shot fetches flagged as plausible staleness candidates, **not confirmed bugs**: `app/(tabs)/account.tsx:138` (rental count/savings calc) and `app/(tabs)/index.tsx:153` (first-name fetch) — neither re-fetches on refocus. |

---

## 7. Pre-launch checklist

### (a) Code work remaining
- Fix or remove `app/category/[id].tsx`'s non-functional filter chips/toolbar buttons (§3).
- Correct CLAUDE.md's two stale sections: the "Système de reviews" roadmap entry (the feature is fully built) and the Blaze/photo-upload caution (see §7b — needs a decision first).
- Optional cleanup: `lib/types.ts`, `DepositInfoAccordion.tsx`, the 5 unused template files, the `formatLakAmount`/`formatKip` duplication, the `AdminDateTimePicker`/`admin/calendar.tsx` grid duplication. None are launch-blocking.
- Optional: add `useFocusEffect` to the two one-shot tab-screen fetches flagged in §6.

### (b) Manual Firebase/console actions
- **Re-paste the full `firestore.rules` and `storage.rules` into the console now** — can't verify what's currently live vs. what's in git (§4).
- **Confirm the actual Firebase billing plan (Spark vs. Blaze).** This is the single most important unresolved item from this audit: CLAUDE.md's "Not built yet" section says push notifications *and* photo uploads require Blaze and should be treated as unavailable — but extensive, fully-wired Storage upload code exists across chat, claims, products, profile photos, and business documents. Either the project has already moved to Blaze (then that CLAUDE.md note is stale and misleading) or it hasn't (then every one of those upload flows would currently fail in production). This needs resolving before testing resumes.
- Separately: **actual device push notifications (FCM) are not implemented at all** — no `expo-notifications` dependency, no push-token registration code found anywhere. The in-app Firestore-backed notification inbox is a different, already-working system. If device push was intended for v1, that's still unbuilt.
- Confirm `config/shop`, `config/pricing` (VAT%, exchange rates), and `config/loyalty` (thresholds, coupon %, damaged-charge default) are populated with real values in the console, not relying on code fallbacks.

### (c) EAS/store actions
- No local evidence an EAS build has completed — check the expo.dev dashboard directly for build history.
- Apple Sign-In requirement: **not applicable** (email/password only, confirmed §2).
- Confirm Apple Developer and Google Play Console accounts are set up (not verifiable from the repo).
- Recommend an `eas build --profile preview` on both platforms as the next concrete step, for real-device/TestFlight testing before any production submission.
- Store listing assets (screenshots, descriptions, privacy-policy URL) will need the legal content finalized first (§7d).

### (d) Blocked on business decisions
- **Legal content** (Terms, Privacy, Cancellation policy) — explicit unreviewed drafts with unfilled entity name/address/effective-date/dispute-mechanism fields (§5). Needs a local legal review before launch.
- **Late-return penalty formula** — FAQ copy describes a tiered schedule that no code implements (flat one-day rate only, staff-adjusted). Decide whether to code the tiered formula or correct the FAQ text to match actual (staff-discretion) behavior.
- **VAT rate** — 10% is explicitly a code-level placeholder; confirm it's the real, final rate and that it's actually set in `config/pricing`, not just inherited from the fallback.
- **BtoB at day 1** — fully built; decide whether to enable it at launch or hold it back.
- **i18n/Lao** — confirmed zero Lao-language UI anywhere; CLAUDE.md states English-only is deliberate (international/expat audience). Confirm this still holds, including for admin-side screens if local staff will use them.
- **Local/QR payment integration** — no in-app payment processing exists anywhere in the code; the "cash, bank transfer, QR payment" language in the Terms draft describes in-person/manual payment at pickup, not an integrated payment gateway. Confirm "reserve in-app, pay in person" remains the intended permanent model, or whether online payment is wanted for v1.

---

## 8. Risks & recommended next 5 steps

| # | Step | Why | Fit |
|---|---|---|---|
| 1 | **Confirm the Firebase billing plan (Spark vs. Blaze) and reconcile CLAUDE.md** | Highest-leverage unknown in this whole audit — if still on Spark, claims/chat-media/product-photo/business-doc uploads will fail in production despite being fully coded; if already on Blaze, a standing project doc is actively misleading. 10 minutes to check, outsized downstream risk either way. | Sonnet (targeted check + doc edit) |
| 2 | **Re-publish `firestore.rules` and `storage.rules` to the console in full** | Zero-cost insurance against whatever was or wasn't pasted across several past sessions; removes an entire class of "works locally, breaks in prod" risk before any further testing. | Sonnet (manual action, Aurore-driven) |
| 3 | **Fix `app/category/[id].tsx`'s non-functional filter chips** | A real, user-visible bug — the UI looks interactive but silently does nothing, which is worse than not having the filters at all. Small, isolated, single-file fix. | Sonnet (targeted) |
| 4 | **Get Terms/Privacy/Cancellation policy in front of a lawyer in Laos** | Explicitly marked "not legal advice" with unfilled legal-entity/address/dispute-mechanism fields — this blocks a real launch regardless of code readiness, and legal review takes real calendar time, so starting it now (in parallel with engineering work) is the efficient move. | Not a coding task — business/ops action |
| 5 | **Clean up CLAUDE.md's stale sections and run one real EAS preview build** | The reviews-roadmap note and (pending step 1) the Blaze note are actively wrong and will mislead the next planning session; a preview build is the cheapest way to catch any native-config surprise before a production submission. | Sonnet for the doc cleanup; preview build itself is operational, escalate to Opus only if a build failure turns out to need deep native-config debugging |

---

*End of report. No files other than this one were created, modified, or deleted during this audit.*
