"use client";
import { Lock } from "lucide-react";
import type { Photo } from "@/lib/supabase";

export default function GalleryGrid({ photos, onSelect }: { photos: Photo[]; onSelect: (p: Photo) => void }) {
  if (!photos.length)
    return (
      <div className="grid place-items-center rounded-3xl border-2 border-dashed border-ink/20 bg-white/60 py-24 text-center">
        <p className="font-display text-2xl font-bold">No photos yet</p>
        <p className="mt-1 text-ink/60">New shots appear here the moment they're taken.</p>
      </div>
    );
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {photos.map((p) => (
        <li key={p.id}>
          <button onClick={() => onSelect(p)}
            className="group relative block aspect-[4/3] w-full overflow-hidden rounded-2xl bg-white p-1.5 shadow-md ring-1 ring-ink/5 transition hover:-translate-y-1 hover:rotate-[-1deg] hover:shadow-xl">
            <img src={p.image_url} alt={`Photo taken ${new Date(p.created_at).toLocaleTimeString()}`} loading="lazy"
              className="h-full w-full rounded-xl object-cover" />
            {p.watermarked && (
              <span className="absolute right-3 top-3 rounded-full bg-ink/70 p-1.5 text-white" title="Watermarked"><Lock size={12} /></span>
            )}
            <span className="absolute inset-x-1.5 bottom-1.5 rounded-b-xl bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6 text-left text-xs font-medium text-white">
              {new Date(p.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · #{p.id.slice(0, 6)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
