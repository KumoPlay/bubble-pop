/**
 * SVG pictures (hats and Kumo), turned into images once and drawn onto the
 * canvas. Each is kept as a ready-made picture at the size it is drawn.
 */
import { hatPictures, kumoSvg } from '../art';
import { context2d, makeCanvas } from './wrapArt';

const images = new Map<string, HTMLImageElement>();
const rasters = new Map<string, HTMLCanvasElement>();
let loading: Promise<void> | null = null;

/** Starts loading every picture. Resolves when all are ready (or failed: the toy works without them). */
export function loadPictures(): Promise<void> {
  loading ??= Promise.all(
    [...Object.entries(hatPictures), ['kumo', kumoSvg] as const].map(([name, svg]) => load(name, svg)),
  ).then(() => undefined);
  return loading;
}

function load(name: string, svg: string): Promise<void> {
  // A size on the picture itself, which some browsers need before they will draw an SVG.
  const sized = /<svg[^>]*\swidth=/.test(svg) ? svg : svg.replace('<svg ', '<svg width="512" height="512" ');
  const image = new Image();
  image.decoding = 'async';
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
  images.set(name, image);
  return image.decode().catch(() => undefined);
}

/** The picture `name` (a hat file name, or "kumo") at `size` device pixels square. Null until loaded. */
export function pictureCanvas(name: string, size: number): HTMLCanvasElement | null {
  const image = images.get(name);
  if (!image || !image.complete || image.naturalWidth === 0) return null;
  // Sizes are rounded, so a wobbling hat does not make a new picture every frame.
  const px = Math.max(8, Math.ceil(size / 8) * 8);
  const key = `${name}@${px}`;
  let canvas = rasters.get(key);
  if (!canvas) {
    canvas = makeCanvas(px, px);
    context2d(canvas).drawImage(image, 0, 0, px, px);
    rasters.set(key, canvas);
  }
  return canvas;
}
