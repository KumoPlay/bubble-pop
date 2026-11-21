/**
 * Draws the bubble wrap. Each sheet is painted once into its own picture (the
 * "layer"); after that a frame is one copy of the layer plus whatever is moving
 * (popping bubbles, a sheet sliding in). When nothing moves, nothing is drawn.
 */
import { content, wrapColorById, wrapPalette, wrapPatternById, type WrapPalette } from '../content';
import { mix, rgba } from '../core/color';
import { mixSeed } from '../core/rng';
import { placeSheet, type Placement, type Sheet } from '../core/wrap/sheet';
import { easeInOutCubic, easeOutBack, easeOutCubic, type Rect, type ScreenSize } from './frame';
import {
  context2d,
  FLAT_VARIANTS,
  makeBubbleSprites,
  makeCanvas,
  makeSheen,
  roundRectPath,
  shapePath,
  type BubbleSprites,
} from './wrapArt';

/** Room around the sheet inside its layer, for the drop shadow (screen points). */
const SHADOW_MARGIN = 24;
const SHEET_CORNER = 16;
const SLIDE_MS = 560;
const FADE_MS = 320;
const INFLATE_MS = 320;
const POP_MS = 360;
const RING_MS = 280;
const COLLAPSE_MS = 110;
const CRINKLE_MS = 200;

interface Slot {
  sheet: Sheet;
  pal: WrapPalette;
  /** The colour of the puff ring and specks when a bubble pops. */
  ring: string;
  path: Path2D;
  place: Placement;
  /** Top-left corner of the sheet on screen (screen points). */
  left: number;
  top: number;
  /** Device pixels per sheet unit. */
  k: number;
  /** Where the sheet starts inside its layer (device pixels). */
  o: number;
  layer: HTMLCanvasElement;
  lctx: CanvasRenderingContext2D;
  sheen: CanvasGradient;
  sprites: BubbleSprites;
  backdrop: CanvasGradient;
  /** Bubbles plump up one after another when a sheet arrives. */
  inflateStart: number;
  delays: Float32Array | null;
  inflateEnd: number;
  settled: boolean;
}

interface Anim {
  alive: boolean;
  kind: 'pop' | 'crinkle';
  slot: Slot | null;
  index: number;
  at: number;
  calm: boolean;
  /** Little random numbers fixed when the animation starts (directions of specks and glints). */
  dice: Float32Array;
}

export class WrapView {
  private screen: ScreenSize = { w: 1, h: 1, rs: 1 };
  private area: Rect = { x: 0, y: 0, w: 1, h: 1 };
  private current: Slot | null = null;
  private leaving: { slot: Slot; at: number; calm: boolean } | null = null;
  private readonly anims: Anim[] = [];
  /** The whole screen must be drawn on the next frame (new sheet, new size, slides). */
  private fullRedraw = true;
  /** Patches (device pixels: x, y, w, h, x, y, …) where animations were drawn last frame. */
  private dirty: number[] = [];
  private nextDirty: number[] = [];

  constructor(
    private readonly g: CanvasRenderingContext2D,
    private readonly plum: string,
  ) {}

  /** The screen or the play area changed. Repaints the current sheet at its new size. */
  setFrame(screen: ScreenSize, area: Rect): void {
    this.screen = { ...screen };
    this.area = { ...area };
    this.leaving = null;
    this.fullRedraw = true;
    if (this.current) this.layout(this.current);
  }

  /** Draw everything again on the next frame (for example after the tab comes back). */
  invalidate(): void {
    this.fullRedraw = true;
  }

  /** Shows a new sheet: plumping up in place ('first'), or sliding in over the old one ('slide'). */
  show(sheet: Sheet, now: number, how: 'first' | 'slide', calm: boolean): void {
    const previous = this.current;
    // Calm motion: the bubbles are simply there, no plumping up.
    const slot = this.makeSlot(sheet, calm);
    const sliding = how === 'slide' && previous !== null;
    this.leaving = sliding ? { slot: previous, at: now, calm } : null;
    if (!calm) {
      slot.inflateStart = sliding ? now + SLIDE_MS * 0.35 : now;
      slot.delays = new Float32Array(sheet.bubbles.length);
      const cx = sheet.width / 2;
      const cy = sheet.height / 2;
      const far = Math.hypot(cx, cy);
      let last = 0;
      sheet.bubbles.forEach((b, i) => {
        // Sliding in from the right: the left edge arrives first. Otherwise a ripple from the middle.
        const delay = sliding
          ? (b.x / sheet.width) * 240 + (b.y / sheet.height) * 80
          : (Math.hypot(b.x - cx, b.y - cy) / far) * 260;
        slot.delays![i] = delay;
        last = Math.max(last, delay);
      });
      slot.inflateEnd = slot.inflateStart + last + INFLATE_MS;
    }
    this.current = slot;
    this.fullRedraw = true;
  }

  /** Where a screen point falls on the current sheet, in sheet units. */
  toSheet(x: number, y: number, now: number): { x: number; y: number } | null {
    const slot = this.current;
    if (!slot) return null;
    const dx = this.incomingOffset(now);
    return { x: (x - slot.left - dx) / slot.place.scale, y: (y - slot.top) / slot.place.scale };
  }

  /** A point on the current sheet (sheet units) as a screen point. */
  toScreen(x: number, y: number, now: number): { x: number; y: number } | null {
    const slot = this.current;
    if (!slot) return null;
    return { x: slot.left + this.incomingOffset(now) + x * slot.place.scale, y: slot.top + y * slot.place.scale };
  }

  /** Bubble `index` of the current sheet just popped: flatten it and play the little burst. */
  popped(index: number, now: number, calm: boolean): void {
    const slot = this.current;
    if (!slot) return;
    this.paintCell(slot, index);
    this.startAnim('pop', slot, index, now, calm);
  }

  crinkled(index: number, now: number, calm: boolean): void {
    const slot = this.current;
    if (slot) this.startAnim('crinkle', slot, index, now, calm);
  }

  /** Moves time forward. True while anything still moves. */
  update(now: number): boolean {
    const slot = this.current;
    if (slot && !slot.settled && now >= slot.inflateEnd) {
      slot.settled = true;
      slot.delays = null;
      for (let i = 0; i < slot.sheet.bubbles.length; i += 1) {
        if (!slot.sheet.bubbles[i]!.popped) this.stamp(slot, i, slot.sprites.full);
      }
      this.fullRedraw = true;
    }
    if (this.leaving && now >= this.leaving.at + this.transitionMs()) {
      this.leaving = null;
      this.fullRedraw = true;
    }
    let moving = this.leaving !== null || (slot !== null && !slot.settled);
    for (const anim of this.anims) {
      if (!anim.alive) continue;
      if (now - anim.at >= (anim.kind === 'pop' ? POP_MS : CRINKLE_MS)) {
        anim.alive = false;
        anim.slot = null;
      } else moving = true;
    }
    return moving;
  }

  draw(now: number): void {
    const g = this.g;
    const { w, h, rs } = this.screen;
    const width = Math.ceil(w * rs);
    const height = Math.ceil(h * rs);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    const slot = this.current;
    if (!slot) {
      g.fillStyle = content.palette.petal;
      g.fillRect(0, 0, width, height);
      return;
    }
    const leaving = this.leaving;
    if (!leaving && slot.settled && !this.fullRedraw) {
      this.drawPatches(slot, now);
      return;
    }
    this.fullRedraw = false;
    if (!leaving) {
      g.fillStyle = slot.backdrop;
      g.fillRect(0, 0, width, height);
      this.drawSlot(slot, 0, now);
      // Remember where the animations are, so the next quick frame can tidy them up.
      const [lx, ly] = this.layerAt(slot, 0);
      this.dirty.length = 0;
      this.animPatches(slot, lx + slot.o, ly + slot.o, this.dirty);
      return;
    }
    const e = easeInOutCubic(Math.min(1, (now - leaving.at) / this.transitionMs()));
    g.fillStyle = leaving.slot.backdrop;
    g.fillRect(0, 0, width, height);
    g.globalAlpha = e;
    g.fillStyle = slot.backdrop;
    g.fillRect(0, 0, width, height);
    if (leaving.calm) {
      g.globalAlpha = 1 - e;
      this.drawSlot(leaving.slot, 0, now);
      g.globalAlpha = e;
      this.drawSlot(slot, 0, now);
    } else {
      g.globalAlpha = 1;
      this.drawSlot(leaving.slot, -e * (w + 40), now);
      this.drawSlot(slot, (1 - e) * (w + 40), now);
    }
    g.globalAlpha = 1;
  }

  /**
   * The quick way to draw a frame when the sheet sits still: only the patches around
   * popping bubbles are painted again (from the sheet layer), instead of the whole screen.
   */
  private drawPatches(slot: Slot, now: number): void {
    const g = this.g;
    const [lx, ly] = this.layerAt(slot, 0);
    this.nextDirty.length = 0;
    this.animPatches(slot, lx + slot.o, ly + slot.o, this.nextDirty);
    for (const list of [this.dirty, this.nextDirty]) {
      for (let i = 0; i < list.length; i += 4) {
        const x = list[i]!;
        const y = list[i + 1]!;
        const w = list[i + 2]!;
        const h = list[i + 3]!;
        g.save();
        g.beginPath();
        g.rect(x, y, w, h);
        g.clip();
        g.fillStyle = slot.backdrop;
        g.fillRect(x, y, w, h);
        g.drawImage(slot.layer, lx, ly);
        g.restore();
      }
    }
    this.drawAnims(slot, lx + slot.o, ly + slot.o, now);
    [this.dirty, this.nextDirty] = [this.nextDirty, this.dirty];
  }

  /** Adds the area each running animation can touch (device pixels) to `out`. */
  private animPatches(slot: Slot, ox: number, oy: number, out: number[]): void {
    // Specks fly out to about 1.75 bubble radii.
    const reach = slot.sheet.r * slot.k * 1.85 + 3;
    for (const anim of this.anims) {
      if (!anim.alive || anim.slot !== slot) continue;
      const b = slot.sheet.bubbles[anim.index];
      if (!b) continue;
      const cx = ox + b.x * slot.k;
      const cy = oy + b.y * slot.k;
      out.push(Math.floor(cx - reach), Math.floor(cy - reach), Math.ceil(reach * 2), Math.ceil(reach * 2));
    }
  }

  /** Where a sheet's layer goes on screen (device pixels), slid sideways by `dx` screen points. */
  private layerAt(slot: Slot, dx: number): [number, number] {
    const { rs } = this.screen;
    return [Math.round((slot.left - SHADOW_MARGIN + dx) * rs), Math.round((slot.top - SHADOW_MARGIN) * rs)];
  }

  private transitionMs(): number {
    return this.leaving?.calm ? FADE_MS : SLIDE_MS;
  }

  /** How far right of its place the incoming sheet still is (screen points). */
  private incomingOffset(now: number): number {
    const leaving = this.leaving;
    if (!leaving || leaving.calm) return 0;
    const e = easeInOutCubic(Math.min(1, (now - leaving.at) / SLIDE_MS));
    return (1 - e) * (this.screen.w + 40);
  }

  private makeSlot(sheet: Sheet, settled: boolean): Slot {
    const color = wrapColorById(sheet.color) ?? content.wrapColors[0]!;
    const pal = wrapPalette(color, content.palette);
    const slot = {
      sheet,
      pal,
      ring: mix(pal.bubble, pal.rim, 0.45),
      path: shapePath(content.shapes[sheet.shape] ?? content.shapes.circle!),
      inflateStart: 0,
      delays: null,
      inflateEnd: 0,
      settled,
    } as unknown as Slot;
    this.layout(slot);
    return slot;
  }

  /** Works out where the sheet goes and remakes its pictures at the right size. */
  private layout(slot: Slot): void {
    const { rs } = this.screen;
    const { sheet } = slot;
    slot.place = placeSheet(sheet, this.area);
    slot.left = this.area.x + slot.place.x;
    slot.top = this.area.y + slot.place.y;
    slot.k = slot.place.scale * rs;
    slot.o = SHADOW_MARGIN * rs;
    slot.layer = makeCanvas(
      (sheet.width * slot.place.scale + 2 * SHADOW_MARGIN) * rs,
      (sheet.height * slot.place.scale + 2 * SHADOW_MARGIN) * rs,
    );
    slot.lctx = context2d(slot.layer);
    slot.lctx.setTransform(slot.k, 0, 0, slot.k, slot.o, slot.o);
    slot.sheen = makeSheen(slot.lctx, sheet.width, sheet.height);
    const face = wrapPatternById(sheet.pattern)?.face ?? false;
    slot.sprites = makeBubbleSprites(slot.path, sheet.r * slot.k, sheet.pad * slot.k, slot.pal, this.plum, sheet.seed, face);
    const backdrop = this.g.createLinearGradient(0, 0, 0, this.screen.h * rs);
    backdrop.addColorStop(0, slot.pal.backdrop[0]);
    backdrop.addColorStop(1, slot.pal.backdrop[1]);
    slot.backdrop = backdrop;
    this.paintAll(slot);
  }

  /** Paints the whole sheet into its layer. */
  private paintAll(slot: Slot): void {
    const c = slot.lctx;
    const { sheet, pal, k, o } = slot;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, slot.layer.width, slot.layer.height);
    c.setTransform(k, 0, 0, k, o, o);
    const corner = SHEET_CORNER / slot.place.scale;
    c.save();
    c.shadowColor = rgba(this.plum, 0.16);
    c.shadowBlur = 18 * this.screen.rs;
    c.shadowOffsetY = 6 * this.screen.rs;
    c.fillStyle = pal.sheet;
    roundRectPath(c, 0, 0, sheet.width, sheet.height, corner);
    c.fill();
    c.restore();
    c.fillStyle = slot.sheen;
    roundRectPath(c, 0, 0, sheet.width, sheet.height, corner);
    c.fill();
    c.strokeStyle = rgba(pal.rim, 0.3);
    c.lineWidth = 1.5 / slot.place.scale;
    c.stroke();
    sheet.bubbles.forEach((b, i) => {
      if (b.popped) this.stamp(slot, i, this.flatFor(slot, i));
      else if (slot.settled) this.stamp(slot, i, slot.sprites.full);
    });
  }

  private flatFor(slot: Slot, index: number): HTMLCanvasElement {
    return slot.sprites.flats[mixSeed(slot.sheet.seed, index) % FLAT_VARIANTS]!;
  }

  /** Copies a bubble picture onto the sheet layer at bubble `index`. */
  private stamp(slot: Slot, index: number, picture: HTMLCanvasElement): void {
    const b = slot.sheet.bubbles[index]!;
    const half = slot.sprites.size / 2;
    slot.lctx.setTransform(1, 0, 0, 1, 0, 0);
    slot.lctx.drawImage(picture, Math.round(slot.o + b.x * slot.k - half), Math.round(slot.o + b.y * slot.k - half));
  }

  /** Repaints just one bubble's patch of the sheet (after it pops). */
  private paintCell(slot: Slot, index: number): void {
    const b = slot.sheet.bubbles[index];
    if (!b) return;
    const c = slot.lctx;
    const reach = slot.sheet.r + slot.sheet.pad;
    c.save();
    c.setTransform(slot.k, 0, 0, slot.k, slot.o, slot.o);
    c.beginPath();
    c.arc(b.x, b.y, reach, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = slot.pal.sheet;
    c.fillRect(b.x - reach, b.y - reach, reach * 2, reach * 2);
    c.fillStyle = slot.sheen;
    c.fillRect(b.x - reach, b.y - reach, reach * 2, reach * 2);
    this.stamp(slot, index, b.popped ? this.flatFor(slot, index) : slot.sprites.full);
    c.restore();
  }

  private startAnim(kind: Anim['kind'], slot: Slot, index: number, now: number, calm: boolean): void {
    let anim = this.anims.find((a) => !a.alive);
    if (!anim) {
      if (this.anims.length < 96) {
        anim = { alive: false, kind, slot: null, index: 0, at: 0, calm, dice: new Float32Array(8) };
        this.anims.push(anim);
      } else {
        // Very busy: reuse the oldest one.
        anim = this.anims.reduce((oldest, a) => (a.at < oldest.at ? a : oldest));
      }
    }
    anim.alive = true;
    anim.kind = kind;
    anim.slot = slot;
    anim.index = index;
    anim.at = now;
    anim.calm = calm;
    for (let i = 0; i < anim.dice.length; i += 1) anim.dice[i] = Math.random();
  }

  /** Draws a sheet's layer and whatever is moving on it. `dx` slides it sideways (screen points). */
  private drawSlot(slot: Slot, dx: number, now: number): void {
    const g = this.g;
    const [lx, ly] = this.layerAt(slot, dx);
    g.drawImage(slot.layer, lx, ly);
    const ox = lx + slot.o;
    const oy = ly + slot.o;
    const size = slot.sprites.size;

    if (!slot.settled && slot.delays) {
      const alpha = g.globalAlpha;
      slot.sheet.bubbles.forEach((b, i) => {
        if (b.popped) return;
        const p = Math.min(1, Math.max(0, (now - slot.inflateStart - slot.delays![i]!) / INFLATE_MS));
        const s = 0.5 + 0.5 * easeOutBack(p);
        g.globalAlpha = alpha * (0.35 + 0.65 * Math.min(1, p * 1.6));
        g.drawImage(slot.sprites.full, ox + b.x * slot.k - (size * s) / 2, oy + b.y * slot.k - (size * s) / 2, size * s, size * s);
      });
      g.globalAlpha = alpha;
    }
    this.drawAnims(slot, ox, oy, now);
  }

  /** Draws the running pops and crinkles of a sheet whose bubble (0, 0) is at device pixel (ox, oy). */
  private drawAnims(slot: Slot, ox: number, oy: number, now: number): void {
    for (const anim of this.anims) {
      if (!anim.alive || anim.slot !== slot) continue;
      const b = slot.sheet.bubbles[anim.index];
      if (!b) continue;
      const cx = ox + b.x * slot.k;
      const cy = oy + b.y * slot.k;
      const age = now - anim.at;
      if (age < 0) continue;
      if (anim.kind === 'pop') this.drawPop(anim, slot, cx, cy, age);
      else this.drawCrinkle(anim, slot, cx, cy, age);
    }
  }

  private drawPop(anim: Anim, slot: Slot, cx: number, cy: number, age: number): void {
    const g = this.g;
    const alpha = g.globalAlpha;
    const r = slot.sheet.r * slot.k;
    const size = slot.sprites.size;

    // The bubble squashes down into the flat film already painted beneath it.
    if (age < COLLAPSE_MS) {
      const q = age / COLLAPSE_MS;
      const s = 1 - 0.3 * q;
      const sy = 1 - 0.55 * q;
      g.globalAlpha = alpha * (1 - q);
      g.drawImage(slot.sprites.full, cx - (size * s) / 2, cy - (size * s * sy) / 2 + r * 0.1 * q, size * s, size * s * sy);
    }

    // A soft puff ring in the bubble's own colour.
    const e = easeOutCubic(Math.min(1, age / RING_MS));
    if (e < 1) {
      g.globalAlpha = alpha * 0.6 * (1 - e);
      g.strokeStyle = slot.ring;
      g.lineWidth = r * 0.09 * (1 - 0.5 * e);
      g.beginPath();
      g.arc(cx, cy, r * (anim.calm ? 0.9 + 0.25 * e : 0.75 + 0.6 * e), 0, Math.PI * 2);
      g.stroke();
    }

    // A few specks of plastic. Left out when the player asked for calmer motion.
    if (!anim.calm) {
      const f = Math.min(1, age / POP_MS);
      const out = easeOutCubic(f);
      for (let i = 0; i < 4; i += 1) {
        const angle = (i / 4 + anim.dice[i]! * 0.25) * Math.PI * 2;
        const distance = r * (0.75 + (0.6 + anim.dice[i + 4]!) * 0.55 * out);
        g.globalAlpha = alpha * 0.9 * (1 - f);
        g.fillStyle = i % 2 === 0 ? slot.ring : '#FFFFFF';
        g.beginPath();
        g.arc(cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance, r * 0.09 * (1 - 0.5 * f), 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = alpha;
  }

  /** Light catching the creases of a flat bubble. */
  private drawCrinkle(anim: Anim, slot: Slot, cx: number, cy: number, age: number): void {
    const g = this.g;
    const alpha = g.globalAlpha;
    const r = slot.sheet.r * slot.k;
    const f = age / CRINKLE_MS;
    g.strokeStyle = '#FFFFFF';
    g.lineCap = 'round';
    g.lineWidth = Math.max(1, r * 0.07);
    for (let i = 0; i < 3; i += 1) {
      const angle = anim.dice[i]! * Math.PI * 2;
      const distance = anim.dice[i + 3]! * 0.55 * r;
      const x = cx + Math.cos(angle) * distance;
      const y = cy + Math.sin(angle) * distance;
      const tilt = anim.dice[(i + 6) % 8]! * Math.PI;
      const half = r * 0.14 * (1 + 0.3 * f);
      g.globalAlpha = alpha * 0.85 * (1 - f) * (anim.calm ? 0.6 : 1);
      g.beginPath();
      g.moveTo(x - Math.cos(tilt) * half, y - Math.sin(tilt) * half);
      g.lineTo(x + Math.cos(tilt) * half, y + Math.sin(tilt) * half);
      g.stroke();
    }
    g.globalAlpha = alpha;
  }
}
