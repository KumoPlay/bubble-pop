/** Rare notices that cover the toy. */
import { s } from '../i18n';
import { el, openSheet } from './dom';
import { icons } from './icons';

/** Another tab opened the toy. This one steps back (and stops saving) until the player chooses to play here. */
export function showOtherTab(): void {
  const sheet = openSheet({ label: s.otherTab.body, className: 'dialog', closable: false });
  const here = el('button', { class: 'button primary', text: s.otherTab.here, attrs: { type: 'button' } });
  here.addEventListener('click', () => location.reload());
  sheet.body.append(
    el('div', { class: 'dialog-picture', html: icons.tabs }),
    el('p', { class: 'dialog-text', text: s.otherTab.body }),
    el('div', { class: 'dialog-buttons' }, [here]),
  );
}

/** A save from a newer version of the toy: play on, but nothing is saved until the page is reloaded. */
export function showSaveTooNew(): void {
  const sheet = openSheet({ label: s.saveTooNew, className: 'dialog' });
  sheet.body.append(el('p', { class: 'dialog-text', text: s.saveTooNew }));
}
