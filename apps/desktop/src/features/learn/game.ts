// Learn's game layer: skill tree (unlocks), XP and ranks, daily streak, Judge Demo data, and the
// offline claim tester. Pure functions over LearnStatus so they're easy to test.
import { MODULES, type GamePlay, type LearnStatus, type Module, mastery } from "./curriculum";

// ---------------------------------------------------------------- skill tree
/** Where each module sits (column = tier, row) and what it builds on. Two branches:
 *  argument (Structure → Evidence/Clarity → Commentary) and delivery (Speed → Fillers/Eye → Voice). */
export const TREE: Record<string, { col: number; row: number; needs: string[]; branch: "argument" | "delivery" }> = {
  structure: { col: 0, row: 0.5, needs: [], branch: "argument" },
  evidence: { col: 1, row: 0, needs: ["structure"], branch: "argument" },
  clarity: { col: 1, row: 1, needs: ["structure"], branch: "argument" },
  commentary: { col: 2, row: 0, needs: ["evidence"], branch: "argument" },
  speed: { col: 0, row: 2.5, needs: [], branch: "delivery" },
  fillers: { col: 1, row: 2, needs: ["speed"], branch: "delivery" },
  eye: { col: 1, row: 3, needs: ["speed"], branch: "delivery" },
  voice: { col: 2, row: 2, needs: ["fillers"], branch: "delivery" },
};

const moduleById = (id: string) => MODULES.find((m) => m.id === id)!;

/** A module is passed once any of its practices is passed (a skill is Proficient). */
export function modulePassed(m: Module, st: LearnStatus | null): boolean {
  return m.skills.some((s) => mastery(s, st) >= 2);
}

export function unlocked(m: Module, st: LearnStatus | null, demo = false): boolean {
  if (demo) return true;
  return (TREE[m.id]?.needs ?? []).every((id) => modulePassed(moduleById(id), st));
}

export function lockReason(m: Module): string {
  const needs = (TREE[m.id]?.needs ?? []).map((id) => moduleById(id).title);
  return needs.length ? `Pass a practice in ${needs.join(" and ")} to unlock` : "";
}

// ---------------------------------------------------------------- XP and ranks
export const XP = {
  lesson: 50, attempt: 10, pass: 120, mastered: 200,
  review: 60, // clearing a rusty skill
  game: 15, gameGood: 25, gameBest: 20, // a quick game: finished, >= 80% right, a new personal best
  boss: 150, bossTry: 10, // first boss win; each failed try (max 3 per boss)
  paceBest: 20, // a new Pace Runner best
} as const;
/** Quick games are a warm-up, not the way to level up: only the first few plays a day earn XP. */
export const GAME_XP_PER_DAY = 3;
export const XP_PER_LEVEL = 400;
const RANKS = ["Recruit", "Speaker", "Presenter", "Orator", "Rhetorician", "Keynote"];

export function xpOf(st: LearnStatus | null): number {
  if (!st) return 0;
  let xp = st.lessons.length * XP.lesson;
  for (const m of MODULES) {
    for (const s of m.skills) {
      const c = st.checks[s.check];
      xp += Math.min(5, c?.attempts.length ?? 0) * XP.attempt;
      const lvl = mastery(s, st);
      if (lvl >= 2) xp += XP.pass;
      if (lvl >= 3 || c?.everMastered) xp += XP.mastered; // earned once, kept even if the skill gets rusty
      xp += (c?.rustCleared ?? 0) * XP.review;
    }
  }
  for (const plays of Object.values(st.games ?? {})) xp += gameXp(plays).reduce((a, b) => a + b, 0);
  for (const tries of Object.values(st.bosses ?? {})) {
    const won = tries.findIndex((t) => t.passed);
    xp += Math.min(3, won < 0 ? tries.length : won) * XP.bossTry + (won >= 0 ? XP.boss : 0);
  }
  let best = -1;
  for (const r of st.paceRunner ?? []) {
    if (best >= 0 && r.inBandPct > best) xp += XP.paceBest;
    best = Math.max(best, r.inBandPct);
  }
  return xp;
}

/** XP for each play of one quick game, in order (0 once the day's rewarded plays are used up). */
export function gameXp(plays: GamePlay[]): number[] {
  const perDay = new Map<string, number>();
  let best = -1;
  return plays.map((p) => {
    const day = dayKey(new Date(p.at));
    const n = perDay.get(day) ?? 0;
    perDay.set(day, n + 1);
    const pct = p.max ? p.score / p.max : 0;
    const isBest = best >= 0 && pct > best;
    best = Math.max(best, pct);
    if (n >= GAME_XP_PER_DAY) return 0;
    return XP.game + (pct >= 0.8 ? XP.gameGood : 0) + (isBest ? XP.gameBest : 0);
  });
}

/** Best score of a quick game as a fraction (null if never played). */
export function bestOf(plays: GamePlay[] | undefined): GamePlay | null {
  return (plays ?? []).reduce<GamePlay | null>((b, p) => (!b || p.score / p.max > b.score / b.max ? p : b), null);
}

// ---------------------------------------------------------------- module bosses (optional)
/** A boss is one run that must pass every check in its module at once. Optional: it doesn't gate the
 *  tree, it pays XP and unlocks the module's title badge (and, with all eight, the Diamond accent). */
export const BOSS_PROMPTS: Record<string, string> = {
  structure: "Should every student learn to cook before they finish school? Take a side and give two reasons.",
  evidence: "Is social media doing more harm than good for teenagers? Back every point with something concrete.",
  clarity: "What is one rule your school should change, and why? Keep every sentence short and clear.",
  commentary: "Should homework be banned? Give your evidence, explain what it proves, and answer the other side.",
  speed: "Describe a skill you've learned and how you learned it.",
  fillers: "Tell us about a place you'd love to visit and why.",
  eye: "Convince the room to try a hobby you enjoy.",
  voice: "Tell the story of a time something didn't go to plan.",
};
export const bossChecks = (m: Module) => [...new Set(m.skills.map((s) => s.check))];
export const bossSeconds = (m: Module) => (TREE[m.id]?.branch === "argument" ? 120 : 90);
/** Ready once every skill in the module has been started (lesson read or a practice tried). */
export const bossReady = (m: Module, st: LearnStatus | null, demo = false) => demo || m.skills.every((s) => mastery(s, st) >= 1);
export const bossBeaten = (m: Module, st: LearnStatus | null) => !!st?.bosses?.[m.id]?.some((t) => t.passed);

// ---------------------------------------------------------------- unlockables (cosmetic only)
export type Slot = "accent" | "ring" | "xpBar" | "badge";
export interface Unlockable {
  id: string;
  slot: Slot;
  name: string;
  /** accent color, or the badge's word */
  value: string;
  /** what earns it, and how close you are (0..1) */
  how: string;
  progress: (st: LearnStatus | null, xp: number) => number;
}
const lv = (n: number) => (_: LearnStatus | null, xp: number) => Math.min(1, xp / ((n - 1) * XP_PER_LEVEL));
const bossesBeaten = (st: LearnStatus | null) => MODULES.filter((m) => bossBeaten(m, st)).length;
export const BADGE: Record<string, string> = {
  structure: "Architect", evidence: "Evidence Hunter", clarity: "Straight Talker", commentary: "Analyst",
  speed: "Steady", fillers: "Clean Speaker", eye: "Room Reader", voice: "Dynamo",
};
export const UNLOCKABLES: Unlockable[] = [
  { id: "accent.ember", slot: "accent", name: "Ember", value: "#ff4d2d", how: "Default", progress: () => 1 },
  { id: "accent.blue", slot: "accent", name: "Signal Blue", value: "#4f8dff", how: "Reach LV 02", progress: lv(2) },
  { id: "accent.mint", slot: "accent", name: "Mint", value: "#3ddc97", how: "Reach LV 04", progress: lv(4) },
  { id: "accent.violet", slot: "accent", name: "Violet", value: "#a77bff", how: "Beat any module boss", progress: (st) => Math.min(1, bossesBeaten(st)) },
  { id: "accent.gold", slot: "accent", name: "Gold", value: "#f5b942", how: "Reach LV 06", progress: lv(6) },
  { id: "accent.diamond", slot: "accent", name: "Diamond", value: "#bfe9ff", how: "Beat all eight bosses", progress: (st) => bossesBeaten(st) / MODULES.length },
  { id: "ring.solid", slot: "ring", name: "Solid", value: "solid", how: "Default", progress: () => 1 },
  { id: "ring.dual", slot: "ring", name: "Dual track", value: "dual", how: "Reach LV 03", progress: lv(3) },
  { id: "ring.ticks", slot: "ring", name: "Bright ticks", value: "ticks", how: "Score 80%+ in band in Pace Runner",
    progress: (st) => Math.min(1, Math.max(0, ...(st?.paceRunner ?? []).map((r) => r.inBandPct)) / 80) },
  { id: "ring.pulse", slot: "ring", name: "Pulse", value: "pulse", how: "Keep a 7-day streak",
    progress: (st) => Math.min(1, longestStreak(st?.activity) / 7) },
  { id: "xpBar.classic", slot: "xpBar", name: "Classic", value: "classic", how: "Default", progress: () => 1 },
  { id: "xpBar.spark", slot: "xpBar", name: "Spark", value: "spark", how: "Play every quick game once",
    progress: (st) => QUICK_GAMES.filter((g) => (st?.games?.[g]?.length ?? 0) > 0).length / QUICK_GAMES.length },
  { id: "xpBar.plasma", slot: "xpBar", name: "Plasma", value: "plasma", how: "Clear a rusty skill",
    progress: (st) => Math.min(1, Object.values(st?.checks ?? {}).reduce((a, c) => a + (c.rustCleared ?? 0), 0)) },
  { id: "badge.none", slot: "badge", name: "No title", value: "", how: "Default", progress: () => 1 },
  ...MODULES.map((m): Unlockable => ({ id: `badge.${m.id}`, slot: "badge", name: BADGE[m.id], value: BADGE[m.id],
    how: `Beat the ${m.title} boss`, progress: (st) => (bossBeaten(m, st) ? 1 : 0) })),
];
export const QUICK_GAMES = ["claimDuel", "spotHedge", "signpostSorter", "evidenceSort"] as const;
export const isUnlocked = (u: Unlockable, st: LearnStatus | null, xp: number, demo = false) => demo || u.progress(st, xp) >= 1;

/** What's equipped, falling back to the default when an item isn't (or is no longer) unlocked. */
export function equipped(st: LearnStatus | null, xp: number, demo = false): Record<Slot, Unlockable> {
  const pick = (slot: Slot) => {
    const want = UNLOCKABLES.find((u) => u.id === st?.equipped?.[slot]);
    return want && isUnlocked(want, st, xp, demo) ? want : UNLOCKABLES.find((u) => u.slot === slot)!;
  };
  return { accent: pick("accent"), ring: pick("ring"), xpBar: pick("xpBar"), badge: pick("badge") };
}

// ---------------------------------------------------------------- seeded shuffle (fresh rounds every play)
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
export function shuffle<T>(xs: readonly T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function level(xp: number): { level: number; rank: string; into: number; need: number } {
  const lv = Math.floor(xp / XP_PER_LEVEL) + 1;
  return { level: lv, rank: RANKS[Math.min(RANKS.length - 1, lv - 1)], into: xp % XP_PER_LEVEL, need: XP_PER_LEVEL };
}

// ---------------------------------------------------------------- streak
export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** Consecutive days with any activity (a lesson, a practice or a run), ending today, or yesterday
 *  if you haven't practiced yet today (the streak is still alive until midnight). */
export function streak(activity: string[] | undefined, now = new Date()): { days: number; today: boolean; week: boolean[] } {
  const days = new Set((activity ?? []).map((iso) => dayKey(new Date(iso))));
  const at = (offset: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - offset);
    return days.has(dayKey(d));
  };
  const today = at(0);
  let n = 0;
  for (let i = today ? 0 : 1; at(i); i++) n++;
  return { days: n, today, week: Array.from({ length: 7 }, (_, i) => at(6 - i)) };
}

/** Longest run of consecutive active days ever. */
export function longestStreak(activity: string[] | undefined): number {
  const days = [...new Set((activity ?? []).map((iso) => {
    const d = new Date(iso);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
  }))].sort((a, b) => a - b);
  let best = 0, run = 0;
  days.forEach((d, i) => {
    run = i > 0 && d - days[i - 1] === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

// ---------------------------------------------------------------- Judge Demo Mode
/** Rich, believable progress so judges can try every part of Learn in seconds. Never saved. */
export function demoStatus(now = new Date()): LearnStatus {
  const iso = (daysAgo: number, h = 17) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(h, 0, 0, 0);
    return d.toISOString();
  };
  const pattern = [3, 2, 3, 2, 1, 2, 3, 1, 0, 2, 1, 3, 2, 1, 0, 2, 1, 0, 1, 0]; // mastery per skill
  const st: LearnStatus = { lessons: [], checks: {}, activity: [] };
  let i = 0;
  for (const m of MODULES) {
    for (const s of m.skills) {
      const lvl = pattern[i++ % pattern.length];
      if (lvl >= 1) st.lessons.push(s.id);
      const attempts = lvl >= 2
        ? [{ id: s.check, value: null, passed: false, sessionId: `demo-${s.id}-1`, at: iso(i % 9 + 2) },
           { id: s.check, value: null, passed: true, sessionId: `demo-${s.id}-2`, at: iso(i % 6) }]
        : lvl === 1 && i % 2 ? [{ id: s.check, value: null, passed: false, sessionId: `demo-${s.id}-1`, at: iso(i % 5) }] : [];
      const recent = lvl === 3 ? [true, true, false] : [false, lvl >= 2, false];
      st.checks[s.check] = { attempts, recent: recent.map((p) => ({ id: s.check, value: null, passed: p })) };
    }
  }
  st.activity = Array.from({ length: 12 }, (_, d) => iso(d));
  // Two skills that were mastered and then slipped in recent runs, ready to review.
  for (const k of ["hold_contact", "steady_pace"]) {
    st.checks[k] = { ...st.checks[k], everMastered: true, rusty: true, rustySince: iso(2), rustCleared: 1,
      recent: [{ id: k, value: null, passed: true }, { id: k, value: null, passed: false }, { id: k, value: null, passed: false }] };
  }
  const pass = (m: string, ok: boolean[], d: number) => ({ module: m, sessionId: `demo-boss-${m}-${d}`, at: iso(d),
    passed: ok.every(Boolean), results: bossChecks(MODULES.find((x) => x.id === m)!).map((id, n) => ({ id, value: null, passed: ok[n] ?? true })) });
  st.bosses = {
    structure: [pass("structure", [true, false, true], 6), pass("structure", [true, true, true], 4)],
    speed: [pass("speed", [true, true], 3)],
    evidence: [pass("evidence", [true, true, false], 1)],
  };
  st.paceRunner = [62, 71, 84].map((p, n) => ({ inBandPct: p, bestStreakSec: 10 + n * 6, band: [120, 160], sessionId: `demo-pace-${n}`, at: iso(5 - n * 2) }));
  const plays = (scores: number[], max: number) => scores.map((score, n) => ({ at: iso(scores.length - n, 18), score, max }));
  st.games = { claimDuel: plays([6, 8, 9], 10), spotHedge: plays([5.5, 7], 8), signpostSorter: plays([6], 9), evidenceSort: plays([9, 11], 12) };
  st.activity.push(...Object.values(st.games).flat().map((g) => g.at));
  return st;
}

// ---------------------------------------------------------------- claim tester
export type Tone = "good" | "warn" | "bad" | "info";
export interface ClaimCheck { tone: Tone; label: string; detail: string }

const STANCE = /\b(should|shouldn't|must|need to|needs to|ought to|have to|has to|(is|are|isn't|aren't)( not)? (better|worse|worth|good|bad|harmful|helpful|as good)|will|deserves?|i believe|i argue|my position)\b/i;
const HEDGES = ["i think", "maybe", "kind of", "sort of", "probably", "i guess", "i feel like", "just", "really", "perhaps", "might"];
const FILLERS = ["um", "uh", "umm", "uhh", "like", "you know", "basically", "literally"];
const ANNOUNCE = /\b(today )?i('m| am)? (want to|going to|gonna|will) (talk|speak|tell you) about\b|\btoday i('ll| will) (talk|discuss)\b|\bthis speech is about\b/i;
const REASON = /\b(because|since|so that|which means|by)\b/i;
const STOP = new Set(("a an the and or but of to in on for with is are be your you it this that what why how do does should " +
  "argue side make case one two take give explain describe tell me about speech").split(" "));

const has = (text: string, phrase: string) => new RegExp(`(^|[^a-z'])${phrase.replace(/ /g, "\\s+")}([^a-z']|$)`, "i").test(text);

/** Instant, rule-based feedback on a drafted one-sentence claim, before recording. */
export function testClaim(text: string, prompt = ""): { checks: ClaimCheck[]; verdict: { tone: Tone; label: string } } {
  const t = text.trim();
  const words = t.split(/\s+/).filter(Boolean);
  const checks: ClaimCheck[] = [];
  if (!t) return { checks, verdict: { tone: "info", label: "Type your claim" } };

  if (STANCE.test(t)) checks.push({ tone: "good", label: "Takes a side", detail: "It commits to a position." });
  else checks.push({ tone: "bad", label: "No clear stance", detail: "Add a commitment word: “should”, “must”, “is better”." });

  if (ANNOUNCE.test(t)) checks.push({ tone: "bad", label: "Announces a topic", detail: "“I'll talk about…” isn't a claim. Say what you believe." });

  const fill = FILLERS.filter((f) => has(t, f));
  if (fill.length) checks.push({ tone: "bad", label: "Filler words", detail: `Cut ${fill.map((f) => `“${f}”`).join(", ")}.` });
  const hedge = HEDGES.filter((h) => has(t, h));
  if (hedge.length) checks.push({ tone: "warn", label: "Hedging", detail: `${hedge.map((h) => `“${h}”`).join(", ")} make${hedge.length === 1 ? "s" : ""} you sound unsure.` });
  else if (words.length >= 4) checks.push({ tone: "good", label: "Direct", detail: "No hedges or softeners." });

  if (words.length < 6) checks.push({ tone: "warn", label: "Very short", detail: `${words.length} words. Say what and why in one full sentence.` });
  else if (words.length > 30) checks.push({ tone: "warn", label: "Too long", detail: `${words.length} words. Trim to one sentence of about 10–25 words.` });
  else checks.push({ tone: "good", label: "Good length", detail: `${words.length} words: easy to say in one breath.` });

  if ((t.match(/[.!?](\s|$)/g) ?? []).length > 1) checks.push({ tone: "warn", label: "More than one sentence", detail: "Keep the claim to a single sentence." });
  if (REASON.test(t)) checks.push({ tone: "good", label: "Previews a reason", detail: "Pointing to your “because” sets up your points." });

  const topic = prompt.toLowerCase().match(/[a-z']+/g)?.filter((w) => w.length > 3 && !STOP.has(w)) ?? [];
  if (topic.length) {
    const hit = topic.filter((w) => t.toLowerCase().includes(w.slice(0, 5)));
    checks.push(hit.length
      ? { tone: "good", label: "On the prompt", detail: `Mentions ${hit.slice(0, 3).map((w) => `“${w}”`).join(", ")}.` }
      : { tone: "warn", label: "Off the prompt?", detail: `Bring in the topic: ${topic.slice(0, 3).map((w) => `“${w}”`).join(", ")}.` });
  }

  const bad = checks.filter((c) => c.tone === "bad").length, warn = checks.filter((c) => c.tone === "warn").length;
  const verdict = bad ? { tone: "bad" as Tone, label: "Weak claim" } : warn ? { tone: "warn" as Tone, label: "Almost there" } : { tone: "good" as Tone, label: "Strong claim" };
  return { checks, verdict };
}
