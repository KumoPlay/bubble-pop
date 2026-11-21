import { describe, expect, it } from 'vitest';
import { crowdScale } from './synth';

describe('crowdScale', () => {
  it('leaves a single sound alone and softens each extra one in a crowd', () => {
    expect(crowdScale(0)).toBe(1);
    for (let n = 1; n < 10; n += 1) expect(crowdScale(n)).toBeLessThan(crowdScale(n - 1));
  });

  it('makes ten pops at once much less than ten times as loud', () => {
    let total = 0;
    for (let n = 0; n < 10; n += 1) total += crowdScale(n);
    expect(total).toBeLessThan(6);
    expect(total).toBeGreaterThan(3);
  });
});
