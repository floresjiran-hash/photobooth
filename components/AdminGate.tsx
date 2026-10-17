"use client";
import { useEffect, useState } from "react";
import { Lock, LogOut } from "lucide-react";
import { supabase, ADMIN_EMAIL } from "@/lib/supabase";

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: pin });
    if (error) setError("That PIN didn't work. Try again.");
    setBusy(false);
  }

  if (signedIn === null) return <div className="min-h-screen grid place-items-center">Loading…</div>;

  if (!signedIn)
    return (
      <main className="min-h-screen grid place-items-center p-6">
        <form onSubmit={login} className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-xl">
          <Lock className="text-cobalt" />
          <h1 className="font-display text-3xl font-bold mt-3">Operator PIN</h1>
          <input
            type="password" inputMode="numeric" autoFocus value={pin} onChange={(e) => setPin(e.target.value)}
            className="mt-5 w-full rounded-xl border-2 border-ink/15 px-4 py-3 text-2xl tracking-[0.4em] text-center focus:border-cobalt outline-none"
            aria-label="Admin PIN"
          />
          {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
          <button disabled={busy || pin.length < 6} className="mt-5 w-full rounded-full bg-cobalt py-3 font-semibold text-white disabled:opacity-40">
            {busy ? "Checking…" : "Unlock booth"}
          </button>
        </form>
      </main>
    );

  return (
    <>
      <button onClick={() => supabase.auth.signOut()} className="fixed right-4 top-4 z-40 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold shadow">
        <LogOut size={16} /> Lock
      </button>
      {children}
    </>
  );
}
