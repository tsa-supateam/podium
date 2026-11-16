// Plain-language names and explanations for every score. One source of truth for all screens.
import type { Scores, Summary } from "./types";

export type MetricKey = "pacing" | "fillers" | "vocalVariety" | "eyeContact" | "structure" | "content" | "engagement";

export interface MetricInfo {
  key: MetricKey;
  title: string;
  /** Chip label, at most two short words. */
  short: string;
  /** What it means, in one sentence a first-time user understands. */
  what: string;
  /** How the 0–100 score is calculated. */
  how: string[];
  /** The measured value behind the score, in plain words. */
  measured: (s: Summary) => string;
}

export const METRICS: MetricInfo[] = [
  {
    key: "pacing",
    short: "Speed",
    title: "Speaking speed",
    what: "How fast you talked. The target is 120–160 words per minute for a prepared speech and 100–140 on the spot.",
    how: [
      "50 points: your average speed is inside the target for your speech type (partial credit up to 40 words per minute outside it).",
      "30 points: you changed speed a natural amount, slowing down for key points without big swings.",
      "20 points: your speed stayed steady from second to second rather than speeding up and stalling.",
    ],
    measured: (s) => (s.pacing.meanWpm ? `${Math.round(s.pacing.meanWpm)} words per minute on average` : "No speech measured"),
  },
  {
    key: "fillers",
    short: "Fillers",
    title: "Filler words",
    what: "How often you said “um”, “uh”, “like”, “you know” and similar words that fill silence.",
    how: [
      "Counted per minute of speaking.",
      "1 or fewer per minute scores 100. Each extra filler per minute costs about 11 points, down to 0 at 10 per minute.",
    ],
    measured: (s) => `${s.fillers.total} total · ${s.fillers.perMinute.toFixed(1)} per minute`,
  },
  {
    key: "vocalVariety",
    short: "Voice",
    title: "Expressive voice",
    what: "How much your voice rose and fell in pitch and volume. A flat, same-sounding voice makes audiences tune out.",
    how: [
      "60 points: how much your pitch moved. Best around 3–4 semitones of movement (roughly how much a voice rises when asking a question). Very flat or very jumpy scores lower.",
      "40 points: how much your volume changed for emphasis. Best around 5 decibels of variation.",
    ],
    measured: (s) => voiceWord(s.voice.f0StdSt),
  },
  {
    key: "eyeContact",
    short: "Eye contact",
    title: "Eye contact",
    what: "How much of the time you looked at your audience instead of your notes, and whether you spread it across the room.",
    how: [
      "Full credit for looking at the audience at least 75% of the time (85% in a no-notes run).",
      "Up to 30% of the score depends on spreading your gaze across the left, center and right of the room.",
      "With notes: minus 2 points per notes look over 5 seconds. No notes: minus 3 points per look down over 2.5 seconds.",
    ],
    measured: (s) => (s.gaze ? `${Math.round(s.gaze.audiencePct)}% of the time on your audience` : "Camera was off"),
  },
  {
    key: "structure",
    short: "Structure",
    title: "Organization",
    what: "Whether your talk had a clear beginning, middle and end that listeners could follow.",
    how: [
      "25 points: an opening hook (a question, a number, or “imagine…”) in the first part of the talk.",
      "25 points: at least two signpost words such as “first”, “next” or “finally”.",
      "25 points: a clear conclusion such as “in conclusion” or “to sum up”.",
      "25 points: finishing within 10% of your target length.",
    ],
    measured: (s) => `${s.structure.transitions.length} signpost words · ${s.structure.conclusionDetected ? "clear ending" : "no clear ending"}`,
  },
];

export function verdict(score: number | null): string {
  if (score == null) return "Not measured";
  if (score >= 85) return "Great";
  if (score >= 70) return "Good";
  if (score >= 50) return "Getting there";
  return "Needs work";
}

export function voiceWord(stdSt: number): string {
  // Thresholds follow the score curve, which peaks at about 3.5 semitones of movement.
  if (stdSt < 1.5) return "Mostly flat";
  if (stdSt < 2.5) return "A little flat";
  if (stdSt <= 4.5) return "Lively";
  return "Very up and down";
}

export function speedChangeWord(cv: number): string {
  if (cv < 0.05) return "Very even (can sound robotic)";
  if (cv <= 0.25) return "Natural changes";
  return "Big swings";
}

export function steadinessWord(npvi: number): string {
  if (npvi <= 8) return "Smooth";
  if (npvi <= 14) return "A little choppy";
  return "Choppy";
}

export function clusteringWord(b: number, total: number): string {
  if (total < 3) return "Too few to tell";
  return b > 0.2 ? "Bunched together at certain moments" : "Spread through the talk";
}

export function scoreOf(scores: Scores, key: MetricKey): number | null {
  return scores[key] ?? null;
}

/** One-line strength for the takeaway card, e.g. "Kept fillers to 0.5/min". */
export function strengthLine(metric: string, s: Summary, text = ""): string {
  if (metric.startsWith("content")) return firstSentence(text);
  switch (metric) {
    case "eyeContact":
      return `${Math.round(s.gaze?.audiencePct ?? 0)}% eye contact with the audience`;
    case "fillers":
      return `Kept fillers to ${s.fillers.perMinute.toFixed(1)}/min`;
    case "pacing":
      return `Good speed: ${Math.round(s.pacing.meanWpm)} words/min`;
    case "vocalVariety":
      return "Expressive, varied voice";
    case "structure":
      return "Clear structure";
    default:
      return "";
  }
}

/** First sentence only: the takeaway card shows one idea per line. */
export function firstSentence(text: string): string {
  const m = text.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : text).trim();
}

export function stripDrillLabel(drill: string): string {
  const d = drill.replace(/^Drill:\s*/i, "");
  return d.charAt(0).toUpperCase() + d.slice(1);
}

/** Coach mode shows a level instead of a number: encouraging at every stage. */
export function coachLevel(score: number): { stars: number; word: string; color: string } {
  if (score >= 85) return { stars: 5, word: "Excellent", color: "var(--good)" };
  if (score >= 70) return { stars: 4, word: "Strong", color: "var(--good)" };
  if (score >= 55) return { stars: 3, word: "Solid", color: "var(--concrete)" };
  if (score >= 40) return { stars: 2, word: "Building", color: "var(--accent)" };
  return { stars: 1, word: "Warming up", color: "var(--concrete-dim)" };
}

/** The three headline scores. Delivery details (speed, fillers, voice, eye contact) sit under Engagement. */
export const TOP_METRICS: MetricInfo[] = [
  {
    key: "content",
    title: "Content",
    short: "Content",
    what: "What you said: on the prompt, backed by evidence, direct and clear, with a takeaway, and solid Q&A answers.",
    how: [
      "On the prompt 25%: how many of the prompt's key ideas you covered (60% of them = full marks).",
      "Evidence 20%: about one number, example or source every 40 seconds.",
      "Directness 15%: hedges like “I think”, “maybe”, “kind of” per 100 words.",
      "Clarity 15%: sentences of about 10 to 20 words.",
      "Word variety 10%, takeaway 5%, Q&A answers 10% (on topic, long enough, answered directly).",
      "Parts that don't apply (no prompt, no Q&A) are left out.",
    ],
    measured: (s) => (s.content?.score != null ? `${Object.keys(s.content.parts).length} things checked` : "Not enough speech"),
  },
  METRICS.find((m) => m.key === "structure")!,
  {
    key: "engagement",
    title: "Engagement",
    short: "Engagement",
    what: "How you said it, and how your audience reacted: speed, filler words, voice and eye contact.",
    how: [
      "Half: the average of your speed, filler-word, voice and eye-contact scores (Delivery, below).",
      "Half: the live audience's average engagement during your talk.",
      "With a Q&A round, your answers count too, weighted by how long they lasted.",
    ],
    measured: (s) => (s.engagement ? `Audience average ${Math.round(s.engagement.meanE)}` : ""),
  },
];

export const DELIVERY_METRICS: MetricInfo[] = METRICS.filter((m) => m.key !== "structure");

export const OVERALL_HOW = "Overall = Content 35% + Structure 25% + Engagement 40%.";

export const CONTENT_PARTS: Record<string, string> = {
  relevance: "On the prompt",
  evidence: "Evidence",
  directness: "Directness",
  clarity: "Clear sentences",
  vocabulary: "Word variety",
  takeaway: "Takeaway",
  qa: "Q&A answers",
};
