// Microphone capture in the app window, streamed to the engine as 16 kHz float32 PCM.
// The window holds the OS mic permission; a child Python process may silently get zeros on macOS.

let stream: MediaStream | null = null;
let deviceIdInUse: string | null = null;
let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let worklet: AudioWorkletNode | null = null;
let sink: ((pcm: ArrayBuffer) => void) | null = null;
const levelBuf = new Float32Array(1024);
let opening: Promise<unknown> = Promise.resolve();

/** Calls are queued: two overlapping opens used to leave two capture graphs feeding the engine at once,
 *  interleaving their frames (twice the audio, garbled speech). */
export function startMic(deviceId: string | null = null): Promise<MediaStream> {
  const p = opening.then(() => openMic(deviceId));
  opening = p.catch(() => {});
  return p;
}

async function openMic(deviceId: string | null): Promise<MediaStream> {
  if (stream && deviceIdInUse === deviceId) return stream;
  stopMic();
  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      channelCount: 1,
      // Raw signal: echo cancellation and noise suppression would distort pitch and loudness.
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  deviceIdInUse = deviceId;
  ctx = new AudioContext({ sampleRate: 16000 });
  const src = ctx.createMediaStreamSource(stream);
  analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  src.connect(analyser);
  await ctx.audioWorklet.addModule(new URL("./pcm-capture-worklet.js", document.baseURI).toString());
  const node = new AudioWorkletNode(ctx, "pcm-capture");
  worklet = node;
  node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    if (node === worklet) sink?.(e.data);
  };
  src.connect(node);
  // Keep the graph pulling without making any sound.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  worklet.connect(mute).connect(ctx.destination);
  if (ctx.state === "suspended") await ctx.resume();
  return stream;
}

export function stopMic(): void {
  sink = null;
  worklet?.disconnect();
  void ctx?.close();
  stream?.getTracks().forEach((t) => t.stop());
  stream = ctx = analyser = worklet = null;
  deviceIdInUse = null;
}

export function micStream(): MediaStream | null {
  return stream;
}

export function micLabel(): string | null {
  return stream?.getAudioTracks()[0]?.label ?? null;
}

/** Input level in dBFS (about -100 for silence, near 0 when clipping). */
export function micLevelDb(): number {
  if (!analyser) return -120;
  analyser.getFloatTimeDomainData(levelBuf);
  let s = 0;
  for (const v of levelBuf) s += v * v;
  return 10 * Math.log10(s / levelBuf.length + 1e-12);
}

export function streamTo(fn: ((pcm: ArrayBuffer) => void) | null): void {
  if (ctx?.state === "suspended") void ctx.resume();
  sink = fn;
}

export async function listMics(): Promise<{ deviceId: string; label: string }[]> {
  const devs = await navigator.mediaDevices.enumerateDevices();
  return devs.filter((d) => d.kind === "audioinput").map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
}
