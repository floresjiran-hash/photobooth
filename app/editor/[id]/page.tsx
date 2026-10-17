"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase, type Photo } from "@/lib/supabase";
import PhotoEditor from "@/components/PhotoEditor";

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [siblings, setSiblings] = useState<Photo[]>([]);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("photos").select("*").eq("id", id).single();
    if (!data) return setMissing(true);
    setPhoto(data as Photo);
    const { data: all } = await supabase.from("photos").select("*").eq("session_id", data.session_id).order("shot_index");
    setSiblings((all as Photo[]) ?? []);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-8">
      <Link href="/gallery" className="mb-4 inline-flex items-center gap-2 text-cobalt"><ArrowLeft size={16} /> Back to gallery</Link>
      {missing ? <p>We couldn't find that photo.</p> : !photo ? <p>Loading…</p> : <PhotoEditor photo={photo} siblings={siblings} onRefresh={load} />}
    </main>
  );
}
