// Copy the MediaPipe WASM runtime and the face model into public/ so they are
// served locally (dev) and bundled into the app (prod). Nothing loads from a CDN.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..");
const repo = join(app, "..", "..");
const wasmSrc = join(app, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const pub = join(app, "public");
mkdirSync(join(pub, "mediapipe"), { recursive: true });
cpSync(wasmSrc, join(pub, "mediapipe", "wasm"), { recursive: true });
const model = join(repo, "models", "face_landmarker.task");
if (!existsSync(model)) {
  console.error("models/face_landmarker.task missing. Run: cd engine && uv run python ../scripts/fetch_models.py");
  process.exit(1);
}
cpSync(model, join(pub, "mediapipe", "face_landmarker.task"));
console.log("assets: mediapipe wasm + face model copied to public/mediapipe");
