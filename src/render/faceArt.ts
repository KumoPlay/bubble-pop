/**
 * Faces: the squishy cloud's (every face style, with every expression on
 * top) and the tiny Kumo face on Kumo-shaped bubble wrap. Drawn with code, so a
 * new face in cloud-faces.json is just a new mix of these parts.
 */
import type { Face } from '../content';
import type { Expression } from '../core/cloud/mood';
import { rgba } from '../core/color';

const PLUM = '#3D3566';
const PINK_MOUTH = '#F07BA8';

function line(ctx: CanvasRenderingContext2D, width: number): void {
  ctx.strokeStyle = PLUM;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const d = i % 2 === 0 ? r : r * 0.48;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    else ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.closePath();
}

/**
 * Draws a cloud face centred on (0, 0). `R` is the cloud's size (half its
 * width); `look` (-1 to 1 each way) moves the eyes towards a finger.
 */
export function drawFace(
  ctx: CanvasRenderingContext2D,
  face: Face,
  expression: Expression,
  R: number,
  look: { x: number; y: number } = { x: 0, y: 0 },
): void {
  const ex = 0.25 * R;
  const ey = -0.03 * R;
  const lx = look.x * 0.03 * R;
  const ly = look.y * 0.025 * R;
  const stroke = Math.max(1.5, 0.028 * R);
  const cheeky = expression === 'giggle' || expression === 'squish';

  // Blush.
  ctx.fillStyle = rgba(face.blush, cheeky ? 1 : 0.85);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 0.42 * R, 0.13 * R, (cheeky ? 0.115 : 0.1) * R, (cheeky ? 0.062 : 0.055) * R, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (face.freckles) {
    ctx.fillStyle = rgba('#C98B6B', 0.75);
    for (const side of [-1, 1]) {
      for (const [dx, dy] of [
        [-0.05, -0.05],
        [0.03, -0.07],
        [0.0, 0.0],
      ] as const) {
        ctx.beginPath();
        ctx.arc(side * (0.42 + dx) * R, (0.1 + dy) * R, 0.011 * R, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  if (face.whiskers) {
    line(ctx, stroke * 0.6);
    for (const side of [-1, 1]) {
      for (const dy of [-0.02, 0.05]) {
        ctx.beginPath();
        ctx.moveTo(side * 0.55 * R, (0.1 + dy) * R);
        ctx.lineTo(side * 0.7 * R, (0.08 + dy * 1.6) * R);
        ctx.stroke();
      }
    }
  }

  // Eyes.
  for (const side of [-1, 1]) {
    const x = side * ex + lx;
    const y = ey + ly;
    line(ctx, stroke);
    if (expression === 'blink') {
      ctx.beginPath();
      ctx.moveTo(x - 0.05 * R, y);
      ctx.lineTo(x + 0.05 * R, y);
      ctx.stroke();
    } else if (expression === 'sleepy') {
      ctx.beginPath();
      ctx.arc(x, y - 0.02 * R, 0.05 * R, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    } else if (expression === 'giggle' || (expression === 'calm' && face.eyes === 'happy')) {
      ctx.beginPath();
      ctx.arc(x, y + 0.025 * R, 0.055 * R, 1.15 * Math.PI, 1.85 * Math.PI);
      ctx.stroke();
    } else if (expression === 'squish') {
      ctx.beginPath();
      ctx.moveTo(x - side * 0.05 * R, y - 0.045 * R);
      ctx.lineTo(x + side * 0.03 * R, y);
      ctx.lineTo(x - side * 0.05 * R, y + 0.045 * R);
      ctx.stroke();
    } else if (expression === 'calm' && face.eyes === 'star') {
      star(ctx, x, y, 0.08 * R);
      ctx.fillStyle = '#FFD66B';
      ctx.fill();
      ctx.lineWidth = stroke * 0.7;
      ctx.stroke();
    } else {
      // Open eyes (calm, or wide open when surprised).
      const wide = expression === 'surprised';
      const rx = wide ? 0.07 * R : face.eyes === 'round' ? 0.056 * R : 0.05 * R;
      const ry = wide ? 0.075 * R : face.eyes === 'round' ? 0.056 * R : 0.066 * R;
      ctx.fillStyle = PLUM;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(x + 0.3 * rx, y - 0.35 * ry, 0.34 * rx, 0, Math.PI * 2);
      ctx.fill();
      if (face.eyes === 'sparkle' || wide) {
        ctx.beginPath();
        ctx.arc(x - 0.35 * rx, y + 0.4 * ry, 0.18 * rx, 0, Math.PI * 2);
        ctx.fill();
      }
      if (face.lashes) {
        line(ctx, stroke * 0.7);
        for (const k of [0, 1]) {
          const a = -Math.PI / 2 + side * (0.55 + k * 0.4);
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * rx * 1.05, y + Math.sin(a) * ry * 1.05);
          ctx.lineTo(x + Math.cos(a) * rx * 1.6, y + Math.sin(a) * ry * 1.5);
          ctx.stroke();
        }
      }
    }
  }

  // Mouth.
  const my = 0.12 * R;
  line(ctx, stroke);
  const mouth = expression === 'giggle' ? 'grin' : face.mouth;
  if (expression === 'surprised') {
    ctx.fillStyle = PLUM;
    ctx.beginPath();
    ctx.ellipse(0, my + 0.01 * R, 0.035 * R, 0.048 * R, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PINK_MOUTH;
    ctx.beginPath();
    ctx.ellipse(0, my + 0.03 * R, 0.022 * R, 0.018 * R, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (expression === 'squish') {
    ctx.beginPath();
    ctx.moveTo(-0.06 * R, my);
    ctx.quadraticCurveTo(-0.03 * R, my - 0.03 * R, 0, my);
    ctx.quadraticCurveTo(0.03 * R, my + 0.03 * R, 0.06 * R, my);
    ctx.stroke();
  } else if (expression === 'sleepy') {
    ctx.beginPath();
    ctx.arc(0, my - 0.01 * R, 0.025 * R, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  } else if (mouth === 'grin') {
    const w = expression === 'giggle' ? 0.07 * R : 0.055 * R;
    ctx.beginPath();
    ctx.moveTo(-w, my - 0.012 * R);
    ctx.quadraticCurveTo(0, my - 0.02 * R, w, my - 0.012 * R);
    ctx.quadraticCurveTo(w * 0.9, my + 0.075 * R, 0, my + 0.075 * R);
    ctx.quadraticCurveTo(-w * 0.9, my + 0.075 * R, -w, my - 0.012 * R);
    ctx.closePath();
    ctx.fillStyle = PINK_MOUTH;
    ctx.fill();
    ctx.stroke();
  } else if (mouth === 'cat') {
    ctx.beginPath();
    ctx.arc(-0.03 * R, my, 0.03 * R, 0.1 * Math.PI, 0.95 * Math.PI);
    ctx.moveTo(0.06 * R, my + 0.005 * R);
    ctx.arc(0.03 * R, my, 0.03 * R, 0.05 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
  } else if (mouth === 'tiny') {
    ctx.beginPath();
    ctx.arc(0, my - 0.012 * R, 0.028 * R, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, my - 0.03 * R, 0.05 * R, 0.22 * Math.PI, 0.78 * Math.PI);
    ctx.stroke();
  }
}

/** Kumo's little face, for Kumo-shaped bubble wrap. Centred on (0, 0); `r` is the bubble radius. */
export function drawKumoFace(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.fillStyle = rgba('#F8A9C6', 0.9);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 0.46 * r, 0.2 * r, 0.13 * r, 0.08 * r, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = PLUM;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 0.22 * r, 0.02 * r, 0.075 * r, 0.095 * r, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#FFFFFF';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * 0.22 * r + 0.025 * r, -0.015 * r, 0.028 * r, 0, Math.PI * 2);
    ctx.fill();
  }
  line(ctx, Math.max(1, 0.045 * r));
  ctx.beginPath();
  ctx.arc(0, 0.12 * r, 0.075 * r, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
}
