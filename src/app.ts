/**
 * The app around the toys: one full-screen canvas, the bar, the frame loop,
 * screen size and sharpness, quiet pop counting with its surprises, the golden
 * Kumo bubble, saving, the collection and settings, and pausing when hidden.
 */
import { content, cosmeticKeys, faceById, hatById, wandById, type CosmeticKind } from './content';
import { goldenNow, newGoldenClock, notePlay } from './core/progress/golden';
import { choiceOfKind, unlockedOfKind, usableChoices, type SaveState, type Settings, type ToyId } from './core/progress/state';
import { goldenLeft, pickSurprise, surpriseDue, surprisesLeft, unlock } from './core/progress/unlocks';
import { makeRng, pickOne } from './core/rng';
import { s } from './i18n';
import { buzz, setHapticsEnabled } from './platform/haptics';
import { blockBrowserGestures, trackPointers } from './platform/input';
import { Loop } from './platform/loop';
import { prefersCalm } from './platform/motion';
import { onPixelRatioChange, readSafeArea, renderScale } from './platform/screen';
import { askToKeepStorage, eraseGame, saveGame } from './platform/storage';
import { watchForNewerTab } from './platform/tabs';
import type { Rect, ScreenSize } from './render/frame';
import { GoldenBubble, Gifts } from './render/overlays';
import { previewCanvas } from './render/previews';
import { context2d } from './render/wrapArt';
import { pauseAmbience, resumeAmbience, setAmbience } from './sound/ambience';
import { rollGoldenArrive, rollGoldenPop, rollKumoGiggle, rollSurprise } from './sound/recipes';
import { playSound, setEffectsVolume, sleepAudio } from './sound/synth';
import { CloudToy } from './toys/cloudToy';
import { SoapToy } from './toys/soapToy';
import type { Looks, Toy, ToyHost } from './toys/toy';
import { WrapToy } from './toys/wrapToy';
import { makeBar, type Bar } from './ui/bar';
import { openCollection } from './ui/collection';
import { anySheetOpen } from './ui/dom';
import { showOtherTab, showSaveTooNew } from './ui/notices';
import { openSettings } from './ui/settings';

/** Space between the toy and the screen edges / the bar, in screen points. */
const EDGE = 14;
const ABOVE_BAR = 12;
/** Saves wait this long after the last change (pops come fast), and always happen when the tab is hidden. */
const SAVE_AFTER_MS = 1500;

export interface Loaded {
  state: SaveState;
  rev: number;
  /** False when the save came from a newer version: play, but do not overwrite it. */
  canSave: boolean;
}

export class App {
  private readonly g: CanvasRenderingContext2D;
  private readonly loop: Loop;
  private readonly toys = new Map<ToyId, Toy>();
  private toy: Toy;
  private readonly bar: Bar;
  private readonly fingers: { count(): number };
  private readonly host: ToyHost;
  private screen: ScreenSize = { w: 1, h: 1, rs: 1 };
  private area: Rect = { x: 0, y: 0, w: 1, h: 1 };
  private quality = 1;

  private readonly state: SaveState;
  private rev: number;
  private saving: boolean;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private askedToKeep = false;

  private readonly rng = makeRng((Math.random() * 2 ** 32) >>> 0);
  private readonly golden = new GoldenBubble();
  private readonly gifts = new Gifts();
  private readonly goldenClock = newGoldenClock();
  private lastTouch = 0;
  private lastSurprise = Number.NEGATIVE_INFINITY;
  private overlaysLastFrame = false;
  /** Fingers that popped the golden bubble: the toy never hears about them. */
  private readonly taken = new Set<number>();
  private wakeTimer: ReturnType<typeof setTimeout> | undefined;
  private looksCache: Looks | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    barRoot: HTMLElement,
    loaded: Loaded,
  ) {
    this.state = loaded.state;
    this.rev = loaded.rev;
    this.saving = loaded.canSave;
    // An opaque canvas is quicker for the browser to put on screen.
    this.g = canvas.getContext('2d', { alpha: false }) ?? context2d(canvas);
    this.loop = new Loop(
      (now) => this.frame(now),
      () => this.lowerQuality(),
    );
    this.host = {
      calm: () => this.state.settings.calm || prefersCalm(),
      wake: () => this.loop.wake(),
      wakeAt: (ms) => {
        if (this.wakeTimer !== undefined) clearTimeout(this.wakeTimer);
        this.wakeTimer = setTimeout(() => this.loop.wake(), ms);
      },
      onPop: (x, y) => this.counted(x, y),
      looks: () => this.looks(),
    };
    this.toy = this.toyFor(this.state.settings.toy);

    this.fingers = trackPointers(canvas, {
      down: (finger, now) => {
        this.notePlay(now);
        if (this.golden.hit(finger.x, finger.y)) {
          this.taken.add(finger.id);
          this.popGolden(now);
          return;
        }
        this.toy.down(finger, now);
        this.loop.wake();
      },
      move: (finger, samples, now) => {
        if (!this.taken.has(finger.id)) this.toy.move(finger, samples, now);
      },
      up: (finger, now) => {
        if (!this.taken.delete(finger.id)) this.toy.up(finger, now);
      },
    });

    this.bar = makeBar(barRoot, {
      current: this.toy.id,
      isBusy: () => this.fingers.count() > 0 || anySheetOpen(),
      onPick: (id) => this.open(id),
      onRefresh: () => {
        this.toy.refresh?.(performance.now());
        this.loop.wake();
      },
      onCollection: () => this.showCollection(),
      onSettings: () => this.showSettings(),
    });
    this.bar.setFresh(this.state.fresh.length > 0);
    if (!loaded.canSave) showSaveTooNew();
  }

  start(): void {
    blockBrowserGestures(this.canvas);
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', s.stage[this.toy.id]);
    this.applySettings();

    new ResizeObserver(() => this.resize()).observe(this.canvas);
    window.addEventListener('resize', () => this.resize());
    onPixelRatioChange(() => this.resize());

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.saveNow();
        this.loop.pause();
        pauseAmbience();
        sleepAudio();
      } else {
        resumeAmbience();
        this.redrawAll();
        this.loop.resume();
      }
    });
    // Closing the tab or switching apps: save straight away.
    window.addEventListener('pagehide', () => this.saveNow());
    // Coming back from the browser's back/forward cache.
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) this.resize();
    });
    // Some browsers throw away a hidden canvas's pixels; draw it all again when they give it back.
    this.canvas.addEventListener('contextrestored', () => this.redrawAll());

    // Two tabs would overwrite each other's saves: the older one steps back.
    watchForNewerTab(() => {
      this.saveNow();
      this.saving = false;
      showOtherTab();
    });

    this.toy.enter?.(performance.now());
    this.resize();
  }

  /**
   * Helpers for trying things out during development (only in `npm run dev`; see README):
   * in the browser console, bubblePop.golden() sends the golden bubble by, and
   * bubblePop.surprise() finds a new cosmetic straight away.
   */
  devTools(): { golden(): void; surprise(): void; state(): SaveState } {
    return {
      golden: () => {
        this.golden.spawn(this.area, performance.now(), content.unlocks.golden.floatSeconds, true, 0.3);
        playSound(rollGoldenArrive());
        this.loop.wake();
      },
      surprise: () => {
        const key = pickSurprise(surprisesLeft(this.state, content.unlocks, cosmeticKeys), this.toy.id, this.rng);
        if (key) this.give(key, { x: this.area.x + this.area.w / 2, y: this.area.y + this.area.h * 0.6 }, performance.now());
      },
      state: () => this.state,
    };
  }

  /** Draws everything again on the next frame (pictures finished loading, the tab came back…). */
  redrawAll(): void {
    this.toy.invalidate?.();
    this.loop.wake();
  }

  /** Saves now (when the tab is hidden or closing). */
  saveNow(): void {
    if (this.saveTimer !== undefined) clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    if (!this.saving) return;
    this.rev += 1;
    saveGame(this.state, this.rev);
    if (!this.askedToKeep) {
      this.askedToKeep = true;
      void askToKeepStorage();
    }
  }

  private scheduleSave(): void {
    if (!this.saving) return;
    if (this.saveTimer !== undefined) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), SAVE_AFTER_MS);
  }

  private toyFor(id: ToyId): Toy {
    let toy = this.toys.get(id);
    if (!toy) {
      toy = id === 'soap' ? new SoapToy(this.g, this.host) : id === 'cloud' ? new CloudToy(this.g, this.host) : new WrapToy(this.g, this.host);
      this.toys.set(id, toy);
    }
    return toy;
  }

  private open(id: ToyId): void {
    if (id === this.toy.id) return;
    const now = performance.now();
    this.toy.leave?.(now);
    this.toy = this.toyFor(id);
    this.bar.setCurrent(id);
    this.canvas.setAttribute('aria-label', s.stage[id]);
    this.state.settings.toy = id;
    this.scheduleSave();
    this.toy.enter?.(now);
    this.resize();
  }

  private looks(): Looks {
    if (this.looksCache) return this.looksCache;
    const usable = usableChoices(this.state, new Set(cosmeticKeys));
    this.looksCache = {
      wand: wandById(usable.wand) ?? content.wands[0]!,
      face: faceById(usable.face) ?? content.faces[0]!,
      hat: hatById(usable.hat) ?? content.hats[0]!,
      wrapColors: usable.wrapColor ? [usable.wrapColor] : unlockedOfKind(this.state, 'wrap-color', cosmeticKeys),
      wrapPatterns: usable.wrapPattern ? [usable.wrapPattern] : unlockedOfKind(this.state, 'wrap-pattern', cosmeticKeys),
    };
    return this.looksCache;
  }

  private applySettings(): void {
    const settings = this.state.settings;
    setEffectsVolume(settings.sound);
    setHapticsEnabled(settings.haptics);
    setAmbience(settings.ambience, settings.ambienceVolume);
    document.documentElement.classList.toggle('calm', settings.calm);
  }

  // ─── Counting, surprises and the golden bubble ──────────────────────────

  /** Counts play time on every touch, and now and then sends the golden bubble by. */
  private notePlay(now: number): void {
    const added = notePlay(this.goldenClock, (now - this.lastTouch) / 1000);
    this.lastTouch = now;
    const rules = content.unlocks;
    const allFound = goldenLeft(this.state, rules, cosmeticKeys).length === 0;
    if (!this.golden.active && goldenNow(this.goldenClock, rules.golden, added, this.rng(), allFound)) {
      this.golden.spawn(this.area, now, rules.golden.floatSeconds, this.rng() < 0.5, this.rng());
      playSound(rollGoldenArrive());
      this.loop.wake();
    }
  }

  /** A pop (or poke) at (x, y). Counted quietly; sometimes it brings a surprise. */
  private counted(x: number, y: number): void {
    const now = performance.now();
    this.state.pops += 1;
    this.scheduleSave();
    const rules = content.unlocks;
    if (now - this.lastSurprise < rules.surpriseGap * 1000 || this.gifts.active) return;
    if (!surpriseDue(this.state, rules, cosmeticKeys)) return;
    const key = pickSurprise(surprisesLeft(this.state, rules, cosmeticKeys), this.toy.id, this.rng);
    if (!key) return;
    this.lastSurprise = now;
    this.give(key, { x, y }, now);
  }

  private popGolden(now: number): void {
    this.golden.pop(now);
    playSound(rollGoldenPop());
    playSound(rollKumoGiggle(), 0.25);
    buzz(20);
    this.state.pops += 1;
    const left = goldenLeft(this.state, content.unlocks, cosmeticKeys);
    if (left.length > 0) this.give(pickOne(this.rng, left), { x: this.golden.x, y: this.golden.y }, now);
    else this.scheduleSave();
    this.loop.wake();
  }

  /** Adds a cosmetic to the collection and sends it there in a little bubble. */
  private give(key: string, from: { x: number; y: number }, now: number): void {
    if (!unlock(this.state, key)) return;
    this.looksCache = null;
    this.saveNow();
    playSound(rollSurprise(this.rng), 0.1);
    this.gifts.add(previewCanvas(key, 48, this.screen.rs), from, this.bar.collectionCenter(), now, () => this.bar.setFresh(this.state.fresh.length > 0));
    this.loop.wake();
  }

  // ─── Collection and settings ────────────────────────────────────────────

  private showCollection(): void {
    openCollection({
      state: () => this.state,
      startTab: this.toy.id,
      rs: this.screen.rs,
      onChoose: (kind: CosmeticKind, id: string | null) => {
        const choice = choiceOfKind(kind);
        if (choice === 'wrapColor' || choice === 'wrapPattern') this.state.chosen[choice] = id;
        else if (id !== null) this.state.chosen[choice] = id;
        this.looksCache = null;
        this.scheduleSave();
      },
      onSeen: (keys) => {
        this.state.fresh = this.state.fresh.filter((key) => !keys.includes(key));
        this.bar.setFresh(this.state.fresh.length > 0);
        this.scheduleSave();
      },
      onClose: () => {
        const now = performance.now();
        for (const toy of this.toys.values()) toy.looksChanged?.(now);
        this.redrawAll();
      },
    });
  }

  private showSettings(): void {
    openSettings({
      state: () => this.state,
      canVibrate: typeof navigator.vibrate === 'function',
      onChange: (patch: Partial<Settings>) => {
        Object.assign(this.state.settings, patch);
        this.applySettings();
        this.scheduleSave();
        if (patch.calm !== undefined) this.redrawAll();
      },
      onReset: () => {
        this.saving = false;
        if (this.saveTimer !== undefined) clearTimeout(this.saveTimer);
        void eraseGame().finally(() => location.reload());
      },
    });
  }

  // ─── Frames and screen ──────────────────────────────────────────────────

  private frame(now: number): boolean {
    const toyMoving = this.toy.update(now);
    this.golden.update(now, this.screen.w);
    this.gifts.update(now);
    const overlays = this.golden.active || this.gifts.active;
    // Overlays float across the toy, so the toy draws its whole picture under them (and once after).
    if (overlays || this.overlaysLastFrame) this.toy.invalidate?.();
    this.toy.draw(now);
    const calm = this.host.calm();
    this.golden.draw(this.g, this.screen.rs, now, calm);
    this.gifts.draw(this.g, this.screen.rs, now, calm);
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.overlaysLastFrame = overlays;
    return toyMoving || overlays;
  }

  /** Sizes the canvas to the screen and tells the toy where it may draw. */
  private resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const rs = renderScale(this.quality);
    const pixelW = Math.round(w * rs);
    const pixelH = Math.round(h * rs);
    if (this.canvas.width !== pixelW) this.canvas.width = pixelW;
    if (this.canvas.height !== pixelH) this.canvas.height = pixelH;
    this.screen = { w, h, rs };

    const safe = readSafeArea();
    const top = safe.top + EDGE;
    const left = safe.left + EDGE;
    const barTop = Math.min(h, this.bar.top() || h);
    this.area = {
      x: left,
      y: top,
      w: Math.max(40, w - left - safe.right - EDGE),
      h: Math.max(40, barTop - ABOVE_BAR - top),
    };
    const now = performance.now();
    this.toy.setFrame(this.screen, this.area, now);
    this.toy.invalidate?.();
    // Draw straight away, so a resized (and therefore cleared) canvas never shows blank.
    if (this.frame(now)) this.loop.wake();
  }

  /** Frames are slow: draw with fewer pixels (2× → 1.5×). Happens at most once. */
  private lowerQuality(): void {
    if (this.quality < 1 || renderScale(1) <= 1.5) return;
    this.quality = 0.75;
    this.resize();
  }
}
