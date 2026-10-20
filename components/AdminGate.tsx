"use client";
import { useEffect, useState } from "react";
import { Copy, KeyRound, Lock, LogOut } from "lucide-react";
import { supabase, ADMIN_EMAIL } from "@/lib/supabase";
import { checkBoothKey, clearBoothKey, getBoothKey, setBoothKey, type KeyInfo } from "@/lib/boothKey";

const daysLeft = (iso: string | null) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)) : null);

/** Opens the capture station for the owner (PIN) or for a renter (rental key). An expired key locks the booth. */
export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "out" | "owner" | "key">("loading");
  const [info, setInfo] = useState<KeyInfo | null>(null);
  const [tab, setTab] = useState<"key" | "owner">("key");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) return setState("owner");
      const k = getBoothKey();
      if (k) {
        const r = await checkBoothKey(k, false);
        if (r.ok) { setInfo(r.info); return setState("key"); }
        if (r.network) { setError(r.error); return setState("out"); }
        clearBoothKey(); setError(r.error);
      }
      setState("out");
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (s) setState("owner"); });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => { // re-check every minute so an expired or disabled key locks the booth
    if (state !== "key") return;
    const t = setInterval(async () => {
      const k = getBoothKey();
      const r = k ? await checkBoothKey(k, false) : null;
      if (r && !r.ok && r.network) return; // a wifi blip must not lock the booth
      if (!r || !r.ok) { clearBoothKey(); setError(r ? r.error : "Signed out"); setState("out"); } else setInfo(r.info);
    }, 60000);
    return () => clearInterval(t);
  }, [state]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    if (tab === "key") {
      const r = await checkBoothKey(value, true);
      if (r.ok) { setBoothKey(r.info.key); setInfo(r.info); setState("key"); setValue(""); } else setError(r.error);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: value });
      if (error) setError("That PIN didn't work. Try again.");
    }
    setBusy(false);
  }

  async function lock() { clearBoothKey(); await supabase.auth.signOut(); setInfo(null); setState("out"); }

  if (state === "loading") return <div className="grid min-h-screen place-items-center">Loading…</div>;

  if (state === "out")
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-xl">
          <div className="flex gap-1 rounded-full bg-paper p-1 text-sm font-semibold">
            <button type="button" onClick={() => { setTab("key"); setError(""); setValue(""); }} className={`flex-1 rounded-full py-2 ${tab === "key" ? "bg-ink text-white" : ""}`}>Rental key</button>
            <button type="button" onClick={() => { setTab("owner"); setError(""); setValue(""); }} className={`flex-1 rounded-full py-2 ${tab === "owner" ? "bg-ink text-white" : ""}`}>Owner PIN</button>
          </div>
          {tab === "key" ? <KeyRound className="mt-6 text-cobalt" /> : <Lock className="mt-6 text-cobalt" />}
          <h1 className="mt-3 font-display text-3xl font-bold">{tab === "key" ? "Enter your key" : "Owner PIN"}</h1>
          <input
            type={tab === "key" ? "text" : "password"} inputMode={tab === "key" ? "text" : "numeric"} autoFocus autoCapitalize="characters" value={value}
            onChange={(e) => setValue(tab === "key" ? e.target.value.toUpperCase() : e.target.value)}
            placeholder={tab === "key" ? "BOOTH-XXXX-XXXX-XXXX" : ""}
            className={`mt-5 w-full rounded-xl border-2 border-ink/15 px-4 py-3 text-center outline-none focus:border-cobalt ${tab === "key" ? "font-mono text-lg tracking-wider" : "text-2xl tracking-[0.4em]"}`}
            aria-label={tab === "key" ? "Rental key" : "Owner PIN"}
          />
          {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
          <button disabled={busy || (tab === "key" ? value.length < 8 : value.length < 6)} className="mt-5 w-full rounded-full bg-cobalt py-3 font-semibold text-white disabled:opacity-40">
            {busy ? "Checking…" : "Unlock booth"}
          </button>
        </form>
      </main>
    );

  const left = daysLeft(info?.expires_at ?? null);
  const gallery = typeof window !== "undefined" && info ? `${location.origin}/gallery?e=${info.event_code}` : "";
  return (
    <>
      {state === "key" && info && (
        <div className="fixed left-4 top-4 z-40 flex items-center gap-3 rounded-full bg-white px-4 py-2 text-sm shadow">
          <span className="font-semibold">{info.label || "Rental"}</span>
          <span className={left !== null && left <= 1 ? "font-semibold text-red-600" : "text-ink/70"}>{left === null ? "starts on first use" : left === 0 ? "ends today" : `${left} day${left > 1 ? "s" : ""} left`}</span>
          <button onClick={async () => { await navigator.clipboard.writeText(gallery).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="inline-flex items-center gap-1 rounded-full bg-paper px-3 py-1 font-semibold" title="Copy your gallery link">
            <Copy size={14} /> {copied ? "Copied" : "Gallery link"}
          </button>
        </div>
      )}
      <button onClick={lock} className="fixed right-4 top-4 z-40 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold shadow">
        <LogOut size={16} /> Lock
      </button>
      {children}
    </>
  );
}
