# Google Cloud setup -- step by step

_Written 14 September 2026. Check the dates on Google's own pages; this process
changes._

This is what has to happen before Untangled Life can sync with Google Calendar
for anyone other than a handful of test accounts. It is the longest-lead item
on the whole project: the review itself is **3–5 business days**, and that clock
only starts once everything below is in place. Nothing here needs the app to be
finished -- start it now and let it run in the background.

**Who does what:** every step in this file is console clicking and is yours.
The code it unblocks (the OAuth exchange, the token store, the sync) is mine,
and is v1.5 -- see `claude/project-status.md`.

---

## Why this exists at all

Google classes calendar access as a **sensitive scope**. Any app asking for it
gets an unverified-app warning screen and a hard cap of about 100 accounts until
Google has reviewed it. Cupla went through exactly this. There is no way around
it and no way to hurry it.

Note what we are NOT doing: reading Gmail or Drive would be a *restricted*
scope, which needs an annual third-party security assessment costing thousands.
We only want Calendar, so this is the lighter of the two processes.

---

## Before you start

Have these to hand:

- The Google account that should **own** this project long-term. Not a personal
  throwaway -- whoever owns it controls the app's Google identity forever.
  `hello@untangledlife.com.au` if that is a real mailbox, otherwise your main
  account.
- Access to the DNS for `untangledlife.com.au` (for domain verification).
- The app icon at 120×120 px.

---

## 1. Create the project

1. Go to **console.cloud.google.com**, signed in as the owner account above.
2. Project picker (top bar) → **New Project**.
3. Name: `Untangled Life`. No organisation. **Create**.
4. Make sure the project picker now shows `Untangled Life` before doing
   anything else. Everything below applies to the selected project, and doing
   it in the wrong one is the classic way to lose an afternoon.

## 2. Enable the Calendar API

1. **APIs & Services → Library**.
2. Search **Google Calendar API** → **Enable**.

That is the only API we need. Do not enable others "just in case" -- every
enabled API with a sensitive scope is something the reviewer will ask about.

## 3. Verify the domain

Google will not accept a home page or privacy policy on a domain you have not
proven you own.

1. Go to **search.google.com/search-console**, signed in as the **same account**
   that owns the Cloud project.
2. Add a property → **Domain** → `untangledlife.com.au`.
3. It will give you a TXT record. Add it in whatever manages DNS for the domain
   (Vercel, or the registrar). **Verify**.

DNS can take an hour to propagate. If verification fails, wait and retry rather
than adding a second record.

## 4. Configure the OAuth consent screen

**APIs & Services → OAuth consent screen.**

- **User type: External.** (Internal is for Google Workspace organisations only.)
- **App name:** `Untangled Life` -- this is the name users see on the consent
  screen, and it must match the app's name in the stores.
- **User support email:** `hello@untangledlife.com.au`.
- **App logo:** the 120×120 icon. Uploading a logo triggers brand review, which
  is bundled into the same submission, so do it now rather than later.
- **App home page:** `https://untangledlife.com.au`
- **Privacy policy:** `https://untangledlife.com.au/privacy`
- **Terms of service:** leave blank unless we write one.
- **Authorised domains:** `untangledlife.com.au`

> **The privacy policy must live on the same domain as the home page.** Ours
> does. This is one of the most common rejection reasons and it is already
> handled -- don't move the policy to a Notion page or a Google Doc.

### Scopes

Add exactly one:

```
https://www.googleapis.com/auth/calendar.events
```

Read and write events, and nothing else. Not `calendar` (which also grants
calendar settings and ACLs -- sharing permissions), not `calendar.readonly`
(we need to write booked dates back).

The reviewer will ask **why a narrower scope won't do**. The answer:
`calendar.events.readonly` cannot write, and "Book it on both phones" -- writing
a shared date into each partner's calendar -- is a core feature, not an extra.

### Test users

Add your own account and Alyssa's. Up to 100 while unverified.

## 5. Create the OAuth client

**APIs & Services → Credentials → Create Credentials → OAuth client ID.**

Application type: **Web application**. Not "iOS", not "Android".

That looks wrong for a phone app and isn't. The plan is to exchange the
authorisation code **server-side in a Supabase Edge Function**, so the client
secret never ships inside the app binary. A mobile OAuth client has no secret
and cannot do that exchange. The phone opens a browser, Google redirects to our
Edge Function, and the function does the rest.

- **Authorised redirect URI:**
  `https://<your-project-ref>.supabase.co/functions/v1/google-oauth-callback`

  The project ref is the subdomain in `EXPO_PUBLIC_SUPABASE_URL` in
  `mobile/.env`. The function doesn't exist yet -- the URI just has to be
  registered before the flow is first run, and it can be added later.

Save the **client ID** and **client secret**. The secret goes into Supabase as
an Edge Function secret. **It must never appear in the repo, in `mobile/.env`,
or in anything with `EXPO_PUBLIC_` in the name** -- anything prefixed that way is
compiled into the app and readable by anyone who downloads it.

## 6. The demo video

This is the step people redo, so read it before recording.

An **unlisted YouTube video** (not private -- the reviewer must be able to open
it without requesting access) showing:

1. Starting from the app, tapping whatever begins the Google connection.
2. The Google consent screen, with **"Untangled Life" visible** on it.
3. **The browser address bar, legible, showing the OAuth client ID** in the URL.
   This is the requirement everyone misses. If the address bar is cropped out,
   the submission bounces. Record in a desktop browser with the address bar
   visible if the phone flow makes this hard.
4. Granting consent.
5. Back in the app: calendar events actually appearing, and a booked date being
   written back. Show the scope *doing something*, not just being granted.

Narration isn't required but helps. Keep it under about three minutes.

**Record this after the sync feature is built** -- it has to show real
functionality. Steps 1–5 above can all be done today; this one waits.

## 7. Submit

OAuth consent screen → **Publish app** → **Prepare for verification**.

Fill in the scope justification (see §4) and the video link. Then wait 3–5
business days. Google often comes back with one clarifying question; answer it
quickly, because the clock restarts each time.

---

## Checklist

- [ ] Cloud project created, owned by the right account
- [ ] Calendar API enabled
- [ ] `untangledlife.com.au` verified in Search Console
- [ ] Consent screen filled in, logo uploaded
- [ ] Scope: `calendar.events` only
- [ ] Test users added
- [ ] Web application OAuth client created, secret stored somewhere safe
- [ ] _(after the sync is built)_ Demo video recorded and uploaded unlisted
- [ ] Submitted for verification

---

## Two things that will bite

**The unverified-app warning is not a bug.** Until verification comes back,
everyone -- including you -- sees a "Google hasn't verified this app" interstitial
with the real button hidden behind *Advanced → Go to Untangled Life (unsafe)*.
That is expected, it goes away on approval, and it is not worth a support email.

**The 100-user cap is on distinct accounts, ever.** Not concurrent. Burning
through it with throwaway test accounts is permanent for that project.

## Sources

- [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- [OAuth App Verification Help Center](https://support.google.com/cloud/answer/13463073)
- [OAuth 2.0 Scopes for Google APIs](https://developers.google.com/identity/protocols/oauth2/scopes)
- [Google Calendar API auth](https://developers.google.com/workspace/calendar/api/auth)
