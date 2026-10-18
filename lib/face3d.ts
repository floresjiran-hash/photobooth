import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Pt } from "./vision";

/**
 * Real 3D props for the live camera. MediaPipe gives each face a pose (rotation in 3D), so the models turn,
 * tilt and nod with your head. Models live in "head space": 1 unit = face width, origin between the eyes,
 * +y up, +z toward the viewer.
 *
 * Scene layout (per face):  root (eye midpoint, face rotation, face-width scale)
 *   ├─ occluder   invisible head ellipsoid: writes depth only, so parts behind the head are hidden when you turn
 *   └─ dog | bear | roblox   model groups, each with its own parts
 */
const MAXF = 3;
type Id = "dog" | "bear" | "roblox";
type Model = { group: THREE.Group; ears?: THREE.Group[]; tongue?: THREE.Mesh; nose?: THREE.Mesh };

/** Nudge a whole prop: x right, y up, z toward the viewer (units = face width), s = size multiplier. */
export const TUNE: Record<Id, { x: number; y: number; z: number; s: number }> = {
  dog: { x: 0, y: 0, z: 0, s: 1 },
  bear: { x: 0, y: 0, z: 0, s: 1 },
  roblox: { x: 0, y: 0, z: 0, s: 1 },
};

// Tap the video to cycle these colour sets
const VARIANTS = [
  { dogEar: 0xc99a63, dogPad: 0xd6a96f, bear: 0x9a6a3e, bearMuz: 0xb98656, cap: 0x151515, brim: 0xd9381e },
  { dogEar: 0x2b2b2b, dogPad: 0x3a3a3a, bear: 0xf3eadf, bearMuz: 0xf7c9d6, cap: 0x1f4fd8, brim: 0xffffff },
  { dogEar: 0xf2f2f2, dogPad: 0xffffff, bear: 0x2b2b2b, bearMuz: 0x555555, cap: 0xff5fa2, brim: 0xffd23f },
];

const phys = (color: number, rough: number, metal = 0, coat = 0, sheen = 0) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: metal, clearcoat: coat, clearcoatRoughness: 0.12, sheen, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xffffff) });

let mats: Record<string, THREE.MeshPhysicalMaterial> | null = null;
const M = () => (mats ??= {
  dogEar: phys(0xc99a63, 0.9, 0, 0, 0.6), dogPad: phys(0xd6a96f, 0.85, 0, 0, 0.5), pink: phys(0xe9aaa6, 0.9, 0, 0, 0.4),
  dogNose: phys(0x2a1a1c, 0.25, 0.1, 1), tongue: phys(0xff7f99, 0.45, 0, 0.6),
  bear: phys(0x9a6a3e, 0.95, 0, 0, 0.6), bearIn: phys(0x2a1d17, 0.95), bearMuz: phys(0xb98656, 0.9, 0, 0, 0.5), bearNose: phys(0x140d0b, 0.25, 0.1, 1), line: phys(0x111111, 0.6),
  cap: phys(0x151515, 0.7, 0, 0.25, 0.3), brim: Object.assign(phys(0xd9381e, 0.45, 0, 0.5), { side: THREE.DoubleSide }),
});

const blob = (r: number, sx: number, sy: number, sz: number, m: THREE.Material) => {
  const o = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), m);
  o.scale.set(sx, sy, sz);
  return o;
};

function buildDog(): Model {
  const m = M(), g = new THREE.Group(), ears: THREE.Group[] = [];
  for (const sign of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(sign * 0.36, 0.6, -0.2); pivot.userData.sign = sign;
    const outer = blob(0.17, 0.8, 1.3, 0.32, m.dogEar); outer.position.set(0, -0.17, 0);
    const inner = blob(0.12, 0.6, 1.05, 0.25, m.pink); inner.position.set(-sign * 0.01, -0.17, 0.05);
    pivot.add(outer, inner); ears.push(pivot); g.add(pivot);
  }
  const pad = blob(0.17, 1, 0.75, 0.7, m.dogPad); pad.position.set(0, -0.36, 0.2);
  const nose = blob(0.075, 1.2, 0.85, 0.9, m.dogNose); nose.position.set(0, -0.31, 0.31); nose.userData.base = nose.scale.clone();
  const tongue = blob(0.07, 0.9, 1, 0.3, m.tongue); tongue.position.set(0, -0.62, 0.2);
  g.add(pad, nose, tongue);
  return { group: g, ears, tongue, nose };
}

function buildBear(): Model {
  const m = M(), g = new THREE.Group();
  for (const sign of [-1, 1]) {
    const ear = blob(0.18, 1, 1, 0.55, m.bear); ear.position.set(sign * 0.34, 0.58, -0.2);
    const inner = blob(0.105, 1, 1, 0.5, m.bearIn); inner.position.set(sign * 0.34, 0.575, -0.13);
    g.add(ear, inner);
  }
  const muzzle = blob(0.2, 1, 0.95, 0.6, m.bearMuz); muzzle.position.set(0, -0.38, 0.18);
  const nose = blob(0.09, 1.1, 0.8, 0.8, m.bearNose); nose.position.set(0, -0.3, 0.29); nose.userData.base = nose.scale.clone();
  const ln = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.16, 0.014), m.line); ln.position.set(0, -0.42, 0.3);
  g.add(muzzle, nose, ln);
  return { group: g, nose };
}

function buildRoblox(): Model {
  const m = M(), g = new THREE.Group();
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.62, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2), m.cap);
  crown.scale.set(1, 1, 0.85); crown.position.set(0, 0.18, -0.3);
  const brim = new THREE.Mesh(new THREE.CircleGeometry(0.62, 40, 0, Math.PI), m.brim);
  brim.geometry.rotateX(Math.PI / 2); brim.scale.set(1, 1, 0.62); brim.position.set(0, 0.17, 0.2); brim.rotation.x = 0.2;
  const button = blob(0.045, 1, 1, 1, m.brim); button.position.set(0, 0.8, -0.3);
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d")!; x.font = '900 200px "Arial Black", Impact, sans-serif'; x.textAlign = "center"; x.textBaseline = "middle";
  x.lineJoin = "round"; x.lineWidth = 20; x.strokeStyle = "#d9381e"; x.strokeText("R", 128, 138); x.fillStyle = "#f2f2f2"; x.fillText("R", 128, 138);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6 }));
  logo.position.set(0, 0.572, 0.1); logo.rotation.x = -0.62;
  g.add(crown, brim, button, logo);
  return { group: g };
}

const builders: Record<Id, () => Model> = { dog: buildDog, bear: buildBear, roblox: buildRoblox };
const ALL: Id[] = ["dog", "bear", "roblox"];
const easeOutBack = (x: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

export function createFace3D(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; // soft studio reflections, no HDRI download
  scene.environmentIntensity = 0.7;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -3000, 3000); cam.position.z = 1000;
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-0.5, 0.9, 1.2);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.6); fill.position.set(0.9, 0.2, 0.8);
  const rim = new THREE.DirectionalLight(0xffffff, 1.0); rim.position.set(0, 0.8, -1);
  scene.add(new THREE.AmbientLight(0xffffff, 0.5), key, fill, rim);

  const occGeo = new THREE.SphereGeometry(1, 32, 24), occMat = new THREE.MeshBasicMaterial({ colorWrite: false });
  const faces = Array.from({ length: MAXF }, () => {
    const root = new THREE.Group(); root.visible = false; scene.add(root);
    const occ = new THREE.Mesh(occGeo, occMat); occ.scale.set(0.44, 0.58, 0.46); occ.position.set(0, 0, -0.32); occ.renderOrder = -1; root.add(occ);
    return { root, models: {} as Partial<Record<Id, Model>>, q: new THREE.Quaternion(), init: false, lx: 0, lt: 0, ang: 0, vel: 0 };
  });
  const pop = new Map<string, number>();
  const mat4 = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  let W = 0, H = 0, variant = 0;

  const applyVariant = () => {
    const v = VARIANTS[variant], m = M();
    m.dogEar.color.setHex(v.dogEar); m.dogPad.color.setHex(v.dogPad); m.bear.color.setHex(v.bear);
    m.bearMuz.color.setHex(v.bearMuz); m.cap.color.setHex(v.cap); m.brim.color.setHex(v.brim);
  };

  function render(lms: Pt[][], mats4: number[][], ids: string[], w: number, h: number, t: number, jaw: number[]) {
    if (w !== W || h !== H) { W = w; H = h; renderer.setSize(w, h, false); cam.left = -w / 2; cam.right = w / 2; cam.top = h / 2; cam.bottom = -h / 2; cam.updateProjectionMatrix(); }
    const want = new Set(ids as Id[]);
    ids.forEach((id) => { if (!pop.has(id)) pop.set(id, t); });
    [...pop.keys()].forEach((k) => { if (!want.has(k as Id)) pop.delete(k); });

    faces.forEach((st, i) => {
      const f = lms[i], mat = mats4[i];
      if (!f || !mat) { st.root.visible = false; st.init = false; return; }
      mat4.fromArray(mat).decompose(pos, q, sc); // only the rotation is used; position and size come from the landmarks
      if (!st.init) { st.q.copy(q); st.init = true; } else st.q.slerp(q, 0.55);
      const ex = ((f[33].x + f[133].x + f[362].x + f[263].x) / 4) * w, ey = ((f[33].y + f[133].y + f[362].y + f[263].y) / 4) * h;
      const fw = Math.hypot((f[234].x - f[454].x) * w, (f[234].y - f[454].y) * h);
      st.root.visible = true; st.root.position.set(ex - w / 2, -(ey - h / 2), 0); st.root.quaternion.copy(st.q); st.root.scale.setScalar(fw);

      // spring that reacts to sideways head movement (floppy ears, cap lag)
      const dt = Math.min(0.05, Math.max(0.001, t - st.lt));
      const dx = st.lt ? (ex - st.lx) / fw / dt : 0;
      st.vel += (-60 * st.ang - 6 * st.vel - dx * 30) * dt; st.ang = Math.max(-0.6, Math.min(0.6, st.ang + st.vel * dt)); st.lx = ex; st.lt = t;

      ALL.forEach((id) => {
        if (want.has(id) && !st.models[id]) { const m = builders[id](); st.models[id] = m; st.root.add(m.group); }
        const m = st.models[id]; if (!m) return;
        m.group.visible = want.has(id);
        if (!m.group.visible) return;
        const tune = TUNE[id], k = easeOutBack(Math.min(1, (t - (pop.get(id) ?? t - 1)) / 0.4)); // pop in
        m.group.scale.setScalar(k * tune.s);
        m.group.position.set(tune.x, tune.y + Math.sin(t * 1.8 + i) * 0.008, tune.z); // gentle floating so nothing feels frozen
        if (id === "roblox") m.group.rotation.set(Math.sin(t * 1.8) * 0.01, 0, -st.ang * 0.2); // cap lags behind the head
        m.ears?.forEach((e) => { e.rotation.z = e.userData.sign * 0.45 + st.ang + Math.sin(t * 2.4 + e.userData.sign) * 0.035; });
        if (m.nose) { const b = m.nose.userData.base as THREE.Vector3, p = 1 + 0.05 * Math.sin(t * 3.1); m.nose.scale.set(b.x * p, b.y * p, b.z * p); } // nose twitch
        if (m.tongue) {
          const open = (jaw[i] ?? 0) * 0.35; m.tongue.visible = open > 0.05;
          const sy = 1.2 + Math.min(open, 0.3) * 5 + 0.06 * Math.sin(t * 9);
          m.tongue.scale.set(0.9, sy, 0.3); m.tongue.position.y = -0.56 - 0.07 * sy;
        }
      });
    });
    renderer.render(scene, cam);
  }

  return {
    render,
    nextVariant() { variant = (variant + 1) % VARIANTS.length; applyVariant(); },
    clear() { faces.forEach((f) => { f.root.visible = false; f.init = false; }); pop.clear(); renderer.render(scene, cam); },
    dispose() { pmrem.dispose(); renderer.dispose(); },
  };
}
