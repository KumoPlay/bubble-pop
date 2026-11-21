import { describe, expect, it } from 'vitest';
import { icons } from './icons';

describe('icons', () => {
  it('are well-formed SVG (no attribute twice on one element), so they also work as images', () => {
    for (const [name, svg] of Object.entries(icons)) {
      expect(svg.startsWith('<svg'), name).toBe(true);
      for (const tag of svg.match(/<[a-zA-Z][^>]*>/g) ?? []) {
        const names = [...tag.matchAll(/\s([a-zA-Z:-]+)=/g)].map((m) => m[1]);
        expect(new Set(names).size, `${name}: ${tag.slice(0, 60)}`).toBe(names.length);
      }
    }
  });
});
