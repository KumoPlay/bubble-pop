/**
 * Pictures kept as SVG files. Hats live in hats/ (one file each, named in
 * src/content/cloud-hats.json). Kumo is the same Kumo as in Peek-a-Kumo.
 */
import kumoSvg from './kumo.svg?raw';

const hatFiles = import.meta.glob('./hats/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

/** Hat pictures by file name, for example "beret.svg". */
export const hatPictures: Record<string, string> = Object.fromEntries(
  Object.entries(hatFiles).map(([path, svg]) => [path.slice(path.lastIndexOf('/') + 1), svg]),
);

export { kumoSvg };
