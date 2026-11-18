// Low-poly reactive auditorium (spec §4.4). Built from primitives with flat shading: no art assets, no network.
// Behaviour comes from audienceModel.ts; this file only turns states into poses.
//
// Performance: every body part of every person is an instance of one of ~7 shared InstancedMeshes
// (box, capsule, ico, hair cap, torso, torus, cylinder). Each frame we pose a hidden Object3D rig per
// person and copy its parts' world matrices into the instance buffers: ~10 draw calls for 20 people.
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { countStates, makeAudience, stepAudience, type Avatar, type Look } from "../../lib/audienceModel";
import { micLevelDb } from "../../lib/mic";
import { live as liveData } from "../../stores/app";
import { reducedMotion } from "../../ui/motion";

export const audienceStats = { counts: { engaged: 0, neutral: 0, bored: 0, confused: 0 } };

// ---------------------------------------------------------------- palettes (3D materials, not UI tokens)
const SKIN = ["#F3D3BC", "#E8B894", "#D3A27A", "#B57D55", "#8E5A3A", "#6A4029", "#45291A"];
const HAIR = ["#141110", "#2B1D14", "#4A3020", "#6E4B2E", "#A07A4F", "#C9B38A", "#8A8A8A", "#D9D4CC"];
// corporate wardrobe, sorted cool/dark → warm/light so back rows read darker and cooler
const WARDROBE = ["#262626", "#2F3B4E", "#3A3A3A", "#4A5D73", "#2F3B4E", "#6B7A8C", "#5E6448", "#6E3530", "#B08B5E", "#D8C8A8"];
const SHIRTS = ["#ECE8DE", "#D8E0E8", "#F4F2EC", "#C9D1D8", "#D8C8A8"];
const TROUSERS = ["#232323", "#2F2F2F", "#3A4656", "#4B4F3C", "#5A4C3E", "#9C8C70"];
const TIES = ["#7A3B32", "#4A5D73", "#2E2E2E", "#5E6448"];
const SIGNAL = "#E8553E";
const C = {
  bg: "#1B1B1B", floor: "#202020", riser: "#262626", riserFace: "#2C2C2C", wall: "#1E1E1E", slatA: "#2A2A2A", slatB: "#5C5C5C",
  chair: "#2F2F2F", chairFrame: "#4A4A4A", truss: "#3A3A3A", lectern: "#38332D", metal: "#5A5A5A", foam: "#262626",
  eye: "#141414", mouth: "#5A2A26", paper: "#FAF9F5", screen: "#9FB4CC", shoe: "#181818",
};

const SPEAKER = new THREE.Vector3(0, 2.3, 6.4);
const ROW_COUNTS = [6, 7, 7];
const ROW_Z = [0, -1.6, -3.2];
const ROW_Y = [0, 0.42, 0.84];
const AISLE = 1.1;

/** 20 seats in 3 staggered rows around a centre aisle; returned left → right. */
function seatLayout(): { x: number; row: number }[] {
  const seats: { x: number; row: number }[] = [];
  ROW_COUNTS.forEach((n, row) => {
    const off = row === 1 ? 0.5 : 0; // middle row sits between the others: heads don't line up
    const left = row === 1 ? 3 : Math.floor(n / 2), right = n - left;
    for (let j = 0; j < left; j++) seats.push({ x: -(AISLE / 2 + 0.5 + j + off), row });
    for (let j = 0; j < right; j++) seats.push({ x: AISLE / 2 + 0.5 + j + off, row });
  });
  return seats.sort((a, b) => a.x - b.x);
}

// ---------------------------------------------------------------- shared geometry + cel-shading materials
type Key = "box" | "cap" | "sph" | "head" | "torso" | "hair" | "spike" | "torus" | "arc" | "cyl" | "glow" | "fsph" | "fcap" | "ring";
const GEO: Record<Key, () => THREE.BufferGeometry> = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  cap: () => new THREE.CapsuleGeometry(0.5, 1, 4, 12),
  sph: () => new THREE.SphereGeometry(1, 18, 12),
  head: headGeometry,
  fsph: () => new THREE.SphereGeometry(1, 14, 10), // face details: no outline
  fcap: () => new THREE.CapsuleGeometry(0.5, 1, 3, 8),
  ring: () => new THREE.TorusGeometry(1, 0.07, 4, 24), // thin glasses rim
  torso: torsoGeometry,
  spike: () => new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0), // base at the origin, tip along +y
  hair: () => new THREE.SphereGeometry(1, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2),
  torus: () => new THREE.TorusGeometry(1, 0.2, 6, 18),
  arc: () => new THREE.TorusGeometry(1, 0.22, 6, 16, Math.PI).rotateZ(Math.PI), // bowl-shaped: a smile; flip y for a frown
  cyl: () => new THREE.CylinderGeometry(1, 0.9, 1, 14),
  glow: () => new THREE.BoxGeometry(1, 1, 1),
};

/** Unit head with a defined jaw: the lower half tapers to a narrow chin that sits slightly forward. */
function headGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 28, 20);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y < 0) {
      const t = -y;
      const jaw = t < 0.35 ? 1 - 0.08 * t : 0.972 - 0.52 * Math.pow((t - 0.35) / 0.65, 1.15); // jaw corner, then taper
      x *= jaw;
      z *= 1 - 0.12 * t;
      if (z > 0) z += 0.1 * t * t; // chin forward
      y *= 1.1;
    }
    x *= 0.95; // slightly narrower than deep
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/** Unit torso: shoulders → chest → waist, oval in cross-section. */
function torsoGeometry(): THREE.BufferGeometry {
  const prof = [[0, -0.5], [0.74, -0.49], [0.8, -0.3], [0.74, -0.05], [0.86, 0.2], [0.98, 0.37], [0.88, 0.47], [0.5, 0.52], [0, 0.53]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(prof, 20).scale(1, 1, 0.62);
}

/** Three-step ramp: the hard light/mid/shadow bands of cel shading. */
let ramp: THREE.DataTexture | null = null;
function toonRamp(): THREE.DataTexture {
  if (!ramp) {
    ramp = new THREE.DataTexture(new Uint8Array([90, 175, 255]), 3, 1, THREE.RedFormat);
    ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
    ramp.generateMipmaps = false;
    ramp.needsUpdate = true;
  }
  return ramp;
}
const toon = (color?: THREE.ColorRepresentation) => new THREE.MeshToonMaterial({ color: color ?? "#ffffff", gradientMap: toonRamp() });

/** Inverted-hull ink outline: back faces pushed out along the normal, drawn flat dark. */
function outlineMaterial(width = 0.045): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: "#121212", side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <begin_vertex>", `vec3 transformed = position + normal * ${width.toFixed(3)};`);
  };
  m.customProgramCacheKey = () => `ink-${width}`; // widths differ, so programs must not be shared
  return m;
}

interface Part { key: Key; obj: THREE.Object3D; color: THREE.Color }

interface Rig {
  a: Avatar;
  root: THREE.Object3D;
  hips: THREE.Object3D;
  spine: THREE.Object3D;
  chest: THREE.Object3D;
  head: THREE.Object3D;
  shL: THREE.Object3D; elL: THREE.Object3D; shR: THREE.Object3D; elR: THREE.Object3D;
  eyes: THREE.Object3D[];
  brows: THREE.Object3D[];
  mouth: THREE.Object3D;
  mouthO: THREE.Object3D;
  phone: THREE.Object3D;
  phoneGlow: number; // index into the glow mesh
  asleep: boolean; // the lowest signal: chosen per frame from the most bored
  p: Float32Array; // current pose params (eased towards targets)
  nextBlink: number;
  blinkT: number;
  writes: boolean;
  browY: number;
}

// pose parameter indices
const LEAN = 0, SLUMP = 1, HX = 2, HY = 3, HZ = 4, SLX = 5, SLZ = 6, ELX = 7, SRX = 8, SRZ = 9, ERX = 10,
  BROW = 11, BROWY = 12, MW = 13, CURVE = 14, PHONE = 15, ROLL = 16, EYE = 17, OPEN = 18, BROWL = 19, NP = 20;

const pickC = (xs: string[], t: number) => xs[Math.min(xs.length - 1, Math.floor(t * xs.length))];
const HEAD_C = 0.13; // head centre above the head joint
const EYE_H = 0.021, MOUTH_W = 0.026, MOUTH_D = 0.014;
const H = Math.PI / 2;

/** One seated audience member: realistic proportions, a defined jaw, cel-shaded and expressive. */
function buildRig(a: Avatar, seat: { x: number; row: number }, parts: Part[], glowParts: Part[]): Rig {
  const L: Look = a.look;
  const fem = L.fem;
  const front = 1 - seat.row / 2; // 1 front … 0 back
  const skin = new THREE.Color(pickC(SKIN, L.skin));
  const hair = new THREE.Color(pickC(HAIR, L.hairTone));
  const judge = L.role === "judge";
  const topC = new THREE.Color(judge ? "#17171A" : pickC(WARDROBE, Math.min(0.999, L.topTone * 0.8 + front * 0.2)));
  const shirtC = new THREE.Color(pickC(SHIRTS, L.shirtTone));
  const trouserC = new THREE.Color(judge ? "#1E1E22" : pickC(TROUSERS, L.trouserTone));
  const blouse = L.top === "shirt";
  const sleeve = blouse ? shirtC : topC;
  const col = (c: string) => new THREE.Color(c);
  const darker = (c: THREE.Color, k = 0.78) => c.clone().multiplyScalar(k);

  const node = (parent: THREE.Object3D, pos: [number, number, number], rot?: [number, number, number]) => {
    const o = new THREE.Object3D();
    o.position.set(...pos);
    if (rot) o.rotation.set(...rot);
    parent.add(o);
    return o;
  };
  const part = (key: Key, parent: THREE.Object3D, pos: [number, number, number], scale: [number, number, number], color: THREE.Color, rot?: [number, number, number]) => {
    const o = node(parent, pos, rot);
    o.scale.set(...scale);
    (key === "glow" ? glowParts : parts).push({ key, obj: o, color });
    return o;
  };

  const root = new THREE.Object3D();
  root.position.set(seat.x, ROW_Y[seat.row], ROW_Z[seat.row]);
  root.scale.setScalar(L.height);
  const bw = L.build;

  // legs (static, seated): tapered thighs and calves, dress shoes
  const hips = node(root, [0, 0.5, 0]);
  part("cap", hips, [0, 0.0, -0.02], [0.3 * bw, 0.08, 0.2], trouserC, [0, 0, H]); // pelvis
  const shoe = col(L.trouserTone > 0.5 ? "#3B2A20" : "#121212");
  for (const s of [-1, 1]) {
    part("cap", hips, [s * 0.095, 0, 0.18], [0.13, 0.19, 0.135], trouserC, [H, 0, 0]); // thigh, hip to knee
    const knee = node(hips, [s * 0.095, 0, 0.37]);
    part("sph", knee, [0, -0.005, 0], [0.062, 0.062, 0.064], trouserC); // knee
    part("cap", knee, [0, -0.2, 0], [0.1, 0.19, 0.105], trouserC); // calf
    part("sph", knee, [0, -0.43, 0.06], [0.05, 0.035, 0.115], shoe);
    part("box", knee, [0, -0.462, 0.06], [0.09, 0.012, 0.21], darker(shoe, 0.7)); // sole
  }
  if (judge) part("cap", hips, [0, 0.03, 0.2], [0.34, 0.2, 0.2], topC, [H, 0, 0]); // robe over the lap

  // props on the lap
  if (L.prop === "laptop") {
    // silver unibody laptop: the speaker sees the closed-looking aluminium lid, the owner sees the screen
    const alu = col("#C9CCD1");
    part("box", hips, [0, 0.1, 0.27], [0.32, 0.014, 0.22], alu);
    part("box", hips, [0, 0.108, 0.25], [0.27, 0.002, 0.1], col("#2A2A2D")); // keyboard
    const lid = node(hips, [0, 0.108, 0.38], [0.3, 0, 0]);
    part("box", lid, [0, 0.11, 0], [0.32, 0.22, 0.008], alu);
    part("box", lid, [0, 0.11, -0.005], [0.31, 0.21, 0.002], col("#0E0E10")); // bezel
    part("glow", lid, [0, 0.115, -0.007], [0.28, 0.18, 0.002], col(C.screen).multiplyScalar(0.45));
  } else if (L.prop === "notebook") {
    part("box", hips, [0.02, 0.1, 0.28], [0.22, 0.016, 0.29], col(judge ? "#2B2B2B" : C.paper), [0, 0.15, 0]);
  } else if (L.prop === "coffee") {
    part("cyl", root, [0.31, 0.75, 0.12], [0.035, 0.1, 0.035], col("#ECE8DE"));
    part("cyl", root, [0.31, 0.805, 0.12], [0.033, 0.012, 0.033], col("#3A3A3A"));
  }

  // torso: tapered (V for masc builds, waist for fem), with the outfit layered on
  const spine = node(hips, [0, 0.02, -0.02]);
  const chest = node(spine, [0, 0.27, 0]);
  part("torso", chest, [0, 0, 0], [0.19 * bw, 0.52, 0.19 * (fem ? 0.95 : 1)], blouse ? shirtC : topC);
  part("cap", chest, [0, -0.255, 0], [0.03, 0.15 * bw, 0.24], judge ? topC : col("#1A1A1A"), [0, 0, H]); // belt line
  for (const s of [-1, 1]) part("sph", chest, [s * 0.19 * bw, 0.2, 0], [0.05, 0.042, 0.062], sleeve); // shoulders
  const neckFront = 0.115;
  if (L.top === "blazer") {
    // open jacket: shirt V, notched lapels, buttons, pocket square on some
    part("box", chest, [0, 0.11, neckFront], [0.1, 0.22, 0.01], shirtC, [0.12, 0, 0]);
    for (const s of [-1, 1]) {
      part("box", chest, [s * 0.05, 0.1, neckFront + 0.008], [0.045, 0.24, 0.012], darker(topC), [0.12, 0, s * -0.32]);
      part("box", chest, [s * 0.075, 0.2, neckFront - 0.004], [0.035, 0.04, 0.012], darker(topC, 0.7), [0.1, 0, s * 0.5]); // notch
    }
    part("sph", chest, [0, -0.08, 0.128], [0.009, 0.009, 0.006], col("#151515"));
    part("sph", chest, [0, -0.14, 0.126], [0.009, 0.009, 0.006], col("#151515"));
    if (L.shirtTone > 0.55) part("box", chest, [-0.11, 0.1, 0.12], [0.045, 0.02, 0.01], col(L.shirtTone > 0.85 ? SIGNAL : C.paper));
  } else if (blouse) {
    part("box", chest, [0, 0.17, neckFront + 0.004], [0.07, 0.1, 0.006], skin, [0.15, 0, Math.PI / 4]); // V neckline
    if (fem) part("torus", chest, [0, 0.19, 0.06], [0.06, 0.06, 0.06], col("#C9A961"), [1.2, 0, 0]); // fine necklace
    else for (const s of [-1, 1]) part("box", chest, [s * 0.04, 0.24, 0.085], [0.06, 0.02, 0.04], darker(shirtC, 1.05), [0, 0, s * -0.4]); // collar
  } else if (L.top === "sweater") {
    part("torus", chest, [0, 0.235, 0.0], [0.075, 0.075, 0.11], darker(topC, 0.85), [H, 0, 0]);
    part("box", chest, [0, 0.2, neckFront - 0.01], [0.05, 0.05, 0.008], shirtC, [0.2, 0, Math.PI / 4]); // collar peeking out
  } else {
    // judge's robe: deep yoke and white bands at the throat
    part("box", chest, [0, 0.1, neckFront + 0.006], [0.12, 0.26, 0.01], darker(topC, 0.6), [0.12, 0, 0]);
    for (const s of [-1, 1]) part("box", chest, [s * 0.014, 0.17, neckFront + 0.016], [0.022, 0.07, 0.004], col(C.paper), [0.1, 0, 0]);
  }
  if (L.accessory === "tie") {
    const tie = col(pickC(TIES, L.shirtTone));
    part("box", chest, [0, 0.2, neckFront + 0.016], [0.026, 0.025, 0.012], tie); // knot
    part("box", chest, [0, 0.07, neckFront + 0.014], [0.034, 0.22, 0.008], tie, [0.12, 0, 0]);
  }
  if (L.accessory === "lanyard") {
    const strap = col(L.role === "reporter" ? SIGNAL : "#4A5D73");
    part("box", chest, [-0.045, 0.11, neckFront + 0.02], [0.011, 0.2, 0.006], strap, [0.12, 0, 0.25]);
    part("box", chest, [0.045, 0.11, neckFront + 0.02], [0.011, 0.2, 0.006], strap, [0.12, 0, -0.25]);
    part("box", chest, [0, -0.01, neckFront + 0.03], [0.065, 0.09, 0.006], col(C.paper), [0.1, 0, 0]); // press card
    part("box", chest, [0, 0.015, neckFront + 0.034], [0.05, 0.016, 0.002], strap, [0.1, 0, 0]);
  }
  if (L.accessory === "scarf") part("torus", chest, [0, 0.235, 0.01], [0.09, 0.09, 0.13], col(SIGNAL), [H, 0, 0]);

  // neck + head: realistic proportions, defined jaw
  const neckJ = node(chest, [0, 0.25, 0.0]);
  part("cap", neckJ, [0, 0.03, 0], [0.072, 0.06, 0.078], skin);
  const head = node(neckJ, [0, 0.06, 0.012]);
  head.rotation.order = "YXZ";
  const c = HEAD_C, hs = fem ? 0.95 : 1;
  part("head", head, [0, c, 0], [0.122 * hs, 0.148 * hs, 0.132 * hs], skin);
  for (const s of [-1, 1]) part("sph", head, [s * 0.12 * hs, c - 0.005, -0.005], [0.018, 0.032, 0.016], skin); // ears
  part("fsph", head, [0, c - 0.024, 0.128 * hs], [0.009, 0.018, 0.012], darker(skin, 0.9), [0.35, 0, 0]); // nose
  for (const s of [-1, 1]) part("fsph", head, [s * 0.07, c - 0.034, 0.104 * hs], [0.02, 0.01, 0.006], skin.clone().lerp(col("#E07A6A"), fem ? 0.28 : 0.12)); // cheeks
  const eyes = [-1, 1].map((s) => part("fsph", head, [s * 0.044, c + 0.012, 0.121 * hs], [0.0125, EYE_H, 0.008], col(C.eye)));
  for (const s of [-1, 1]) {
    part("fsph", head, [s * 0.044 + 0.004, c + 0.019, 0.128 * hs], [0.0042, 0.0042, 0.002], col(C.paper)); // glint
    if (fem) part("fcap", head, [s * 0.046, c + 0.031, 0.121 * hs], [0.0035, 0.016, 0.004], col("#151515"), [0, 0, H + s * 0.25]); // lash line
  }
  const browY = c + 0.048;
  const brows = [-1, 1].map((s) => part("fcap", head, [s * 0.046, browY, 0.122 * hs], [fem ? 0.005 : 0.0065, 0.021, 0.006], darker(hair, 0.85), [0, 0, H]));
  const mouth = part("arc", head, [0, c - 0.064, 0.11 * hs], [MOUTH_W, MOUTH_D, 0.025], col(fem ? "#9E3B3B" : C.mouth));
  const mouthO = part("fsph", head, [0, c - 0.068, 0.108 * hs], [0.0001, 0.0001, 0.0001], col("#3A1714"));
  if (L.glasses) {
    const frame = col("#1A1A1A");
    for (const s of [-1, 1]) part("ring", head, [s * 0.044, c + 0.012, 0.13 * hs], [0.026, 0.021, 0.02], frame);
    part("fcap", head, [0, c + 0.016, 0.134 * hs], [0.003, 0.012, 0.003], frame, [0, 0, H]); // bridge
  }

  // hair: a cap tipped back plus stylised clumps (spikes), anime-style
  const capAt: [number, number, number] = [0, c + 0.025, -0.008];
  const capRot: [number, number, number] = [-0.42, 0, 0];
  const capS: [number, number, number] = [0.13 * hs, 0.13, 0.142 * hs];
  const spike = (pos: [number, number, number], len: number, rot: [number, number, number], w = 0.03) =>
    part("spike", head, pos, [w, len, w * 0.8], hair, rot);
  switch (L.hair) {
    case "short": // textured crop: a short fringe falling forward
      part("hair", head, capAt, capS, hair, capRot);
      for (let i = -2; i <= 2; i++) spike([i * 0.028, c + 0.085, 0.085], 0.07, [1.9, 0, i * 0.18], 0.028);
      break;
    case "buzz":
      part("hair", head, [0, c + 0.03, -0.006], [0.127 * hs, 0.115, 0.138 * hs], hair, capRot);
      break;
    case "quiff": // volume up and back at the front
      part("hair", head, capAt, capS, hair, capRot);
      for (let i = -1; i <= 1; i++) spike([i * 0.035, c + 0.13, 0.05], 0.11, [-0.55, 0, i * 0.25], 0.04);
      break;
    case "sidePart": // swept to one side
      part("hair", head, capAt, capS, hair, capRot);
      part("sph", head, [0.03, c + 0.12, 0.06], [0.1, 0.035, 0.07], hair, [0.35, 0, 0.3]);
      for (let i = 0; i < 3; i++) spike([0.05 + i * 0.025, c + 0.1, 0.06], 0.08, [1.2, 0, -1.1 - i * 0.15], 0.03);
      break;
    case "bun":
      part("hair", head, capAt, [0.134, 0.135, 0.146], hair, capRot);
      part("sph", head, [0, c + 0.13, -0.1], [0.055, 0.05, 0.055], hair);
      for (const s of [-1, 1]) spike([s * 0.08, c + 0.04, 0.08], 0.07, [2.6, 0, s * 0.25], 0.02); // face-framing strands
      break;
    case "long":
      part("hair", head, capAt, [0.136, 0.135, 0.148], hair, capRot);
      part("sph", head, [0, c - 0.08, -0.07], [0.13, 0.19, 0.07], hair); // length down the back
      for (const s of [-1, 1]) part("cap", head, [s * 0.11, c - 0.05, 0.03], [0.04, 0.11, 0.04], hair, [0, 0, s * 0.08]);
      for (let i = -1; i <= 1; i++) spike([i * 0.04, c + 0.085, 0.09], 0.06, [2.0, 0, i * 0.4], 0.035);
      break;
    case "bob":
      part("hair", head, capAt, [0.138, 0.135, 0.15], hair, capRot);
      part("sph", head, [0, c - 0.02, -0.02], [0.142, 0.1, 0.14], hair); // rounded sides to the jaw
      for (let i = -2; i <= 2; i++) spike([i * 0.03, c + 0.085, 0.088], 0.06, [2.0, 0, i * 0.15], 0.03);
      break;
    case "ponytail":
      part("hair", head, capAt, [0.134, 0.135, 0.146], hair, capRot);
      part("cap", head, [0, c - 0.02, -0.15], [0.045, 0.12, 0.045], hair, [0.35, 0, 0]);
      part("torus", head, [0, c + 0.07, -0.13], [0.022, 0.022, 0.02], darker(hair, 0.5), [1.2, 0, 0]);
      for (let i = -1; i <= 1; i++) spike([i * 0.04, c + 0.085, 0.09], 0.06, [2.0, 0, i * 0.4], 0.035);
      break;
  }

  // arms: shoulder → elbow → hand. Forearm points along +z at rest (resting on the lap).
  const arm = (s: number) => {
    const sh = node(chest, [s * 0.22 * bw, 0.18, 0]);
    part("cap", sh, [0, -0.12, 0], [0.085, 0.11, 0.088], sleeve);
    const el = node(sh, [0, -0.24, 0]);
    part("cap", el, [0, 0, 0.1], [0.075, 0.1, 0.075], sleeve, [H, 0, 0]);
    part("cyl", el, [0, 0, 0.2], [0.04, 0.02, 0.04], judge ? topC : shirtC, [H, 0, 0]); // cuff
    const hand = node(el, [0, 0, 0.24]);
    part("sph", hand, [0, 0, 0], [0.035, 0.025, 0.05], skin);
    part("cap", hand, [s * -0.03, 0.006, -0.005], [0.016, 0.022, 0.016], skin, [H, 0, s * 0.5]); // thumb
    return { sh, el, hand };
  };
  const Lh = arm(-1), Rh = arm(1);
  const phone = node(Rh.hand, [0, 0.035, 0.02], [-0.6, 0, 0]);
  part("box", phone, [0, 0, 0], [0.065, 0.01, 0.13], col("#111111"));
  const phoneGlow = glowParts.length;
  part("glow", phone, [0, 0.006, 0], [0.058, 0.002, 0.118], col(C.screen));
  phone.scale.setScalar(0);

  const p = new Float32Array(NP);
  p[MW] = 1; p[CURVE] = 0.3; p[EYE] = 1; p[SLX] = p[SRX] = -0.25;
  return {
    a, root, hips, spine, chest, head, mouthO, shL: Lh.sh, elL: Lh.el, shR: Rh.sh, elR: Rh.el, eyes, brows, mouth, phone, phoneGlow, p,
    nextBlink: 1 + a.phase, blinkT: -1, asleep: false, writes: L.prop === "notebook" || L.prop === "laptop", browY,
  };
}

const zPos = new THREE.Vector3();

/** A soft "z" glyph for sleepers. */
function zTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = C.paper;
  ctx.font = "600 52px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("z", 32, 34);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const damp = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const RATE = 5.5; // reaches ~95% in ~550ms: blends between states, never snaps
const tmp = new THREE.Vector3();
const target = new Float32Array(NP);

/** Pose targets for one person this frame (no smoothing here). */
function targets(r: Rig, t: number, out: Float32Array) {
  const a = r.a, ph = a.phase;
  r.root.getWorldPosition(tmp);
  const yaw = Math.atan2(SPEAKER.x - tmp.x, SPEAKER.z - tmp.z);
  const pitch = -Math.atan2(SPEAKER.y - (tmp.y + 1.3), Math.hypot(SPEAKER.x - tmp.x, SPEAKER.z - tmp.z));
  out.fill(0);
  out[SLX] = out[SRX] = -0.25;
  out[MW] = 1; out[CURVE] = 0.3; out[EYE] = 1;
  out[ROLL] = Math.sin(t * 0.31 + ph) * 0.025; // weight shift
  switch (a.state) {
    case "engaged": {
      out[LEAN] = 0.2;
      out[HY] = yaw; // track the speaker
      out[HX] = pitch + 0.14 * Math.pow(Math.max(0, Math.sin(t * 1.7 + ph)), 12); // occasional nod
      out[BROWY] = 0.012; out[MW] = 1.25; out[CURVE] = 1; out[EYE] = 1.12; // bright-eyed grin, brows up
      if (r.writes && Math.sin(t * 0.45 + ph) > 0.35) { // take a note now and then
        out[HX] = 0.45; out[HY] = 0;
        out[SRX] = -0.55; out[ERX] = 0.12 + Math.sin(t * 11 + ph) * 0.06; out[SRZ] = 0.15;
      }
      break;
    }
    case "neutral":
      out[LEAN] = 0.02 + Math.sin(t * 0.7 + ph) * 0.03;
      out[HY] = yaw * 0.7 + Math.sin(t * 0.27 + ph) * 0.18;
      out[HX] = pitch * 0.6;
      out[HZ] = Math.sin(t * 0.4 + ph) * 0.05;
      break;
    case "bored": {
      out[LEAN] = -0.2; out[SLUMP] = -0.05; out[HZ] = 0.16 * Math.sign(Math.sin(ph) || 1);
      out[BROWY] = -0.008; out[MW] = 0.85; out[CURVE] = -0.7; out[EYE] = 0.45; // heavy lids, flat brows, frown
      if (Math.sin(t * 0.23 + ph * 3) > 0.93) { out[OPEN] = 1; out[EYE] = 0.15; out[HX] = -0.25; } // yawn
      const mode = Math.floor((t / 8 + ph) % 3);
      if (mode === 0) { // phone, held in the right hand only
        out[PHONE] = 1; out[HX] = 0.5; out[HY] = -0.15; out[HZ] = 0;
        out[SRX] = -0.55; out[ERX] = -0.75; out[SRZ] = -0.25;
      } else if (mode === 1) { // chin on hand
        out[SRX] = -0.75; out[SRZ] = 0.25; out[ERX] = -2.0; out[HZ] = 0.22; out[HX] = 0.1; out[HY] = yaw * 0.4;
      } else { // looking away
        out[HY] = yaw + (a.id % 2 ? 0.9 : -0.9); out[HX] = 0.05;
      }
      break;
    }
    case "confused": {
      out[HZ] = 0.26 * Math.sign(Math.sin(ph) || 1); out[HY] = yaw; out[HX] = pitch;
      out[BROW] = 0.38; out[BROWL] = 0.014; out[BROWY] = 0.004; out[OPEN] = 0.55; out[CURVE] = -0.2; out[EYE] = 1.2; // one brow up, small "o"
      const raise = Math.max(0, Math.sin(Math.min(1, a.stateAge / 3.2) * Math.PI)); // halfway up, then down
      out[SRX] = -0.25 - raise * 1.7; out[SRZ] = raise * 0.15; out[ERX] = -raise * 0.9;
      break;
    }
  }
  if (r.asleep) { // dozed off: chin on chest, eyes shut, mouth a little open, slow deep breaths
    out.fill(0);
    out[SLX] = out[SRX] = -0.25; out[MW] = 0.8;
    out[LEAN] = -0.08; out[SLUMP] = -0.06 + Math.sin(t * 0.9 + ph) * 0.006;
    out[HX] = 0.6 + Math.sin(t * 0.9 + ph) * 0.04; out[HZ] = 0.18 * Math.sign(Math.sin(ph) || 1); out[HY] = yaw * 0.2;
    out[EYE] = 0.06; out[OPEN] = 0.25; out[BROWY] = -0.004;
  }
}

function applyPose(r: Rig, dt: number, t: number) {
  const p = r.p;
  targets(r, t, target);
  for (let i = 0; i < NP; i++) p[i] = damp(p[i], target[i], i === PHONE ? 8 : RATE, dt);
  r.spine.rotation.x = p[LEAN];
  r.spine.rotation.z = p[ROLL];
  r.spine.position.y = 0.02 + p[SLUMP];
  r.chest.scale.y = 1 + Math.sin(t * 1.6 + r.a.phase) * 0.015; // breathing
  r.head.rotation.set(p[HX], p[HY] - p[ROLL], p[HZ]);
  r.shL.rotation.set(p[SLX], 0, p[SLZ] - 0.07);
  r.elL.rotation.x = p[ELX];
  r.shR.rotation.set(p[SRX], 0, p[SRZ] + 0.07);
  r.elR.rotation.x = p[ERX];
  r.brows[0].rotation.z = Math.PI / 2 - p[BROW];
  r.brows[1].rotation.z = Math.PI / 2 + p[BROW];
  r.brows[0].position.y = r.browY + p[BROWY] + p[BROWL];
  r.brows[1].position.y = r.browY + p[BROWY] - p[BROWL] * 0.4;
  // mouth arc bends smile → flat → frown by flipping its y scale; never fully flat so it stays visible
  const curve = Math.sign(p[CURVE] || 1) * Math.max(0.18, Math.abs(p[CURVE]));
  const open = p[OPEN];
  r.mouth.scale.set(MOUTH_W * p[MW] * (1 - open * 0.6), MOUTH_D * curve * (1 - open), 0.03);
  r.mouthO.scale.set(0.022 * open + 0.0001, 0.03 * open + 0.0001, 0.012 * open + 0.0001);
  r.phone.scale.setScalar(Math.max(0.0001, p[PHONE]));
  // blinks at random intervals
  if (t > r.nextBlink) { r.blinkT = 0; r.nextBlink = t + 2 + ((r.a.phase * 997 + t * 13) % 4); }
  let eyeY = EYE_H;
  if (r.blinkT >= 0) {
    r.blinkT += dt;
    eyeY = EYE_H * Math.max(0.08, Math.abs(1 - r.blinkT / 0.06));
    if (r.blinkT > 0.12) r.blinkT = -1;
  }
  for (const e of r.eyes) e.scale.y = eyeY * p[EYE];
}

function makeInstanced(parts: Part[], key: Key, mat: THREE.Material, shadow: boolean, ink?: THREE.Material): THREE.InstancedMesh | null {
  const list = parts.filter((x) => x.key === key);
  if (!list.length) return null;
  const m = new THREE.InstancedMesh(GEO[key](), mat, list.length);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  m.frustumCulled = false; // instances move; the whole crowd is always in view
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  list.forEach((pt, i) => m.setColorAt(i, pt.color));
  m.userData.parts = list;
  if (ink) {
    const o = new THREE.InstancedMesh(m.geometry, ink, list.length);
    o.instanceMatrix = m.instanceMatrix; // same buffer: the outline follows every pose for free
    o.frustumCulled = false;
    m.add(o);
  }
  return m;
}

function Crowd({ size, demo }: { size: number; demo: boolean }) {
  const crowd = useMemo(() => {
    const avatars = makeAudience(size, 7);
    const seats = seatLayout();
    const parts: Part[] = [], glow: Part[] = [];
    // sections stay where they belong: L avatars take the leftmost seats, then C, then R
    const rigs = avatars.map((a, i) => buildRig(a, seats[Math.min(i, seats.length - 1)], parts, glow));
    const body = toon();
    const ink = outlineMaterial();
    const glowMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    const NO_INK: Key[] = ["box", "arc", "fsph", "fcap", "ring"];
    const meshes = (["box", "cap", "sph", "head", "torso", "hair", "spike", "torus", "arc", "cyl", "fsph", "fcap", "ring"] as Key[])
      .map((k) => makeInstanced(parts, k, body, true, NO_INK.includes(k) ? undefined : ink)).filter(Boolean) as THREE.InstancedMesh[];
    const glowMesh = makeInstanced(glow, "glow", glowMat, false)!;
    const group = new THREE.Group();
    meshes.forEach((m) => group.add(m));
    group.add(glowMesh);
    const zTex = zTexture();
    const zs = Array.from({ length: 6 }, () => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      group.add(sp);
      return sp;
    });
    return { avatars, rigs, meshes, glowMesh, group, body, glowMat, ink, zs, zTex };
  }, [size]);
  useEffect(() => () => {
    crowd.meshes.forEach((m) => m.geometry.dispose());
    crowd.glowMesh.geometry.dispose();
    crowd.body.dispose();
    crowd.ink.dispose();
    crowd.zTex.dispose();
    crowd.zs.forEach((z) => z.material.dispose());
    crowd.glowMat.dispose();
  }, [crowd]);

  const clock = useRef(0);
  const glowC = useMemo(() => new THREE.Color(), []);
  const screenC = useMemo(() => new THREE.Color(C.screen), []);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    clock.current += dt;
    const t = clock.current;
    let B = 0.3, zone = {}, burst = false;
    if (demo) {
      B = 0.5 + 0.35 * Math.sin(t / 5);
      zone = { L: 0.33 + 0.25 * Math.sin(t / 3), C: 0.34, R: 0.33 - 0.25 * Math.sin(t / 3) };
    } else if (liveData.tick) {
      B = liveData.tick.B;
      zone = liveData.tick.zoneShare;
      burst = liveData.tick.fillerBurst;
    }
    stepAudience(crowd.avatars, dt, B, zone, burst);
    audienceStats.counts = countStates(crowd.avatars);

    // the lowest signal: the one or two most bored people doze off
    const sleepers = crowd.rigs.filter((r) => r.a.state === "bored" && r.a.b > 0.8).sort((x, y) => y.a.b - x.a.b).slice(0, 2);
    for (const r of crowd.rigs) r.asleep = sleepers.includes(r);
    for (const r of crowd.rigs) {
      applyPose(r, dt, t);
      r.root.updateMatrixWorld(true);
    }
    for (const m of crowd.meshes) {
      const list = m.userData.parts as Part[];
      for (let i = 0; i < list.length; i++) m.setMatrixAt(i, list[i].obj.matrixWorld);
      m.instanceMatrix.needsUpdate = true;
    }
    for (let k = 0; k < crowd.zs.length; k++) {
      const z = crowd.zs[k], r = sleepers[Math.floor(k / 3)];
      if (!r) { z.material.opacity = 0; continue; }
      const ph = (t * 0.35 + (k % 3) / 3 + r.a.phase) % 1;
      r.head.getWorldPosition(zPos);
      z.position.set(zPos.x + 0.1 + ph * 0.14, zPos.y + 0.2 + ph * 0.32, zPos.z);
      z.scale.setScalar(0.07 + ph * 0.08);
      z.material.opacity = Math.sin(ph * Math.PI) * 0.5;
    }
    const gl = crowd.glowMesh, glist = gl.userData.parts as Part[];
    for (let i = 0; i < glist.length; i++) gl.setMatrixAt(i, glist[i].obj.matrixWorld);
    gl.instanceMatrix.needsUpdate = true;
    // phone screens glow faintly while in use
    for (const r of crowd.rigs) {
      glowC.copy(screenC).multiplyScalar(0.25 + r.p[PHONE] * (1.1 + Math.sin(t * 3 + r.a.phase) * 0.15));
      gl.setColorAt(r.phoneGlow, glowC);
    }
    if (gl.instanceColor) gl.instanceColor.needsUpdate = true;
  });

  return <primitive object={crowd.group} />;
}

// ---------------------------------------------------------------- labels: one canvas atlas, merged planes
const ATLAS = 1024;
type Rect = [number, number, number, number]; // x, y, w, h in atlas pixels

function drawAtlas(cv: HTMLCanvasElement) {
  const ctx = cv.getContext("2d")!;
  ctx.clearRect(0, 0, ATLAS, ATLAS);
  ctx.fillStyle = C.paper;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 26px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  for (let i = 0; i < 20; i++) ctx.fillText(String(i + 1).padStart(2, "0"), (i % 10) * 64 + 32, Math.floor(i / 10) * 40 + 20);
  ctx.font = "700 52px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ["A", "B", "C"].forEach((l, i) => ctx.fillText(l, i * 64 + 32, 128));
  ctx.font = "700 44px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("EXIT", 352, 128);
  // logo for the LED wall and the lectern engraving: the half-filled circle mark (◐) used in the top bar
  const logo = (x: number, y: number, s: number) => {
    const r = s / 2, cx = x + r, cy = y + r, lw = Math.max(4, s * 0.09);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r - lw / 2, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r - lw / 2, 0, Math.PI * 2);
    ctx.lineWidth = lw;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.stroke();
    ctx.restore();
  };
  ctx.fillStyle = SIGNAL;
  logo(70, 279, 210);
  ctx.fillStyle = C.paper;
  ctx.textAlign = "left";
  ctx.font = "700 120px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("Podium", 320, 390);
  logo(810, 240, 120);
}

const RECT = {
  chair: (i: number): Rect => [(i % 10) * 64, Math.floor(i / 10) * 40, 64, 40],
  row: (i: number): Rect => [i * 64, 96, 64, 64],
  exit: [256, 96, 192, 64] as Rect,
  screen: [0, 192, 768, 384] as Rect,
  mark: [768, 192, 256, 256] as Rect,
};

function labelGeo(rect: Rect, w: number, h: number, m: THREE.Matrix4): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    uv.setXY(i, (rect[0] + u * rect[2]) / ATLAS, 1 - (rect[1] + (1 - v) * rect[3]) / ATLAS);
  }
  return g.applyMatrix4(m);
}
const at = (x: number, y: number, z: number, rx = 0, ry = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), new THREE.Vector3(1, 1, 1));

function useAtlas(): THREE.CanvasTexture {
  const tex = useMemo(() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = ATLAS;
    drawAtlas(cv);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, []);
  useEffect(() => {
    return () => tex.dispose();
  }, [tex]);
  return tex;
}

// ---------------------------------------------------------------- auditorium
function Room({ atlas }: { atlas: THREE.Texture }) {
  const built = useMemo(() => {
    const flat = (c: string, _extra?: unknown) => toon(c);
    const group = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], opts: { cast?: boolean; receive?: boolean; rot?: [number, number, number] } = {}) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      if (opts.rot) m.rotation.set(...opts.rot);
      m.castShadow = !!opts.cast;
      m.receiveShadow = opts.receive ?? true;
      group.add(m);
      return m;
    };
    // floor + raked tiers with risers and step-edge light strips
    add(new THREE.PlaneGeometry(30, 20), flat(C.floor), [0, 0, 0], { rot: [-Math.PI / 2, 0, 0] });
    const strip = new THREE.MeshBasicMaterial({ color: SIGNAL, toneMapped: false });
    const riserMat = flat(C.riser), faceMat = flat(C.riserFace);
    ROW_Y.forEach((y, r) => {
      if (r > 0) {
        add(new THREE.BoxGeometry(14, y, 1.6), riserMat, [0, y / 2, ROW_Z[r]]);
        add(new THREE.BoxGeometry(14, y - 0.02, 0.02), faceMat, [0, y / 2, ROW_Z[r] + 0.81]);
      }
      add(new THREE.BoxGeometry(12.5, 0.022, 0.035), strip, [0, y + 0.012, ROW_Z[r] + 0.8], { receive: false });
    });
    // walls with vertical acoustic slats
    const wall = flat(C.wall);
    add(new THREE.PlaneGeometry(16, 8), wall, [0, 4, -6.2]);
    for (const s of [-1, 1]) add(new THREE.PlaneGeometry(14, 8), wall, [s * 7.2, 4, 0.5], { rot: [0, -s * Math.PI / 2, 0] });
    const slatGeo = new THREE.BoxGeometry(0.12, 5.6, 0.16);
    const slats = new THREE.InstancedMesh(slatGeo, toon(), 2 * 32 + 40);
    const mtx = new THREE.Matrix4(), ca = new THREE.Color(C.slatA), cb = new THREE.Color(C.slatB);
    let k = 0;
    for (const s of [-1, 1]) for (let i = 0; i < 32; i++) {
      mtx.compose(new THREE.Vector3(s * 7.1, 3.2, -5.8 + i * 0.3), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), new THREE.Vector3(1, 1, 1));
      slats.setMatrixAt(k, mtx);
      slats.setColorAt(k++, i % 5 === 2 ? cb : ca);
    }
    for (let i = 0; i < 40; i++) { // back wall, either side of the LED wall
      const x = -7 + i * 0.35;
      if (Math.abs(x) < 3.6) { mtx.makeScale(0, 0, 0); } else mtx.makeTranslation(x, 3.2, -6.1);
      slats.setMatrixAt(k, mtx);
      slats.setColorAt(k++, i % 4 === 1 ? cb : ca);
    }
    slats.receiveShadow = true;
    group.add(slats);
    // LED wall with the Podium mark, faint
    add(new THREE.BoxGeometry(7, 3.1, 0.1), flat("#151515"), [0, 4.35, -6.12]);
    const screenMat = new THREE.MeshBasicMaterial({ map: atlas, transparent: true, opacity: 0.22, toneMapped: false, depthWrite: false });
    add(labelGeo(RECT.screen, 5.6, 2.8, new THREE.Matrix4()), screenMat, [0, 4.35, -6.05], { receive: false });
    // exit sign with a soft glow
    const exitMat = new THREE.MeshBasicMaterial({ map: atlas, transparent: true, color: SIGNAL, toneMapped: false, depthWrite: false });
    add(new THREE.BoxGeometry(0.85, 0.32, 0.06), flat("#101010"), [5.6, 3.3, -5.97]);
    add(labelGeo(RECT.exit, 0.75, 0.25, new THREE.Matrix4()), exitMat, [5.6, 3.3, -5.935], { receive: false });
    const halo = new THREE.MeshBasicMaterial({ color: SIGNAL, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false });
    add(new THREE.PlaneGeometry(1.8, 1.0), halo, [5.6, 3.3, -5.93], { receive: false });
    // ceiling truss with spot fixtures and cheap additive light cones
    const truss = flat(C.truss, { metalness: 0.4 });
    for (const z of [-1.4, -4]) {
      add(new THREE.BoxGeometry(12, 0.08, 0.08), truss, [0, 6.2, z]);
      add(new THREE.BoxGeometry(12, 0.08, 0.08), truss, [0, 5.85, z]);
      for (let i = 0; i < 16; i++) add(new THREE.BoxGeometry(0.03, 0.5, 0.03), truss, [-6 + i * 0.8, 6.02, z], { rot: [0, 0, i % 2 ? 0.7 : -0.7] });
    }
    const coneMat = new THREE.MeshBasicMaterial({ color: "#FFD8B0", transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const fixture = flat("#222222", { metalness: 0.5 });
    for (const [x, z] of [[-3.2, -1.4], [3.2, -1.4], [-1.6, -4], [1.6, -4]] as [number, number][]) {
      add(new THREE.CylinderGeometry(0.12, 0.16, 0.3, 8), fixture, [x, 5.65, z]);
      add(new THREE.CircleGeometry(0.11, 8), new THREE.MeshBasicMaterial({ color: "#FFE2C2", toneMapped: false }), [x, 5.49, z], { rot: [Math.PI / 2, 0, 0], receive: false });
      add(new THREE.ConeGeometry(1.5, 5.4, 18, 1, true), coneMat, [x, 5.5 - 2.7, z], { receive: false });
    }
    // chairs (static, instanced): seat, back, two armrests, pedestal, foot
    const seats = seatLayout();
    const chairBox = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toon(), seats.length * 6);
    const cSeat = new THREE.Color(C.chair), cFrame = new THREE.Color(C.chairFrame);
    let n = 0;
    const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: THREE.Color, rx = 0) => {
      mtx.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(sx, sy, sz));
      chairBox.setMatrixAt(n, mtx);
      chairBox.setColorAt(n++, c);
    };
    const labels: THREE.BufferGeometry[] = [];
    seats.forEach((s, i) => {
      const y = ROW_Y[s.row], z = ROW_Z[s.row];
      box(s.x, y + 0.44, z, 0.56, 0.08, 0.52, cSeat);
      box(s.x, y + 0.86, z - 0.3, 0.56, 0.72, 0.07, cSeat, -0.12);
      box(s.x - 0.31, y + 0.66, z, 0.06, 0.05, 0.48, cFrame);
      box(s.x + 0.31, y + 0.66, z, 0.06, 0.05, 0.48, cFrame);
      box(s.x, y + 0.2, z - 0.05, 0.08, 0.4, 0.08, cFrame);
      box(s.x, y + 0.015, z - 0.05, 0.4, 0.03, 0.3, cFrame);
      labels.push(labelGeo(RECT.chair(i), 0.1, 0.0625, at(s.x + 0.31, y + 0.66, z + 0.245)));
    });
    ROW_Y.forEach((y, r) => {
      for (const sx of [-1, 1]) labels.push(labelGeo(RECT.row(r), 0.2, 0.2, at(sx * 0.25, y + 0.14, ROW_Z[r] + 0.82)));
    });
    chairBox.castShadow = chairBox.receiveShadow = true;
    const chairInk = new THREE.InstancedMesh(chairBox.geometry, outlineMaterial(0.03), chairBox.count);
    chairInk.instanceMatrix = chairBox.instanceMatrix;
    group.add(chairBox, chairInk);
    const labelMat = new THREE.MeshBasicMaterial({ map: atlas, transparent: true, color: C.paper, toneMapped: false, depthWrite: false, opacity: 0.85 });
    add(mergeGeometries(labels), labelMat, [0, 0, 0], { receive: false });
    return group;
  }, [atlas]);
  useEffect(() => () => {
    built.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
  }, [built]);
  return <primitive object={built} />;
}

/** Speaker's lectern edge and gooseneck mic in the foreground, slightly out of focus (darker, low detail).
 *  The mic LED pulses with the real mic level while a session is live. */
function Foreground({ atlas, live }: { atlas: THREE.Texture; live: boolean }) {
  const level = useRef(0);
  const built = useMemo(() => {
    const g = new THREE.Group();
    const ink = outlineMaterial(0.004); // world units here: these meshes are not unit-scaled
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], rot?: [number, number, number], parent: THREE.Object3D = g, outline = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      if (rot) m.rotation.set(...rot);
      parent.add(m);
      if (outline) {
        const o = new THREE.Mesh(geo, ink);
        m.add(o);
      }
      return m;
    };
    // lectern top: bevelled reading surface, pencil ledge, signal edge, brass plate, notes
    const top = new THREE.Group();
    top.position.set(0, 1.94, 5.75);
    top.rotation.set(0.16, 0, 0);
    g.add(top);
    const slab = new THREE.Shape();
    const w = 1.1, d = 0.375, r = 0.05;
    slab.moveTo(-w + r, -d); slab.lineTo(w - r, -d); slab.quadraticCurveTo(w, -d, w, -d + r); slab.lineTo(w, d - r);
    slab.quadraticCurveTo(w, d, w - r, d); slab.lineTo(-w + r, d); slab.quadraticCurveTo(-w, d, -w, d - r); slab.lineTo(-w, -d + r);
    slab.quadraticCurveTo(-w, -d, -w + r, -d);
    const slabGeo = new THREE.ExtrudeGeometry(slab, { depth: 0.04, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 6 });
    slabGeo.rotateX(-Math.PI / 2);
    slabGeo.translate(0, -0.02, 0);
    add(slabGeo, toon(C.lectern), [0, 0, 0], undefined, top);
    add(new THREE.BoxGeometry(2.24, 0.05, 0.03), new THREE.MeshBasicMaterial({ color: SIGNAL, toneMapped: false }), [0, 0.0, -0.392], undefined, top, false);
    add(new THREE.BoxGeometry(2.0, 0.045, 0.05), toon("#2A2622"), [0, 0.045, 0.33], undefined, top); // pencil ledge
    add(new THREE.BoxGeometry(0.16, 0.006, 0.07), toon("#B39A62"), [-0.7, 0.035, -0.3], undefined, top); // brass plate
    const mark = new THREE.Mesh(labelGeo(RECT.mark, 0.055, 0.055, new THREE.Matrix4()),
      new THREE.MeshBasicMaterial({ map: atlas, transparent: true, color: "#3A2E18", opacity: 0.8, depthWrite: false }));
    mark.position.set(-0.73, 0.04, -0.3);
    mark.rotation.x = -Math.PI / 2;
    top.add(mark);
    const paper = toon(C.paper);
    add(new THREE.BoxGeometry(0.3, 0.004, 0.21), paper, [-0.25, 0.036, -0.12], [0, 0.06, 0], top);
    add(new THREE.BoxGeometry(0.3, 0.004, 0.21), paper, [-0.23, 0.04, -0.1], [0, -0.05, 0], top);
    const lines = new THREE.MeshBasicMaterial({ color: "#8A8A8A" });
    for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.21 - (i % 3) * 0.04, 0.001, 0.006), lines, [-0.24, 0.043, -0.18 + i * 0.03], [0, -0.05, 0], top, false);

    // gooseneck: base plate + clamp, ringed flexible neck, mic body, foam windscreen
    const metal = toon(C.metal);
    add(new THREE.CylinderGeometry(0.05, 0.06, 0.02, 20), toon("#2A2A2A"), [0.95, 2.045, 5.62]);
    add(new THREE.CylinderGeometry(0.022, 0.026, 0.06, 14), metal, [0.95, 2.08, 5.62]);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.95, 2.1, 5.62), new THREE.Vector3(0.94, 2.16, 5.54), new THREE.Vector3(0.89, 2.19, 5.46), new THREE.Vector3(0.82, 2.18, 5.48),
      new THREE.Vector3(0.77, 2.16, 5.55),
    ]);
    add(new THREE.TubeGeometry(curve, 32, 0.008, 8), toon("#3A3A3A"), [0, 0, 0]);
    const ring = new THREE.TorusGeometry(0.0084, 0.0012, 4, 12);
    for (let i = 1; i < 24; i++) {
      const t = i / 24, pt = curve.getPointAt(t), tan = curve.getTangentAt(t);
      const m = new THREE.Mesh(ring, metal);
      m.position.copy(pt);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
      g.add(m);
    }
    const end = curve.getPointAt(1);
    const dir = new THREE.Vector3(0, 2.45, 6.6).sub(end).normalize(); // aim the capsule at the speaker's mouth
    const body = new THREE.Group();
    body.position.copy(end);
    body.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.add(body);
    add(new THREE.CylinderGeometry(0.013, 0.011, 0.07, 16), metal, [0, 0.035, 0], undefined, body);
    add(new THREE.TorusGeometry(0.014, 0.003, 6, 18), metal, [0, 0.072, 0], [Math.PI / 2, 0, 0], body, false);
    add(new THREE.SphereGeometry(1, 18, 14), toon(C.foam), [0, 0.11, 0], undefined, body).scale.set(0.028, 0.04, 0.028);
    // live indicator: LED ring at the base of the mic head, plus an additive halo
    const ledMat = new THREE.MeshBasicMaterial({ color: SIGNAL, toneMapped: false });
    add(new THREE.TorusGeometry(0.0145, 0.0022, 6, 18), ledMat, [0, 0.074, 0], [Math.PI / 2, 0, 0], body, false);
    const halo = add(new THREE.CircleGeometry(0.03, 16), new THREE.MeshBasicMaterial({ color: SIGNAL, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), [0, 0.074, 0.02], undefined, body, false);
    return { g, ledMat, halo };
  }, [atlas]);
  useEffect(() => () => {
    built.g.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
  }, [built]);
  const ledColor = useMemo(() => new THREE.Color(SIGNAL), []);
  useFrame((_, dt) => {
    const db = live ? micLevelDb() : -120;
    const v = Math.max(0, Math.min(1, (db + 55) / 45));
    level.current = damp(level.current, v, 18, dt);
    const l = live ? 0.25 + level.current * 1.6 : 0.12;
    built.ledMat.color.copy(ledColor).multiplyScalar(l);
    built.halo.scale.setScalar(0.4 + level.current * 1.4);
  });
  return <primitive object={built.g} />;
}

/** Camera slightly above the speaker's eye line, with a very slow ±1° parallax drift. */
function CameraRig({ close }: { close: boolean }) {
  const { camera } = useThree();
  // the small Home preview frames the crowd tighter; the speaker's view keeps the lectern in shot
  const look = useMemo(() => new THREE.Vector3(0, close ? 1.25 : 1.45, -2.4), [close]);
  const [y0, z0] = close ? [2.05, 4.5] : [2.45, 6.6];
  const still = useMemo(() => reducedMotion(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    camera.position.set(still ? 0 : Math.sin(t * 0.07) * 0.1, y0 + (still ? 0 : Math.sin(t * 0.05) * 0.03), z0);
    camera.lookAt(look.x + (still ? 0 : Math.sin(t * 0.06 + 1) * 0.12), look.y, look.z);
  });
  return null;
}

function Scene({ size, demo, live }: { size: number; demo: boolean; live: boolean }) {
  const atlas = useAtlas();
  return (
    <>
      <CameraRig close={demo} />
      <color attach="background" args={[C.bg]} />
      <fog attach="fog" args={[C.bg, 11, 22]} />
      <hemisphereLight args={["#4A5D73", "#151515", 0.7]} />
      <directionalLight position={[2.5, 7, 7]} intensity={2.1} color="#FFD9B0" castShadow shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={6} shadow-camera-bottom={-4} shadow-bias={-0.0006} shadow-normalBias={0.02} />
      <directionalLight position={[-6, 3, 2]} intensity={0.55} color="#6B86A8" />
      <directionalLight position={[0, 4.5, -9]} intensity={1.1} color="#8FA6C4" />
      <Room atlas={atlas} />
      <Crowd size={size} demo={demo} />
      {!demo && <Foreground atlas={atlas} live={live} />}
    </>
  );
}

export default function AudienceScene({ size = 20, demo = false, live = false }: { size?: number; demo?: boolean; live?: boolean }) {
  return (
    <>
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [0, 2.45, 6.6], fov: 48, near: 0.05, far: 60 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <Scene size={size} demo={demo} live={live} />
      </Canvas>
      <div className="stage-vignette" aria-hidden />
    </>
  );
}
