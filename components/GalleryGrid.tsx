"use client";
import type { Photo } from "@/lib/supabase";

export default function GalleryGrid({ photos, onSelect }: { photos: Photo[]; onSelect: (p: Photo) => void }) {
  if (!photos.length)
    return <p className="py-24 text-center text-ink/60">No photos match yet. New shots appear here as they're taken.</p>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {photos.map((p) => (
        <li key={p.id}>
          <button onClick={() => onSelect(p)} className="group relative block w-full overflow-hidden rounded-2xl bg-ink/10 aspect-[4/3]">
            <img src={p.image_url} alt={`Photo taken ${new Date(p.created_at).toLocaleTimeString()}`} loading="lazy"
              className="h-full w-full object-cover transition-transform group-hover:scale-105" />
            <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2 text-left text-xs text-white">
              {new Date(p.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · #{p.id.slice(0, 6)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
