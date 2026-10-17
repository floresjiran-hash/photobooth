"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Palette, X } from "lucide-react";
import type { Photo } from "@/lib/supabase";

export default function PhotoModal({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

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
        </div>
      </div>
    </div>
  );
}
