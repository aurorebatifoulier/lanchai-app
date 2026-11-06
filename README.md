# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

Node 22 (`.nvmrc`; Expo SDK 54 supports Node 20.19.4+ and 22 — not 24+/26).

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   | Command | Opens in |
   |---|---|
   | `npm start` (= `npm run start:go`) | **Expo Go** — phones on the same Wi-Fi scan the QR code |
   | `npm run tunnel` | Expo Go through a tunnel — any network (slower) |
   | `npm run start:dev` | a development build (EAS `development` profile) |
   | `npm run ios` / `npm run android` | Expo Go in the iOS Simulator / an Android emulator |

   `npx expo start` alone opens in development-build mode (expo-dev-client is installed) — use the scripts above.

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Tests

One command runs everything (also run by GitHub Actions on every push to `master`):

```bash
npm test
```

- **Unit tests** (`tests/unit/`, no emulator): pricing tiers, deposit per unit, coupons,
  promo codes, loyalty points, late fees, Vientiane time / slots, receipts, search, plurals.
  Run alone: `npm run test:unit` (search only: `npm run test:search`).
- **Security rules** (`tests/rules/`, Firestore + Storage emulators): every rule block is
  tested with at least one allowed and one refused operation, as a guest, renter A,
  renter B, a business account and an admin. Run alone: `npm run test:emu:rules`.
  The run ends with a coverage check that fails if a rule block has no allow or no deny
  test.
- **Cloud Functions** (`functions/test/`, same emulators): callables refuse
  unauthenticated / guest / non-admin calls, booking prices are recomputed server-side,
  one discount per booking, stock race, idempotency, promo limits, invites, points
  credited once. Run alone: `npm run test:emu:functions`.

**CI:** `.github/workflows/ci.yml` runs install → `tsc` → ESLint → functions build →
all tests on every push to `master` (and on pull requests). See the result in the repo's
**Actions** tab, or the ✓ / ✗ next to each commit. No secrets are needed.

The emulators need **Java 21** (`brew install openjdk@21`, then `java -version`). They use
the demo project `demo-lanchai` — nothing touches the real Firebase project, no
credentials are needed. Config: `firebase.test.json` (the deploy config `firebase.json` is
unchanged; rules are still pasted in the console by hand).

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
