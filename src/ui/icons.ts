/**
 * The interface's pictures, as small SVGs in a 64 × 64 box: pastel fills with a
 * plum outline, like the other KumoPlay games. Some are files in src/art/ui/
 * (shared with Peek-a-Kumo); the rest are drawn here.
 */
import shapes from '../content/shapes.json';

const files = import.meta.glob('../art/ui/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const file = (name: string): string => {
  const svg = files[`../art/ui/${name}.svg`] ?? '';
  return svg.replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
};

const PLUM = '#3D3566';
/** A plum outline, `width` thick. */
const line = (width = 3) => `stroke="${PLUM}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"`;

function svg(body: string): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">${body}</svg>`;
}

function bubble(x: number, y: number, r: number, fill: string): string {
  return (
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${line(2.5)}/>` +
    `<ellipse cx="${x - r * 0.35}" cy="${y - r * 0.4}" rx="${r * 0.34}" ry="${r * 0.2}" fill="#FFFFFF" transform="rotate(-35 ${x - r * 0.35} ${y - r * 0.4})"/>`
  );
}

export const icons = {
  wrap: svg(
    `<rect x="7" y="11" width="50" height="42" rx="10" fill="#FDE3EC" ${line()}/>` +
      bubble(20, 24, 7, '#F9B8D0') +
      bubble(32, 24, 7, '#F9B8D0') +
      bubble(44, 24, 7, '#F9B8D0') +
      bubble(26, 39, 7, '#F9B8D0') +
      // One already popped: flat, with a crease.
      `<circle cx="38" cy="39" r="7.5" fill="#F7D3E0" stroke="${PLUM}" stroke-width="2" stroke-opacity=".45"/>` +
      `<path d="M34 37l3 2 2-3 3 3" fill="none" stroke="${PLUM}" stroke-width="1.8" stroke-opacity=".5" stroke-linecap="round" stroke-linejoin="round"/>`,
  ),
  soap: svg(
    `<path d="M29 46 52 59" ${line(6)}/>` +
      `<path d="M29 46 52 59" stroke="#C8B8F0" stroke-width="2.5" stroke-linecap="round"/>` +
      `<circle cx="20" cy="40" r="11" fill="none" ${line(8)}/>` +
      `<circle cx="20" cy="40" r="11" fill="none" stroke="#9F88E6" stroke-width="3.5"/>` +
      `<circle cx="41" cy="20" r="13" fill="#E6F2FD" ${line(2.5)}/>` +
      `<path d="M31 25a12 12 0 0 0 15 6" fill="none" stroke="#F9B8D0" stroke-width="2.5" stroke-linecap="round"/>` +
      `<path d="M50 14a12 12 0 0 1 3 9" fill="none" stroke="#A6E3C5" stroke-width="2.5" stroke-linecap="round"/>` +
      `<ellipse cx="36" cy="14" rx="4.2" ry="2.4" fill="#FFFFFF" transform="rotate(-35 36 14)"/>` +
      `<circle cx="55" cy="37" r="5" fill="#E6F2FD" ${line(2.2)}/>`,
  ),
  cloud: svg(
    `<g transform="translate(4 6) scale(.56)"><path d="${shapes.cloud}" fill="#FFFFFF" stroke="${PLUM}" stroke-width="5.4" stroke-linejoin="round"/></g>` +
      `<ellipse cx="25.5" cy="35" rx="2.3" ry="2.8" fill="${PLUM}"/>` +
      `<ellipse cx="38.5" cy="35" rx="2.3" ry="2.8" fill="${PLUM}"/>` +
      `<ellipse cx="20" cy="41" rx="3.4" ry="2" fill="#F8A9C6"/>` +
      `<ellipse cx="44" cy="41" rx="3.4" ry="2" fill="#F8A9C6"/>` +
      `<path d="M29 40.5q3 3 6 0" fill="none" stroke="${PLUM}" stroke-width="2.2" stroke-linecap="round"/>`,
  ),
  /** The collection: a little gift box. */
  collection: svg(
    `<rect x="10" y="28" width="44" height="28" rx="6" fill="#F9B8D0" ${line()}/>` +
      `<rect x="7" y="20" width="50" height="11" rx="5" fill="#FDE3EC" ${line()}/>` +
      `<path d="M32 20v36" stroke="${PLUM}" stroke-width="9" stroke-linecap="round"/>` +
      `<path d="M32 21v34" stroke="#C8B8F0" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M32 20c-4-10-16-12-15-4 1 6 11 5 15 4zM32 20c4-10 16-12 15-4-1 6-11 5-15 4z" fill="#C8B8F0" ${line(2.5)}/>`,
  ),
  settings: file('gear'),
  close: file('close'),
  soundOn: file('sound-on'),
  soundOff: file('sound-off'),
  home: file('home-screen'),
  reset: file('replay'),
  sparkle: file('sparkle'),
  check: file('check'),
  breeze: svg(
    `<path d="M8 24h30a7 7 0 1 0-7-7M8 34h40a7 7 0 1 1-7 7M8 44h20" fill="none" ${line(4.5)}/>`,
  ),
  chimes: svg(
    `<path d="M14 10h36" ${line(4)}/>` +
      `<path d="M20 10v14M32 10v22M44 10v10" ${line(2)}/>` +
      `<rect x="16" y="24" width="8" height="22" rx="4" fill="#A9D3F7" ${line(2.5)}/>` +
      `<rect x="28" y="32" width="8" height="24" rx="4" fill="#CDB9F5" ${line(2.5)}/>` +
      `<rect x="40" y="20" width="8" height="20" rx="4" fill="#F9B8D0" ${line(2.5)}/>`,
  ),
  buzz: svg(
    `<rect x="21" y="9" width="22" height="46" rx="6" fill="#C8B8F0" ${line()}/>` +
      `<path d="M28 15h8" ${line(2.5)}/>` +
      `<path d="M12 24c-3 5-3 11 0 16M52 24c3 5 3 11 0 16M6 20c-5 8-5 16 0 24M58 20c5 8 5 16 0 24" fill="none" ${line(2.5)}/>`,
  ),
  /** Calm motion: a feather. */
  calm: svg(
    `<path d="M48 8C26 12 14 30 16 50l4-2c2-10 9-20 18-26-7 8-12 17-14 27 16-2 26-18 24-41z" fill="#A6E3C5" ${line(2.5)}/>` +
      `<path d="M16 50l-4 6" ${line()}/>`,
  ),
  /** Mix them all: two bubbles of different colours, swapping. */
  mix: svg(
    bubble(22, 32, 11, '#F9B8D0') +
      bubble(42, 32, 11, '#A9D3F7') +
      `<path d="M18 16c6-6 22-6 28 0M46 48c-6 6-22 6-28 0" fill="none" ${line(2.5)}/>` +
      `<path d="M43 11l3 5-5 2M21 53l-3-5 5-2" fill="none" ${line(2.5)}/>`,
  ),
  /** Open in another tab. */
  tabs: svg(
    `<rect x="16" y="10" width="40" height="32" rx="6" fill="#DDEEFC" ${line()}/>` +
      `<rect x="8" y="22" width="40" height="32" rx="6" fill="#FDE3EC" ${line()}/>` +
      `<path d="M8 31h40" ${line(2.5)}/>`,
  ),
};
