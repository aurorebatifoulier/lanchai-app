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

## Working with Aurore

- For any sizeable feature, use **Plan mode** first: propose the plan, get approval,
  then implement.
- Keep changes reviewable — Aurore reviews diffs before accepting.
- After changes, Aurore tests on Expo Go (physical S25 Ultra).
- You can talk with Aurore in **French**. Keep code, identifiers, comments, and
  in-app UI strings in **English**.
  