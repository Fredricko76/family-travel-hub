# Family Travel Hub · technical spike

Proves the riskiest slice of the product end to end: sign in, upload a booking PDF or image,
have Claude turn it into itinerary items, review them, and see them land on the day-by-day plan.

```
apps/mobile/                 Expo (React Native) app for iOS and Android
supabase/migrations/         Postgres schema, roles, row-level security, storage bucket
supabase/functions/
  extract-document/          Edge Function: file → Claude → schema-validated JSON → extractions row
```

The product blueprint this implements lives at
https://claude.ai/code/artifact/d8ed762d-aef1-4f7b-80e9-249e60e0c2f0

## 1. Supabase project

A hosted project already exists: **family-travel-hub** (ref `rcjmutmefhbkajkovovt`, Sydney region).
Both migrations are applied and the `extract-document` function is deployed.

One thing remains, because secrets cannot be set through the API connection: give the function
your Claude API key. Either in the dashboard (Edge Functions → Secrets) or with the CLI:

```bash
npm install -g supabase
supabase login
supabase link --project-ref rcjmutmefhbkajkovovt
cp supabase/.env.example supabase/.env      # fill in ANTHROPIC_API_KEY
supabase secrets set --env-file supabase/.env
```

For the spike, turn off email confirmation so sign-up works instantly:
Supabase dashboard → Authentication → Providers → Email → "Confirm email" off.

To redeploy after changing the function or schema:

```bash
supabase db push
supabase functions deploy extract-document
```

## 2. Mobile app

`apps/mobile/.env` is already filled in with the project URL and publishable key.

```bash
cd apps/mobile
npm install
npx expo start
```

Scan the QR code with Expo Go on a phone, or press `a` / `i` for an emulator.
`expo-file-system` and `expo-document-picker` both work in Expo Go, so no custom build is needed yet.

## 3. Try it

1. Create an account and sign in.
2. Create a trip with a date range that covers a real booking you have.
3. Tap **Upload a booking** and pick a flight or hotel confirmation PDF (or a screenshot).
4. Wait a few seconds. A review card shows what Claude found, with any warnings.
5. Untick or edit items, then **Add to itinerary**. They appear under the matching day.

## How extraction works

- The app inserts a `documents` row, uploads the file to the private `documents` bucket
  under `<trip_id>/<document_id>.<ext>`, then calls the `extract-document` function.
- The function verifies the caller's session, reads the document through row-level security
  (so only trip members can reach it), checks the caller is an owner or editor, downloads the file,
  and sends it to Claude Opus 5 as a PDF or image block with a JSON schema in `output_config.format`.
- The reply is guaranteed to match `supabase/functions/extract-document/schema.ts`.
  It is stored in `extractions` for audit, and the document becomes `ready_for_review`.
- Accepting writes `itinerary_items` with an absolute `starts_at` plus the IANA zone to display in,
  so a Melbourne viewer sees Bali arrivals in Bali time.

Cost: a two- or three-page confirmation is roughly 5 to 10 cents at Opus 5 rates.
The function opts into Anthropic's server-side fallback, so a rare safety decline re-runs on another
model instead of failing.

## Roles

`trip_members.role` is `owner`, `editor` or `viewer`; `is_traveller` says who is on the trip.
Every policy in the migration derives from `trip_role_of()`, so adding a table later means
one `can_view_trip()` / `can_edit_trip()` check, not a new permission system.

## What is deliberately not here yet

Check-ins, photos, invites, push notifications, offline cache, the AI assistant.
The schema leaves room for them (see the blueprint's data model), and the Realtime subscription in
`TripScreen` already refreshes the plan when another member changes it.
