import type { FaceLandmarker, ImageSegmenter } from "@mediapipe/tasks-vision";

export type Pt = { x: number; y: number };
export type Analysis = { mask?: HTMLCanvasElement; faces?: Pt[][] };

// Must match the installed package version: npm i @mediapipe/tasks-vision@0.10.14
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const SEG_MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

type Delegate = "GPU" | "CPU";
const withFallback = async <T,>(make: (d: Delegate) => Promise<T>): Promise<T> => {
  try { return await make("GPU"); } catch { return await make("CPU"); }
};

let filesP: Promise<unknown> | null = null;
let segP: Promise<ImageSegmenter> | null = null;
let faceP: Promise<FaceLandmarker> | null = null;

async function load() {
  const mp = await import("@mediapipe/tasks-vision"); // client-only, loaded on first use
  filesP ??= mp.FilesetResolver.forVisionTasks(WASM);
  return { mp, files: (await filesP) as Awaited<ReturnType<typeof mp.FilesetResolver.forVisionTasks>> };
}

function segmenter(): Promise<ImageSegmenter> {
  if (!segP) {
    const p = load().then(({ mp, files }) => withFallback((delegate) => mp.ImageSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetPath: SEG_MODEL, delegate }, runningMode: "IMAGE", outputConfidenceMasks: true, outputCategoryMask: false,
    })));
    p.catch(() => { if (segP === p) segP = null; });
    segP = p;
  }
  return segP as Promise<ImageSegmenter>;
}

function landmarker(): Promise<FaceLandmarker> {
  if (!faceP) {
    const p = load().then(({ mp, files }) => withFallback((delegate) => mp.FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate }, runningMode: "IMAGE", numFaces: 5,
    })));
    p.catch(() => { if (faceP === p) faceP = null; });
    faceP = p;
  }
  return faceP as Promise<FaceLandmarker>;
}

/** Person cut-out as an alpha canvas the same size as the photo. */
async function maskFor(img: HTMLImageElement): Promise<HTMLCanvasElement> {
  const seg = await segmenter();
  const res = seg.segment(img);
  const masks = res.confidenceMasks ?? [];
  let best: { v: Float32Array; w: number; h: number; score: number } | null = null;
  for (const m of masks) {
    const v = new Float32Array(m.getAsFloat32Array()), w = m.width, h = m.height;
    let c = 0, cn = 0, e = 0, en = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const val = v[y * w + x];
      if (x > w * 0.3 && x < w * 0.7 && y > h * 0.25 && y < h * 0.75) { c += val; cn++; }
      else if (x < w * 0.08 || x > w * 0.92 || y < h * 0.08 || y > h * 0.92) { e += val; en++; }
    }
    // The person is normally centred, so the mask that is "on" in the middle and "off" at the edges is the right one
    const score = c / Math.max(cn, 1) - e / Math.max(en, 1);
    if (!best || Math.abs(score) > Math.abs(best.score)) best = { v, w, h, score };
  }
  masks.forEach((m) => m.close());
  (res as { close?: () => void }).close?.();
  if (!best) throw new Error("No mask returned");

  const { v, w, h, score } = best;
  const small = document.createElement("canvas"); small.width = w; small.height = h;
  const sctx = small.getContext("2d")!, data = sctx.createImageData(w, h);
  for (let i = 0; i < v.length; i++) {
    const p = score < 0 ? 1 - v[i] : v[i];
    const t = Math.min(1, Math.max(0, (p - 0.35) / 0.3)); // sharpen the edge a little
    data.data[i * 4 + 3] = Math.round(t * t * (3 - 2 * t) * 255);
  }
  sctx.putImageData(data, 0, 0);
  const out = document.createElement("canvas");
  out.width = img.naturalWidth || img.width; out.height = img.naturalHeight || img.height;
  const octx = out.getContext("2d")!; octx.imageSmoothingQuality = "high";
  octx.drawImage(small, 0, 0, out.width, out.height);
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

let liveP: Promise<FaceLandmarker> | null = null;

/** Face tracker for the live camera (video mode, fewer faces to stay fast). */
export function liveLandmarker(): Promise<FaceLandmarker> {
  if (!liveP) {
    const p = load().then(({ mp, files }) => withFallback((delegate) => mp.FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate }, runningMode: "VIDEO", numFaces: 3, outputFaceBlendshapes: true,
    })));
    p.catch(() => { if (liveP === p) liveP = null; });
    liveP = p;
  }
  return liveP as Promise<FaceLandmarker>;
}
