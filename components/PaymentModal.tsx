"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

const PRICE = process.env.NEXT_PUBLIC_PRICE_PHP ?? "100";

type Props = { photoId: string; sessionId: string; onClose: () => void; onRefresh: () => void };

/** Shows the GCash QR (put your own image at /public/gcash-qr.png).
 *  Staff, signed in on the booth device, confirm payment, which clears the watermark. */
export default function PaymentModal({ photoId, sessionId, onClose, onRefresh }: Props) {
  const [isStaff, setIsStaff] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setIsStaff(!!data.session));
    const t = setInterval(onRefresh, 4000); // customer's screen unlocks once staff confirms
    return () => clearInterval(t);
  }, [onRefresh]);

  async function confirm() {
    setBusy(true);
    await supabase.from("photos").update({ watermarked: false }).eq("session_id", sessionId);
    setBusy(false);
    onRefresh();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 rounded-full p-2 hover:bg-ink/5"><X size={18} /></button>
        <h2 className="font-display text-2xl font-bold">Pay ₱{PRICE} with GCash</h2>
        <p className="mt-1 text-sm text-ink/70">Scan, pay, then show the receipt to the booth attendant.</p>
        <img src="/gcash-qr.png" alt="GCash payment QR code" className="mx-auto mt-4 size-60 rounded-xl border object-contain" />
        <p className="mt-2 text-xs text-ink/50">Reference: #{photoId.slice(0, 6)}</p>
        {isStaff ? (
          <button onClick={confirm} disabled={busy} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-sodium py-3 font-bold">
            <CheckCircle2 size={18} /> Payment received: remove watermark
          </button>
        ) : (
          <p className="mt-5 rounded-xl bg-paper p-3 text-sm">This screen unlocks automatically once the attendant confirms your payment.</p>
        )}
      </div>
    </div>
  );
}
