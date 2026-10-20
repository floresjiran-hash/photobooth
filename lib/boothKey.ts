import { supabase } from "@/lib/supabase";

export type KeyInfo = { key: string; label: string | null; expires_at: string | null; event_code: string; days: number };
const K = "booth_key";

export const getBoothKey = () => (typeof window === "undefined" ? null : localStorage.getItem(K));
export const setBoothKey = (key: string) => localStorage.setItem(K, key);
export const clearBoothKey = () => localStorage.removeItem(K);

export async function checkBoothKey(key: string, activate: boolean): Promise<{ ok: true; info: KeyInfo } | { ok: false; error: string; network?: boolean }> {
  try {
    const res = await fetch("/api/keys/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, activate }) });
    const j = await res.json();
    if (!res.ok || !j.ok) return { ok: false, error: j.error ?? "Invalid key" };
    return { ok: true, info: j };
  } catch {
    return { ok: false, error: "Couldn't reach the server", network: true };
  }
}

/** Headers that prove who is calling the server: the owner's login, or a renter's key. Null = not signed in. */
export async function staffHeaders(): Promise<Record<string, string> | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return { Authorization: `Bearer ${data.session.access_token}` };
  const key = getBoothKey();
  return key ? { "x-booth-key": key } : null;
}

export async function staffAction(body: Record<string, unknown>): Promise<string | null> {
  const h = await staffHeaders();
  if (!h) return "Not signed in";
  const res = await fetch("/api/staff", { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify(body) });
  if (res.ok) return null;
  return (await res.json().catch(() => ({}))).error ?? "Something went wrong";
}
