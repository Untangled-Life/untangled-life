# Untangled Life — waitlist landing page

Next.js (App Router, TypeScript, Tailwind v4) waitlist page for Untangled Life, a couples shared-calendar app.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Supabase setup (required for signups to work)

1. Create a Supabase project (or use an existing one).
2. In the Supabase SQL editor, run `supabase/waitlist.sql` — it creates the `waitlist` table and an insert-only Row Level Security policy (the anon key can add signups but can never read them back, even if the key leaks).
3. Copy `.env.local.example` to `.env.local` and fill in:
   - `SUPABASE_URL` — your project's URL
   - `SUPABASE_ANON_KEY` — your project's anon/public API key

   Both are read only in the server-side `/api/waitlist` route handler and are never exposed to the client.
4. Restart `npm run dev` after adding `.env.local`.

## Structure

- `src/app/page.tsx` — the landing page
- `src/components/waitlist-form.tsx` — the signup form (name, email, shared-calendar question)
- `src/app/api/waitlist/route.ts` — API route that validates input and inserts into Supabase
- `supabase/waitlist.sql` — table schema + RLS policy to run in Supabase

## Deploying

Not yet deployed. Planned: push to GitHub, deploy on Vercel, point `untangledlife.com.au` at it.
