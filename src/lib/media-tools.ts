import { supabase } from '@/lib/supabase';
import { fnErrorMessage } from '@/lib/viewtrack';

/**
 * Web-only media helpers: fetch a video through the vt-download proxy (the
 * CDNs don't allow CORS), decode its audio track in the browser, and emit
 * clean mono 16-bit WAVs — what voice-cloning tools want.
 */

/** Fetch a (cross-origin) media file through the vt-download proxy. */
export async function fetchMediaBlob(mediaUrl: string): Promise<Blob> {
  const { data, error } = await supabase.functions.invoke('vt-download', { body: { proxyUrl: mediaUrl } });
  if (error) throw new Error(await fnErrorMessage(error));
  if (!(data instanceof Blob)) throw new Error('proxy did not return media');
  return data;
}

/** Decode the audio track out of a video/audio file. */
export async function decodeAudio(blob: Blob): Promise<AudioBuffer> {
  const Ctx = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error('audio extraction needs a web browser');
  const ctx = new Ctx();
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    ctx.close();
  }
}

/** Encode one or more decoded buffers (concatenated in order) as mono 16-bit PCM WAV. */
export function encodeWav(buffers: AudioBuffer[]): Blob {
  const rate = buffers[0]?.sampleRate ?? 44100;
  const total = buffers.reduce((s, b) => s + b.length, 0);
  const pcm = new Int16Array(total);
  let off = 0;
  for (const b of buffers) {
    const chs = Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c));
    for (let i = 0; i < b.length; i++) {
      let v = 0;
      for (const ch of chs) v += ch[i];
      v /= chs.length;
      pcm[off++] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
    }
  }
  const header = new ArrayBuffer(44);
  const dv = new DataView(header);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, 'RIFF');
  dv.setUint32(4, 36 + pcm.byteLength, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  w(36, 'data');
  dv.setUint32(40, pcm.byteLength, true);
  return new Blob([header, pcm.buffer], { type: 'audio/wav' });
}

/** Trigger a browser download of a blob. */
export function saveBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Full pipeline: proxy-fetch a video file and return its audio as WAV. */
export async function videoToWav(mediaUrl: string): Promise<Blob> {
  return encodeWav([await decodeAudio(await fetchMediaBlob(mediaUrl))]);
}

export const safeName = (s: string) => (s || 'video').replace(/[^\w.-]/g, '');

/** "00:38" (or "01:02") → seconds. */
export function timestampToSeconds(ts?: string): number | null {
  const m = ts?.match(/^(\d+):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Pull JPEG frames out of a video file at the given second marks (web only):
 * hidden <video> element + seek + canvas — no ffmpeg needed.
 */
export async function extractFramesFromVideo(blob: Blob, seconds: number[]): Promise<Map<number, Blob>> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('video failed to load'));
    });
    const out = new Map<number, Blob>();
    for (const s of seconds) {
      // +0.5s so the overlay has actually rendered by the captured frame
      video.currentTime = Math.min(s + 0.5, Math.max(0, video.duration - 0.05));
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
      });
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 480 / (video.videoWidth || 480));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx || !canvas.width) continue;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const b = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
      if (b) out.set(s, b);
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Snapshot the current frame of a playing <video> element as a PNG (web only). */
export function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx || !canvas.width) return reject(new Error('video not ready yet'));
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('frame capture failed'))), 'image/png');
  });
}

/** Open a file picker for local video/audio files (web only). */
export function pickLocalMedia(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,audio/*,.mp4,.mov,.m4a,.mp3,.webm';
    input.multiple = true;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
}
