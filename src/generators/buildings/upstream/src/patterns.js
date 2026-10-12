/**
 * Texture patterns, authored in *world-unit* space.
 *
 * A tile of width 0.36 here means 0.36 of a building tile, and the renderer
 * applies the face's projection matrix via `patternTransform`. So a shingle
 * drawn as an axis-aligned rectangle comes out correctly skewed onto whatever
 * plane it lands on — roof slope, gable, wall — with no per-face authoring.
 *
 * Each generator takes the already-lit base colour of the face and returns
 * `{ w, h, content }` in that unit space. They must be pure functions of their
 * arguments so the defs registry can de-duplicate them.
 */

import { el, num } from './svg.js';
import { shade, toCss } from './color.js';

const rect = (x, y, w, h, fill, opacity) =>
  el('rect', { x, y, width: w, height: h, fill, opacity });

const line = (x1, y1, x2, y2, stroke, sw, opacity) =>
  el('line', { x1, y1, x2, y2, stroke, 'stroke-width': sw, opacity });

/** Overlapping wooden shingles, staggered every other course. */
function shingles(c) {
  const w = 0.34, rowH = 0.13, h = rowH * 2;
  const dark = toCss(shade(c, 0.62));
  const mid = toCss(shade(c, 0.88));
  const light = toCss(shade(c, 1.09));
  const parts = [];
  for (let r = 0; r < 2; r++) {
    const y = r * rowH;
    const off = r % 2 ? w / 4 : -w / 4;
    // Course body with a lit upper lip and a shadowed butt edge.
    parts.push(rect(0, y, w, rowH, mid));
    parts.push(rect(0, y, w, rowH * 0.3, light, 0.5));
    parts.push(rect(0, y + rowH * 0.82, w, rowH * 0.18, dark, 0.75));
    // Vertical joints between individual shingles in the course.
    for (let i = -1; i <= 2; i++) {
      const x = off + (i * w) / 2;
      parts.push(line(x, y, x, y + rowH * 0.82, dark, 0.012, 0.6));
    }
  }
  return { w, h, content: parts.join('') };
}

/** Flat slate/tile: tighter, cooler, sharper courses. */
function slate(c) {
  const w = 0.3, rowH = 0.1, h = rowH * 2;
  const dark = toCss(shade(c, 0.7));
  const light = toCss(shade(c, 1.07));
  const parts = [];
  for (let r = 0; r < 2; r++) {
    const y = r * rowH;
    const off = r % 2 ? w / 4 : 0;
    parts.push(rect(0, y, w, rowH * 0.88, toCss(shade(c, 0.97))));
    parts.push(rect(0, y, w, rowH * 0.16, light, 0.35));
    parts.push(rect(0, y + rowH * 0.88, w, rowH * 0.12, dark, 0.8));
    for (let i = 0; i <= 2; i++) {
      const x = off + (i * w) / 2;
      parts.push(line(x, y, x, y + rowH * 0.88, dark, 0.01, 0.5));
    }
  }
  return { w, h, content: parts.join('') };
}

/**
 * Thatch: soft combed bands. Deliberately much lower contrast than the tile
 * patterns — crisp repeated scallops read as fish-scale tiles, whereas thatch
 * needs to look like a continuous mass with only a hint of coursing.
 */
function thatch(c) {
  const w = 0.62, h = 0.22;
  const dark = toCss(shade(c, 0.78));
  const light = toCss(shade(c, 1.08));
  const parts = [rect(0, 0, w, h, toCss(c))];
  // One long, shallow undulation per band rather than a zigzag.
  let d = `M0 ${num(h * 0.88)}`;
  const steps = 3;
  for (let i = 1; i <= steps; i++) {
    const x = (w * i) / steps;
    const cxp = (w * (i - 0.5)) / steps;
    d += ` Q${num(cxp)} ${num(h * (i % 2 ? 0.95 : 0.81))} ${num(x)} ${num(h * 0.88)}`;
  }
  parts.push(el('path', { d, fill: 'none', stroke: dark, 'stroke-width': 0.016, opacity: 0.5 }));
  // Sparse straw strands for grain.
  for (let i = 0; i < 5; i++) {
    const x = (w * (i + 0.4)) / 5;
    parts.push(line(x, h * 0.18, x + 0.012, h * 0.76, i % 2 ? light : dark, 0.007, 0.22));
  }
  parts.push(rect(0, 0, w, h * 0.2, light, 0.14));
  return { w, h, content: parts.join('') };
}

/** Irregular coursed rubble stone. */
function stone(c) {
  const w = 0.62, h = 0.34;
  const mortar = toCss(shade(c, 0.68));
  const parts = [rect(0, 0, w, h, mortar)];
  // Deterministic "irregular" block layout — hand-tuned, not random, so the
  // pattern can be de-duplicated across every stone face in the scene.
  const rows = [
    [0.0, 0.26, 0.32, 0.22, 0.4, 0.16],
    [0.0, 0.2, 0.24, 0.18, 0.46, 0.16],
  ];
  const blockH = h / 2;
  rows.forEach((row, r) => {
    for (let i = 0; i < row.length; i += 2) {
      const x = row[i], bw = row[i + 1];
      const y = r * blockH;
      const f = 0.92 + ((i * 7 + r * 3) % 5) * 0.045;
      parts.push(rect(x + 0.012, y + 0.012, bw - 0.024, blockH - 0.024, toCss(shade(c, f))));
      parts.push(rect(x + 0.012, y + 0.012, bw - 0.024, blockH * 0.22, toCss(shade(c, f * 1.1)), 0.45));
    }
  });
  return { w, h, content: parts.join('') };
}

/** Regular brick courses, half-lap bond. */
function brick(c) {
  const w = 0.36, rowH = 0.09, h = rowH * 2;
  const mortar = toCss(shade(c, 0.74));
  const parts = [rect(0, 0, w, h, mortar)];
  for (let r = 0; r < 2; r++) {
    const y = r * rowH;
    const off = r % 2 ? -w / 4 : 0;
    for (let i = 0; i <= 2; i++) {
      const x = off + (i * w) / 2;
      const f = 0.94 + ((i + r * 2) % 3) * 0.05;
      parts.push(rect(x + 0.008, y + 0.008, w / 2 - 0.016, rowH - 0.016, toCss(shade(c, f))));
    }
  }
  return { w, h, content: parts.join('') };
}

/** Lime plaster: broad mottling plus fine grain. */
function plaster(c) {
  const w = 0.85, h = 0.85;
  const parts = [];
  const blobs = [
    [0.18, 0.22, 0.2, 1.05], [0.62, 0.14, 0.15, 0.95], [0.4, 0.55, 0.24, 1.04],
    [0.78, 0.66, 0.16, 0.94], [0.09, 0.72, 0.13, 1.03], [0.55, 0.86, 0.12, 0.96],
  ];
  for (const [cx, cy, r, f] of blobs) {
    parts.push(el('circle', { cx, cy, r, fill: toCss(shade(c, f)), opacity: 0.35 }));
  }
  return { w, h, content: parts.join('') };
}

/** Sawn boards running along the face's u axis. */
function planks(c, { spacing = 0.16 } = {}) {
  const w = 0.5, h = spacing;
  const dark = toCss(shade(c, 0.7));
  const light = toCss(shade(c, 1.06));
  return {
    w, h,
    content:
      rect(0, 0, w, h, toCss(c)) +
      rect(0, h * 0.06, w, h * 0.18, light, 0.3) +
      line(0, h * 0.97, w, h * 0.97, dark, 0.016, 0.85) +
      line(0, h * 0.45, w * 0.6, h * 0.45, dark, 0.006, 0.25),
  };
}

/** Boards running across the u axis — doors, shutters, crates. */
function planksV(c, { spacing = 0.13 } = {}) {
  const w = spacing, h = 0.5;
  const dark = toCss(shade(c, 0.68));
  const light = toCss(shade(c, 1.07));
  return {
    w, h,
    content:
      rect(0, 0, w, h, toCss(c)) +
      rect(w * 0.06, 0, w * 0.18, h, light, 0.28) +
      line(w * 0.97, 0, w * 0.97, h, dark, 0.016, 0.85),
  };
}

/** Corrugated / ribbed metal panelling. */
function ribbed(c, { spacing = 0.12 } = {}) {
  const w = spacing, h = 0.5;
  return {
    w, h,
    content:
      rect(0, 0, w, h, toCss(c)) +
      rect(0, 0, w * 0.3, h, toCss(shade(c, 1.13)), 0.55) +
      rect(w * 0.72, 0, w * 0.28, h, toCss(shade(c, 0.72)), 0.6),
  };
}

/** Lapped weatherboard — each course throws a shadow on the one below. */
function clapboard(c, { spacing = 0.19 } = {}) {
  const w = 0.5, h = spacing;
  return {
    w, h,
    content:
      rect(0, 0, w, h, toCss(c)) +
      rect(0, 0, w, h * 0.3, toCss(shade(c, 1.05)), 0.5) +
      rect(0, h * 0.86, w, h * 0.14, toCss(shade(c, 0.72)), 0.9) +
      line(0, h * 0.99, w, h * 0.99, toCss(shade(c, 0.6)), 0.01, 0.7),
  };
}

/** Precast concrete panels: wide joints, faint blotching. */
function concrete(c, { size = 0.9 } = {}) {
  const w = size, h = size * 0.62;
  const joint = toCss(shade(c, 0.86));
  return {
    w, h,
    content:
      rect(0, 0, w, h, toCss(c)) +
      el('circle', { cx: w * 0.3, cy: h * 0.35, r: w * 0.22, fill: toCss(shade(c, 1.04)), opacity: 0.3 }) +
      el('circle', { cx: w * 0.72, cy: h * 0.7, r: w * 0.17, fill: toCss(shade(c, 0.95)), opacity: 0.3 }) +
      line(0, h * 0.99, w, h * 0.99, joint, 0.018, 1) +
      line(w * 0.99, 0, w * 0.99, h, joint, 0.018, 1),
  };
}

/** Bolted hull plating — the sci-fi workhorse. */
function techPanel(c, { size = 0.42 } = {}) {
  const w = size, h = size * 0.72;
  const seam = toCss(shade(c, 0.7));
  const lip = toCss(shade(c, 1.16));
  const parts = [
    rect(0, 0, w, h, toCss(c)),
    rect(0.02, 0.02, w - 0.04, h * 0.2, lip, 0.22),
    line(0, h * 0.98, w, h * 0.98, seam, 0.014, 1),
    line(w * 0.98, 0, w * 0.98, h, seam, 0.014, 1),
    // Recessed inset panel plus two rivets.
    rect(w * 0.16, h * 0.34, w * 0.5, h * 0.34, toCss(shade(c, 0.92)), 0.7),
  ];
  for (const cx of [w * 0.08, w * 0.86]) {
    parts.push(el('circle', { cx, cy: h * 0.5, r: 0.014, fill: seam, opacity: 0.8 }));
  }
  return { w, h, content: parts.join('') };
}

/** Diagonal caution striping for service bands and hatches. */
function hazard(c, { spacing = 0.16, stripe = null } = {}) {
  const w = spacing, h = spacing;
  const other = toCss(stripe ? shade(stripe, 1) : shade(c, 0.35));
  return {
    w, h,
    content:
      rect(0, 0, w, h, toCss(c)) +
      el('path', {
        d: `M0 ${num(h)} L${num(w)} 0 L${num(w)} ${num(h * 0.5)} L${num(w * 0.5)} ${num(h)} Z`,
        fill: other,
      }) +
      el('path', { d: `M0 ${num(h * 0.5)} L${num(w * 0.5)} 0 L0 0 Z`, fill: other }),
  };
}

/** Curtain-wall glazing grid — mullions as texture rather than geometry. */
function glazing(c, { cell = 0.34 } = {}) {
  const w = cell, h = cell * 1.1;
  const mullion = toCss(shade(c, 0.55));
  return {
    w, h,
    content:
      rect(0, 0, w, h, toCss(c)) +
      rect(0, 0, w * 0.55, h * 0.45, toCss(shade(c, 1.22)), 0.25) +
      line(w * 0.97, 0, w * 0.97, h, mullion, 0.026, 0.9) +
      line(0, h * 0.97, w, h * 0.97, mullion, 0.02, 0.75),
  };
}

/** Cracked paving / asphalt for forecourts and paths. */
function paving(c, { size = 0.5 } = {}) {
  const w = size, h = size * 0.7;
  const joint = toCss(shade(c, 0.8));
  return {
    w, h,
    content:
      rect(0, 0, w, h, toCss(c)) +
      rect(0.02, 0.02, w * 0.45, h * 0.44, toCss(shade(c, 1.05)), 0.4) +
      line(0, h * 0.98, w, h * 0.98, joint, 0.016, 1) +
      line(w * 0.98, 0, w * 0.98, h * 0.98, joint, 0.016, 1),
  };
}

export const PATTERNS = {
  shingles, slate, thatch, stone, brick, plaster, planks, planksV, ribbed,
  clapboard, concrete, techPanel, hazard, glazing, paving,
};

/**
 * Resolve a texture spec to `{ w, h, content }`, or null if unknown.
 * `spec` is `{ type, ...opts }`; the colour comes from the lit face.
 */
export function buildPattern(spec, color) {
  const fn = PATTERNS[spec.type];
  if (!fn) return null;
  return fn(color, spec);
}
