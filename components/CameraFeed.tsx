"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Maximize2, Minimize2, SlidersHorizontal, Square } from "lucide-react";
import { staffHeaders } from "@/lib/boothKey";
import { beep } from "@/lib/audio";
import { createLiveSegmenter, liveLandmarker, type Pt } from "@/lib/vision";
import { LIVE_BGS, paintBg, type BgId } from "@/lib/livebg";
import { drawProps, PROPS, sampleSkin, setLookFilter, setUse3d, type Expr } from "@/lib/magic";

const FILTERS = {
  none: { label: "Color", css: "none" },
  bw: { label: "B&W", css: "grayscale(1) contrast(1.1)" },
  noir: { label: "Noir", css: "grayscale(1) contrast(1.6) brightness(.85)" },
  sepia: { label: "Sepia", css: "sepia(1)" },
  vintage: { label: "Vintage", css: "sepia(.45) contrast(1.1) saturate(1.3) hue-rotate(-10deg) brightness(.95)" },
  warm: { label: "Warm", css: "sepia(.25) saturate(1.3) brightness(1.05)" },
  cool: { label: "Cool", css: "saturate(1.1) hue-rotate(12deg) brightness(1.02)" },
  fade: { label: "Fade", css: "contrast(.85) brightness(1.1) saturate(.8)" },
  pop: { label: "Pop", css: "saturate(1.7) contrast(1.15)" },
  dreamy: { label: "Dreamy", css: "blur(.6px) brightness(1.12) saturate(1.25) contrast(.95)" },
  sunset: { label: "Sunset", css: "sepia(.35) saturate(1.8) hue-rotate(-18deg) brightness(1.05)" },
  cyber: { label: "Cyber", css: "hue-rotate(180deg) saturate(2) contrast(1.1)" },
  negative: { label: "Negative", css: "invert(1)" },
} as const;
type FilterKey = keyof typeof FILTERS;
const USE_3D = false; // the 3D dog / bear / cap models are switched off for now (code is kept in lib/face3d.ts)

// Labels that usually mean "the laptop's own camera"
const INTERNAL = /integrated|built-in|internal|facetime|front/i;
// Adaptive smoothing: still face = heavy smoothing (no jitter), moving face = follows instantly (no lag)
function smoothFace(prev: Pt[] | undefined, next: { x: number; y: number }[]): Pt[] {
  if (!prev || prev.length !== next.length) return next.map((p) => ({ x: p.x, y: p.y }));
  const a = Math.min(1, 0.2 + Math.hypot(next[1].x - prev[1].x, next[1].y - prev[1].y) * 30);
  return next.map((p, i) => ({ x: prev[i].x + (p.x - prev[i].x) * a, y: prev[i].y + (p.y - prev[i].y) * a }));
}
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
  const [pauseBetween, setPauseBetween] = useState(true); // wait for "Next shot" so the effect can be changed every time
  const [waiting, setWaiting] = useState(false);
  const [status, setStatus] = useState("");
  const [last, setLast] = useState<string[]>([]);
  const [props, setProps] = useState<string[]>([]);
  const [aiState, setAiState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef<string[]>([]);
  const facesRef = useRef<Pt[][]>([]);
  const exprRef = useRef<Expr[]>([]);
  const matsRef = useRef<number[][]>([]);
  const gl3Ref = useRef<HTMLCanvasElement>(null);
  const face3dRef = useRef<{ render: (l: Pt[][], m: number[][], ids: string[], w: number, h: number, t: number, jaw: number[]) => void; clear: () => void; nextVariant: () => void; dispose: () => void } | null>(null);
  const arOn = props.length > 0;
  const filterRef = useRef("none");
  const filterKeyRef = useRef<FilterKey>("none");
  const watermarkRef = useRef(true);
  const cancelRef = useRef(false);
  const nextRef = useRef<(() => void) | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const bgIdRef = useRef<BgId>("none");
  const bgReadyRef = useRef(false);
  const [isFs, setIsFs] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [bgId, setBgId] = useState<BgId>("none");
  const [bgState, setBgState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const bgOn = bgId !== "none";
  useEffect(() => { bgIdRef.current = bgId; }, [bgId]);
  useEffect(() => { propsRef.current = props; }, [props]);
  useEffect(() => { filterRef.current = FILTERS[filter].css; filterKeyRef.current = filter; }, [filter]);
  useEffect(() => { watermarkRef.current = watermark; }, [watermark]);
  useEffect(() => { // Space / Enter = next shot
    if (!waiting) return;
    const k = (e: KeyboardEvent) => { if (e.code === "Space" || e.key === "Enter") { e.preventDefault(); nextRef.current?.(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [waiting]);

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

  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); face3dRef.current?.dispose(); face3dRef.current = null; }, []);

  // --- Live face props: track faces and draw items on an overlay ---------
  useEffect(() => {
    if (!arOn) { facesRef.current = []; setAiState("idle"); return; }
    let stop = false, raf = 0, lastT = 0, frameN = 0;
    (async () => {
      try {
        setAiState("loading");
        const lm = await liveLandmarker();
        if (stop) return;
        if (USE_3D) try { // real 3D props; falls back to the flat versions if WebGL isn't available
          const { createFace3D } = await import("@/lib/face3d");
          if (stop) return;
          if (gl3Ref.current) { face3dRef.current ??= createFace3D(gl3Ref.current); setUse3d(true); }
        } catch { face3dRef.current = null; setUse3d(false); }
        setAiState("ready");
        const tick = (now: number) => {
          raf = requestAnimationFrame(tick);
          const v = videoRef.current, c = overlayRef.current;
          if (!v || !c || !v.videoWidth || v.readyState < 2 || now - lastT < 33) return; // ~30 fps
          lastT = now;
          if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
          const res = lm.detectForVideo(v, now);
          facesRef.current = res.faceLandmarks.map((f, i) => smoothFace(facesRef.current[i], f));
          matsRef.current = (res.facialTransformationMatrixes ?? []).map((m) => Array.from(m.data));
          exprRef.current = (res.faceBlendshapes ?? []).map((bs) => {
            const m: Record<string, number> = {};
            bs.categories.forEach((c) => { m[c.categoryName] = c.score; });
            return { jaw: m.jawOpen ?? 0, blinkL: m.eyeBlinkLeft ?? 0, blinkR: m.eyeBlinkRight ?? 0, smile: ((m.mouthSmileLeft ?? 0) + (m.mouthSmileRight ?? 0)) / 2 };
          });
          if (facesRef.current[0] && frameN++ % 15 === 0) sampleSkin(v, v.videoWidth, v.videoHeight, facesRef.current[0]); // skin colour for the Roblox face
          const ctx = c.getContext("2d")!;
          ctx.clearRect(0, 0, c.width, c.height);
          setLookFilter(filterRef.current);
          drawProps(ctx, facesRef.current, propsRef.current, c.width, c.height, now / 1000, exprRef.current, v);
          face3dRef.current?.render(facesRef.current, matsRef.current, propsRef.current, v.videoWidth, v.videoHeight, now / 1000, exprRef.current.map((e) => e.jaw));
        };
        raf = requestAnimationFrame(tick);
      } catch { if (!stop) setAiState("error"); }
    })();
    return () => {
      stop = true; cancelAnimationFrame(raf); face3dRef.current?.clear();
      const c = overlayRef.current;
      c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    };
  }, [arOn]);

  // --- Full screen -----------------------------------------------------------
  async function toggleFs() {
    if (isFs) { setIsFs(false); if (document.fullscreenElement) await document.exitFullscreen().catch(() => {}); return; }
    setIsFs(true); // the full-window layout works even if the browser refuses real full screen
    try { await rootRef.current?.requestFullscreen(); } catch { /* keep the full-window layout */ }
  }
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setIsFs(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFs(false); };
    document.addEventListener("fullscreenchange", onFs);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("fullscreenchange", onFs); window.removeEventListener("keydown", onKey); };
  }, []);

  // --- Live background: cut the person out of every frame and paint the chosen backdrop behind them ---
  useEffect(() => {
    const c0 = bgCanvasRef.current;
    if (!bgOn) { bgReadyRef.current = false; c0?.getContext("2d")?.clearRect(0, 0, c0.width, c0.height); setBgState("idle"); return; }
    let stop = false, raf = 0, lastSeg = 0;
    const person = document.createElement("canvas");
    (async () => {
      try {
        setBgState("loading");
        const seg = await createLiveSegmenter();
        if (stop) return;
        setBgState("ready");
        const tick = (now: number) => {
          raf = requestAnimationFrame(tick);
          const v = videoRef.current, c = bgCanvasRef.current;
          if (!v || !c || !v.videoWidth || v.readyState < 2) return;
          if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
          if (person.width !== c.width) { person.width = c.width; person.height = c.height; }
          if (now - lastSeg > 70) { lastSeg = now; seg.update(v, now); } // ~14 mask updates per second
          const mask = seg.mask;
          if (!mask) return;
          const ctx = c.getContext("2d")!, pc = person.getContext("2d")!;
          paintBg(ctx, bgIdRef.current, c.width, c.height, now / 1000, v, bgImgRef.current);
          pc.globalCompositeOperation = "source-over"; pc.filter = "none"; pc.clearRect(0, 0, person.width, person.height);
          pc.drawImage(v, 0, 0, person.width, person.height);
          pc.globalCompositeOperation = "destination-in"; pc.filter = `blur(${Math.max(1, c.width / 1200)}px)`; // soft edge
          pc.drawImage(mask, 0, 0, person.width, person.height);
          ctx.drawImage(person, 0, 0);
          bgReadyRef.current = true;
        };
        raf = requestAnimationFrame(tick);
      } catch { if (!stop) setBgState("error"); }
    })();
    return () => {
      stop = true; cancelAnimationFrame(raf); bgReadyRef.current = false;
      const c = bgCanvasRef.current;
      c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    };
  }, [bgOn]);

  function pickBg(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => { bgImgRef.current = img; setBgId("custom"); };
    img.src = URL.createObjectURL(f);
  }

  // --- Capture + upload ---------------------------------------------------
  function grab(): Promise<Blob> {
    const v = videoRef.current!;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d")!;
    ctx.filter = filterRef.current; // not supported in older Safari: photo saves unfiltered there
    ctx.drawImage(bgReadyRef.current && bgCanvasRef.current ? bgCanvasRef.current : v, 0, 0); // includes the live background
    ctx.filter = "none";
    setLookFilter(filterRef.current);
    drawProps(ctx, facesRef.current, propsRef.current, c.width, c.height, performance.now() / 1000, exprRef.current, v); // bake the props into the photo
    if (face3dRef.current && gl3Ref.current) ctx.drawImage(gl3Ref.current, 0, 0, c.width, c.height); // and the 3D models
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Capture failed"))), "image/jpeg", 0.92));
  }

  // Photos go through the server, which checks the owner login or the rental key before saving anything
  async function upload(blob: Blob, sessionId: string, index: number) {
    const headers = await staffHeaders();
    if (!headers) throw new Error("Not signed in");
    const form = new FormData();
    form.append("file", blob, `${index}.jpg`);
    form.append("sessionId", sessionId);
    form.append("index", String(index));
    form.append("filter", filterKeyRef.current);
    form.append("watermarked", String(watermarkRef.current));
    const res = await fetch("/api/booth?r=upload", { method: "POST", headers, body: form });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error ?? "Upload failed");
    return j.url as string;
  }

  function stopSession() {
    cancelRef.current = true;
    nextRef.current?.();
  }

  async function runSession() {
    if (!videoRef.current?.videoWidth) return setStatus("Camera isn't ready yet.");
    setBusy(true);
    setLast([]);
    cancelRef.current = false;
    const sessionId = crypto.randomUUID();
    const uploads: Promise<string>[] = [];
    try {
      for (let i = 1; i <= shots; i++) {
        if (i > 1 && pauseBetween) { // wait here so the operator can change the filter or face effect before the next shot
          setStatus(`Shot ${i} of ${shots}: change your effect, then press Next shot`);
          setWaiting(true);
          await new Promise<void>((res) => { nextRef.current = res; });
          setWaiting(false);
          if (cancelRef.current) break;
        }
        setStatus(`Shot ${i} of ${shots}`);
        for (let n = 3; n >= 1 && !cancelRef.current; n--) {
          setCount(n);
          beep(660, 0.12);
          await sleep(1000);
        }
        if (cancelRef.current) break;
        setCount(null);
        beep(1200, 0.25);
        setFlash(true);
        const blob = await grab(); // uses whatever filter and effects are on right now
        setTimeout(() => setFlash(false), 350);
        uploads.push(upload(blob, sessionId, i)); // upload while the next countdown runs
        await sleep(800);
      }
      setStatus("Uploading…");
      setLast(await Promise.all(uploads));
      setStatus(cancelRef.current ? (uploads.length ? `Stopped after ${uploads.length} photo${uploads.length > 1 ? "s" : ""}. They're in the gallery.` : "Stopped.") : "Done. Photos are in the gallery.");
    } catch (e) {
      setStatus(`Upload failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      setWaiting(false);
      setCount(null);
    }
  }

  const fit = isFs ? "object-contain" : "object-cover";
  const actions = !busy ? (
    <button onClick={runSession} disabled={!deviceId}
      className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-sodium py-4 text-lg font-bold text-ink shadow-lg disabled:opacity-50">
      <Camera /> Start photo strip
    </button>
  ) : (
    <div className="space-y-2">
      {waiting ? (
        <button onClick={() => nextRef.current?.()} className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-sodium py-4 text-lg font-bold text-ink shadow-lg">
          <Camera /> Next shot (Space)
        </button>
      ) : (
        <p className="flex items-center justify-center gap-2 rounded-full bg-paper py-3 text-sm font-semibold"><Loader2 className="animate-spin" size={16} /> Shooting. You can change effects now.</p>
      )}
      <button onClick={stopSession} className="w-full inline-flex items-center justify-center gap-2 rounded-full border-2 border-red-500 bg-white py-3 font-bold text-red-600">
        <Square size={16} /> Stop
      </button>
    </div>
  );
  const chipBtn = "inline-flex items-center gap-2 rounded-full bg-black/55 px-3 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-black/70";

  return (
    <div ref={rootRef} className={isFs ? "fixed inset-0 z-50 bg-black" : "grid gap-6 lg:grid-cols-[1fr_320px]"}>
      <div className={isFs ? "absolute inset-0 overflow-hidden bg-black" : "relative aspect-video overflow-hidden rounded-3xl bg-ink"}>
        <video ref={videoRef} autoPlay playsInline muted className={`h-full w-full ${fit}`} style={{ filter: FILTERS[filter].css }} />
        <canvas ref={bgCanvasRef} aria-hidden className={`pointer-events-none absolute inset-0 h-full w-full ${fit}`} style={{ filter: FILTERS[filter].css }} />
        <canvas ref={overlayRef} aria-hidden className={`pointer-events-none absolute inset-0 h-full w-full ${fit}`} />
        <canvas ref={gl3Ref} aria-hidden className={`pointer-events-none absolute inset-0 h-full w-full ${fit}`} />
        {count !== null && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none" aria-live="assertive">
            <span key={count} className="font-display text-[14rem] font-extrabold text-white drop-shadow-[0_4px_24px_rgba(0,0,0,.6)]">{count}</span>
          </div>
        )}
        {flash && <div className="flash absolute inset-0 bg-white" />}
        {status && <p className="absolute bottom-3 left-3 z-10 rounded-full bg-black/60 px-4 py-1.5 text-sm text-white">{status}</p>}
        <div className="absolute left-3 top-3 z-20 flex gap-2">
          <button onClick={toggleFs} className={chipBtn} aria-label={isFs ? "Exit full screen" : "Full screen"}>
            {isFs ? <Minimize2 size={14} /> : <Maximize2 size={14} />} {isFs ? "Exit full screen" : "Full screen"}
          </button>
          {isFs && (
            <button onClick={() => setPanelOpen((o) => !o)} className={chipBtn} aria-pressed={panelOpen}>
              <SlidersHorizontal size={14} /> Effects
            </button>
          )}
        </div>
      </div>

      <aside className={isFs
        ? `absolute right-0 top-0 z-30 h-full w-[360px] max-w-[92vw] space-y-6 overflow-y-auto bg-white/95 p-6 shadow-2xl backdrop-blur transition-transform ${panelOpen ? "" : "translate-x-full"}`
        : "min-w-0 space-y-6 rounded-3xl bg-white p-6"}>
        <label className="block">
          <span className="font-semibold">Camera</span>
          <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} disabled={busy}
            className="mt-2 w-full rounded-xl border-2 border-ink/15 px-3 py-2">
            {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
          </select>
        </label>

        <fieldset className="min-w-0">
          <legend className="font-semibold">Live background</legend>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {LIVE_BGS.map((b) => (
              <button key={b.id} onClick={() => setBgId(b.id)} aria-pressed={bgId === b.id} title={b.label}
                className={`flex flex-col items-center gap-1 rounded-xl border-2 p-1.5 text-[10px] font-semibold ${bgId === b.id ? "border-cobalt" : "border-ink/15"}`}>
                <span className="block h-9 w-full rounded-md ring-1 ring-ink/10" style={{ background: b.css }} />{b.label}
              </button>
            ))}
            <label className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed p-1.5 text-[10px] font-semibold hover:bg-paper ${bgId === "custom" ? "border-cobalt" : "border-ink/25"}`}>
              <span className="grid h-9 w-full place-items-center"><ImagePlus size={18} /></span>Upload
              <input type="file" accept="image/*" onChange={pickBg} className="sr-only" />
            </label>
          </div>
          {bgState === "loading" && <p className="mt-2 flex items-center gap-2 text-xs text-ink/60"><Loader2 size={12} className="animate-spin" /> Loading the background AI…</p>}
          {bgState === "error" && <p role="alert" className="mt-2 text-xs text-red-600">Couldn't load the background AI. Check the internet connection.</p>}
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="font-semibold">Filter</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(Object.keys(FILTERS) as FilterKey[]).map((k) => (
              <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k}
                className={`rounded-xl px-2 py-2 text-xs font-semibold border-2 ${filter === k ? "border-cobalt bg-cobalt text-white" : "border-ink/15"}`}>
                {FILTERS[k].label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="font-semibold">Face filters (live)</legend>
          <div className="mt-2 flex snap-x gap-2 overflow-x-auto pb-2">
            {PROPS.map(([id, label, icon]) => {
              const on = props.includes(id);
              return (
                <button key={id} title={label} aria-label={label} aria-pressed={on}
                  onClick={() => setProps((l) => (on ? l.filter((x) => x !== id) : [...l, id]))}
                  className={`flex w-16 shrink-0 snap-start flex-col items-center gap-1 rounded-xl border-2 py-2 text-[10px] font-semibold ${on ? "border-cobalt bg-cobalt/10" : "border-ink/15"}`}><span className="text-2xl leading-none">{icon}</span>{label}</button>
              );
            })}
          </div>
          {arOn && <button onClick={() => setProps([])} className="mt-2 text-sm font-semibold text-cobalt underline">Clear props</button>}
          {aiState === "loading" && <p className="mt-2 flex items-center gap-2 text-xs text-ink/60"><Loader2 size={12} className="animate-spin" /> Loading face tracking…</p>}
          {aiState === "error" && <p role="alert" className="mt-2 text-xs text-red-600">Couldn't load face tracking. Check the internet connection.</p>}
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="font-semibold">Photos per strip</legend>
          <div className="mt-2 flex gap-2">
            {([3, 4] as const).map((n) => (
              <button key={n} onClick={() => setShots(n)} disabled={busy} aria-pressed={shots === n}
                className={`flex-1 rounded-xl px-3 py-2 font-semibold border-2 ${shots === n ? "border-cobalt bg-cobalt text-white" : "border-ink/15"}`}>{n}</button>
            ))}
          </div>
        </fieldset>

        <label className="flex items-center gap-3">
          <input type="checkbox" checked={pauseBetween} onChange={(e) => setPauseBetween(e.target.checked)} disabled={busy} className="size-5 accent-cobalt" />
          <span>Pause between shots (change effects each time)</span>
        </label>

        <label className="flex items-center gap-3">
          <input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} className="size-5 accent-cobalt" />
          <span>Watermark until paid</span>
        </label>

        {actions}

        {last.length > 0 && (
          <div className="grid grid-cols-4 gap-1">
            {last.map((u) => <img key={u} src={u} alt="" className="aspect-[4/3] rounded object-cover" />)}
          </div>
        )}
      </aside>

      {isFs && !panelOpen && <div className="absolute bottom-6 left-1/2 z-30 w-72 -translate-x-1/2">{actions}</div>}
    </div>
  );
}
