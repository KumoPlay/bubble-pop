/**
 * Pictures for bubble wrap, drawn once with code and then copied many times
 * (copying a ready picture is much faster than drawing gradients every frame).
 */
import type { WrapPalette } from '../content';
import { mix, rgba } from '../core/color';
import { between, makeRng, mixSeed } from '../core/rng';
import { drawKumoFace } from './faceArt';

/** Shapes in shapes.json are drawn in a 100 × 100 box and reach about this far from (50, 50). */
const SHAPE_RADIUS = 46;

export function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  return ctx;
}

const pathCache = new Map<string, Path2D>();

export function shapePath(d: string): Path2D {
  let path = pathCache.get(d);
  if (!path) {
    path = new Path2D(d);
    pathCache.set(d, path);
  }
  return path;
}

/** Runs `draw` with the shape's 100 × 100 box centred on (0, 0) and scaled to radius `r`. */
function inShapeSpace(ctx: CanvasRenderingContext2D, r: number, grow: number, draw: () => void): void {
  ctx.save();
  const s = (r * grow) / SHAPE_RADIUS;
  ctx.scale(s, s);
  ctx.translate(-50, -50);
  draw();
  ctx.restore();
}

/** Clips to the shape and leaves the drawing in plain pixels around (0, 0). Call ctx.restore() after. */
function clipToShape(ctx: CanvasRenderingContext2D, path: Path2D, r: number, grow = 1): void {
  ctx.save();
  const before = ctx.getTransform();
  const s = (r * grow) / SHAPE_RADIUS;
  ctx.scale(s, s);
  ctx.translate(-50, -50);
  ctx.clip(path);
  ctx.setTransform(before);
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rotation: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
  ctx.fill();
}

/** A plump, glossy bubble centred on (0, 0), with Kumo's face on it if `face`. */
function drawDome(ctx: CanvasRenderingContext2D, path: Path2D, r: number, pal: WrapPalette, plum: string, face: boolean): void {
  // A soft shadow on the plastic, down and to the right.
  ctx.save();
  ctx.translate(r * 0.05, r * 0.11);
  inShapeSpace(ctx, r, 1, () => {
    ctx.fillStyle = rgba(plum, 0.13);
    ctx.fill(path);
  });
  ctx.restore();

  clipToShape(ctx, path, r);
  const body = ctx.createRadialGradient(-0.34 * r, -0.4 * r, r * 0.05, -0.1 * r, -0.12 * r, r * 1.25);
  body.addColorStop(0, mix(pal.bubble, '#FFFFFF', 0.78));
  body.addColorStop(0.5, pal.bubble);
  body.addColorStop(1, mix(pal.bubble, pal.rim, 0.75));
  ctx.fillStyle = body;
  ctx.fillRect(-r * 1.3, -r * 1.3, r * 2.6, r * 2.6);
  // Light bouncing up from the plastic, low on the right.
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ellipse(ctx, 0.36 * r, 0.42 * r, 0.42 * r, 0.17 * r, -0.75);
  // The shine.
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ellipse(ctx, -0.34 * r, -0.42 * r, 0.3 * r, 0.15 * r, -0.7);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ellipse(ctx, -0.62 * r, -0.08 * r, 0.06 * r, 0.06 * r, 0);
  if (face) drawKumoFace(ctx, r);
  ctx.restore();

  inShapeSpace(ctx, r, 1, () => {
    ctx.strokeStyle = rgba(pal.rim, 0.55);
    ctx.lineWidth = 2.3;
    ctx.stroke(path);
  });
}

/** A popped bubble: flattened, slightly wider film with creases. Centred on (0, 0). */
function drawFlat(ctx: CanvasRenderingContext2D, path: Path2D, r: number, pal: WrapPalette, seed: number): void {
  const rng = makeRng(seed);
  inShapeSpace(ctx, r, 1.05, () => {
    ctx.fillStyle = rgba(pal.flat, 0.9);
    ctx.fill(path);
  });

  clipToShape(ctx, path, r, 1.05);
  ctx.lineCap = 'round';
  // Folds spread out from where the bubble burst, like real popped bubble wrap.
  const burstX = between(rng, -0.18, 0.18) * r;
  const burstY = between(rng, -0.18, 0.18) * r;
  const creases = 5 + Math.floor(rng() * 3);
  const turn = rng() * Math.PI * 2;
  for (let c = 0; c < creases; c += 1) {
    const heading = turn + ((c + between(rng, -0.3, 0.3)) / creases) * Math.PI * 2;
    const x0 = burstX + Math.cos(heading) * r * between(rng, 0.05, 0.2);
    const y0 = burstY + Math.sin(heading) * r * between(rng, 0.05, 0.2);
    const length = between(rng, 0.55, 0.85) * r;
    const bend = between(rng, -0.12, 0.12) * r;
    const x1 = x0 + Math.cos(heading) * length;
    const y1 = y0 + Math.sin(heading) * length;
    const cx = (x0 + x1) / 2 - Math.sin(heading) * bend;
    const cy = (y0 + y1) / 2 + Math.cos(heading) * bend;
    const fold = (dx: number, dy: number) => {
      ctx.beginPath();
      ctx.moveTo(x0 + dx, y0 + dy);
      ctx.quadraticCurveTo(cx + dx, cy + dy, x1 + dx, y1 + dy);
      ctx.stroke();
    };
    // Each fold: a soft shadow with light catching its edge.
    ctx.strokeStyle = rgba(pal.rim, 0.2);
    ctx.lineWidth = Math.max(1.5, r * 0.08);
    fold(0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = Math.max(1, r * 0.05);
    fold(-r * 0.05, -r * 0.05);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ellipse(ctx, -0.28 * r, -0.32 * r, 0.2 * r, 0.08 * r, -0.6);
  ctx.restore();

  // The ring where the bubble used to stand.
  inShapeSpace(ctx, r, 0.96, () => {
    ctx.strokeStyle = rgba(pal.rim, 0.3);
    ctx.lineWidth = 2;
    ctx.stroke(path);
  });
}

export interface BubbleSprites {
  /** Width and height of every picture, in device pixels. */
  size: number;
  full: HTMLCanvasElement;
  /** A few differently creased popped bubbles, so neighbours never look the same. */
  flats: HTMLCanvasElement[];
}

export const FLAT_VARIANTS = 4;

/** Pictures of one bubble (radius and room around it in device pixels). */
export function makeBubbleSprites(
  path: Path2D,
  radius: number,
  pad: number,
  pal: WrapPalette,
  plum: string,
  seed: number,
  face = false,
): BubbleSprites {
  const size = Math.ceil(2 * (radius + pad));
  const picture = (draw: (ctx: CanvasRenderingContext2D) => void) => {
    const canvas = makeCanvas(size, size);
    const ctx = context2d(canvas);
    ctx.translate(size / 2, size / 2);
    draw(ctx);
    return canvas;
  };
  return {
    size,
    full: picture((ctx) => drawDome(ctx, path, radius, pal, plum, face)),
    flats: Array.from({ length: FLAT_VARIANTS }, (_, k) =>
      picture((ctx) => drawFlat(ctx, path, radius, pal, mixSeed(seed, k))),
    ),
  };
}

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** The diagonal sheen across the plastic. Made in sheet units, reused whenever a bit of the sheet is repainted. */
export function makeSheen(ctx: CanvasRenderingContext2D, width: number, height: number): CanvasGradient {
  const sheen = ctx.createLinearGradient(0, 0, width, height);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.28, 'rgba(255,255,255,0.32)');
  sheen.addColorStop(0.36, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.62, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.69, 'rgba(255,255,255,0.2)');
  sheen.addColorStop(0.76, 'rgba(255,255,255,0)');
  return sheen;
}
