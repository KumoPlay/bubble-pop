/** Drawing helpers shared by the cloud, the wand and the little previews. */
import type { Wand } from '../content';
import { content } from '../content';
import { mix, rgba } from '../core/color';
import { shapePath } from './wrapArt';

const PLUM = '#3D3566';
/** Shapes in shapes.json reach about this far from (50, 50). */
const SHAPE_RADIUS = 46;

/** A smooth closed curve through points (x0, y0, x1, y1, …), scaled by `k` and moved by (ox, oy). */
export function smoothPath(pts: ArrayLike<number>, n: number, k = 1, ox = 0, oy = 0): Path2D {
  const x = (i: number) => pts[((i + n) % n) * 2]! * k + ox;
  const y = (i: number) => pts[((i + n) % n) * 2 + 1]! * k + oy;
  const path = new Path2D();
  path.moveTo(x(0), y(0));
  for (let i = 0; i < n; i += 1) {
    // Catmull-Rom through the points, as Bézier curves.
    path.bezierCurveTo(
      x(i) + (x(i + 1) - x(i - 1)) / 6,
      y(i) + (y(i + 1) - y(i - 1)) / 6,
      x(i + 1) - (x(i + 2) - x(i)) / 6,
      y(i + 1) - (y(i + 2) - y(i)) / 6,
      x(i + 1),
      y(i + 1),
    );
  }
  path.closePath();
  return path;
}

/**
 * Fills and outlines `body` as a soft white cloud, shaded lavender underneath
 * like Kumo. (cx, cy) is its middle and R its size.
 */
export function paintCloud(ctx: CanvasRenderingContext2D, body: Path2D, cx: number, cy: number, R: number): void {
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill(body);
  ctx.clip(body);
  const shade = ctx.createRadialGradient(cx - 0.3 * R, cy - 0.45 * R, 0.1 * R, cx, cy, 1.35 * R);
  shade.addColorStop(0, 'rgba(255,255,255,0)');
  shade.addColorStop(0.65, 'rgba(255,255,255,0)');
  shade.addColorStop(1, rgba('#DCD0F7', 0.9));
  ctx.fillStyle = shade;
  ctx.fillRect(cx - 2 * R, cy - 2 * R, 4 * R, 4 * R);
  ctx.fillStyle = rgba('#EEE6FD', 0.9);
  ctx.beginPath();
  ctx.ellipse(cx, cy + 0.62 * R, 0.95 * R, 0.3 * R, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = PLUM;
  ctx.lineWidth = Math.max(2, 0.045 * R);
  ctx.lineJoin = 'round';
  ctx.stroke(body);
}

/**
 * A bubble wand with its ring centred on (x, y), ring size R, tilted by `tilt`
 * radians. `film` (0 to 1) shows soap in the ring.
 */
export function drawWand(ctx: CanvasRenderingContext2D, wand: Wand, x: number, y: number, R: number, tilt: number, film: number): void {
  const path = shapePath(content.shapes[wand.shape] ?? content.shapes.circle!);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  // The handle, reaching down towards the finger.
  ctx.lineCap = 'round';
  ctx.strokeStyle = PLUM;
  ctx.lineWidth = 0.42 * R;
  ctx.beginPath();
  ctx.moveTo(0.12 * R, 1.0 * R);
  ctx.lineTo(0.45 * R, 2.7 * R);
  ctx.stroke();
  ctx.strokeStyle = wand.handle;
  ctx.lineWidth = 0.24 * R;
  ctx.stroke();

  const s = R / SHAPE_RADIUS;
  ctx.scale(s, s);
  ctx.translate(-50, -50);
  if (film > 0) {
    ctx.fillStyle = rgba(wand.film[0] ?? '#FFFFFF', 0.22 * film);
    ctx.fill(path);
  }
  ctx.lineJoin = 'round';
  ctx.strokeStyle = PLUM;
  ctx.lineWidth = 0.46 * SHAPE_RADIUS * 0.42;
  ctx.stroke(path);
  if (wand.ring.length > 1) {
    const ring = ctx.createLinearGradient(4, 4, 96, 96);
    wand.ring.forEach((color, i) => ring.addColorStop(i / (wand.ring.length - 1), color));
    ctx.strokeStyle = ring;
  } else ctx.strokeStyle = wand.ring[0]!;
  ctx.lineWidth = 0.46 * SHAPE_RADIUS * 0.22;
  ctx.stroke(path);
  ctx.strokeStyle = rgba(mix(wand.ring[0]!, '#FFFFFF', 0.7), 0.8);
  ctx.lineWidth = 0.46 * SHAPE_RADIUS * 0.06;
  ctx.stroke(path);
  ctx.restore();
}
