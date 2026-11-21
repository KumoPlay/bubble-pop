/**
 * Draws the soap bubbles toy: a soft sky, the bubbles (a turning film plus a
 * shine that stays put), the wand, and little pops. Everything is copied from
 * pictures made once, so forty bubbles are cheap to draw.
 */
import type { Wand } from '../content';
import { mix, rgba } from '../core/color';
import type { SoapBubble, SoapWorld } from '../core/soap/world';
import { SOAP } from '../core/soap/world';
import { makeFilm, makeShine } from './film';
import { easeOutCubic, type ScreenSize } from './frame';
import { drawWand } from './shapes';
import { context2d, makeCanvas } from './wrapArt';

/** Bubble pictures are made at this radius (screen points) and scaled down for smaller bubbles. */
const SPRITE_R = 48;
const POP_MS = 450;
export const WAND_RING = 22;

export interface WandDraw {
  wand: Wand;
  x: number;
  y: number;
  tilt: number;
  alpha: number;
  film: number;
}

interface PopFx {
  alive: boolean;
  x: number;
  y: number;
  r: number;
  at: number;
  color: string;
  calm: boolean;
  dice: Float32Array;
}

export class SoapView {
  private screen: ScreenSize = { w: 1, h: 1, rs: 1 };
  private backdrop: HTMLCanvasElement | null = null;
  private films: HTMLCanvasElement[] = [];
  private shine: HTMLCanvasElement | null = null;
  private wand: Wand | null = null;
  private readonly pops: PopFx[] = [];

  constructor(private readonly g: CanvasRenderingContext2D) {}

  setFrame(screen: ScreenSize): void {
    this.screen = { ...screen };
    this.backdrop = makeSky(screen);
    this.films = [];
    this.shine = null;
  }

  /** The wand decides the film's colours. */
  setWand(wand: Wand): void {
    if (wand === this.wand) return;
    this.wand = wand;
    this.films = [];
  }

  popped(b: SoapBubble, now: number, calm: boolean): void {
    let fx = this.pops.find((p) => !p.alive);
    if (!fx) {
      if (this.pops.length >= 48) return;
      fx = { alive: false, x: 0, y: 0, r: 0, at: 0, color: '', calm, dice: new Float32Array(6) };
      this.pops.push(fx);
    }
    const film = this.wand?.film ?? ['#A9D3F7'];
    Object.assign(fx, { alive: true, x: b.x, y: b.y, r: b.r, at: now, calm, color: film[b.film % film.length]! });
    for (let i = 0; i < fx.dice.length; i += 1) fx.dice[i] = Math.random();
  }

  animating(now: number): boolean {
    let any = false;
    for (const p of this.pops) {
      if (p.alive && now - p.at >= POP_MS) p.alive = false;
      any ||= p.alive;
    }
    return any;
  }

  draw(world: SoapWorld, wand: WandDraw | null, now: number, calm: boolean): void {
    const g = this.g;
    const { rs } = this.screen;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    if (this.backdrop) g.drawImage(this.backdrop, 0, 0);
    this.ensureSprites();
    const shine = this.shine;

    for (const b of world.bubbles) {
      const film = this.films[b.film % this.films.length];
      if (!film || !shine) continue;
      const grow = Math.min(1, 0.45 + (0.55 * b.age) / 0.25);
      const r = b.r * grow;
      const wobble = Math.sin(b.age * 17) * b.jiggle * (calm ? 0.04 : 0.12);
      const sx = (1 + wobble) * rs;
      const sy = (1 - wobble) * rs;
      const c = Math.cos(b.spin);
      const s = Math.sin(b.spin);
      g.globalAlpha = Math.min(1, 0.3 + b.age * 4) * Math.min(1, (b.life - b.age) * 3);
      g.setTransform(sx * c, sy * s, -sx * s, sy * c, b.x * rs, b.y * rs);
      g.drawImage(film, -r, -r, r * 2, r * 2);
      g.setTransform(sx, 0, 0, sy, b.x * rs, b.y * rs);
      g.drawImage(shine, -r, -r, r * 2, r * 2);
    }

    g.setTransform(rs, 0, 0, rs, 0, 0);
    for (const p of this.pops) {
      if (!p.alive) continue;
      const t = (now - p.at) / POP_MS;
      if (t < 0 || t >= 1) continue;
      // A ring of film colour, spreading and fading.
      const e = easeOutCubic(Math.min(1, t * 1.8));
      if (e < 1) {
        g.globalAlpha = 0.6 * (1 - e);
        g.strokeStyle = mix(p.color, '#FFFFFF', 0.2);
        g.lineWidth = Math.max(1, p.r * 0.08);
        g.beginPath();
        g.arc(p.x, p.y, p.r * (1 + 0.35 * e), 0, Math.PI * 2);
        g.stroke();
      }
      // Tiny droplets falling away (not in calm motion).
      if (!p.calm) {
        g.fillStyle = rgba(mix(p.color, '#FFFFFF', 0.4), 1);
        for (let i = 0; i < 6; i += 1) {
          const angle = ((i + p.dice[i]! * 0.6) / 6) * Math.PI * 2;
          const out = p.r * (0.9 + 0.5 * easeOutCubic(t));
          g.globalAlpha = 0.9 * (1 - t);
          g.beginPath();
          g.arc(p.x + Math.cos(angle) * out, p.y + Math.sin(angle) * out + 160 * t * t, Math.max(1, p.r * 0.05), 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    g.globalAlpha = 1;

    if (wand && wand.alpha > 0) {
      g.globalAlpha = wand.alpha;
      drawWand(g, wand.wand, wand.x, wand.y, WAND_RING, wand.tilt, wand.film);
      g.globalAlpha = 1;
    }
  }

  private ensureSprites(): void {
    const size = SPRITE_R * 2 * this.screen.rs;
    if (this.films.length === 0 && this.wand) {
      this.films = Array.from({ length: SOAP.filmCount }, (_, i) => makeFilm(this.wand!.film, size, i));
    }
    this.shine ??= makeShine(size);
  }
}

/** A soft sky with a few faint clouds, painted once per screen size. */
function makeSky(screen: ScreenSize): HTMLCanvasElement {
  const { w, h, rs } = screen;
  const canvas = makeCanvas(w * rs, h * rs);
  const ctx = context2d(canvas);
  ctx.scale(rs, rs);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#D9EAFB');
  sky.addColorStop(0.55, '#ECE5FB');
  sky.addColorStop(1, '#FDE3EC');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  const puff = (x: number, y: number, s: number) => {
    // One shape for the whole cloud, so the round parts do not show where they overlap.
    ctx.beginPath();
    for (const [dx, dy, r] of [
      [-0.9, 0.2, 0.45],
      [-0.3, -0.15, 0.7],
      [0.45, 0.0, 0.55],
      [1.0, 0.25, 0.4],
    ] as const) {
      ctx.moveTo(x + dx * s + r * s, y + dy * s);
      ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
    }
    ctx.moveTo(x - 0.9 * s, y + 0.2 * s);
    ctx.roundRect?.(x - 0.9 * s, y + 0.2 * s, 1.9 * s, 0.45 * s, 0.22 * s);
    ctx.fill('nonzero');
  };
  const unit = Math.min(w, h);
  puff(w * 0.2, h * 0.16, unit * 0.09);
  puff(w * 0.78, h * 0.34, unit * 0.07);
  puff(w * 0.35, h * 0.62, unit * 0.06);
  return canvas;
}
