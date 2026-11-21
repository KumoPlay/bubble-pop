/**
 * The squishy cloud's jelly body: a ring of points around a cloud outline.
 *
 * It uses "shape matching" (Müller et al., 2005): every step, the best-fitting
 * copy of the resting shape is found (moved, turned and a little stretched), and
 * each point is pulled part of the way towards its place on that copy. Because a
 * point is only ever moved part of the way towards somewhere sensible, the body
 * cannot blow up however hard it is poked, pinched or flung. On top of that,
 * speeds and stretches are capped, and anything not a number resets it.
 *
 * Plain numbers only; drawing lives in src/render/cloudView.ts. Units are
 * screen points and seconds.
 */

export interface Grab {
  /** How strongly each point follows this finger (0 to 1). */
  weights: Float64Array;
  /** Each point's offset from the finger when it grabbed. */
  offsets: Float64Array;
  startX: number;
  startY: number;
  /** Where the finger pulls to (after the rubber-band limit). */
  x: number;
  y: number;
}

export interface Body {
  n: number;
  /** The resting shape, around (0, 0), at radius 1: x0, y0, x1, y1, … */
  rest: Float64Array;
  pos: Float64Array;
  vel: Float64Array;
  /** Scratch space for one step (kept to avoid making garbage 120 times a second). */
  prev: Float64Array;
  /** Where the cloud likes to sit, and its size (half its width). */
  home: { x: number; y: number };
  size: number;
  grabs: Map<number, Grab>;
  /** Fit of the current shape, updated every step (for the face, the hat and the mood). */
  fit: Fit;
}

export interface Fit {
  cx: number;
  cy: number;
  /** The best-fitting change of the resting shape (turn + stretch), as a 2 × 2 matrix [a b; c d]. */
  a: number;
  b: number;
  c: number;
  d: number;
  angle: number;
  /** Farthest point from the middle, compared with the resting shape (1 = as at rest). */
  reach: number;
  /** How long and thin it is (1 = as at rest). */
  aspect: number;
  /** Area compared with the resting shape (below 1 = squeezed). */
  area: number;
}

export const SOFT = {
  points: 48,
  /** Share of the way each point moves towards its place every step. Higher = firmer. */
  stiffness: 0.12,
  calmStiffness: 0.24,
  /** Speed kept every step. Lower = settles sooner. */
  damping: 0.988,
  calmDamping: 0.965,
  /** How much the shape may stretch rather than just turn (0 = rigid, 1 = very stretchy). */
  stretchiness: 0.55,
  /** Share of a tilt it keeps; the rest springs back upright. */
  upright: 0.35,
  /** Pull back towards home, per step: it sits lightly stuck in place, so pulling stretches it. */
  anchor: 0.1,
  /** Fingers pull this hard, per step. */
  grip: 0.5,
  /** How wide a patch of the cloud a finger holds (in sizes). Smaller = the rest bulges more naturally. */
  gripSpread: 0.5,
  /** A finger can pull its spot about this far (in sizes) before the jelly stops giving. */
  pullLimit: 1.4,
  maxSpeed: 4000,
  /** Points never get farther than this from the middle (in sizes). */
  maxReach: 2.6,
  step: 1 / 120,
  maxSteps: 8,
} as const;

/**
 * The resting cloud outline, about 1 wide each way from the middle: the same six
 * puffs as the cloud bubble shape and the toy-bar icon (round puffs, soft creases).
 */
const PUFFS: readonly (readonly [number, number, number])[] = [
  [50, 37, 24],
  [73, 50, 19],
  [74, 67, 15],
  [50, 69, 19],
  [26, 67, 15],
  [27, 50, 19],
];

export function cloudOutline(n: number): Float64Array {
  const out = new Float64Array(n * 2);
  // Measured from (50, 54), the middle of the puffs; 42 units is half the cloud's width.
  for (let i = 0; i < n; i += 1) {
    const t = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const dx = Math.cos(t);
    const dy = Math.sin(t);
    // How far a ray from the middle reaches before leaving the last puff.
    let reach = 0;
    for (const [px, py, r] of PUFFS) {
      const ox = px - 50;
      const oy = py - 54;
      const along = ox * dx + oy * dy;
      const disc = along * along - (ox * ox + oy * oy) + r * r;
      if (disc >= 0) reach = Math.max(reach, along + Math.sqrt(disc));
    }
    out[i * 2] = (dx * reach) / 42;
    out[i * 2 + 1] = (dy * reach) / 42;
  }
  // Centre it.
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i += 1) {
    mx += out[i * 2]!;
    my += out[i * 2 + 1]!;
  }
  for (let i = 0; i < n; i += 1) {
    out[i * 2] = out[i * 2]! - mx / n;
    out[i * 2 + 1] = out[i * 2 + 1]! - my / n;
  }
  return out;
}

export function makeBody(x: number, y: number, size: number, n: number = SOFT.points): Body {
  const rest = cloudOutline(n);
  const body: Body = {
    n,
    rest,
    pos: new Float64Array(n * 2),
    vel: new Float64Array(n * 2),
    prev: new Float64Array(n * 2),
    home: { x, y },
    size,
    grabs: new Map(),
    fit: { cx: x, cy: y, a: 1, b: 0, c: 0, d: 1, angle: 0, reach: 1, aspect: 1, area: 1 },
  };
  settle(body);
  return body;
}

/** Puts the cloud at rest at its home. */
export function settle(body: Body): void {
  for (let i = 0; i < body.n; i += 1) {
    body.pos[i * 2] = body.home.x + body.rest[i * 2]! * body.size;
    body.pos[i * 2 + 1] = body.home.y + body.rest[i * 2 + 1]! * body.size;
  }
  body.vel.fill(0);
  body.grabs.clear();
  measure(body);
}

/** The screen changed: move and resize the cloud, keeping its wobble. */
export function placeBody(body: Body, x: number, y: number, size: number): void {
  const k = size / body.size;
  const { cx, cy } = body.fit;
  for (let i = 0; i < body.n; i += 1) {
    body.pos[i * 2] = x + (body.pos[i * 2]! - cx) * k;
    body.pos[i * 2 + 1] = y + (body.pos[i * 2 + 1]! - cy) * k;
  }
  body.home = { x, y };
  body.size = size;
  body.grabs.clear();
  measure(body);
}

/** True when (x, y) is inside the cloud, or within `margin` points of its edge. */
export function contains(body: Body, x: number, y: number, margin = 0): boolean {
  let inside = false;
  const { pos, n } = body;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const xi = pos[i * 2]!;
    const yi = pos[i * 2 + 1]!;
    const xj = pos[j * 2]!;
    const yj = pos[j * 2 + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  if (inside || margin <= 0) return inside;
  for (let i = 0; i < n; i += 1) {
    if (Math.hypot(pos[i * 2]! - x, pos[i * 2 + 1]! - y) <= margin) return true;
  }
  return false;
}

/**
 * A poke at (x, y): the spot under the finger dents in and the whole cloud
 * squishes a little. `strength` is a speed in points per second.
 */
export function poke(body: Body, x: number, y: number, strength: number): void {
  const { cx, cy } = body.fit;
  const spread = body.size * 0.6;
  for (let i = 0; i < body.n; i += 1) {
    const px = body.pos[i * 2]!;
    const py = body.pos[i * 2 + 1]!;
    const toMiddleX = cx - px;
    const toMiddleY = cy - py;
    const length = Math.hypot(toMiddleX, toMiddleY) || 1;
    const near = Math.exp(-((Math.hypot(px - x, py - y) / spread) ** 2));
    const push = strength * (0.3 + 0.7 * near);
    body.vel[i * 2] = body.vel[i * 2]! + (toMiddleX / length) * push;
    body.vel[i * 2 + 1] = body.vel[i * 2 + 1]! + (toMiddleY / length) * push;
  }
}

/** A finger takes hold at (x, y). Points near it follow it most, far ones less: a jelly stretch. */
export function grab(body: Body, id: number, x: number, y: number): void {
  const weights = new Float64Array(body.n);
  const offsets = new Float64Array(body.n * 2);
  const spread = body.size * SOFT.gripSpread;
  let most = 0;
  for (let i = 0; i < body.n; i += 1) {
    const px = body.pos[i * 2]!;
    const py = body.pos[i * 2 + 1]!;
    const w = Math.exp(-((Math.hypot(px - x, py - y) / spread) ** 2));
    weights[i] = w;
    most = Math.max(most, w);
    offsets[i * 2] = px - x;
    offsets[i * 2 + 1] = py - y;
  }
  // The nearest spot always follows the finger fully, even if the finger is just outside.
  for (let i = 0; i < body.n; i += 1) weights[i] = most > 0 ? weights[i]! / most : 0;
  body.grabs.set(id, { weights, offsets, startX: x, startY: y, x, y });
}

/** The finger moved. Beyond the pull limit the jelly gives less and less, like a rubber band. */
export function moveGrab(body: Body, id: number, x: number, y: number): void {
  const g = body.grabs.get(id);
  if (!g) return;
  const dx = x - g.startX;
  const dy = y - g.startY;
  const length = Math.hypot(dx, dy);
  const limit = SOFT.pullLimit * body.size;
  const eased = length > 0 && Number.isFinite(length) ? limit * Math.tanh(length / limit) : 0;
  g.x = g.startX + (length > 0 ? (dx / length) * eased : 0);
  g.y = g.startY + (length > 0 ? (dy / length) * eased : 0);
}

export function release(body: Body, id: number): void {
  body.grabs.delete(id);
}

/** Moves time forward by `dt` seconds, in small fixed steps. */
export function stepBody(body: Body, dt: number, calm: boolean): void {
  const steps = Math.min(SOFT.maxSteps, Math.max(1, Math.round(dt / SOFT.step)));
  for (let s = 0; s < steps; s += 1) stepOnce(body, calm);
}

function stepOnce(body: Body, calm: boolean): void {
  const { n, pos, vel, rest, size } = body;
  const h = SOFT.step;
  const damping = calm ? SOFT.calmDamping : SOFT.damping;
  const stiffness = calm ? SOFT.calmStiffness : SOFT.stiffness;
  const before = body.prev;
  before.set(pos);

  // 1. Move with the current speed.
  for (let i = 0; i < n * 2; i += 1) {
    vel[i] = vel[i]! * damping;
    pos[i] = pos[i]! + vel[i]! * h;
  }

  // 2. Pull every point towards its place on the best-fitting resting shape.
  const fit = matchShape(body);
  const shiftX = (body.home.x - fit.cx) * SOFT.anchor;
  const shiftY = (body.home.y - fit.cy) * SOFT.anchor;
  for (let i = 0; i < n; i += 1) {
    const qx = rest[i * 2]! * size;
    const qy = rest[i * 2 + 1]! * size;
    const gx = fit.a * qx + fit.b * qy + fit.cx;
    const gy = fit.c * qx + fit.d * qy + fit.cy;
    // The whole cloud is also pulled back towards home.
    pos[i * 2] = pos[i * 2]! + shiftX;
    pos[i * 2 + 1] = pos[i * 2 + 1]! + shiftY;
    pos[i * 2] = pos[i * 2]! + (gx - pos[i * 2]!) * stiffness;
    pos[i * 2 + 1] = pos[i * 2 + 1]! + (gy - pos[i * 2 + 1]!) * stiffness;
  }

  // 3. Fingers.
  for (const g of body.grabs.values()) {
    for (let i = 0; i < n; i += 1) {
      const w = g.weights[i]! * SOFT.grip;
      if (w <= 0.001) continue;
      pos[i * 2] = pos[i * 2]! + (g.x + g.offsets[i * 2]! - pos[i * 2]!) * w;
      pos[i * 2 + 1] = pos[i * 2 + 1]! + (g.y + g.offsets[i * 2 + 1]! - pos[i * 2 + 1]!) * w;
    }
  }

  // 4. New speeds from how far each point moved; then the safety limits.
  const far = SOFT.maxReach * size;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i += 1) {
    mx += pos[i * 2]!;
    my += pos[i * 2 + 1]!;
  }
  mx /= n;
  my /= n;
  let broken = false;
  for (let i = 0; i < n; i += 1) {
    let dx = pos[i * 2]! - mx;
    let dy = pos[i * 2 + 1]! - my;
    const d = Math.hypot(dx, dy);
    if (d > far) {
      dx *= far / d;
      dy *= far / d;
      pos[i * 2] = mx + dx;
      pos[i * 2 + 1] = my + dy;
    }
    let vx = (pos[i * 2]! - before[i * 2]!) / h;
    let vy = (pos[i * 2 + 1]! - before[i * 2 + 1]!) / h;
    const speed = Math.hypot(vx, vy);
    if (speed > SOFT.maxSpeed) {
      vx *= SOFT.maxSpeed / speed;
      vy *= SOFT.maxSpeed / speed;
    }
    vel[i * 2] = vx;
    vel[i * 2 + 1] = vy;
    if (!Number.isFinite(pos[i * 2]!) || !Number.isFinite(pos[i * 2 + 1]!) || !Number.isFinite(vx + vy)) broken = true;
  }
  if (broken) {
    settle(body);
    return;
  }
  measure(body);
}

/** Finds the best-fitting turn and stretch of the resting shape for the current points. */
function matchShape(body: Body): Fit {
  const { n, pos, rest, size } = body;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i += 1) {
    cx += pos[i * 2]!;
    cy += pos[i * 2 + 1]!;
  }
  cx /= n;
  cy /= n;
  // Apq = Σ p qᵀ and Aqq = Σ q qᵀ (p: point from the middle, q: its resting place).
  let p00 = 0;
  let p01 = 0;
  let p10 = 0;
  let p11 = 0;
  let q00 = 0;
  let q01 = 0;
  let q11 = 0;
  for (let i = 0; i < n; i += 1) {
    const px = pos[i * 2]! - cx;
    const py = pos[i * 2 + 1]! - cy;
    const qx = rest[i * 2]! * size;
    const qy = rest[i * 2 + 1]! * size;
    p00 += px * qx;
    p01 += px * qy;
    p10 += py * qx;
    p11 += py * qy;
    q00 += qx * qx;
    q01 += qx * qy;
    q11 += qy * qy;
  }
  // The pure turn (the rotation part of Apq).
  const angle = Math.atan2(p10 - p01, p00 + p11);
  // The stretch: A = Apq · Aqq⁻¹, scaled to keep the area.
  const det = q00 * q11 - q01 * q01;
  const i00 = q11 / det;
  const i01 = -q01 / det;
  const i11 = q00 / det;
  let a = p00 * i00 + p01 * i01;
  let b = p00 * i01 + p01 * i11;
  let c = p10 * i00 + p11 * i01;
  let d = p10 * i01 + p11 * i11;
  // How long and thin: the ratio of the two stretch directions (1 = as at rest).
  const t = a * a + b * b + c * c + d * d;
  const area = a * d - b * c;
  const root = Math.sqrt(Math.max(0, t * t - 4 * area * area));
  const aspect = Math.sqrt((t + root) / Math.max(1e-9, t - root));
  const scale = Math.sqrt(Math.max(1e-6, Math.abs(area)));
  a /= scale;
  b /= scale;
  c /= scale;
  d /= scale;
  // Let it keep only part of any tilt, so it springs back upright.
  const back = angle * (SOFT.upright - 1);
  const cb = Math.cos(back);
  const sb = Math.sin(back);
  [a, b, c, d] = [cb * a - sb * c, cb * b - sb * d, sb * a + cb * c, sb * b + cb * d];
  const keep = angle * SOFT.upright;
  const rc = Math.cos(keep);
  const rs = Math.sin(keep);
  const k = SOFT.stretchiness;
  return {
    cx,
    cy,
    a: k * a + (1 - k) * rc,
    b: k * b - (1 - k) * rs,
    c: k * c + (1 - k) * rs,
    d: k * d + (1 - k) * rc,
    angle,
    reach: 1,
    aspect: Number.isFinite(aspect) ? aspect : 1,
    area: 1,
  };
}

/** Updates body.fit: the fitted turn and stretch, plus reach, aspect and area for the face. */
function measure(body: Body): void {
  const fit = matchShape(body);
  const { n, pos, rest, size } = body;
  let reach = 0;
  let restReach = 0;
  let area = 0;
  let restArea = 0;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    reach = Math.max(reach, Math.hypot(pos[i * 2]! - fit.cx, pos[i * 2 + 1]! - fit.cy));
    restReach = Math.max(restReach, Math.hypot(rest[i * 2]!, rest[i * 2 + 1]!) * size);
    area += pos[j * 2]! * pos[i * 2 + 1]! - pos[i * 2]! * pos[j * 2 + 1]!;
    restArea += rest[j * 2]! * rest[i * 2 + 1]! - rest[i * 2]! * rest[j * 2 + 1]!;
  }
  fit.reach = restReach > 0 ? reach / restReach : 1;
  fit.area = restArea !== 0 ? area / (restArea * size * size) : 1;
  body.fit = fit;
}

/** True when the cloud has stopped wobbling and nobody holds it (no more frames needed). */
export function isResting(body: Body): boolean {
  if (body.grabs.size > 0) return false;
  for (let i = 0; i < body.n * 2; i += 1) if (Math.abs(body.vel[i]!) > 2) return false;
  return Math.hypot(body.fit.cx - body.home.x, body.fit.cy - body.home.y) < 0.5;
}

/** Index of the outline point nearest the top at `x` (-1 left … 1 right), for a hat. */
export function topPointAt(body: Body, x: number): number {
  let best = 0;
  let bestScore = Infinity;
  for (let i = 0; i < body.n; i += 1) {
    const qx = body.rest[i * 2]!;
    const qy = body.rest[i * 2 + 1]!;
    if (qy > 0) continue;
    const score = Math.abs(qx - x * 0.8) - qy * 0.15;
    if (score < bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}
