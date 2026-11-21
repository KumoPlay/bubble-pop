import { describe, expect, it } from 'vitest';
import { makeRng } from '../core/rng';
import {
  blowHold,
  creakHold,
  rollBoing,
  rollCloudPoke,
  rollCrinkle,
  rollGiggle,
  rollGoldenArrive,
  rollGoldenPop,
  rollKumoGiggle,
  rollOoh,
  rollSheetDone,
  rollSheetSlide,
  rollSoapBlip,
  rollSoapMerge,
  rollSoapPop,
  rollSurprise,
  rollWrapPop,
  SOUND_LIMITS,
  soundLength,
  type Sound,
} from './recipes';

/** Every layer of every sound stays soft, never shrill, never clicky, never long. */
function expectGentle(sound: Sound): void {
  expect(sound.length).toBeGreaterThan(0);
  for (const layer of sound) {
    expect(layer.gain).toBeGreaterThan(0);
    expect(layer.gain).toBeLessThanOrEqual(SOUND_LIMITS.gain);
    expect(layer.attack).toBeGreaterThanOrEqual(SOUND_LIMITS.minAttack);
    expect(layer.decay).toBeGreaterThan(layer.attack);
    expect(layer.at).toBeGreaterThanOrEqual(0);
    if (layer.source === 'noise') expect(layer.freq).toBeUndefined();
    else {
      expect(layer.freq).toBeGreaterThan(20);
      expect(layer.freq).toBeLessThanOrEqual(SOUND_LIMITS.toneFreq);
      if (layer.freqEnd !== undefined) expect(layer.freqEnd).toBeGreaterThan(20);
    }
    if (layer.filter) {
      expect(layer.filter.freq).toBeLessThanOrEqual(SOUND_LIMITS.filterFreq);
      expect(layer.filter.freqEnd ?? 0).toBeLessThanOrEqual(SOUND_LIMITS.filterFreq);
      expect(layer.filter.q).toBeLessThanOrEqual(4);
    }
    if (layer.wobble) {
      // A gentle wobble, never a fast flutter.
      expect(layer.wobble.rate).toBeLessThanOrEqual(20);
      expect(layer.wobble.depth).toBeLessThanOrEqual(0.1);
    }
  }
  expect(soundLength(sound)).toBeLessThanOrEqual(SOUND_LIMITS.maxLength);
}

const loudness = (sound: Sound) => sound.reduce((sum, layer) => sum + layer.gain, 0);
const pitchOf = (sound: Sound) => sound.find((l) => l.source === 'sine')!.freq!;

describe('sound recipes', () => {
  it('stay gentle however the dice roll', () => {
    const rng = makeRng(42);
    for (let i = 0; i < 3000; i += 1) {
      for (const size of [34, 48, 70]) expectGentle(rollWrapPop(rng, size, i % 5 === 0));
      expectGentle(rollCrinkle(rng));
      expectGentle(rollSheetSlide(rng));
      expectGentle(rollSheetDone(rng));
      for (const r of [5, 20, 46]) {
        expectGentle(rollSoapPop(rng, r));
        expectGentle(rollSoapMerge(rng, r));
      }
      expectGentle(rollSoapBlip(rng));
      expectGentle(rollCloudPoke(rng));
      expectGentle(rollGiggle(rng));
      expectGentle(rollOoh(rng));
      expectGentle(rollBoing(rng, 1 + rng() * 2));
      expectGentle(rollSurprise(rng));
    }
    expectGentle(rollGoldenArrive());
    expectGentle(rollGoldenPop());
    expectGentle(rollKumoGiggle());
  });

  it('keep held sounds (blowing, stretching) quiet', () => {
    for (const hold of [blowHold, creakHold]) {
      expect(hold.most).toBeGreaterThan(0);
      expect(hold.most).toBeLessThanOrEqual(0.15);
    }
  });

  it('make big soap bubbles pop lower than small ones', () => {
    const rng = makeRng(4);
    let big = 0;
    let small = 0;
    for (let i = 0; i < 300; i += 1) {
      big += rollSoapPop(rng, 40)[1]!.freq!;
      small += rollSoapPop(rng, 8)[1]!.freq!;
    }
    expect(big).toBeLessThan(small);
  });

  it('never sound the same twice in a row', () => {
    const rng = makeRng(1);
    const a = rollWrapPop(rng, 48, false);
    const b = rollWrapPop(rng, 48, false);
    expect(a).not.toEqual(b);
  });

  it('make big bubbles lower and small bubbles higher', () => {
    const rng = makeRng(3);
    const average = (size: number) => {
      let sum = 0;
      for (let i = 0; i < 500; i += 1) sum += pitchOf(rollWrapPop(rng, size, false));
      return sum / 500;
    };
    expect(average(70)).toBeLessThan(average(48));
    expect(average(48)).toBeLessThan(average(34));
  });

  it('make a half-popped bubble softer and lower than a real pop', () => {
    const rng = makeRng(9);
    let pop = 0;
    let dud = 0;
    let popPitch = 0;
    let dudPitch = 0;
    for (let i = 0; i < 500; i += 1) {
      const p = rollWrapPop(rng, 48, false);
      const d = rollWrapPop(rng, 48, true);
      pop += loudness(p);
      dud += loudness(d);
      popPitch += pitchOf(p);
      dudPitch += pitchOf(d);
    }
    expect(dud).toBeLessThan(pop);
    expect(dudPitch).toBeLessThan(popPitch);
  });

  it('keep pops short, so fast popping never smears', () => {
    const rng = makeRng(5);
    for (let i = 0; i < 500; i += 1) expect(soundLength(rollWrapPop(rng, 34, false))).toBeLessThan(0.13);
  });
});
