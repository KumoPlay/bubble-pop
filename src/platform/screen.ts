/** Screen size, sharpness and the safe areas around notches and rounded corners. */

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

let probe: HTMLElement | null = null;

/** The safe-area insets, read from CSS env() (the only place browsers report them). */
export function readSafeArea(): Insets {
  if (!probe) {
    probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText =
      'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
    document.body.appendChild(probe);
  }
  const style = getComputedStyle(probe);
  const px = (value: string) => Number.parseFloat(value) || 0;
  return {
    top: px(style.paddingTop),
    right: px(style.paddingRight),
    bottom: px(style.paddingBottom),
    left: px(style.paddingLeft),
  };
}

/**
 * Device pixels per screen point. Capped at 2: on 3× phones soft shapes look the same
 * and it is less than half the work. `quality` drops below 1 on phones that cannot keep up.
 */
export function renderScale(quality: number): number {
  return Math.min(window.devicePixelRatio || 1, 2) * quality;
}

/** Calls `listener` when the window moves to a screen with a different pixel density. */
export function onPixelRatioChange(listener: () => void): void {
  const watch = () => {
    const query = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    query.addEventListener('change', () => {
      listener();
      watch();
    }, { once: true });
  };
  if (typeof matchMedia === 'function') watch();
}
