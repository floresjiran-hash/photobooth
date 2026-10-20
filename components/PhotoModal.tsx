"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Palette, Trash2, X } from "lucide-react";
import type { Photo } from "@/lib/supabase";
import { staffAction, staffHeaders } from "@/lib/boothKey";

export default function PhotoModal({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  const [origin, setOrigin] = useState("");
  const [isStaff, setIsStaff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    staffHeaders().then((h) => setIsStaff(!!h)); // the owner, or a renter with a valid key
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  async function run(body: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setError("");
    const err = await staffAction(body);
    setBusy(false);
    if (err) return setError(err);
    onClose();
  }

  const link = `${origin}/editor/${photo.id}`;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="relative grid max-h-[92vh] w-full max-w-4xl gap-6 overflow-auto rounded-3xl bg-white p-5 md:grid-cols-[1fr_240px]" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 rounded-full bg-white/90 p-2 shadow"><X size={18} /></button>
        <img src={photo.image_url} alt="Selected photo" className="w-full rounded-2xl object-contain" />
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          {origin && <QRCodeSVG value={link} size={180} marginSize={2} />}
          <p className="text-sm text-ink/70">Scan to open this photo on your phone</p>
          <Link href={`/editor/${photo.id}`} className="inline-flex items-center gap-2 rounded-full bg-cobalt px-6 py-3 font-semibold text-white">
            <Palette size={18} /> Style this photo
          </Link>
          {isStaff && (
            <div className="flex flex-col gap-2">
              <button onClick={() => run({ action: photo.watermarked ? "unlock" : "lock", sessionId: photo.session_id })} disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-sodium px-5 py-2 text-sm font-bold disabled:opacity-50">
                {photo.watermarked ? "Remove watermark (no proof)" : "Put watermark back"}
              </button>
              <button onClick={() => run({ action: "delete", id: photo.id }, "Delete this photo for good?")} disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-red-600 px-5 py-2 text-sm font-semibold text-red-600 disabled:opacity-50">
                <Trash2 size={16} /> {busy ? "Working…" : "Delete photo"}
              </button>
              {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
