/**
 * Little pictures of each cosmetic, for the collection and for gift bubbles.
 * They are drawn with the same code as the toys, so they always match.
 */
import { content, faceById, hatById, splitKey, wandById, wrapColorById, wrapPalette, wrapPatternById } from '../content';
import { cloudOutline } from '../core/cloud/softbody';
import { drawFace } from './faceArt';
import { pictureCanvas } from './pictures';
import { drawWand, paintCloud, smoothPath } from './shapes';
import { context2d, makeBubbleSprites, makeCanvas, roundRectPath, shapePath } from './wrapArt';

const cache = new Map<string, HTMLCanvasElement>();
const outline = cloudOutline(48);

/**
 * A picture of cosmetic `key` ("kind/id"), `size` screen points square, drawn at
 * `rs` device pixels per point. Null if it does not exist (or its picture is still loading).
 */
export function previewCanvas(key: string, size: number, rs: number): HTMLCanvasElement | null {
  const cacheKey = `${key}@${size}x${rs}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const parts = splitKey(key);
  if (!parts) return null;
  const canvas = makeCanvas(size * rs, size * rs);
  const ctx = context2d(canvas);
  ctx.scale(rs, rs);
  const c = size / 2;
  let ok = true;

  switch (parts.kind) {
    case 'wrap-color':
    case 'wrap-pattern': {
      const color = parts.kind === 'wrap-color' ? wrapColorById(parts.id) : wrapColorById('petal') ?? content.wrapColors[0];
      const pattern = parts.kind === 'wrap-pattern' ? wrapPatternById(parts.id) : wrapPatternById('classic') ?? content.wrapPatterns[0];
      if (!color || !pattern) return null;
      const pal = wrapPalette(color);
      ctx.save();
      roundRectPath(ctx, size * 0.06, size * 0.06, size * 0.88, size * 0.88, size * 0.18);
      ctx.fillStyle = pal.sheet;
      ctx.fill();
      const path = shapePath(content.shapes[pattern.shape] ?? content.shapes.circle!);
      if (parts.kind === 'wrap-color') {
        // One big bubble, to show the colour.
        const r = size * 0.32;
        const sprites = makeBubbleSprites(path, r * rs, r * 0.12 * rs, pal, content.palette.plum, 7, pattern.face);
        const s = sprites.size / rs;
        ctx.drawImage(sprites.full, c - s / 2, c - s / 2, s, s);
      } else {
        // A little patch of the pattern, so its size and layout show.
        ctx.clip();
        const k = (size * 0.3) / 48;
        const r = (pattern.size / 2) * k;
        const pitch = (pattern.size + pattern.gap) * k;
        const rowPitch = pattern.layout === 'offset' ? pitch * 0.866 : pitch;
        const sprites = makeBubbleSprites(path, r * rs, r * 0.12 * rs, pal, content.palette.plum, 7, pattern.face);
        const s = sprites.size / rs;
        for (let row = -3; row <= 3; row += 1) {
          const shift = pattern.layout === 'offset' && Math.abs(row) % 2 === 1 ? pitch / 2 : 0;
          for (let col = -3; col <= 3; col += 1) {
            ctx.drawImage(sprites.full, c + col * pitch + shift - s / 2, c + row * rowPitch - s / 2, s, s);
          }
        }
      }
      ctx.restore();
      break;
    }
    case 'wand': {
      const wand = wandById(parts.id);
      if (!wand) return null;
      drawWand(ctx, wand, c - size * 0.08, c - size * 0.14, size * 0.2, -0.35, 1);
      break;
    }
    case 'face': {
      const face = faceById(parts.id);
      if (!face) return null;
      const R = size * 0.42;
      paintCloud(ctx, smoothPath(outline, 48, R, c, c + size * 0.04), c, c + size * 0.04, R);
      // The face drawn larger than on the toy, so the little previews are easy to tell apart.
      ctx.translate(c, c + size * 0.04 + 0.05 * R);
      drawFace(ctx, face, 'calm', R * 1.45);
      break;
    }
    case 'hat': {
      const hat = hatById(parts.id);
      if (!hat) return null;
      if (!hat.picture) {
        // "No hat": just the bare cloud top.
        const R = size * 0.42;
        paintCloud(ctx, smoothPath(outline, 48, R, c, c + size * 0.12), c, c + size * 0.12, R);
        break;
      }
      const image = pictureCanvas(hat.picture, size * 0.8 * rs);
      if (!image) ok = false;
      else ctx.drawImage(image, size * 0.1, size * 0.08, size * 0.8, size * 0.8);
      break;
    }
  }
  if (!ok) return null;
  cache.set(cacheKey, canvas);
  return canvas;
}
