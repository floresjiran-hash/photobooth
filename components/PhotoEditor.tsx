"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Lock, Printer, Trash2 } from "lucide-react";
import type { Photo } from "@/lib/supabase";
import PaymentModal from "./PaymentModal";

type Layout = "single" | "grid" | "strip";
type Theme = "none" | "minimal" | "family" | "birthday" | "vintage";
type Sticker = { id: number; emoji: string; nx: number; ny: number; size: number }; // normalized to canvas width
type Rect = { x: number; y: number; w: number; h: number };

const K = 1.5; // render scale: single/grid = 1800px wide, strip = 900px wide
const EMOJIS = ["😎", "🕶️", "🎩", "👑", "🥳", "❤️", "⭐", "🎈", "💬", "👒", "🎀", "🦄"];
const FONTS = { Serif: "Georgia, serif", Sans: "Helvetica, Arial, sans-serif", Mono: "'Courier New', monospace", Script: "'Brush Script MT', cursive" };
const THEMES: Record<Theme, { label: string; bg: string; text: string }> = {
  none: { label: "None", bg: "#ffffff", text: "#11172b" },
  minimal: { label: "Minimalist", bg: "#ffffff", text: "#11172b" },
  family: { label: "Family Day", bg: "#dff3e4", text: "#1f5c3a" },
  birthday: { label: "Birthday", bg: "#ffe4f0", text: "#c2185b" },
  vintage: { label: "Vintage", bg: "#efe2c6", text: "#5b4328" },
};
const WATERMARK = process.env.NEXT_PUBLIC_WATERMARK_TEXT ?? "PHOTO BOOTH PREVIEW";

const loadImg = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.crossOrigin = "anonymous"; // required so the canvas can be exported
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, r: Rect) {
  const s = Math.max(r.w / img.width, r.h / img.height);
  const sw = r.w / s, sh = r.h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, r.x, r.y, r.w, r.h);
}

function rng(seed: number) { // deterministic confetti
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function drawFrame(ctx: CanvasRenderingContext2D, theme: Theme, W: number, H: number, b: number) {
  ctx.save();
  if (theme === "minimal") {
    ctx.strokeStyle = "#11172b"; ctx.lineWidth = 3 * K;
    ctx.strokeRect(b / 2, b / 2, W - b, H - b);
  } else if (theme === "vintage") {
    ctx.strokeStyle = "#5b4328"; ctx.lineWidth = 4 * K;
    ctx.strokeRect(b * 0.3, b * 0.3, W - b * 0.6, H - b * 0.6);
    ctx.lineWidth = 1.5 * K;
    ctx.strokeRect(b * 0.3 + 10 * K, b * 0.3 + 10 * K, W - b * 0.6 - 20 * K, H - b * 0.6 - 20 * K);
    ctx.fillStyle = "rgba(120,80,30,0.10)"; ctx.fillRect(0, 0, W, H); // aged-paper tint
  } else if (theme === "birthday") {
    const r = rng(7); const colors = ["#ff4d8d", "#ffd23f", "#2f4bff", "#2bd9a0", "#ff8a3d"];
    for (let i = 0; i < 90; i++) {
      const edge = r() < 0.5;
      const x = edge ? r() * W : (r() < 0.5 ? r() * b : W - r() * b);
      const y = edge ? (r() < 0.5 ? r() * b : H - r() * b) : r() * H;
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath(); ctx.arc(x, y, (5 + r() * 9) * K, 0, 7); ctx.fill();
    }
    ctx.font = `${90 * K}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("🎈", 60 * K, 60 * K); ctx.fillText("🎂", W - 60 * K, 60 * K);
  } else if (theme === "family") {
    ctx.font = `${90 * K}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("🏡", 60 * K, 60 * K); ctx.fillText("👨‍👩‍👧", W - 60 * K, 60 * K);
    ctx.fillText("🌳", 60 * K, H - 60 * K); ctx.fillText("💚", W - 60 * K, H - 60 * K);
  }
  ctx.restore();
}

export default function PhotoEditor({ photo, siblings, onRefresh }: { photo: Photo; siblings: Photo[]; onRefresh: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);

  const [layout, setLayout] = useState<Layout>("strip");
  const [stripCount, setStripCount] = useState<3 | 4>(4);
  const [theme, setTheme] = useState<Theme>("minimal");
  const [bg, setBg] = useState("#ffffff");
  const [textColor, setTextColor] = useState("#11172b");
  const [border, setBorder] = useState(40);
  const [title, setTitle] = useState("Family Reunion 2026");
  const [showDate, setShowDate] = useState(true);
  const [font, setFont] = useState<keyof typeof FONTS>("Serif");
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [imgs, setImgs] = useState<HTMLImageElement[]>([]);
  const [payOpen, setPayOpen] = useState(false);

  const urls = (siblings.length ? siblings : [photo]).map((p) => p.image_url);
  const urlKey = urls.join("|");
  useEffect(() => { Promise.all(urls.map(loadImg)).then(setImgs).catch(() => setImgs([])); /* eslint-disable-next-line */ }, [urlKey]);

  const pickTheme = (t: Theme) => { setTheme(t); setBg(THEMES[t].bg); setTextColor(THEMES[t].text); };

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c || !imgs.length) return;
    const b = border * K, gap = Math.max(b / 2, 12 * K);
    const hasText = !!title.trim() || showDate;
    const textH = hasText ? 170 * K : 0;
    const current = Math.max(0, siblings.findIndex((s) => s.id === photo.id));
    const pic = (i: number) => imgs[(current + i) % imgs.length];

    let W = 1200 * K, H = 1600 * K;
    let cells: Rect[] = [];
    if (layout === "single") {
      cells = [{ x: b, y: b, w: W - 2 * b, h: H - 2 * b - textH }];
    } else if (layout === "grid") {
      const cw = (W - 2 * b - gap) / 2, ch = (H - 2 * b - gap - textH) / 2;
      cells = [0, 1, 2, 3].map((i) => ({ x: b + (i % 2) * (cw + gap), y: b + Math.floor(i / 2) * (ch + gap), w: cw, h: ch }));
    } else {
      W = 600 * K;
      const cw = W - 2 * b, ch = cw * 0.75;
      H = Math.round(b * 2 + stripCount * ch + (stripCount - 1) * gap + textH);
      cells = Array.from({ length: stripCount }, (_, i) => ({ x: b, y: b + i * (ch + gap), w: cw, h: ch }));
    }
    c.width = W; c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    cells.forEach((r, i) => cover(ctx, pic(layout === "single" ? 0 : i), r));
    drawFrame(ctx, theme, W, H, b);

    if (hasText) {
      const cy = H - b - textH / 2;
      ctx.fillStyle = textColor; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const dateLine = showDate ? new Date(photo.created_at).toLocaleDateString(undefined, { dateStyle: "long" }) : "";
      if (title.trim()) { ctx.font = `bold ${(layout === "strip" ? 46 : 64) * K}px ${FONTS[font]}`; ctx.fillText(title, W / 2, cy - (dateLine ? 22 * K : 0), W - 2 * b); }
      if (dateLine) { ctx.font = `${(layout === "strip" ? 26 : 34) * K}px ${FONTS[font]}`; ctx.globalAlpha = 0.75; ctx.fillText(dateLine, W / 2, cy + (title.trim() ? 40 * K : 0), W - 2 * b); ctx.globalAlpha = 1; }
    }

    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    stickers.forEach((s) => {
      ctx.font = `${s.size * W}px serif`;
      ctx.fillText(s.emoji, s.nx * W, s.ny * H);
      if (s.id === selected) { ctx.strokeStyle = "#2f4bff"; ctx.setLineDash([12, 8]); ctx.lineWidth = 3 * K; ctx.strokeRect(s.nx * W - s.size * W * 0.6, s.ny * H - s.size * W * 0.6, s.size * W * 1.2, s.size * W * 1.2); ctx.setLineDash([]); }
    });

    if (photo.watermarked) {
      ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#000000"; ctx.lineWidth = 2;
      ctx.font = `bold ${W / 14}px sans-serif`; ctx.rotate(-Math.PI / 6);
      for (let y = -H; y < H * 1.5; y += W / 4) for (let x = -W; x < W * 1.5; x += W * 0.9) { ctx.fillText(WATERMARK, x, y); ctx.strokeText(WATERMARK, x, y); }
      ctx.restore();
    }
  }, [imgs, siblings, photo, layout, stripCount, theme, bg, textColor, border, title, showDate, font, stickers, selected]);

  useEffect(draw, [draw]);

  // --- Sticker dragging ---------------------------------------------------
  const toCanvas = (e: React.PointerEvent) => {
    const c = canvasRef.current!, r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height, W: c.width, H: c.height };
  };
  function onDown(e: React.PointerEvent) {
    const { x, y, W, H } = toCanvas(e);
    const hit = [...stickers].reverse().find((s) => Math.hypot(x - s.nx * W, y - s.ny * H) < s.size * W * 0.6);
    setSelected(hit?.id ?? null);
    if (hit) { drag.current = { id: hit.id, dx: hit.nx * W - x, dy: hit.ny * H - y }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }
  }
  function onMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const { x, y, W, H } = toCanvas(e), d = drag.current;
    setStickers((list) => list.map((s) => (s.id === d.id ? { ...s, nx: (x + d.dx) / W, ny: (y + d.dy) / H } : s)));
  }
  const addSticker = (emoji: string) => { const id = Date.now(); setStickers((s) => [...s, { id, emoji, nx: 0.5, ny: 0.4, size: 0.18 }]); setSelected(id); };
  const sel = stickers.find((s) => s.id === selected);

  // --- Export -------------------------------------------------------------
  function download(type: "png" | "jpg") {
    setSelected(null);
    requestAnimationFrame(() => canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `photobooth-${photo.id.slice(0, 8)}.${type}`;
      a.click();
      URL.revokeObjectURL(a.href);
    }, type === "png" ? "image/png" : "image/jpeg", 0.95));
  }
  function print() {
    if (photo.watermarked) return setPayOpen(true);
    setSelected(null);
    requestAnimationFrame(() => {
      const w = window.open("");
      if (!w) return;
      w.document.write(`<img src="${canvasRef.current!.toDataURL("image/png")}" style="max-width:100%" onload="print()">`);
      w.document.close();
    });
  }

  const chip = (on: boolean) => `rounded-xl border-2 px-3 py-2 text-sm font-semibold ${on ? "border-cobalt bg-cobalt text-white" : "border-ink/15"}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="grid place-items-center rounded-3xl bg-white p-4">
        <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)}
          className="max-h-[80vh] max-w-full touch-none rounded-lg shadow-lg" aria-label="Photo preview" />
      </div>

      <aside className="space-y-5 rounded-3xl bg-white p-5">
        {photo.watermarked && (
          <button onClick={() => setPayOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-full bg-sodium py-3 font-bold">
            <Lock size={16} /> Remove watermark
          </button>
        )}

        <section>
          <h2 className="font-semibold">Layout</h2>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {([["single", "Single"], ["grid", "4-grid"], ["strip", "Strip"]] as const).map(([k, l]) => <button key={k} className={chip(layout === k)} onClick={() => setLayout(k)}>{l}</button>)}
          </div>
          {layout === "strip" && <div className="mt-2 flex gap-2">{([3, 4] as const).map((n) => <button key={n} className={`${chip(stripCount === n)} flex-1`} onClick={() => setStripCount(n)}>{n} photos</button>)}</div>}
        </section>

        <section>
          <h2 className="font-semibold">Frame</h2>
          <div className="mt-2 flex flex-wrap gap-2">{(Object.keys(THEMES) as Theme[]).map((t) => <button key={t} className={chip(theme === t)} onClick={() => pickTheme(t)}>{THEMES[t].label}</button>)}</div>
          <div className="mt-3 flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">Background <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></label>
            <label className="flex flex-1 items-center gap-2 text-sm">Border <input type="range" min={0} max={90} value={border} onChange={(e) => setBorder(+e.target.value)} className="flex-1 accent-cobalt" /></label>
          </div>
        </section>

        <section>
          <h2 className="font-semibold">Text</h2>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" className="mt-2 w-full rounded-xl border-2 border-ink/15 px-3 py-2" />
          <div className="mt-2 flex items-center gap-3 text-sm">
            <select value={font} onChange={(e) => setFont(e.target.value as keyof typeof FONTS)} className="rounded-lg border-2 border-ink/15 px-2 py-1">{Object.keys(FONTS).map((f) => <option key={f}>{f}</option>)}</select>
            <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} aria-label="Text color" />
            <label className="flex items-center gap-1"><input type="checkbox" checked={showDate} onChange={(e) => setShowDate(e.target.checked)} className="accent-cobalt" /> Date</label>
          </div>
        </section>

        <section>
          <h2 className="font-semibold">Props <span className="text-sm font-normal text-ink/60">(tap to add, drag to place)</span></h2>
          <div className="mt-2 grid grid-cols-6 gap-1 text-2xl">{EMOJIS.map((e) => <button key={e} onClick={() => addSticker(e)} className="rounded-lg p-1 hover:bg-paper" aria-label={`Add ${e}`}>{e}</button>)}</div>
          {sel && (
            <div className="mt-3 flex items-center gap-3 text-sm">
              Size <input type="range" min={0.06} max={0.5} step={0.01} value={sel.size} onChange={(e) => setStickers((l) => l.map((s) => (s.id === sel.id ? { ...s, size: +e.target.value } : s)))} className="flex-1 accent-cobalt" />
              <button onClick={() => { setStickers((l) => l.filter((s) => s.id !== sel.id)); setSelected(null); }} aria-label="Delete prop"><Trash2 size={18} /></button>
            </div>
          )}
        </section>

        <section className="grid grid-cols-3 gap-2">
          <button onClick={() => download("png")} className="inline-flex items-center justify-center gap-1 rounded-full bg-cobalt py-3 text-sm font-semibold text-white"><Download size={16} /> PNG</button>
          <button onClick={() => download("jpg")} className="inline-flex items-center justify-center gap-1 rounded-full bg-cobalt py-3 text-sm font-semibold text-white"><Download size={16} /> JPG</button>
          <button onClick={print} className="inline-flex items-center justify-center gap-1 rounded-full border-2 border-ink py-3 text-sm font-semibold"><Printer size={16} /> Print</button>
        </section>
      </aside>

      {payOpen && <PaymentModal photoId={photo.id} sessionId={photo.session_id} onRefresh={onRefresh} onClose={() => setPayOpen(false)} />}
    </div>
  );
}
