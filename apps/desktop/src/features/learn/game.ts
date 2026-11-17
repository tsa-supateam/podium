// Learn's game layer: skill tree (unlocks), XP and ranks, daily streak, Judge Demo data, and the
// offline claim tester. Pure functions over LearnStatus so they're easy to test.
import { MODULES, type LearnStatus, type Module, mastery } from "./curriculum";

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
export const XP = { lesson: 50, attempt: 10, pass: 120, mastered: 200 } as const;
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
      if (lvl >= 3) xp += XP.mastered;
    }
  }
  return xp;
}

export function level(xp: number): { level: number; rank: string; into: number; need: number } {
  const lv = Math.floor(xp / XP_PER_LEVEL) + 1;
  return { level: lv, rank: RANKS[Math.min(RANKS.length - 1, lv - 1)], into: xp % XP_PER_LEVEL, need: XP_PER_LEVEL };
}

// ---------------------------------------------------------------- streak
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

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
  return st;
}

// ---------------------------------------------------------------- claim tester
export type Tone = "good" | "warn" | "bad" | "info";
export interface ClaimCheck { tone: Tone; label: string; detail: string }

const STANCE = /\b(should|shouldn't|must|need to|needs to|ought to|have to|has to|is better|are better|is worse|will|deserves?|i believe|i argue|my position)\b/i;
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
