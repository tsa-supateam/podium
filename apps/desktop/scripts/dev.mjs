// Dev runner: Vite dev server for the renderer + Electron pointed at it.
import { spawn } from "node:child_process";
import { createServer } from "vite";

await import("./build-electron.mjs");
const server = await createServer({ configFile: "vite.config.ts" });
await server.listen();
const url = "http://127.0.0.1:5173";
const electronPath = (await import("electron")).default;
const child = spawn(electronPath, ["."], { stdio: "inherit", env: { ...process.env, VITE_DEV_URL: url } });
child.on("exit", async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
