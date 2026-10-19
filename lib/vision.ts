import type { FaceLandmarker, HandLandmarker, ImageSegmenter } from "@mediapipe/tasks-vision";

export type Pt = { x: number; y: number };
export type Analysis = { mask?: HTMLCanvasElement; faces?: Pt[][] };

// Must match the installed package version: npm i @mediapipe/tasks-vision@0.10.14
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const SEG_MULTI = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite";
const SEG_LITE = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const HAND_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

type Delegate = "GPU" | "CPU";
const withFallback = async <T,>(make: (d: Delegate) => Promise<T>): Promise<T> => {
  try { return await make("GPU"); } catch { return await make("CPU"); }
};

let filesP: Promise<unknown> | null = null;
let segP: Promise<ImageSegmenter> | null = null;
let faceP: Promise<FaceLandmarker> | null = null;
let handP: Promise<HandLandmarker> | null = null;
let liveP: Promise<FaceLandmarker> | null = null;

async function load() {
  const mp = await import("@mediapipe/tasks-vision"); // client-only, loaded on first use
  filesP ??= mp.FilesetResolver.forVisionTasks(WASM);
  return { mp, files: (await filesP) as Awaited<ReturnType<typeof mp.FilesetResolver.forVisionTasks>> };
}

function once<T>(get: () => Promise<T>, cur: Promise<T> | null, set: (p: Promise<T> | null) => void): Promise<T> {
  if (cur) return cur;
  const p = get();
  p.catch(() => set(null));
  set(p);
  return p;
}

// Multi-class model first (it labels hands, arms, hair, clothes and held items as "person"); the lite model is the fallback
const segmenter = () => once(() => load().then(async ({ mp, files }) => {
  const make = (model: string) => withFallback((delegate) => mp.ImageSegmenter.createFromOptions(files, {
    baseOptions: { modelAssetPath: model, delegate }, runningMode: "IMAGE", outputConfidenceMasks: true, outputCategoryMask: false,
  }));
  try { return await make(SEG_MULTI); } catch { return await make(SEG_LITE); }
}), segP, (p) => { segP = p; });

const landmarker = () => once(() => load().then(({ mp, files }) => withFallback((delegate) => mp.FaceLandmarker.createFromOptions(files, {
  baseOptions: { modelAssetPath: FACE_MODEL, delegate }, runningMode: "IMAGE", numFaces: 5,
}))), faceP, (p) => { faceP = p; });

const handLandmarker = () => once(() => load().then(({ mp, files }) => withFallback((delegate) => mp.HandLandmarker.createFromOptions(files, {
  baseOptions: { modelAssetPath: HAND_MODEL, delegate }, runningMode: "IMAGE", numHands: 4, minHandDetectionConfidence: 0.2, minHandPresenceConfidence: 0.2,
}))), handP, (p) => { handP = p; });

/** Face tracker for the live camera (video mode, fewer faces to stay fast). */
export const liveLandmarker = () => once(() => load().then(({ mp, files }) => withFallback((delegate) => mp.FaceLandmarker.createFromOptions(files, {
  baseOptions: { modelAssetPath: FACE_MODEL, delegate }, runningMode: "VIDEO", numFaces: 3, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
}))), liveP, (p) => { liveP = p; });

// ---------- Cut-out: several passes so hands and arms are kept ----------
type Src = HTMLImageElement | HTMLCanvasElement;
const canvasOf = (w: number, h: number) => Object.assign(document.createElement("canvas"), { width: Math.max(2, Math.round(w)), height: Math.max(2, Math.round(h)) });
const BONES: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
const PALM = [0, 1, 5, 9, 13, 17];

/** One segmentation pass: an alpha canvas (w x h) where the person is opaque. */
async function alphaFor(src: Src, w: number, h: number): Promise<HTMLCanvasElement> {
  const seg = await segmenter();
  const res = seg.segment(src);
  const masks = res.confidenceMasks ?? [];
  if (!masks.length) throw new Error("No mask returned");
  const mw = masks[0].width, mh = masks[0].height, person = new Float32Array(mw * mh);
  if (masks.length >= 2) {
    // multi-class: mask 0 is the background, so everything else (hands, arms, hair, clothes, held items) is the person
    const bg = masks[0].getAsFloat32Array();
    for (let i = 0; i < person.length; i++) person[i] = 1 - bg[i];
  } else {
    // single-mask model: pick the orientation where the middle of the photo is "person" and the border is not
    const v = masks[0].getAsFloat32Array();
    let c = 0, cn = 0, e = 0, en = 0;
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      const val = v[y * mw + x];
      if (x > mw * 0.3 && x < mw * 0.7 && y > mh * 0.25 && y < mh * 0.75) { c += val; cn++; }
      else if (x < mw * 0.08 || x > mw * 0.92 || y < mh * 0.08 || y > mh * 0.92) { e += val; en++; }
    }
    const flip = c / Math.max(cn, 1) - e / Math.max(en, 1) < 0;
    for (let i = 0; i < person.length; i++) person[i] = flip ? 1 - v[i] : v[i];
  }
  masks.forEach((m) => m.close());
  (res as { close?: () => void }).close?.();
  const small = canvasOf(mw, mh), sctx = small.getContext("2d")!, data = sctx.createImageData(mw, mh);
  for (let i = 0; i < person.length; i++) {
    const t = Math.min(1, Math.max(0, (person[i] - 0.22) / 0.4)); // leans towards keeping the person
    data.data[i * 4 + 3] = Math.round(t * t * (3 - 2 * t) * 255);
  }
  sctx.putImageData(data, 0, 0);
  const out = canvasOf(w, h), octx = out.getContext("2d")!;
  octx.imageSmoothingQuality = "high"; octx.drawImage(small, 0, 0, out.width, out.height);
  return out;
}

/** out = max(out, layer) on the alpha channel, with the layer placed at (x, y, w, h). */
function unionAlpha(out: HTMLCanvasElement, layer: HTMLCanvasElement, x: number, y: number, w: number, h: number) {
  const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y)), x1 = Math.min(out.width, Math.ceil(x + w)), y1 = Math.min(out.height, Math.ceil(y + h));
  if (x1 <= x0 || y1 <= y0) return;
  const tmp = canvasOf(x1 - x0, y1 - y0), tx = tmp.getContext("2d", { willReadFrequently: true })!;
  tx.drawImage(layer, x - x0, y - y0, w, h);
  const a = tx.getImageData(0, 0, tmp.width, tmp.height), octx = out.getContext("2d", { willReadFrequently: true })!, b = octx.getImageData(x0, y0, tmp.width, tmp.height);
  for (let i = 3; i < a.data.length; i += 4) if (a.data[i] > b.data[i]) b.data[i] = a.data[i];
  octx.putImageData(b, x0, y0);
}

function personBox(out: HTMLCanvasElement) {
  const s = 96 / Math.max(out.width, out.height), w = Math.max(2, Math.round(out.width * s)), h = Math.max(2, Math.round(out.height * s));
  const c = canvasOf(w, h), cx = c.getContext("2d", { willReadFrequently: true })!;
  cx.drawImage(out, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 128) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return x1 < 0 ? null : { x: x0 / s, y: y0 / s, w: (x1 - x0 + 1) / s, h: (y1 - y0 + 1) / s };
}

function cropOf(img: Src, x: number, y: number, w: number, h: number, max: number) {
  const s = Math.min(1, max / Math.max(w, h)), c = canvasOf(w * s, h * s);
  c.getContext("2d")!.drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
  return c;
}

const handsOf = async (src: Src): Promise<Pt[][]> => (await handLandmarker()).detect(src).landmarks.map((l) => l.map((p) => ({ x: p.x, y: p.y })));

/** Zoomed pass on one hand: the model sees the hand large, and only what lies in a hand-shaped zone is added.
 *  The palm and finger skeleton are always kept. */
async function addHand(out: HTMLCanvasElement, img: Src, hand: Pt[]) {
  const W = out.width, H = out.height, P = (i: number) => ({ x: hand[i].x * W, y: hand[i].y * H });
  const palmW = Math.max(8, Math.hypot(P(5).x - P(17).x, P(5).y - P(17).y));
  const xs = hand.map((p) => p.x * W), ys = hand.map((p) => p.y * H);
  const mnx = Math.min(...xs), mxx = Math.max(...xs), mny = Math.min(...ys), mxy = Math.max(...ys);
  const side = Math.max(mxx - mnx, mxy - mny) * 1.9 + palmW, cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2;
  const rx = Math.max(0, cx - side / 2), ry = Math.max(0, cy - side / 2), rw = Math.min(W - rx, side), rh = Math.min(H - ry, side);
  if (rw < 8 || rh < 8) return;
  const crop = cropOf(img, rx, ry, rw, rh, 512), k = crop.width / rw;
  const a = await alphaFor(crop, crop.width, crop.height);
  const Q = (i: number) => ({ x: (P(i).x - rx) * k, y: (P(i).y - ry) * k });
  const shape = (c: CanvasRenderingContext2D, lw: number) => {
    c.strokeStyle = "#fff"; c.fillStyle = "#fff"; c.lineCap = "round"; c.lineJoin = "round"; c.lineWidth = lw * k;
    BONES.forEach(([i, j]) => { c.beginPath(); c.moveTo(Q(i).x, Q(i).y); c.lineTo(Q(j).x, Q(j).y); c.stroke(); });
    c.beginPath(); PALM.forEach((i, n) => (n ? c.lineTo(Q(i).x, Q(i).y) : c.moveTo(Q(i).x, Q(i).y))); c.closePath(); c.fill();
  };
  const ax = a.getContext("2d")!, zone = canvasOf(crop.width, crop.height);
  shape(zone.getContext("2d")!, palmW * 0.75);
  ax.globalCompositeOperation = "destination-in"; ax.drawImage(zone, 0, 0);
  ax.globalCompositeOperation = "source-over"; shape(ax, palmW * 0.26);
  unionAlpha(out, a, rx, ry, rw, rh);
}

/** Person cut-out as an alpha canvas the same size as the photo.
 *  Pass 1: whole photo. Pass 2: zoom on the person. Pass 3: zoom on each hand (found by the hand model). */
async function maskFor(img: HTMLImageElement): Promise<HTMLCanvasElement> {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const out = await alphaFor(img, W, H);
  let zoom: { crop: HTMLCanvasElement; x: number; y: number; w: number; h: number } | null = null;
  try {
    const box = personBox(out);
    if (box) {
      const m = 0.2, x0 = Math.max(0, box.x - box.w * m), y0 = Math.max(0, box.y - box.h * m), x1 = Math.min(W, box.x + box.w * (1 + m)), y1 = Math.min(H, box.y + box.h * (1 + m));
      if ((x1 - x0) * (y1 - y0) < W * H * 0.85) {
        const crop = cropOf(img, x0, y0, x1 - x0, y1 - y0, 640);
        unionAlpha(out, await alphaFor(crop, crop.width, crop.height), x0, y0, x1 - x0, y1 - y0);
        zoom = { crop, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      }
    }
  } catch { /* the first pass is still usable */ }
  try { // hands are a bonus: if the hand model can't load, the cut-out still works
    let hands = await handsOf(img);
    if (!hands.length && zoom) hands = (await handsOf(zoom.crop)).map((hd) => hd.map((p) => ({ x: (zoom!.x + p.x * zoom!.w) / W, y: (zoom!.y + p.y * zoom!.h) / H }))); // second chance on the zoomed crop
    for (const hand of hands) await addHand(out, img, hand);
  } catch { /* keep the cut-out so far */ }
  return out;
}

async function facesFor(img: HTMLImageElement): Promise<Pt[][]> {
  const fl = await landmarker();
  return fl.detect(img).faceLandmarks.map((f) => f.map((p) => ({ x: p.x, y: p.y })));
}

const cache = new Map<string, Analysis>(); // one AI pass per photo, reused while the customer tweaks options

export async function analyze(img: HTMLImageElement, key: string, needMask: boolean, needFaces: boolean): Promise<Analysis> {
  const a = cache.get(key) ?? {};
  cache.set(key, a);
  if (needMask && !a.mask) a.mask = await maskFor(img);
  if (needFaces && !a.faces) a.faces = await facesFor(img);
  return a;
}