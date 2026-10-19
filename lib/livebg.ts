export type BgId = "none" | "blur" | "studio" | "sunset" | "ocean" | "neon" | "night" | "party" | "hearts" | "green" | "white" | "black" | "custom";

/** Choices shown in the Live background picker. `css` is only used for the little preview tile. */
export const LIVE_BGS: { id: BgId; label: string; css: string }[] = [
  { id: "none", label: "None", css: "#ffffff" },
  { id: "blur", label: "Blur", css: "linear-gradient(135deg,#cfd8e3,#8fa3b8)" },
  { id: "studio", label: "Studio", css: "radial-gradient(circle,#f5f5f7,#85858f)" },
  { id: "sunset", label: "Sunset", css: "linear-gradient(#2b1055,#d4417e 45%,#ff9a5a 75%,#ffd08a)" },
  { id: "ocean", label: "Ocean", css: "linear-gradient(#0b3d91,#4cc9f0)" },
  { id: "neon", label: "Neon", css: "linear-gradient(#120042,#ff2bd6)" },
  { id: "night", label: "Night", css: "linear-gradient(#050b24,#1d2b64)" },
  { id: "party", label: "Party", css: "linear-gradient(135deg,#7f5af0,#ff7eb3)" },
  { id: "hearts", label: "Hearts", css: "linear-gradient(#ffd1e8,#ff8fb8)" },
  { id: "green", label: "Green", css: "#00b140" },
  { id: "white", label: "White", css: "#ffffff" },
  { id: "black", label: "Black", css: "#000000" },
];

const hash = (n: number) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

const heart = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  ctx.beginPath(); ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.5, y - r * 0.2, x - r * 0.7, y - r * 1.3, x, y - r * 0.45);
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.3, x + r * 1.5, y - r * 0.2, x, y + r * 0.9); ctx.closePath();
};

function vgrad(ctx: CanvasRenderingContext2D, w: number, h: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

/** Paints the chosen backdrop over the whole canvas. t = seconds (the animated ones move). */
export function paintBg(ctx: CanvasRenderingContext2D, id: BgId, w: number, h: number, t: number, video?: CanvasImageSource, custom?: HTMLImageElement | null) {
  ctx.save();
  if (id === "blur" && video) {
    ctx.filter = `blur(${Math.round((w / 1920) * 22)}px)`; ctx.drawImage(video, -30, -30, w + 60, h + 60); ctx.filter = "none";
  } else if (id === "studio") {
    const g = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.5, Math.max(w, h) * 0.75); g.addColorStop(0, "#f5f5f7"); g.addColorStop(1, "#85858f");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  } else if (id === "sunset") {
    vgrad(ctx, w, h, [[0, "#2b1055"], [0.45, "#d4417e"], [0.75, "#ff9a5a"], [1, "#ffd08a"]]);
    const g = ctx.createRadialGradient(w / 2, h * 0.66, 0, w / 2, h * 0.66, h * 0.26); g.addColorStop(0, "rgba(255,244,190,1)"); g.addColorStop(0.45, "rgba(255,170,90,.85)"); g.addColorStop(1, "rgba(255,120,80,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  } else if (id === "ocean") {
    vgrad(ctx, w, h, [[0, "#0b3d91"], [1, "#4cc9f0"]]);
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = `rgba(255,255,255,${0.12 + 0.05 * k})`; ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += w / 60) ctx.lineTo(x, h * (0.62 + 0.1 * k) + Math.sin((x / w) * 8 + t * (1 + k * 0.4)) * h * 0.015);
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    }
  } else if (id === "neon") {
    vgrad(ctx, w, h, [[0, "#120042"], [0.55, "#6a11cb"], [1, "#ff2bd6"]]);
    const hz = h * 0.55; ctx.strokeStyle = "rgba(255,140,255,.7)"; ctx.lineWidth = Math.max(1, w / 700);
    for (let i = -12; i <= 12; i++) { ctx.beginPath(); ctx.moveTo(w / 2 + i * w * 0.015, hz); ctx.lineTo(w / 2 + i * w * 0.14, h); ctx.stroke(); }
    for (let k = 0; k < 9; k++) { const y = hz + (h - hz) * Math.pow((k + ((t * 0.5) % 1)) / 9, 2); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  } else if (id === "night") {
    vgrad(ctx, w, h, [[0, "#050b24"], [1, "#1d2b64"]]);
    for (let i = 0; i < 90; i++) { ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i)); ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(hash(i) * w, hash(i + 500) * h * 0.8, 1 + hash(i + 900) * 2.2, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1; ctx.shadowColor = "rgba(255,246,214,.8)"; ctx.shadowBlur = h * 0.05; ctx.fillStyle = "#fff6d6"; ctx.beginPath(); ctx.arc(w * 0.82, h * 0.2, h * 0.07, 0, 7); ctx.fill();
  } else if (id === "party") {
    vgrad(ctx, w, h, [[0, "#7f5af0"], [1, "#ff7eb3"]]);
    const cols = ["#ffd23f", "#2bd9a0", "#ffffff", "#2f4bff", "#ff5d73"];
    for (let i = 0; i < 70; i++) {
      const x = hash(i) * w + Math.sin(t * 1.5 + i) * w * 0.01, y = (hash(i + 300) * h + t * h * (0.08 + 0.12 * hash(i + 600))) % h, s = w * (0.005 + 0.006 * hash(i + 800));
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 3 + i); ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(-s, -s / 2, s * 2, s); ctx.restore();
    }
  } else if (id === "hearts") {
    vgrad(ctx, w, h, [[0, "#ffd1e8"], [1, "#ff8fb8"]]);
    ctx.fillStyle = "rgba(255,255,255,.55)";
    for (let i = 0; i < 16; i++) { const y = h * 1.1 - ((hash(i + 99) * h + t * h * 0.06 * (1 + hash(i + 50))) % (h * 1.2)); heart(ctx, hash(i) * w, y, h * (0.03 + 0.04 * hash(i + 7))); ctx.fill(); }
  } else if (id === "green" || id === "white" || id === "black") {
    ctx.fillStyle = id === "green" ? "#00b140" : id === "white" ? "#ffffff" : "#000000"; ctx.fillRect(0, 0, w, h);
  } else if (id === "custom" && custom && custom.width) {
    const s = Math.max(w / custom.width, h / custom.height), dw = custom.width * s, dh = custom.height * s;
    ctx.drawImage(custom, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else if (video) ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();
}
