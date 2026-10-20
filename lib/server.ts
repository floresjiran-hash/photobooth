import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const BUCKET = "photo-booth-photos";

/** Server-only database client. Uses the secret key, so it must never be imported by client components. */
export function serverDb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type KeyRow = {
  id: string; key: string; label: string | null; days: number; gallery_code: string;
  activated_at: string | null; expires_at: string | null; revoked: boolean; created_at: string;
};

export const cleanKey = (k: string) => k.trim().toUpperCase();

/** Checks a rental key. The first successful use starts the clock: expires_at = now + days. */
export async function checkKey(db: SupabaseClient, raw: string, activate = true): Promise<{ ok: true; row: KeyRow } | { ok: false; reason: string }> {
  const { data } = await db.from("booth_keys").select("*").eq("key", cleanKey(raw)).maybeSingle();
  let row = data as KeyRow | null;
  if (!row) return { ok: false, reason: "Key not found" };
  if (row.revoked) return { ok: false, reason: "This key has been disabled" };
  if (!row.activated_at && activate) {
    const now = new Date(), exp = new Date(now.getTime() + row.days * 86400000);
    const { data: u } = await db.from("booth_keys").update({ activated_at: now.toISOString(), expires_at: exp.toISOString() }).eq("id", row.id).is("activated_at", null).select().maybeSingle();
    if (u) row = u as KeyRow; else { const { data: again } = await db.from("booth_keys").select("*").eq("id", row.id).maybeSingle(); row = (again as KeyRow) ?? row; }
  }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: "This key has expired" };
  return { ok: true, row };
}

/** The owner is the signed-in Supabase user whose email is NEXT_PUBLIC_ADMIN_EMAIL. */
export async function getOwner(req: Request, db: SupabaseClient) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /i, "");
  if (!token) return null;
  const { data } = await db.auth.getUser(token);
  const email = data.user?.email?.toLowerCase();
  return email && email === (process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "").toLowerCase() ? data.user : null;
}

export type Staff = { kind: "owner" } | { kind: "key"; row: KeyRow };

/** Who is calling: the owner (Bearer token) or a renter (x-booth-key header). */
export async function getStaff(req: Request, db: SupabaseClient): Promise<{ staff: Staff } | { error: string; status: number }> {
  if (await getOwner(req, db)) return { staff: { kind: "owner" } };
  const key = req.headers.get("x-booth-key");
  if (!key) return { error: "Not signed in", status: 401 };
  const r = await checkKey(db, key);
  if (!r.ok) return { error: r.reason, status: 403 };
  return { staff: { kind: "key", row: r.row } };
}
