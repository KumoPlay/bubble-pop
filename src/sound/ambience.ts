/**
 * Calm background sound, off unless chosen in Settings, with its own volume:
 *   - breeze: soft wind that slowly swells and fades,
 *   - chimes: a wind chime now and then, with a soft echo.
 * Both are made on the spot with the Web Audio API (no audio files). They stop
 * completely when the tab is hidden, and start again with the next tap.
 */
import type { Ambience } from '../core/progress/state';
import { ambienceInput, audioContext, onAudioRunning, setKeepAwake, volumeCurve } from './synth';

/** Overall loudness of each kind, before the player's ambience volume. */
const BREEZE_LEVEL = 0.32;
const CHIME_LEVEL = 1.5;
/** Wind-chime notes: a pentatonic scale, so any notes sound nice together. */
const CHIME_NOTES = [784, 880, 1047, 1175, 1319, 1568, 1760, 2093];
/** Seconds between chimes. */
const CHIME_EVERY: readonly [number, number] = [2.5, 7];

interface Playing {
  level: GainNode;
  base: number;
  stop(): void;
}

let mode: Ambience = 'off';
let volume = 0.5;
let paused = false;
let playing: Playing | null = null;

onAudioRunning(() => {
  if (!playing) restart();
});

export function setAmbience(next: Ambience, nextVolume: number): void {
  volume = nextVolume;
  if (next !== mode) {
    mode = next;
    restart();
  } else applyVolume();
}

/** Tab hidden: stop completely. */
export function pauseAmbience(): void {
  paused = true;
  restart();
}

/** Tab visible again (it plays once the audio is running, after the next tap). */
export function resumeAmbience(): void {
  paused = false;
  restart();
}

function applyVolume(): void {
  const ctx = audioContext();
  if (!playing || !ctx) return;
  playing.level.gain.setTargetAtTime(playing.base * volumeCurve(volume), ctx.currentTime, 0.3);
}

function restart(): void {
  playing?.stop();
  playing = null;
  const on = mode !== 'off' && !paused;
  setKeepAwake(on);
  const ctx = audioContext();
  const bus = ambienceInput();
  if (!on || !ctx || !bus || ctx.state !== 'running') return;
  try {
    playing = mode === 'breeze' ? startBreeze(ctx, bus) : startChimes(ctx, bus);
    applyVolume();
  } catch {
    playing = null;
  }
}

/** Soft "pink" noise: like wind or the sea, gentler than plain hiss. */
function pinkNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < data.length; i += 1) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2;
  }
  // Fade the ends together so the loop has no click.
  const fade = Math.floor(ctx.sampleRate * 0.05);
  for (let i = 0; i < fade; i += 1) {
    const k = i / fade;
    data[i] = data[i]! * k + data[data.length - fade + i]! * (1 - k);
  }
  return buffer;
}

function fadeOutAndStop(ctx: AudioContext, level: GainNode, stop: (at: number) => void, nodes: AudioNode[]): void {
  const t = ctx.currentTime;
  level.gain.cancelScheduledValues(t);
  level.gain.setTargetAtTime(0, t, 0.25);
  stop(t + 1.5);
  setTimeout(() => nodes.forEach((node) => node.disconnect()), 1700);
}

function startBreeze(ctx: AudioContext, bus: AudioNode): Playing {
  const source = ctx.createBufferSource();
  source.buffer = pinkNoise(ctx, 6);
  source.loop = true;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 500;
  tone.Q.value = 0.3;
  const swell = ctx.createGain();
  swell.gain.value = 0.6;
  const level = ctx.createGain();
  level.gain.value = 0;
  source.connect(tone).connect(swell).connect(level).connect(bus);
  source.start();
  // The wind slowly rises and falls, brighter and duller.
  const drift = () => {
    const t = ctx.currentTime;
    tone.frequency.setTargetAtTime(320 + Math.random() * 520, t, 1.4);
    swell.gain.setTargetAtTime(0.45 + Math.random() * 0.55, t, 1.6);
  };
  drift();
  const timer = setInterval(drift, 1800);
  return {
    level,
    base: BREEZE_LEVEL,
    stop() {
      clearInterval(timer);
      fadeOutAndStop(ctx, level, (at) => source.stop(at), [source, tone, swell, level]);
    },
  };
}

function startChimes(ctx: AudioContext, bus: AudioNode): Playing {
  const level = ctx.createGain();
  level.gain.value = 0;
  level.connect(bus);
  // A soft echo: input → level, and input → delay → darker → level (and round again, quieter).
  const input = ctx.createGain();
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.33;
  const darker = ctx.createBiquadFilter();
  darker.type = 'lowpass';
  darker.frequency.value = 2800;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.32;
  input.connect(level);
  input.connect(delay);
  delay.connect(darker);
  darker.connect(level);
  darker.connect(feedback);
  feedback.connect(delay);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const ring = (at: number) => {
    const freq = CHIME_NOTES[Math.floor(Math.random() * CHIME_NOTES.length)]!;
    const length = 2 + Math.random() * 1.2;
    // A chime tube: the note and a quieter, slightly out-of-tune overtone.
    for (const [ratio, gain] of [
      [1, 0.07],
      [2.76, 0.018],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq * ratio;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(gain * (0.7 + Math.random() * 0.3), at + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0001, at + length);
      osc.connect(env).connect(input);
      osc.start(at);
      osc.stop(at + length + 0.05);
      osc.onended = () => {
        osc.disconnect();
        env.disconnect();
      };
    }
  };
  const next = () => {
    const t = ctx.currentTime + 0.05;
    ring(t);
    // Sometimes a little gust rings two or three at once.
    if (Math.random() < 0.3) ring(t + 0.12 + Math.random() * 0.2);
    if (Math.random() < 0.12) ring(t + 0.35 + Math.random() * 0.25);
    timer = setTimeout(next, (CHIME_EVERY[0] + Math.random() * (CHIME_EVERY[1] - CHIME_EVERY[0])) * 1000);
  };
  timer = setTimeout(next, 600);
  return {
    level,
    base: CHIME_LEVEL,
    stop() {
      if (timer !== undefined) clearTimeout(timer);
      fadeOutAndStop(ctx, level, () => undefined, [input, delay, darker, feedback, level]);
    },
  };
}
