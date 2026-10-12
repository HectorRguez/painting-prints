/**
 * Modern city style pack.
 *
 * The shape language is different enough from the pitched-roof packs that the
 * interesting work moves elsewhere:
 *
 *   - Flat roofs, so the roof stops being a silhouette and becomes a *place*.
 *     Most of the character budget goes into rooftop plant: stair bulkhead,
 *     water tank, condenser units, vents, dish, parapet railing.
 *   - Setbacks instead of jetties. Upper storeys step *in* rather than out,
 *     which the depth sorter handles for the same reason jetties work: each
 *     storey is its own box, cleanly separated on z.
 *   - A tall ground floor with a glazed shopfront, awning and sign band, so
 *     the building reads as commercial at street level and residential above.
 *
 * Three facade treatments — punched windows, horizontal ribbons, and curtain
 * wall — do most of the work of making one block look unlike the next.
 */

import { hsl, shade, tint } from '../color.js';
import {
  boxFaces, boxBounds, flatRoof, shedRoof, rectOn, discOn, cylinderFaces, asFace,
} from '../geometry.js';
import { panel, beam, windowOpening, eaveShadow, groundShadow, layoutBays } from '../facade.js';
import { localPoly, localRect } from '../projection.js';
import {
  bounds, contactShadow, scatterSlots, solid, volume, railing, groundPatch, lampGlow,
} from './common.js';
import { resolveDetail, scaleCount } from '../detail.js';

// --- palette -------------------------------------------------------------

export function palette(rng) {
  const p = rng.fork('palette');
  const skin = p.weighted({ concrete: 5, brick: 4, render: 3, panel: 2 });

  const wall =
    skin === 'brick' ? hsl(p.float(4, 24), p.float(20, 40), p.float(32, 46))
    : skin === 'render' ? hsl(p.float(24, 54), p.float(6, 20), p.float(66, 80))
    : skin === 'panel' ? hsl(p.float(196, 224), p.float(4, 12), p.float(38, 52))
    : hsl(p.float(28, 60), p.float(3, 10), p.float(56, 70));

  const texture = { concrete: 'concrete', brick: 'brick', render: 'plaster', panel: 'ribbed' }[skin];

  // Glass is the dominant colour on a curtain-wall building, so it carries the
  // most variation: cool blue-green through to bronze.
  const glass = p.pick([
    hsl(p.float(196, 214), p.float(28, 44), p.float(40, 52)),
    hsl(p.float(168, 190), p.float(20, 34), p.float(38, 48)),
    hsl(p.float(206, 226), p.float(10, 20), p.float(30, 40)),
    hsl(p.float(30, 44), p.float(24, 38), p.float(38, 48)),
  ]);

  const accent = p.pick([
    hsl(4, 60, 42), hsl(210, 54, 42), hsl(148, 40, 34),
    hsl(38, 68, 48), hsl(268, 34, 44), hsl(190, 44, 40),
  ]);

  return {
    skin, wall, texture, glass, accent,
    // Spandrel: the opaque band between one floor's glazing and the next.
    spandrel: p.chance(0.6) ? shade(wall, 0.78) : tint(shade(wall, 0.72), 6, 4),
    trim: hsl(p.float(200, 230), p.float(3, 9), p.float(78, 88)),
    metal: hsl(p.float(200, 230), p.float(3, 10), p.float(52, 64)),
    dark: hsl(p.float(206, 232), p.float(6, 14), p.float(22, 30)),
    ground: hsl(p.float(200, 230), p.float(2, 8), p.float(40, 50)),
    facade: p.weighted({ punched: 5, ribbon: 4, curtain: 3 }),
    balconies: p.chance(0.45),
    awning: p.chance(0.6),
    signBand: p.chance(0.7),
  };
}

// --- massing -------------------------------------------------------------

export function massing(rng, opts = {}) {
  const m = rng.fork('massing');
  const floors = opts.floors ?? m.int(3, 6);
  const mw = opts.width ?? m.int(2, 4);
  const md = opts.depth ?? m.int(2, 4);
  const floorH = m.float(0.8, 0.95);
  // Retail at street level is taller than the flats above it.
  const groundH = floorH * m.float(1.25, 1.5);

  // Setback: the top storeys step in from the +x and +y faces.
  const setbackAt = m.chance(0.45) && floors >= 4 ? floors - m.int(1, 2) : -1;
  const setback = m.float(0.3, 0.55);

  const boxes = [];
  let z = 0;
  for (let i = 0; i < floors; i++) {
    const h = i === 0 ? groundH : floorH;
    const inset = setbackAt >= 0 && i >= setbackAt ? setback : 0;
    boxes.push({ x: 0, y: 0, z, dx: mw - inset, dy: md - inset, dz: h, inset });
    z += h;
  }

  const parts = [{ role: 'main', x: 0, y: 0, w: mw, d: md, floors, boxes, roof: { type: 'flat' } }];
  const occupied = [[0, 0, mw, md]];

  // Lower annex on +x — a neighbouring shopfront or a service wing.
  let annex = null;
  if (m.chance(0.45)) {
    const aw = m.float(1.3, 2.2);
    const ad = m.float(1.4, Math.max(1.5, md - 0.2));
    const ay = m.float(0, Math.max(0, md - ad));
    const af = Math.max(1, Math.min(floors - 1, m.int(1, 3)));
    const aBoxes = [];
    let az = 0;
    for (let i = 0; i < af; i++) {
      const h = i === 0 ? groundH : floorH;
      aBoxes.push({ x: mw, y: ay, z: az, dx: aw, dy: ad, dz: h, inset: 0 });
      az += h;
    }
    annex = { role: 'annex', x: mw, y: ay, w: aw, d: ad, floors: af, boxes: aBoxes, roof: { type: 'flat' } };
    parts.push(annex);
    occupied.push([mw, ay, mw + aw, ay + ad]);
  }

  return {
    parts, main: parts[0], annex, occupied,
    floorH, groundH,
    parapet: m.float(0.18, 0.32),
    roofRail: m.chance(0.5),
    // Appended, so every earlier decision — and so every existing seed's
    // massing — is untouched.
    beacon: m.chance(0.55),
    flag: m.chance(0.4),
    footprint: bounds(occupied),
  };
}

// --- build ---------------------------------------------------------------

export function build(scene, rng, opts = {}) {
  const pal = { ...palette(rng), ...opts.palette };
  const det = resolveDetail(opts.detail);
  const M = massing(rng, opts);
  const d = rng.fork('dressing');

  contactShadow(scene, M.footprint, { opacity: 0.42, spread: 0.4 });
  groundPatch(scene, 'forecourt',
    [M.footprint.x0 - 0.5, M.footprint.y1, M.footprint.x1 + 0.5, M.footprint.y1 + 1.0],
    { color: pal.ground, texture: { type: 'paving', size: 0.55 }, ao: 0.1, cls: 'pavement' });

  for (const part of M.parts) buildPart(scene, part, M, pal, d.fork(part.role), det);

  if (det.props > 0) streetProps(scene, M, pal, d.fork('props'), det);

  return {
    palette: pal,
    massing: {
      parts: M.parts.map((p) => ({ role: p.role, x: p.x, y: p.y, w: p.w, d: p.d, floors: p.floors, roof: p.roof })),
      setback: M.main.boxes.some((b) => b.inset > 0),
    },
    footprint: M.footprint,
  };
}

function buildPart(scene, part, M, pal, rng, det) {
  const isMain = part.role === 'main';

  part.boxes.forEach((b, i) => {
    const isTop = i === part.boxes.length - 1;
    const it = scene.item(`${part.role}-floor${i}`, boxBounds(b));
    const fs = boxFaces(b);

    for (const key of ['left', 'right']) {
      drawWall(it, fs[key], {
        pal, det, rng: rng.fork(`w${i}${key}`),
        isGround: i === 0, isTop, floorIndex: i,
        // The entrance goes on the front (+y) face of the main block.
        entrance: isMain && i === 0 && key === 'left',
        setback: b.inset > 0,
      });
    }

    // The awning projects off the wall, so it can't live in the wall's item.
    if (i === 0 && pal.awning) awning(scene, b, pal, rng.fork('awning'));

    // A setback storey leaves a usable terrace on the roof below it.
    if (b.inset > 0 && i > 0 && part.boxes[i - 1].inset === 0) {
      terrace(scene, part.boxes[i - 1], b, pal, rng.fork(`terr${i}`));
    }

    if (isTop) {
      roofDeck(scene, it, b, M, pal, rng.fork('roof'), part.role);
    }
  });

  // Balconies hang off the front of the main block's residential storeys.
  // Not on curtain wall — a sealed glass envelope doesn't have them, and the
  // slabs read as scaffolding bolted to a shopfront.
  if (isMain && pal.balconies && pal.facade !== 'curtain') {
    part.boxes.forEach((b, i) => {
      if (i === 0 || rng.chance(0.5)) return;
      balcony(scene, b, pal, rng.fork(`bal${i}`), i);
    });
  }
}

// --- walls ---------------------------------------------------------------

function drawWall(item, f, c) {
  const { pal, rng, det } = c;

  item.face({
    pts: f.pts, kind: f.kind, color: pal.wall, basis: f,
    texture: { type: pal.texture, size: 0.8, spacing: 0.14 },
    ao: 0.22, cls: 'wall',
  });

  if (c.isGround) {
    shopfront(item, f, c);
  } else if (pal.facade === 'curtain') {
    curtainWall(item, f, c);
  } else if (pal.facade === 'ribbon') {
    ribbonWindows(item, f, c);
  } else {
    punchedWindows(item, f, c);
  }

  // Floor line: a shallow band marks the slab edge on every storey.
  panel(item, f, 0, 0, f.w, 0.055, { color: shade(pal.wall, 0.86), ao: 0.16, cls: 'slab-band' });

  if (c.isTop) eaveShadow(item, f, Math.min(f.h * 0.3, 0.2), 0.3);
  if (c.isGround) groundShadow(item, f, Math.min(f.h * 0.22, 0.24), 0.3);

  // A downpipe on one corner, on upper storeys only.
  if (det.dressing && !c.isGround && rng.chance(0.3)) {
    const s = rng.chance(0.5) ? 0.09 : f.w - 0.13;
    panel(item, f, s, 0, 0.05, f.h, { color: pal.metal, ao: 0.2, cls: 'downpipe' });
  }
  // Split-unit air conditioners.
  if (det.dressing && !c.isGround && rng.chance(0.35)) {
    const n = rng.int(1, 2);
    for (let k = 0; k < n; k++) {
      const s = rng.float(0.15, Math.max(0.2, f.w - 0.4));
      const t = f.h * rng.float(0.55, 0.75);
      panel(item, f, s, t, 0.26, 0.17, { color: pal.trim, ao: 0.24, cls: 'ac-unit' });
      panel(item, f, s + 0.02, t + 0.02, 0.22, 0.13, { color: shade(pal.trim, 0.86), ao: 0.3, cls: 'ac-unit' });
    }
  }
}

/** Punched openings in a regular grid — the residential default. */
function punchedWindows(item, f, c) {
  const { pal, rng } = c;
  const bays = layoutBays(f.w, rng.float(0.9, 1.2));
  const wh = Math.min(f.h * 0.58, 0.6);
  const wt = f.h * 0.24;

  for (let i = 0; i < bays.n; i++) {
    if (!rng.chance(0.92)) continue;
    const ww = Math.min(bays.w * 0.62, 0.62);
    const s = i * bays.w + (bays.w - ww) / 2;
    windowOpening(item, f, s, wt, ww, wh, {
      wallColor: pal.wall,
      frameColor: pal.trim,
      glassColor: pal.glass,
      bars: rng.chance(0.5) ? 'mullion' : 'none',
      frameW: 0.045,
      sill: { color: shade(pal.wall, 0.9), h: 0.05 },
    });
  }
}

/** Continuous horizontal glazing with a spandrel band under it. */
function ribbonWindows(item, f, c) {
  const { pal, rng } = c;
  const inset = 0.16;
  const wh = Math.min(f.h * 0.5, 0.52);
  const wt = f.h * 0.26;
  const w = f.w - inset * 2;
  if (w < 0.3) return;

  panel(item, f, inset - 0.05, wt - 0.05, w + 0.1, wh + 0.1, { color: pal.dark, ao: 0.2, cls: 'window-frame' });
  panel(item, f, inset, wt, w, wh, { color: pal.glass, ao: 0.5, cls: 'window-glass' });
  // Raking highlight across the whole ribbon.
  item.face({
    pts: localPoly(f, [
      [inset, wt + wh * 0.7], [inset + w * 0.35, wt], [inset + w * 0.55, wt],
      [inset + w * 0.2, wt + wh], [inset, wt + wh],
    ]),
    kind: f.kind, color: tint(pal.glass, 0, -26, 42), ao: 0, opacity: 0.26, cls: 'window-shine',
  });
  const n = Math.max(2, Math.round(w / 0.42));
  for (let i = 1; i < n; i++) {
    beam(item, f, inset + (w * i) / n, wt, inset + (w * i) / n, wt + wh, 0.035, { color: pal.metal, ao: 0.06, cls: 'mullion' });
  }
  panel(item, f, 0, wt + wh, f.w, f.h - wt - wh, { color: pal.spandrel, ao: 0.22, cls: 'spandrel' });
}

/** Full-height glazing with a spandrel at each slab — offices. */
function curtainWall(item, f, c) {
  const { pal, rng } = c;
  const inset = 0.08;
  const w = f.w - inset * 2;
  if (w < 0.3) return;

  panel(item, f, inset, 0.05, w, f.h - 0.1, {
    color: pal.glass, texture: { type: 'glazing', cell: rng.float(0.3, 0.4) }, ao: 0.46, cls: 'window-glass',
  });
  item.face({
    pts: localPoly(f, [
      [inset, 0.05 + (f.h - 0.1) * 0.75], [inset + w * 0.4, 0.05], [inset + w * 0.62, 0.05],
      [inset + w * 0.22, f.h - 0.05], [inset, f.h - 0.05],
    ]),
    kind: f.kind, color: tint(pal.glass, 0, -30, 46), ao: 0, opacity: 0.22, cls: 'window-shine',
  });
  panel(item, f, 0, 0, f.w, 0.12, { color: pal.spandrel, ao: 0.2, cls: 'spandrel' });
  panel(item, f, 0, f.h - 0.1, f.w, 0.1, { color: pal.spandrel, ao: 0.24, cls: 'spandrel' });
}

/** Glazed retail frontage, awning, sign band and an entrance. */
function shopfront(item, f, c) {
  const { pal, rng } = c;
  const bandH = pal.signBand ? 0.22 : 0;
  const top = 0.1 + bandH;
  const glassH = f.h - top - 0.14;
  const inset = 0.12;
  const w = f.w - inset * 2;
  if (w < 0.3 || glassH < 0.2) return;

  if (pal.signBand) {
    panel(item, f, 0, 0.08, f.w, bandH, { color: pal.accent, ao: 0.2, cls: 'sign-band' });
    // Abstract lettering: blocks along the band, never real text.
    const n = rng.int(3, 6);
    for (let i = 0; i < n; i++) {
      const bw = rng.float(0.08, 0.16);
      panel(item, f, f.w * 0.2 + i * (f.w * 0.55 / n), 0.08 + bandH * 0.3, bw, bandH * 0.4,
        { color: shade(pal.accent, 2.1), ao: 0.05, cls: 'signage' });
    }
  }

  panel(item, f, inset - 0.05, top - 0.05, w + 0.1, glassH + 0.1, { color: pal.dark, ao: 0.2, cls: 'shopfront-frame' });
  panel(item, f, inset, top, w, glassH, { color: pal.glass, ao: 0.42, cls: 'shopfront-glass' });
  item.face({
    pts: localPoly(f, [
      [inset, top + glassH * 0.66], [inset + w * 0.3, top], [inset + w * 0.48, top],
      [inset + w * 0.15, top + glassH], [inset, top + glassH],
    ]),
    kind: f.kind, color: tint(pal.glass, 0, -28, 46), ao: 0, opacity: 0.24, cls: 'window-shine',
  });

  const bays = Math.max(2, Math.round(w / 0.55));
  for (let i = 1; i < bays; i++) {
    beam(item, f, inset + (w * i) / bays, top, inset + (w * i) / bays, top + glassH, 0.045,
      { color: pal.metal, ao: 0.08, cls: 'mullion' });
  }

  if (c.entrance) {
    const dw = Math.min(0.6, w * 0.3);
    const ds = inset + w * 0.5 - dw / 2;
    panel(item, f, ds, top + glassH * 0.18, dw, glassH * 0.82, { color: pal.dark, ao: 0.24, cls: 'door-frame' });
    panel(item, f, ds + 0.04, top + glassH * 0.22, dw - 0.08, glassH * 0.74, { color: shade(pal.glass, 0.82), ao: 0.4, cls: 'door-glass' });
    beam(item, f, ds + dw / 2, top + glassH * 0.22, ds + dw / 2, top + glassH * 0.96, 0.03, { color: pal.metal, ao: 0.06, cls: 'mullion' });
    // Push bars.
    for (const hs of [ds + dw * 0.34, ds + dw * 0.66]) {
      panel(item, f, hs - 0.015, top + glassH * 0.52, 0.03, 0.14, { color: pal.metal, ao: 0.1, cls: 'handle' });
    }
  }

  // Plinth below the glazing.
  panel(item, f, 0, f.h - 0.14, f.w, 0.14, { color: shade(pal.wall, 0.8), ao: 0.26, cls: 'shop-plinth' });
}

/**
 * Fabric awning over the shopfront: a sloping canopy with a scalloped valance
 * hanging off its front edge.
 *
 * Scallops are drawn as discs sitting proud of the valance's bottom edge rather
 * than cut out of it — the renderer emits single polygons, so a convex bump is
 * available and a concave notch is not.
 */
function awning(scene, b, pal, rng) {
  const y = b.y + b.dy;
  const w = b.dx * rng.float(0.6, 0.92);
  const x = b.x + (b.dx - w) / 2;
  if (w < 0.6) return;

  const proj = rng.float(0.3, 0.44);
  const drop = rng.float(0.09, 0.15);
  const zHigh = b.z + b.dz * rng.float(0.66, 0.74);
  const zLow = zHigh - drop;
  const valH = rng.float(0.09, 0.13);
  const scallop = 0.11;

  const it = scene.item('awning', [x, y, zLow - valH - scallop, x + w, y + proj, zHigh]);
  const cloth = pal.accent;

  // Canopy. Its v axis runs down the slope, so a vertical plank texture comes
  // out as the stripes running front to back that an awning actually has.
  const vLen = Math.hypot(proj, drop);
  const canopy = {
    o: [x, y, zHigh], u: [1, 0, 0], v: [0, proj / vLen, -drop / vLen],
    w, h: vLen, kind: 'slopeLeft',
  };
  canopy.pts = localRect(canopy, 0, 0, w, vLen);
  it.face({
    pts: canopy.pts, kind: 'slopeLeft', color: cloth, basis: canopy,
    texture: { type: 'planksV', spacing: rng.float(0.16, 0.24) }, ao: 0.2, cls: 'awning',
  });

  const valance = { o: [x, y + proj, zLow], u: [1, 0, 0], v: [0, 0, -1], w, h: valH, kind: 'left' };
  it.face({
    pts: rectOn(valance, 0, 0, w, valH),
    kind: 'left', color: shade(cloth, 0.9), basis: valance,
    texture: { type: 'planksV', spacing: 0.2 }, ao: 0.22, cls: 'awning-valance',
  });
  const n = Math.max(3, Math.round(w / scallop));
  for (let i = 0; i < n; i++) {
    it.face({
      pts: discOn(valance, ((i + 0.5) * w) / n, valH, w / n / 2, 9),
      kind: 'left', color: shade(cloth, 0.9), ao: 0.24, cls: 'awning-valance',
    });
  }
}

// --- roof, terrace, balcony ----------------------------------------------

function roofDeck(scene, item, b, M, pal, rng, role) {
  const roof = flatRoof(b, { parapet: M.parapet, thickness: 0.13 });

  const deck = asFace(roof.deck);
  item.face({
    pts: deck.pts, kind: 'top', color: shade(pal.wall, 0.82), basis: deck,
    texture: { type: 'concrete', size: 0.75 }, ao: 0.16, cls: 'roof-deck',
  });
  // Parapets are returned back-to-front, so plain insertion order is correct.
  for (const pb of roof.parapets) {
    solid(item, pb, { color: shade(pal.wall, 0.94), ao: 0.2, cls: 'parapet',
      top: { color: shade(pal.wall, 1.08), ao: 0.14, cls: 'parapet-cap' } });
  }

  // An annex gets a thinned-out version. Left bare it reads as an unfinished
  // slab, but it is small and low, and giving it the full kit — a stair
  // bulkhead, a water tank, a dish — makes it look like a second building
  // rather than a wing of this one.
  rooftopPlant(scene, b, roof, M, pal, rng, { light: role !== 'main' });
}

/** Bulkhead, tank, condensers, vents, dish and railing. */
function rooftopPlant(scene, b, roof, M, pal, rng, { light = false } = {}) {
  const z = roof.eaveZ;
  const inner = roof.inner;
  const free = [];
  const place = (w, d) => {
    for (let i = 0; i < 14; i++) {
      const x = rng.float(inner.x + 0.1, Math.max(inner.x + 0.1, inner.x + inner.dx - w - 0.1));
      const y = rng.float(inner.y + 0.1, Math.max(inner.y + 0.1, inner.y + inner.dy - d - 0.1));
      if (free.some((r) => x < r[2] + 0.1 && x + w > r[0] - 0.1 && y < r[3] + 0.1 && y + d > r[1] - 0.1)) continue;
      free.push([x, y, x + w, y + d]);
      return [x, y];
    }
    return null;
  };

  // A wing gets a roof hatch where the main block gets a stair bulkhead: the
  // same idea at the scale the volume can carry.
  if (light) {
    const hw = rng.float(0.34, 0.46), hd = rng.float(0.28, 0.38);
    const hp = place(hw, hd);
    if (hp) {
      const { item, faces } = volume(scene, 'roof-hatch',
        { x: hp[0], y: hp[1], z, dx: hw, dy: hd, dz: rng.float(0.07, 0.11) }, {
          color: shade(pal.wall, 0.86), ao: 0.24, cls: 'roof-hatch',
          top: { color: pal.metal, texture: { type: 'ribbed', spacing: 0.06 }, ao: 0.16, cls: 'roof-hatch' },
        });
      panel(item, faces.left, hw * 0.2, 0.02, hw * 0.6, 0.03, { color: pal.dark, ao: 0.1, cls: 'roof-hatch' });
    }
  }

  // Stair bulkhead.
  const bw = rng.float(0.7, 1.0), bd = rng.float(0.6, 0.9);
  const bp = light ? null : place(bw, bd);
  if (bp) {
    const box = { x: bp[0], y: bp[1], z, dx: bw, dy: bd, dz: rng.float(0.45, 0.68) };
    const { item, faces } = volume(scene, 'bulkhead', box, {
      color: shade(pal.wall, 0.9), texture: { type: 'concrete', size: 0.6 }, ao: 0.22, cls: 'bulkhead',
      top: { color: shade(pal.wall, 0.78), ao: 0.14, cls: 'bulkhead' },
    });
    panel(item, faces.left, bw * 0.3, box.dz * 0.18, bw * 0.4, box.dz * 0.8,
      { color: pal.metal, texture: { type: 'ribbed', spacing: 0.08 }, ao: 0.3, cls: 'roof-door' });
  }

  // Water tank on a short frame.
  if (!light && rng.chance(0.6)) {
    const r = rng.float(0.22, 0.32);
    const tp = place(r * 2, r * 2);
    if (tp) {
      const cx = tp[0] + r, cy = tp[1] + r;
      const legH = rng.float(0.12, 0.24), tankH = rng.float(0.4, 0.6);
      const it = scene.item('tank', [cx - r, cy - r, z, cx + r, cy + r, z + legH + tankH]);
      for (const [ox, oy] of [[-r * 0.6, -r * 0.6], [r * 0.45, -r * 0.6], [-r * 0.6, r * 0.45], [r * 0.45, r * 0.45]]) {
        solid(it, { x: cx + ox, y: cy + oy, z, dx: 0.06, dy: 0.06, dz: legH }, { color: pal.dark, ao: 0.2, cls: 'tank-leg' });
      }
      const cyl = cylinderFaces(cx, cy, z + legH + tankH, r, tankH, 14);
      const body = asFace(cyl.body), top = asFace(cyl.top);
      it.face({ pts: body.pts, kind: 'right', color: pal.metal, basis: body, texture: { type: 'ribbed', spacing: 0.11 }, ao: 0.3, cls: 'tank' });
      it.face({ pts: top.pts, kind: 'top', color: shade(pal.metal, 1.12), ao: 0.16, cls: 'tank' });
    }
  }

  // Condenser units.
  const nAc = light ? rng.int(1, 2) : rng.int(1, 3);
  for (let i = 0; i < nAc; i++) {
    const w = rng.float(0.34, 0.5), d = rng.float(0.28, 0.4);
    const p = place(w, d);
    if (!p) continue;
    const box = { x: p[0], y: p[1], z, dx: w, dy: d, dz: rng.float(0.2, 0.3) };
    const { item, faces } = volume(scene, 'ac', box, {
      color: pal.trim, ao: 0.24, cls: 'ac-unit',
      top: { color: shade(pal.trim, 0.92), ao: 0.14, cls: 'ac-unit' },
    });
    // Fan grille on the top face, with blades turning inside it.
    const fr = Math.min(w, d) * 0.34;
    item.face({
      pts: discOn(faces.top, w / 2, d / 2, fr, 12),
      kind: 'top', color: pal.dark, ao: 0.2, cls: 'ac-fan',
    });
    // Screen-space rotation of a top face is a stylisation — the true motion is
    // about the vertical axis — but at this size it reads as a spinning fan.
    const spin = { type: 'spin', dur: rng.pick([1.0, 1.4, 1.8]), delay: -rng.float(0, 2), reverse: rng.chance(0.5) };
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI * 2) / 3;
      item.face({
        pts: localPoly(faces.top, [
          [w / 2 + Math.cos(a) * fr * 0.14, d / 2 + Math.sin(a) * fr * 0.14],
          [w / 2 + Math.cos(a - 0.44) * fr * 0.86, d / 2 + Math.sin(a - 0.44) * fr * 0.86],
          [w / 2 + Math.cos(a + 0.24) * fr * 0.86, d / 2 + Math.sin(a + 0.24) * fr * 0.86],
        ]),
        kind: 'top', color: shade(pal.metal, 1.1), ao: 0.12, cls: 'ac-blade', anim: spin,
      });
    }
    item.face({
      pts: discOn(faces.top, w / 2, d / 2, fr * 0.16, 8),
      kind: 'top', color: shade(pal.dark, 1.3), ao: 0.1, cls: 'ac-fan',
    });
    panel(item, faces.left, 0.03, 0.04, w - 0.06, box.dz * 0.5,
      { color: shade(pal.trim, 0.86), texture: { type: 'ribbed', spacing: 0.05 }, ao: 0.2, cls: 'ac-unit' });
  }

  // Vent stacks.
  const nV = light ? rng.int(1, 2) : rng.int(1, 3);
  for (let i = 0; i < nV; i++) {
    const r = rng.float(0.06, 0.1);
    const p = place(r * 2, r * 2);
    if (!p) continue;
    const h = rng.float(0.2, 0.42);
    const cyl = cylinderFaces(p[0] + r, p[1] + r, z + h, r, h, 10);
    const it = scene.item('vent', cyl.bounds);
    const body = asFace(cyl.body), top = asFace(cyl.top);
    it.face({ pts: body.pts, kind: 'right', color: pal.metal, ao: 0.3, cls: 'vent' });
    it.face({ pts: top.pts, kind: 'top', color: pal.dark, ao: 0.16, cls: 'vent' });
  }

  // Satellite dish, flat on its mount.
  if (!light && rng.chance(0.45)) {
    const r = rng.float(0.16, 0.24);
    const p = place(r * 2, r * 2);
    if (p) {
      const cx = p[0] + r, cy = p[1] + r;
      const it = scene.item('dish', [cx - r, cy - r, z, cx + r, cy + r, z + 0.4]);
      solid(it, { x: cx - 0.04, y: cy - 0.04, z, dx: 0.08, dy: 0.08, dz: 0.22 }, { color: pal.dark, ao: 0.2, cls: 'dish' });
      const face = { o: [cx - r, cy, z + 0.42], u: [1, 0, 0], v: [0, 0, -1] };
      it.face({ pts: discOn(face, r, -r * 0.5, r, 14), kind: 'left', color: pal.trim, ao: 0.3, cls: 'dish' });
      it.face({ pts: discOn(face, r, -r * 0.5, r * 0.7, 12), kind: 'left', color: shade(pal.trim, 0.9), ao: 0.4, cls: 'dish' });
    }
  }

  // Aviation warning light on the corner of the parapet nearest the camera,
  // where nothing on the deck can hide it.
  if (M.beacon && !light) {
    const bx = b.x + b.dx - 0.14, by = b.y + b.dy - 0.14;
    const it = scene.item('beacon', [bx - 0.16, by - 0.16, roof.peakZ, bx + 0.16, by + 0.16, roof.peakZ + 0.3]);
    solid(it, { x: bx - 0.03, y: by - 0.03, z: roof.peakZ, dx: 0.06, dy: 0.06, dz: 0.14 }, {
      color: pal.dark, ao: 0.2, cls: 'beacon-post',
    });
    const lf = { o: [bx - 0.07, by, roof.peakZ + 0.21], u: [1, 0, 0], v: [0, 0, -1] };
    lampGlow(it, lf, 0.07, -0.07, 0.15, hsl(2, 84, 56), {
      glow: 0.6, core: 0.34, kind: 'top', cls: 'beacon',
      anim: { type: 'blink', dur: rng.float(1.8, 2.6), delay: -rng.float(0, 2), on: 16, lo: 0.1 },
    });
  }

  // Flag on a mast. `wave` shears about the mast, so the pivot has to be the
  // hoist edge or the flag slides off its own pole.
  if (M.flag && !light) {
    const fx = rng.float(inner.x + 0.15, Math.max(inner.x + 0.15, inner.x + inner.dx - 0.15));
    const fy = inner.y + inner.dy - rng.float(0.1, 0.3);
    const h = rng.float(0.7, 1.1);
    const it = scene.item('flag', [fx - 0.05, fy - 0.05, z, fx + 0.5, fy + 0.05, z + h + 0.05]);
    solid(it, { x: fx - 0.022, y: fy - 0.022, z, dx: 0.044, dy: 0.044, dz: h }, {
      color: pal.trim, ao: 0.22, cls: 'flag-mast',
    });
    const fw = rng.float(0.3, 0.42), fh = fw * 0.62;
    const ff = { o: [fx, fy, z + h - 0.04], u: [1, 0, 0], v: [0, 0, -1] };
    it.face({
      pts: rectOn(ff, 0, 0, fw, fh),
      kind: 'top', color: pal.accent, ao: 0.24, cls: 'flag',
      anim: {
        type: 'wave', amp: rng.float(4, 7), dur: rng.float(1.6, 2.4),
        delay: -rng.float(0, 2), pivot: [fx, fy, z + h - 0.04],
      },
    });
  }

  if (M.roofRail && !light) {
    const it = scene.item('roof-rail', [b.x, b.y, roof.peakZ, b.x + b.dx, b.y + b.dy, roof.peakZ + 0.42]);
    railing(it, [inner.x, inner.y + inner.dy, roof.peakZ], 'x', inner.dx, 0.4,
      { color: pal.metal, postW: 0.04, spacing: 0.34, rail: 0.045, bottomRail: true, cls: 'roof-rail' });
    railing(it, [inner.x + inner.dx, inner.y, roof.peakZ], 'y', inner.dy, 0.4,
      { color: pal.metal, postW: 0.04, spacing: 0.34, rail: 0.045, bottomRail: true, cls: 'roof-rail' });
  }
}

/** Usable terrace revealed by a setback, with a railing at its edge. */
function terrace(scene, below, above, pal, rng) {
  const z = below.z + below.dz;
  const it = scene.item('terrace', [below.x, below.y, z, below.x + below.dx, below.y + below.dy, z + 0.45]);
  const strip = { x: below.x, y: above.y + above.dy, z: z - 0.001, dx: below.dx, dy: below.dy - above.dy, dz: 0.001 };
  if (strip.dy > 0.05) {
    solid(it, strip, { color: shade(pal.wall, 0.8), texture: { type: 'paving', size: 0.4 }, ao: 0.14, cls: 'terrace', faces: ['top'] });
    railing(it, [below.x + 0.05, below.y + below.dy - 0.08, z], 'x', below.dx - 0.1, 0.38,
      { color: pal.metal, postW: 0.04, spacing: 0.3, rail: 0.04, bottomRail: true, cls: 'terrace-rail' });
  }
}

/** Projecting balcony slab plus railing, on the front of a storey. */
function balcony(scene, b, pal, rng, i) {
  // Shallow: a deep slab reads as a diving board, and its railing posts
  // foreshorten into something that looks like a fire escape.
  const depth = rng.float(0.2, 0.3);
  const w = b.dx * rng.float(0.4, 0.66);
  const x = b.x + rng.float(0.1, Math.max(0.1, b.dx - w - 0.1));
  const y = b.y + b.dy;
  const z = b.z + 0.06;

  const it = scene.item(`balcony${i}`, [x, y, z, x + w, y + depth, z + 0.5]);
  solid(it, { x, y, z, dx: w, dy: depth, dz: 0.09 }, {
    color: shade(pal.wall, 0.88), ao: 0.24, cls: 'balcony-slab',
    top: { color: shade(pal.wall, 0.78), ao: 0.14, cls: 'balcony-slab' },
  });
  // Solid parapet or an open rail.
  if (rng.chance(0.7)) {
    solid(it, { x, y: y + depth - 0.06, z: z + 0.07, dx: w, dy: 0.06, dz: 0.34 }, {
      color: pal.glass, opacity: 0.72, ao: 0.3, cls: 'balcony-glass',
    });
    solid(it, { x, y: y + depth - 0.07, z: z + 0.4, dx: w, dy: 0.08, dz: 0.04 }, { color: pal.metal, ao: 0.14, cls: 'balcony-rail' });
  } else {
    railing(it, [x, y + depth - 0.06, z + 0.07], 'x', w, 0.36,
      { color: pal.metal, postW: 0.035, spacing: 0.24, rail: 0.04, cls: 'balcony-rail' });
  }
}

// --- street --------------------------------------------------------------

function streetProps(scene, M, pal, rng, det) {
  const slots = scatterSlots(rng, M.footprint, M.occupied, { count: scaleCount(det, [2, 4]), near: 0.35, far: 0.95, spacing: 0.72 });
  for (const [px, py] of slots) {
    const kind = rng.weighted({ bollard: 3, planter: 3, bin: 2, lamp: 2, bench: 2, aframe: 2 });
    if (kind === 'bollard') {
      const h = rng.float(0.32, 0.42), r = 0.06;
      const cyl = cylinderFaces(px, py, h, r, h, 10);
      const it = scene.item('bollard', cyl.bounds);
      it.face({ pts: asFace(cyl.body).pts, kind: 'right', color: pal.dark, ao: 0.28, cls: 'prop' });
      it.face({ pts: asFace(cyl.top).pts, kind: 'top', color: pal.accent, ao: 0.16, cls: 'prop' });
    } else if (kind === 'planter') {
      const s = rng.float(0.32, 0.46), h = rng.float(0.24, 0.34);
      const { item, faces } = volume(scene, 'planter', { x: px - s / 2, y: py - s / 2, z: 0, dx: s, dy: s, dz: h }, {
        color: shade(pal.wall, 0.86), texture: { type: 'concrete', size: 0.4 }, ao: 0.26, cls: 'prop',
        top: { color: hsl(30, 22, 24), ao: 0.2, cls: 'soil' },
      });
      const f = { o: [px - s / 2, py, h + 0.3], u: [1, 0, 0], v: [0, 0, -1] };
      for (let k = 0; k < 5; k++) {
        item.face({
          pts: discOn(f, s / 2 + rng.gauss(0, 0.1), rng.float(0.06, 0.28), rng.float(0.08, 0.15), 8),
          kind: k % 2 ? 'left' : 'top', color: shade(hsl(120, 30, 34), rng.float(0.85, 1.25)), ao: 0.2, cls: 'foliage',
        });
      }
    } else if (kind === 'bench') {
      // Street bench: slatted timber on dark steel end frames.
      const w = rng.float(0.75, 1.0), h = rng.float(0.2, 0.25), d = 0.24;
      const wood = tint(shade(pal.wall, 0.8), 18, 12, -6);
      const it = scene.item('bench', [px - w / 2, py - d / 2, 0, px + w / 2, py + d / 2, h + 0.06]);
      for (const lx of [px - w / 2 + 0.04, px + w / 2 - 0.09]) {
        solid(it, { x: lx, y: py - d / 2 + 0.02, z: 0, dx: 0.05, dy: d - 0.04, dz: h }, {
          color: pal.dark, ao: 0.28, cls: 'prop',
        });
      }
      solid(it, { x: px - w / 2, y: py - d / 2, z: h, dx: w, dy: d, dz: 0.05 }, {
        color: wood, texture: { type: 'planks', spacing: 0.08 }, ao: 0.22, cls: 'prop',
        top: { color: shade(wood, 1.1), texture: { type: 'planks', spacing: 0.08 }, ao: 0.12, cls: 'prop' },
      });
    } else if (kind === 'aframe') {
      // Pavement sign: two boards leaning together, with abstract lettering —
      // never real text, same rule as the shopfront sign band.
      const w = rng.float(0.34, 0.46), h = rng.float(0.5, 0.66), lean = h * 0.24;
      const it = scene.item('aframe', [px - w / 2, py - lean, 0, px + w / 2, py + lean, h]);
      for (const side of [-1, 1]) {
        const boardY = py + side * lean * 0.5;
        const face = {
          o: [px - w / 2, boardY - side * lean * 0.5, h],
          u: [1, 0, 0], v: [0, side * lean / Math.hypot(lean, h), -h / Math.hypot(lean, h)],
          w, h: Math.hypot(lean, h), kind: side < 0 ? 'right' : 'left',
        };
        face.pts = localRect(face, 0, 0, face.w, face.h);
        it.face({
          pts: face.pts, kind: face.kind, color: side > 0 ? pal.dark : shade(pal.dark, 0.9),
          basis: face, ao: 0.24, cls: 'prop',
        });
        if (side > 0) {
          for (let k = 0; k < rng.int(2, 4); k++) {
            panel(it, face, w * 0.16, face.h * (0.24 + k * 0.16), w * rng.float(0.3, 0.68), face.h * 0.075,
              { color: pal.accent, ao: 0.05, cls: 'signage' });
          }
        }
      }
    } else if (kind === 'bin') {
      const h = rng.float(0.4, 0.5), r = rng.float(0.14, 0.18);
      const cyl = cylinderFaces(px, py, h, r, h, 12);
      const it = scene.item('bin', cyl.bounds);
      it.face({ pts: asFace(cyl.body).pts, kind: 'right', color: pal.metal, basis: asFace(cyl.body), texture: { type: 'ribbed', spacing: 0.07 }, ao: 0.3, cls: 'prop' });
      it.face({ pts: asFace(cyl.top).pts, kind: 'top', color: pal.dark, ao: 0.2, cls: 'prop' });
    } else {
      const h = rng.float(1.6, 2.1);
      const it = scene.item('lamp', [px - 0.2, py - 0.06, 0, px + 0.2, py + 0.06, h + 0.2]);
      solid(it, { x: px - 0.04, y: py - 0.04, z: 0, dx: 0.08, dy: 0.08, dz: h }, { color: pal.dark, ao: 0.24, cls: 'lamp' });
      solid(it, { x: px - 0.16, y: py - 0.07, z: h, dx: 0.32, dy: 0.14, dz: 0.08 }, { color: pal.metal, ao: 0.18, cls: 'lamp' });
      solid(it, { x: px - 0.13, y: py - 0.05, z: h - 0.05, dx: 0.26, dy: 0.1, dz: 0.05 }, { color: hsl(48, 60, 78), ao: 0.05, cls: 'lamp-lens' });
    }
  }
}
