"use client";
import { Lock } from "lucide-react";
import type { Photo } from "@/lib/supabase";

export default function GalleryGrid({ photos, onSelect }: { photos: Photo[]; onSelect: (p: Photo) => void }) {
  if (!photos.length)
    return (
      <div className="grid place-items-center rounded-3xl border-2 border-dashed border-ink bg-white/70 py-24 text-center">
        <p className="font-display text-3xl font-black">The wall is empty</p>
        <p className="mt-1 text-ink/70">New shots appear here the moment they're taken.</p>
      </div>
    );
  return (
    <ul className="grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {photos.map((p, i) => (
        <li key={p.id} className="pt-3">
          <button onClick={() => onSelect(p)}
            className={`group relative block w-full border-2 border-ink bg-white p-2 pb-3 shadow-md transition hover:rotate-0 hover:-translate-y-1 hover:shadow-xl ${i % 2 ? "rotate-[1.2deg]" : "-rotate-[1.2deg]"}`}>
            <span aria-hidden className="absolute -top-3 left-1/2 h-5 w-14 -translate-x-1/2 -rotate-[4deg] bg-sodium/75" />
            <img src={p.image_url} alt={`Photo taken ${new Date(p.created_at).toLocaleTimeString()}`} loading="lazy" className="aspect-[4/3] w-full object-cover" />
            {p.watermarked && <span className="absolute right-4 top-4 rounded-full bg-ink p-1.5 text-white" title="Watermarked"><Lock size={12} /></span>}
            <span className="mt-2 flex items-center justify-between px-1 font-display text-sm font-black">
              <span>{new Date(p.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              <span className="font-sans font-semibold text-ink/50">#{p.id.slice(0, 6)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}