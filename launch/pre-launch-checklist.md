# Pre-launch checklist

Things that must be real before Untangled Life goes to the App Store and Play
Store. Anything listed here currently exists as a placeholder, a stub, or not
at all -- the app says so honestly rather than pretending.

Last reviewed: 2026-09-13 (updated after overnight work)

---

## Menu items that are currently honest placeholders

Each of these opens an alert explaining it isn't built. None silently fail.
Wire them up in `mobile/app/(tabs)/menu.tsx`.

- [ ] **Privacy policy** -- not written. Needs a real page, ideally at
      `untangledlife.com.au/privacy`, linked from the menu.
      **Also required for Google Calendar API verification**, so this blocks
      the OAuth work too, not just launch.
      Substance to cover: the app stores when each partner is busy (start and
      end times only), never event titles, locations or notes; working hours;
      key dates; to-dos and wishlists; push tokens. Data lives in Supabase,
      row-level-secured to the couple.
- [ ] **Facebook page** -- doesn't exist. Create, then replace the placeholder
      alert with a `Linking.openURL` to it.
- [ ] **Instagram account** -- same.
- [ ] **"Give us 5 stars"** -- needs the App Store listing to exist first. Then
      link to `itms-apps://apps.apple.com/app/id<APP_ID>?action=write-review`
      on iOS and the Play Store equivalent on Android. Consider
      `expo-store-review` rather than a raw link.
- [ ] **Personalisation** -- not designed yet. Intended to cover how the app
      addresses you both and what appears on the home screen.
- [ ] **Notification settings** -- reminders are currently hardcoded to 14, 7
      and 3 days before a key date, and can only be turned off at the OS level.
      Needs per-couple control of offsets and categories.

## Push notifications -- written but never once fired

Full detail in `supabase/functions/README.md`. In order:

- [ ] `eas init` in `mobile/` -- writes `extra.eas.projectId`. Without it push
      registration silently no-ops by design.
- [ ] Development build -- Expo Go cannot receive remote push from SDK 53 on.
      Android dev builds are free; **iOS needs a paid Apple Developer account
      (~$150/yr)**.
- [ ] Deploy the `notify-partner` Edge Function.
- [ ] Create the two database webhooks (`planned_events` insert, `key_dates`
      insert) in the Supabase dashboard.
- [ ] EAS push credentials: FCM for Android, APNs key for iOS.

## App store readiness

- [ ] **Real app icon and splash** -- still Expo defaults.
- [ ] Apple Developer account ($149 AUD/yr) and Google Play account ($25 once).
- [ ] Screenshots for both stores.
- [ ] App Store description, keywords, category, age rating.
- [ ] Support URL and marketing URL.
- [x] Account deletion path -- **Apple requires** any app with account creation
      to offer in-app account deletion. Built 14 Sep, Settings → Leaving.
      **Untested on a device.**
- [ ] Test on Android. Everything so far has been verified on iPhone only.

## Landing page

- [ ] Replace the placeholder testimonial in `src/app/page.tsx` (marked with a
      comment in the code) with a real one.
- [x] Add the privacy policy page.
- [x] Terms of service and cookie policy pages, linked from the home footer and
      from each other. The app menu links to the privacy policy and the terms. Live at /privacy, rewritten 14 Sep to
      cover full event detail, photos, and the per-calendar choice.
- [ ] Decide what the site says once the app is downloadable rather than a
      waitlist.

## Roy has to supply these (they are placeholders on the live privacy page)

The privacy policy renders these in orange as `[...]` marks, so they cannot
reach Google's verification team unnoticed.

- [ ] **Legal entity name** -- the operator of the app. A sole trader's own name
      is fine; it just has to be the real one.
- [ ] **ABN**, if registered.
- [ ] **Supabase region** -- Project Settings → General → Region in the
      dashboard. Google's data-access review asks where data is stored.

## Product gaps worth closing before launch

- [x] **Roster import (paste)** -- done. Paste a roster, it reads the shifts,
      you confirm and edit before anything saves. Ambiguous rows are flagged.
      **Untested on a device.**
- [ ] **Roster import (photo / PDF)** -- not started. Needs either an on-device
      ML kit (a native module Expo Go won't have) or a vision API (cost, keys,
      an Edge Function). Worth doing only if pasting proves not to be enough.
- [ ] **Timezone handling** -- the `notify-partner` Edge Function formats times
      in `Australia/Sydney`. Store a per-user timezone before shipping outside
      AU.
- [x] **Unpairing / leaving a couple** -- built 14 Sep, Settings → Leaving.
      Shared things are handed to the remaining partner rather than cascaded
      away. **Untested on a device.**
- [ ] **Google / Outlook OAuth sync** (v1.5) -- planned, not started. Google
      treats the Calendar scope as "sensitive": beyond ~100 test accounts it
      needs verification with a privacy policy, a demo video, and 3–5 business
      days of review. **Step-by-step console instructions are now in
      `launch/google-cloud-setup.md`** -- everything but the demo video can be
      done today, and the review clock is the longest lead time on the project.

## New on 14 Sep -- needs device testing tonight

- [x] **Run `supabase/calendar-detail.sql` and `supabase/photos.sql`.** Both
      run 14 Sep. Not yet verified from the app.
- [ ] **RE-RUN `supabase/photos.sql`.** The version already run used
      `on conflict do nothing` on the bucket, which would have left an existing
      bucket public. The fixed version forces `public = false` and adds a size
      and MIME cap. Safe to re-run.
- [ ] **Run `supabase/calendar-sharing.sql`** -- replaces the connected boolean
      with off / busy-only / full-detail, and clears `busy_blocks` once so no
      row outlives the setting that allowed it.
- [ ] **Per-calendar sharing.** Every calendar starts OFF, so on first open
      after this update Roy and Alyssa will both see no free time until they
      choose on the new Calendars screen. Designed behaviour, but it is the
      first thing to check.
- [ ] **Run `supabase/leaving.sql`** -- adds the unpair and delete-account
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
- [ ] **Run `supabase/key-date-extras.sql`** -- per-date reminders and notes.
- [ ] **Key Dates editing.** Tap a misc date to rename or re-date it; Clear on
      the anniversary and either birthday.
- [ ] **Run `supabase/reminder-toggle.sql`** -- the reminders on/off switch.
- [ ] **The reminder switch.** Each key date shows its countdown, a switch, and
      when the next nudge lands. Switching off should keep the chips you chose
      and cancel the scheduled notifications immediately, not at the next app
      open. Switching back on should restore the same schedule, not the default.
- [ ] **Per-date reminders.** Change a date's reminder chips, then check the
      old notification is gone and the new one is scheduled -- rescheduling
      cancels by `keydate-` prefix, so a stale offset should not survive.
- [ ] **Run `supabase/trips-and-pins.sql`** -- end dates and the pinned flag.
- [ ] **Trips.** Add a misc date with an end date; check it shows across every
      day on the calendar, that the countdown switches to "4 days left" once it
      starts, and that it disappears from Home the day after it ends.
- [ ] **Pinning.** Pin something, check the hero countdown appears on Home for
      both of you and the date leaves the horizontal row.
- [ ] **Run `supabase/free-time-prefs.sql`** -- the free-window settings.
- [ ] **Run `supabase/home-layout.sql`** -- per-person Home arrangement.
- [ ] **Accent colour.** Pick each one in both light and dark mode. The soft
      tints behind chips and the hero countdown are the ones most likely to
      look wrong.
- [ ] **Arrange Home.** Reorder and hide sections in Settings → Arrange Home,
      then check Home matches and that Alyssa's arrangement is untouched.
      Hiding everything should leave the photo and setup prompts, not a crash.
- [ ] **Free together settings.** Change the day window and the minimum, then
      check Home recomputes. The night-shift case is the one that matters:
      4am–12pm should offer a morning that 7am–11pm buries.
- [ ] **Notes.** Type a gift idea, leave the field, come back. It should also
      appear under the countdown on Home and be visible on the other phone.
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
- [ ] **Photo permission copy** on iOS -- the Info.plist string is set but has
      never been seen on a device.

## Found by review, fixed but never run on a device (14 Sep)

Two adversarial reviews of the day's diff turned these up. All are fixed and
committed; none has been seen working on a phone.

- [ ] **Revoked calendar permission used to strand every uploaded row.** The
      permission check ran before the deletes, so turning calendar access off
      in the phone's settings froze the partner's view of your event titles
      forever, with no in-app way to clear it. Test: share a calendar in full
      detail, revoke access in iOS Settings, reopen the app, confirm the rows
      disappear from the other phone.
- [ ] **A shared calendar vanishing off the phone did the same.** Test by
      signing an account out of iOS Calendar after sharing one of its
      calendars.
- [ ] **Multi-day and all-day busy events only appeared on their first day.**
      Test a 5-day all-day event: every day should show it, the first as
      "All day", and nothing should appear on the day after it ends.
- [ ] **Same event in two calendars showed twice.** Put a meeting in both a
      busy-only and a full-detail calendar; expect one row, with the title.
- [ ] **Concurrent unpair could strand a couple's data forever.** Both
      partners reading each other as "remaining" meant neither deleted the
      couple, leaving rows nobody could ever read. Now locked. Hard to test by
      hand; the fix is a `for update` plus a re-count.
- [ ] **Account deletion could report success having deleted nothing.** If the
      function lacks privilege on `auth.users` the delete matches zero rows and
      raises nothing. Now raises. Test by actually deleting the second account
      and confirming it can't sign back in.
- [ ] **Photos are now deleted server-side, inside the same transaction.** Test
      that unpairing removes your avatar, that the couple's cover survives if a
      partner remains, and that deleting the last account takes the cover.
- [ ] **`couples` is now column-grant restricted.** If the free-together
      settings or the cover photo stop saving with a permission error, the
      grant in `free-time-prefs.sql` is missing a column.

## The calendar build (14 Sep, evening) -- needs device testing

- [ ] **Run `supabase/calendar-events.sql`** (in the combined file).
- [ ] **Day view.** Tap a day in the month grid once to select it, again to
      open the hour-by-hour view. 24 rows, everything in its real slot, a red
      line at the current time on today.
- [ ] **Tap-to-add.** Tapping empty space should open the editor pre-filled
      with that half-hour slot -- check the slot matches where you tapped.
- [ ] **Overlaps.** Two events at the same time should sit side by side, not
      on top of each other.
- [ ] **Owner and colour.** An event set to Alyssa should show in her colour
      everywhere -- day view, month dots, the day list.
- [ ] **Push toggles.** The critical one. Turn a toggle ON and the event should
      appear in that phone's own calendar app; turn it OFF and it should
      *disappear* from there on the next sync. Editing the time in the app
      should move it in the phone calendar too.
- [ ] **Book it still works.** It now has to pass push_to explicitly; if the
      booked date stops reaching either calendar, that's why.
- [ ] **Colour picker.** 24 swatches, your partner's current colour labelled
      with their name so you don't pick the same one.
- [ ] **Editing and deleting an event**, including one the partner created.

## Calendar review fixes (14 Sep) -- all untested on a device

A second pair of reviews on the calendar diff found twelve more. The ones
worth checking by hand:

- [ ] **Event blocks used to overflow the screen by 58px.** A percentage width
      resolves against the containing block, and the gutter was a margin on top
      of it. Check block right edges line up, especially two side by side.
- [ ] **The day view is a hidden tab route, so it never unmounted.** Opening a
      different day showed the previous one. Same for the editor: tapping 2pm
      after cancelling a 10am draft reopened the 10am draft. Check both.
- [ ] **The ‹ › arrows didn't reload.** Two days out and the grid was empty.
- [ ] **Tapping a work or busy block did nothing at all** -- a disabled
      Pressable wins the hit test and then swallows the tap. On a day with an
      eight-hour shift the whole working day was untappable.
- [ ] **The last hour of the day couldn't be saved.** 23:30 + 1 hour stayed on
      the same date, so every save was refused. Tap the bottom of the grid.
- [ ] **Daylight saving.** Offsets were measured in elapsed time while the rows
      were drawn in wall-clock. AU has no transition until October, so this
      won't show in testing -- the suite now runs in a DST timezone instead.
- [ ] **Cancelling a past event, or editing one backwards, left it on the
      phone forever.** The sync now reconciles from the link rows, not just
      from a future-events query. Test: book something, move it to yesterday,
      check the phone calendar follows.
- [ ] **Unpairing left every shared event in your phone calendar** with nothing
      able to remove them. Now cleared before leaving.
- [ ] **The colour tick was invisible on all 24 swatches in light mode** (white
      on pastel). Month dots had the same problem.
- [ ] **Tapping your partner's colour silently made you both the same.** Now
      asks first.

## Event editing (14 Sep, late) -- needs device testing

- [ ] **Run `supabase/event-editing.sql`** (in the combined file).
- [ ] **Edit a synced event.** Tap a Google/Apple event on the day view, change
      its time, save. It should move in the calendar it came from, and the app
      should show the new time after the re-sync.
- [ ] **Edit a repeating synced event.** Should ask "just this one" or "this
      and future". Check the right occurrence moves -- passing the wrong
      instance start date silently moves the FIRST one in the series, which
      could be months ago.
- [ ] **Delete a synced event.** Comes out of the source calendar, not just the
      app.
- [ ] **A read-only calendar.** Subscribed calendars (holidays, a shared
      roster) should say so rather than failing. If you don't have one, add a
      holiday subscription to test it.
- [ ] **Your partner's synced event.** Should be read-only with an explanation
      -- a phone can't write to someone else's Google account.
- [ ] **Change notification.** Move a booked date and check the other phone
      gets "Roy moved Dinner to 8pm" and that its calendar updates.
      **Blocked on the development build and the Edge Function deploy** -- see
      the push section below. Until then, nothing is pushed and the change
      still lands when the app is next opened.
- [ ] **The third webhook.** `supabase/functions/README.md` now specifies
      planned_events UPDATE as well.
- [ ] **Noise check.** Toggling a push switch or editing a note should NOT
      notify the partner -- only a real change to the time, name or place.

## Migration safety (14 Sep) -- verified, not assumed

The combined migration file was reviewed by running it against a real Postgres
three times over and diffing a full schema dump. It found seven real bugs in
what had been sent, including one already seen in the wild.

- [x] **`column "connected" does not exist`.** calendar-sharing read that column
      in a backfill and dropped it a few lines later, so the file was only ever
      safe to run once. Now guarded and re-runnable.
- [x] **The backfill used a real user choice as its sentinel.** On a re-run it
      would have flipped every deliberately-off calendar to full detail, quietly
      sharing titles and locations with a partner.
- [x] **The push_to member check never fired.** `unnest(...) as id` made the bare
      `id` bind to `profiles.id`, so the predicate read `p.id = p.id`.
- [x] **Unpairing left events permanently stuck.** `owner_user_id` kept pointing
      at the person who left, and the new trigger then refused every write to
      that event -- including the cancel that deletes it.
- [x] **A fresh database had its busy_blocks wiped for no reason**, because
      calendar-detail created a column purely so the next file could drop it.
- [x] **Unpairing deleted your profile picture.** You keep the account; you keep
      the photo.
- [x] Also: `updated_at` was null on every insert, `owner_id` wasn't transferred
      alongside the deprecated `owner`, and ordering the sections by hand broke
      a column grant twice.

Standing rule: **the combined file gets run against a throwaway Postgres before
it goes anywhere near the live database.** Every one of the above passed a
read-through.

## Time zones (14 Sep) -- needs device testing

- [ ] **Run `supabase/time-zones.sql`.**
- [ ] **Detection.** Open the app and check `profiles.time_zone` in Supabase
      holds your real zone. Change the phone's zone in Settings, background and
      foreground the app, and check it updates.
- [ ] **The zone gap line.** Set one phone to another zone and check Home says
      so above Free together, and that free windows show both clocks.
- [ ] **Free together across zones.** With the phones in different zones, every
      window offered has to fall inside 7am-11pm for BOTH of you, in your own
      local times. This is the part with no manual workaround if it is wrong.
- [ ] **Push notification times.** Blocked on the development build, but when
      it lands: the time in the notification must be the RECIPIENT'S local
      time. It was hard-coded to Sydney for everyone until now.
- [ ] **Rosters after travel.** Enter working hours, change the phone's zone,
      and check the shifts stay at the same clock time rather than sliding.
- [ ] **Hermes Intl.** `supportsNamedZones()` checks at runtime whether this
      build can do arithmetic in a named zone. If it returns false the app
      falls back to the device's own offset and cross-zone maths silently stops
      working -- worth logging once on a real device to confirm it is true.

## Known rough edges

- Everything is verified on two iPhones only, with one couple, on one Supabase
  project. No load, no edge cases, no second couple. **Nothing built overnight
  on 13 Sep has run on a device at all.**
- To-do filters are Me / Partner / Us with no "everything" option, so there's
  no way to see the whole list at once. A product decision rather than a bug.
- Key-date reminders reschedule every time the tab is focused. Harmless now,
  but wasteful once a couple has many dates.
- **All-day events may land a day early outside Australia.** expo-calendar can
  report an all-day event's start as UTC midnight, which is the previous day
  local time anywhere west of UTC. Australia is UTC+10 so it reads correctly
  here either way, which is exactly why it won't be caught by testing. Needs
  fixing before the app ships outside AU -- most likely by storing an explicit
  date-only field for all-day rows rather than inferring the day from a
  timestamp.
- No Android testing whatsoever. The date pickers in particular behave
  differently there -- Android's dialog confirms itself, iOS uses a sheet.
