/**
 * Cozy / stylized suburbia style pack.
 *
 * Structurally the closest sibling to the medieval pack — pitched roofs, gable
 * ends, dormers — but the character comes from somewhere else entirely: soft
 * pastel bodies against bright white trim, wide eaves, and the domestic
 * apparatus of a front yard (porch, bay window, garage, picket fence, shrubs).
 *
 * The one genuinely new structure here is the porch: an *open* volume. It has a
 * deck, posts and a roof but no walls, so it can't go through the normal
 * storey-stack path and is assembled directly instead.
 */

import { hsl, shade } from '../color.js';
import {
  boxFaces, boxBounds, gableRoof, hipRoof, shedRoof,
  rectOn, discOn, cylinderFaces, asFace,
} from '../geometry.js';
import {
  layoutBays, panel, beam, windowOpening, doorOpening, eaveShadow, groundShadow,
} from '../facade.js';
import { add, mul, localPoly } from '../projection.js';
import {
  bounds, contactShadow, scatterSlots, solid, volume, railing, groundPatch,
  plume, lampGlow,
} from './common.js';
import { resolveDetail, glazingFor, scaleCount } from '../detail.js';

// --- palette -------------------------------------------------------------

export function palette(rng) {
  const p = rng.fork('palette');

  // Bodies are muted pastels; the saturation ceiling is what keeps them
  // "cozy" rather than "toy".
  // Body lightness is held well below the trim's. White corner boards, rake
  // trim and window casings are the defining feature of the genre, and they
  // vanish entirely if the siding is allowed to get as pale as they are.
  const body = p.pick([
    hsl(p.float(90, 130), p.float(14, 26), p.float(60, 72)),   // sage
    hsl(p.float(40, 52), p.float(24, 40), p.float(66, 76)),    // butter / cream
    hsl(p.float(196, 214), p.float(16, 30), p.float(62, 74)),  // powder blue
    hsl(p.float(8, 22), p.float(20, 34), p.float(62, 73)),     // blush terracotta
    hsl(p.float(20, 34), p.float(8, 18), p.float(64, 74)),     // warm grey
    hsl(p.float(160, 182), p.float(14, 26), p.float(62, 72)),  // mint
  ]);

  const roof = p.pick([
    hsl(p.float(20, 34), p.float(8, 18), p.float(26, 34)),     // charcoal brown
    hsl(p.float(200, 220), p.float(6, 14), p.float(30, 38)),   // slate grey
    hsl(p.float(6, 18), p.float(24, 38), p.float(30, 38)),     // barn red
    hsl(p.float(120, 150), p.float(12, 22), p.float(26, 34)),  // weathered green
  ]);

  const door = p.pick([
    hsl(4, 52, 40), hsl(206, 46, 38), hsl(150, 36, 32),
    hsl(38, 62, 46), hsl(268, 26, 40), hsl(20, 30, 28),
  ]);

  const siding = p.weighted({ clapboard: 6, plaster: 3, brick: 2 });

  return {
    body, roof, siding,
    // Brick siding takes a real masonry colour. Tinting brick with a pastel
    // body colour produces mint-green and powder-blue brickwork.
    wall: siding === 'brick' ? hsl(p.float(8, 20), p.float(26, 40), p.float(40, 50)) : body,
    // Trim is near-white and slightly warm; pure white reads as clinical.
    trim: hsl(p.float(30, 50), p.float(5, 14), p.float(91, 97)),
    roofMat: p.weighted({ shingles: 6, slate: 3 }),
    door,
    // Shutters either match the door or sit a shade darker than the body.
    shutter: p.chance(0.55) ? door : shade(body, 0.62),
    glass: hsl(p.float(194, 214), p.float(18, 32), p.float(56, 68)),
    foundation: hsl(p.float(20, 40), p.float(4, 12), p.float(46, 58)),
    brick: hsl(p.float(8, 20), p.float(24, 38), p.float(38, 48)),
    foliage: hsl(p.float(96, 138), p.float(26, 42), p.float(30, 42)),
    bloom: p.pick([hsl(348, 62, 62), hsl(44, 78, 60), hsl(280, 40, 62), hsl(12, 70, 60)]),
    path: hsl(p.float(30, 48), p.float(4, 10), p.float(58, 68)),
    metal: hsl(p.float(200, 230), p.float(4, 10), p.float(30, 40)),
    bars: p.weighted({ grid: 5, cross: 4, bars: 1 }),
    shutters: p.chance(0.6),
    fence: p.chance(0.45),
  };
}

// --- massing -------------------------------------------------------------

export function massing(rng, opts = {}) {
  const m = rng.fork('massing');
  const floors = opts.floors ?? Number(m.weighted({ 1: 4, 2: 6 }));
  const mw = opts.width ?? Number(m.weighted({ 2: 4, 3: 5 }));
  const md = opts.depth ?? Number(m.weighted({ 2: 4, 3: 4 }));
  const floorH = m.float(0.98, 1.16);
  const plinthH = m.float(0.12, 0.24);

  const ridgeAxis = mw === md ? m.pick(['x', 'y']) : mw > md ? 'x' : 'y';
  const span = ridgeAxis === 'x' ? md : mw;

  const main = {
    role: 'main',
    x: 0, y: 0, w: mw, d: md,
    floors, floorH, plinthH,
    roof: {
      type: m.weighted({ gable: 5, hip: 4 }),
      axis: ridgeAxis,
      // Gentler than medieval, and eaves are generous — suburban roofs
      // overhang to throw rain clear of the siding.
      rise: Math.min(span * m.float(0.38, 0.52), 0.9 + floors * 0.45),
      overhang: m.float(0.2, 0.32),
      verge: m.float(0.16, 0.26),
    },
  };

  const parts = [main];
  const occupied = [[0, 0, mw, md]];

  // Attached garage on the +x side, always single storey with its own ridge.
  let garage = null;
  if (m.chance(0.5)) {
    const gw = m.float(1.5, 2.0);
    const gd = m.float(1.7, Math.max(1.8, md - 0.2));
    const gy = m.float(0, Math.max(0, md - gd));
    garage = {
      role: 'garage',
      x: mw, y: gy, w: gw, d: gd,
      floors: 1, floorH: floorH * m.float(1.0, 1.12), plinthH: plinthH * 0.5,
      roof: {
        type: m.weighted({ gable: 6, hip: 3 }),
        axis: 'y',
        rise: gw * m.float(0.3, 0.42),
        overhang: m.float(0.16, 0.26), verge: m.float(0.14, 0.22),
      },
    };
    parts.push(garage);
    occupied.push([mw, gy, mw + gw, gy + gd]);
  }

  // Front porch on +y: an open deck, not a walled storey.
  let porch = null;
  if (m.chance(0.62)) {
    const pw = m.float(1.4, Math.max(1.5, mw - 0.3));
    const pd = m.float(0.8, 1.15);
    const px = m.float(0.12, Math.max(0.12, mw - pw - 0.12));
    // The porch roof has to land on a real line of the house: the top of the
    // ground storey. Sizing the posts independently lets the roof rise above
    // the main eave, where it stabs straight through the main roof plane.
    const attachZ = plinthH + floorH;
    const deckH = m.float(0.12, 0.2);
    const rise = m.float(0.18, 0.3);
    porch = {
      role: 'porch', x: px, y: md, w: pw, d: pd,
      deckH, rise,
      postH: Math.max(0.7, attachZ - deckH - rise),
      railed: m.chance(0.75),
    };
    occupied.push([px, md, px + pw, md + pd]);
  }

  // Bay window, on whatever stretch of the front wall the porch left free.
  let bay = null;
  if (m.chance(0.42)) {
    const bw = m.float(0.9, 1.3);
    const free = porch ? [[0.1, porch.x - bw - 0.15], [porch.x + porch.w + 0.15, mw - bw - 0.1]] : [[0.15, mw - bw - 0.15]];
    const slot = free.filter((r) => r[1] > r[0]);
    if (slot.length) {
      const [lo, hi] = m.pick(slot);
      bay = { x: m.float(lo, hi), w: bw, d: m.float(0.34, 0.5), z: 0, h: 0 };
      occupied.push([bay.x, md, bay.x + bw, md + bay.d]);
    }
  }

  return {
    parts, main, garage, porch, bay, occupied,
    doorHost: 'main',
    chimney: m.chance(0.55),
    dormers: m.chance(0.5),
    path: m.chance(0.7),
    // Appended, so adding them left every earlier decision — and so every
    // existing seed's massing — untouched.
    smoke: m.chance(0.5),
    porchLight: m.chance(0.8),
    basket: m.chance(0.6),
    curtains: m.chance(0.65),
    footprint: bounds(occupied),
  };
}

// --- build ---------------------------------------------------------------

export function build(scene, rng, opts = {}) {
  const pal = { ...palette(rng), ...opts.palette };
  const det = resolveDetail(opts.detail);
  const M = massing(rng, opts);
  const d = rng.fork('dressing');

  contactShadow(scene, M.footprint, { opacity: 0.32, spread: 0.6 });
  if (M.path) frontPath(scene, M, pal, d.fork('path'));

  for (const part of M.parts) buildPart(scene, part, M, pal, d.fork(part.role), det);

  if (M.bay) bayWindow(scene, M, pal, d.fork('bay'));
  if (M.porch) frontPorch(scene, M, pal, d.fork('porch'));
  if (M.chimney) chimney(scene, M, pal, d.fork('chimney'));
  if (det.props > 0) garden(scene, M, pal, d.fork('garden'), det);

  return {
    palette: pal,
    massing: {
      parts: M.parts.map((p) => ({ role: p.role, x: p.x, y: p.y, w: p.w, d: p.d, floors: p.floors, roof: p.roof })),
      porch: !!M.porch, bay: !!M.bay, garage: !!M.garage, chimney: M.chimney,
      smoke: M.chimney && M.smoke, porchLight: M.porchLight, basket: !!M.porch && M.basket,
    },
    footprint: M.footprint,
  };
}

function buildPart(scene, part, M, pal, rng, det) {
  const { x, y, w, d, floors, floorH, plinthH } = part;
  const isGarage = part.role === 'garage';

  if (plinthH > 0.02) {
    const b = { x, y, z: 0, dx: w, dy: d, dz: plinthH };
    const it = scene.item(`${part.role}-foundation`, boxBounds(b));
    const fs = solid(it, b, {
      color: pal.foundation, texture: { type: 'concrete', size: 0.6 },
      ao: 0.24, cls: 'foundation', faces: ['left', 'right'],
    });
    for (const key of ['left', 'right']) groundShadow(it, fs[key], Math.min(plinthH, 0.16), 0.32);
  }

  for (let i = 0; i < floors; i++) {
    const b = { x, y, z: plinthH + i * floorH, dx: w, dy: d, dz: floorH };
    const isTop = i === floors - 1;
    const it = scene.item(`${part.role}-floor${i}`, boxBounds(b));
    const fs = boxFaces(b);

    for (const key of ['left', 'right']) {
      drawWall(it, fs[key], {
        pal, det, rng: rng.fork(`wall${i}${key}`),
        isGround: i === 0, isTop,
        // The porch covers the middle of the front wall, so the front door
        // only goes there when there is a porch to shelter it.
        door: !isGarage && M.doorHost === part.role && i === 0 && key === 'left',
        doorRange: M.porch ? [M.porch.x, M.porch.x + M.porch.w] : null,
        garageDoor: isGarage && key === 'left' && i === 0,
        porchLight: M.porchLight,
        curtains: M.curtains && !isGarage,
      });
    }

    if (isTop) drawRoof(scene, it, b, part.roof, pal, rng.fork('roof'), part.role, M, det);
  }
}

// --- walls ---------------------------------------------------------------

function drawWall(item, f, c) {
  const { pal, rng, det } = c;

  item.face({
    pts: f.pts, kind: f.kind, color: pal.wall, basis: f,
    texture: { type: pal.siding, spacing: 0.19, size: 0.7 },
    ao: 0.2, cls: 'wall',
  });

  // Corner boards and a band at each storey line. White trim over a pastel
  // body is the single strongest signal of this genre.
  const tw = 0.09;
  for (const s of [0, f.w - tw]) {
    panel(item, f, s, 0, tw, f.h, { color: pal.trim, ao: 0.14, cls: 'trim' });
  }
  panel(item, f, 0, f.h - 0.07, f.w, 0.07, { color: pal.trim, ao: 0.16, cls: 'trim' });
  if (c.isTop) panel(item, f, 0, 0, f.w, 0.08, { color: pal.trim, ao: 0.14, cls: 'trim' });

  if (c.garageDoor) {
    garageDoor(item, f, pal, rng);
    if (c.isTop) eaveShadow(item, f, Math.min(f.h * 0.4, 0.3), 0.36);
    groundShadow(item, f, Math.min(f.h * 0.28, 0.2), 0.22);
    return;
  }

  const bays = layoutBays(f.w, rng.float(1.15, 1.55));

  // Pick the door bay from those the porch actually covers, so the entrance
  // ends up under its own roof rather than beside it.
  let doorBay = -1;
  if (c.door) {
    const cand = [];
    for (let i = 0; i < bays.n; i++) {
      const mid = (i + 0.5) * bays.w;
      if (!c.doorRange || (mid > c.doorRange[0] && mid < c.doorRange[1])) cand.push(i);
    }
    doorBay = cand.length ? rng.pick(cand) : rng.int(0, bays.n - 1);
  }

  const open = [];
  for (let i = 0; i < bays.n; i++) open.push(i === doorBay || rng.chance(c.isGround ? 0.8 : 0.88));
  if (!open.some(Boolean)) open[rng.int(0, bays.n - 1)] = true;

  for (let i = 0; i < bays.n; i++) {
    const bs = i * bays.w;
    if (i === doorBay) {
      const dw = Math.min(0.72, bays.w * 0.5);
      const dh = Math.min(f.h - 0.24, rng.float(1.0, 1.16));
      // Trim surround, then the leaf inside it.
      panel(item, f, bs + (bays.w - dw) / 2 - 0.08, f.h - dh - 0.08, dw + 0.16, dh + 0.08, {
        color: pal.trim, ao: 0.16, cls: 'door-trim',
      });
      doorOpening(item, f, bs + (bays.w - dw) / 2, f.h - dh, dw, dh, {
        wallColor: pal.wall,
        frameColor: pal.trim,
        leafColor: pal.door,
        texture: null,
        iron: pal.metal,
        step: { color: pal.foundation, texture: { type: 'concrete', size: 0.5 }, h: 0.1 },
      });
      // Panelled front door: two raised panels and a light above.
      const ds = bs + (bays.w - dw) / 2;
      for (const [pt, ph] of [[0.2, 0.3], [0.56, 0.3]]) {
        panel(item, f, ds + dw * 0.2, f.h - dh + dh * pt, dw * 0.6, dh * ph, {
          color: shade(pal.door, 1.18), ao: 0.2, cls: 'door-panel',
        });
      }
      if (c.porchLight) {
        // Deliberately low on the door — a porch roof lands on the top of this
        // storey and would swallow a lamp mounted at the usual head height.
        const right = ds + dw + 0.26 < f.w;
        porchLight(item, f, right ? ds + dw + 0.13 : ds - 0.13, f.h - dh + dh * 0.28, pal, rng.fork('light'));
      }
      continue;
    }
    if (!open[i]) continue;

    const useShutters = pal.shutters && bays.w > 1.25 && rng.chance(0.8);
    const shW = useShutters ? Math.min(0.22, bays.w * 0.14) : 0;
    const ww = Math.min(0.8, bays.w * (useShutters ? 0.46 : 0.56));
    const wh = Math.min(f.h * 0.56, rng.float(0.62, 0.8));
    const wt = f.h - (c.isGround ? 0.4 : 0.34) - wh;

    // Wide white casing, then the sash.
    panel(item, f, bs + (bays.w - ww) / 2 - 0.07, wt - 0.07, ww + 0.14, wh + 0.14, {
      color: pal.trim, ao: 0.14, cls: 'window-casing',
    });
    windowOpening(item, f, bs + (bays.w - ww) / 2, wt, ww, wh, {
      wallColor: pal.wall,
      frameColor: pal.trim,
      glassColor: pal.glass,
      bars: glazingFor(det, pal.bars),
      frameW: 0.055,
      sill: { color: pal.trim, h: 0.075 },
      curtains: c.curtains && rng.chance(0.7)
        ? { color: shade(pal.trim, 0.86), valance: rng.chance(0.45) }
        : null,
      shutters: useShutters
        ? { color: pal.shutter, texture: { type: 'planksV', spacing: 0.09 }, iron: pal.metal, w: shW }
        : null,
    });

    if (det.dressing && c.isGround && rng.chance(0.4)) {
      windowBox(item, f, bs + (bays.w - ww) / 2, wt + wh, ww, pal, rng);
    }
  }

  if (c.isTop) eaveShadow(item, f, Math.min(f.h * 0.4, 0.28), 0.34);
  groundShadow(item, f, Math.min(f.h * 0.28, 0.2), 0.2);
}

/**
 * Coach lamp beside the front door: a small trim-coloured lantern with a warm
 * bulb behind it. Emissive, so it carries the `top` lighting class whichever
 * way the wall faces — a lit bulb isn't dimmed by which way it points.
 */
function porchLight(item, f, s, t, pal, rng) {
  const body = shade(pal.trim, 0.7);
  const bulb = hsl(44, 82, 66);
  const w = 0.1, h = 0.15;

  panel(item, f, s - 0.018, t, 0.036, 0.05, { color: body, ao: 0.14, cls: 'lamp-mount' });
  panel(item, f, s - w / 2, t + 0.04, w, 0.026, { color: body, ao: 0.12, cls: 'lamp-mount' });
  // Tapered shade: wider at the bottom, which is what makes it read as a
  // lantern rather than a switch plate.
  item.face({
    pts: localPoly(f, [
      [s - w * 0.36, t + 0.06], [s + w * 0.36, t + 0.06],
      [s + w * 0.52, t + h], [s - w * 0.52, t + h],
    ]),
    kind: f.kind, color: shade(bulb, 0.78), ao: 0.24, cls: 'lamp-glass',
  });
  panel(item, f, s - w / 2, t + h, w, 0.024, { color: body, ao: 0.12, cls: 'lamp-mount' });

  lampGlow(item, f, s, t + h * 0.62, 0.19, bulb, {
    glow: 0.42, core: 0.2, kind: 'top', cls: 'lamp',
    anim: { type: 'pulse', dur: rng.float(3.4, 5), delay: -rng.float(0, 4), lo: 0.72 },
  });
}

function windowBox(item, f, s, t, w, pal, rng) {
  panel(item, f, s - 0.05, t + 0.06, w + 0.1, 0.15, {
    color: pal.trim, texture: { type: 'planks', spacing: 0.08 }, ao: 0.22, cls: 'planter',
  });
  const n = Math.max(3, Math.round(w / 0.14));
  for (let k = 0; k < n; k++) {
    const cs = s - 0.05 + ((k + 0.5) * (w + 0.1)) / n;
    item.face({
      pts: discOn(f, cs, t + 0.05, rng.float(0.05, 0.08), 8),
      kind: f.kind, color: shade(pal.foliage, rng.float(0.9, 1.25)), ao: 0.14, cls: 'foliage',
    });
    if (rng.chance(0.6)) {
      item.face({
        pts: discOn(f, cs + rng.float(-0.03, 0.03), t + 0.02, 0.035, 7),
        kind: f.kind, color: pal.bloom, ao: 0.1, cls: 'flower',
      });
    }
  }
}

/** Sectional garage door: wide, panelled, with a trim surround. */
function garageDoor(item, f, pal, rng) {
  const dw = Math.min(f.w - 0.3, rng.float(1.15, 1.5));
  const dh = Math.min(f.h - 0.22, rng.float(0.82, 0.98));
  const s = (f.w - dw) / 2, t = f.h - dh;

  panel(item, f, s - 0.09, t - 0.09, dw + 0.18, dh + 0.09, { color: pal.trim, ao: 0.16, cls: 'door-trim' });
  panel(item, f, s, t, dw, dh, { color: shade(pal.trim, 0.94), ao: 0.3, cls: 'garage-door' });

  const rows = rng.int(3, 4), cols = rng.int(2, 3);
  for (let r = 0; r < rows; r++) {
    for (let cc = 0; cc < cols; cc++) {
      panel(item, f,
        s + 0.05 + (cc * (dw - 0.1)) / cols, t + 0.05 + (r * (dh - 0.1)) / rows,
        (dw - 0.1) / cols - 0.04, (dh - 0.1) / rows - 0.04,
        { color: shade(pal.trim, 0.88), ao: 0.18, cls: 'garage-panel' });
    }
  }
  // Top row of lights.
  if (rng.chance(0.5)) {
    for (let cc = 0; cc < cols; cc++) {
      panel(item, f,
        s + 0.07 + (cc * (dw - 0.1)) / cols, t + 0.07,
        (dw - 0.1) / cols - 0.08, (dh - 0.1) / rows - 0.1,
        { color: pal.glass, ao: 0.35, cls: 'garage-light' });
    }
  }
}

// --- roofs ---------------------------------------------------------------

function drawRoof(scene, item, b, spec, pal, rng, role, M, det) {
  const roof = spec.type === 'hip' ? hipRoof(b, { ...spec, thickness: 0.09 }) : gableRoof(b, { ...spec, thickness: 0.09 });

  for (const g0 of roof.gables) {
    const g = asFace(g0);
    item.face({
      pts: g.pts, kind: g.kind, color: pal.wall, basis: g,
      texture: { type: pal.siding, spacing: 0.19, size: 0.7 }, ao: 0.2, cls: 'gable',
    });
    // Rake trim plus a round or louvred attic vent.
    beam(item, g, 0, g.h, g.w / 2, 0, 0.1, { color: pal.trim, ao: 0.12 });
    beam(item, g, g.w / 2, 0, g.w, g.h, 0.1, { color: pal.trim, ao: 0.12 });
    if (g.h > 0.55 && rng.chance(0.7)) {
      const r = Math.min(0.2, g.h * 0.26);
      item.face({ pts: discOn(g, g.w / 2, g.h * 0.5, r, 12), kind: g.kind, color: pal.trim, ao: 0.16, cls: 'vent' });
      item.face({ pts: discOn(g, g.w / 2, g.h * 0.5, r * 0.68, 12), kind: g.kind, color: shade(pal.wall, 0.5), ao: 0.3, cls: 'vent' });
    }
  }

  const dormers = [];
  for (const s0 of roof.slopes) {
    const s = asFace(s0);
    item.face({
      pts: s.pts, kind: s.kind, color: pal.roof, basis: s,
      texture: { type: pal.roofMat }, ao: 0.18, cls: 'roof',
    });
    if (s.kind !== 'slopeBack' && s.pts.length === 4 && M.dormers && role === 'main' && s.h > 1.0 && s.w > 2.0 && rng.chance(0.7)) {
      dormers.push(s);
    }
  }
  for (const fa0 of roof.fascia) {
    const fa = asFace(fa0);
    item.face({ pts: fa.pts, kind: fa.kind, color: pal.trim, basis: fa, ao: 0.26, cls: 'fascia' });
  }
  for (const cp0 of roof.caps) {
    const cp = asFace(cp0);
    item.face({ pts: cp.pts, kind: cp.kind, color: shade(pal.roof, 0.88), basis: cp, texture: { type: 'slate' }, ao: 0.18, cls: 'ridge' });
  }

  for (const s of dormers) dormer(scene, s, pal, rng.fork('dormer'), role, det);
  return roof;
}

/** Gabled dormer standing out of the slope — same construction as medieval. */
function dormer(scene, s, pal, rng, role, det) {
  const up = [0, 0, 1];
  const dw = rng.float(0.7, 0.95);
  if (s.w < dw + 1.1) return;

  const ps = rng.float(0.5, s.w - dw - 0.5);
  const t = rng.float(0.4, 0.6) * s.h;
  const back = Math.min(0.6, t - 0.15);
  if (back < 0.28) return;

  const P = add(add(s.o, mul(s.u, ps)), mul(s.v, t));
  const B = add(P, mul(s.v, -back));
  const wallH = B[2] - P[2] + rng.float(0.32, 0.46);
  const facing = s.kind === 'slopeLeft' ? 'left' : 'right';
  const it = scene.item(`${role}-dormer`);

  const nearEnd = s.u[0] + s.u[1] > 0 ? dw : 0;
  const C = add(P, mul(s.u, nearEnd));
  const CB = add(B, mul(s.u, nearEnd));
  const cd = [B[0] - P[0], B[1] - P[1], 0];
  const cl = Math.hypot(cd[0], cd[1]) || 1;
  it.face({
    pts: [C, add(C, mul(up, wallH)), add(CB, mul(up, wallH)), CB],
    kind: facing === 'left' ? 'right' : 'left',
    color: pal.wall,
    basis: { u: [cd[0] / cl, cd[1] / cl, 0], v: [0, 0, -1] },
    texture: { type: pal.siding, spacing: 0.19, size: 0.7 },
    ao: 0.24, cls: 'dormer-cheek',
  });

  const front = { o: add(P, mul(up, wallH)), u: s.u, v: [0, 0, -1], w: dw, h: wallH, kind: facing };
  front.pts = [front.o, add(front.o, mul(s.u, dw)), add(P, mul(s.u, dw)), P];
  it.face({
    pts: front.pts, kind: facing, color: pal.wall, basis: front,
    texture: { type: pal.siding, spacing: 0.19, size: 0.7 }, ao: 0.22, cls: 'dormer-face',
  });

  const wW = dw * 0.6, wH = Math.min(wallH * 0.6, 0.46);
  panel(it, front, (dw - wW) / 2 - 0.05, wallH * 0.2 - 0.05, wW + 0.1, wH + 0.1, {
    color: pal.trim, ao: 0.12, cls: 'window-casing',
  });
  windowOpening(it, front, (dw - wW) / 2, wallH * 0.2, wW, wH, {
    wallColor: pal.wall, frameColor: pal.trim, glassColor: pal.glass,
    bars: glazingFor(det, pal.bars === 'grid' ? 'grid' : 'cross'), frameW: 0.045, cls: 'dormer-window',
  });

  const corners = [P, add(P, mul(s.u, dw)), B, add(B, mul(s.u, dw))];
  const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
  const rb = {
    x: Math.min(...xs), y: Math.min(...ys), z: P[2],
    dx: Math.max(...xs) - Math.min(...xs), dy: Math.max(...ys) - Math.min(...ys), dz: wallH,
  };
  const dr = gableRoof(rb, {
    axis: facing === 'left' ? 'y' : 'x',
    rise: dw * rng.float(0.3, 0.42), overhang: 0.12, verge: 0.1, thickness: 0.07,
  });
  for (const g0 of dr.gables) {
    const g = asFace(g0);
    it.face({ pts: g.pts, kind: g.kind, color: pal.wall, basis: g, texture: { type: pal.siding, spacing: 0.19 }, ao: 0.2, cls: 'dormer-gable' });
    beam(it, g, 0, g.h, g.w / 2, 0, 0.07, { color: pal.trim, ao: 0.12 });
    beam(it, g, g.w / 2, 0, g.w, g.h, 0.07, { color: pal.trim, ao: 0.12 });
  }
  // A dormer's back slope is buried in the main roof, which was already drawn.
  // Keeping it would paint a flap of roofing over the plane it sits in.
  for (const sl0 of dr.slopes) {
    if (sl0.kind === 'slopeBack') continue;
    const sl = asFace(sl0);
    it.face({ pts: sl.pts, kind: sl.kind, color: pal.roof, basis: sl, texture: { type: pal.roofMat }, ao: 0.16, cls: 'dormer-roof' });
  }
  for (const fa0 of dr.fascia) {
    if (fa0.back) continue;
    const fa = asFace(fa0);
    it.face({ pts: fa.pts, kind: fa.kind, color: pal.trim, basis: fa, ao: 0.24, cls: 'dormer-fascia' });
  }
}

// --- porch, bay window, chimney ------------------------------------------

/**
 * The open front porch: deck, posts, optional railing, shed roof and steps.
 * Assembled directly rather than as a storey because it has no walls — the
 * normal path would enclose it.
 */
/**
 * Basket of flowers hung from the porch beam.
 *
 * Its own item, sorted in front of the porch frame by sitting proud of it on y,
 * and everything below the hook shares one animation object so the chain, the
 * basket and the planting swing together.
 */
function hangingBasket(scene, p, deckTop, pal, rng) {
  const yFront = p.y + p.d;
  const x = p.x + p.w * (rng.chance(0.5) ? rng.float(0.1, 0.24) : rng.float(0.76, 0.9));
  const zHook = deckTop + p.postH - 0.12;
  const drop = rng.float(0.18, 0.28);
  const r = rng.float(0.11, 0.15);

  const it = scene.item('basket', [
    x - r - 0.05, yFront - 0.2, zHook - drop - r * 2.4,
    x + r + 0.05, yFront + 0.06, zHook + 0.02,
  ]);
  const swing = {
    type: 'sway', amp: rng.float(3, 5), dur: rng.float(2.8, 4),
    delay: -rng.float(0, 4), pivot: [x, yFront - 0.06, zHook],
  };

  const f = { o: [x - r, yFront - 0.06, zHook], u: [1, 0, 0], v: [0, 0, -1] };
  // Chains, then the basket, then what's growing out of it. They meet at the
  // hook and splay out to the rim — the other way round reads as a dart.
  for (const rim of [r * 0.2, r * 1.8]) {
    it.face({
      pts: localPoly(f, [[r - 0.01, 0], [r + 0.01, 0], [rim + 0.008, drop], [rim - 0.008, drop]]),
      kind: 'left', color: pal.metal, ao: 0.1, cls: 'basket-chain', anim: swing,
    });
  }
  it.face({
    pts: localPoly(f, [
      [r - r * 0.9, drop], [r + r * 0.9, drop],
      [r + r * 0.62, drop + r * 1.1], [r - r * 0.62, drop + r * 1.1],
    ]),
    kind: 'left', color: shade(pal.brick, 1.05), ao: 0.3, cls: 'basket', anim: swing,
  });
  for (let i = 0; i < rng.int(5, 8); i++) {
    it.face({
      pts: discOn(f, r + rng.gauss(0, r * 0.55), drop + rng.float(-r * 0.1, r * 1.5), rng.float(r * 0.34, r * 0.6), 8),
      kind: i % 2 ? 'left' : 'top',
      color: shade(pal.foliage, rng.float(0.85, 1.25)), ao: 0.2, cls: 'foliage', anim: swing,
    });
  }
  for (let i = 0; i < rng.int(2, 4); i++) {
    it.face({
      pts: discOn(f, r + rng.gauss(0, r * 0.6), drop + rng.float(0.2, 1.4) * r, 0.032, 7),
      kind: 'left', color: pal.bloom, ao: 0.1, cls: 'flower', anim: swing,
    });
  }
}

function frontPorch(scene, M, pal, rng) {
  const p = M.porch;
  const deckTop = p.deckH;
  const yFront = p.y + p.d;

  // Deck slab.
  volume(scene, 'porch-deck', { x: p.x, y: p.y, z: 0, dx: p.w, dy: p.d, dz: deckTop }, {
    color: pal.trim, texture: { type: 'planks', spacing: 0.13 }, ao: 0.24, cls: 'deck',
    top: { color: shade(pal.trim, 0.9), texture: { type: 'planks', spacing: 0.13 }, ao: 0.16, cls: 'deck' },
  });

  // Posts along the front edge, plus the two returns.
  const it = scene.item('porch-frame', [p.x - 0.1, p.y, deckTop, p.x + p.w + 0.1, yFront + 0.12, deckTop + p.postH + 0.1]);
  const postW = 0.11;
  const nPosts = Math.max(2, Math.round(p.w / 1.0));
  const stepX = p.x + p.w * rng.float(0.3, 0.6);
  const stepW = 0.5;

  for (let i = 0; i <= nPosts; i++) {
    const px = p.x + (i / nPosts) * (p.w - postW);
    solid(it, { x: px, y: yFront - postW, z: deckTop, dx: postW, dy: postW, dz: p.postH }, {
      color: pal.trim, ao: 0.2, cls: 'post',
    });
    // Simple capital and base blocks.
    for (const [bz, bh] of [[deckTop, 0.07], [deckTop + p.postH - 0.08, 0.08]]) {
      solid(it, { x: px - 0.02, y: yFront - postW - 0.02, z: bz, dx: postW + 0.04, dy: postW + 0.04, dz: bh }, {
        color: pal.trim, ao: 0.16, cls: 'post',
      });
    }
  }

  if (p.railed) {
    // Rail runs are broken by the step opening.
    const segs = [[p.x, stepX - p.x - 0.05], [stepX + stepW + 0.05, p.x + p.w - stepX - stepW - 0.05]];
    for (const [sx, sl] of segs) {
      if (sl < 0.25) continue;
      railing(it, [sx, yFront - postW * 0.75, deckTop], 'x', sl, p.postH * 0.52, {
        color: pal.trim, postW: 0.045, spacing: 0.17, rail: 0.055, cls: 'railing',
      });
    }
  }

  // Steps down to the ground.
  const nSteps = Math.max(2, Math.round(deckTop / 0.09));
  for (let i = 0; i < nSteps; i++) {
    const sz = (deckTop * (nSteps - i)) / nSteps;
    solid(it, { x: stepX, y: yFront + i * 0.16, z: 0, dx: stepW, dy: 0.17, dz: sz }, {
      color: shade(pal.trim, 0.92), ao: 0.24, cls: 'step',
    });
  }

  if (M.basket) hangingBasket(scene, p, deckTop, pal, rng.fork('basket'));

  // Shed roof falling toward the street.
  const rb = { x: p.x - 0.06, y: p.y, z: deckTop + p.postH, dx: p.w + 0.12, dy: p.d, dz: 0.001 };
  const roof = shedRoof(rb, { axis: 'y', rise: p.rise, overhang: 0.16, thickness: 0.08 });
  const rIt = scene.item('porch-roof');
  for (const s0 of roof.slopes) {
    const s = asFace(s0);
    rIt.face({ pts: s.pts, kind: s.kind, color: pal.roof, basis: s, texture: { type: pal.roofMat }, ao: 0.18, cls: 'roof' });
  }
  for (const g0 of roof.gables) {
    const g = asFace(g0);
    rIt.face({ pts: g.pts, kind: g.kind, color: pal.trim, basis: g, ao: 0.22, cls: 'porch-gable' });
  }
  for (const fa0 of roof.fascia) {
    const fa = asFace(fa0);
    rIt.face({ pts: fa.pts, kind: fa.kind, color: pal.trim, basis: fa, ao: 0.26, cls: 'fascia' });
  }
}

/** Three-faced bay window projecting from the front wall. */
function bayWindow(scene, M, pal, rng) {
  const b = M.bay;
  const z0 = M.main.plinthH + 0.24;
  const h = M.main.floorH - 0.42;
  const box = { x: b.x, y: M.main.d, z: z0, dx: b.w, dy: b.d, dz: h };
  const it = scene.item('bay', boxBounds(box));

  const fs = solid(it, box, {
    color: pal.wall, texture: { type: pal.siding, spacing: 0.19, size: 0.7 },
    ao: 0.22, cls: 'bay',
    top: { color: pal.roof, texture: { type: pal.roofMat }, ao: 0.16, cls: 'bay-roof' },
  });

  // Glazing on both visible faces; the front one gets the wide light.
  for (const key of ['left', 'right']) {
    const f = fs[key];
    const ww = f.w - 0.18, wh = Math.min(f.h * 0.7, 0.62);
    if (ww < 0.2) continue;
    panel(it, f, 0.09 - 0.05, 0.14 - 0.05, ww + 0.1, wh + 0.1, { color: pal.trim, ao: 0.12, cls: 'window-casing' });
    windowOpening(it, f, 0.09, 0.14, ww, wh, {
      wallColor: pal.wall, frameColor: pal.trim, glassColor: pal.glass,
      bars: key === 'left' ? pal.bars : 'mullion', frameW: 0.05,
      sill: { color: pal.trim, h: 0.06 },
    });
  }
  // Slight roof overhang so the box doesn't read as a flat pilaster.
  solid(it, { x: box.x - 0.07, y: box.y, z: z0 + h, dx: box.dx + 0.14, dy: box.dy + 0.07, dz: 0.07 }, {
    color: shade(pal.roof, 0.9), ao: 0.22, cls: 'bay-roof',
  });
}

function chimney(scene, M, pal, rng) {
  const p = M.main;
  const eaveZ = p.plinthH + p.floors * p.floorH;
  const top = eaveZ + p.roof.rise + rng.float(0.2, 0.4);
  const s = rng.float(0.42, 0.56);
  // Same rule as the medieval pack: an external stack only works on a gable
  // end that nothing else is attached to, otherwise it has no separating axis
  // and reads as a slab floating in front of the roof.
  const onX = p.roof.axis === 'x';
  const external = onX ? !M.garage : !M.porch && !M.bay;

  const b = external
    ? (onX
      ? { x: p.w, y: p.d / 2 - s / 2, z: 0, dx: s * 0.8, dy: s, dz: top }
      : { x: p.w / 2 - s / 2, y: p.d, z: 0, dx: s, dy: s * 0.8, dz: top })
    : (onX
      ? { x: p.w - s - 0.35, y: p.d / 2 - s / 2, z: eaveZ + p.roof.rise - 0.2, dx: s, dy: s, dz: top - eaveZ - p.roof.rise + 0.2 }
      : { x: p.w / 2 - s / 2, y: p.d - s - 0.35, z: eaveZ + p.roof.rise - 0.2, dx: s, dy: s, dz: top - eaveZ - p.roof.rise + 0.2 });

  const it = scene.item('chimney', boxBounds(b));
  solid(it, b, { color: pal.brick, texture: { type: 'brick' }, ao: 0.26, cls: 'chimney', faces: ['left', 'right'] });
  solid(it, { x: b.x - 0.06, y: b.y - 0.06, z: b.z + b.dz, dx: b.dx + 0.12, dy: b.dy + 0.12, dz: 0.1 }, {
    color: shade(pal.brick, 1.1), texture: { type: 'stone' }, ao: 0.2, cls: 'chimney-cap',
  });

  if (M.smoke) {
    // Thinner and slower than a medieval hearth — this is a wood burner on a
    // mild afternoon, not a bakery.
    plume(scene, b.x + b.dx / 2, b.y + b.dy / 2, b.z + b.dz + 0.24, {
      rng, color: hsl(210, 8, 90), count: 6,
      r0: 0.075, growth: 1.2, gap: 1.05, wander: 0.06,
      opacity: 0.26, falloff: 0.035, dur: rng.float(1.0, 1.4),
    });
  }
}

// --- yard ----------------------------------------------------------------

function frontPath(scene, M, pal, rng) {
  const fp = M.footprint;
  const anchor = M.porch ? M.porch.x + M.porch.w / 2 : M.main.w / 2;
  const w = rng.float(0.42, 0.6);
  groundPatch(scene, 'path', [anchor - w / 2, fp.y1, anchor + w / 2, fp.y1 + rng.float(0.8, 1.4)], {
    color: pal.path, texture: { type: 'paving', size: 0.42 }, ao: 0.1, cls: 'path',
  });
}

/** Shrubs, a mailbox, bins and an optional picket fence. */
function garden(scene, M, pal, rng, det) {
  const fp = M.footprint;

  // Foundation planting hugging the front wall.
  const bedY = M.main.d;
  const n = rng.int(...scaleCount(det, [2, 4]));
  for (let i = 0; i < n; i++) {
    const sx = rng.float(0.2, Math.max(0.25, M.main.w - 0.2));
    if (M.porch && sx > M.porch.x - 0.2 && sx < M.porch.x + M.porch.w + 0.2) continue;
    if (M.bay && sx > M.bay.x - 0.2 && sx < M.bay.x + M.bay.w + 0.2) continue;
    shrub(scene, sx, bedY + rng.float(0.18, 0.32), rng.float(0.22, 0.34), pal, rng);
  }

  const slots = scatterSlots(rng, fp, M.occupied, { count: scaleCount(det, [2, 4]), near: 0.3, far: 1.1, spacing: 0.7 });
  for (const [px, py] of slots) {
    const kind = rng.weighted({ shrub: 4, mailbox: 2, bin: 2, pot: 2, bench: 2, birdbath: 1 });
    if (kind === 'shrub') {
      shrub(scene, px, py, rng.float(0.24, 0.4), pal, rng);
    } else if (kind === 'mailbox') {
      const it = scene.item('mailbox', [px - 0.16, py - 0.12, 0, px + 0.16, py + 0.12, 0.85]);
      solid(it, { x: px - 0.035, y: py - 0.035, z: 0, dx: 0.07, dy: 0.07, dz: 0.62 }, {
        color: shade(pal.trim, 0.78), ao: 0.2, cls: 'prop',
      });
      const boxTop = 0.62 + 0.17;
      solid(it, { x: px - 0.13, y: py - 0.08, z: 0.62, dx: 0.26, dy: 0.16, dz: 0.17 }, {
        color: pal.door, ao: 0.22, cls: 'prop',
      });
      // Signal flag, up about half the time.
      if (rng.chance(0.5)) {
        solid(it, { x: px + 0.12, y: py - 0.02, z: 0.66, dx: 0.022, dy: 0.022, dz: 0.16 }, {
          color: pal.metal, ao: 0.16, cls: 'prop',
        });
        solid(it, { x: px + 0.11, y: py - 0.03, z: boxTop - 0.02, dx: 0.05, dy: 0.04, dz: 0.07 }, {
          color: hsl(4, 68, 48), ao: 0.14, cls: 'mailbox-flag',
        });
      }
    } else if (kind === 'bench') {
      // Garden bench: slatted seat, low back, painted in the trim colour.
      const w = rng.float(0.72, 0.95), h = rng.float(0.2, 0.26), d = 0.24;
      const col = shade(pal.trim, rng.float(0.82, 0.94));
      const it = scene.item('bench', [px - w / 2, py - d / 2, 0, px + w / 2, py + d / 2, h + 0.42]);
      for (const lx of [px - w / 2 + 0.04, px + w / 2 - 0.1]) {
        solid(it, { x: lx, y: py - d / 2 + 0.02, z: 0, dx: 0.06, dy: d - 0.04, dz: h }, {
          color: shade(col, 0.86), ao: 0.28, cls: 'prop',
        });
      }
      solid(it, { x: px - w / 2, y: py - d / 2, z: h, dx: w, dy: d, dz: 0.05 }, {
        color: col, texture: { type: 'planks', spacing: 0.09 }, ao: 0.22, cls: 'prop',
        top: { color: shade(col, 1.06), texture: { type: 'planks', spacing: 0.09 }, ao: 0.12, cls: 'prop' },
      });
      // Back rest, two slats with a gap — a solid panel reads as a crate.
      for (const bz of [h + 0.16, h + 0.28]) {
        solid(it, { x: px - w / 2, y: py - d / 2, z: bz, dx: w, dy: 0.05, dz: 0.08 }, {
          color: col, ao: 0.2, cls: 'prop',
        });
      }
    } else if (kind === 'birdbath') {
      const h = rng.float(0.42, 0.54), r = rng.float(0.16, 0.21);
      const it = scene.item('birdbath', [px - r, py - r, 0, px + r, py + r, h + 0.1]);
      solid(it, { x: px - 0.055, y: py - 0.055, z: 0, dx: 0.11, dy: 0.11, dz: h }, {
        color: pal.foundation, texture: { type: 'concrete', size: 0.3 }, ao: 0.26, cls: 'prop',
      });
      const bowl = cylinderFaces(px, py, h + 0.09, r, 0.09, 14);
      const body = asFace(bowl.body), top = asFace(bowl.top);
      it.face({ pts: body.pts, kind: 'right', color: pal.foundation, ao: 0.28, cls: 'prop' });
      it.face({ pts: top.pts, kind: 'top', color: shade(pal.foundation, 1.12), ao: 0.14, cls: 'prop' });
      it.face({
        pts: discOn(top, r, r, r * 0.74, 12),
        kind: 'top', color: shade(pal.glass, 0.9), ao: 0.1, opacity: 0.9, cls: 'water',
      });
    } else if (kind === 'bin') {
      const h = rng.float(0.44, 0.56);
      const cyl = cylinderFaces(px, py, h, rng.float(0.17, 0.21), h, 12);
      const it = scene.item('bin', cyl.bounds);
      const body = asFace(cyl.body), top = asFace(cyl.top);
      it.face({ pts: body.pts, kind: 'right', color: pal.metal, basis: body, texture: { type: 'ribbed', spacing: 0.1 }, ao: 0.3, cls: 'prop' });
      it.face({ pts: top.pts, kind: 'top', color: shade(pal.metal, 1.3), ao: 0.18, cls: 'prop' });
    } else {
      const h = rng.float(0.18, 0.26), r = rng.float(0.13, 0.18);
      const cyl = cylinderFaces(px, py, h, r, h, 12);
      const it = scene.item('pot', [px - r, py - r, 0, px + r, py + r, h + 0.4]);
      const body = asFace(cyl.body);
      it.face({ pts: body.pts, kind: 'right', color: pal.brick, basis: body, ao: 0.28, cls: 'prop' });
      blob(it, px, py, h, r * 1.15, pal.foliage, rng, 5);
    }
  }

  if (pal.fence) picketFence(scene, M, pal, rng);
}

/** Billboard cluster of discs — cheap, and reads as foliage at this scale. */
function blob(item, x, y, z, r, color, rng, n = 6) {
  const f = { o: [x, y, z + r * 1.4], u: [1, 0, 0], v: [0, 0, -1] };
  for (let i = 0; i < n; i++) {
    item.face({
      pts: discOn(f, rng.gauss(0, r * 0.45), r * 0.75 + rng.gauss(0, r * 0.4), rng.float(r * 0.5, r * 0.95), 9),
      kind: i % 2 ? 'left' : 'top',
      color: shade(color, rng.float(0.8, 1.3)),
      ao: 0.2, cls: 'foliage',
    });
  }
}

function shrub(scene, x, y, r, pal, rng) {
  const it = scene.item('shrub', [x - r, y - r * 0.6, 0, x + r, y + r * 0.6, r * 2.4]);
  blob(it, x, y, 0, r, pal.foliage, rng, rng.int(5, 8));
  if (rng.chance(0.35)) {
    const f = { o: [x, y, r * 1.7], u: [1, 0, 0], v: [0, 0, -1] };
    for (let i = 0; i < 4; i++) {
      it.face({
        pts: discOn(f, rng.gauss(0, r * 0.4), rng.float(0, r * 0.9), 0.035, 7),
        kind: 'left', color: pal.bloom, ao: 0.1, cls: 'flower',
      });
    }
  }
}

function picketFence(scene, M, pal, rng) {
  const fp = M.footprint;
  const y = fp.y1 + rng.float(0.9, 1.3);
  const x0 = fp.x0 - 0.2, len = fp.w * rng.float(0.55, 0.9);
  const it = scene.item('fence', [x0, y - 0.06, 0, x0 + len, y + 0.06, 0.62]);
  railing(it, [x0, y, 0], 'x', len, 0.55, {
    color: pal.trim, postW: 0.055, spacing: 0.19, rail: 0.05, bottomRail: true, cls: 'fence',
  });
}
