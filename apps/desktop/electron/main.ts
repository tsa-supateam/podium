/**
 * Electron main process.
 *  - spawns the Python engine on a random loopback port with a one-time token
 *  - enforces offline mode: every request that is not local is cancelled
 *  - serves the built renderer from a privileged app:// protocol (needed for WASM)
 */
import { app, BrowserWindow, ipcMain, net, protocol, session, systemPreferences, shell } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");
const repoRoot = join(appRoot, "..", "..");
const devUrl = process.env.VITE_DEV_URL;
// PODIUM_SMOKE=1: hidden window, no permission prompts; exit 0 once the UI is connected to the engine.
const smoke = process.env.PODIUM_SMOKE === "1";

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let engine: ChildProcess | null = null;
const engineInfo: { port: number; token: string; error?: string } = { port: 0, token: randomBytes(24).toString("hex") };
let engineReady: Promise<void>;

function pythonCommand(): { cmd: string; args: string[]; cwd: string } {
  const engineDir = join(repoRoot, "engine");
  const packaged = join(process.resourcesPath ?? "", "engine", "podium-engine");
  if (app.isPackaged && existsSync(packaged)) return { cmd: packaged, args: [], cwd: dirname(packaged) };
  const venvPy = process.platform === "win32"
    ? join(engineDir, ".venv", "Scripts", "python.exe")
    : join(engineDir, ".venv", "bin", "python");
  return { cmd: existsSync(venvPy) ? venvPy : "python3", args: ["-m", "podium_engine"], cwd: engineDir };
}

function startEngine(): Promise<void> {
  return new Promise((resolve) => {
    const { cmd, args, cwd } = pythonCommand();
    engine = spawn(cmd, [...args, "serve", "--port", "0", "--token", engineInfo.token], {
      cwd,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let buf = "";
    engine.stdout?.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      for (const line of buf.split("\n").slice(0, -1)) {
        try {
          const msg = JSON.parse(line);
          if (msg.event === "ready") {
            engineInfo.port = msg.port;
            resolve();
          }
        } catch {
          /* not JSON */
        }
      }
      buf = buf.split("\n").pop() ?? "";
    });
    engine.stderr?.on("data", (d: Buffer) => process.stderr.write(`[engine] ${d}`));
    engine.on("exit", (code) => {
      engineInfo.error = `Engine exited with code ${code}`;
      resolve();
    });
  });
}

function enforceOffline(): void {
  const allowed = /^(app|devtools|chrome-extension|data|blob|file):/;
  const local = /^(https?|wss?):\/\/(127\.0\.0\.1|localhost)(:\d+)?\//;
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    const ok = allowed.test(details.url) || local.test(details.url);
    if (!ok) console.warn(`[offline] blocked ${details.url}`);
    cb({ cancel: !ok });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === "media" || permission === "fullscreen");
  });
}

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    show: !smoke,
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#151515",
    icon: join(here, "..", "public", "icon.png"),
    // no OS title bar or menu: the app's top bar is the drag area and draws its own window buttons
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    title: "Podium",
    webPreferences: {
      preload: join(here, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const sendMax = () => win.webContents.send("win:maximized", win.isMaximized());
  win.on("maximize", sendMax);
  win.on("unmaximize", sendMax);
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("app://") && !(devUrl && url.startsWith(devUrl))) e.preventDefault();
  });
  await win.loadURL(devUrl ?? "app://podium/index.html");
  if (smoke) {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const text: string = await win.webContents.executeJavaScript("document.body.innerText");
      if (text.toLowerCase().replace(/\s+/g, " ").includes("practice in front of an audience")) {
        console.log("SMOKE OK: renderer loaded and connected to the engine");
        engine?.kill();
        app.exit(0);
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    console.error("SMOKE FAILED: renderer never connected to the engine");
    engine?.kill();
    app.exit(1);
  }
}

app.whenReady().then(async () => {
  enforceOffline();
  const dist = join(appRoot, "dist");
  protocol.handle("app", (req) => {
    const { pathname } = new URL(req.url);
    const file = join(dist, decodeURIComponent(pathname));
    if (!file.startsWith(dist)) return new Response("forbidden", { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  if (process.platform === "darwin" && !smoke) {
    await systemPreferences.askForMediaAccess("camera").catch(() => false);
    await systemPreferences.askForMediaAccess("microphone").catch(() => false);
  }
  engineReady = startEngine();
  ipcMain.handle("engine:info", async () => {
    await engineReady;
    return engineInfo;
  });
  ipcMain.handle("open:data-folder", () => shell.openPath(join(app.getPath("appData"), "Podium")));
  ipcMain.on("win", (e, action: unknown) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w) return;
    if (action === "min") w.minimize();
    else if (action === "max") (w.isMaximized() ? w.unmaximize() : w.maximize());
    else if (action === "close") w.close();
  });
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  engine?.kill();
});
