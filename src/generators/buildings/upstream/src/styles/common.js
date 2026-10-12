/**
 * Helpers shared by every style pack.
 *
 * Anything here is genre-agnostic: footprint bookkeeping, the ground contact
 * shadow, prop scattering, and the two drawing shortcuts (a whole box, a
 * railing) that every pack reaches for constantly. Style-specific decisions —
 * palettes, massing rules, facade grammar — stay in the pack.
 */

import { hsl, shade } from '../color.js';
import { boxFaces, boxBounds, discOn } from '../geometry.js';
import { project } from '../projection.js';

/** Axis-aligned union of `[x0, y0, x1, y1]` rectangles. */
export function bounds(rects) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]);
    x1 = Math.max(x1, r[2]); y1 = Math.max(y1, r[3]);
  }
  return { x0, y0, x1, y1, w: x1 - x0, d: y1 - y0 };
}

/**
 * Soft elliptical contact shadow on the ground.
 *
 * Its sort box is deliberately given a negative minimum z and a maximum of
 * effectively zero, so the separating-axis test puts it behind every solid in
 * the scene without needing a special case in the renderer.
 */
export function contactShadow(scene, fp, opts = {}) {
  const { opacity = 0.4, spread = 0.5, color = hsl(232, 30, 12), steps = 28 } = opts;
  const cx = (fp.x0 + fp.x1) / 2 + 0.15;
  const cy = (fp.y0 + fp.y1) / 2 + 0.15;
  const rx = fp.w / 2 + spread, ry = fp.d / 2 + spread;
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (Math.PI * 2 * i) / steps;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 0.001]);
  }
  scene
    .item('shadow', [fp.x0 - 1, fp.y0 - 1, -0.5, fp.x1 + 1, fp.y1 + 1, 0.0015])
    .face({ pts, kind: 'ground', color, soft: true, softOpacity: opacity, ao: 0, cls: 'shadow' });
}

/**
 * Positions on the open ground around a building, avoiding the volumes it
 * already occupies and each other. Returns `[x, y]` pairs.
 */
export function scatterSlots(rng, fp, occupied, opts = {}) {
  const { count = 3, near = 0.25, far = 1.0, spacing = 0.62, tries = 26 } = opts;
  const slots = [];
  const want = typeof count === 'number' ? count : rng.int(count[0], count[1]);
  for (let i = 0; i < tries && slots.length < want; i++) {
    const onX = rng.chance(0.5);
    const px = onX ? fp.x1 + rng.float(near, far) : rng.float(fp.x0, fp.x1);
    const py = onX ? rng.float(fp.y0, fp.y1) : fp.y1 + rng.float(near, far);
    if (occupied.some((r) => px > r[0] - 0.25 && px < r[2] + 0.25 && py > r[1] - 0.25 && py < r[3] + 0.25)) continue;
    if (slots.some((s) => Math.hypot(s[0] - px, s[1] - py) < spacing)) continue;
    slots.push([px, py]);
  }
  return slots;
}

/**
 * Draw the camera-facing faces of a box into an item.
 *
 * `style.top` overrides colour/texture for the top face only, which is what
 * you want almost every time — a roof deck, a parapet cap, a crate lid.
 */
export function solid(item, b, style = {}) {
  const {
    color, texture, ao = 0.22, cls = 'solid', lit,
    faces = ['left', 'right', 'top'], top = null, opacity,
  } = style;
  const fs = boxFaces(b);
  const out = {};
  for (const key of faces) {
    const f = fs[key];
    const o = key === 'top' && top ? top : null;
    item.face({
      pts: f.pts, kind: f.kind,
      color: o?.color ?? color,
      basis: f,
      texture: o ? o.texture : texture,
      ao: o?.ao ?? ao, lit: o?.lit ?? lit, opacity,
      cls: o?.cls ?? cls,
    });
    out[key] = f;
  }
  return out;
}

/** Box as its own depth-sorted scene item. Returns `{ item, faces }`. */
export function volume(scene, name, b, style = {}) {
  const item = scene.item(name, boxBounds(b));
  return { item, faces: solid(item, b, style) };
}

/**
 * Posts-and-rail railing along one horizontal axis — balconies, decks, roof
 * edges, fences.
 *
 * Posts are emitted in increasing screen depth so that nearer ones overlap
 * farther ones correctly within the item, which is why this can all live in a
 * single item instead of one per post.
 */
export function railing(item, start, axis, length, height, style = {}) {
  const {
    color, ao = 0.16, cls = 'railing',
    postW = 0.05, spacing = 0.26, rail = 0.06, bottomRail = false, texture,
  } = style;
  const [x, y, z] = start;
  const n = Math.max(2, Math.round(length / spacing));

  for (let i = 0; i <= n; i++) {
    const t = (i / n) * (length - postW);
    const b = axis === 'x'
      ? { x: x + t, y, z, dx: postW, dy: postW, dz: height }
      : { x, y: y + t, z, dx: postW, dy: postW, dz: height };
    solid(item, b, { color, ao, cls, texture, faces: ['left', 'right', 'top'] });
  }

  const bar = (bz, bh) => solid(item,
    axis === 'x'
      ? { x, y, z: bz, dx: length, dy: postW, dz: bh }
      : { x, y, z: bz, dx: postW, dy: length, dz: bh },
    { color, ao, cls, texture });

  if (bottomRail) bar(z + height * 0.18, rail * 0.7);
  bar(z + height - rail, rail);
}

/**
 * A rising column of puffs — hearth smoke, steam, exhaust.
 *
 * The puffs are laid out along a track of widening size and spacing, so the
 * plume is a finished picture before anything moves; that is the frame a static
 * rasteriser gets.
 *
 * The animation is a seamless loop rather than a particle system, and the trick
 * is that every puff shares one phase and travels exactly the gap to its
 * neighbour, growing by exactly the ratio between them and ramping to exactly
 * its neighbour's opacity. At the end of a cycle each puff has become the one
 * above it, so the reset is invisible: the only puffs that change are the
 * bottom one, fading in as fresh smoke, and the top one, fading out.
 *
 * Which makes `dur` the *handoff* interval, not the life of the column — a
 * particle appears to take `dur * count` to climb the whole plume. Setting it
 * to the visible travel time is the easy mistake; the smoke barely creeps.
 */
export function plume(scene, x, y, z, opts = {}) {
  const {
    rng = null, color = hsl(216, 10, 88), count = 6,
    r0 = 0.1, growth = 1.22, gap = 1.2, wander = 0.08,
    opacity = 0.34, falloff = 0.045, dur = 0.9, kind = 'top',
    cls = 'smoke', name = 'smoke', anim = true,
  } = opts;

  // One extra sample: the topmost puff still needs somewhere to travel to.
  const track = [];
  let cx = x, cy = y, cz = z, r = r0;
  for (let i = 0; i <= count; i++) {
    track.push([cx, cy, cz, r]);
    cz += r * gap;
    r *= growth;
    if (rng) { cx += rng.float(-wander, wander * 0.5); cy += rng.float(-wander * 0.8, wander * 0.8); }
  }

  const top = track[count];
  const spread = Math.max(1, top[3] * 2);
  const it = scene.item(name, [
    x - spread, y - spread, z,
    x + spread, y + spread, top[2] + top[3] * 2,
  ]);

  const alpha = (i) => Math.max(0.05, opacity - i * falloff);

  for (let i = 0; i < count; i++) {
    const [px, py, pz, pr] = track[i];
    const [nx, ny, nz, nr] = track[i + 1];
    const a = project([px, py, pz]), b = project([nx, ny, nz]);
    const f = { o: [px - pr, py, pz], u: [1, 0, 0], v: [0, 0, -1] };
    it.face({
      pts: discOn(f, pr, -pr, pr, 12),
      kind, color, soft: true, softOpacity: alpha(i), ao: 0, cls,
      // A fresh object per puff: identical specs still collapse to one CSS
      // class, but distinct objects keep each puff in its own group, so each
      // scales about its own centre rather than the column's.
      anim: anim ? {
        type: 'drift', dur,
        rise: a[1] - b[1], side: b[0] - a[0], grow: nr / pr,
        // Ramp onto the neighbour's alpha; the ends of the column are the only
        // places smoke is allowed to appear or vanish.
        from: i === 0 ? 0 : 1,
        to: i === count - 1 ? 0 : alpha(i + 1) / alpha(i),
      } : null,
    });
  }
  return it;
}

/** Emissive point light: soft bloom with a hot core over it. */
export function lampGlow(item, f, cs, ct, r, color, opts = {}) {
  const { glow = 0.55, core = 0.3, cls = 'lamp', kind = 'top', anim = null } = opts;
  item.face({
    pts: discOn(f, cs, ct, r, 12), kind, color,
    soft: true, softOpacity: glow, ao: 0, cls: `${cls}-glow`, anim,
  });
  item.face({
    pts: discOn(f, cs, ct, r * core, 9), kind, color: shade(color, 1.5),
    ao: 0, cls, anim,
  });
}

/** Rectangle of ground dressing — paving, a garden bed, a forecourt. */
export function groundPatch(scene, name, rect, style = {}) {
  const { color, texture, ao = 0.12, cls = 'ground' } = style;
  const [x0, y0, x1, y1] = rect;
  scene
    .item(name, [x0, y0, -0.01, x1, y1, 0.004])
    .face({
      pts: [[x0, y0, 0.003], [x1, y0, 0.003], [x1, y1, 0.003], [x0, y1, 0.003]],
      kind: 'top',
      color,
      basis: { o: [x0, y0, 0.003], u: [1, 0, 0], v: [0, 1, 0] },
      texture, ao, cls,
    });
}
