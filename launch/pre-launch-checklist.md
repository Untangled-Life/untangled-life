# Pre-launch checklist

Things that must be real before Untangled Life goes to the App Store and Play
Store. Anything listed here currently exists as a placeholder, a stub, or not
at all — the app says so honestly rather than pretending.

Last reviewed: 2026-09-13 (updated after overnight work)

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
- [x] Account deletion path — **Apple requires** any app with account creation
      to offer in-app account deletion. Built 14 Sep, Settings → Leaving.
      **Untested on a device.**
- [ ] Test on Android. Everything so far has been verified on iPhone only.

## Landing page

- [ ] Replace the placeholder testimonial in `src/app/page.tsx` (marked with a
      comment in the code) with a real one.
- [x] Add the privacy policy page. Live at /privacy, rewritten 14 Sep to
      cover full event detail, photos, and the per-calendar choice.
- [ ] Decide what the site says once the app is downloadable rather than a
      waitlist.

## Roy has to supply these (they are placeholders on the live privacy page)

The privacy policy renders these in orange as `[...]` marks, so they cannot
reach Google's verification team unnoticed.

- [ ] **Legal entity name** — the operator of the app. A sole trader's own name
      is fine; it just has to be the real one.
- [ ] **ABN**, if registered.
- [ ] **Supabase region** — Project Settings → General → Region in the
      dashboard. Google's data-access review asks where data is stored.

## Product gaps worth closing before launch

- [x] **Roster import (paste)** — done. Paste a roster, it reads the shifts,
      you confirm and edit before anything saves. Ambiguous rows are flagged.
      **Untested on a device.**
- [ ] **Roster import (photo / PDF)** — not started. Needs either an on-device
      ML kit (a native module Expo Go won't have) or a vision API (cost, keys,
      an Edge Function). Worth doing only if pasting proves not to be enough.
- [ ] **Timezone handling** — the `notify-partner` Edge Function formats times
      in `Australia/Sydney`. Store a per-user timezone before shipping outside
      AU.
- [x] **Unpairing / leaving a couple** — built 14 Sep, Settings → Leaving.
      Shared things are handed to the remaining partner rather than cascaded
      away. **Untested on a device.**
- [ ] **Google / Outlook OAuth sync** (v1.5) — planned, not started. Google
      treats the Calendar scope as "sensitive": beyond ~100 test accounts it
      needs verification with a privacy policy, a demo video, and 3–5 business
      days of review. **Step-by-step console instructions are now in
      `launch/google-cloud-setup.md`** — everything but the demo video can be
      done today, and the review clock is the longest lead time on the project.

## New on 14 Sep — needs device testing tonight

- [x] **Run `supabase/calendar-detail.sql` and `supabase/photos.sql`.** Both
      run 14 Sep. Not yet verified from the app.
- [ ] **Run `supabase/calendar-sharing.sql`** — replaces the connected boolean
      with off / busy-only / full-detail, and clears `busy_blocks` once so no
      row outlives the setting that allowed it.
- [ ] **Per-calendar sharing.** Every calendar starts OFF, so on first open
      after this update Roy and Alyssa will both see no free time until they
      choose on the new Calendars screen. Designed behaviour, but it is the
      first thing to check.
- [ ] **Run `supabase/leaving.sql`** — adds the unpair and delete-account
      functions.
- [ ] **Unpairing and account deletion.** Test on the second account, not
      Roy's. Check afterwards that the remaining partner still has the
      anniversary, the to-dos and the wishlists, and that the leaver's birthday
      is gone. Then re-pair and make sure a fresh invite code works.
- [ ] **Key Dates in dark mode.** Every text input in the app was rendering
      its text in the platform default black, invisible on the dark theme.
      Found by grep after fixing it in Key Dates, patched in seven places
      (sign-in, sign-up, pairing, to-dos, both wishlist screens, key dates).
      Worth a pass through the app with dark mode on.
- [ ] **Key Dates editing.** Tap a misc date to rename or re-date it; Clear on
      the anniversary and either birthday.
- [ ] **Busy-only really is busy-only.** Set a calendar to Busy only, sync, and
      confirm in Supabase that `title` is null on those rows. The promise is
      that titles never reach the server, not that the app hides them.
- [ ] **Event detail on the shared calendar.** A connected calendar's events
      should show their title, location and notes, not a grey block.
- [ ] **Disconnecting a calendar** should remove its events from the partner's
      view immediately, not at the next sync.
- [ ] **All-day events** now sync and show as "All day", but must NOT eat the
      day's free windows. This is also the likely cause of the 23-hour busy
      block seen on 14 Sep.
- [ ] **Cover photo and profile pictures.** Picking, cropping, uploading,
      showing on both phones, and replacing one (the old file should go).
- [ ] **Photo permission copy** on iOS — the Info.plist string is set but has
      never been seen on a device.

## Known rough edges

- Everything is verified on two iPhones only, with one couple, on one Supabase
  project. No load, no edge cases, no second couple. **Nothing built overnight
  on 13 Sep has run on a device at all.**
- To-do filters are Me / Partner / Us with no "everything" option, so there's
  no way to see the whole list at once. A product decision rather than a bug.
- Key-date reminders reschedule every time the tab is focused. Harmless now,
  but wasteful once a couple has many dates.
- No Android testing whatsoever. The date pickers in particular behave
  differently there — Android's dialog confirms itself, iOS uses a sheet.
