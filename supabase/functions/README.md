# Edge Functions

## notify-partner

Sends a push to the other partner when one of them books a date or adds a key
date. Everything below is one-time setup.

### 1. Deploy the function

Needs the Supabase CLI, logged in and linked to the project:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase functions deploy notify-partner
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically -- you
don't set those yourself.

### 2. Expo access token (optional)

Only needed if "Enhanced Security for Push Notifications" is switched on in the
Expo account. If it is:

```bash
npx supabase secrets set EXPO_ACCESS_TOKEN=<token from expo.dev account settings>
```

Without it the function still sends fine, it just doesn't set an auth header.

### 3. Three database webhooks

In the Supabase dashboard under **Database → Webhooks**. All three point at the
same function.

| | Webhook 1 | Webhook 2 | Webhook 3 |
|---|---|---|---|
| Table | `planned_events` | `planned_events` | `key_dates` |
| Events | Insert | **Update** | Insert |
| Type | Supabase Edge Functions | Supabase Edge Functions | Supabase Edge Functions |
| Function | `notify-partner` | `notify-partner` | `notify-partner` |
| Method | POST | POST | POST |
| Header | `Authorization: Bearer <service role key>` | same | same |

The function reads `payload.table` and `payload.type` to work out which message
to send, which is why all three can share one function.

Webhook 2 is the one that makes an edit reach the other phone: it fires on
every update, the function works out from `old_record` whether anything worth
mentioning actually changed, and the app syncs on receiving the push. **It can
be created as one webhook with both Insert and Update ticked** -- two rows are
shown above only because the events column differs.

A note on why updates are filtered in the function rather than the webhook: an
update fires on every write, including a push toggle or a note nobody needs to
hear about. The webhook config can't express "only if the time changed", so
`describeChange()` does it, and returns `null` for the rest. Saying "Roy
changed Dinner" when Roy ticked a checkbox is how people learn to ignore
notifications.

### Why a webhook and not a Postgres trigger

A trigger would have to hold the service role key in the database itself. A
dashboard webhook keeps that key in the webhook config instead, where it isn't
readable from SQL.

### Checking it works

`supabase functions logs notify-partner` shows each invocation. The function
returns `{"skipped": "..."}` rather than failing when there's nothing to do --
no partner paired yet, partner has no push token, the row was a cancellation.
Those are normal, not errors.

---

## nudge-date -- the daily sweep

Nothing triggers this one. `notify-partner` reacts to a row changing;
`nudge-date` has to notice that *nothing* has changed, which no webhook can
tell you. It runs once a day and asks the database which couples have drifted.

**The rule, in `couples_due_a_nudge()`** (`supabase/date-nudge.sql`): nothing
booked in the next fortnight, nothing planned in the last fortnight, and not
nudged in the last fortnight. All three, or it stays quiet. It mirrors
`mobile/lib/dateNudge.ts`, which decides the wording of the card on Home --
**if you change one, change the other**, or the app contradicts itself.

Both partners get the same message. A nudge that goes to one of them casts that
person as the one who forgot and the other as the one who has to be booked,
which is a claim this app has no business making about anybody's relationship.

### Deploying

```
supabase functions deploy nudge-date
```

### Scheduling

The endpoint checks for the service role key in the Authorization header and
401s without it, so it can be scheduled from anywhere that can hold a secret.
In the Supabase dashboard: **Integrations -> Cron -> Create job**.

| Field | Value |
| --- | --- |
| Name | `date-nudge-daily` |
| Schedule | `0 8 * * *` (08:00 UTC, so 6pm or 7pm in Sydney depending on the season) |
| Type | Supabase Edge Function |
| Function | `nudge-date` |
| Headers | `Authorization: Bearer <service role key>` |

Evening on purpose. A nudge to plan a date that arrives at nine on a Tuesday
morning is one you read on the way into work and have forgotten by lunchtime.

The hour is UTC, so it drifts an hour against Sydney across daylight saving.
Worth revisiting only once there are people using it outside one country, at
which point the right answer is per-user scheduling rather than a smarter cron.

### Checking it works

`supabase functions logs nudge-date` shows `{"nudged": n, "pushed": m}` per run.
`nudged` counts couples the rule matched; `pushed` counts the phones that
actually had a token. `nudged` higher than `pushed` is normal -- it means
somebody has not granted notifications.

A couple is stamped as nudged whether or not either phone had a token. Without
that, a couple with notifications off is "due" every single day, and the moment
one of them ever registers a token they get a nudge about a fortnight that
ended months ago.
