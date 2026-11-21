/**
 * The squishy cloud: poke it (it dents and giggles), drag to stretch it (it
 * resists, then wobbles back with a boing), pinch it with two fingers. Its eyes
 * follow your fingers, and it dozes off when left alone.
 */
import { newMood, nextChange, notePoke, noteTouch, updateMood, type Mood } from '../core/cloud/mood';
import { contains, grab, isResting, makeBody, moveGrab, placeBody, poke, release, stepBody, type Body } from '../core/cloud/softbody';
import { makeRng } from '../core/rng';
import { buzz } from '../platform/haptics';
import { CloudView } from '../render/cloudView';
import type { Rect, ScreenSize } from '../render/frame';
import { creakHold, rollBoing, rollCloudPoke, rollGiggle, rollOoh } from '../sound/recipes';
import { playSound, startHold, type Hold } from '../sound/synth';
import type { Finger, Sample, Toy, ToyHost } from './toy';

/** A finger has to move this far (screen points) before a poke becomes a stretch. */
const GRAB_AFTER = 8;
/** Pokes closer together than this count once towards surprises. */
const COUNT_GAP_MS = 150;
const POKE = 320;
const CALM_POKE = 190;

interface FingerState {
  x: number;
  y: number;
  startX: number;
  startY: number;
  onCloud: boolean;
  grabbed: boolean;
}

export class CloudToy implements Toy {
  readonly id = 'cloud' as const;
  private body: Body | null = null;
  private readonly view: CloudView;
  private readonly rng = makeRng((Math.random() * 2 ** 32) >>> 0);
  private mood: Mood;
  private readonly fingers = new Map<number, FingerState>();
  private look = { x: 0, y: 0 };
  private creak: Hold | null = null;
  private lastCount = -Infinity;
  private lastReach = 1;
  private last = 0;

  constructor(
    g: CanvasRenderingContext2D,
    private readonly host: ToyHost,
  ) {
    this.view = new CloudView(g);
    this.mood = newMood(performance.now(), this.rng);
  }

  setFrame(screen: ScreenSize, area: Rect): void {
    this.view.setFrame(screen);
    const size = Math.max(50, Math.min(area.w * 0.34, area.h * 0.3, 190));
    const x = area.x + area.w / 2;
    const y = area.y + area.h * 0.56;
    if (!this.body) this.body = makeBody(x, y, size);
    else placeBody(this.body, x, y, size);
  }

  enter(now: number): void {
    noteTouch(this.mood, now);
  }

  leave(): void {
    for (const id of this.fingers.keys()) if (this.body) release(this.body, id);
    this.fingers.clear();
    this.creak?.stop();
    this.creak = null;
  }

  down(finger: Finger, now: number): void {
    const body = this.body;
    if (!body) return;
    noteTouch(this.mood, now);
    const onCloud = contains(body, finger.x, finger.y, 16);
    this.fingers.set(finger.id, { x: finger.x, y: finger.y, startX: finger.x, startY: finger.y, onCloud, grabbed: false });
    if (onCloud) {
      poke(body, finger.x, finger.y, this.host.calm() ? CALM_POKE : POKE);
      playSound(rollCloudPoke(this.rng));
      buzz(8);
      if (notePoke(this.mood, now)) playSound(rollGiggle(this.rng), 0.05);
      if (now - this.lastCount >= COUNT_GAP_MS) {
        this.lastCount = now;
        this.host.onPop(finger.x, finger.y);
      }
    }
    this.host.wake();
  }

  move(finger: Finger, samples: readonly Sample[], now: number): void {
    const body = this.body;
    const state = this.fingers.get(finger.id);
    if (!body || !state) return;
    const p = samples[samples.length - 1] ?? finger;
    state.x = p.x;
    state.y = p.y;
    noteTouch(this.mood, now);
    if (state.onCloud && !state.grabbed && Math.hypot(p.x - state.startX, p.y - state.startY) > GRAB_AFTER) {
      grab(body, finger.id, state.startX, state.startY);
      state.grabbed = true;
    }
    if (state.grabbed) moveGrab(body, finger.id, p.x, p.y);
    this.host.wake();
  }

  up(finger: Finger): void {
    const body = this.body;
    const state = this.fingers.get(finger.id);
    this.fingers.delete(finger.id);
    if (!body || !state?.grabbed) return;
    release(body, finger.id);
    const stretch = Math.max(body.fit.reach, body.fit.aspect);
    if (stretch > 1.12) {
      playSound(rollBoing(this.rng, stretch));
      buzz(12);
    }
    this.host.wake();
  }

  update(now: number): boolean {
    const body = this.body;
    if (!body) return false;
    const dt = this.last > 0 ? Math.min(0.1, Math.max(0, (now - this.last) / 1000)) : 1 / 60;
    this.last = now;
    stepBody(body, dt, this.host.calm());

    const before = this.mood.expression;
    updateMood(this.mood, now, { ...body.fit, squeezed: this.squeezed() }, this.rng);
    if (this.mood.expression === 'surprised' && before !== 'surprised') playSound(rollOoh(this.rng));

    // The creak follows how fast the stretch changes, and is silent while held still.
    const grabbing = [...this.fingers.values()].some((f) => f.grabbed);
    if (grabbing && dt > 0) {
      const speed = Math.abs(body.fit.reach - this.lastReach) / dt;
      this.creak ??= startHold(creakHold);
      this.creak?.set(Math.min(1, speed * 2.5), 300 + 300 * (body.fit.reach - 1));
    } else if (this.creak) {
      this.creak.stop();
      this.creak = null;
    }
    this.lastReach = body.fit.reach;

    // The eyes look at the newest finger, or ahead when nobody touches.
    let target = { x: 0, y: 0 };
    const newest = [...this.fingers.values()].pop();
    if (newest) {
      const dx = newest.x - body.fit.cx;
      const dy = newest.y - body.fit.cy;
      const length = Math.hypot(dx, dy) / (body.size * 1.5);
      const k = length > 1 ? 1 / length : 1;
      target = { x: (dx / (body.size * 1.5)) * k, y: (dy / (body.size * 1.5)) * k };
    }
    const ease = Math.min(1, dt * 10);
    this.look.x += (target.x - this.look.x) * ease;
    this.look.y += (target.y - this.look.y) * ease;
    const lookMoving = Math.abs(target.x - this.look.x) + Math.abs(target.y - this.look.y) > 0.01;

    const moving = !isResting(body) || this.fingers.size > 0 || lookMoving;
    if (!moving) {
      // Nothing moves: no frames until the face changes by itself (a blink, dozing off).
      const next = nextChange(this.mood, now);
      if (next !== null) this.host.wakeAt(Math.max(16, next - now + 5));
    }
    return moving;
  }

  /** Two fingers holding the cloud and pressing towards each other. */
  private squeezed(): boolean {
    const held = [...this.fingers.values()].filter((f) => f.grabbed);
    if (held.length < 2) return false;
    const [a, b] = held as [FingerState, FingerState];
    const start = Math.hypot(a.startX - b.startX, a.startY - b.startY);
    return Math.hypot(a.x - b.x, a.y - b.y) < start * 0.8;
  }

  draw(): void {
    if (!this.body) return;
    const looks = this.host.looks();
    this.view.draw(this.body, this.mood.expression, this.look, looks.face, looks.hat);
  }
}

