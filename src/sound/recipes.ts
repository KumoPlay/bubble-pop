/**
 * Every sound in the toy, as a recipe: plain numbers and [min, max] ranges.
 * Each time a sound plays, every range is rolled again, so no two pops are the
 * same. No audio files: src/sound/synth.ts turns these layers into sound with
 * the Web Audio API.
 *
 * Tweaking a sound: change the numbers below and listen (npm run dev).
 *   - freq: pitch in hertz. Higher = brighter. Phone speakers barely play below ~300 Hz.
 *   - gain: loudness of that layer, 0 to 1 (before the final soft limiter).
 *   - attack: seconds to reach full loudness. Very short = snappy.
 *   - decay: seconds to fade out. Longer = more ringing.
 *   - q: how narrow a filter is. Higher = more whistly; keep it low for soft sounds.
 * src/sound/recipes.test.ts checks that nothing gets too loud, too sharp or too long.
 */
import { inRange, pickOne, type Rng } from '../core/rng';

export type Range = readonly [number, number];

export interface Filter {
  type: 'lowpass' | 'bandpass' | 'highpass';
  freq: number;
  q: number;
  /** The filter glides here over the layer's length (for whooshes). */
  freqEnd?: number;
}

/** One part of a sound: a tone or a burst of noise, with a quick rise and a soft fade. */
export interface Layer {
  source: 'noise' | 'sine' | 'triangle';
  /** Seconds after the sound starts. */
  at: number;
  gain: number;
  attack: number;
  decay: number;
  /** Tone pitch in hertz (tones only). */
  freq?: number;
  /** The tone glides here over its length. */
  freqEnd?: number;
  filter?: Filter;
  /** A wobble in pitch, for boings: `rate` times a second, by `depth` (share of the pitch). */
  wobble?: { rate: number; depth: number };
}

export type Sound = Layer[];

/** A sound that keeps going while a finger is down (blowing, stretching); its loudness and pitch follow the finger. */
export interface HoldSpec {
  source: 'noise' | 'sine' | 'triangle';
  freq?: number;
  filter?: Filter;
  wobble?: { rate: number; depth: number };
  /** Loudest it ever gets. */
  most: number;
}

/** Hard limits every rolled sound stays inside. Soft and pleasant, never harsh. */
export const SOUND_LIMITS = {
  gain: 0.6,
  toneFreq: 2800,
  filterFreq: 5000,
  minAttack: 0.001,
  /** Seconds, from the start of the sound to the end of its last layer. */
  maxLength: 2.5,
} as const;

/** Bubble wrap: a pop is four tiny layers played together. */
export const wrapPop = {
  /** The bright little crack: a click of noise. */
  crack: { freq: [1700, 3000] as Range, q: [0.7, 1.2] as Range, gain: [0.48, 0.6] as Range, decay: [0.01, 0.022] as Range },
  /** The round "pok" that gives each pop its pitch. */
  pok: { freq: [620, 960] as Range, drop: [0.5, 0.65] as Range, gain: [0.38, 0.5] as Range, decay: [0.03, 0.048] as Range },
  /** A low body, mostly heard on headphones and computers. */
  thump: { freq: [140, 220] as Range, drop: [0.55, 0.7] as Range, gain: [0.18, 0.28] as Range, decay: [0.035, 0.06] as Range },
  /** The little puff of air escaping. */
  air: { cutoff: [1800, 3000] as Range, gain: [0.08, 0.14] as Range, decay: [0.05, 0.1] as Range, delay: [0.001, 0.006] as Range },
  /** Now and then a bubble only half pops: softer, lower and breathier, like real bubble wrap. */
  dud: { chance: 0.12, crack: 0.35, pok: 0.55, pitch: 0.78, air: 1.6, airLength: 1.5 },
  /** Bigger bubbles sound lower: pitch × (48 ÷ bubble size) ^ sizePitch. */
  sizePitch: 0.5,
};

/** Touching a bubble that is already flat: a few tiny plastic ticks. */
export const crinkle = {
  ticks: [3, 5] as Range,
  spacing: [0.008, 0.022] as Range,
  freq: [2200, 4000] as Range,
  q: [1.2, 2.4] as Range,
  gain: [0.32, 0.5] as Range,
  decay: [0.004, 0.01] as Range,
};

/** A fresh sheet sliding in: a soft whoosh. */
export const sheetSlide = {
  from: [320, 420] as Range,
  to: [1100, 1500] as Range,
  q: 0.9,
  gain: [0.16, 0.22] as Range,
  attack: 0.16,
  decay: 0.38,
};

/** The last bubble of a sheet: two soft bell notes (from a pentatonic scale, so any pair sounds nice). */
export const sheetDone = {
  pairs: [
    [1047, 1319],
    [1175, 1568],
    [1319, 1760],
    [1047, 1568],
  ] as const,
  gap: 0.09,
  gain: 0.075,
  decay: 0.6,
};

/** The pitch multiplier for a bubble of this size (in screen points on a phone). */
export function sizePitch(bubbleSize: number): number {
  return (48 / Math.max(12, bubbleSize)) ** wrapPop.sizePitch;
}

export function rollWrapPop(rng: Rng, bubbleSize: number, dud: boolean): Sound {
  const r = wrapPop;
  const pitch = sizePitch(bubbleSize) * (dud ? r.dud.pitch : 1);
  const pokFreq = inRange(rng, r.pok.freq) * pitch;
  const thumpFreq = inRange(rng, r.thump.freq) * pitch;
  return [
    {
      source: 'noise',
      at: 0,
      gain: inRange(rng, r.crack.gain) * (dud ? r.dud.crack : 1),
      attack: 0.001,
      decay: inRange(rng, r.crack.decay),
      filter: { type: 'bandpass', freq: inRange(rng, r.crack.freq) * pitch, q: inRange(rng, r.crack.q) },
    },
    {
      source: 'sine',
      at: 0,
      gain: inRange(rng, r.pok.gain) * (dud ? r.dud.pok : 1),
      attack: 0.0015,
      decay: inRange(rng, r.pok.decay),
      freq: pokFreq,
      freqEnd: pokFreq * inRange(rng, r.pok.drop),
    },
    {
      source: 'sine',
      at: 0,
      gain: inRange(rng, r.thump.gain),
      attack: 0.002,
      decay: inRange(rng, r.thump.decay),
      freq: thumpFreq,
      freqEnd: thumpFreq * inRange(rng, r.thump.drop),
    },
    {
      source: 'noise',
      at: inRange(rng, r.air.delay),
      gain: inRange(rng, r.air.gain) * (dud ? r.dud.air : 1),
      attack: 0.003,
      decay: inRange(rng, r.air.decay) * (dud ? r.dud.airLength : 1),
      filter: { type: 'lowpass', freq: inRange(rng, r.air.cutoff), q: 0.7 },
    },
  ];
}

export function rollCrinkle(rng: Rng): Sound {
  const r = crinkle;
  const count = Math.round(inRange(rng, r.ticks));
  const layers: Sound = [];
  let at = 0;
  for (let i = 0; i < count; i += 1) {
    layers.push({
      source: 'noise',
      at,
      gain: inRange(rng, r.gain) * (1 - i * 0.12),
      attack: 0.001,
      decay: inRange(rng, r.decay),
      filter: { type: 'bandpass', freq: inRange(rng, r.freq), q: inRange(rng, r.q) },
    });
    at += inRange(rng, r.spacing);
  }
  return layers;
}

export function rollSheetSlide(rng: Rng): Sound {
  const r = sheetSlide;
  return [
    {
      source: 'noise',
      at: 0,
      gain: inRange(rng, r.gain),
      attack: r.attack,
      decay: r.decay,
      filter: { type: 'bandpass', freq: inRange(rng, r.from), q: r.q, freqEnd: inRange(rng, r.to) },
    },
  ];
}

export function rollSheetDone(rng: Rng): Sound {
  const r = sheetDone;
  const [low, high] = pickOne(rng, r.pairs);
  return [
    { source: 'triangle', at: 0, gain: r.gain, attack: 0.004, decay: r.decay, freq: low },
    { source: 'triangle', at: r.gap, gain: r.gain * 0.9, attack: 0.004, decay: r.decay * 1.2, freq: high },
  ];
}

/** Seconds from the start of a sound to the end of its last layer. */
export function soundLength(sound: Sound): number {
  return sound.reduce((end, layer) => Math.max(end, layer.at + layer.attack + layer.decay), 0);
}

// ─── Soap bubbles ──────────────────────────────────────────────────────────

/** A new bubble leaving the wand: a tiny rising blip. */
export const soapBlip = { freq: [520, 820] as Range, rise: [1.25, 1.45] as Range, gain: [0.07, 0.11] as Range, decay: [0.04, 0.07] as Range };

/** A soap bubble popping: a delicate "plip", lower for big bubbles. Softer than bubble wrap. */
export const soapPop = {
  tick: { freq: [2600, 3800] as Range, q: [1, 1.6] as Range, gain: [0.38, 0.52] as Range, decay: [0.005, 0.012] as Range },
  ping: { freq: [1000, 1500] as Range, drop: [0.5, 0.62] as Range, gain: [0.2, 0.3] as Range, decay: [0.03, 0.05] as Range },
  /** Pitch × (20 ÷ radius) ^ this. */
  sizePitch: 0.4,
};

/** Two bubbles becoming one: a soft, low "bloop". */
export const soapMerge = { freq: [330, 440] as Range, drop: 0.72, gain: [0.14, 0.18] as Range, decay: [0.1, 0.14] as Range };

/** Blowing through the wand: a soft breathy whoosh, louder while the wand sweeps. */
export const blowHold: HoldSpec = { source: 'noise', filter: { type: 'bandpass', freq: 950, q: 0.7 }, most: 0.12 };

export function rollSoapBlip(rng: Rng): Sound {
  const r = soapBlip;
  const freq = inRange(rng, r.freq);
  return [{ source: 'sine', at: 0, gain: inRange(rng, r.gain), attack: 0.004, decay: inRange(rng, r.decay), freq, freqEnd: freq * inRange(rng, r.rise) }];
}

export function rollSoapPop(rng: Rng, radius: number): Sound {
  const r = soapPop;
  const pitch = (20 / Math.max(5, radius)) ** r.sizePitch;
  const ping = Math.min(SOUND_LIMITS.toneFreq, inRange(rng, r.ping.freq) * pitch);
  return [
    {
      source: 'noise',
      at: 0,
      gain: inRange(rng, r.tick.gain),
      attack: 0.001,
      decay: inRange(rng, r.tick.decay),
      filter: { type: 'bandpass', freq: Math.min(SOUND_LIMITS.filterFreq, inRange(rng, r.tick.freq) * Math.sqrt(pitch)), q: inRange(rng, r.tick.q) },
    },
    { source: 'sine', at: 0, gain: inRange(rng, r.ping.gain), attack: 0.0015, decay: inRange(rng, r.ping.decay), freq: ping, freqEnd: ping * inRange(rng, r.ping.drop) },
  ];
}

export function rollSoapMerge(rng: Rng, radius: number): Sound {
  const r = soapMerge;
  const freq = inRange(rng, r.freq) * (30 / Math.max(10, radius)) ** 0.3;
  const decay = inRange(rng, r.decay);
  return [
    { source: 'sine', at: 0, gain: inRange(rng, r.gain), attack: 0.006, decay, freq, freqEnd: freq * r.drop },
    { source: 'sine', at: 0, gain: 0.045, attack: 0.006, decay: decay * 0.7, freq: freq * 2, freqEnd: freq * 2 * r.drop },
  ];
}

// ─── Squishy cloud ─────────────────────────────────────────────────────────

/** A poke: a soft squish with a round "boop". */
export const cloudPoke = {
  squish: { cutoff: [900, 1400] as Range, gain: [0.22, 0.32] as Range, decay: [0.06, 0.09] as Range },
  boop: { freq: [380, 500] as Range, drop: [0.55, 0.65] as Range, gain: [0.3, 0.38] as Range, decay: [0.09, 0.13] as Range },
};

/** The cloud giggling: a few quick little rising notes. */
export const cloudGiggle = { freq: [900, 1050] as Range, rise: 1.22, step: 1.07, gap: [0.075, 0.095] as Range, notes: [3, 4] as Range, gain: 0.1, decay: 0.06 };

/** The cloud surprised (stretched far): a small rising "ooh". */
export const cloudOoh = { freq: [500, 580] as Range, rise: 1.4, gain: 0.1, attack: 0.03, decay: 0.26 };

/** Letting go after a stretch: a boing that wobbles like the cloud does. */
export const cloudBoing = { freq: [300, 380] as Range, drop: 0.82, gain: [0.18, 0.24] as Range, decay: [0.4, 0.55] as Range, rate: [7, 9] as Range, depth: 0.06 };

/** Stretching: a quiet rubbery creak whose pitch rises with the stretch; silent while the finger holds still. */
export const creakHold: HoldSpec = { source: 'sine', freq: 300, wobble: { rate: 17, depth: 0.025 }, most: 0.07 };

export function rollCloudPoke(rng: Rng): Sound {
  const r = cloudPoke;
  const freq = inRange(rng, r.boop.freq);
  return [
    { source: 'noise', at: 0, gain: inRange(rng, r.squish.gain), attack: 0.004, decay: inRange(rng, r.squish.decay), filter: { type: 'lowpass', freq: inRange(rng, r.squish.cutoff), q: 0.8 } },
    { source: 'sine', at: 0, gain: inRange(rng, r.boop.gain), attack: 0.004, decay: inRange(rng, r.boop.decay), freq, freqEnd: freq * inRange(rng, r.boop.drop) },
  ];
}

export function rollGiggle(rng: Rng): Sound {
  const r = cloudGiggle;
  const count = Math.round(inRange(rng, r.notes));
  let freq = inRange(rng, r.freq);
  let at = 0;
  const layers: Sound = [];
  for (let i = 0; i < count; i += 1) {
    layers.push({ source: 'sine', at, gain: r.gain * (1 - i * 0.12), attack: 0.004, decay: r.decay, freq, freqEnd: Math.min(SOUND_LIMITS.toneFreq, freq * r.rise) });
    freq *= r.step;
    at += inRange(rng, r.gap);
  }
  return layers;
}

export function rollOoh(rng: Rng): Sound {
  const r = cloudOoh;
  const freq = inRange(rng, r.freq);
  return [
    { source: 'sine', at: 0, gain: r.gain, attack: r.attack, decay: r.decay, freq, freqEnd: freq * r.rise },
    { source: 'triangle', at: 0, gain: r.gain * 0.35, attack: r.attack, decay: r.decay * 0.8, freq: freq / 2, freqEnd: (freq / 2) * r.rise },
  ];
}

/** `stretch` is how far it was pulled (1 = not at all); a bigger stretch boings louder and lower. */
export function rollBoing(rng: Rng, stretch: number): Sound {
  const r = cloudBoing;
  const amount = Math.min(1, Math.max(0, (stretch - 1) / 0.8));
  const freq = inRange(rng, r.freq) * (1.1 - 0.2 * amount);
  return [
    {
      source: 'sine',
      at: 0,
      gain: inRange(rng, r.gain) * (0.6 + 0.4 * amount),
      attack: 0.006,
      decay: inRange(rng, r.decay),
      freq,
      freqEnd: freq * r.drop,
      wobble: { rate: inRange(rng, r.rate), depth: r.depth },
    },
  ];
}

// ─── The golden Kumo bubble and surprises ──────────────────────────────────

/** The golden bubble drifting in: three faint high sparkles. */
export const goldenArrive = { notes: [1568, 2093, 2637], gap: 0.08, gain: 0.04, decay: 0.5 };
/** Popping it: a happy rising arpeggio. */
export const goldenPop = { notes: [1047, 1319, 1568, 2093], gap: 0.07, gain: 0.07, decay: 0.6 };
/** Kumo popping out: a tiny giggle (the same giggle as in Peek-a-Kumo, softer). */
export const kumoGiggle = { glides: [[880, 1175], [988, 1319], [1109, 1480]] as const, gap: 0.1, gain: 0.06, decay: 0.08 };
/** A surprise cosmetic appearing: a soft rising chime, from a pentatonic scale. */
export const surpriseChime = { chords: [[784, 988, 1175], [880, 1109, 1319], [698, 880, 1047]] as const, gap: 0.09, gain: 0.06, decay: 0.45 };

const arpeggio = (notes: readonly number[], gap: number, gain: number, decay: number): Sound =>
  notes.map((freq, i) => ({ source: 'triangle', at: i * gap, gain: gain * (1 - i * 0.08), attack: 0.004, decay, freq }));

export const rollGoldenArrive = (): Sound => arpeggio(goldenArrive.notes, goldenArrive.gap, goldenArrive.gain, goldenArrive.decay);
export const rollGoldenPop = (): Sound => arpeggio(goldenPop.notes, goldenPop.gap, goldenPop.gain, goldenPop.decay);
export const rollKumoGiggle = (): Sound =>
  kumoGiggle.glides.map(([from, to], i) => ({ source: 'sine', at: i * kumoGiggle.gap, gain: kumoGiggle.gain, attack: 0.005, decay: kumoGiggle.decay, freq: from, freqEnd: to }));
export const rollSurprise = (rng: Rng): Sound => arpeggio(pickOne(rng, surpriseChime.chords), surpriseChime.gap, surpriseChime.gain, surpriseChime.decay);
