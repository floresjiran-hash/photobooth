"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Lock, Maximize2, Printer, RotateCcw, Trash2, Plus, ZoomIn, ZoomOut } from "lucide-react";
import type { Photo } from "@/lib/supabase";
import PaymentModal from "./PaymentModal";
import { analyze } from "@/lib/vision";
import { renderMagic, SCENES, PROPS, type BgMode } from "@/lib/magic";

type Layout = "single" | "grid" | "strip" | "double";
type Theme = "none" | "minimal" | "family" | "birthday" | "vintage" | "film" | "hearts" | "stars" | "neon";
type Sticker = { id: number; kind: "emoji" | "text"; text: string; color: string; nx: number; ny: number; size: number; rot: number };
type Rect = { x: number; y: number; w: number; h: number };
type Tab = "layout" | "style" | "text" | "props" | "magic";

const K = 1.5; // render scale: single/grid = 1800px wide, one strip = 900px
const EMOJIS = ["😎", "🕶️", "🎩", "👑", "🥳", "❤️", "⭐", "🎈", "💬", "👒", "🎀", "🦄", "🎂", "🎁", "🌈", "🔥", "✨", "💖", "🐱", "🐶", "🌸", "🍕", "🎸", "🎄"];
const FONTS = {
  Serif: "Georgia, serif", Sans: "Helvetica, Arial, sans-serif", Mono: "'Courier New', monospace",
  Script: "'Brush Script MT', cursive", Impact: "Impact, 'Arial Black', sans-serif", Playful: "'Comic Sans MS', 'Chalkboard SE', cursive",
};
const FILTERS = {
  none: ["Original", "none"], bw: ["B&W", "grayscale(1) contrast(1.1)"], sepia: ["Sepia", "sepia(1)"],
  vintage: ["Vintage", "sepia(.45) contrast(1.1) saturate(1.3) hue-rotate(-10deg) brightness(.95)"],
  warm: ["Warm", "sepia(.25) saturate(1.3) brightness(1.05)"], cool: ["Cool", "saturate(1.1) hue-rotate(12deg) brightness(1.02)"],
  fade: ["Fade", "contrast(.85) brightness(1.1) saturate(.8)"],
} as const;
const THEMES: Record<Theme, { label: string; bg: string; text: string }> = {
  none: { label: "None", bg: "#ffffff", text: "#11172b" },
  minimal: { label: "Minimal", bg: "#ffffff", text: "#11172b" },
  family: { label: "Family Day", bg: "#dff3e4", text: "#1f5c3a" },
  birthday: { label: "Birthday", bg: "#ffe4f0", text: "#c2185b" },
  vintage: { label: "Vintage", bg: "#efe2c6", text: "#5b4328" },
  film: { label: "Film", bg: "#111111", text: "#ffffff" },
  hearts: { label: "Hearts", bg: "#ffe3ec", text: "#d6336c" },
  stars: { label: "Stars", bg: "#1b1f4b", text: "#ffd23f" },
  neon: { label: "Neon", bg: "#0b0b1a", text: "#39ff14" },
};
const GRADIENTS = [["#ff9a9e", "#fad0c4"], ["#a18cd1", "#fbc2eb"], ["#84fab0", "#8fd3f4"], ["#f6d365", "#fda085"], ["#2f4bff", "#7b2ff7"], ["#0f2027", "#2c5364"]];
const SWATCHES = ["#ffffff", "#11172b", "#ffd23f", "#ff5d73", "#2f4bff", "#2bd9a0", "#ffe4f0", "#efe2c6"];
const WATERMARK = process.env.NEXT_PUBLIC_WATERMARK_TEXT ?? "PHOTO BOOTH PREVIEW";

const loadImg = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.crossOrigin = "anonymous"; // needed so the canvas can be exported
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });

function rng(seed: number) { // deterministic scatter
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function drawPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement | HTMLCanvasElement, r: Rect, radius: number, filter: string) {
  ctx.save();
  ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, radius); ctx.clip();
  ctx.filter = filter; // ignored by older Safari: photo stays unfiltered there
  const s = Math.max(r.w / img.width, r.h / img.height), sw = r.w / s, sh = r.h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, r.x, r.y, r.w, r.h);
  ctx.restore();
}

function scatter(ctx: CanvasRenderingContext2D, W: number, H: number, b: number, emojis: string[], count: number, seed: number, size: number) {
  const r = rng(seed);
  ctx.font = `${size}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (let i = 0; i < count; i++) {
    const topBottom = r() < 0.5;
    const x = topBottom ? r() * W : r() < 0.5 ? r() * b : W - r() * b;
    const y = topBottom ? (r() < 0.5 ? r() * b : H - r() * b) : r() * H;
    ctx.fillText(emojis[i % emojis.length], x, y);
  }
}

function drawFrame(ctx: CanvasRenderingContext2D, theme: Theme, W: number, H: number, b: number) {
  ctx.save();
  if (theme === "minimal") {
    ctx.strokeStyle = "#11172b"; ctx.lineWidth = 3 * K; ctx.strokeRect(b / 2, b / 2, W - b, H - b);
  } else if (theme === "vintage") {
    ctx.strokeStyle = "#5b4328"; ctx.lineWidth = 4 * K; ctx.strokeRect(b * 0.3, b * 0.3, W - b * 0.6, H - b * 0.6);
    ctx.lineWidth = 1.5 * K; ctx.strokeRect(b * 0.3 + 10 * K, b * 0.3 + 10 * K, W - b * 0.6 - 20 * K, H - b * 0.6 - 20 * K);
    ctx.fillStyle = "rgba(120,80,30,0.10)"; ctx.fillRect(0, 0, W, H);
  } else if (theme === "birthday") {
    const r = rng(7); const colors = ["#ff4d8d", "#ffd23f", "#2f4bff", "#2bd9a0", "#ff8a3d"];
    for (let i = 0; i < 90; i++) {
      const tb = r() < 0.5, x = tb ? r() * W : r() < 0.5 ? r() * b : W - r() * b, y = tb ? (r() < 0.5 ? r() * b : H - r() * b) : r() * H;
      ctx.fillStyle = colors[i % colors.length]; ctx.beginPath(); ctx.arc(x, y, (5 + r() * 9) * K, 0, 7); ctx.fill();
    }
    ctx.font = `${90 * K}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("🎈", 60 * K, 60 * K); ctx.fillText("🎂", W - 60 * K, 60 * K);
  } else if (theme === "family") {
    ctx.font = `${90 * K}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("🏡", 60 * K, 60 * K); ctx.fillText("👨‍👩‍👧", W - 60 * K, 60 * K); ctx.fillText("🌳", 60 * K, H - 60 * K); ctx.fillText("💚", W - 60 * K, H - 60 * K);
  } else if (theme === "hearts") {
    scatter(ctx, W, H, b, ["💗", "💖", "💕", "❤️"], 60, 11, 36 * K);
  } else if (theme === "stars") {
    scatter(ctx, W, H, b, ["⭐", "✨", "🌟"], 70, 5, 34 * K);
  } else if (theme === "film") {
    const hs = Math.max(b * 0.4, 14 * K), cx = Math.max(b / 2, hs); ctx.fillStyle = "#f2f2f2";
    for (let y = hs; y < H - hs; y += hs * 2) {
      ctx.beginPath(); ctx.roundRect(cx - hs / 2, y, hs, hs * 0.75, hs * 0.2); ctx.fill();
      ctx.beginPath(); ctx.roundRect(W - cx - hs / 2, y, hs, hs * 0.75, hs * 0.2); ctx.fill();
    }
  } else if (theme === "neon") {
    const i = Math.max(b * 0.4, 14 * K); ctx.lineWidth = 5 * K; ctx.shadowBlur = 30;
    ctx.shadowColor = ctx.strokeStyle = "#39ff14"; ctx.strokeRect(i, i, W - 2 * i, H - 2 * i);
    ctx.shadowColor = ctx.strokeStyle = "#ff2bd6"; ctx.strokeRect(i * 0.5, i * 0.5, W - i, H - i);
  }
  ctx.restore();
}

function hit(s: Sticker, x: number, y: number, W: number, H: number) {
  const dx = x - s.nx * W, dy = y - s.ny * H, a = (-s.rot * Math.PI) / 180;
  const rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(rx) <= (s.kind === "text" ? s.text.length * s.size * W * 0.32 : s.size * W * 0.6) && Math.abs(ry) <= s.size * W * 0.6;
}

const Slider = ({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) => (
  <label className="flex items-center gap-3 text-sm">
    <span className="w-20 shrink-0 text-ink/70">{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="flex-1 accent-cobalt" />
    <span className="w-10 text-right tabular-nums text-ink/60">{Math.round(value * 100) / 100}</span>
  </label>
);

export default function PhotoEditor({ photo, siblings, onRefresh }: { photo: Photo; siblings: Photo[]; onRefresh: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);

  const [tab, setTab] = useState<Tab>("layout");
  const [layout, setLayout] = useState<Layout>("strip");
  const [stripCount, setStripCount] = useState<3 | 4>(4);
  const [gapPx, setGapPx] = useState(16);
  const [radius, setRadius] = useState(0);
  const [theme, setTheme] = useState<Theme>("minimal");
  const [bg, setBg] = useState("#ffffff");
  const [grad, setGrad] = useState<number | null>(null);
  const [textColor, setTextColor] = useState("#11172b");
  const [border, setBorder] = useState(40);
  const [filter, setFilter] = useState<keyof typeof FILTERS>("none");
  const [title, setTitle] = useState("Family Reunion 2026");
  const [showDate, setShowDate] = useState(true);
  const [font, setFont] = useState<keyof typeof FONTS>("Serif");
  const [fs, setFs] = useState(1);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [newText, setNewText] = useState("");
  const [imgs, setImgs] = useState<HTMLImageElement[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [bgMode, setBgMode] = useState<BgMode>("none");
  const [bgColor, setBgColor] = useState("#2bd9a0");
  const [scene, setScene] = useState(0);
  const [smooth, setSmooth] = useState(0);
  const [magicProps, setMagicProps] = useState<string[]>([]);
  const [edge, setEdge] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  const panelRef = useRef<HTMLDivElement>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const panning = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const [proc, setProc] = useState<HTMLCanvasElement[] | null>(null);
  const [magicStatus, setMagicStatus] = useState<"idle" | "working" | "ready" | "error">("idle");

  const urls = (siblings.length ? siblings : [photo]).map((p) => p.image_url);
  const urlKey = urls.join("|");
  useEffect(() => { Promise.all(urls.map(loadImg)).then(setImgs).catch(() => setImgs([])); /* eslint-disable-next-line */ }, [urlKey]);

  // AI pass: background removal + face effects. Models load on first use; results are cached per photo.
  const magicOn = bgMode !== "none" || smooth > 0 || magicProps.length > 0;
  useEffect(() => {
    if (!magicOn || !imgs.length) { setProc(null); setMagicStatus("idle"); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        setMagicStatus("working");
        const outs: HTMLCanvasElement[] = [];
        for (let i = 0; i < imgs.length; i++) {
          const a = await analyze(imgs[i], urls[i], bgMode !== "none", smooth > 0 || magicProps.length > 0);
          if (cancelled) return;
          outs.push(renderMagic(imgs[i], a.mask, a.faces ?? [], { bg: bgMode, color: bgColor, scene, smooth, props: magicProps, soft: edge }));
        }
        if (!cancelled) { setProc(outs); setMagicStatus("ready"); }
      } catch { if (!cancelled) { setProc(null); setMagicStatus("error"); } }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line
  }, [imgs, urlKey, bgMode, bgColor, scene, smooth, magicProps, edge]);

  const pickTheme = (t: Theme) => { setTheme(t); setGrad(null); setBg(THEMES[t].bg); setTextColor(THEMES[t].text); };
  const reset = () => { setLayout("strip"); setStripCount(4); setGapPx(16); setRadius(0); pickTheme("minimal"); setBorder(40); setFilter("none"); setFs(1); setStickers([]); setSelected(null); setBgMode("none"); setSmooth(0); setMagicProps([]); };

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c || !imgs.length) return;
    const b = border * K, gap = gapPx * K, rad = radius * K;
    const hasText = !!title.trim() || showDate;
    const textH = hasText ? 170 * K * fs : 0;
    const current = Math.max(0, siblings.findIndex((s) => s.id === photo.id));
    const srcs = proc ?? imgs;
    const pic = (i: number) => srcs[(current + i) % srcs.length];

    let W = 1200 * K, H = 1600 * K, pw = W;
    let cells: Rect[] = [], centers: number[] = [W / 2], order: number[] = [0];
    if (layout === "single") {
      cells = [{ x: b, y: b, w: W - 2 * b, h: H - 2 * b - textH }];
    } else if (layout === "grid") {
      const cw = (W - 2 * b - gap) / 2, ch = (H - 2 * b - gap - textH) / 2;
      cells = [0, 1, 2, 3].map((i) => ({ x: b + (i % 2) * (cw + gap), y: b + Math.floor(i / 2) * (ch + gap), w: cw, h: ch }));
      order = [0, 1, 2, 3];
    } else {
      pw = 600 * K;
      const n = stripCount, halves = layout === "double" ? 2 : 1, cw = pw - 2 * b, ch = cw * 0.75;
      W = pw * halves; H = Math.round(b * 2 + n * ch + (n - 1) * gap + textH);
      centers = []; order = [];
      for (let h = 0; h < halves; h++) {
        centers.push(h * pw + pw / 2);
        for (let i = 0; i < n; i++) { cells.push({ x: h * pw + b, y: b + i * (ch + gap), w: cw, h: ch }); order.push(i); }
      }
    }
    c.width = W; c.height = H;
    const ctx = c.getContext("2d")!;
    if (grad !== null) { const g = ctx.createLinearGradient(0, 0, W * 0.3, H); g.addColorStop(0, GRADIENTS[grad][0]); g.addColorStop(1, GRADIENTS[grad][1]); ctx.fillStyle = g; } else ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    cells.forEach((r, i) => drawPhoto(ctx, pic(order[i]), r, rad, FILTERS[filter][1]));
    drawFrame(ctx, theme, W, H, b);

    if (hasText) {
      const cy = H - b - textH / 2, small = layout === "strip" || layout === "double";
      const dateLine = showDate ? new Date(photo.created_at).toLocaleDateString(undefined, { dateStyle: "long" }) : "";
      ctx.save(); ctx.fillStyle = textColor; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      if (theme === "neon") { ctx.shadowColor = textColor; ctx.shadowBlur = 20; }
      centers.forEach((cx) => {
        if (title.trim()) { ctx.font = `bold ${(small ? 46 : 64) * K * fs}px ${FONTS[font]}`; ctx.fillText(title, cx, cy - (dateLine ? 22 * K * fs : 0), pw - 2 * b); }
        if (dateLine) { ctx.font = `${(small ? 26 : 34) * K * fs}px ${FONTS[font]}`; ctx.globalAlpha = 0.75; ctx.fillText(dateLine, cx, cy + (title.trim() ? 40 * K * fs : 0), pw - 2 * b); ctx.globalAlpha = 1; }
      });
      ctx.restore();
    }

    stickers.forEach((s) => {
      ctx.save(); ctx.translate(s.nx * W, s.ny * H); ctx.rotate((s.rot * Math.PI) / 180);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const px = s.size * W;
      if (s.kind === "text") {
        ctx.font = `bold ${px}px ${FONTS[font]}`; ctx.lineJoin = "round"; ctx.lineWidth = px * 0.14; ctx.strokeStyle = "#ffffff"; ctx.strokeText(s.text, 0, 0);
        ctx.fillStyle = s.color; ctx.fillText(s.text, 0, 0);
      } else { ctx.font = `${px}px serif`; ctx.fillText(s.text, 0, 0); }
      if (s.id === selected) {
        const hw = s.kind === "text" ? s.text.length * px * 0.32 : px * 0.6;
        ctx.strokeStyle = "#2f4bff"; ctx.setLineDash([12, 8]); ctx.lineWidth = 3 * K; ctx.strokeRect(-hw, -px * 0.6, hw * 2, px * 1.2);
      }
      ctx.restore();
    });

    if (photo.watermarked) {
      ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#000000"; ctx.lineWidth = 2;
      ctx.font = `bold ${W / 14}px sans-serif`; ctx.rotate(-Math.PI / 6);
      for (let y = -H; y < H * 1.5; y += W / 4) for (let x = -W; x < W * 1.5; x += W * 0.9) { ctx.fillText(WATERMARK, x, y); ctx.strokeText(WATERMARK, x, y); }
      ctx.restore();
    }
  }, [imgs, proc, siblings, photo, layout, stripCount, gapPx, radius, theme, bg, grad, textColor, border, filter, title, showDate, font, fs, stickers, selected]);

  useEffect(draw, [draw]);

  // --- Dragging props -----------------------------------------------------
  const toCanvas = (e: React.PointerEvent) => {
    const c = canvasRef.current!, r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height, W: c.width, H: c.height };
  };
  const clampPan = (p: { x: number; y: number }, z: number) => {
    const c = canvasRef.current; if (!c) return p;
    const mx = ((z - 1) * c.offsetWidth) / 2, my = ((z - 1) * c.offsetHeight) / 2;
    return { x: Math.max(-mx, Math.min(mx, p.x)), y: Math.max(-my, Math.min(my, p.y)) };
  };
  /** Zoom while keeping the point under (qx, qy), measured from the panel centre, where it is. */
  const setZoomAt = (z2: number, qx = 0, qy = 0) => {
    const z = Math.max(1, Math.min(5, z2)), r = z / zoomRef.current;
    setPan((p) => (z === 1 ? { x: 0, y: 0 } : clampPan({ x: qx - r * (qx - p.x), y: qy - r * (qy - p.y) }, z)));
    setZoom(z);
  };
  useEffect(() => { // mouse wheel / trackpad zoom
    const el = panelRef.current; if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = el.getBoundingClientRect();
      setZoomAt(zoomRef.current * (ev.deltaY < 0 ? 1.15 : 1 / 1.15), ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line
  }, []);

  function onDown(e: React.PointerEvent) {
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (pts.current.size === 2) { // two fingers: pinch to zoom
      const [a, b] = [...pts.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoomRef.current }; drag.current = null; panning.current = null; return;
    }
    const { x, y, W, H } = toCanvas(e);
    const h = [...stickers].reverse().find((s) => hit(s, x, y, W, H));
    setSelected(h?.id ?? null);
    if (h) { setTab("props"); drag.current = { id: h.id, dx: h.nx * W - x, dy: h.ny * H - y }; }
    else if (zoomRef.current > 1) panning.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }; // drag empty space to move around
  }
  function onMove(e: React.PointerEvent) {
    if (pts.current.has(e.pointerId)) pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pts.current.size === 2) { const [a, b] = [...pts.current.values()]; setZoomAt(pinch.current.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.d)); return; }
    if (panning.current) { const p = panning.current; setPan(clampPan({ x: p.px + e.clientX - p.sx, y: p.py + e.clientY - p.sy }, zoomRef.current)); return; }
    if (!drag.current) return;
    const { x, y, W, H } = toCanvas(e), d = drag.current;
    setStickers((l) => l.map((s) => (s.id === d.id ? { ...s, nx: (x + d.dx) / W, ny: (y + d.dy) / H } : s)));
  }
  function onUp(e: React.PointerEvent) {
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) pinch.current = null;
    drag.current = null; panning.current = null;
  }
  function onDbl(e: React.MouseEvent) { // double-click / double-tap: zoom in or back out
    const r = panelRef.current!.getBoundingClientRect();
    if (zoomRef.current > 1) setZoomAt(1); else setZoomAt(2.5, e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
  }
  const patch = (id: number, p: Partial<Sticker>) => setStickers((l) => l.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const add = (s: Omit<Sticker, "id">) => { const id = Date.now(); setStickers((l) => [...l, { ...s, id }]); setSelected(id); };
  const addEmoji = (t: string) => add({ kind: "emoji", text: t, color: "#000", nx: 0.5, ny: 0.4, size: 0.18, rot: 0 });
  const addText = () => { if (!newText.trim()) return; add({ kind: "text", text: newText.trim(), color: textColor, nx: 0.5, ny: 0.45, size: 0.09, rot: -8 }); setNewText(""); };
  const sel = stickers.find((s) => s.id === selected);

  // --- Export -------------------------------------------------------------
  function download(type: "png" | "jpg") {
    setSelected(null);
    requestAnimationFrame(() => canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `photobooth-${photo.id.slice(0, 8)}.${type}`; a.click(); URL.revokeObjectURL(a.href);
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

  const chip = (on: boolean) => `rounded-xl border-2 px-3 py-2 text-sm font-semibold transition ${on ? "border-cobalt bg-cobalt text-white" : "border-ink/10 hover:border-ink/30"}`;
  const h3 = "mb-2 text-xs font-bold uppercase tracking-widest text-ink/50";
  const TABS: [Tab, string][] = [["layout", "Layout"], ["style", "Style"], ["text", "Text"], ["props", "Props"], ["magic", "Magic"]];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <div ref={panelRef} className="relative grid place-items-center overflow-hidden rounded-3xl bg-ink/[0.04] p-6 ring-1 ring-ink/5 lg:sticky lg:top-6 lg:self-start">
        <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={onDbl}
          className="max-h-[78vh] max-w-full touch-none rounded-md shadow-2xl" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, cursor: zoom > 1 ? "grab" : "default" }} aria-label="Photo preview" />
        <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1 rounded-full bg-white/90 p-1 shadow">
          <button aria-label="Zoom out" onClick={() => setZoomAt(zoom / 1.3)} className="rounded-full p-2 hover:bg-ink/5"><ZoomOut size={16} /></button>
          <span className="w-12 text-center text-xs font-semibold tabular-nums">{Math.round(zoom * 100)}%</span>
          <button aria-label="Zoom in" onClick={() => setZoomAt(zoom * 1.3)} className="rounded-full p-2 hover:bg-ink/5"><ZoomIn size={16} /></button>
          <button aria-label="Fit to screen" title="Fit" onClick={() => setZoomAt(1)} className="rounded-full p-2 hover:bg-ink/5"><Maximize2 size={16} /></button>
        </div>
        {magicStatus === "working" && (
          <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-ink/80 px-3 py-1.5 text-xs font-semibold text-white"><Loader2 size={14} className="animate-spin" /> Applying magic…</span>
        )}
      </div>

      <aside className="flex flex-col overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-ink/5">
        {photo.watermarked && (
          <button onClick={() => setPayOpen(true)} className="flex items-center justify-center gap-2 bg-sodium py-3 font-bold">
            <Lock size={16} /> Remove watermark
          </button>
        )}
        <div className="flex items-center gap-1 border-b border-ink/10 p-2" role="tablist">
          {TABS.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`flex-1 rounded-xl py-2 text-sm font-semibold ${tab === k ? "bg-ink text-white" : "hover:bg-ink/5"}`}>{l}</button>
          ))}
          <button onClick={reset} aria-label="Reset design" title="Reset design" className="rounded-xl p-2 hover:bg-ink/5"><RotateCcw size={16} /></button>
        </div>

        <div className="max-h-[56vh] space-y-6 overflow-auto p-5">
          {tab === "layout" && (<>
            <section>
              <h3 className={h3}>Layout</h3>
              <div className="grid grid-cols-2 gap-2">
                {([["single", "Single"], ["grid", "4-grid"], ["strip", "Photo strip"], ["double", "Double strip (4×6)"]] as const).map(([k, l]) => <button key={k} className={chip(layout === k)} onClick={() => setLayout(k)}>{l}</button>)}
              </div>
              {(layout === "strip" || layout === "double") && (
                <div className="mt-2 flex gap-2">{([3, 4] as const).map((n) => <button key={n} className={`${chip(stripCount === n)} flex-1`} onClick={() => setStripCount(n)}>{n} photos</button>)}</div>
              )}
            </section>
            <section className="space-y-3">
              <h3 className={h3}>Spacing & corners</h3>
              <Slider label="Border" value={border} min={0} max={90} onChange={setBorder} />
              <Slider label="Photo gap" value={gapPx} min={0} max={60} onChange={setGapPx} />
              <Slider label="Corners" value={radius} min={0} max={80} onChange={setRadius} />
            </section>
          </>)}

          {tab === "style" && (<>
            <section>
              <h3 className={h3}>Frame theme</h3>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(THEMES) as Theme[]).map((t) => (
                  <button key={t} onClick={() => pickTheme(t)} aria-pressed={theme === t}
                    className={`flex flex-col items-center gap-1 rounded-xl border-2 p-2 text-xs font-semibold ${theme === t ? "border-cobalt" : "border-ink/10"}`}>
                    <span className="size-8 rounded-md ring-1 ring-ink/10" style={{ background: THEMES[t].bg }} />{THEMES[t].label}
                  </button>
                ))}
              </div>
            </section>
            <section>
              <h3 className={h3}>Background</h3>
              <div className="flex flex-wrap items-center gap-2">
                {SWATCHES.map((c) => <button key={c} onClick={() => { setBg(c); setGrad(null); }} aria-label={`Background ${c}`} className={`size-8 rounded-full ring-2 ${grad === null && bg === c ? "ring-cobalt" : "ring-ink/10"}`} style={{ background: c }} />)}
                <input type="color" value={bg} onChange={(e) => { setBg(e.target.value); setGrad(null); }} aria-label="Custom background" className="size-8 rounded-full" />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {GRADIENTS.map((g, i) => <button key={i} onClick={() => setGrad(i)} aria-label={`Gradient ${i + 1}`} className={`size-8 rounded-full ring-2 ${grad === i ? "ring-cobalt" : "ring-ink/10"}`} style={{ background: `linear-gradient(135deg, ${g[0]}, ${g[1]})` }} />)}
              </div>
            </section>
            <section>
              <h3 className={h3}>Photo filter</h3>
              <div className="grid grid-cols-4 gap-2">
                {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((k) => <button key={k} className={chip(filter === k)} onClick={() => setFilter(k)}>{FILTERS[k][0]}</button>)}
              </div>
            </section>
          </>)}

          {tab === "text" && (
            <section className="space-y-3">
              <h3 className={h3}>Event title</h3>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Family Reunion 2026" className="w-full rounded-xl border-2 border-ink/10 px-3 py-2" />
              <div className="flex flex-wrap gap-2">{(Object.keys(FONTS) as (keyof typeof FONTS)[]).map((f) => <button key={f} className={chip(font === f)} style={{ fontFamily: FONTS[f] }} onClick={() => setFont(f)}>{f}</button>)}</div>
              <Slider label="Text size" value={fs} min={0.6} max={1.6} step={0.05} onChange={setFs} />
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-2">Color <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} /></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={showDate} onChange={(e) => setShowDate(e.target.checked)} className="size-4 accent-cobalt" /> Show date</label>
              </div>
            </section>
          )}

          {tab === "magic" && (<>
            <section>
              <h3 className={h3}>AI background</h3>
              <div className="grid grid-cols-3 gap-2">
                {([["none", "Original"], ["remove", "Remove"], ["blur", "Blur"], ["color", "Color"], ["scene", "Scene"]] as const).map(([k, l]) => <button key={k} className={chip(bgMode === k)} onClick={() => setBgMode(k)}>{l}</button>)}
              </div>
              {bgMode === "color" && <label className="mt-3 flex items-center gap-2 text-sm">Backdrop color <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} /></label>}
              {bgMode === "scene" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {SCENES.map(([name, a, b], i) => <button key={name} onClick={() => setScene(i)} aria-label={name} title={name} className={`size-9 rounded-full ring-2 ${scene === i ? "ring-cobalt" : "ring-ink/10"}`} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} />)}
                </div>
              )}
              {bgMode === "remove" && <p className="mt-2 text-xs text-ink/60">Removed areas show your frame color. Change it in the Style tab.</p>}
              {bgMode !== "none" && <div className="mt-3"><Slider label="Edge softness" value={edge} min={0.3} max={4} step={0.1} onChange={setEdge} /></div>}
            </section>
            <section className="space-y-2">
              <h3 className={h3}>Skin smoothing</h3>
              <Slider label="Amount" value={smooth} min={0} max={1} step={0.05} onChange={setSmooth} />
            </section>
            <section>
              <h3 className={h3}>Face props (follow the face)</h3>
              <div className="grid grid-cols-5 gap-2">
                {PROPS.map(([id, label, icon]) => {
                  const on = magicProps.includes(id);
                  return (
                    <button key={id} aria-pressed={on} title={label} onClick={() => setMagicProps((l) => (on ? l.filter((x) => x !== id) : [...l, id]))}
                      className={`flex flex-col items-center gap-1 rounded-xl border-2 py-2 text-[10px] font-semibold ${on ? "border-cobalt bg-cobalt/10" : "border-ink/10"}`}>
                      <span className="text-2xl leading-none">{icon}</span>{label}
                    </button>
                  );
                })}
              </div>
            </section>
            {magicStatus === "working" && <p className="flex items-center gap-2 text-sm text-ink/70"><Loader2 size={14} className="animate-spin" /> Loading AI the first time can take a few seconds…</p>}
            {magicStatus === "error" && <p role="alert" className="text-sm text-red-600">Couldn't load the AI models. Check your internet connection and try again.</p>}
            {magicStatus === "ready" && magicProps.length > 0 && <p className="text-xs text-ink/60">No face found in a photo? Props only appear on photos where a face is detected.</p>}
          </>)}

          {tab === "props" && (<>
            <section>
              <h3 className={h3}>Stickers (tap to add, drag to place)</h3>
              <div className="grid grid-cols-8 gap-1 text-2xl">{EMOJIS.map((e) => <button key={e} onClick={() => addEmoji(e)} className="rounded-lg p-1 hover:bg-paper" aria-label={`Add ${e}`}>{e}</button>)}</div>
            </section>
            <section>
              <h3 className={h3}>Text sticker</h3>
              <div className="flex gap-2">
                <input value={newText} onChange={(e) => setNewText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addText()} placeholder="Best day ever!" className="min-w-0 flex-1 rounded-xl border-2 border-ink/10 px-3 py-2" />
                <button onClick={addText} className="inline-flex items-center gap-1 rounded-xl bg-cobalt px-4 font-semibold text-white"><Plus size={16} /> Add</button>
              </div>
            </section>
            {sel ? (
              <section className="space-y-3 rounded-2xl bg-paper p-4">
                <h3 className={h3}>Selected: {sel.text}</h3>
                <Slider label="Size" value={sel.size} min={0.04} max={0.5} step={0.01} onChange={(v) => patch(sel.id, { size: v })} />
                <Slider label="Rotate" value={sel.rot} min={-180} max={180} onChange={(v) => patch(sel.id, { rot: v })} />
                {sel.kind === "text" && <label className="flex items-center gap-2 text-sm">Color <input type="color" value={sel.color} onChange={(e) => patch(sel.id, { color: e.target.value })} /></label>}
                <button onClick={() => { setStickers((l) => l.filter((s) => s.id !== sel.id)); setSelected(null); }} className="inline-flex items-center gap-2 text-sm font-semibold text-red-600"><Trash2 size={16} /> Remove</button>
              </section>
            ) : stickers.length > 0 && <p className="text-sm text-ink/60">Tap a sticker on the photo to resize or rotate it.</p>}
          </>)}
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-ink/10 p-4">
          <button onClick={() => download("png")} className="inline-flex items-center justify-center gap-1 rounded-full bg-cobalt py-3 text-sm font-semibold text-white"><Download size={16} /> PNG</button>
          <button onClick={() => download("jpg")} className="inline-flex items-center justify-center gap-1 rounded-full bg-cobalt py-3 text-sm font-semibold text-white"><Download size={16} /> JPG</button>
          <button onClick={print} className="inline-flex items-center justify-center gap-1 rounded-full border-2 border-ink py-3 text-sm font-semibold"><Printer size={16} /> Print</button>
        </div>
      </aside>

      {payOpen && <PaymentModal photoId={photo.id} sessionId={photo.session_id} onRefresh={onRefresh} onClose={() => setPayOpen(false)} />}
    </div>
  );
}