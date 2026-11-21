/**
 * Settings: sound and background sound (each with its own volume), buzz,
 * calm motion, Add to Home Screen, and Start over (with a hold-to-confirm).
 */
import { AMBIENCES, type Ambience, type SaveState, type Settings } from '../core/progress/state';
import { fmt, s } from '../i18n';
import { askToInstall, installWay, shouldSuggestInstall } from '../platform/install';
import { el, holdButton, iconButton, openSheet, slider, toggle } from './dom';
import { icons } from './icons';

export interface SettingsOptions {
  state(): SaveState;
  onChange(patch: Partial<Settings>): void;
  onReset(): void;
  canVibrate: boolean;
}

const AMBIENCE_ICON: Record<Ambience, string> = { off: icons.soundOff, breeze: icons.breeze, chimes: icons.chimes };
const AMBIENCE_LABEL: Record<Ambience, string> = { off: s.settings.ambienceOff, breeze: s.settings.breeze, chimes: s.settings.chimes };

export function openSettings(options: SettingsOptions): void {
  const sheet = openSheet({ label: s.settings.title, className: 'settings' });
  sheet.head.prepend(el('h2', { class: 'sheet-title', text: s.settings.title }));
  const row = (icon: string, label: string, control: HTMLElement, help?: string) =>
    el('div', { class: 'row' }, [
      el('span', { class: 'row-icon', html: icon }),
      el('div', { class: 'row-text' }, [el('span', { class: 'row-label', text: label }), help ? el('span', { class: 'row-help', text: help }) : null]),
      control,
    ]);

  const settings = options.state().settings;
  sheet.body.append(row(icons.soundOn, s.settings.sound, slider(s.settings.sound, settings.sound, (sound) => options.onChange({ sound }))));

  // Background sound: off / breeze / chimes, and its own volume.
  const volume = slider(s.settings.ambienceVolume, settings.ambienceVolume, (ambienceVolume) => options.onChange({ ambienceVolume }));
  const choices = el('div', { class: 'segments', attrs: { role: 'group', 'aria-label': s.settings.ambience } });
  const showAmbience = (value: Ambience) => {
    for (const button of choices.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.value === value));
    volume.classList.toggle('is-off', value === 'off');
  };
  for (const value of AMBIENCES) {
    const button = el('button', { class: 'segment', html: AMBIENCE_ICON[value], attrs: { type: 'button', 'data-value': value } }, [
      el('span', { text: AMBIENCE_LABEL[value] }),
    ]);
    button.addEventListener('click', () => {
      options.onChange({ ambience: value });
      showAmbience(value);
    });
    choices.append(button);
  }
  showAmbience(settings.ambience);
  sheet.body.append(el('div', { class: 'row row-stack' }, [el('span', { class: 'row-label', text: s.settings.ambience }), choices, volume]));

  if (options.canVibrate) {
    sheet.body.append(row(icons.buzz, s.settings.haptics, toggle(s.settings.haptics, settings.haptics, (haptics) => options.onChange({ haptics }))));
  }
  sheet.body.append(row(icons.calm, s.settings.calm, toggle(s.settings.calm, settings.calm, (calm) => options.onChange({ calm })), s.settings.calmHelp));

  if (shouldSuggestInstall()) {
    const way = installWay();
    const help = way === 'ios' ? s.settings.installIos : way === 'menu' ? s.settings.installMenu : s.settings.installHelp;
    const control =
      way === 'button'
        ? iconButton(icons.home, s.settings.install, () => void askToInstall(), 'icon-button soft')
        : el('span', { class: 'row-icon', html: '' });
    sheet.body.append(row(icons.home, s.settings.install, control, help));
  }

  const reset = el('button', { class: 'button quiet', attrs: { type: 'button' } }, [el('span', { class: 'button-icon', html: icons.reset }), s.settings.reset]);
  reset.addEventListener('click', () => confirmReset(options.onReset));
  sheet.body.append(el('div', { class: 'row row-center' }, [reset]));
  sheet.body.append(el('p', { class: 'made-by', text: `${s.madeBy} · ${fmt(s.version, { version: __APP_VERSION__ })}` }));
}

/** "Start over?" with a big, safe "keep" button and a hold-to-confirm "start over". */
function confirmReset(onReset: () => void): void {
  const sheet = openSheet({ label: s.reset.title, className: 'dialog' });
  const keep = el('button', { class: 'button primary', text: s.reset.keep, attrs: { type: 'button' } });
  keep.addEventListener('click', () => sheet.close());
  sheet.body.append(
    el('h2', { class: 'sheet-title', text: s.reset.title }),
    el('p', { class: 'dialog-text', text: s.reset.body }),
    el('div', { class: 'dialog-buttons' }, [
      keep,
      holdButton(s.reset.hold, 1200, () => {
        sheet.close();
        onReset();
      }),
    ]),
  );
}
