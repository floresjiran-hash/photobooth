import type { Pt } from "./vision";

export type Expr = { jaw: number; blinkL: number; blinkR: number; smile: number }; // live facial expression scores (0..1)
export type BgMode = "none" | "remove" | "blur" | "color" | "scene";
export type MagicOpts = { bg: BgMode; color: string; scene: number; smooth: number; props: string[] };

export const SCENES: [string, string, string][] = [
  ["Sunset", "#ff7e5f", "#feb47b"], ["Ocean", "#2193b0", "#6dd5ed"], ["Neon", "#7b2ff7", "#f107a3"],
  ["Studio", "#e6e6e6", "#9a9a9a"], ["Forest", "#134e5e", "#71b280"], ["Candy", "#ff9a9e", "#fad0c4"],
];
export const PROPS: [string, string, string][] = [
  ["dog", "Puppy", "🐶"], ["kitty", "Kitty", "🐱"], ["flowers", "Flowers", "🌸"], ["hearteyes", "Heart eyes", "😍"], ["halo", "Angel", "😇"],
  ["devil", "Devil", "😈"], ["glam", "Glam", "💄"], ["sparkle", "Sparkle", "✨"], ["starshades", "Star shades", "⭐"], ["hearts", "Love", "💕"],
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

function geometry(f: Pt[], w: number, h: number, ex?: Expr, id = 0, src?: CanvasImageSource) {
  const P = (i: number) => ({ x: f[i].x * w, y: f[i].y * h });
  let a = P(33), b = P(263);
  if (a.x > b.x) [a, b] = [b, a];
  const l = P(234), r = P(454);
  const mid = (p: Pt, q: Pt) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  let e1 = mid(P(33), P(133)), e2 = mid(P(362), P(263));
  if (e1.x > e2.x) [e1, e2] = [e2, e1];
  const fw = Math.hypot(l.x - r.x, l.y - r.y), up = P(13), lo = P(14);
  const cm = mid(l, r), yaw = Math.asin(Math.max(-1, Math.min(1, (P(1).x - cm.x) / (fw * 0.3)))); // head turn left/right
  return {
    P, f, w, h, src: src as CanvasImageSource, id, ex, yaw, cy: Math.cos(yaw * 0.9), eyeL: e1, eyeR: e2, mouth: mid(up, lo), lower: lo, open: ex ? ex.jaw * 0.35 : Math.hypot(up.x - lo.x, up.y - lo.y) / fw, chin: P(152),
    eye: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, roll: Math.atan2(b.y - a.y, b.x - a.x), fw,
    top: P(10), nose: P(1), lip: P(0), cheekL: P(50), cheekR: P(280),
  };
}

function drawProp(ctx: CanvasRenderingContext2D, id: string, g: ReturnType<typeof geometry>, t = 0) {
  const s = { x: Math.cos(g.roll), y: Math.sin(g.roll) }, u = { x: Math.sin(g.roll), y: -Math.cos(g.roll) }; // along the eyes / up the head
  const at = (p: Pt, ds: number, du: number) => ({ x: p.x + s.x * ds * g.cy + u.x * du, y: p.y + s.y * ds * g.cy + u.y * du });
  const emoji = (ch: string, p: Pt, size: number) => {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(g.roll); ctx.scale(g.cy, 1); ctx.font = `${size}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(ch, 0, 0); ctx.restore();
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
    const sw = swing(g, t);
    for (const sign of [-1, 1]) {
      const dir = g.roll + sign * 0.12 - sw, pv = at(g.top, sign * fw * 0.2, fw * 0.05), c = { x: pv.x + Math.sin(dir) * fw * 0.45, y: pv.y - Math.cos(dir) * fw * 0.45 };
      ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#d9d9e3"; ctx.lineWidth = fw * 0.012;
      ctx.beginPath(); ctx.ellipse(c.x, c.y, fw * 0.11, fw * 0.45, dir, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ffb3c8"; ctx.beginPath(); ctx.ellipse(c.x, c.y, fw * 0.05, fw * 0.32, dir, 0, 7); ctx.fill();
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
  } else drawLook(ctx, id, g, t);
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

  faces.forEach((f) => { const g = geometry(f, w, h, undefined, 0, base); o.props.forEach((p) => drawProp(ctx, p, g, 1)); });
  return out;
}

/** Draw the chosen props on every detected face (used by the live camera). */
const pop = new Map<string, number>();
const easeOutBack = (x: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

// Spring that makes floppy ears sway when the head moves (secondary motion)
const motion = new Map<number, { ang: number; vel: number; lx: number; lt: number }>();
function swing(g: ReturnType<typeof geometry>, t: number) {
  let m = motion.get(g.id);
  if (!m) { m = { ang: 0, vel: 0, lx: g.top.x, lt: t }; motion.set(g.id, m); }
  const dt = Math.min(0.05, Math.max(0.001, t - m.lt));
  const dx = (g.top.x - m.lx) / g.fw / dt; // head speed in face-widths per second
  m.vel += (-60 * m.ang - 6 * m.vel + dx * 30) * dt;
  m.ang = Math.max(-0.6, Math.min(0.6, m.ang + m.vel * dt));
  m.lx = g.top.x; m.lt = t;
  return m.ang;
}

export function drawProps(ctx: CanvasRenderingContext2D, faces: Pt[][], ids: string[], w: number, h: number, t = 0, ex: (Expr | undefined)[] = [], src?: CanvasImageSource) {
  ids.forEach((id) => { if (!pop.has(id)) pop.set(id, t); });
  [...pop.keys()].forEach((k) => { if (!ids.includes(k)) pop.delete(k); });
  faces.forEach((f, i) => {
    const g = geometry(f, w, h, ex[i], i, src);
    ids.forEach((id) => {
      const k = easeOutBack(Math.min(1, (t - (pop.get(id) ?? t - 1)) / 0.4)); // filters pop in like the real apps
      ctx.save(); ctx.translate(g.eye.x, g.eye.y); ctx.scale(k, k); ctx.translate(-g.eye.x, -g.eye.y);
      drawProp(ctx, id, g, t); ctx.restore();
    });
  });
}

// ---------- Snapchat-style looks (vector art, animated with t = seconds) ----------
export type Geo = ReturnType<typeof geometry>;

const heart = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  ctx.beginPath(); ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.5, y - r * 0.2, x - r * 0.7, y - r * 1.3, x, y - r * 0.45);
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.3, x + r * 1.5, y - r * 0.2, x, y + r * 0.9); ctx.closePath();
};
const star = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, n = 5, inner = 0.45, rot = -Math.PI / 2) => {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 ? r * inner : r, a = rot + (i * Math.PI) / n;
    if (i) ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); else ctx.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
};

function drawLook(ctx: CanvasRenderingContext2D, id: string, g: Geo, t: number) {
  const fw = g.fw;
  const s = { x: Math.cos(g.roll), y: Math.sin(g.roll) }, u = { x: Math.sin(g.roll), y: -Math.cos(g.roll) };
  const at = (p: Pt, ds: number, du: number) => ({ x: p.x + s.x * ds * g.cy + u.x * du, y: p.y + s.y * ds * g.cy + u.y * du });
  const grad = (a: Pt, b: Pt, c0: string, c1: string) => { const gr = ctx.createLinearGradient(a.x, a.y, b.x, b.y); gr.addColorStop(0, c0); gr.addColorStop(1, c1); return gr; };
  ctx.save();
  if (id === "dog") {
    const sw = swing(g, t);
    for (const sign of [-1, 1]) {
      const c = at(g.top, sign * fw * 0.42, -fw * 0.05);
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(g.roll + sign * 0.35 + sw);
      ctx.fillStyle = grad({ x: 0, y: -fw * 0.2 }, { x: 0, y: fw * 0.4 }, "#b07a52", "#6b4226");
      ctx.beginPath(); ctx.ellipse(0, fw * 0.12, fw * 0.13, fw * 0.28, 0, 0, 7); ctx.fill(); ctx.restore();
    }
    ctx.save(); ctx.translate(g.nose.x, g.nose.y); ctx.rotate(g.roll);
    ctx.fillStyle = "#1d1d22"; ctx.beginPath(); ctx.ellipse(0, 0, fw * 0.075, fw * 0.055, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.ellipse(-fw * 0.025, -fw * 0.02, fw * 0.022, fw * 0.012, 0, 0, 7); ctx.fill(); ctx.restore();
    if (g.open > 0.05) { // tongue only when the mouth is open
      const len = fw * (0.12 + Math.min(g.open, 0.3) * 0.5);
      ctx.save(); ctx.translate(g.lower.x, g.lower.y); ctx.rotate(g.roll);
      ctx.fillStyle = grad({ x: 0, y: 0 }, { x: 0, y: len }, "#ff9db0", "#ff6f8e"); ctx.beginPath(); ctx.roundRect(-fw * 0.06, 0, fw * 0.12, len, fw * 0.06); ctx.fill();
      ctx.strokeStyle = "#e0607e"; ctx.lineWidth = fw * 0.008; ctx.beginPath(); ctx.moveTo(0, fw * 0.01); ctx.lineTo(0, len * 0.7); ctx.stroke(); ctx.restore();
    }
  } else if (id === "kitty") {
    drawProp(ctx, "cat", g, t);
    ctx.save(); ctx.translate(g.nose.x, g.nose.y); ctx.rotate(g.roll); ctx.fillStyle = "#ff7aa2";
    ctx.beginPath(); ctx.moveTo(-fw * 0.045, -fw * 0.02); ctx.lineTo(fw * 0.045, -fw * 0.02); ctx.lineTo(0, fw * 0.03); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = fw * 0.012; ctx.lineCap = "round"; ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = fw * 0.02;
    for (const sign of [-1, 1]) for (const k of [-1, 0, 1]) {
      const a = at(g.nose, sign * fw * 0.13, -fw * 0.02), b = at(a, sign * fw * 0.36, k * fw * 0.07);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  } else if (id === "flowers") {
    const cols = ["#ff8fab", "#ffd166", "#ffffff", "#c77dff", "#ff9e6d"], n = 9;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.08 + (0.84 * i) / (n - 1)), p = at(g.top, -Math.cos(a) * fw * 0.55, fw * (0.03 + 0.09 * Math.sin(a)));
      const r = fw * (0.045 + (i % 2) * 0.012);
      ctx.fillStyle = "#3a9d5d"; ctx.beginPath(); ctx.ellipse(p.x + r * 1.6, p.y + r * 0.5, r * 1.1, r * 0.45, g.roll + 0.5, 0, 7); ctx.fill();
      ctx.fillStyle = cols[i % cols.length];
      for (let k = 0; k < 5; k++) { const ang = g.roll + (k * Math.PI * 2) / 5; ctx.beginPath(); ctx.arc(p.x + Math.cos(ang) * r, p.y + Math.sin(ang) * r, r * 0.8, 0, 7); ctx.fill(); }
      ctx.fillStyle = "#ffb703"; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.6, 0, 7); ctx.fill();
    }
  } else if (id === "hearteyes") {
    const k = 1 + 0.12 * Math.sin(t * 7);
    for (const e of [g.eyeL, g.eyeR]) {
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(g.roll); ctx.scale(g.cy, 1 - 0.85 * (g.ex ? (g.ex.blinkL + g.ex.blinkR) / 2 : 0)); // eyes squash when you blink
      ctx.fillStyle = grad({ x: 0, y: -fw * 0.1 }, { x: 0, y: fw * 0.1 }, "#ff5c7a", "#d6143c"); heart(ctx, 0, 0, fw * 0.1 * k); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.ellipse(-fw * 0.04 * k, -fw * 0.04 * k, fw * 0.02, fw * 0.012, -0.6, 0, 7); ctx.fill(); ctx.restore();
    }
  } else if (id === "halo") {
    const c = at(g.top, 0, fw * 0.32 + Math.sin(t * 3) * fw * 0.012);
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(g.roll); ctx.shadowColor = "rgba(255,214,90,.9)"; ctx.shadowBlur = fw * 0.1;
    ctx.strokeStyle = grad({ x: -fw * 0.3, y: 0 }, { x: fw * 0.3, y: 0 }, "#fff3b0", "#f5b301"); ctx.lineWidth = fw * 0.045;
    ctx.beginPath(); ctx.ellipse(0, 0, fw * 0.32, fw * 0.08, 0, 0, 7); ctx.stroke(); ctx.restore();
  } else if (id === "devil") {
    for (const sign of [-1, 1]) {
      const base = at(g.top, sign * fw * 0.3, 0), tip = at(base, sign * fw * 0.1, fw * 0.38);
      ctx.fillStyle = grad(base, tip, "#8b0000", "#ff3b30"); ctx.beginPath();
      const p = at(base, -fw * 0.07, 0); ctx.moveTo(p.x, p.y);
      const c1 = at(base, -sign * fw * 0.05, fw * 0.25), c2 = at(base, sign * fw * 0.12, fw * 0.2), q = at(base, fw * 0.07, 0);
      ctx.quadraticCurveTo(c1.x, c1.y, tip.x, tip.y); ctx.quadraticCurveTo(c2.x, c2.y, q.x, q.y); ctx.closePath(); ctx.fill();
    }
  } else if (id === "glam") {
    ctx.beginPath(); LIPS.forEach((i, k) => { const p = g.P(i); if (k) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.closePath();
    ctx.fillStyle = "rgba(214,20,80,.5)"; ctx.fill();
    for (const e of [g.eyeL, g.eyeR]) {
      const c = at(e, 0, fw * 0.04); ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(g.roll);
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, fw * 0.14); gr.addColorStop(0, "rgba(176,92,255,.55)"); gr.addColorStop(1, "rgba(176,92,255,0)");
      ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(0, 0, fw * 0.14, fw * 0.08, 0, 0, 7); ctx.fill(); ctx.restore();
    }
    drawProp(ctx, "blush", g, t);
    for (let i = 0; i < 8; i++) { // glitter on the cheekbones
      const side = i % 2 ? g.cheekR : g.cheekL, tw = 0.5 + 0.5 * Math.sin(t * 5 + i * 2);
      const p = at(side, (i % 2 ? 1 : -1) * fw * 0.04 * (i % 4), -fw * 0.1 + fw * 0.02 * (i % 3));
      ctx.globalAlpha = 0.4 + 0.6 * tw; ctx.fillStyle = "#fff6c2"; star(ctx, p.x, p.y, fw * (0.012 + 0.015 * tw), 4, 0.3); ctx.fill();
    }
  } else if (id === "sparkle") {
    for (let i = 0; i < 12; i++) {
      const rad = fw * (0.62 + (0.18 * ((i * 37) % 5)) / 5), tw = 0.5 + 0.5 * Math.sin(t * 4 + i * 1.7);
      const p = { x: g.eye.x + Math.cos(i * 2.399) * rad, y: g.eye.y + Math.sin(i * 2.399) * rad * 0.9 - fw * 0.1 };
      ctx.globalAlpha = 0.35 + 0.65 * tw; ctx.fillStyle = i % 3 ? "#fff6c2" : "#ffd23f"; star(ctx, p.x, p.y, fw * (0.03 + 0.04 * tw), 4, 0.28); ctx.fill();
    }
  } else if (id === "starshades") {
    ctx.lineJoin = "round";
    for (const e of [g.eyeL, g.eyeR]) {
      star(ctx, e.x, e.y, fw * 0.17, 5, 0.5, -Math.PI / 2 + g.roll);
      ctx.fillStyle = "rgba(255,60,150,.45)"; ctx.fill(); ctx.lineWidth = fw * 0.03; ctx.strokeStyle = "#ff2d95"; ctx.stroke();
    }
    const a = at(g.eyeL, fw * 0.13, 0), b = at(g.eyeR, -fw * 0.13, 0);
    ctx.lineWidth = fw * 0.02; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  } else if (id === "hearts") {
    const n = g.ex && g.ex.smile > 0.45 ? 12 : 7; // smile and more hearts appear
    for (let i = 0; i < n; i++) {
      const ph = (t * 0.35 + i / n) % 1, p = at(g.top, Math.sin(i * 2.1 + t * 1.3) * fw * 0.45, fw * 0.05 + ph * fw * 0.9);
      ctx.globalAlpha = Math.sin(Math.PI * ph); ctx.fillStyle = i % 2 ? "#ff5c7a" : "#ff9ab8"; heart(ctx, p.x, p.y, fw * (0.05 + 0.025 * (i % 3))); ctx.fill();
    }
  }
  ctx.restore();
}