/**
 * Routes TTS `<audio>` through Web Audio so the companion avatar can read RMS for lip sync.
 * Wired from `chatTts.ts` only — RAG / fetch logic unchanged.
 */

let audioContext: AudioContext | null = null;
let mediaSource: MediaElementAudioSourceNode | null = null;
let analyser: AnalyserNode | null = null;
let timeDomainBuffer: Uint8Array<ArrayBuffer> | null = null;

export function attachCompanionTtsAudio(audio: HTMLAudioElement): void {
  detachCompanionTtsAudio();
  try {
    const ctx = new AudioContext();
    const src = ctx.createMediaElementSource(audio);
    const an = ctx.createAnalyser();
    an.fftSize = 256;
    an.smoothingTimeConstant = 0.72;
    src.connect(an);
    an.connect(ctx.destination);
    void ctx.resume();
    audioContext = ctx;
    mediaSource = src;
    analyser = an;
    timeDomainBuffer = new Uint8Array(new ArrayBuffer(an.fftSize)) as Uint8Array<ArrayBuffer>;
  } catch {
    detachCompanionTtsAudio();
  }
}

export function detachCompanionTtsAudio(): void {
  try {
    mediaSource?.disconnect();
    analyser?.disconnect();
    void audioContext?.close();
  } catch {
    /* ignore */
  }
  audioContext = null;
  mediaSource = null;
  analyser = null;
  timeDomainBuffer = null;
}

/** ~0..1 RMS from time-domain samples (cheap; good enough for mouth “aa”). */
export function getCompanionTtsVolume(): number {
  if (!analyser || !timeDomainBuffer) return 0;
  analyser.getByteTimeDomainData(timeDomainBuffer);
  let sum = 0;
  const n = timeDomainBuffer.length;
  for (let i = 0; i < n; i++) {
    const v = (timeDomainBuffer[i]! - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / n);
  return Math.min(1, rms * 4.2);
}
