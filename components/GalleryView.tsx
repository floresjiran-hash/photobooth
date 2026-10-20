"use client";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supabase, type Photo } from "@/lib/supabase";
import GalleryGrid from "@/components/GalleryGrid";
import PhotoModal from "@/components/PhotoModal";

/** Shows one gallery: /gallery?e=CODE is a renter's own gallery, plain /gallery is the owner's. */
export default function GalleryView() {
  const [event, setEvent] = useState<string | null | undefined>(undefined);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [q, setQ] = useState("");
  const [day, setDay] = useState("");
  const [selected, setSelected] = useState<Photo | null>(null);

  useEffect(() => { setEvent(new URLSearchParams(location.search).get("e")); }, []);

  useEffect(() => {
    if (event === undefined) return;
    let query = supabase.from("photos").select("*").order("created_at", { ascending: false }).limit(300);
    query = event ? query.eq("event_code", event) : query.is("event_code", null);
    query.then(({ data }) => setPhotos((data as Photo[]) ?? []));

    const mine = (p: Photo & { event_code?: string | null }) => (p.event_code ?? null) === event;
    const channel = supabase.channel(`photos-feed-${event ?? "main"}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "photos" }, (payload) => { if (mine(payload.new as Photo)) setPhotos((prev) => [payload.new as Photo, ...prev]); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "photos" }, (payload) => setPhotos((prev) => prev.map((p) => (p.id === (payload.new as Photo).id ? (payload.new as Photo) : p))))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "photos" }, (payload) => setPhotos((prev) => prev.filter((p) => p.id !== (payload.old as { id: string }).id)))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [event]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return photos.filter((p) => {
      if (day && !p.created_at.startsWith(day)) return false;
      if (!needle) return true;
      return p.id.toLowerCase().includes(needle) || new Date(p.created_at).toLocaleString().toLowerCase().includes(needle);
    });
  }, [photos, q, day]);

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl font-extrabold">Today's photos</h1>
        <div className="flex flex-wrap gap-2">
          <label className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/50" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Photo ID or time (e.g. 3:45)" className="w-64 rounded-full border-2 border-ink/15 bg-white py-2 pl-9 pr-4" aria-label="Search photos" />
          </label>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="rounded-full border-2 border-ink/15 bg-white px-4 py-2" aria-label="Filter by date" />
        </div>
      </header>
      <GalleryGrid photos={filtered} onSelect={setSelected} />
      {selected && <PhotoModal photo={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}
