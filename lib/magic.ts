import type { Pt } from "./vision";

export type BgMode = "none" | "remove" | "blur" | "color" | "scene";
export type MagicOpts = { bg: BgMode; color: string; scene: number; smooth: number; props: string[] };

export const SCENES: [string, string, string][] = [
  ["Sunset", "#ff7e5f", "#feb47b"], ["Ocean", "#2193b0", "#6dd5ed"], ["Neon", "#7b2ff7", "#f107a3"],
  ["Studio", "#e6e6e6", "#9a9a9a"], ["Forest", "#134e5e", "#71b280"], ["Candy", "#ff9a9e", "#fad0c4"],
];
export const PROPS: [string, string, string][] = [
  ["shades", "Shades", "🕶️"], ["round", "Glasses", "👓"], ["hat", "Top hat", "🎩"], ["crown", "Crown", "👑"], ["bow", "Bow", "🎀"],
  ["cat", "Cat ears", "🐱"], ["bunny", "Bunny ears", "🐰"], ["stache", "Mustache", "🥸"], ["blush", "Blush", "😊"], ["clown", "Red nose", "🤡"],
];

// MediaPipe face-mesh landmark groups
const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const L_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const R_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
const LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];

const mk = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };

function poly(ctx: CanvasRenderingContext2D, f: Pt[], idx: number[], w: number, h: number) {
  ctx.beginPath();
  idx.forEach((i, k) => (k ? ctx.lineTo(f[i].x * w, f[i].y * h) : ctx.moveTo(f[i].x * w, f[i].y * h)));
  ctx.closePath();
}

/** Blend a blurred copy over the skin only (eyes and lips stay sharp). */
function smoothSkin(base: HTMLCanvasElement, faces: Pt[][], amount: number) {
  const w = base.width, h = base.height;
  const soft = mk(w, h), sctx = soft.getContext("2d")!;
  sctx.filter = `blur(${Math.round((w / 180) * (0.6 + amount))}px)`;
  sctx.drawImage(base, 0, 0);
  sctx.filter = "none";
  const fm = mk(w, h), fctx = fm.getContext("2d")!;
  fctx.fillStyle = "#fff";
  faces.forEach((f) => { poly(fctx, f, OVAL, w, h); fctx.fill(); });
  fctx.globalCompositeOperation = "destination-out";
  faces.forEach((f) => [L_EYE, R_EYE, LIPS].forEach((ix) => { poly(fctx, f, ix, w, h); fctx.fill(); }));
  sctx.globalCompositeOperation = "destination-in";
  sctx.filter = `blur(${Math.max(2, w / 320)}px)`;
  sctx.drawImage(fm, 0, 0);
  const b = base.getContext("2d")!;
  b.save(); b.globalAlpha = 0.35 + 0.6 * amount; b.drawImage(soft, 0, 0); b.restore();
}

function paintBackground(ctx: CanvasRenderingContext2D, base: HTMLCanvasElement, o: MagicOpts, w: number, h: number) {
  if (o.bg === "blur") {
    ctx.filter = `blur(${Math.round((w / 1920) * 24)}px)`; ctx.drawImage(base, -30, -30, w + 60, h + 60); ctx.filter = "none";
  } else if (o.bg === "color") {
    ctx.fillStyle = o.color; ctx.fillRect(0, 0, w, h);
  } else if (o.bg === "scene") {
    const [, a, b] = SCENES[o.scene] ?? SCENES[0];
    const g = ctx.createLinearGradient(0, 0, w * 0.4, h); g.addColorStop(0, a); g.addColorStop(1, b);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    [[0.15, 0.2, 0.18], [0.82, 0.3, 0.26], [0.6, 0.85, 0.2]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x * w, y * h, r * h, 0, 7); ctx.fill(); });
  } // "remove" leaves it transparent so the frame colour shows through
}

function geometry(f: Pt[], w: number, h: number) {
  const P = (i: number) => ({ x: f[i].x * w, y: f[i].y * h });
  let a = P(33), b = P(263);
  if (a.x > b.x) [a, b] = [b, a];
  const l = P(234), r = P(454);
  return { eye: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, roll: Math.atan2(b.y - a.y, b.x - a.x), fw: Math.hypot(l.x - r.x, l.y - r.y), top: P(10), nose: P(1), lip: P(0), cheekL: P(50), cheekR: P(280) };
}

function drawProp(ctx: CanvasRenderingContext2D, id: string, g: ReturnType<typeof geometry>) {
  const s = { x: Math.cos(g.roll), y: Math.sin(g.roll) }, u = { x: Math.sin(g.roll), y: -Math.cos(g.roll) }; // along the eyes / up the head
  const at = (p: Pt, ds: number, du: number) => ({ x: p.x + s.x * ds + u.x * du, y: p.y + s.y * ds + u.y * du });
  const emoji = (ch: string, p: Pt, size: number) => {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(g.roll); ctx.font = `${size}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(ch, 0, 0); ctx.restore();
  };
  const tri = (a: Pt, b: Pt, c: Pt, fill: string) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.closePath(); ctx.fill(); };
  const fw = g.fw;
  if (id === "shades") emoji("🕶️", g.eye, fw * 0.95);
  else if (id === "round") emoji("👓", g.eye, fw * 0.9);
  else if (id === "hat") emoji("🎩", at(g.top, 0, fw * 0.3), fw * 1.0);
  else if (id === "crown") emoji("👑", at(g.top, 0, fw * 0.18), fw * 0.8);
  else if (id === "bow") emoji("🎀", at(g.top, fw * 0.3, fw * 0.08), fw * 0.5);
  else if (id === "cat") {
    for (const sign of [-1, 1]) {
      const base = at(g.top, sign * fw * 0.3, -fw * 0.02), apex = at(base, sign * fw * 0.06, fw * 0.42);
      tri(at(base, -fw * 0.17, 0), at(base, fw * 0.17, 0), apex, "#2b2b3a");
      tri(at(base, -fw * 0.09, 0), at(base, fw * 0.09, 0), at(base, sign * fw * 0.04, fw * 0.27), "#ff9ab8");
    }
  } else if (id === "bunny") {
    for (const sign of [-1, 1]) {
      const c = at(g.top, sign * fw * 0.2, fw * 0.5);
      ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#d9d9e3"; ctx.lineWidth = fw * 0.012;
      ctx.beginPath(); ctx.ellipse(c.x, c.y, fw * 0.11, fw * 0.45, g.roll + sign * 0.12, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ffb3c8"; ctx.beginPath(); ctx.ellipse(c.x, c.y, fw * 0.05, fw * 0.32, g.roll + sign * 0.12, 0, 7); ctx.fill();
    }
  } else if (id === "stache") {
    const m = { x: g.nose.x * 0.4 + g.lip.x * 0.6, y: g.nose.y * 0.4 + g.lip.y * 0.6 }, wd = fw * 0.26, hg = fw * 0.1;
    ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(g.roll); ctx.fillStyle = "#3b2a20"; ctx.beginPath();
    ctx.moveTo(0, -hg * 0.2);
    ctx.bezierCurveTo(wd * 0.4, -hg * 0.9, wd * 0.9, -hg * 0.6, wd, hg * 0.3);
    ctx.bezierCurveTo(wd * 0.6, hg * 0.1, wd * 0.3, hg * 0.7, 0, hg * 0.5);
    ctx.bezierCurveTo(-wd * 0.3, hg * 0.7, -wd * 0.6, hg * 0.1, -wd, hg * 0.3);
    ctx.bezierCurveTo(-wd * 0.9, -hg * 0.6, -wd * 0.4, -hg * 0.9, 0, -hg * 0.2);
    ctx.fill(); ctx.restore();
  } else if (id === "blush") {
    [g.cheekL, g.cheekR].forEach((p) => {
      const r = fw * 0.12, gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      gr.addColorStop(0, "rgba(255,90,125,0.5)"); gr.addColorStop(1, "rgba(255,90,125,0)");
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
    });
  } else if (id === "clown") {
    ctx.fillStyle = "#e11d2e"; ctx.beginPath(); ctx.arc(g.nose.x, g.nose.y, fw * 0.07, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.beginPath(); ctx.arc(g.nose.x - fw * 0.02, g.nose.y - fw * 0.02, fw * 0.02, 0, 7); ctx.fill();
  }
}

export function renderMagic(img: HTMLImageElement, mask: HTMLCanvasElement | undefined, faces: Pt[][], o: MagicOpts): HTMLCanvasElement {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const out = mk(w, h), ctx = out.getContext("2d")!;
  const base = mk(w, h);
  base.getContext("2d")!.drawImage(img, 0, 0, w, h);
  if (o.smooth > 0 && faces.length) smoothSkin(base, faces, o.smooth);

  if (o.bg !== "none" && mask) {
    paintBackground(ctx, base, o, w, h);
    const person = mk(w, h), pc = person.getContext("2d")!;
    pc.drawImage(base, 0, 0);
    pc.globalCompositeOperation = "destination-in";
    pc.filter = `blur(${Math.max(1, w / 900)}px)`; // soft edge
    pc.drawImage(mask, 0, 0, w, h);
    ctx.drawImage(person, 0, 0);
  } else ctx.drawImage(base, 0, 0);

  faces.forEach((f) => { const g = geometry(f, w, h); o.props.forEach((p) => drawProp(ctx, p, g)); });
  return out;
}
