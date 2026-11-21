/**
 * Fingers and the mouse. Every finger is tracked on its own, and the browser's
 * own touch habits (scrolling, bouncing, pull-to-refresh, zooming, text
 * selection, long-press menus, dragging pictures) are switched off, because
 * this toy gets mashed by many fingers at once.
 */
import type { Finger, Sample } from '../toys/toy';

export interface PointerHandlers {
  down(finger: Finger, now: number): void;
  move(finger: Finger, samples: readonly Sample[], now: number): void;
  up(finger: Finger, now: number): void;
}

/** CSS does most of this (see styles.css); these catch what CSS cannot, mainly on iPhone. */
export function blockBrowserGestures(stage: HTMLElement): void {
  const stop = (event: Event) => {
    if (event.cancelable) event.preventDefault();
  };
  // Stops iPhone's double-tap zoom, magnifier and long-press callout on the toy. Pointer events still arrive.
  stage.addEventListener('touchstart', stop, { passive: false });
  // No scrolling, bouncing or pull-to-refresh anywhere, except inside a sheet that scrolls (the collection).
  document.addEventListener(
    'touchmove',
    (event) => {
      if (event.target instanceof Element && event.target.closest('.scrolls, .slider')) return;
      stop(event);
    },
    { passive: false },
  );
  // iPhone pinch-zoom (Safari ignores user-scalable=no).
  for (const name of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(name, stop);
  for (const name of ['dblclick', 'contextmenu', 'selectstart', 'dragstart']) document.addEventListener(name, stop);
  // Pinch-zoom on a computer trackpad arrives as a wheel event with Ctrl held.
  window.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey) event.preventDefault();
    },
    { passive: false },
  );
}

/** Follows every finger on `stage`. Returns how many are down right now. */
export function trackPointers(stage: HTMLElement, handlers: PointerHandlers): { count(): number } {
  const active = new Set<number>();
  const samples: Sample[] = [];
  const finger = (event: PointerEvent): Finger => ({
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    kind: event.pointerType === 'mouse' ? 'mouse' : event.pointerType === 'pen' ? 'pen' : 'touch',
  });

  stage.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    active.add(event.pointerId);
    try {
      stage.setPointerCapture(event.pointerId);
    } catch {
      // Already gone; the up event will tidy up.
    }
    handlers.down(finger(event), performance.now());
  });

  stage.addEventListener('pointermove', (event) => {
    if (!active.has(event.pointerId)) return;
    samples.length = 0;
    // A fast finger moves a long way between events; the in-between points keep swipes accurate.
    const between = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
    if (between.length > 0) for (const e of between) samples.push({ x: e.clientX, y: e.clientY });
    else samples.push({ x: event.clientX, y: event.clientY });
    handlers.move(finger(event), samples, performance.now());
  });

  const end = (event: PointerEvent) => {
    if (!active.delete(event.pointerId)) return;
    handlers.up(finger(event), performance.now());
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('lostpointercapture', end);

  return { count: () => active.size };
}
