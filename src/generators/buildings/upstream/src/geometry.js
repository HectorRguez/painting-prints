/**
 * Solid construction: boxes, roofs and the local-coordinate helpers the
 * facade grammar draws into.
 *
 * Every surface is returned as `{ pts, basis, kind, w, h }`:
 *   pts   — world polygon ready for the renderer
 *   basis — { o, u, v } with unit-length u/v, plus w/h extents in world units.
 *           Detail is authored in this (s, t) space, s rightwards and t
 *           downwards on screen, then mapped back to 3D. That is what lets the
 *           same window-drawing code work on a wall and on a gable.
 *   kind  — lighting class
 *
 * Only camera-facing surfaces are generated at all: the +x face, the +y face
 * and the top. Back-face culling is structural, not a runtime test.
 */

import { norm, at, localRect, backSlopeVisible } from './projection.js';

export const box = (x, y, z, dx, dy, dz) => ({ x, y, z, dx, dy, dz });

/**
 * Normalise a surface descriptor so `o`, `u`, `v` are always top level.
 * Roof parts built as triangles carry their basis nested; this flattens them
 * so facade helpers can draw on a gable exactly like on a wall.
 */
export const asFace = (d) => (d.o ? d : { ...d, ...d.basis });

export const boxMax = (b) => [b.x + b.dx, b.y + b.dy, b.z + b.dz];
export const boxBounds = (b) => [b.x, b.y, b.z, b.x + b.dx, b.y + b.dy, b.z + b.dz];

const surface = (o, u, v, w, h, kind) => {
  const s = { o, u, v, w, h, kind };
  s.pts = localRect(s, 0, 0, w, h);
  return s;
};

/** The three visible surfaces of an axis-aligned box. */
export function boxFaces(b) {
  const { x, y, z, dx, dy, dz } = b;
  return {
    top: surface([x, y, z + dz], [1, 0, 0], [0, 1, 0], dx, dy, 'top'),
    // +y wall: screen-right runs along +x, screen-down along -z.
    left: surface([x, y + dy, z + dz], [1, 0, 0], [0, 0, -1], dx, dz, 'left'),
    // +x wall: screen-right runs along -y.
    right: surface([x + dx, y + dy, z + dz], [0, -1, 0], [0, 0, -1], dy, dz, 'right'),
  };
}

// --- roofs ---------------------------------------------------------------

/**
 * Gable roof. `axis` is the direction the ridge runs.
 * Returns visible slopes, the gable wall triangle, eave/verge fascia strips
 * and a ridge cap, each already positioned in world space.
 */
export function gableRoof(b, { axis = 'x', rise = 0.9, overhang = 0.18, verge = 0.14, thickness = 0.09 } = {}) {
  const x0 = b.x, x1 = b.x + b.dx, y0 = b.y, y1 = b.y + b.dy, zT = b.z + b.dz;
  const out = { slopes: [], gables: [], fascia: [], caps: [], peakZ: zT + rise, eaveZ: zT };

  if (axis === 'x') {
    const ex0 = x0 - verge, ex1 = x1 + verge;
    const ey1 = y1 + overhang, ey0 = y0 - overhang;
    const yM = (y0 + y1) / 2;
    const zP = zT + rise;
    const run = ey1 - yM, L = Math.hypot(run, rise);

    // Far slope first so it draws behind the near one, and only when the pitch
    // is shallow enough to see over the ridge.
    const back = yM - ey0;
    if (backSlopeVisible(back, rise)) {
      out.slopes.push(surfaceFrom([ex1, yM, zP], [-1, 0, 0], norm([0, -back, -rise]),
        ex1 - ex0, Math.hypot(back, rise), 'slopeBack'));
    }
    out.slopes.push(surfaceFrom([ex0, yM, zP], [1, 0, 0], norm([0, run, -rise]), ex1 - ex0, L, 'slopeLeft'));
    // Gable wall triangle, flush with the +x wall plane. Its basis starts at
    // ridge height so local t runs downward from the apex like any other wall;
    // in local space the triangle is (0,h) -> (w,h) -> (w/2,0).
    out.gables.push({
      kind: 'right',
      pts: [[x1, y1, zT], [x1, y0, zT], [x1, yM, zP]],
      basis: { o: [x1, y1, zP], u: [0, -1, 0], v: [0, 0, -1] },
      w: b.dy, h: rise,
    });
    // Eave fascia (+y), then a verge board down *both* rakes of the gable.
    // The far rake matters even though its roof plane is culled: without a
    // board there, the gable wall runs to a bare edge and the roof appears to
    // stop short of its own overhang.
    out.fascia.push(strip([ex0, ey1, zT], [1, 0, 0], ex1 - ex0, thickness, 'left'));
    for (const ey of [ey1, ey0]) {
      const dy = ey - yM;
      out.fascia.push({
        // Tagged so callers whose roof is embedded in another surface — a
        // dormer sitting in a main roof plane — can drop the far rake.
        back: ey === ey0,
        kind: 'right',
        pts: [[ex1, yM, zP], [ex1, ey, zT], [ex1, ey, zT - thickness], [ex1, yM, zP - thickness]],
        basis: { o: [ex1, yM, zP], u: norm([0, dy, -rise]), v: [0, 0, -1] },
        w: Math.hypot(dy, rise), h: thickness,
      });
    }
    // Ridge cap.
    out.caps.push(surfaceFrom([ex0, yM - 0.07, zP], [1, 0, 0], [0, 1, 0], ex1 - ex0, 0.14, 'top'));
    out.ridge = [[ex0, yM, zP], [ex1, yM, zP]];
  } else {
    const ey0 = y0 - verge, ey1 = y1 + verge;
    const ex0 = x0 - overhang, ex1 = x1 + overhang;
    const xM = (x0 + x1) / 2;
    const zP = zT + rise;
    const run = ex1 - xM, L = Math.hypot(run, rise);

    // Origin at the ridge with v pointing *down* the slope, matching the x-axis
    // case. Anything authored in this face's local space — shingle courses,
    // moss, dormers — depends on t growing toward the eave.
    const back = xM - ex0;
    if (backSlopeVisible(back, rise)) {
      out.slopes.push(surfaceFrom([xM, ey0, zP], [0, 1, 0], norm([-back, 0, -rise]),
        ey1 - ey0, Math.hypot(back, rise), 'slopeBack'));
    }
    out.slopes.push(surfaceFrom([xM, ey1, zP], [0, -1, 0], norm([run, 0, -rise]), ey1 - ey0, L, 'slopeRight'));
    out.gables.push({
      kind: 'left',
      pts: [[x0, y1, zT], [x1, y1, zT], [xM, y1, zP]],
      basis: { o: [x0, y1, zP], u: [1, 0, 0], v: [0, 0, -1] },
      w: b.dx, h: rise,
    });
    out.fascia.push({
      kind: 'right',
      pts: [[ex1, ey0, zT], [ex1, ey1, zT], [ex1, ey1, zT - thickness], [ex1, ey0, zT - thickness]],
      basis: { o: [ex1, ey1, zT], u: [0, -1, 0], v: [0, 0, -1] },
      w: ey1 - ey0, h: thickness,
    });
    for (const ex of [ex1, ex0]) {
      const dx = ex - xM;
      out.fascia.push({
        back: ex === ex0,
        kind: 'left',
        pts: [[xM, ey1, zP], [ex, ey1, zT], [ex, ey1, zT - thickness], [xM, ey1, zP - thickness]],
        basis: { o: [xM, ey1, zP], u: norm([dx, 0, -rise]), v: [0, 0, -1] },
        w: Math.hypot(dx, rise), h: thickness,
      });
    }
    out.caps.push(surfaceFrom([xM - 0.07, ey0, zP], [1, 0, 0], [0, 1, 0], 0.14, ey1 - ey0, 'top'));
    out.ridge = [[xM, ey0, zP], [xM, ey1, zP]];
  }
  return out;
}

/** Hip roof: ridge along `axis`, shortened at both ends by `inset`. */
export function hipRoof(b, { axis = 'x', rise = 0.85, overhang = 0.18, inset = null, thickness = 0.09 } = {}) {
  const x0 = b.x - overhang, x1 = b.x + b.dx + overhang;
  const y0 = b.y - overhang, y1 = b.y + b.dy + overhang;
  const zT = b.z + b.dz, zP = zT + rise;
  const out = { slopes: [], gables: [], fascia: [], caps: [], peakZ: zP, eaveZ: zT };

  if (axis === 'x') {
    const yM = (y0 + y1) / 2;
    const hi = inset ?? Math.min((y1 - y0) / 2, (x1 - x0) / 3);
    const rx0 = x0 + hi, rx1 = x1 - hi;
    const run = y1 - yM, L = Math.hypot(run, rise);
    // Far trapezoid and far hip end, then the two near ones.
    if (backSlopeVisible(run, rise)) {
      out.slopes.push({
        kind: 'slopeBack',
        pts: [[rx1, yM, zP], [rx0, yM, zP], [x0, y0, zT], [x1, y0, zT]],
        basis: { o: [rx1, yM, zP], u: [-1, 0, 0], v: norm([0, -run, -rise]) },
        w: rx1 - rx0, h: L,
      });
    }
    if (backSlopeVisible(rx0 - x0, rise)) {
      out.slopes.push({
        kind: 'slopeBack',
        pts: [[rx0, yM, zP], [x0, y1, zT], [x0, y0, zT]],
        basis: { o: [rx0, yM, zP], u: [0, 1, 0], v: norm([-(rx0 - x0), 0, -rise]) },
        w: y1 - y0, h: Math.hypot(rx0 - x0, rise),
      });
    }
    out.slopes.push({
      kind: 'slopeLeft',
      pts: [[rx0, yM, zP], [rx1, yM, zP], [x1, y1, zT], [x0, y1, zT]],
      basis: { o: [rx0, yM, zP], u: [1, 0, 0], v: norm([0, run, -rise]) },
      w: rx1 - rx0, h: L,
    });
    out.slopes.push({
      kind: 'slopeRight',
      pts: [[rx1, yM, zP], [x1, y0, zT], [x1, y1, zT]],
      basis: { o: [rx1, yM, zP], u: [0, -1, 0], v: norm([x1 - rx1, 0, -rise]) },
      w: y1 - y0, h: Math.hypot(x1 - rx1, rise),
    });
    out.fascia.push(strip([x0, y1, zT], [1, 0, 0], x1 - x0, thickness, 'left'));
    out.fascia.push({
      kind: 'right',
      pts: [[x1, y0, zT], [x1, y1, zT], [x1, y1, zT - thickness], [x1, y0, zT - thickness]],
      basis: { o: [x1, y1, zT], u: [0, -1, 0], v: [0, 0, -1] },
      w: y1 - y0, h: thickness,
    });
    out.caps.push(surfaceFrom([rx0, yM - 0.06, zP], [1, 0, 0], [0, 1, 0], rx1 - rx0, 0.12, 'top'));
  } else {
    const xM = (x0 + x1) / 2;
    const hi = inset ?? Math.min((x1 - x0) / 2, (y1 - y0) / 3);
    const ry0 = y0 + hi, ry1 = y1 - hi;
    const run = x1 - xM, L = Math.hypot(run, rise);
    if (backSlopeVisible(run, rise)) {
      out.slopes.push({
        kind: 'slopeBack',
        pts: [[xM, ry1, zP], [xM, ry0, zP], [x0, y0, zT], [x0, y1, zT]],
        basis: { o: [xM, ry0, zP], u: [0, 1, 0], v: norm([-run, 0, -rise]) },
        w: ry1 - ry0, h: L,
      });
    }
    if (backSlopeVisible(ry0 - y0, rise)) {
      out.slopes.push({
        kind: 'slopeBack',
        pts: [[xM, ry0, zP], [x1, y0, zT], [x0, y0, zT]],
        basis: { o: [xM, ry0, zP], u: [1, 0, 0], v: norm([0, -(ry0 - y0), -rise]) },
        w: x1 - x0, h: Math.hypot(ry0 - y0, rise),
      });
    }
    out.slopes.push({
      kind: 'slopeRight',
      pts: [[xM, ry0, zP], [xM, ry1, zP], [x1, y1, zT], [x1, y0, zT]],
      basis: { o: [xM, ry1, zP], u: [0, -1, 0], v: norm([run, 0, -rise]) },
      w: ry1 - ry0, h: L,
    });
    out.slopes.push({
      kind: 'slopeLeft',
      pts: [[xM, ry1, zP], [x0, y1, zT], [x1, y1, zT]],
      basis: { o: [xM, ry1, zP], u: [1, 0, 0], v: norm([0, y1 - ry1, -rise]) },
      w: x1 - x0, h: Math.hypot(y1 - ry1, rise),
    });
    out.fascia.push(strip([x0, y1, zT], [1, 0, 0], x1 - x0, thickness, 'left'));
    out.fascia.push({
      kind: 'right',
      pts: [[x1, y0, zT], [x1, y1, zT], [x1, y1, zT - thickness], [x1, y0, zT - thickness]],
      basis: { o: [x1, y1, zT], u: [0, -1, 0], v: [0, 0, -1] },
      w: y1 - y0, h: thickness,
    });
    out.caps.push(surfaceFrom([xM - 0.06, ry0, zP], [1, 0, 0], [0, 1, 0], 0.12, ry1 - ry0, 'top'));
  }
  return out;
}

/** Pyramid roof — towers, turrets, gatehouses. */
export function pyramidRoof(b, { rise = 1.4, overhang = 0.15, thickness = 0.08 } = {}) {
  const x0 = b.x - overhang, x1 = b.x + b.dx + overhang;
  const y0 = b.y - overhang, y1 = b.y + b.dy + overhang;
  const zT = b.z + b.dz, zP = zT + rise;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const out = { slopes: [], gables: [], fascia: [], caps: [], peakZ: zP, eaveZ: zT, apex: [cx, cy, zP] };

  if (backSlopeVisible(cy - y0, rise)) {
    out.slopes.push({
      kind: 'slopeBack',
      pts: [[cx, cy, zP], [x0, y0, zT], [x1, y0, zT]],
      basis: { o: [x0, y0, zT], u: [1, 0, 0], v: norm([0, cy - y0, zT - zP]) },
      w: x1 - x0, h: Math.hypot(cy - y0, rise),
    });
  }
  if (backSlopeVisible(cx - x0, rise)) {
    out.slopes.push({
      kind: 'slopeBack',
      pts: [[cx, cy, zP], [x0, y1, zT], [x0, y0, zT]],
      basis: { o: [x0, y1, zT], u: [0, -1, 0], v: norm([cx - x0, 0, zT - zP]) },
      w: y1 - y0, h: Math.hypot(cx - x0, rise),
    });
  }
  out.slopes.push({
    kind: 'slopeLeft',
    pts: [[cx, cy, zP], [x1, y1, zT], [x0, y1, zT]],
    basis: { o: [x0, y1, zT], u: [1, 0, 0], v: norm([0, y1 - cy, zT - zP]) },
    w: x1 - x0, h: Math.hypot(y1 - cy, rise),
  });
  out.slopes.push({
    kind: 'slopeRight',
    pts: [[cx, cy, zP], [x1, y0, zT], [x1, y1, zT]],
    basis: { o: [x1, y1, zT], u: [0, -1, 0], v: norm([x1 - cx, 0, zT - zP]) },
    w: y1 - y0, h: Math.hypot(x1 - cx, rise),
  });
  out.fascia.push(strip([x0, y1, zT], [1, 0, 0], x1 - x0, thickness, 'left'));
  out.fascia.push({
    kind: 'right',
    pts: [[x1, y0, zT], [x1, y1, zT], [x1, y1, zT - thickness], [x1, y0, zT - thickness]],
    basis: { o: [x1, y1, zT], u: [0, -1, 0], v: [0, 0, -1] },
    w: y1 - y0, h: thickness,
  });
  return out;
}

/**
 * Flat roof with an optional parapet. The modern/sci-fi workhorse.
 *
 * The parapet is returned as four thin boxes rather than one solid block: a
 * solid block's top face is the whole roof area and would bury the deck. Four
 * boxes also give the right result on the far sides, where what you actually
 * see from this camera is the *inside* face of the parapet — and `boxFaces`
 * already hands back the +x/+y face of each box, which is the inner face for
 * the two far walls and the outer face for the two near ones.
 *
 * `parapets` is ordered back to front, so drawing deck-then-parapets in
 * sequence within one item is correct without any further sorting.
 */
export function flatRoof(b, { parapet = 0.22, thickness = 0.12 } = {}) {
  const zT = b.z + b.dz;
  const t = Math.min(thickness, Math.min(b.dx, b.dy) / 3);
  const out = {
    slopes: [], gables: [], fascia: [], caps: [],
    peakZ: zT + parapet, eaveZ: zT,
    deck: surface([b.x, b.y, zT], [1, 0, 0], [0, 1, 0], b.dx, b.dy, 'top'),
    parapets: [],
    inner: { x: b.x + t, y: b.y + t, dx: b.dx - t * 2, dy: b.dy - t * 2 },
  };
  if (parapet > 0) {
    out.parapets = [
      { x: b.x, y: b.y, z: zT, dx: b.dx, dy: t, dz: parapet },
      { x: b.x, y: b.y, z: zT, dx: t, dy: b.dy, dz: parapet },
      { x: b.x + b.dx - t, y: b.y, z: zT, dx: t, dy: b.dy, dz: parapet },
      { x: b.x, y: b.y + b.dy - t, z: zT, dx: b.dx, dy: t, dz: parapet },
    ];
  }
  return out;
}

/** Single-pitch shed roof, falling toward +x or +y. */
export function shedRoof(b, { axis = 'y', rise = 0.5, overhang = 0.16, thickness = 0.08 } = {}) {
  const x0 = b.x - overhang, x1 = b.x + b.dx + overhang;
  const y0 = b.y - overhang, y1 = b.y + b.dy + overhang;
  const zT = b.z + b.dz, zH = zT + rise;
  const out = { slopes: [], gables: [], fascia: [], caps: [], peakZ: zH, eaveZ: zT };

  if (axis === 'y') {
    // High at -y, falling toward the camera.
    const run = y1 - y0, L = Math.hypot(run, rise);
    out.slopes.push(surfaceFrom([x0, y0, zH], [1, 0, 0], norm([0, run, -rise]), x1 - x0, L, 'slopeLeft'));
    out.fascia.push(strip([x0, y1, zT], [1, 0, 0], x1 - x0, thickness, 'left'));
    out.gables.push({
      kind: 'right',
      pts: [[x1, y1, zT], [x1, y0, zT], [x1, y0, zH]],
      basis: { o: [x1, y1, zH], u: [0, -1, 0], v: [0, 0, -1] },
      w: y1 - y0, h: rise,
    });
  } else {
    const run = x1 - x0, L = Math.hypot(run, rise);
    out.slopes.push(surfaceFrom([x0, y1, zH], [0, -1, 0], norm([run, 0, -rise]), y1 - y0, L, 'slopeRight'));
    out.fascia.push({
      kind: 'right',
      pts: [[x1, y0, zT], [x1, y1, zT], [x1, y1, zT - thickness], [x1, y0, zT - thickness]],
      basis: { o: [x1, y1, zT], u: [0, -1, 0], v: [0, 0, -1] },
      w: y1 - y0, h: thickness,
    });
    out.gables.push({
      kind: 'left',
      pts: [[x0, y1, zT], [x1, y1, zT], [x0, y1, zH]],
      basis: { o: [x0, y1, zH], u: [1, 0, 0], v: [0, 0, -1] },
      w: x1 - x0, h: rise,
    });
  }
  return out;
}

function surfaceFrom(o, u, v, w, h, kind) {
  const s = { o, u, v, w, h, kind };
  s.pts = localRect(s, 0, 0, w, h);
  return s;
}

/** Vertical fascia strip hanging below an eave line running along `u`. */
function strip(o, u, w, h, kind) {
  return surfaceFrom(o, u, [0, 0, -1], w, h, kind);
}

// --- face-local drawing helpers -----------------------------------------

/** Rectangle in (s, t) face space. */
export const rectOn = (f, s, t, w, h) => localRect(f, s, t, w, h);

/** Beam of given thickness between two points in (s, t) face space. */
export function beamOn(f, s0, t0, s1, t1, thick) {
  const dx = s1 - s0, dy = t1 - t0;
  const l = Math.hypot(dx, dy) || 1;
  const nx = (-dy / l) * (thick / 2);
  const ny = (dx / l) * (thick / 2);
  return [
    at(f, s0 + nx, t0 + ny),
    at(f, s1 + nx, t1 + ny),
    at(f, s1 - nx, t1 - ny),
    at(f, s0 - nx, t0 - ny),
  ];
}

/**
 * Polygon approximating a rounded arch in (s, t) space: a rectangle whose top
 * is a semicircle. Circles are polygonised rather than emitted as SVG arcs
 * because the projection turns them into ellipses on slanted planes, and a
 * polygon gets that right for free.
 */
export function archOn(f, s, t, w, h, steps = 12) {
  const r = Math.min(w / 2, h);
  const cx = s + w / 2;
  const pts = [];
  // Arc from the right springing point, over the crown, to the left one...
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI - (Math.PI * i) / steps;
    pts.push([cx - Math.cos(a) * (w / 2), t + r - Math.sin(a) * r]);
  }
  // ...then straight down the left jamb and back along the sill. Closing in
  // the other order folds the polygon into a bowtie and the opening renders
  // as a lens instead of an arch.
  pts.push([s, t + h], [s + w, t + h]);
  return pts.map((p) => at(f, p[0], p[1]));
}

/** Regular polygon (circle approximation) in (s, t) space. */
export function discOn(f, cs, ct, r, steps = 14) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (Math.PI * 2 * i) / steps;
    pts.push(at(f, cs + Math.cos(a) * r, ct + Math.sin(a) * r));
  }
  return pts;
}

/**
 * Upright cylinder — barrels, water butts, chimney pots, sci-fi tanks.
 *
 * The body is only the camera-facing half of the tube. In this projection the
 * front arc is exactly where `x + y` exceeds the centre's, i.e. angles from
 * -45deg to 135deg, so the split is closed-form rather than a depth test.
 */
export function cylinderFaces(cx, cy, zTop, r, h, steps = 16) {
  const ring = (z) => {
    const pts = [];
    for (let i = 0; i < steps; i++) {
      const a = (Math.PI * 2 * i) / steps;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]);
    }
    return pts;
  };
  const top = ring(zTop);
  const front = [];
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 4 + (Math.PI * i) / steps;
    front.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, zTop]);
  }
  const body = front.concat(front.slice().reverse().map((p) => [p[0], p[1], p[2] - h]));
  return {
    top: { pts: top, kind: 'top', basis: { o: [cx - r, cy - r, zTop], u: [1, 0, 0], v: [0, 1, 0] } },
    body: {
      pts: body,
      kind: 'right',
      basis: { o: [cx, cy + r, zTop], u: [1, 0, 0], v: [0, 0, -1] },
    },
    bounds: [cx - r, cy - r, zTop - h, cx + r, cy + r, zTop],
  };
}

/** Sub-basis covering a rectangular region of a face, for nested detail. */
export function subFace(f, s, t, w, h) {
  return { o: at(f, s, t), u: f.u, v: f.v, w, h, kind: f.kind, pts: localRect(f, s, t, w, h) };
}
