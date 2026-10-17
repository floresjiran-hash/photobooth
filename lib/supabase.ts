import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const BUCKET = "photo-booth-photos";
export const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "";

export type Photo = {
  id: string;
  session_id: string;
  shot_index: number;
  image_url: string;
  storage_path: string;
  filter: string;
  watermarked: boolean;
  created_at: string;
};
