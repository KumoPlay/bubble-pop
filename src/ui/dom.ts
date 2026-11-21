/**
 * A few small building blocks for the screens (plain DOM, no framework): an
 * element helper, a sheet that slides up, a slider, a switch and a
 * hold-to-confirm button. All of them work with fingers, a mouse and a keyboard.
 */
import { s } from '../i18n';
import { icons } from './icons';

type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; text?: string; html?: string; attrs?: Record<string, string> } = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.html !== undefined) node.innerHTML = props.html;
  for (const [name, value] of Object.entries(props.attrs ?? {})) node.setAttribute(name, value);
  for (const child of children) if (child) node.append(child);
  return node;
}

export function iconButton(icon: string, label: string, onClick: () => void, className = 'icon-button'): HTMLButtonElement {
  const button = el('button', { class: className, html: icon, attrs: { type: 'button', 'aria-label': label } });
  button.addEventListener('click', onClick);
  return button;
}

export interface SheetHandle {
  panel: HTMLElement;
  head: HTMLElement;
  body: HTMLElement;
  close(): void;
}

const openSheets: SheetHandle[] = [];

/** Opens a sheet over the toy. It closes with its × button, a tap outside it, or Escape. */
export function openSheet(options: { label: string; className?: string; onClose?: () => void; closable?: boolean }): SheetHandle {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const closable = options.closable !== false;
  const head = el('div', { class: 'sheet-head' });
  const body = el('div', { class: 'sheet-body scrolls' });
  const panel = el('section', {
    class: `sheet ${options.className ?? ''}`,
    attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': options.label, tabindex: '-1' },
  }, [head, body]);
  const overlay = el('div', { class: 'overlay' }, [panel]);
  let closed = false;
  const handle: SheetHandle = {
    panel,
    head,
    body,
    close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.classList.remove('is-open');
      overlay.classList.add('is-closing');
      setTimeout(() => overlay.remove(), 220);
      openSheets.splice(openSheets.indexOf(handle), 1);
      previousFocus?.focus({ preventScroll: true });
      options.onClose?.();
    },
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && closable && openSheets[openSheets.length - 1] === handle) {
      event.preventDefault();
      handle.close();
    }
  };
  if (closable) {
    head.append(iconButton(icons.close, s.close, () => handle.close(), 'icon-button sheet-close'));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) handle.close();
    });
  }
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  openSheets.push(handle);
  requestAnimationFrame(() => {
    overlay.classList.add('is-open');
    panel.focus({ preventScroll: true });
  });
  return handle;
}

export function anySheetOpen(): boolean {
  return openSheets.length > 0;
}

/** A slider from 0 to 1, made from pointer events so it behaves the same everywhere. */
export function slider(label: string, value: number, onChange: (value: number) => void): HTMLElement {
  const fill = el('div', { class: 'slider-fill' });
  const thumb = el('div', { class: 'slider-thumb' });
  const track = el('div', { class: 'slider-track' }, [fill, thumb]);
  const root = el('div', {
    class: 'slider',
    attrs: { role: 'slider', tabindex: '0', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '100' },
  }, [track]);
  let current = value;
  const show = () => {
    const percent = `${Math.round(current * 100)}%`;
    fill.style.width = percent;
    thumb.style.left = percent;
    root.setAttribute('aria-valuenow', String(Math.round(current * 100)));
  };
  const set = (next: number) => {
    const clamped = Math.min(1, Math.max(0, next));
    if (clamped === current) return;
    current = clamped;
    show();
    onChange(current);
  };
  const fromPointer = (event: PointerEvent) => {
    const box = track.getBoundingClientRect();
    set((event.clientX - box.left) / Math.max(1, box.width));
  };
  root.addEventListener('pointerdown', (event) => {
    root.setPointerCapture(event.pointerId);
    fromPointer(event);
  });
  root.addEventListener('pointermove', (event) => {
    if (root.hasPointerCapture(event.pointerId)) fromPointer(event);
  });
  root.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 0.05, ArrowUp: 0.05, ArrowLeft: -0.05, ArrowDown: -0.05 }[event.key];
    if (step !== undefined) set(current + step);
    else if (event.key === 'Home') set(0);
    else if (event.key === 'End') set(1);
    else return;
    event.preventDefault();
  });
  show();
  return root;
}

/** An on/off switch. */
export function toggle(label: string, on: boolean, onChange: (on: boolean) => void): HTMLButtonElement {
  const button = el('button', { class: 'toggle', attrs: { type: 'button', role: 'switch', 'aria-label': label } }, [
    el('span', { class: 'toggle-knob' }),
  ]);
  let state = on;
  const show = () => button.setAttribute('aria-checked', String(state));
  button.addEventListener('click', () => {
    state = !state;
    show();
    onChange(state);
  });
  show();
  return button;
}

/**
 * A button that has to be held for `ms` (it fills up while held), so a child
 * mashing the screen can never press it by accident. Space or Enter held works too.
 */
export function holdButton(label: string, ms: number, onDone: () => void, className = 'button hold-button'): HTMLButtonElement {
  const fill = el('span', { class: 'hold-fill' });
  const button = el('button', { class: className, attrs: { type: 'button' } }, [fill, el('span', { class: 'hold-label', text: label })]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const start = () => {
    if (timer !== undefined) return;
    fill.style.transitionDuration = `${ms}ms`;
    button.classList.add('is-holding');
    timer = setTimeout(() => {
      timer = undefined;
      button.classList.remove('is-holding');
      onDone();
    }, ms);
  };
  const stop = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    fill.style.transitionDuration = '150ms';
    button.classList.remove('is-holding');
  };
  button.addEventListener('pointerdown', start);
  for (const name of ['pointerup', 'pointerleave', 'pointercancel']) button.addEventListener(name, stop);
  button.addEventListener('keydown', (event) => {
    if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
      event.preventDefault();
      start();
    }
  });
  button.addEventListener('keyup', stop);
  button.addEventListener('blur', stop);
  return button;
}
