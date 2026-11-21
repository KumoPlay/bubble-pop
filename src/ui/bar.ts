/**
 * The bar at the bottom: the collection, the three toys, and settings. Tapping
 * the open toy's button again asks it for a fresh start (a new sheet of bubble wrap).
 */
import { s } from '../i18n';
import { TOY_IDS, type ToyId } from '../toys/toy';
import { el } from './dom';
import { icons } from './icons';

export interface BarOptions {
  current: ToyId;
  onPick(id: ToyId): void;
  onRefresh(id: ToyId): void;
  onCollection(): void;
  onSettings(): void;
  /** True while fingers are on the toy: taps on the bar are then ignored, so mashing never switches toys. */
  isBusy(): boolean;
}

export interface Bar {
  setCurrent(id: ToyId): void;
  /** Shows a little dot on the collection button when something new is waiting there. */
  setFresh(fresh: boolean): void;
  /** Top edge of the bar, in screen points. */
  top(): number;
  /** The middle of the collection button, where gift bubbles fly to. */
  collectionCenter(): { x: number; y: number };
}

export function makeBar(root: HTMLElement, options: BarOptions): Bar {
  root.setAttribute('aria-label', s.toysLabel);
  root.replaceChildren();
  let current = options.current;
  const guarded = (action: () => void) => () => {
    if (!options.isBusy()) action();
  };

  const collection = el('button', { class: 'bar-button bar-side', html: icons.collection, attrs: { type: 'button', 'aria-label': s.bar.collection } }, [
    el('span', { class: 'dot', attrs: { 'aria-hidden': 'true' } }),
  ]);
  collection.addEventListener('click', guarded(options.onCollection));
  root.append(collection);

  const toys = new Map<ToyId, HTMLButtonElement>();
  for (const id of TOY_IDS) {
    const button = el('button', { class: 'bar-button bar-toy', html: icons[id], attrs: { type: 'button', 'aria-label': s.toys[id] } });
    button.addEventListener(
      'click',
      guarded(() => (id === current ? options.onRefresh(id) : options.onPick(id))),
    );
    toys.set(id, button);
    root.append(button);
  }

  const settings = el('button', { class: 'bar-button bar-side', html: icons.settings, attrs: { type: 'button', 'aria-label': s.bar.settings } });
  settings.addEventListener('click', guarded(options.onSettings));
  root.append(settings);

  const setCurrent = (id: ToyId) => {
    current = id;
    for (const [toy, button] of toys) {
      button.classList.toggle('is-current', toy === id);
      button.setAttribute('aria-pressed', String(toy === id));
    }
  };
  setCurrent(current);

  return {
    setCurrent,
    setFresh(fresh) {
      collection.classList.toggle('has-new', fresh);
      collection.setAttribute('aria-label', fresh ? s.bar.collectionNew : s.bar.collection);
    },
    top: () => root.getBoundingClientRect().top,
    collectionCenter() {
      const box = collection.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    },
  };
}
