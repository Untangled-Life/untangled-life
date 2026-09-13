# Pre-launch checklist

Things that must be real before Untangled Life goes to the App Store and Play
Store. Anything listed here currently exists as a placeholder, a stub, or not
at all — the app says so honestly rather than pretending.

Last reviewed: 2026-09-13

---

## Menu items that are currently honest placeholders

Each of these opens an alert explaining it isn't built. None silently fail.
Wire them up in `mobile/app/(tabs)/menu.tsx`.

- [ ] **Privacy policy** — not written. Needs a real page, ideally at
      `untangledlife.com.au/privacy`, linked from the menu.
      **Also required for Google Calendar API verification**, so this blocks
      the OAuth work too, not just launch.
      Substance to cover: the app stores when each partner is busy (start and
      end times only), never event titles, locations or notes; working hours;
      key dates; to-dos and wishlists; push tokens. Data lives in Supabase,
      row-level-secured to the couple.
- [ ] **Facebook page** — doesn't exist. Create, then replace the placeholder
      alert with a `Linking.openURL` to it.
- [ ] **Instagram account** — same.
- [ ] **"Give us 5 stars"** — needs the App Store listing to exist first. Then
      link to `itms-apps://apps.apple.com/app/id<APP_ID>?action=write-review`
      on iOS and the Play Store equivalent on Android. Consider
      `expo-store-review` rather than a raw link.
- [ ] **Personalisation** — not designed yet. Intended to cover how the app
      addresses you both and what appears on the home screen.
- [ ] **Notification settings** — reminders are currently hardcoded to 14, 7
      and 3 days before a key date, and can only be turned off at the OS level.
      Needs per-couple control of offsets and categories.

## Push notifications — written but never once fired

Full detail in `supabase/functions/README.md`. In order:

- [ ] `eas init` in `mobile/` — writes `extra.eas.projectId`. Without it push
      registration silently no-ops by design.
- [ ] Development build — Expo Go cannot receive remote push from SDK 53 on.
      Android dev builds are free; **iOS needs a paid Apple Developer account
      (~$150/yr)**.
- [ ] Deploy the `notify-partner` Edge Function.
- [ ] Create the two database webhooks (`planned_events` insert, `key_dates`
      insert) in the Supabase dashboard.
- [ ] EAS push credentials: FCM for Android, APNs key for iOS.

## App store readiness

- [ ] **Real app icon and splash** — still Expo defaults.
- [ ] Apple Developer account ($149 AUD/yr) and Google Play account ($25 once).
- [ ] Screenshots for both stores.
- [ ] App Store description, keywords, category, age rating.
- [ ] Support URL and marketing URL.
- [ ] Account deletion path — **Apple requires** any app with account creation
      to offer in-app account deletion.
- [ ] Test on Android. Everything so far has been verified on iPhone only.

## Landing page

- [ ] Replace the placeholder testimonial in `src/app/page.tsx` (marked with a
      comment in the code) with a real one.
- [ ] Add the privacy policy page.
- [ ] Decide what the site says once the app is downloadable rather than a
      waitlist.

## Product gaps worth closing before launch

- [ ] **Roster import** — manual entry works; importing from a pasted roster,
      photo or PDF is the agreed next feature. Needs a confirm-before-save
      step, since parsing will sometimes be wrong.
- [ ] **Timezone handling** — the `notify-partner` Edge Function formats times
      in `Australia/Sydney`. Store a per-user timezone before shipping outside
      AU.
- [ ] **Unpairing / leaving a couple** — no way to undo pairing. Needed if
      someone pairs with the wrong account, or a relationship ends.
- [ ] **Google / Outlook OAuth sync** (v1.5) — planned, not started. Google
      treats the Calendar scope as "sensitive": beyond ~100 test accounts it
      needs data-access verification with a privacy policy, a demo video, and
      3–5 business days of review. Start early.

## Known rough edges

- Dates and times are typed as text (`YYYY-MM-DD`, `HH:MM`) rather than picked
  from a native picker. Works, but feels unfinished — a date/time picker is the
  single biggest perceived-quality win available.
- Everything is verified on two iPhones only, with one couple, on one Supabase
  project. No load, no edge cases, no second couple.
