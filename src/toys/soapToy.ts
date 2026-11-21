/**
 * Soap bubbles: press and hold to blow bubbles from a wand; sweep the wand to
 * send them drifting that way. Any other touch pops them.
 */
import { between, makeRng } from '../core/rng';
import {
  blowBubble,
  bubbleAt,
  bubblesAlong,
  makeWorld,
  pushBreeze,
  removeBubble,
  stepWorld,
  type SoapBubble,
  type SoapWorld,
} from '../core/soap/world';
import { buzz } from '../platform/haptics';
import type { Rect, ScreenSize } from '../render/frame';
import { SoapView, WAND_RING, type WandDraw } from '../render/soapView';
import { blowHold, rollSoapBlip, rollSoapMerge, rollSoapPop } from '../sound/recipes';
import { playSound, startHold, type Hold } from '../sound/synth';
import type { Finger, Sample, Toy, ToyHost } from './toy';

/** The wand's ring sits this far above a fingertip, so the finger does not hide it. */
const LIFT = 62;
/** Bubbles blown per second while holding still, and the most when sweeping fast. */
const BLOW_RATE = 2.2;
const BLOW_RATE_MOST = 8;
const WAND_FADE_MS = 250;

interface WandState {
  pointer: number;
  lift: number;
  /** The ring's middle. */
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  since: number;
  endedAt: number | null;
  owed: number;
  lastBlip: number;
}

export class SoapToy implements Toy {
  readonly id = 'soap' as const;
  private readonly world: SoapWorld = makeWorld({ x: 0, y: 0, w: 1, h: 1 });
  private readonly view: SoapView;
  private readonly rng = makeRng((Math.random() * 2 ** 32) >>> 0);
  private wand: WandState | null = null;
  private readonly fingers = new Map<number, { x: number; y: number }>();
  private hold: Hold | null = null;
  private last = 0;

  constructor(
    g: CanvasRenderingContext2D,
    private readonly host: ToyHost,
  ) {
    this.view = new SoapView(g);
  }

  setFrame(screen: ScreenSize, _area: Rect): void {
    this.world.box = { x: 0, y: 0, w: screen.w, h: screen.h };
    this.view.setFrame(screen);
  }

  leave(now: number): void {
    this.endWand(now);
    this.fingers.clear();
  }

  down(finger: Finger, now: number): void {
    const hit = bubbleAt(this.world, finger.x, finger.y);
    if (hit) {
      this.popByFinger(hit, now);
      this.fingers.set(finger.id, { x: finger.x, y: finger.y });
      return;
    }
    if (this.wand && this.wand.endedAt === null) {
      // Someone is already blowing: this finger just pops.
      this.fingers.set(finger.id, { x: finger.x, y: finger.y });
      return;
    }
    const lift = finger.kind === 'mouse' ? 0 : LIFT;
    const x = finger.x;
    const y = finger.y - lift;
    this.wand = { pointer: finger.id, lift, x, y, prevX: x, prevY: y, vx: 0, vy: 0, since: now, endedAt: null, owed: 0.6, lastBlip: 0 };
    this.host.wake();
  }

  move(finger: Finger, samples: readonly Sample[], now: number): void {
    const wand = this.wand;
    if (wand && wand.pointer === finger.id && wand.endedAt === null) {
      wand.x = finger.x;
      wand.y = finger.y - wand.lift;
      return;
    }
    const state = this.fingers.get(finger.id);
    if (!state) return;
    for (const sample of samples) {
      for (const b of bubblesAlong(this.world, state.x, state.y, sample.x, sample.y)) this.popByFinger(b, now);
      state.x = sample.x;
      state.y = sample.y;
    }
  }

  up(finger: Finger, now: number): void {
    if (this.wand?.pointer === finger.id) this.endWand(now);
    this.fingers.delete(finger.id);
  }

  update(now: number): boolean {
    const dt = this.last > 0 ? Math.min(0.05, Math.max(0, (now - this.last) / 1000)) : 1 / 60;
    this.last = now;
    const calm = this.host.calm();
    this.view.setWand(this.host.looks().wand);

    const wand = this.wand;
    if (wand && wand.endedAt === null && dt > 0) {
      const k = Math.min(1, dt * 12);
      wand.vx += ((wand.x - wand.prevX) / dt - wand.vx) * k;
      wand.vy += ((wand.y - wand.prevY) / dt - wand.vy) * k;
      wand.prevX = wand.x;
      wand.prevY = wand.y;
      const speed = Math.hypot(wand.vx, wand.vy);
      // Sweeping the wand sets the breeze.
      if (speed > 30) pushBreeze(this.world, wand.vx * 0.55, wand.vy * 0.55, dt);
      wand.owed += (BLOW_RATE + Math.min(BLOW_RATE_MOST - BLOW_RATE, speed / 45)) * dt;
      while (wand.owed >= 1) {
        wand.owed -= 1;
        this.blow(wand, speed, now);
      }
      this.hold ??= startHold(blowHold);
      this.hold?.set(0.35 + 0.65 * Math.min(1, speed / 500), 800 + Math.min(900, speed));
    }

    for (const event of stepWorld(this.world, dt, calm)) {
      if (event.kind === 'pop') {
        playSound(rollSoapPop(this.rng, event.bubble.r));
        this.view.popped(event.bubble, now, calm);
      } else if (event.kind === 'merge') {
        playSound(rollSoapMerge(this.rng, event.size));
      }
    }

    const wandShowing = wand !== null && (wand.endedAt === null || now - wand.endedAt < WAND_FADE_MS);
    if (wand && !wandShowing) this.wand = null;
    return this.world.bubbles.length > 0 || wandShowing || this.view.animating(now);
  }

  draw(now: number): void {
    const wand = this.wand;
    let drawWand: WandDraw | null = null;
    if (wand) {
      const alpha = wand.endedAt === null ? Math.min(1, (now - wand.since) / 120) : Math.max(0, 1 - (now - wand.endedAt) / WAND_FADE_MS);
      drawWand = {
        wand: this.host.looks().wand,
        x: wand.x,
        y: wand.y,
        tilt: Math.max(-0.45, Math.min(0.45, -wand.vx * 0.0015)),
        alpha,
        film: wand.endedAt === null ? 1 : 0,
      };
    }
    this.view.draw(this.world, drawWand, now, this.host.calm());
  }

  private blow(wand: WandState, speed: number, now: number): void {
    const r = speed > 120 ? between(this.rng, 8, 18) : between(this.rng, 14, 30);
    const spread = WAND_RING * 0.3;
    const { popped } = blowBubble(
      this.world,
      wand.x + between(this.rng, -spread, spread),
      wand.y + between(this.rng, -spread, spread),
      wand.vx * 0.5 + between(this.rng, -25, 25),
      wand.vy * 0.5 - 35 + between(this.rng, -20, 20),
      r,
      this.rng,
    );
    if (popped) {
      playSound(rollSoapPop(this.rng, popped.r));
      this.view.popped(popped, now, this.host.calm());
    }
    if (now - wand.lastBlip > 110) {
      wand.lastBlip = now;
      playSound(rollSoapBlip(this.rng));
    }
  }

  private popByFinger(b: SoapBubble, now: number): void {
    if (!removeBubble(this.world, b)) return;
    playSound(rollSoapPop(this.rng, b.r));
    buzz(6);
    this.view.popped(b, now, this.host.calm());
    this.host.onPop(b.x, b.y);
    this.host.wake();
  }

  private endWand(now: number): void {
    if (this.wand && this.wand.endedAt === null) this.wand.endedAt = now;
    this.hold?.stop();
    this.hold = null;
    this.host.wake();
  }
}
