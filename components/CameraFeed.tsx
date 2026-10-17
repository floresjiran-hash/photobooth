"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { supabase, BUCKET } from "@/lib/supabase";
import { beep } from "@/lib/audio";

const FILTERS = {
  none: { label: "Color", css: "none" },
  bw: { label: "B&W", css: "grayscale(1) contrast(1.1)" },
  sepia: { label: "Sepia", css: "sepia(1)" },
  vintage: { label: "Vintage", css: "sepia(.45) contrast(1.1) saturate(1.3) hue-rotate(-10deg) brightness(.95)" },
} as const;
type FilterKey = keyof typeof FILTERS;

// Labels that usually mean "the laptop's own camera"
const INTERNAL = /integrated|built-in|internal|facetime|front/i;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function CameraFeed() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const knownIds = useRef<Set<string>>(new Set());

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [filter, setFilter] = useState<FilterKey>("none");
  const [shots, setShots] = useState<3 | 4>(4);
  const [watermark, setWatermark] = useState(true);
  const [count, setCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [last, setLast] = useState<string[]>([]);

  // --- Device discovery + auto-select external cameras -------------------
  const refreshDevices = useCallback(async (initial = false) => {
    const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
    setDevices(list);
    const fresh = list.filter((d) => !knownIds.current.has(d.deviceId));
    const external = (initial ? list : fresh).find((d) => !INTERNAL.test(d.label));
    if (external) setDeviceId(external.deviceId);
    else if (initial && list[0]) setDeviceId(list[0].deviceId);
    list.forEach((d) => knownIds.current.add(d.deviceId));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // Permission prompt first, otherwise device labels are empty
        const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
        tmp.getTracks().forEach((t) => t.stop());
        await refreshDevices(true);
      } catch {
        setStatus("Camera blocked. Allow camera access in your browser and reload.");
      }
    })();
    const onChange = () => refreshDevices(false);
    navigator.mediaDevices.addEventListener("devicechange", onChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", onChange);
  }, [refreshDevices]);

  // --- Start the HD stream for the selected device -----------------------
  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;
    (async () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setStatus("");
      } catch {
        setStatus("Couldn't open that camera. Pick another one.");
      }
    })();
    return () => { cancelled = true; };
  }, [deviceId]);

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  // --- Capture + upload ---------------------------------------------------
  function grab(): Promise<Blob> {
    const v = videoRef.current!;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d")!;
    ctx.filter = FILTERS[filter].css; // not supported in older Safari: photo saves unfiltered there
    ctx.drawImage(v, 0, 0);
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Capture failed"))), "image/jpeg", 0.92));
  }

  async function upload(blob: Blob, sessionId: string, index: number) {
    const path = `${sessionId}/${index}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
    if (error) throw error;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const { error: dbError } = await supabase.from("photos").insert({
      session_id: sessionId, shot_index: index, image_url: data.publicUrl,
      storage_path: path, filter, watermarked: watermark,
    });
    if (dbError) throw dbError;
    return data.publicUrl;
  }

  async function runSession() {
    if (!videoRef.current?.videoWidth) return setStatus("Camera isn't ready yet.");
    setBusy(true);
    setLast([]);
    const sessionId = crypto.randomUUID();
    const uploads: Promise<string>[] = [];
    try {
      for (let i = 1; i <= shots; i++) {
        setStatus(`Shot ${i} of ${shots}`);
        for (let n = 3; n >= 1; n--) {
          setCount(n);
          beep(660, 0.12);
          await sleep(1000);
        }
        setCount(null);
        beep(1200, 0.25);
        setFlash(true);
        const blob = await grab();
        setTimeout(() => setFlash(false), 350);
        uploads.push(upload(blob, sessionId, i)); // upload while the next countdown runs
        await sleep(800);
      }
      setStatus("Uploading…");
      setLast(await Promise.all(uploads));
      setStatus("Done. Photos are in the gallery.");
    } catch (e) {
      setStatus(`Upload failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      setCount(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="relative overflow-hidden rounded-3xl bg-ink aspect-video">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" style={{ filter: FILTERS[filter].css }} />
        {count !== null && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none" aria-live="assertive">
            <span key={count} className="font-display text-[14rem] font-extrabold text-white drop-shadow-[0_4px_24px_rgba(0,0,0,.6)]">{count}</span>
          </div>
        )}
        {flash && <div className="flash absolute inset-0 bg-white" />}
        {status && <p className="absolute bottom-3 left-3 rounded-full bg-black/60 px-4 py-1.5 text-sm text-white">{status}</p>}
      </div>

      <aside className="space-y-6 rounded-3xl bg-white p-6">
        <label className="block">
          <span className="font-semibold">Camera</span>
          <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} disabled={busy}
            className="mt-2 w-full rounded-xl border-2 border-ink/15 px-3 py-2">
            {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
          </select>
        </label>

        <fieldset>
          <legend className="font-semibold">Filter</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(Object.keys(FILTERS) as FilterKey[]).map((k) => (
              <button key={k} onClick={() => setFilter(k)} disabled={busy} aria-pressed={filter === k}
                className={`rounded-xl px-3 py-2 text-sm font-semibold border-2 ${filter === k ? "border-cobalt bg-cobalt text-white" : "border-ink/15"}`}>
                {FILTERS[k].label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="font-semibold">Photos per strip</legend>
          <div className="mt-2 flex gap-2">
            {([3, 4] as const).map((n) => (
              <button key={n} onClick={() => setShots(n)} disabled={busy} aria-pressed={shots === n}
                className={`flex-1 rounded-xl px-3 py-2 font-semibold border-2 ${shots === n ? "border-cobalt bg-cobalt text-white" : "border-ink/15"}`}>{n}</button>
            ))}
          </div>
        </fieldset>

        <label className="flex items-center gap-3">
          <input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} className="size-5 accent-cobalt" />
          <span>Watermark until paid</span>
        </label>

        <button onClick={runSession} disabled={busy || !deviceId}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-sodium py-4 text-lg font-bold text-ink disabled:opacity-50">
          {busy ? <Loader2 className="animate-spin" /> : <Camera />} {busy ? "Shooting…" : "Start photo strip"}
        </button>

        {last.length > 0 && (
          <div className="grid grid-cols-4 gap-1">
            {last.map((u) => <img key={u} src={u} alt="" className="aspect-[4/3] rounded object-cover" />)}
          </div>
        )}
      </aside>
    </div>
  );
}
