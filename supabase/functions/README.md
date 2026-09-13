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

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — you
don't set those yourself.

### 2. Expo access token (optional)

Only needed if "Enhanced Security for Push Notifications" is switched on in the
Expo account. If it is:

```bash
npx supabase secrets set EXPO_ACCESS_TOKEN=<token from expo.dev account settings>
```

Without it the function still sends fine, it just doesn't set an auth header.

### 3. Two database webhooks

In the Supabase dashboard under **Database → Webhooks**, create one webhook per
table. Both point at the same function.

| | Webhook 1 | Webhook 2 |
|---|---|---|
| Table | `planned_events` | `key_dates` |
| Events | Insert | Insert |
| Type | Supabase Edge Functions | Supabase Edge Functions |
| Function | `notify-partner` | `notify-partner` |
| Method | POST | POST |
| Header | `Authorization: Bearer <service role key>` | same |

The function reads `payload.table` to work out which message to send, which is
why both webhooks can share one function.

### Why a webhook and not a Postgres trigger

A trigger would have to hold the service role key in the database itself. A
dashboard webhook keeps that key in the webhook config instead, where it isn't
readable from SQL.

### Checking it works

`supabase functions logs notify-partner` shows each invocation. The function
returns `{"skipped": "..."}` rather than failing when there's nothing to do —
no partner paired yet, partner has no push token, the row was a cancellation.
Those are normal, not errors.
