"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Copy, ImageUp, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { staffAction, staffHeaders } from "@/lib/boothKey";

const PRICE = process.env.NEXT_PUBLIC_PRICE_PHP ?? "35";
const GCASH_NUMBER = process.env.NEXT_PUBLIC_GCASH_NUMBER ?? "09397790650";

type Props = { photoId: string; sessionId: string; onClose: () => void; onRefresh: () => void };

export default function PaymentModal({ photoId, sessionId, onClose, onRefresh }: Props) {
  const [isStaff, setIsStaff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hasQr, setHasQr] = useState(true);
  const [copied, setCopied] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    staffHeaders().then((h) => setIsStaff(!!h)); // the owner, or a renter with a valid key
    const t = setInterval(onRefresh, 4000);
    return () => clearInterval(t);
  }, [onRefresh]);

  useEffect(() => {
    if (!file) return setPreview("");
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    setError("");
    const f = e.target.files?.[0];
    if (!f) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) return setError("Please choose a PNG or JPG screenshot.");
    if (f.size > 5 * 1024 * 1024) return setError("That image is too big (max 5 MB).");
    setFile(f);
  }

  async function submitProof() {
    if (!file) return;
    setBusy(true);
    setError("");
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${sessionId}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("payment-proofs").upload(path, file, { contentType: file.type });
    if (upErr) { setBusy(false); return setError("Upload failed. Please try again."); }
    const { error: rpcErr } = await supabase.rpc("unlock_with_proof", { p_session: sessionId, p_path: path });
    setBusy(false);
    if (rpcErr) return setError("Couldn't unlock the photo. Please ask the attendant.");
    onRefresh();
    onClose();
  }

  async function confirm() {
    setBusy(true);
    setError("");
    const err = await staffAction({ action: "unlock", sessionId });
    setBusy(false);
    if (err) return setError(err);
    onRefresh();
  }

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(GCASH_NUMBER);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-auto bg-ink/70 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 rounded-full p-2 hover:bg-ink/5"><X size={18} /></button>
        <h2 className="font-display text-2xl font-bold">Pay ₱{PRICE} with GCash</h2>

        {hasQr && (
          <img src="/gcash-qr.png" alt="GCash payment QR code" onError={() => setHasQr(false)}
            className="mx-auto mt-4 size-48 rounded-xl border object-contain" />
        )}

        <p className="mt-4 text-sm text-ink/70">1. Send ₱{PRICE} to this GCash number:</p>
        <button onClick={copyNumber} className="mt-2 inline-flex items-center gap-2 rounded-xl bg-paper px-4 py-3 font-display text-2xl font-bold tracking-wide">
          {GCASH_NUMBER} <Copy size={18} aria-hidden />
        </button>
        <p className="h-4 text-xs text-cobalt">{copied ? "Copied!" : ""}</p>

        <p className="mt-2 text-sm text-ink/70">2. Upload a screenshot of your payment:</p>
        <label className="mt-2 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-ink/25 p-4 hover:bg-paper">
          {preview ? <img src={preview} alt="Your screenshot" className="max-h-40 rounded-lg" /> : <ImageUp className="text-cobalt" />}
          <span className="text-sm font-semibold">{file ? "Choose a different image" : "Choose screenshot"}</span>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={pick} className="sr-only" />
        </label>
        {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}

        <button onClick={submitProof} disabled={!file || busy}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-cobalt py-3 font-bold text-white disabled:opacity-40">
          {busy ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />} Submit and remove watermark
        </button>
        <p className="mt-2 text-xs text-ink/50">Reference: #{photoId.slice(0, 6)}</p>

        {isStaff && (
          <button onClick={confirm} disabled={busy} className="mt-3 w-full rounded-full bg-sodium py-2 text-sm font-bold">
            Staff: mark as paid without screenshot
          </button>
        )}
      </div>
    </div>
  );
}
