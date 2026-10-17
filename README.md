# Photo Booth (Next.js + Supabase)

## Setup
1. `npm install`
2. Create a Supabase project, then run `supabase/schema.sql` in the SQL Editor.
3. Supabase > Authentication: create ONE user (email = NEXT_PUBLIC_ADMIN_EMAIL, password = your 6+ character PIN, auto-confirm) and **turn off "Allow new users to sign up"**.
4. `cp .env.local.example .env.local` and fill in the URL + anon key.
5. Put your GCash QR image at `public/gcash-qr.png`.
6. `npm run dev` -> /admin (capture), /gallery, /editor/[id].

## Deploy
Push to GitHub, import in Vercel, add the same env vars. Camera access needs HTTPS (Vercel provides it; localhost also works).
