/**
 * The collection: every cosmetic, grouped by toy. Found ones can be chosen;
 * ones not found yet are soft cloud shapes. There are no numbers and no counts.
 */
import { content, cosmeticKeys, splitKey, type CosmeticKind } from '../content';
import { choiceOfKind, usableChoices, type SaveState, type ToyId } from '../core/progress/state';
import { nameOf, s } from '../i18n';
import { previewCanvas } from '../render/previews';
import { TOY_IDS } from '../toys/toy';
import { el, openSheet } from './dom';
import { icons } from './icons';

const TAB_KINDS: Record<ToyId, CosmeticKind[]> = {
  wrap: ['wrap-color', 'wrap-pattern'],
  soap: ['wand'],
  cloud: ['face', 'hat'],
};
const CARD = 64;

export interface CollectionOptions {
  state(): SaveState;
  startTab: ToyId;
  rs: number;
  /** A cosmetic was chosen. For bubble wrap, null means "mix them all". */
  onChoose(kind: CosmeticKind, id: string | null): void;
  /** These new cosmetics have now been seen (their dots can go). */
  onSeen(keys: string[]): void;
  onClose(): void;
}

export function openCollection(options: CollectionOptions): void {
  let tab = options.startTab;
  const seen = new Set<string>();
  const sheet = openSheet({
    label: s.collection.title,
    className: 'collection',
    onClose: () => {
      if (seen.size > 0) options.onSeen([...seen]);
      options.onClose();
    },
  });

  const tabs = el('div', { class: 'tabs', attrs: { role: 'tablist', 'aria-label': s.toysLabel } });
  const tabButtons = new Map<ToyId, HTMLButtonElement>();
  for (const id of TOY_IDS) {
    const button = el('button', { class: 'tab', html: icons[id], attrs: { type: 'button', role: 'tab', 'aria-label': s.toys[id] } }, [
      el('span', { class: 'dot', attrs: { 'aria-hidden': 'true' } }),
    ]);
    button.addEventListener('click', () => {
      tab = id;
      render();
    });
    tabButtons.set(id, button);
    tabs.append(button);
  }
  sheet.head.prepend(tabs);

  const render = () => {
    const state = options.state();
    const chosen = usableChoices(state, new Set(cosmeticKeys));
    for (const [id, button] of tabButtons) {
      button.setAttribute('aria-selected', String(id === tab));
      const fresh = state.fresh.some((key) => TAB_KINDS[id].some((kind) => key.startsWith(`${kind}/`)) && !seen.has(key));
      button.classList.toggle('has-new', fresh && id !== tab);
    }
    const sections = TAB_KINDS[tab].map((kind) => {
      const grid = el('div', { class: 'cards' });
      if (kind === 'wrap-color' || kind === 'wrap-pattern') {
        const mixed = chosen[choiceOfKind(kind)] === null;
        grid.append(card(icons.mix, s.collection.mix, mixed, false, false, () => choose(kind, null)));
      }
      for (const key of cosmeticKeys.filter((k) => k.startsWith(`${kind}/`))) {
        const id = splitKey(key)!.id;
        const found = state.unlocked.includes(key);
        const golden = content.unlocks.goldenOnly.includes(key);
        if (!found) {
          grid.append(lockedCard(golden));
          continue;
        }
        const isNew = state.fresh.includes(key);
        if (isNew) seen.add(key);
        const picture = previewCanvas(key, CARD, options.rs);
        grid.append(card(picture, nameOf(key), chosen[choiceOfKind(kind)] === id, isNew, golden, () => choose(kind, id)));
      }
      return el('section', { class: 'cards-section' }, [el('h3', { text: s.collection.sections[kind] ?? kind }), grid]);
    });
    sheet.body.replaceChildren(...sections);
  };

  const choose = (kind: CosmeticKind, id: string | null) => {
    options.onChoose(kind, id);
    render();
  };

  render();
}

function card(
  picture: HTMLCanvasElement | string | null,
  label: string,
  chosen: boolean,
  isNew: boolean,
  golden: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const button = el('button', {
    class: `card${chosen ? ' is-chosen' : ''}${isNew ? ' is-new' : ''}${golden ? ' is-golden' : ''}`,
    attrs: { type: 'button', 'aria-label': isNew ? `${label}, ${s.collection.isNew}` : label, 'aria-pressed': String(chosen) },
  });
  if (typeof picture === 'string') button.innerHTML = picture;
  else if (picture) {
    // A copy, so the same picture can be shown again later.
    const copy = document.createElement('canvas');
    copy.width = picture.width;
    copy.height = picture.height;
    copy.getContext('2d')?.drawImage(picture, 0, 0);
    button.append(copy);
  }
  button.append(el('span', { class: 'dot', attrs: { 'aria-hidden': 'true' } }));
  button.addEventListener('click', onClick);
  return button;
}

/** Not found yet: a soft cloud shape (golden ones have a faint golden glow, as a hint). */
function lockedCard(golden: boolean): HTMLElement {
  return el('div', {
    class: `card is-locked${golden ? ' is-golden' : ''}`,
    attrs: { role: 'img', 'aria-label': s.collection.locked },
  }, [el('span', { class: 'locked-cloud' })]);
}
