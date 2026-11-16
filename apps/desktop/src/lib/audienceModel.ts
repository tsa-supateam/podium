// Per-avatar boredom and state machine (spec §4.4.2, §6.1.4). Pure logic, rendered by Audience.tsx.
import type { Zone } from "./types";

export type AvatarState = "engaged" | "neutral" | "bored" | "confused";
export type Section = "L" | "C" | "R";

export interface Avatar {
  id: number;
  section: Section;
  row: number;
  seat: number;
  theta: number; // personality offset ~ N(0, 0.08²)
  hue: number;
  b: number;
  state: AvatarState;
  heldFor: number; // seconds the pending transition condition has held
  stateAge: number;
  confusedLeft: number;
  phase: number; // animation desync
  look: Look; // appearance only: never read by the state machine
}

export type Hair = "short" | "buzz" | "quiff" | "sidePart" | "bun" | "long" | "bob" | "ponytail";
export type Top = "blazer" | "shirt" | "sweater" | "robe";
export type Role = "business" | "judge" | "reporter";

/** Appearance of one audience member. Tones are 0..1 picks into the renderer's palettes. */
export interface Look {
  skin: number;
  hair: Hair;
  hairTone: number;
  glasses: boolean;
  top: Top;
  topTone: number;
  shirtTone: number;
  trouserTone: number;
  accessory: "tie" | "lanyard" | "scarf" | null;
  prop: "laptop" | "notebook" | "coffee" | null;
  height: number; // ~0.94..1.06 scale
  build: number; // ~0.9..1.12 shoulder width
  role: Role;
  fem: boolean; // silhouette and hair styling
}

const MASC_HAIR: Hair[] = ["short", "buzz", "quiff", "sidePart"];
const FEM_HAIR: Hair[] = ["bun", "long", "bob", "ponytail"];
const TOPS: Top[] = ["blazer", "blazer", "shirt", "sweater"];

/** Seeded appearance, on its own random stream so behaviour (theta, phase) is unchanged. */
function makeLook(r: () => number): Look {
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length) % xs.length];
  const fem = r() < 0.48;
  const rr = r();
  const role: Role = rr < 0.14 ? "judge" : rr < 0.32 ? "reporter" : "business";
  const top = role === "judge" ? "robe" : pick(TOPS);
  const acc = r();
  const prop = r();
  return {
    skin: r(), hair: pick(fem ? FEM_HAIR : MASC_HAIR), hairTone: r(), glasses: r() < 0.25, top,
    topTone: r(), shirtTone: r(), trouserTone: r(),
    accessory: role === "reporter" ? "lanyard" : role === "judge" ? null
      : top === "blazer" && !fem && acc < 0.55 ? "tie" : acc > 0.9 ? "lanyard" : acc < 0.07 ? "scarf" : null,
    prop: role === "judge" ? "notebook"
      : role === "reporter" ? (prop < 0.35 ? "laptop" : "notebook")
      : prop < 0.5 ? "laptop" : prop < 0.65 ? "notebook" : prop < 0.8 ? "coffee" : null,
    height: 0.96 + r() * 0.1, build: fem ? 0.86 + r() * 0.08 : 1.0 + r() * 0.12, role, fem,
  };
}

/** Deterministic PRNG so the same audience appears every run (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number): number {
  const u = Math.max(r(), 1e-9), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function makeAudience(size = 15, seed = 7): Avatar[] {
  const r = rng(seed);
  const lr = rng(seed ^ 0x9e3779b9);
  const sections: Section[] = ["L", "C", "R"];
  const perSection = Math.ceil(size / 3);
  const seatsPerRow = Math.min(3, perSection);
  const out: Avatar[] = [];
  let id = 0;
  for (const section of sections) {
    for (let k = 0; k < perSection && id < size; k++) {
      out.push({
        id: id++, section, row: Math.floor(k / seatsPerRow), seat: k % seatsPerRow,
        theta: Math.max(-0.2, Math.min(0.2, 0.08 * gauss(r))), hue: r(), b: 0.3, state: "neutral",
        heldFor: 0, stateAge: 0, confusedLeft: 0, phase: r() * Math.PI * 2, look: makeLook(lr),
      });
    }
  }
  return out;
}

export const BETA = 0.45;
const clip = (x: number) => Math.max(0, Math.min(1, x));

export function avatarBoredom(B: number, zoneShare: Partial<Record<Zone, number>>, a: Avatar, beta = BETA): number {
  const aud = (zoneShare.L ?? 0) + (zoneShare.C ?? 0) + (zoneShare.R ?? 0);
  // Section share among audience zones; with no gaze data every section is treated equally.
  const q = aud > 0 ? (zoneShare[a.section] ?? 0) / aud : 1 / 3;
  return clip(B + beta * (1 / 3 - q) + a.theta);
}

interface Rule {
  from: AvatarState;
  to: AvatarState;
  when: (b: number) => boolean;
  hold: number;
}
const RULES: Rule[] = [
  { from: "neutral", to: "engaged", when: (b) => b < 0.35, hold: 1.5 },
  { from: "engaged", to: "neutral", when: (b) => b > 0.45, hold: 2.0 },
  { from: "neutral", to: "bored", when: (b) => b > 0.65, hold: 2.0 },
  { from: "bored", to: "neutral", when: (b) => b < 0.55, hold: 2.5 },
];

/** Advance every avatar by dt seconds. Mutates in place (called from the render loop). */
export function stepAudience(
  avatars: Avatar[],
  dt: number,
  B: number,
  zoneShare: Partial<Record<Zone, number>>,
  fillerBurst: boolean,
): void {
  for (const a of avatars) {
    a.b = avatarBoredom(B, zoneShare, a);
    a.stateAge += dt;
    if (a.state === "confused") {
      a.confusedLeft -= dt;
      if (a.confusedLeft <= 0) setState(a, "neutral");
      continue;
    }
    // A burst of fillers confuses some of the audience (the less engaged ones first).
    if (fillerBurst && a.state !== "engaged" && a.stateAge > 2 && a.theta > -0.02) {
      setState(a, "confused");
      a.confusedLeft = 4;
      continue;
    }
    const rule = RULES.find((r) => r.from === a.state && r.when(a.b));
    if (rule) {
      a.heldFor += dt;
      if (a.heldFor >= rule.hold) setState(a, rule.to);
    } else {
      a.heldFor = 0;
    }
  }
}

function setState(a: Avatar, s: AvatarState): void {
  a.state = s;
  a.heldFor = 0;
  a.stateAge = 0;
}

export function countStates(avatars: Avatar[]): Record<AvatarState, number> {
  const c: Record<AvatarState, number> = { engaged: 0, neutral: 0, bored: 0, confused: 0 };
  for (const a of avatars) c[a.state]++;
  return c;
}
