"use client";
import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, LogOut, Plus } from "lucide-react";
import { supabase, ADMIN_EMAIL } from "@/lib/supabase";

type Row = { id: string; key: string; label: string | null; days: number; gallery_code: string; activated_at: string | null; expires_at: string | null; revoked: boolean; created_at: string };

const fmt = (s: string | null) => (s ? new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "-");
function status(r: Row): [string, string] {
  if (r.revoked) return ["Disabled", "bg-red-100 text-red-700"];
  if (!r.activated_at) return [`Unused · ${r.days} day${r.days > 1 ? "s" : ""}`, "bg-sky-100 text-sky-700"];
  const ms = new Date(r.expires_at!).getTime() - Date.now();
  if (ms <= 0) return ["Expired", "bg-ink/10 text-ink/60"];
  const d = Math.ceil(ms / 86400000);
  return [`Active · ${d} day${d > 1 ? "s" : ""} left`, "bg-emerald-100 text-emerald-700"];
}

export default function OwnerKeys() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [label, setLabel] = useState("");
  const [days, setDays] = useState(3);
  const [count, setCount] = useState(1);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState("");

  const api = useCallback(async (method: string, body?: unknown) => {
    const { data } = await supabase.auth.getSession();
    const res = await fetch("/api/booth?r=owner/keys", { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let j: Record<string, any> = {};
    try { j = JSON.parse(text); } catch { /* not JSON */ }
    if (!res.ok) throw new Error(j.error ?? `Server answered ${res.status}${res.status === 404 ? ": the file app/api/booth/route.ts is missing on this site" : `: ${text.slice(0, 120)}`}`);
    return j;
  }, []);
  const load = useCallback(async () => { try { setRows((await api("GET")).keys); setMsg(""); } catch (e) { setMsg((e as Error).message); } }, [api]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (signedIn) load(); }, [signedIn, load]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: pin });
    setLoginError(error ? "That PIN didn't work." : "");
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try { await api("POST", { label, days, count }); setLabel(""); await load(); } catch (er) { setMsg((er as Error).message); }
  }
  async function act(body: Record<string, unknown>) { try { await api("PATCH", body); await load(); } catch (er) { setMsg((er as Error).message); } }
  async function copy(text: string, id: string) { await navigator.clipboard.writeText(text).catch(() => {}); setCopied(id); setTimeout(() => setCopied(""), 1500); }

  if (signedIn === null) return <div className="grid min-h-screen place-items-center">Loading…</div>;
  if (!signedIn)
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <form onSubmit={login} className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-xl">
          <KeyRound className="text-cobalt" />
          <h1 className="mt-3 font-display text-3xl font-bold">Owner PIN</h1>
          <input type="password" inputMode="numeric" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} aria-label="Owner PIN"
            className="mt-5 w-full rounded-xl border-2 border-ink/15 px-4 py-3 text-center text-2xl tracking-[0.4em] outline-none focus:border-cobalt" />
          {loginError && <p role="alert" className="mt-3 text-sm text-red-600">{loginError}</p>}
          <button disabled={pin.length < 6} className="mt-5 w-full rounded-full bg-cobalt py-3 font-semibold text-white disabled:opacity-40">Sign in</button>
        </form>
      </main>
    );

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-4xl font-extrabold">Rental keys</h1>
        <button onClick={() => supabase.auth.signOut()} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold shadow"><LogOut size={16} /> Sign out</button>
      </div>

      <form onSubmit={create} className="rounded-3xl bg-white p-6 shadow">
        <h2 className="font-semibold">Make a new key</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Renter or event name (optional)" className="rounded-xl border-2 border-ink/15 px-4 py-2" />
          <label className="flex items-center gap-2 text-sm">Days <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(+e.target.value)} className="w-20 rounded-xl border-2 border-ink/15 px-3 py-2" /></label>
          <label className="flex items-center gap-2 text-sm">Keys <input type="number" min={1} max={20} value={count} onChange={(e) => setCount(+e.target.value)} className="w-16 rounded-xl border-2 border-ink/15 px-3 py-2" /></label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {[1, 2, 3, 7, 14, 30].map((d) => <button type="button" key={d} onClick={() => setDays(d)} className={`rounded-full border-2 px-3 py-1 text-sm font-semibold ${days === d ? "border-cobalt bg-cobalt text-white" : "border-ink/15"}`}>{d} day{d > 1 ? "s" : ""}</button>)}
          <button className="ml-auto inline-flex items-center gap-2 rounded-full bg-sodium px-5 py-2 font-bold"><Plus size={16} /> Generate</button>
        </div>
        <p className="mt-2 text-xs text-ink/60">The days start counting the first time the renter uses the key.</p>
      </form>
      {msg && <p role="alert" className="mt-3 text-sm text-red-600">{msg}</p>}

      <ul className="mt-6 space-y-3">
        {rows.map((r) => {
          const [text, cls] = status(r);
          return (
            <li key={r.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => copy(r.key, r.id)} className="inline-flex items-center gap-2 rounded-xl bg-paper px-3 py-2 font-mono font-bold tracking-wider" title="Copy key">
                  {r.key} <Copy size={14} /> {copied === r.id && <span className="text-xs font-sans font-semibold text-cobalt">Copied</span>}
                </button>
                <span className="font-semibold">{r.label || "No name"}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>{text}</span>
              </div>
              <p className="mt-2 text-xs text-ink/60">Started: {fmt(r.activated_at)} · Ends: {fmt(r.expires_at)}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
                <button onClick={() => copy(`${location.origin}/gallery?e=${r.gallery_code}`, `g${r.id}`)} className="rounded-full border-2 border-ink/15 px-3 py-1">{copied === `g${r.id}` ? "Copied" : "Copy gallery link"}</button>
                <button onClick={() => { const n = Number(prompt("Add how many days?", "1")); if (n >= 1) act({ id: r.id, action: "extend", days: n }); }} className="rounded-full border-2 border-ink/15 px-3 py-1">Add days</button>
                <button onClick={() => act({ id: r.id, action: r.revoked ? "restore" : "revoke" })} className="rounded-full border-2 border-ink/15 px-3 py-1">{r.revoked ? "Enable" : "Disable"}</button>
                <button onClick={async () => { if (confirm("Delete this key? Photos stay in the gallery.")) { try { await api("DELETE", { id: r.id }); await load(); } catch (er) { setMsg((er as Error).message); } } }} className="rounded-full border-2 border-red-300 px-3 py-1 text-red-600">Delete</button>
              </div>
            </li>
          );
        })}
        {!rows.length && <li className="py-10 text-center text-ink/60">No keys yet. Make one above.</li>}
      </ul>
    </main>
  );
}