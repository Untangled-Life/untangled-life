# Coral & Teal on Cream -- parked icon set

The complete app icon set for Scheme 1, ready to swap in. The live set in
`mobile/assets/` is Scheme 2, Coral & Cream on Deep Teal.

To switch the app to this scheme:

1. Copy the six PNGs here over the same-named files in `mobile/assets/`.
2. In `mobile/app.json`, set `android.adaptiveIcon.backgroundColor` and the
   `expo-splash-screen` plugin's `backgroundColor` to `#F5F2EC`.
3. In `mobile/theme/tokens.ts`, set `DEFAULT_GROUND` to `"cream"` so new
   installs open on the matching in-app look. (Anyone can already pick it
   under Personalisation -> Colour scheme.)
4. Switch the website too: see `src/styles/schemes/README.md`.

Generated from the same vector as the live set; only the ground and the
second strand's colour differ.
