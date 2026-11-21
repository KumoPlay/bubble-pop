/**
 * Soap-bubble pictures: a see-through film with swirling pastel colours, a
 * brighter rim, and a separate shine (window glint) that stays put while the
 * film slowly turns. Drawn once, copied every frame.
 */
import { rgba } from '../core/color';
import { context2d, makeCanvas } from './wrapArt';

/** A soap film of radius size/2 in the given colours. `variant` turns and reorders the swirl. */
export function makeFilm(colors: readonly string[], size: number, variant: number): HTMLCanvasElement {
  const px = Math.max(8, Math.ceil(size));
  const canvas = makeCanvas(px, px);
  const ctx = context2d(canvas);
  const c = px / 2;
  const r = c - 1;
  const order = variant % 2 === 0 ? [...colors] : [...colors].reverse();

  // The swirl of colour.
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.clip();
  const start = variant * 2.1;
  if (typeof ctx.createConicGradient === 'function') {
    const swirl = ctx.createConicGradient(start, c, c);
    order.forEach((color, i) => swirl.addColorStop(i / order.length, rgba(color, 0.75)));
    swirl.addColorStop(1, rgba(order[0]!, 0.75));
    ctx.fillStyle = swirl;
  } else {
    const swirl = ctx.createLinearGradient(c + Math.cos(start) * r, c + Math.sin(start) * r, c - Math.cos(start) * r, c - Math.sin(start) * r);
    order.forEach((color, i) => swirl.addColorStop(i / Math.max(1, order.length - 1), rgba(color, 0.75)));
    ctx.fillStyle = swirl;
  }
  ctx.fillRect(0, 0, px, px);
  // Mostly clear in the middle, coloured towards the rim, like a real bubble.
  ctx.globalCompositeOperation = 'destination-in';
  const fade = ctx.createRadialGradient(c, c, 0, c, c, r);
  fade.addColorStop(0, 'rgba(0,0,0,0.12)');
  fade.addColorStop(0.55, 'rgba(0,0,0,0.22)');
  fade.addColorStop(0.85, 'rgba(0,0,0,0.6)');
  fade.addColorStop(1, 'rgba(0,0,0,0.95)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, px, px);
  ctx.restore();

  // A thin bright rim.
  ctx.lineWidth = Math.max(1, px * 0.018);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(c, c, r - ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.stroke();
  return canvas;
}

/** The shine on a bubble: a soft window glint top left and a little light bottom right. */
export function makeShine(size: number): HTMLCanvasElement {
  const px = Math.max(8, Math.ceil(size));
  const canvas = makeCanvas(px, px);
  const ctx = context2d(canvas);
  const c = px / 2;
  const r = c - 1;
  ctx.translate(c, c);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.save();
  ctx.rotate(-0.7);
  ctx.beginPath();
  ctx.ellipse(-0.02 * r, -0.6 * r, 0.26 * r, 0.12 * r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(-0.62 * r, -0.12 * r, 0.06 * r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.06 * r;
  ctx.beginPath();
  ctx.arc(0, 0, 0.78 * r, 0.2, 1.1);
  ctx.stroke();
  return canvas;
}
