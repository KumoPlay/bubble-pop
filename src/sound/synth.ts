/**
 * Plays the recipes from recipes.ts with the Web Audio API. No audio files.
 *
 *   each sound → effects volume → soft high cut → drive ─┐
 *                                    ambience (own volume) ─┴→ gentle limiter → speakers
 *
 * The high cut and the limiter keep things soft even when ten fingers pop at once.
 * Nothing plays before the first tap (browsers require it, and it is what we want).
 * On iPhone the sound follows the silent switch and mixes with music already playing.
 */
import type { HoldSpec, Layer, Sound } from './recipes';

type AudioContextClass = typeof AudioContext;

/** At most this many layers sound at once (a pop has 4). Extra ones are skipped, never queued. */
const MAX_LAYERS = 48;
/** With nothing to play for this long, the audio hardware is let go to save battery (unless ambience is on). */
const IDLE_SLEEP_MS = 30_000;
/** A sound that cannot start within this time after waking the audio is dropped: late sounds feel wrong. */
const LATE_MS = 150;
/** Overall loudness of effects before the limiter. Raise to make everything louder (the limiter still prevents clipping). */
const DRIVE = 2;
/** Sounds starting this close together count as a crowd. */
const CROWD_WINDOW_S = 0.025;

let context: AudioContext | null = null;
let effects: GainNode | null = null;
let ambience: GainNode | null = null;
let noise: AudioBuffer | null = null;
let activeLayers = 0;
let effectsVolume = 0.8;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let keepAwake = false;
let failed = false;
const runningListeners = new Set<() => void>();

function contextClass(): AudioContextClass | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextClass }).webkitAudioContext;
}

/** Loudness feels more even on a curve than in a straight line. */
export const volumeCurve = (volume: number) => Math.min(1, Math.max(0, volume)) ** 2;

function build(): void {
  const Context = contextClass();
  if (!Context) {
    failed = true;
    return;
  }
  try {
    // iPhone (Safari 17+): follow the silent switch and let the player's own music keep playing.
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'ambient';
  } catch {
    // Older browsers: the default behaves the same way.
  }
  try {
    try {
      context = new Context({ latencyHint: 'interactive' });
    } catch {
      context = new Context();
    }
    const chain = makeOutputChain(context, volumeCurve(effectsVolume));
    effects = chain.effects;
    ambience = chain.ambience;
    noise = makeNoise(context);
    context.addEventListener('statechange', () => {
      if (context?.state === 'running') runningListeners.forEach((listener) => listener());
    });
  } catch {
    failed = true;
    context = null;
    effects = null;
    ambience = null;
  }
}

function noteActivity(): void {
  if (idleTimer !== undefined) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!keepAwake) sleepAudio();
  }, IDLE_SLEEP_MS);
}

/** Call on every tap: makes the audio on the first one, and wakes it after a pause. */
export function wakeAudio(): void {
  if (failed) return;
  if (!context) build();
  if (!context) return;
  noteActivity();
  if (context.state !== 'running' && context.state !== 'closed') void context.resume().catch(() => undefined);
}

/** Lets the audio hardware rest (tab hidden, or nothing played for a while). The next tap wakes it. */
export function sleepAudio(): void {
  if (idleTimer !== undefined) clearTimeout(idleTimer);
  idleTimer = undefined;
  if (context?.state === 'running') void context.suspend().catch(() => undefined);
}

/** While ambience plays, a quiet moment does not put the audio to sleep. */
export function setKeepAwake(on: boolean): void {
  keepAwake = on;
}

/** Calls `listener` whenever the audio starts running (after the first tap, and after each wake-up). */
export function onAudioRunning(listener: () => void): () => void {
  runningListeners.add(listener);
  return () => runningListeners.delete(listener);
}

export function audioContext(): AudioContext | null {
  return context;
}

/** Where background ambience connects (it has its own volume, separate from effects). */
export function ambienceInput(): AudioNode | null {
  return ambience;
}

export function setEffectsVolume(volume: number): void {
  effectsVolume = volume;
  if (effects && context) effects.gain.setTargetAtTime(volumeCurve(volume), context.currentTime, 0.02);
}

/** Plays a sound now, or `delay` seconds from now. Never throws: sound is a nice extra. */
export function playSound(sound: Sound, delay = 0): void {
  const ctx = context;
  if (!ctx || !effects || effectsVolume <= 0) return;
  noteActivity();
  if (ctx.state === 'running') {
    start(ctx, sound, delay);
    return;
  }
  if (ctx.state === 'closed') return;
  const asked = performance.now();
  void ctx
    .resume()
    .then(() => {
      if (performance.now() - asked < LATE_MS) start(ctx, sound, delay);
    })
    .catch(() => undefined);
}

/** Start times (audio clock) of recent sounds, to soften crowds. */
const recent: number[] = [];

function start(ctx: AudioContext, sound: Sound, delay: number): void {
  const t0 = ctx.currentTime + Math.max(0, delay);
  // Several fingers landing together: each extra sound is a little softer,
  // so five pops at once sound fuller, not five times as loud.
  while (recent.length > 0 && Math.abs(t0 - recent[0]!) > CROWD_WINDOW_S) recent.shift();
  const scale = crowdScale(recent.filter((t) => Math.abs(t0 - t) <= CROWD_WINDOW_S).length);
  recent.push(t0);
  if (recent.length > 32) recent.shift();
  for (const layer of sound) {
    if (activeLayers >= MAX_LAYERS || !effects || !noise) return;
    try {
      const source = scheduleLayer(ctx, effects, noise, layer, t0 + layer.at, scale);
      activeLayers += 1;
      const tidy = source.onended;
      source.onended = (event) => {
        activeLayers -= 1;
        tidy?.call(source, event);
      };
    } catch {
      // Skip a layer the browser refuses; the rest still plays.
    }
  }
}

/** Loudness for a sound that starts while `others` sounds have just started. */
export function crowdScale(others: number): number {
  return 1 / Math.sqrt(1 + others * 0.6);
}

/** A sound that keeps going while a finger is down. `set` moves its loudness (0 to 1) and pitch. */
export interface Hold {
  set(level: number, freq?: number): void;
  stop(): void;
}

/** Starts a held sound, silent until `set` is called. Null when the audio is not running yet. */
export function startHold(spec: HoldSpec): Hold | null {
  const ctx = context;
  if (!ctx || !effects || !noise || ctx.state !== 'running' || effectsVolume <= 0) return null;
  noteActivity();
  try {
    const t = ctx.currentTime;
    let source: AudioScheduledSourceNode;
    let tone: OscillatorNode | null = null;
    if (spec.source === 'noise') {
      const buffer = ctx.createBufferSource();
      buffer.buffer = noise;
      buffer.loop = true;
      buffer.start(t, Math.random() * 0.5);
      source = buffer;
    } else {
      tone = ctx.createOscillator();
      tone.type = spec.source;
      tone.frequency.value = spec.freq ?? 440;
      tone.start(t);
      source = tone;
    }
    const extras: AudioNode[] = [];
    let lfo: OscillatorNode | null = null;
    if (spec.wobble && tone) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = spec.wobble.rate;
      const depth = ctx.createGain();
      depth.gain.value = (spec.freq ?? 440) * spec.wobble.depth;
      lfo.connect(depth).connect(tone.frequency);
      lfo.start(t);
      extras.push(lfo, depth);
    }
    let head: AudioNode = source;
    let filter: BiquadFilterNode | null = null;
    if (spec.filter) {
      filter = ctx.createBiquadFilter();
      filter.type = spec.filter.type;
      filter.frequency.value = spec.filter.freq;
      filter.Q.value = spec.filter.q;
      head.connect(filter);
      head = filter;
      extras.push(filter);
    }
    const gain = ctx.createGain();
    gain.gain.value = 0;
    head.connect(gain).connect(effects);
    extras.push(gain);
    activeLayers += 1;
    let stopped = false;
    return {
      set(level, freq) {
        if (stopped) return;
        noteActivity();
        const now = ctx.currentTime;
        gain.gain.setTargetAtTime(Math.min(1, Math.max(0, level)) * spec.most, now, 0.05);
        if (freq !== undefined && Number.isFinite(freq) && freq > 20) {
          if (tone) tone.frequency.setTargetAtTime(Math.min(4000, freq), now, 0.04);
          else filter?.frequency.setTargetAtTime(Math.min(5000, freq), now, 0.05);
        }
      },
      stop() {
        if (stopped) return;
        stopped = true;
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setTargetAtTime(0, now, 0.05);
        source.onended = () => {
          activeLayers -= 1;
          source.disconnect();
          for (const node of extras) node.disconnect();
        };
        source.stop(now + 0.35);
        lfo?.stop(now + 0.35);
      },
    };
  } catch {
    return null;
  }
}

/**
 * Builds the shared output (see the drawing at the top). Returns where effects
 * and ambience connect. Exported so the levels can be checked offline.
 */
export function makeOutputChain(
  ctx: BaseAudioContext,
  volume: number,
  destination: AudioNode = ctx.destination,
): { effects: GainNode; ambience: GainNode } {
  const soften = ctx.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = 7000;
  soften.Q.value = 0.5;

  // Single sounds pass untouched; the limiter only steps in when many overlap.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 10;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;

  // Brings single sounds up to a comfortable level; the limiter catches many at once.
  const drive = ctx.createGain();
  drive.gain.value = DRIVE;

  const out = ctx.createGain();
  out.gain.value = 0.9;

  const effectsIn = ctx.createGain();
  effectsIn.gain.value = volume;
  effectsIn.connect(soften).connect(drive).connect(limiter).connect(out).connect(destination);

  const ambienceIn = ctx.createGain();
  ambienceIn.connect(limiter);
  return { effects: effectsIn, ambience: ambienceIn };
}

/** One second of soft noise, made once and reused (from a random place) by every crackle and puff. */
export function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Schedules one layer to play at time `t` into `out`. Its nodes tidy themselves up when it ends. */
export function scheduleLayer(
  ctx: BaseAudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  layer: Layer,
  t: number,
  scale = 1,
): AudioScheduledSourceNode {
  const end = t + layer.attack + layer.decay;
  const extras: AudioNode[] = [];
  let source: AudioScheduledSourceNode;
  if (layer.source === 'noise') {
    const buffer = ctx.createBufferSource();
    buffer.buffer = noise;
    const length = end - t + 0.02;
    buffer.start(t, Math.random() * Math.max(0, noise.duration - length), length);
    source = buffer;
  } else {
    const osc = ctx.createOscillator();
    osc.type = layer.source;
    osc.frequency.setValueAtTime(layer.freq ?? 440, t);
    if (layer.freqEnd) osc.frequency.exponentialRampToValueAtTime(layer.freqEnd, end);
    if (layer.wobble) {
      // A boing: the pitch wobbles.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = layer.wobble.rate;
      const depth = ctx.createGain();
      depth.gain.value = (layer.freq ?? 440) * layer.wobble.depth;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(end + 0.02);
      extras.push(lfo, depth);
    }
    osc.start(t);
    osc.stop(end + 0.02);
    source = osc;
  }

  let head: AudioNode = source;
  if (layer.filter) {
    const filter = ctx.createBiquadFilter();
    filter.type = layer.filter.type;
    filter.Q.value = layer.filter.q;
    filter.frequency.setValueAtTime(layer.filter.freq, t);
    if (layer.filter.freqEnd) filter.frequency.exponentialRampToValueAtTime(layer.filter.freqEnd, end);
    head.connect(filter);
    head = filter;
    extras.push(filter);
  }

  // A quick rise and a soft fade, so nothing clicks.
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(layer.gain * scale, t + layer.attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  head.connect(gain);
  gain.connect(out);
  extras.push(gain);

  source.onended = () => {
    source.disconnect();
    for (const node of extras) node.disconnect();
  };
  return source;
}
