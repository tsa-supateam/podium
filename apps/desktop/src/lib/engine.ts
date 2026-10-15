// WebSocket client for the local Python engine (loopback only).
import type { Envelope } from "./types";

type Listener = (ev: Envelope) => void;

declare global {
  interface Window {
    podium?: {
      engineInfo: () => Promise<{ port: number; token: string; error?: string }>;
      openDataFolder: () => Promise<string>;
      isElectron: boolean;
    };
  }
}

export async function resolveEngine(): Promise<{ port: number; token: string; error?: string }> {
  if (window.podium) return window.podium.engineInfo();
  // Browser dev mode: start the engine yourself and pass ?port=&token=
  const q = new URLSearchParams(location.search);
  return { port: Number(q.get("port") ?? 8765), token: q.get("token") ?? "dev" };
}

function packBinary(header: object, payload: ArrayBuffer): ArrayBuffer {
  const h = new TextEncoder().encode(JSON.stringify(header));
  const out = new Uint8Array(4 + h.length + payload.byteLength);
  new DataView(out.buffer).setUint32(0, h.length);
  out.set(h, 4);
  out.set(new Uint8Array(payload), 4 + h.length);
  return out.buffer;
}

function unpackBinary(buf: ArrayBuffer): { header: any; payload: ArrayBuffer } {
  const n = new DataView(buf).getUint32(0);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n)));
  return { header, payload: buf.slice(4 + n) };
}

export class EngineClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private listeners = new Set<Listener>();
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private fileCache = new Map<string, string>();
  status: "connecting" | "open" | "closed" = "closed";
  onStatus: (s: EngineClient["status"], detail?: string) => void = () => {};

  private connecting: Promise<void> | null = null;

  /** Idempotent: concurrent callers (e.g. React StrictMode double effects) share one connection. */
  connect(): Promise<void> {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return Promise.resolve();
    if (!this.connecting) {
      this.connecting = this.open().finally(() => {
        this.connecting = null;
      });
    }
    return this.connecting;
  }

  private async open(): Promise<void> {
    const info = await resolveEngine();
    if (info.error) throw new Error(info.error);
    this.status = "connecting";
    this.onStatus(this.status);
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${info.port}/?token=${info.token}`);
      ws.binaryType = "arraybuffer";
      ws.onopen = () => {
        this.ws = ws;
        this.status = "open";
        this.onStatus(this.status);
        resolve();
      };
      ws.onerror = () => reject(new Error("Could not reach the Podium engine"));
      ws.onclose = (e) => {
        if (this.ws !== ws && this.ws !== null) return;
        this.ws = null;
        this.status = "closed";
        this.onStatus(this.status, e.reason);
        for (const p of this.pending.values()) p.reject(new Error("engine disconnected"));
        this.pending.clear();
        if (e.code !== 4000) setTimeout(() => this.connect().catch(() => {}), 1500);
      };
      ws.onmessage = (m) => this.onMessage(m.data);
    });
  }

  private onMessage(data: string | ArrayBuffer): void {
    if (typeof data !== "string") {
      const { header, payload } = unpackBinary(data);
      const p = header.id != null ? this.pending.get(header.id) : undefined;
      if (p) {
        this.pending.delete(header.id);
        p.resolve(payload);
      }
      return;
    }
    const ev = JSON.parse(data) as Envelope;
    if (ev.id != null && this.pending.has(ev.id)) {
      const p = this.pending.get(ev.id)!;
      this.pending.delete(ev.id);
      if (ev.type === "error") p.reject(new Error(ev.data?.message ?? "engine error"));
      else p.resolve(ev.data);
    }
    for (const l of this.listeners) l(ev);
  }

  on(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  send(type: string, data: unknown = {}): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ v: 1, type, data }));
  }

  request<T = any>(type: string, data: unknown = {}, timeoutMs = 30000): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      if (this.ws?.readyState !== WebSocket.OPEN) return reject(new Error("engine not connected"));
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ v: 1, type, id, data }));
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${type} timed out`));
      }, timeoutMs);
    });
  }

  /** Fetch a session file as a blob: URL (cached). Blob URLs give the <video>/<audio> elements full seeking. */
  async fileUrl(sessionId: string, name: string, mime: string): Promise<string> {
    const key = `${sessionId}/${name}`;
    const hit = this.fileCache.get(key);
    if (hit) return hit;
    const buf = await this.request<ArrayBuffer>("file.get", { sessionId, name }, 120000);
    const url = URL.createObjectURL(new Blob([buf], { type: mime }));
    this.fileCache.set(key, url);
    return url;
  }

  async uploadVideo(sessionId: string, blob: Blob): Promise<void> {
    const id = this.nextId++;
    const payload = await blob.arrayBuffer();
    await new Promise<void>((resolve, reject) => {
      this.pending.set(id, { resolve: () => resolve(), reject });
      this.ws?.send(packBinary({ type: "video.upload", id, sessionId }, payload));
    });
  }
}

export const engine = new EngineClient();
