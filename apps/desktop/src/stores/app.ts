// App-level state (Zustand) + a mutable "live" bag for high-frequency data that must stay out of React.
import { create } from "zustand";
import { useEffect, useState } from "react";
import { DEFAULT_GAINS, DEFAULT_ZONE_MODEL, type GazeCalibrationGains, type ZoneModel } from "../lib/gaze";
import type { EngagementTick, FillerEventMsg, GazeSample, PaceTick, Question, SessionBundle } from "../lib/types";

export type Screen = "home" | "setup" | "calibrate" | "live" | "qa" | "analyzing" | "debrief" | "history" | "learn" | "average";

export interface NavEntry {
  screen: Screen;
  learnPath: { module: string | null; skill: string | null };
}
/** Screens you browse between; swiping back moves through these like a web browser. */
export const BROWSE_SCREENS: Screen[] = ["home", "learn", "history", "average", "debrief"];

/** A Learn practice in progress: a short run checked against one skill. */
export interface Drill {
  skill: string;
  check: string;
  prompt: string;
  seconds: number;
}

export interface QARound {
  parentId: string;
  questions: Question[] | null; // null while loading
  picked: number[]; // indexes into questions, in answer order (max 2)
  index: number; // which picked question is current; -1 while choosing
  seconds: number; // answer time limit
  answering: boolean; // an answer session is recording
}

/** Target words per minute by speech type (the engine uses the same bands). */
export const SPEED_BANDS = { prepared: [120, 160], impromptu: [100, 140] } as const;

export interface Settings {
  prompt: string; // the topic for the next run ("" = free talk)
  promptCategory: string | null; // limit random prompts to one category
  gazeMode: "room" | "camera"; // simulated audience (left/center/right) or direct camera (up/down)
  speechType: "prepared" | "impromptu"; // sets the target speed
  targetMinutes: number | null;
  recordVideo: boolean;
  flipYaw: boolean;
  showCamera: boolean;
  audioDevice: string | null; // browser deviceId
  notes: boolean; // speaking with notes/slides (false: looking down counts as looking away)
  difficulty: "coach" | "judge"; // shown as Practice / Assessment: practice adds live cues and encouraging results
  demoMode: boolean; // Judge Demo Mode: Learn shows every module unlocked with sample progress
}

interface AppState {
  screen: Screen;
  conn: "connecting" | "open" | "closed";
  connDetail?: string;
  models: Record<string, boolean> | null;
  settings: Settings;
  calibrated: boolean;
  zoneModel: ZoneModel;
  gains: GazeCalibrationGains;
  sessionId: string | null;
  replayFrom: string | null;
  replayDuration: number | null;
  analysis: { stage: string; pct: number; sessionId: string } | null;
  analysisError: string | null;
  bundle: SessionBundle | null;
  /** The Q&A round between the speech and its results. index -1 = choosing questions. */
  qa: QARound | null;
  paused: boolean;
  /** Background analysis progress of the main speech (shown during Q&A). */
  mainAnalysis: { stage: string; pct: number; done: boolean } | null;
  drill: Drill | null;
  learnPath: { module: string | null; skill: string | null };
  /** Back history for the browsing screens (Home, Learn and its pages, History, Average, results). */
  backStack: NavEntry[];
  /** Bumped to play the particle warp between screens; the shutter stays out of the way. */
  warp: number;
  toast: string | null;
  set: (p: Partial<AppState>) => void;
  setSettings: (p: Partial<Settings>) => void;
  go: (s: Screen) => void;
}

const savedSettings = (): Partial<Settings> => {
  try {
    return JSON.parse(localStorage.getItem("podium.settings") ?? "{}");
  } catch {
    return {};
  }
};

export const useApp = create<AppState>((set, get) => ({
  screen: "home",
  conn: "connecting",
  models: null,
  settings: {
    prompt: "",
    promptCategory: null,
    gazeMode: "room",
    speechType: "prepared",
    targetMinutes: 3,
    recordVideo: true,
    flipYaw: false,
    showCamera: true,
    audioDevice: null,
    notes: true,
    difficulty: "coach",
    demoMode: false,
    ...savedSettings(),
  },
  calibrated: false,
  zoneModel: DEFAULT_ZONE_MODEL,
  gains: DEFAULT_GAINS,
  sessionId: null,
  replayFrom: null,
  replayDuration: null,
  analysis: null,
  analysisError: null,
  bundle: null,
  qa: null,
  paused: false,
  mainAnalysis: null,
  drill: null,
  learnPath: { module: null, skill: null },
  backStack: [],
  warp: 0,
  toast: null,
  set: (p) => set(p),
  setSettings: (p) => {
    const settings = { ...get().settings, ...p };
    try {
      localStorage.setItem("podium.settings", JSON.stringify(settings));
    } catch {
      /* storage unavailable */
    }
    set({ settings });
  },
  // leaving for Home, History or Learn ends a practice that never started
  go: (screen) => set(screen === "home" || screen === "history" || screen === "learn" ? { screen, drill: null } : { screen }),
}));

/** High-frequency live data. Written by event handlers, read by animation loops / throttled hooks. */
export const live = {
  startedAt: 0,
  tick: null as EngagementTick | null,
  pace: null as PaceTick | null,
  fillers: [] as FillerEventMsg[],
  lastFiller: null as (FillerEventMsg & { at: number }) | null,
  gaze: null as GazeSample | null,
  gazeHistory: [] as { t: number; zone: string }[],
  partial: "",
  finals: [] as string[],
  eSeries: [] as { t: number; E: number }[],
  wpmSeries: [] as { t: number; wpm: number }[],
  reset() {
    this.startedAt = performance.now();
    this.tick = null;
    this.pace = null;
    this.fillers = [];
    this.lastFiller = null;
    this.gaze = null;
    this.gazeHistory = [];
    this.partial = "";
    this.finals = [];
    this.eSeries = [];
    this.wpmSeries = [];
  },
};

/** Re-render a component at a fixed rate (default 10 Hz) to show live data without flooding React. */
export function useTicker(hz = 10): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((x) => x + 1), 1000 / hz);
    return () => clearInterval(id);
  }, [hz]);
  return n;
}
