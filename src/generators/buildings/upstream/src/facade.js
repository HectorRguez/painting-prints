/**
 * Facade grammar — genre-agnostic.
 *
 * Everything here draws in a face's local (s, t) space: s runs left-to-right
 * across the wall, t runs top-to-bottom. The caller supplies colours, so the
 * same window routine serves a timber-framed cottage and a glass office; only
 * the palette and the parameter ranges change per style.
 *
 * All openings are coplanar with their wall, so they are appended to the
 * wall's own item and drawn in insertion order. Nothing here needs depth
 * sorting.
 */

import { rectOn, beamOn, archOn, discOn } from './geometry.js';
import { localPoly } from './projection.js';
import { shade, tint } from './color.js';

/**
 * Split a wall into bays of roughly `target` world units.
 * Returns the count and the exact bay width.
 */
export function layoutBays(width, target = 1.15, min = 1) {
  const n = Math.max(min, Math.round(width / target));
  return { n, w: width / n };
}

/** Flat rectangle of colour on a face. */
export function panel(item, f, s, t, w, h, o = {}) {
  item.face({
    pts: rectOn(f, s, t, w, h),
    kind: f.kind,
    color: o.color,
    basis: o.texture ? f : undefined,
    texture: o.texture,
    lit: o.lit,
    ao: o.ao ?? 0.1,
    opacity: o.opacity,
    cls: o.cls,
    fade: o.fade,
    fadeDir: o.fadeDir,
  });
}

/** Beam / stud / brace of `thick` units between two local points. */
export function beam(item, f, s0, t0, s1, t1, thick, o = {}) {
  item.face({
    pts: beamOn(f, s0, t0, s1, t1, thick),
    kind: f.kind,
    color: o.color,
    basis: o.texture ? f : undefined,
    texture: o.texture,
    lit: o.lit,
    ao: o.ao ?? 0.12,
    cls: o.cls ?? 'beam',
  });
}

/**
 * A window: recess shadow, frame, glazing with a raking highlight, glazing
 * bars, optional sill and optional open shutters.
 */
export function windowOpening(item, f, s, t, w, h, o) {
  const {
    wallColor, frameColor, glassColor, arch = false, bars = 'cross',
    sill = null, shutters = null, curtains = null, frameW = 0.07, cls = 'window',
  } = o;

  const shape = (ss, tt, ww, hh) => (arch ? archOn(f, ss, tt, ww, hh) : rectOn(f, ss, tt, ww, hh));

  // Reveal: the wall is thick, so the opening sits in shadow.
  item.face({
    pts: shape(s - 0.035, t - 0.035, w + 0.07, h + 0.07),
    kind: f.kind, color: wallColor, lit: 0.62, ao: 0.05, cls: `${cls}-reveal`,
  });
  item.face({
    pts: shape(s, t, w, h),
    kind: f.kind, color: frameColor, ao: 0.14, cls: `${cls}-frame`,
  });

  const gs = s + frameW, gt = t + frameW, gw = w - frameW * 2, gh = h - frameW * 2;
  item.face({
    pts: shape(gs, gt, gw, gh),
    kind: f.kind, color: glassColor, ao: 0.5, gradDir: 'v', cls: `${cls}-glass`,
  });

  // Drapes inside the pane, drawn under the highlight so the glass still reads
  // as glass in front of them. Tapered rather than rectangular: a straight-
  // sided panel reads as a painted stripe, a gathered one as cloth.
  if (curtains) {
    const cw = gw * 0.3, cn = gw * 0.19;
    const drape = curtains.color;
    item.face({
      pts: localPoly(f, [[gs, gt], [gs + cw, gt], [gs + cn, gt + gh], [gs, gt + gh]]),
      kind: f.kind, color: drape, ao: 0.34, cls: `${cls}-curtain`,
    });
    item.face({
      pts: localPoly(f, [[gs + gw - cw, gt], [gs + gw, gt], [gs + gw, gt + gh], [gs + gw - cn, gt + gh]]),
      kind: f.kind, color: drape, ao: 0.34, cls: `${cls}-curtain`,
    });
    if (curtains.valance) {
      item.face({
        pts: rectOn(f, gs, gt, gw, gh * 0.15),
        kind: f.kind, color: shade(drape, 1.08), ao: 0.28, cls: `${cls}-curtain`,
      });
    }
  }

  // Raking highlight across the pane — the single cheapest trick for making
  // flat glass read as glass.
  item.face({
    pts: localPoly(f, [
      [gs, gt + gh * 0.62], [gs + gw * 0.55, gt], [gs + gw, gt],
      [gs + gw, gt + gh * 0.16], [gs, gt + gh * 0.86],
    ]),
    kind: f.kind, color: tint(glassColor, 0, -30, 45), ao: 0, opacity: 0.3, cls: `${cls}-shine`,
  });

  const barC = { color: frameColor, ao: 0.06, cls: `${cls}-bar` };
  const bw = 0.032;
  if (bars === 'cross') {
    beam(item, f, gs + gw / 2, gt, gs + gw / 2, gt + gh, bw, barC);
    beam(item, f, gs, gt + gh * 0.45, gs + gw, gt + gh * 0.45, bw, barC);
  } else if (bars === 'leaded') {
    const step = 0.16;
    for (let d = -gh; d < gw + gh; d += step) {
      clipDiag(item, f, gs, gt, gw, gh, d, 1, bw * 0.8, barC);
      clipDiag(item, f, gs, gt, gw, gh, d, -1, bw * 0.8, barC);
    }
  } else if (bars === 'bars') {
    for (let i = 1; i < 3; i++) {
      beam(item, f, gs + (gw * i) / 3, gt, gs + (gw * i) / 3, gt + gh, bw, barC);
    }
  } else if (bars === 'mullion') {
    beam(item, f, gs + gw / 2, gt, gs + gw / 2, gt + gh, bw * 1.8, barC);
  } else if (bars === 'grid') {
    // Colonial-style divided light: aim for roughly square panes rather than a
    // fixed count, so a wide window doesn't end up with letterbox panes.
    const cols = Math.max(2, Math.round(gw / 0.22));
    const rows = Math.max(2, Math.round(gh / 0.22));
    for (let i = 1; i < cols; i++) {
      beam(item, f, gs + (gw * i) / cols, gt, gs + (gw * i) / cols, gt + gh, bw, barC);
    }
    for (let j = 1; j < rows; j++) {
      beam(item, f, gs, gt + (gh * j) / rows, gs + gw, gt + (gh * j) / rows, bw, barC);
    }
  }

  if (sill) {
    panel(item, f, s - 0.06, t + h, w + 0.12, sill.h ?? 0.09, {
      color: sill.color, texture: sill.texture, ao: 0.2, cls: `${cls}-sill`,
    });
  }

  if (shutters) {
    const sw = shutters.w ?? Math.min(0.28, w * 0.5);
    for (const side of [0, 1]) {
      const x = side ? s + w : s - sw;
      panel(item, f, x, t, sw, h, {
        color: shutters.color, texture: shutters.texture, ao: 0.18, cls: 'shutter',
      });
      // Hinge straps.
      for (const ht of [t + h * 0.16, t + h * 0.78]) {
        panel(item, f, x + 0.01, ht, sw - 0.02, 0.035, { color: shutters.iron, ao: 0.05, cls: 'iron' });
      }
    }
  }
}

/** One diagonal lead came, trimmed to the pane rectangle. */
function clipDiag(item, f, gs, gt, gw, gh, d, dir, thick, o) {
  // Parameterise the line and clip against the pane box in local space.
  const pts = [];
  const x0 = gs, x1 = gs + gw;
  for (const x of [x0, x1]) {
    const y = gt + (dir > 0 ? x - gs - d : gs + gw - x - d);
    pts.push([x, y]);
  }
  const clipped = clipSegment(pts[0], pts[1], gs, gt, gs + gw, gt + gh);
  if (clipped) beam(item, f, clipped[0][0], clipped[0][1], clipped[1][0], clipped[1][1], thick, o);
}

/** Liang–Barsky segment clip against an axis-aligned box in local space. */
function clipSegment(a, b, xmin, ymin, xmax, ymax) {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const tests = [[-dx, a[0] - xmin], [dx, xmax - a[0]], [-dy, a[1] - ymin], [dy, ymax - a[1]]];
  for (const [p, q] of tests) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
}

/** A door: recess, plank leaf, ironwork, handle and optional threshold step. */
export function doorOpening(item, f, s, t, w, h, o) {
  const {
    wallColor, frameColor, leafColor, texture, iron, arch = false,
    step = null, cls = 'door', studs = false,
  } = o;
  const shape = (ss, tt, ww, hh) => (arch ? archOn(f, ss, tt, ww, hh) : rectOn(f, ss, tt, ww, hh));

  item.face({
    pts: shape(s - 0.05, t - 0.05, w + 0.1, h + 0.05),
    kind: f.kind, color: wallColor, lit: 0.58, ao: 0.06, cls: `${cls}-reveal`,
  });
  item.face({
    pts: shape(s, t, w, h),
    kind: f.kind, color: frameColor, ao: 0.16, cls: `${cls}-frame`,
  });

  const i = 0.06;
  item.face({
    pts: shape(s + i, t + i, w - i * 2, h - i),
    kind: f.kind, color: leafColor, basis: texture ? f : undefined, texture,
    ao: 0.34, cls: `${cls}-leaf`,
  });

  // Hinge straps and a strap across the boards.
  for (const ht of [t + h * 0.18, t + h * 0.62]) {
    panel(item, f, s + i, ht, w - i * 2, 0.045, { color: iron, ao: 0.08, cls: 'iron' });
  }
  if (studs) {
    const n = Math.max(3, Math.round((w - i * 2) / 0.12));
    for (const ht of [t + h * 0.18, t + h * 0.62]) {
      for (let k = 0; k < n; k++) {
        const cs = s + i + ((k + 0.5) * (w - i * 2)) / n;
        item.face({
          pts: discOn(f, cs, ht + 0.022, 0.018, 8),
          kind: f.kind, color: shade(iron, 1.5), ao: 0.1, cls: 'iron',
        });
      }
    }
  }
  // Ring handle.
  item.face({
    pts: discOn(f, s + w - i - 0.1, t + h * 0.45, 0.05, 12),
    kind: f.kind, color: shade(iron, 1.3), ao: 0.2, cls: 'iron',
  });
  item.face({
    pts: discOn(f, s + w - i - 0.1, t + h * 0.45, 0.026, 10),
    kind: f.kind, color: leafColor, lit: 0.7, ao: 0, cls: 'iron',
  });

  if (step) {
    panel(item, f, s - 0.12, t + h, w + 0.24, step.h ?? 0.1, {
      color: step.color, texture: step.texture, ao: 0.22, cls: 'step',
    });
  }
}

/** Darkening under an overhang, fading downward. */
export function eaveShadow(item, f, height, strength = 0.42) {
  item.face({
    pts: rectOn(f, 0, 0, f.w, height),
    kind: f.kind,
    color: { h: 225, s: 28, l: 12 },
    ao: 0,
    fade: [strength, 0],
    cls: 'ao',
  });
}

/** Contact darkening where a wall meets the ground, fading upward. */
export function groundShadow(item, f, height, strength = 0.3) {
  item.face({
    pts: rectOn(f, 0, f.h - height, f.w, height),
    kind: f.kind,
    color: { h: 225, s: 30, l: 10 },
    ao: 0,
    fade: [0, strength],
    cls: 'ao',
  });
}
