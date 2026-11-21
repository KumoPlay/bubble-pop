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

/**
 * What is not gentle about a sound: every layer must stay soft, never shrill,
 * never clicky, never long. Returns the problems in words (none = gentle).
 * Plain checks rather than one `expect` per value, so thousands of rolls stay quick.
 */
function harshness(name: string, sound: Sound): string[] {
  const problems: string[] = [];
  const check = (ok: boolean, what: string) => {
    if (!ok) problems.push(`${name}: ${what}`);
  };
  check(sound.length > 0, 'no layers');
  for (const layer of sound) {
    check(layer.gain > 0 && layer.gain <= SOUND_LIMITS.gain, `gain ${layer.gain}`);
    check(layer.attack >= SOUND_LIMITS.minAttack, `attack ${layer.attack} (clicks)`);
    check(layer.decay > layer.attack, `decay ${layer.decay}`);
    check(layer.at >= 0, `starts at ${layer.at}`);
    if (layer.source === 'noise') check(layer.freq === undefined, 'noise with a pitch');
    else {
      check(layer.freq !== undefined && layer.freq > 20 && layer.freq <= SOUND_LIMITS.toneFreq, `pitch ${layer.freq}`);
      check(layer.freqEnd === undefined || layer.freqEnd > 20, `glide to ${layer.freqEnd}`);
    }
    if (layer.filter) {
      check(layer.filter.freq <= SOUND_LIMITS.filterFreq, `filter ${layer.filter.freq}`);
      check((layer.filter.freqEnd ?? 0) <= SOUND_LIMITS.filterFreq, `filter glide ${layer.filter.freqEnd}`);
      check(layer.filter.q <= 4, `filter q ${layer.filter.q}`);
    }
    // A gentle wobble, never a fast flutter.
    if (layer.wobble) check(layer.wobble.rate <= 20 && layer.wobble.depth <= 0.1, 'wobble too fast or deep');
  }
  check(soundLength(sound) <= SOUND_LIMITS.maxLength, `length ${soundLength(sound)}`);
  return problems;
}

const loudness = (sound: Sound) => sound.reduce((sum, layer) => sum + layer.gain, 0);
const pitchOf = (sound: Sound) => sound.find((l) => l.source === 'sine')!.freq!;

describe('sound recipes', () => {
  it('stay gentle however the dice roll', () => {
    const rng = makeRng(42);
    const problems: string[] = [];
    const check = (name: string, sound: Sound) => problems.push(...harshness(name, sound));
    for (let i = 0; i < 3000; i += 1) {
      for (const size of [34, 48, 70]) check(`wrap pop ${size}`, rollWrapPop(rng, size, i % 5 === 0));
      check('crinkle', rollCrinkle(rng));
      check('sheet slide', rollSheetSlide(rng));
      check('sheet done', rollSheetDone(rng));
      for (const r of [5, 20, 46]) {
        check(`soap pop ${r}`, rollSoapPop(rng, r));
        check(`soap merge ${r}`, rollSoapMerge(rng, r));
      }
      check('soap blip', rollSoapBlip(rng));
      check('cloud poke', rollCloudPoke(rng));
      check('giggle', rollGiggle(rng));
      check('ooh', rollOoh(rng));
      check('boing', rollBoing(rng, 1 + rng() * 2));
      check('surprise', rollSurprise(rng));
    }
    check('golden arrive', rollGoldenArrive());
    check('golden pop', rollGoldenPop());
    check('kumo giggle', rollKumoGiggle());
    expect(problems.slice(0, 10)).toEqual([]);
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
