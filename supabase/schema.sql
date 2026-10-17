-- Run in Supabase > SQL Editor

create extension if not exists "pgcrypto";

create table if not exists public.photos (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null,
  shot_index   smallint not null default 1,
  image_url    text not null,
  storage_path text not null,
  filter       text not null default 'none',
  watermarked  boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists photos_created_idx on public.photos (created_at desc);
create index if not exists photos_session_idx on public.photos (session_id);

alter table public.photos enable row level security;

-- Anyone can browse the gallery
create policy "photos readable by everyone" on public.photos
  for select to anon, authenticated using (true);
-- Only the signed-in admin can create / change / remove rows
-- (disable public sign-ups in Auth settings so "authenticated" means admin)
create policy "photos insert admin" on public.photos
  for insert to authenticated with check (true);
create policy "photos update admin" on public.photos
  for update to authenticated using (true) with check (true);
create policy "photos delete admin" on public.photos
  for delete to authenticated using (true);

-- Storage bucket (public read so <img> and the canvas editor can load files)
insert into storage.buckets (id, name, public)
values ('photo-booth-photos', 'photo-booth-photos', true)
on conflict (id) do nothing;

create policy "booth photos public read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'photo-booth-photos');
create policy "booth photos admin upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'photo-booth-photos');
create policy "booth photos admin update" on storage.objects
  for update to authenticated using (bucket_id = 'photo-booth-photos');
create policy "booth photos admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'photo-booth-photos');

-- Realtime for the live gallery feed
alter publication supabase_realtime add table public.photos;
