import { contextBridge, ipcRenderer } from "electron";

// The renderer gets exactly two capabilities: find the engine, open the data folder.
contextBridge.exposeInMainWorld("podium", {
  engineInfo: (): Promise<{ port: number; token: string; error?: string }> => ipcRenderer.invoke("engine:info"),
  openDataFolder: (): Promise<string> => ipcRenderer.invoke("open:data-folder"),
  isElectron: true,
});
