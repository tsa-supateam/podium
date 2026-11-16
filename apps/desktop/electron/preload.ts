import { contextBridge, ipcRenderer } from "electron";

// The renderer gets: find the engine, open the data folder, and drive its own (frameless) window.
contextBridge.exposeInMainWorld("podium", {
  engineInfo: (): Promise<{ port: number; token: string; error?: string }> => ipcRenderer.invoke("engine:info"),
  openDataFolder: (): Promise<string> => ipcRenderer.invoke("open:data-folder"),
  isElectron: true,
  win: (action: "min" | "max" | "close"): void => ipcRenderer.send("win", action),
  onMaximized: (cb: (max: boolean) => void): (() => void) => {
    const fn = (_e: unknown, max: boolean) => cb(max);
    ipcRenderer.on("win:maximized", fn);
    return () => ipcRenderer.removeListener("win:maximized", fn);
  },
});
