/**
 * Draws the squishy cloud: a soft backdrop, a shadow, the jelly body, its face
 * (which squashes and stretches with the body, a little) and its hat.
 */
import type { Face, Hat } from '../content';
import type { Expression } from '../core/cloud/mood';
import { topPointAt, type Body } from '../core/cloud/softbody';
import { rgba } from '../core/color';
import { drawFace } from './faceArt';
import type { ScreenSize } from './frame';
import { pictureCanvas } from './pictures';
import { paintCloud, smoothPath } from './shapes';
import { context2d, makeCanvas } from './wrapArt';

/** How much the face follows the body's stretch (0 = not at all, 1 = fully). */
const FACE_FOLLOW = 0.55;

export class CloudView {
  private screen: ScreenSize = { w: 1, h: 1, rs: 1 };
  private backdrop: HTMLCanvasElement | null = null;
  private hatSpot = new Map<string, number>();

  constructor(private readonly g: CanvasRenderingContext2D) {}

  setFrame(screen: ScreenSize): void {
    this.screen = { ...screen };
    const { w, h, rs } = screen;
    const canvas = makeCanvas(w * rs, h * rs);
    const ctx = context2d(canvas);
    ctx.scale(rs, rs);
    const glow = ctx.createLinearGradient(0, 0, 0, h);
    glow.addColorStop(0, '#FDE3EC');
    glow.addColorStop(1, '#E6DEFA');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    // Soft dots, like a cosy blanket.
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    const gap = 46;
    for (let y = gap / 2; y < h; y += gap) {
      for (let x = ((y / gap) % 2) * (gap / 2) + gap / 4; x < w; x += gap) {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    this.backdrop = canvas;
  }

  draw(body: Body, expression: Expression, look: { x: number; y: number }, face: Face, hat: Hat): void {
    const g = this.g;
    const { rs } = this.screen;
    const R = body.size;
    const fit = body.fit;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    if (this.backdrop) g.drawImage(this.backdrop, 0, 0);
    g.setTransform(rs, 0, 0, rs, 0, 0);

    // A soft shadow on the "table", as wide as the cloud is now.
    let left = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (let i = 0; i < body.n; i += 1) {
      left = Math.min(left, body.pos[i * 2]!);
      right = Math.max(right, body.pos[i * 2]!);
      bottom = Math.max(bottom, body.pos[i * 2 + 1]!);
    }
    g.fillStyle = rgba('#3D3566', 0.09);
    g.beginPath();
    g.ellipse((left + right) / 2, body.home.y + 0.9 * R, Math.max(10, (right - left) * 0.42), 0.09 * R, 0, 0, Math.PI * 2);
    g.fill();

    paintCloud(g, smoothPath(body.pos, body.n), fit.cx, fit.cy, R);

    // The face rides on the body, squashing and stretching with it a little.
    const k = FACE_FOLLOW;
    const a = 1 + (fit.a - 1) * k;
    const b = fit.b * k;
    const c = fit.c * k;
    const d = 1 + (fit.d - 1) * k;
    const fy = 0.1 * R;
    g.setTransform(a * rs, c * rs, b * rs, d * rs, (fit.cx + b * fy) * rs, (fit.cy + d * fy) * rs);
    drawFace(g, face, expression, R, look);

    if (hat.picture) this.drawHat(body, hat, hat.picture);
  }

  private drawHat(body: Body, hat: Hat, picture: string): void {
    const g = this.g;
    const { rs } = this.screen;
    let spot = this.hatSpot.get(hat.id);
    if (spot === undefined) {
      spot = topPointAt(body, hat.x);
      this.hatSpot.set(hat.id, spot);
    }
    const n = body.n;
    const at = (i: number, axis: 0 | 1) => body.pos[((i + n) % n) * 2 + axis]!;
    const x = (at(spot - 1, 0) + at(spot, 0) + at(spot + 1, 0)) / 3;
    const y = (at(spot - 1, 1) + at(spot, 1) + at(spot + 1, 1)) / 3;
    const angle = Math.atan2(at(spot + 2, 1) - at(spot - 2, 1), at(spot + 2, 0) - at(spot - 2, 0));
    const size = hat.width * 2.1 * body.size;
    const image = pictureCanvas(picture, size * rs);
    if (!image) return;
    g.setTransform(rs, 0, 0, rs, 0, 0);
    g.translate(x, y);
    g.rotate(angle + (hat.tilt * Math.PI) / 180);
    g.drawImage(image, -size / 2, -size * (1 - hat.sink), size, size);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
}
