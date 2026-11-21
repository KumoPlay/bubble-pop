/**
 * Things that float above every toy: the rare golden bubble with a tiny Kumo
 * inside, and the little gift bubbles that carry a new cosmetic to the
 * collection button.
 */
import { makeFilm, makeShine } from './film';
import { easeOutBack, easeOutCubic, type Rect } from './frame';
import { pictureCanvas } from './pictures';

const GOLDEN_FILM = ['#FFD66B', '#FFC29E', '#FFF4CC', '#F7CF6B', '#FFE7A8'];
const GIFT_FILM = ['#F9A8C8', '#CDB9F5', '#A9D3F7', '#FFE08A'];
const GOLDEN_R = 36;
const KUMO_MS = 1700;

/** A soft four-point twinkle. */
function twinkle(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.quadraticCurveTo(x, y, x, y + r);
  g.quadraticCurveTo(x, y, x - r, y);
  g.quadraticCurveTo(x, y, x, y - r);
  g.fill();
}

export class GoldenBubble {
  active = false;
  x = 0;
  y = 0;
  private x0 = 0;
  private baseY = 0;
  private vx = 0;
  private born = 0;
  private poppedAt: number | null = null;
  private film: HTMLCanvasElement | null = null;
  private shine: HTMLCanvasElement | null = null;
  private rs = 0;

  /** Floats in from one side of `area` and across to the other in `seconds`. */
  spawn(area: Rect, now: number, seconds: number, fromLeft: boolean, height: number): void {
    this.active = true;
    this.poppedAt = null;
    this.born = now;
    this.x0 = fromLeft ? area.x - GOLDEN_R : area.x + area.w + GOLDEN_R;
    this.vx = ((fromLeft ? 1 : -1) * (area.w + 2 * GOLDEN_R)) / Math.max(4, seconds);
    this.baseY = area.y + area.h * (0.18 + 0.4 * height);
    this.x = this.x0;
    this.y = this.baseY;
  }

  /** True when a finger at (x, y) touches it (a little generous: it is a treat). */
  hit(x: number, y: number): boolean {
    return this.active && this.poppedAt === null && Math.hypot(x - this.x, y - this.y) <= GOLDEN_R * 1.35;
  }

  pop(now: number): void {
    this.poppedAt = now;
  }

  /** Moves it along. True while it is still on screen. */
  update(now: number, screenW: number): boolean {
    if (!this.active) return false;
    if (this.poppedAt !== null) {
      if (now - this.poppedAt > KUMO_MS) this.active = false;
      return this.active;
    }
    const t = (now - this.born) / 1000;
    this.x = this.x0 + this.vx * t;
    this.y = this.baseY + Math.sin(t * 1.3) * 10;
    if ((this.vx > 0 && this.x > screenW + GOLDEN_R * 2) || (this.vx < 0 && this.x < -GOLDEN_R * 2)) this.active = false;
    return this.active;
  }

  draw(g: CanvasRenderingContext2D, rs: number, now: number, calm: boolean): void {
    if (!this.active) return;
    if (this.rs !== rs || !this.film || !this.shine) {
      this.rs = rs;
      this.film = makeFilm(GOLDEN_FILM, GOLDEN_R * 2 * rs, 0);
      this.shine = makeShine(GOLDEN_R * 2 * rs);
    }
    const kumo = pictureCanvas('kumo', GOLDEN_R * 1.5 * rs);
    const r = GOLDEN_R;
    g.setTransform(rs, 0, 0, rs, 0, 0);
    if (this.poppedAt === null) {
      const t = (now - this.born) / 1000;
      // Kumo inside, bobbing a little.
      if (kumo) {
        const s = r * 1.3;
        g.drawImage(kumo, this.x - s / 2, this.y - s / 2 + Math.sin(t * 2.2) * 2, s, s);
      }
      g.save();
      g.translate(this.x, this.y);
      g.rotate(t * 0.4);
      g.drawImage(this.film, -r, -r, r * 2, r * 2);
      g.restore();
      g.drawImage(this.shine, this.x - r, this.y - r, r * 2, r * 2);
      // Three soft twinkles circling slowly (they brighten and dim smoothly, never flash).
      g.fillStyle = '#FFF4CC';
      for (let i = 0; i < 3; i += 1) {
        const a = t * 0.6 + (i * Math.PI * 2) / 3;
        g.globalAlpha = 0.45 + 0.4 * Math.sin(t * 1.8 + i * 2);
        twinkle(g, this.x + Math.cos(a) * r * 1.3, this.y + Math.sin(a) * r * 1.3, 4.5);
      }
      g.globalAlpha = 1;
      return;
    }
    // Popped: a golden ring and twinkles burst out, and Kumo hops up, wiggles hello and floats away.
    const age = now - this.poppedAt;
    const e = easeOutCubic(Math.min(1, age / 320));
    if (e < 1) {
      g.globalAlpha = 0.7 * (1 - e);
      g.strokeStyle = '#FFD66B';
      g.lineWidth = 4 * (1 - e) + 1;
      g.beginPath();
      g.arc(this.x, this.y, r * (1 + 0.6 * e), 0, Math.PI * 2);
      g.stroke();
    }
    const burst = Math.min(1, age / 700);
    if (burst < 1) {
      g.fillStyle = '#FFD66B';
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * Math.PI * 2;
        const d = r * (0.8 + 1.1 * easeOutCubic(burst));
        g.globalAlpha = 1 - burst;
        twinkle(g, this.x + Math.cos(a) * d, this.y + Math.sin(a) * d, 5 * (1 - burst * 0.5));
      }
    }
    if (kumo) {
      const t = age / KUMO_MS;
      const hop = easeOutBack(Math.min(1, age / 260));
      const s = r * 1.3 * (0.7 + 0.45 * hop);
      g.globalAlpha = t > 0.75 ? Math.max(0, (1 - t) / 0.25) : 1;
      g.save();
      g.translate(this.x, this.y - 150 * easeOutCubic(t));
      g.rotate(Math.sin((age / 1000) * Math.PI * 4) * (calm ? 0.06 : 0.22));
      g.drawImage(kumo, -s / 2, -s / 2, s, s);
      g.restore();
    }
    g.globalAlpha = 1;
  }
}

interface Gift {
  picture: HTMLCanvasElement | null;
  x: number;
  y: number;
  tx: number;
  ty: number;
  at: number;
  onArrive: () => void;
}

const GIFT_R = 34;
const RISE_MS = 1300;
const FLY_MS = 550;

/** A new cosmetic in a bubble: it rises from the last pop, then floats into the collection button. */
export class Gifts {
  private readonly items: Gift[] = [];
  private film: HTMLCanvasElement | null = null;
  private shine: HTMLCanvasElement | null = null;
  private rs = 0;

  get active(): boolean {
    return this.items.length > 0;
  }

  add(picture: HTMLCanvasElement | null, from: { x: number; y: number }, to: { x: number; y: number }, now: number, onArrive: () => void): void {
    // Start low enough to rise, high enough to be seen.
    const y = Math.max(GIFT_R + 100, from.y);
    this.items.push({ picture, x: from.x, y, tx: to.x, ty: to.y, at: now, onArrive });
  }

  update(now: number): boolean {
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const gift = this.items[i]!;
      if (now - gift.at >= RISE_MS + FLY_MS) {
        this.items.splice(i, 1);
        gift.onArrive();
      }
    }
    return this.items.length > 0;
  }

  draw(g: CanvasRenderingContext2D, rs: number, now: number, calm: boolean): void {
    if (this.items.length === 0) return;
    if (this.rs !== rs || !this.film || !this.shine) {
      this.rs = rs;
      this.film = makeFilm(GIFT_FILM, GIFT_R * 2 * rs, 1);
      this.shine = makeShine(GIFT_R * 2 * rs);
    }
    g.setTransform(rs, 0, 0, rs, 0, 0);
    for (const gift of this.items) {
      const age = now - gift.at;
      let x: number;
      let y: number;
      let scale: number;
      if (age < RISE_MS) {
        const t = age / RISE_MS;
        x = gift.x + (calm ? 0 : Math.sin(t * Math.PI * 2) * 8);
        y = gift.y - 90 * easeOutCubic(t);
        scale = calm ? Math.min(1, t * 4) : easeOutBack(Math.min(1, t * 4));
      } else {
        const t = Math.min(1, (age - RISE_MS) / FLY_MS);
        const e = t * t * t;
        const sx = gift.x;
        const sy = gift.y - 90;
        x = sx + (gift.tx - sx) * e;
        y = sy + (gift.ty - sy) * e - Math.sin(t * Math.PI) * 40;
        scale = 1 - 0.65 * e;
      }
      const r = GIFT_R * Math.max(0.05, scale);
      if (gift.picture) g.drawImage(gift.picture, x - r * 0.62, y - r * 0.62, r * 1.24, r * 1.24);
      g.save();
      g.translate(x, y);
      g.rotate(age / 2500);
      g.drawImage(this.film, -r, -r, r * 2, r * 2);
      g.restore();
      g.drawImage(this.shine, x - r, y - r, r * 2, r * 2);
    }
  }
}
