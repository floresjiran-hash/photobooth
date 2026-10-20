import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { BUCKET, checkKey, getOwner, getStaff, serverDb } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I so keys are easy to read out loud
const pick = (n: number) => Array.from(randomBytes(n), (b) => ALPHA[b % ALPHA.length]).join("");
const UUID = /^[0-9a-f-]{36}$/i;

// POST /api/booth?r=keys/validate  { key, activate }
async function validate(req: Request) {
  const { key, activate } = await req.json().catch(() => ({}));
  if (typeof key !== "string" || !key) return json({ ok: false, error: "Enter a key" }, 400);
  const r = await checkKey(serverDb(), key, activate !== false);
  if (!r.ok) return json({ ok: false, error: r.reason }, 403);
  return json({ ok: true, key: r.row.key, label: r.row.label, expires_at: r.row.expires_at, event_code: r.row.gallery_code, days: r.row.days });
}

// POST /api/booth?r=upload  (multipart: file, sessionId, index, filter, watermarked)
async function upload(req: Request) {
  const db = serverDb(), who = await getStaff(req, db);
  if ("error" in who) return json({ error: who.error }, who.status);
  const form = await req.formData();
  const file = form.get("file"), sessionId = String(form.get("sessionId") ?? ""), index = Number(form.get("index"));
  if (!(file instanceof File) || file.size > 6 * 1024 * 1024 || !UUID.test(sessionId) || !(index >= 1 && index <= 12)) return json({ error: "Bad upload" }, 400);
  const path = `${sessionId}/${index}.jpg`;
  const { error } = await db.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: "image/jpeg", upsert: false });
  if (error) return json({ error: error.message }, 500);
  const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const { error: dbError } = await db.from("photos").insert({
    session_id: sessionId, shot_index: index, image_url: url, storage_path: path,
    filter: String(form.get("filter") ?? "none").slice(0, 20), watermarked: form.get("watermarked") === "true",
    key_id: who.staff.kind === "key" ? who.staff.row.id : null, event_code: who.staff.kind === "key" ? who.staff.row.gallery_code : null,
  });
  if (dbError) return json({ error: dbError.message }, 500);
  return json({ url });
}

// POST /api/booth?r=staff  { action: "unlock" | "lock" | "delete", sessionId?, id? }   (renters can only touch their own photos)
async function staff(req: Request) {
  const db = serverDb(), who = await getStaff(req, db);
  if ("error" in who) return json({ error: who.error }, who.status);
  const { action, sessionId, id } = await req.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const own = (q: any) => (who.staff.kind === "key" ? q.eq("key_id", who.staff.row.id) : q);
  if (action === "unlock" || action === "lock") {
    if (!UUID.test(String(sessionId))) return json({ error: "Bad request" }, 400);
    const { error } = await own(db.from("photos").update({ watermarked: action === "lock" }).eq("session_id", sessionId));
    return error ? json({ error: error.message }, 500) : json({ ok: true });
  }
  if (action === "delete") {
    if (!UUID.test(String(id))) return json({ error: "Bad request" }, 400);
    const { data: ph } = await own(db.from("photos").select("id, storage_path").eq("id", id)).maybeSingle();
    if (!ph) return json({ error: "Photo not found" }, 404);
    await db.storage.from(BUCKET).remove([ph.storage_path]);
    await db.from("photos").delete().eq("id", id);
    return json({ ok: true });
  }
  return json({ error: "Unknown action" }, 400);
}

// /api/booth?r=owner/keys  GET list, POST create, PATCH revoke/restore/extend, DELETE
async function ownerKeys(req: Request) {
  const db = serverDb();
  if (!(await getOwner(req, db))) return json({ error: "Owner only" }, 401);
  if (req.method === "GET") {
    const { data, error } = await db.from("booth_keys").select("*").order("created_at", { ascending: false });
    return error ? json({ error: error.message }, 500) : json({ keys: data });
  }
  const body = await req.json().catch(() => ({}));
  if (req.method === "POST") {
    const days = Math.round(Number(body.days)), count = Math.min(20, Math.max(1, Math.round(Number(body.count) || 1)));
    if (!(days >= 1 && days <= 365)) return json({ error: "Days must be between 1 and 365" }, 400);
    const label = String(body.label ?? "").trim().slice(0, 80) || null;
    const rows = Array.from({ length: count }, () => ({ key: `BOOTH-${pick(4)}-${pick(4)}-${pick(4)}`, label, days, gallery_code: pick(6).toLowerCase() }));
    const { data, error } = await db.from("booth_keys").insert(rows).select();
    return error ? json({ error: error.message }, 500) : json({ keys: data });
  }
  const id = String(body.id ?? "");
  if (!UUID.test(id)) return json({ error: "Bad request" }, 400);
  if (req.method === "DELETE") { await db.from("booth_keys").delete().eq("id", id); return json({ ok: true }); }
  if (req.method === "PATCH") {
    if (body.action === "revoke" || body.action === "restore") { await db.from("booth_keys").update({ revoked: body.action === "revoke" }).eq("id", id); return json({ ok: true }); }
    if (body.action === "extend") {
      const n = Math.round(Number(body.days));
      if (!(n >= 1 && n <= 365)) return json({ error: "Days must be between 1 and 365" }, 400);
      const { data: row } = await db.from("booth_keys").select("*").eq("id", id).maybeSingle();
      if (!row) return json({ error: "Key not found" }, 404);
      const patch = row.activated_at
        ? { expires_at: new Date(Math.max(Date.now(), new Date(row.expires_at).getTime()) + n * 86400000).toISOString() } // add time to the end date (or from today if it already ended)
        : { days: Math.min(365, row.days + n) };
      await db.from("booth_keys").update(patch).eq("id", id);
      return json({ ok: true });
    }
  }
  return json({ error: "Unknown action" }, 400);
}

// One endpoint for everything: /api/booth?r=keys/validate | upload | staff | owner/keys
async function handler(req: Request) {
  try {
    const route = `${req.method} ${new URL(req.url).searchParams.get("r") ?? ""}`;
    if (route === "POST keys/validate") return await validate(req);
    if (route === "POST upload") return await upload(req);
    if (route === "POST staff") return await staff(req);
    if (route.endsWith(" owner/keys")) return await ownerKeys(req);
    return json({ error: "Not found" }, 404);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
