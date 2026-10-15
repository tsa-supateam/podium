// Shared types mirroring the engine's JSON (see docs/TECHNICAL_SPEC.md §5).

export type Zone = "L" | "C" | "R" | "N" | "X";
export const ZONES: Zone[] = ["L", "C", "R", "N", "X"];
export const ZONE_NAMES: Record<Zone, string> = {
  L: "Left audience",
  C: "Center audience",
  R: "Right audience",
  N: "Notes / slides",
  X: "Away",
};

export interface Envelope<T = any> {
  v?: number;
  type: string;
  id?: number;
  t?: number;
  data: T;
}

export interface EngagementTick {
  t: number;
  Braw: number;
  B: number;
  E: number;
  c: { filler: number | null; monotony: number | null; gaze: number | null; pace: number | null; silence: number | null };
  zoneShare: Partial<Record<Zone, number>>;
  audienceState: "engaged" | "neutral" | "bored";
  speaking: boolean;
  levelDb: number;
  fillerBurst: boolean;
}

export interface PaceTick {
  t: number;
  wpm: number;
  wpmEma: number;
  artRate: number;
  speechFrac: number;
  label: "drag" | "slow" | "optimal" | "fast" | "rushing" | "pause";
}

export interface FillerEventMsg {
  t0: number;
  t1: number;
  token: string;
  class: "filled_pause" | "lexical";
  conf: number;
  src: string;
  total: number;
}

export interface GazeSample {
  t: number;
  face: boolean;
  yaw: number;
  pitch: number;
  roll: number;
  irisX: number;
  irisY: number;
  gYaw: number;
  gPitch: number;
  zone: Zone;
  zoneP: Partial<Record<Zone, number>>;
  conf: number;
}

export interface Scores {
  overall: number;
  grade: string;
  pacing: number;
  fillers: number;
  vocalVariety: number;
  eyeContact: number | null;
  structure: number;
}

export interface Summary {
  sessionId: string;
  title: string;
  durationSec: number;
  speakingTimeSec: number;
  wordCount: number;
  scores: Scores;
  pacing: {
    meanWpm: number;
    medianWpm: number;
    stdWpm: number;
    cv: number;
    npvi: number;
    articulationRate: number;
    pauseRatio: number;
    longPauses: { t0: number; t1: number }[];
    segments: { t0: number; t1: number; meanWpm: number; label: string }[];
    accelZones: { t0: number; t1: number; kind: string; peakWpm: number }[];
    series: { t: number[]; wpm: number[]; speech?: boolean[]; smoothT?: number[]; smooth?: number[] };
  };
  fillers: {
    total: number;
    perMinute: number;
    ratio: number;
    byToken: Record<string, number>;
    burstiness: number;
    clusters: { t0: number; t1: number; count: number; tokens: string[]; context?: string }[];
    events: { t0: number; t1: number; token: string; class: string; conf: number; src: string }[];
  };
  voice: {
    f0MedianHz: number;
    f0RangeSt: number;
    f0StdSt: number;
    rmsDbMean: number;
    rmsDbStd: number;
    jitterLocal?: number;
    shimmerLocal?: number;
    hnrDb?: number;
    monotoneSegments: { t0: number; t1: number; stdSt: number }[];
    track: { t: number[]; st: (number | null)[]; db: number[] };
  };
  gaze: null | {
    faceVisibleFrac: number;
    zonePct: Record<Zone, number>;
    audiencePct: number;
    balanceEntropy: number;
    longestNotesStareSec: number;
    notesStares: { t0: number; t1: number }[];
    heatmap: { yawBins: number[]; pitchBins: number[]; rows: number; cols: number; u8: string };
    timeline: [number, Zone][];
  };
  engagement: null | {
    meanE: number;
    minE: number;
    timeBoredPct: number;
    lowPoints: { t: number; E: number; drivers: string[] }[];
    series: { t: number[]; E: number[] };
  };
  structure: {
    sentences: number;
    openingHook: boolean;
    conclusionDetected: boolean;
    transitions: string[];
    withinTarget: boolean;
    score: number;
  };
  keyphrases: { phrase: string; score: number; count: number; firstT: number | null; times: number[] }[];
  highlights: { t: number; kind: string; severity: number }[];
  debrief: { text: string; strengths: any[]; growth: { text: string; t: number | null; metric: string }[]; drill: string | null };
  debriefAudio?: string;
  analysisSec: number;
}

export interface Transcript {
  text: string;
  words: { t0: number; t1: number; w: string; p: number }[];
  sentences: { t0: number; t1: number; text: string }[];
}

export interface Question {
  kind: string;
  question: string;
  t: number | null;
  score: number;
  source: string;
}

export interface SessionBundle {
  sessionId: string;
  session: any;
  summary: Summary | null;
  transcript: Transcript | null;
  questions: { questions: Question[] } | null;
  calibration: any;
  files: string[];
}

export interface SessionRow {
  sessionId: string;
  createdAt: string;
  title: string;
  mode: string;
  durationSec: number;
  status: string;
  overall: number | null;
  scores: Scores | null;
}
