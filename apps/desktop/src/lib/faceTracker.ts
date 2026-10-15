// MediaPipe Face Landmarker wrapper. Model + WASM are bundled under public/mediapipe (no CDN).
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import {
  DEFAULT_GAINS,
  DEFAULT_ZONE_MODEL,
  OneEuro,
  StickyZoneFilter,
  gazeAngles,
  headPose,
  irisOffset,
  zoneProbabilities,
  type GazeCalibrationGains,
  type Point,
  type ZoneModel,
} from "./gaze";
import type { GazeSample } from "./types";

export interface RawGaze {
  t: number;
  face: boolean;
  yawImg: number;
  pitchUp: number;
  roll: number;
  dx: number;
  dy: number;
  openness: number;
  landmarks?: Point[];
}

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

function loadLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const base = new URL("./mediapipe/", document.baseURI).toString();
      const fileset = await FilesetResolver.forVisionTasks(base + "wasm");
      const opts = (delegate: "GPU" | "CPU") => ({
        baseOptions: { modelAssetPath: base + "face_landmarker.task", delegate },
        runningMode: "VIDEO" as const,
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
        outputFaceBlendshapes: false,
      });
      try {
        return await FaceLandmarker.createFromOptions(fileset, opts("GPU"));
      } catch {
        return await FaceLandmarker.createFromOptions(fileset, opts("CPU"));
      }
    })();
  }
  return landmarkerPromise;
}

export class FaceTracker {
  private running = false;
  private lastVideoTime = -1;
  private filters = { yaw: new OneEuro(1.0, 0.02), pitch: new OneEuro(1.0, 0.02) };
  private sticky = new StickyZoneFilter(0.97);
  model: ZoneModel = DEFAULT_ZONE_MODEL;
  gains: GazeCalibrationGains = DEFAULT_GAINS;
  flipYaw = false;
  fps = 0;
  inferMs = 0;
  onRaw: (r: RawGaze) => void = () => {};
  onSample: (s: GazeSample) => void = () => {};

  async start(video: HTMLVideoElement): Promise<void> {
    const lm = await loadLandmarker();
    this.running = true;
    let frames = 0;
    let fpsT = performance.now();
    const loop = () => {
      if (!this.running) return;
      if (video.readyState >= 2 && video.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = video.currentTime;
        const now = performance.now();
        const res = lm.detectForVideo(video, now);
        this.inferMs = performance.now() - now;
        this.process(res, now / 1000);
        frames++;
        if (now - fpsT > 1000) {
          this.fps = (frames * 1000) / (now - fpsT);
          frames = 0;
          fpsT = now;
        }
      }
      if ("requestVideoFrameCallback" in video) (video as any).requestVideoFrameCallback(loop);
      else requestAnimationFrame(loop);
    };
    loop();
  }

  stop(): void {
    this.running = false;
  }

  private process(res: any, t: number): void {
    const lms: Point[] | undefined = res.faceLandmarks?.[0];
    const mat = res.facialTransformationMatrixes?.[0]?.data;
    if (!lms || !mat) {
      this.onRaw({ t, face: false, yawImg: 0, pitchUp: 0, roll: 0, dx: 0, dy: 0, openness: 0 });
      const { zone, belief } = this.sticky.step({ L: 0.01, C: 0.01, R: 0.01, N: 0.01, X: 0.96 });
      this.onSample({ t, face: false, yaw: 0, pitch: 0, roll: 0, irisX: 0, irisY: 0, gYaw: 0, gPitch: 0, zone,
        zoneP: belief, conf: 0 });
      return;
    }
    const pose = headPose(mat);
    const iris = irisOffset(lms);
    this.onRaw({ t, face: true, ...pose, ...iris, landmarks: lms });
    const g = gazeAngles(pose, iris, this.gains, this.flipYaw);
    const gYaw = this.filters.yaw.filter(g.gYaw, t);
    const gPitch = this.filters.pitch.filter(g.gPitch, t);
    const probs = zoneProbabilities([gYaw, gPitch], this.model);
    const { zone, belief } = this.sticky.step(probs);
    this.onSample({
      t, face: true,
      yaw: round(this.flipYaw ? pose.yawImg : -pose.yawImg), pitch: round(pose.pitchUp), roll: round(pose.roll),
      irisX: round(iris.dx, 3), irisY: round(iris.dy, 3), gYaw: round(gYaw), gPitch: round(gPitch),
      zone, zoneP: Object.fromEntries(Object.entries(belief).map(([k, v]) => [k, round(v, 3)])), conf: round(1 - probs.X, 2),
    });
  }
}

function round(x: number, d = 1): number {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}
