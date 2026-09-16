# Colour schemes

Two complete schemes for the website. One is live, the other is parked and
ready to switch to on short notice.

- `coral-cream-deep-teal.css` -- **live.** Coral and cream loop on a deep teal
  header and hero; coral buttons; deep teal links and icons.
- `coral-teal-cream.css` -- parked. Coral and teal loop on the cream page
  throughout; coral buttons; deep teal links and icons.

## To switch

1. In `src/app/globals.css`, change the `@import` line to the other file.
2. Swap the app icon set to match: copy the six PNGs from
   `mobile/assets/schemes/coral-teal-cream/` over `mobile/assets/`, and in
   `mobile/app.json` set `android.adaptiveIcon.backgroundColor` and the
   `expo-splash-screen` `backgroundColor` to `#F5F2EC`.
3. In the app, the matching in-app look is the "Coral & Teal on Cream" option
   under Personalisation -> Colour scheme; the default is set in
   `mobile/theme/tokens.ts` (`DEFAULT_GROUND`).
4. Run `npx next build` from the repo root before pushing, as always.

Both files define the same tokens, so nothing else in the site changes.
