/**
 * Medieval / fantasy village style pack.
 *
 * Three stages, each drawing from its own forked RNG stream so that tuning one
 * of them does not reshuffle the others:
 *
 *   palette  — the building's colour scheme
 *   massing  — volumes: a jettied floor stack, optional cross-wing, corner
 *              turret and porch, plus roof types
 *   dressing — facade grammar, roof surfaces, chimneys, signage, ground props
 *
 * Each storey is modelled as its own box rather than one tall box. That is
 * what makes jetties (upper floors overhanging the one below) fall out for
 * free, and the depth sorter handles the overlap correctly because the floors
 * are cleanly separated on z.
 */

import { hsl, shade, tint } from '../color.js';
import {
  boxFaces, boxBounds, gableRoof, hipRoof, pyramidRoof,
  rectOn, discOn, cylinderFaces, asFace,
} from '../geometry.js';
import {
  layoutBays, panel, beam, windowOpening, doorOpening, eaveShadow, groundShadow,
} from '../facade.js';
import { localPoly, at, add, sub, mul } from '../projection.js';
import { bounds, contactShadow, scatterSlots, solid, plume, lampGlow } from './common.js';
import { resolveDetail, glazingFor, scaleCount } from '../detail.js';

const ROOF_THICKNESS = { shingles: 0.1, slate: 0.07, thatch: 0.24 };

// --- palette -------------------------------------------------------------

export function palette(rng) {
  const p = rng.fork('palette');
  const roofMat = p.weighted({ shingles: 5, thatch: 3, slate: 2 });

  const roof =
    roofMat === 'thatch' ? hsl(p.float(34, 46), p.float(28, 44), p.float(48, 60))
    : roofMat === 'slate' ? hsl(p.float(202, 238), p.float(5, 16), p.float(32, 44))
    : hsl(p.float(10, 28), p.float(14, 30), p.float(28, 42));

  const timber = hsl(p.float(16, 34), p.float(22, 46), p.float(18, 30));
  // Plaster is usually warm and pale; a fifth of buildings get a cool grey
  // render instead so a street of them doesn't read as one material. The cool
  // variant is kept dark and nearly desaturated — pale blue at this lightness
  // stops looking like limewash and starts looking like glass.
  const plaster = p.chance(0.8)
    ? hsl(p.float(26, 54), p.float(12, 32), p.float(76, 91))
    : hsl(p.float(190, 230), p.float(2, 9), p.float(64, 76));

  // Shutter and signboard colours. Restricted to pigments a medieval painter
  // could actually have mixed — earths, oxides and plant dyes. Bright magenta
  // and violet are the two that most quickly make the whole street look modern.
  const accent = p.pick([
    hsl(6, 44, 34),    // oxblood
    hsl(36, 50, 40),   // ochre
    hsl(168, 28, 32),  // verdigris
    hsl(214, 32, 34),  // indigo
    hsl(96, 24, 30),   // moss green
    hsl(24, 34, 30),   // burnt umber
    hsl(200, 20, 40),  // weathered slate blue
  ]);

  return {
    roofMat, roof,
    ridge: shade(roof, 0.86),
    timber,
    timberLight: shade(timber, 1.25),
    plaster,
    stone: hsl(p.float(26, 46), p.float(5, 15), p.float(50, 64)),
    // Fired brick is its own colour, not a tint of the roof. Deriving it by
    // mixing toward red took the short way round the hue circle from a slate
    // blue roof and landed on magenta.
    brick: hsl(p.float(6, 22), p.float(26, 44), p.float(30, 42)),
    door: tint(shade(timber, 1.15), p.float(-6, 8), p.float(-4, 10)),
    accent,
    iron: hsl(p.float(200, 240), p.float(4, 10), p.float(20, 28)),
    glass: hsl(p.float(186, 216), p.float(16, 34), p.float(36, 52)),
    foliage: hsl(p.float(88, 132), p.float(24, 42), p.float(26, 38)),
    ground: hsl(p.float(30, 60), p.float(8, 20), p.float(46, 58)),
    // Chosen once per building so every window matches.
    bars: p.weighted({ leaded: 4, cross: 3, mullion: 2, bars: 1 }),
    shutters: p.chance(0.45),
    stoneGround: p.chance(0.32),
    archedDoor: p.chance(0.55),
    braceStyle: p.weighted({ corner: 3, cross: 3, chevron: 2, lozenge: 1, none: 2 }),
  };
}

// --- massing -------------------------------------------------------------

export function massing(rng, opts = {}) {
  const m = rng.fork('massing');
  const floors = opts.floors ?? Number(m.weighted({ 1: 2, 2: 6, 3: 3 }));
  // Footprint is drawn after storey count and bounded by it. A 4x4 single
  // storey puts a roof plane the size of the whole building on top of one
  // metre of wall, and reads as a mushroom rather than a cottage.
  const dims = floors === 1 ? { 2: 5, 3: 3 } : { 2: 3, 3: 5, 4: 3 };
  const mw = opts.width ?? Number(m.weighted(dims));
  const md = opts.depth ?? Number(m.weighted(dims));
  const floorH = m.float(0.9, 1.14);
  const plinthH = m.float(0.12, 0.3);
  const jetty = m.chance(0.65) ? m.float(0.06, 0.13) : 0;

  const ridgeAxis = mw === md ? m.pick(['x', 'y']) : mw > md ? 'x' : 'y';
  const span = ridgeAxis === 'x' ? md : mw;
  // Steep pitches read as medieval, but on a wide, low building an unbounded
  // span-proportional rise turns the whole thing into a mushroom. Cap it
  // against the wall height it sits on.
  const riseCap = 1.25 + floors * 0.5;

  const main = {
    role: 'main',
    x: 0, y: 0, w: mw, d: md,
    floors, floorH, plinthH, jetty,
    roof: {
      type: m.weighted({ gable: 6, hip: 3 }),
      axis: ridgeAxis,
      rise: Math.min(span * m.float(0.42, 0.72), riseCap),
      overhang: m.float(0.12, 0.22),
      verge: m.float(0.1, 0.18),
    },
  };

  const parts = [main];
  const occupied = [[0, 0, mw, md]];

  // Cross-wing on the +x side: a second gabled mass, ridge perpendicular to
  // the main one so the silhouette breaks up.
  let wing = null;
  if (m.chance(0.5) && md >= 2) {
    const wd = Math.min(md - 0.4, m.float(1.3, 2.4));
    const ww = m.float(1.2, 2.1);
    const wy = m.float(0, Math.max(0, md - wd));
    const wf = Math.max(1, floors - (m.chance(0.55) ? 1 : 0));
    wing = {
      role: 'wing',
      x: mw, y: wy, w: ww, d: wd,
      floors: wf, floorH, plinthH, jetty: jetty ? jetty * 0.6 : 0,
      roof: {
        type: m.weighted({ gable: 7, hip: 2 }),
        axis: 'y',
        rise: Math.min(ww * m.float(0.45, 0.7), 0.95 + wf * 0.3),
        overhang: m.float(0.12, 0.22),
        verge: m.float(0.1, 0.18),
      },
    };
    parts.push(wing);
    occupied.push([mw, wy, mw + ww, wy + wd]);
  }

  // Corner turret, tucked into the +x/+y corner so it stays cleanly separated
  // from the main mass on both horizontal axes and the depth sort is exact.
  if (m.chance(0.28)) {
    const s = m.float(1.0, 1.5);
    const extra = m.int(1, 2);
    parts.push({
      role: 'tower',
      x: mw, y: md, w: s, d: s,
      floors: floors + extra, floorH, plinthH, jetty: 0,
      roof: { type: 'pyramid', axis: 'x', rise: s * m.float(1.0, 1.7), overhang: m.float(0.12, 0.22) },
    });
    occupied.push([mw, md, mw + s, md + s]);
  }

  // Porch / lean-to on the +y side, one low storey.
  let porch = null;
  if (m.chance(0.42) && mw >= 2) {
    const pw = m.float(1.1, Math.min(2.0, mw - 0.3));
    const pd = m.float(0.7, 1.1);
    const px = m.float(0.15, Math.max(0.15, mw - pw - 0.15));
    porch = {
      role: 'porch',
      x: px, y: md, w: pw, d: pd,
      floors: 1, floorH: m.float(0.85, 1.0), plinthH: plinthH * 0.6, jetty: 0,
      roof: { type: 'gable', axis: 'x', rise: pd * m.float(0.45, 0.65), overhang: m.float(0.12, 0.2), verge: m.float(0.1, 0.18) },
    };
    parts.push(porch);
    occupied.push([px, md, px + pw, md + pd]);
  }

  return {
    parts, main, wing, porch, occupied,
    // The door goes on the porch if there is one, otherwise on the main
    // block's +y wall — the face most likely to read as "the front".
    doorHost: porch ? 'porch' : 'main',
    doorFace: 'left',
    chimney: m.chance(0.85),
    sign: m.chance(0.5),
    ivy: m.chance(0.28),
    // Drawn last so that adding them left every earlier decision — and so
    // every existing seed's massing — untouched.
    lantern: m.chance(0.62),
    bunting: m.chance(0.3),
    vane: m.chance(0.4),
    footprint: bounds(occupied),
  };
}

// --- build ---------------------------------------------------------------

export function build(scene, rng, opts = {}) {
  // Merged over the rolled palette rather than replacing it, so a caller can
  // force one colour — faction, season, night — without having to supply the
  // twenty others a pack needs.
  const pal = { ...palette(rng), ...opts.palette };
  const det = resolveDetail(opts.detail);
  const M = massing(rng, opts);
  const d = rng.fork('dressing');

  contactShadow(scene, M.footprint);

  for (const part of M.parts) {
    buildPart(scene, part, M, pal, d.fork(part.role), det);
  }

  if (M.chimney) chimney(scene, M, pal, d.fork('chimney'));
  if (M.sign) hangingSign(scene, M, pal, d.fork('sign'));
  if (det.props > 0) groundProps(scene, M, pal, d.fork('props'), det);

  return {
    palette: pal,
    massing: {
      parts: M.parts.map((p) => ({
        role: p.role, x: p.x, y: p.y, w: p.w, d: p.d,
        floors: p.floors, roof: p.roof,
      })),
      chimney: M.chimney, sign: M.sign, ivy: M.ivy,
      lantern: M.lantern, bunting: M.bunting, vane: M.vane,
    },
    footprint: M.footprint,
  };
}

function buildPart(scene, part, M, pal, rng, det) {
  const { x, y, w, d, floors, floorH, plinthH, jetty } = part;

  // Stone plinth. Separated below the storeys on z, so it sorts first.
  if (plinthH > 0.02) {
    const b = { x, y, z: 0, dx: w, dy: d, dz: plinthH };
    const it = scene.item(`${part.role}-plinth`, boxBounds(b));
    const fs = boxFaces(b);
    for (const f of [fs.left, fs.right]) {
      it.face({ pts: f.pts, kind: f.kind, color: pal.stone, basis: f, texture: { type: 'stone' }, ao: 0.26, cls: 'plinth' });
      groundShadow(it, f, Math.min(plinthH, 0.2), 0.35);
    }
  }

  const hasDoor = M.doorHost === part.role;

  for (let i = 0; i < floors; i++) {
    const j = jetty * i;
    const b = {
      x: x - j, y: y - j, z: plinthH + i * floorH,
      dx: w + j * 2, dy: d + j * 2, dz: floorH,
    };
    const isTop = i === floors - 1;
    const it = scene.item(`${part.role}-floor${i}`, boxBounds(b));
    const fs = boxFaces(b);

    for (const key of ['left', 'right']) {
      const f = fs[key];
      drawWall(it, f, {
        pal, det,
        rng: rng.fork(`wall${i}${key}`),
        isGround: i === 0,
        isTop,
        // The door goes on the +y wall of the ground floor of its host part.
        door: hasDoor && i === 0 && key === 'left',
        lantern: M.lantern,
        // Pennants are strung under the eave of the main block's front wall.
        bunting: M.bunting && isTop && key === 'left' && part.role === 'main',
        jetty: !isTop && jetty > 0,
        stoneWall: pal.stoneGround && i === 0,
        ivy: M.ivy && i === 0 && key === 'right',
      });
    }

    if (isTop) {
      drawRoof(scene, it, b, part.roof, pal, rng.fork('roof'), part.role, M, det);
    }
  }
}

// --- walls ---------------------------------------------------------------

function drawWall(item, f, c) {
  const { pal, rng, det } = c;
  const stone = c.stoneWall;

  item.face({
    pts: f.pts, kind: f.kind,
    color: stone ? pal.stone : pal.plaster,
    basis: f, texture: { type: stone ? 'stone' : 'plaster' },
    ao: 0.24, cls: 'wall',
  });

  const bays = layoutBays(f.w, rng.float(1.0, 1.4));
  const tb = rng.float(0.085, 0.115);

  if (!stone) timberFrame(item, f, bays, tb, pal, rng);

  // Openings, bay by bay. The door is biased toward the left half of the wall:
  // attached masses always grow off the +x side, so the low-s bays are the ones
  // least likely to end up hidden behind a wing.
  const doorBay = c.door ? rng.int(0, Math.max(0, Math.ceil(bays.n / 2) - 1)) : -1;

  // Decide every bay up front so a wall that rolled all blanks can be rescued.
  // A whole storey of dead frontage on a camera-facing wall reads as an error
  // rather than as variation.
  const open = [];
  for (let i = 0; i < bays.n; i++) open.push(i === doorBay || rng.chance(c.isGround ? 0.74 : 0.84));
  if (!open.some(Boolean)) open[rng.int(0, bays.n - 1)] = true;

  for (let i = 0; i < bays.n; i++) {
    const bs = i * bays.w;
    if (i === doorBay) {
      const dw = Math.min(0.78, bays.w * 0.62);
      const dh = Math.min(f.h - 0.22, rng.float(0.95, 1.15));
      doorOpening(item, f, bs + (bays.w - dw) / 2, f.h - dh, dw, dh, {
        wallColor: stone ? pal.stone : pal.plaster,
        frameColor: shade(pal.timber, 0.85),
        leafColor: pal.door,
        texture: { type: 'planksV', spacing: 0.13 },
        iron: pal.iron,
        arch: pal.archedDoor,
        studs: rng.chance(0.55),
        step: { color: pal.stone, texture: { type: 'stone' }, h: 0.09 },
      });
      if (c.lantern) {
        // Hang it clear of the opening, on whichever side has room for it.
        const ds = bs + (bays.w - dw) / 2;
        const right = ds + dw + 0.34 < f.w;
        doorLantern(item, f, right ? ds + dw + 0.17 : ds - 0.17, f.h - dh + 0.04, pal, rng.fork('lantern'));
      }
      continue;
    }
    if (!open[i]) continue;

    const useShutters = pal.shutters && bays.w > 1.05 && rng.chance(0.75);
    const shW = useShutters ? Math.min(0.26, bays.w * 0.16) : 0;
    const ww = Math.min(0.72, bays.w * (useShutters ? 0.44 : 0.6));
    const wh = Math.min(f.h * 0.52, rng.float(0.5, 0.7));
    const wt = f.h - (c.isGround ? 0.42 : 0.36) - wh;

    windowOpening(item, f, bs + (bays.w - ww) / 2, wt, ww, wh, {
      wallColor: stone ? pal.stone : pal.plaster,
      frameColor: stone ? shade(pal.stone, 1.1) : shade(pal.timber, 0.9),
      glassColor: pal.glass,
      arch: stone && rng.chance(0.6),
      bars: glazingFor(det, pal.bars),
      sill: { color: stone ? shade(pal.stone, 1.08) : pal.timber, h: 0.075 },
      shutters: useShutters
        ? { color: pal.accent, texture: { type: 'planksV', spacing: 0.1 }, iron: pal.iron, w: shW }
        : null,
    });

    // Flower box under an upper window: coplanar planter plus a few blooms.
    if (det.dressing && !c.isGround && rng.chance(0.3)) {
      const bx = bs + (bays.w - ww) / 2 - 0.05;
      panel(item, f, bx, wt + wh + 0.07, ww + 0.1, 0.16, {
        color: shade(pal.timber, 1.1), texture: { type: 'planks', spacing: 0.08 }, ao: 0.24, cls: 'planter',
      });
      const n = Math.max(2, Math.round(ww / 0.16));
      for (let k = 0; k < n; k++) {
        const cs = bx + ((k + 0.5) * (ww + 0.1)) / n;
        item.face({
          pts: discOn(f, cs, wt + wh + 0.06, rng.float(0.045, 0.075), 8),
          kind: f.kind, color: shade(pal.foliage, rng.float(0.85, 1.2)), ao: 0.15, cls: 'foliage',
        });
        if (rng.chance(0.55)) {
          item.face({
            pts: discOn(f, cs + rng.float(-0.03, 0.03), wt + wh + 0.03, 0.032, 7),
            kind: f.kind, color: shade(pal.accent, 1.35), ao: 0.1, cls: 'flower',
          });
        }
      }
    }
  }

  if (c.ivy && det.dressing) ivy(item, f, pal, rng);

  // Overhead occlusion: under the roof on the top storey, under the jetty
  // elsewhere. This is what stops the walls looking like flat cardboard.
  if (c.isTop) eaveShadow(item, f, Math.min(f.h * 0.45, 0.34), 0.44);
  else if (c.jetty) {
    eaveShadow(item, f, Math.min(f.h * 0.3, 0.22), 0.34);
    // Corbel brackets carrying the overhang above.
    for (const s of [0.16, f.w - 0.16]) {
      item.face({
        pts: localPoly(f, [[s - 0.09, 0], [s + 0.09, 0], [s + 0.09, 0.1], [s - 0.02, 0.3]]),
        kind: f.kind, color: pal.timber, ao: 0.2, cls: 'bracket',
      });
    }
  }
  if (c.isGround) groundShadow(item, f, Math.min(f.h * 0.3, 0.22), 0.26);
  // Over the eave shadow rather than under it — a pennant strung below the
  // eaves catches the light, it isn't in shade.
  if (c.bunting && f.w > 1.2) bunting(item, f, pal, rng.fork('bunting'));
}

/**
 * Iron bracket lantern beside the door. Coplanar with the wall, so it joins the
 * wall's own item, and the flame is emissive — lit by itself, not by the sun,
 * hence the `top` lighting class on a face that points at the camera.
 */
function doorLantern(item, f, s, t, pal, rng) {
  const iron = { color: pal.iron, ao: 0.12, cls: 'lantern' };
  const flame = hsl(38, 88, 62);

  // Bracket: a short arm off the wall with a diagonal stay under it.
  beam(item, f, s - 0.13, t, s + 0.015, t, 0.035, iron);
  beam(item, f, s - 0.13, t + 0.13, s - 0.02, t + 0.005, 0.025, iron);
  beam(item, f, s, t, s, t + 0.05, 0.02, iron);

  const w = 0.13, h = 0.19;
  panel(item, f, s - w / 2, t + 0.05, w, 0.03, { color: pal.iron, ao: 0.1, cls: 'lantern' });
  panel(item, f, s - w / 2 + 0.012, t + 0.08, w - 0.024, h - 0.06, {
    color: shade(flame, 0.72), ao: 0.2, cls: 'lantern-glass',
  });
  panel(item, f, s - w / 2, t + h + 0.02, w, 0.032, { color: pal.iron, ao: 0.1, cls: 'lantern' });
  // Glazing bars, so the pane reads as a lantern rather than a sticker.
  beam(item, f, s, t + 0.08, s, t + h + 0.02, 0.016, { color: pal.iron, ao: 0.05, cls: 'lantern' });

  lampGlow(item, f, s, t + h * 0.6, 0.24, flame, {
    glow: 0.5, core: 0.22, kind: 'top', cls: 'lamp',
    anim: { type: 'flicker', dur: rng.float(2.4, 3.6), delay: -rng.float(0, 3), lo: 0.5 },
  });
}

/**
 * A line of pennants under the eave. The cord sags on a parabola and each flag
 * swings from its own knot, staggered so the string ripples along rather than
 * flapping as one board.
 */
function bunting(item, f, pal, rng) {
  const n = Math.max(4, Math.round(f.w / 0.34));
  const t0 = Math.min(0.1, f.h * 0.12);
  const sag = Math.min(0.15, f.w * 0.05);
  const x0 = 0.08, span = f.w - 0.16;
  // Height of the cord at fraction u along the run.
  const cordT = (u) => t0 + sag * 4 * u * (1 - u);

  const cord = { color: shade(pal.timber, 0.9), ao: 0.06, cls: 'bunting-cord' };
  for (let i = 0; i < n; i++) {
    const u0 = i / n, u1 = (i + 1) / n;
    beam(item, f, x0 + u0 * span, cordT(u0), x0 + u1 * span, cordT(u1), 0.018, cord);
  }

  const cols = [shade(pal.accent, 1.55), pal.timberLight, shade(pal.accent, 1.1), shade(pal.plaster, 0.94)];
  const fw = Math.min(0.15, span / n * 0.9), fh = fw * rng.float(1.3, 1.6);
  // One amplitude and period for the whole string, so it collapses to a single
  // CSS rule; the ripple along the line comes from the staggered delay alone.
  const amp = rng.float(3.5, 5.5), dur = rng.float(2.2, 3.2);
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const s = x0 + u * span, t = cordT(u);
    item.face({
      pts: localPoly(f, [[s - fw / 2, t], [s + fw / 2, t], [s, t + fh]]),
      kind: f.kind, color: cols[i % cols.length], ao: 0.16, cls: 'pennant',
      anim: { type: 'sway', amp, dur, delay: -i * 0.28, pivot: at(f, s, t) },
    });
  }
}

/** Structural timber: plates, posts, studs and decorative bracing. */
function timberFrame(item, f, bays, tb, pal, rng) {
  const wood = { color: pal.timber, ao: 0.16 };
  const h = f.h;

  beam(item, f, 0, tb / 2, f.w, tb / 2, tb, wood);
  beam(item, f, 0, h - tb / 2, f.w, h - tb / 2, tb, wood);
  beam(item, f, tb * 0.6, 0, tb * 0.6, h, tb * 1.2, wood);
  beam(item, f, f.w - tb * 0.6, 0, f.w - tb * 0.6, h, tb * 1.2, wood);
  for (let i = 1; i < bays.n; i++) {
    beam(item, f, i * bays.w, 0, i * bays.w, h, tb * 0.72, wood);
  }

  const style = pal.braceStyle;
  const t0 = tb, t1 = h - tb;
  if (style === 'corner') {
    const r = Math.min(0.55, bays.w * 0.6, h * 0.5);
    beam(item, f, tb, t1 - r, tb + r, t1, tb * 0.7, wood);
    beam(item, f, f.w - tb, t1 - r, f.w - tb - r, t1, tb * 0.7, wood);
  } else if (style === 'cross') {
    for (let i = 0; i < bays.n; i++) {
      if (!rng.chance(0.75)) continue;
      const a = i * bays.w + tb, b = (i + 1) * bays.w - tb;
      beam(item, f, a, t0, b, t1, tb * 0.6, wood);
      beam(item, f, b, t0, a, t1, tb * 0.6, wood);
    }
  } else if (style === 'chevron') {
    for (let i = 0; i < bays.n; i++) {
      const a = i * bays.w + tb, b = (i + 1) * bays.w - tb, mid = (a + b) / 2;
      const up = rng.chance(0.5);
      beam(item, f, a, up ? t1 : t0, mid, up ? t0 : t1, tb * 0.6, wood);
      beam(item, f, mid, up ? t0 : t1, b, up ? t1 : t0, tb * 0.6, wood);
    }
  } else if (style === 'lozenge') {
    for (let i = 0; i < bays.n; i++) {
      const a = i * bays.w + tb, b = (i + 1) * bays.w - tb;
      const ms = (a + b) / 2, mt = (t0 + t1) / 2;
      beam(item, f, a, mt, ms, t0, tb * 0.55, wood);
      beam(item, f, ms, t0, b, mt, tb * 0.55, wood);
      beam(item, f, b, mt, ms, t1, tb * 0.55, wood);
      beam(item, f, ms, t1, a, mt, tb * 0.55, wood);
    }
  }
}

/** Climbing ivy: clustered discs hugging one edge of the wall. */
function ivy(item, f, pal, rng) {
  const edge = rng.chance(0.5) ? 0.12 : f.w - 0.12;
  const n = rng.int(10, 18);
  for (let i = 0; i < n; i++) {
    const t = f.h - (i / n) * f.h * rng.float(0.8, 1.0);
    const s = edge + rng.gauss(0, 0.18) + (i / n) * rng.float(-0.3, 0.3);
    item.face({
      pts: discOn(f, s, t, rng.float(0.08, 0.19), 9),
      kind: f.kind,
      color: shade(pal.foliage, rng.float(0.75, 1.25)),
      ao: 0.2, opacity: 0.95, cls: 'ivy',
    });
  }
}

// --- roofs ---------------------------------------------------------------

function drawRoof(scene, item, b, spec, pal, rng, role, M, det) {
  const thickness = ROOF_THICKNESS[pal.roofMat];
  const roof =
    spec.type === 'pyramid' ? pyramidRoof(b, { ...spec, thickness })
    : spec.type === 'hip' ? hipRoof(b, { ...spec, thickness })
    : gableRoof(b, { ...spec, thickness });

  // Gable walls first: the slope overhang laps over their top edges.
  for (const g0 of roof.gables) {
    const g = asFace(g0);
    item.face({
      pts: g.pts, kind: g.kind, color: pal.plaster, basis: g,
      texture: { type: 'plaster' }, ao: 0.22, cls: 'gable',
    });
    gableDressing(item, g, pal, rng);
  }

  const tex = { type: pal.roofMat };
  const dormers = [];
  for (const s0 of roof.slopes) {
    const s = asFace(s0);
    item.face({
      pts: s.pts, kind: s.kind, color: pal.roof, basis: s,
      texture: tex, ao: 0.2, cls: 'roof',
    });
    // Surface dressing is authored as local rectangles, so it is only safe on
    // the quadrilateral slopes — hip triangles would let it spill into space.
    const isQuad = s.pts.length === 4;
    if (det.dressing && isQuad && pal.roofMat === 'thatch' && rng.chance(0.5)) mossPatches(item, s, pal, rng);
    if (det.dressing && isQuad && pal.roofMat !== 'thatch' && rng.chance(0.4)) roofWear(item, s, pal, rng);
    if (isQuad && s.kind !== 'slopeBack' && s.h > 1.15 && s.w > 1.9 && rng.chance(0.5)) dormers.push(s);
  }

  for (const fa0 of roof.fascia) {
    const fa = asFace(fa0);
    item.face({
      pts: fa.pts, kind: fa.kind,
      color: pal.roofMat === 'thatch' ? shade(pal.roof, 0.8) : pal.timber,
      basis: fa, texture: pal.roofMat === 'thatch' ? { type: 'thatch' } : { type: 'planks', spacing: 0.1 },
      ao: 0.3, cls: 'fascia',
    });
  }
  for (const cp0 of roof.caps) {
    const cp = asFace(cp0);
    item.face({
      pts: cp.pts, kind: cp.kind, color: pal.ridge, basis: cp,
      texture: pal.roofMat === 'thatch' ? { type: 'thatch' } : { type: 'slate' },
      ao: 0.2, cls: 'ridge',
    });
  }
  if (roof.deck) {
    const dk = asFace(roof.deck);
    item.face({ pts: dk.pts, kind: dk.kind, color: pal.stone, basis: dk, texture: { type: 'stone' }, ao: 0.18, cls: 'deck' });
  }

  if (M?.vane && role === 'main') weathervane(item, b, spec, pal, rng.fork('vane'));

  // Dormers are separate items, added after the roof faces exist so they sort
  // in front of the slope they sit on.
  for (const s of dormers) dormer(scene, s, pal, rng.fork('dormer'), role, det);
  return roof;
}

/**
 * Weathervane at the near end of the ridge.
 *
 * It joins the roof's own item and is drawn last, which is all the ordering it
 * needs: it stands above every surface in that item and nothing else in the
 * scene is above the main ridge. The vane itself is a billboard — the same
 * concession foliage and smoke already make — and veers on the wind rather
 * than spinning, which is what a real one does and also what survives being
 * rotated in screen space rather than about the mast.
 */
function weathervane(item, b, spec, pal, rng) {
  const peakZ = b.z + b.dz + spec.rise;
  // Sit it toward the camera-facing end of the ridge so the roof never covers
  // it, and off the apex line of a pyramid, which has no ridge to stand on.
  const cx = spec.type === 'pyramid' ? b.x + b.dx / 2
    : spec.axis === 'x' ? b.x + b.dx * 0.82 : b.x + b.dx / 2;
  const cy = spec.type === 'pyramid' ? b.y + b.dy / 2
    : spec.axis === 'x' ? b.y + b.dy / 2 : b.y + b.dy * 0.82;

  const mastH = rng.float(0.3, 0.46);
  const zTop = peakZ + mastH;
  solid(item, { x: cx - 0.022, y: cy - 0.022, z: peakZ - 0.06, dx: 0.044, dy: 0.044, dz: mastH }, {
    color: pal.iron, ao: 0.2, cls: 'vane-mast',
  });

  // Fixed compass bars under the vane.
  const bar = { o: [cx - 0.13, cy, zTop - 0.1], u: [1, 0, 0], v: [0, 0, -1] };
  beam(item, bar, 0, 0.06, 0.26, 0.06, 0.022, { color: pal.iron, ao: 0.1, cls: 'vane' });
  beam(item, bar, 0.13, -0.02, 0.13, 0.14, 0.022, { color: pal.iron, ao: 0.1, cls: 'vane' });

  const L = rng.float(0.34, 0.44);
  const vf = { o: [cx - L / 2, cy, zTop + 0.14], u: [1, 0, 0], v: [0, 0, -1] };
  const swing = {
    type: 'sway', amp: rng.float(5, 9), dur: rng.float(4.2, 6.4),
    delay: -rng.float(0, 4), pivot: [cx, cy, zTop + 0.08],
  };
  const iron = shade(pal.iron, 1.3);
  // Arrow: tail fin, shaft, head — one anim object, so they swing as one piece.
  for (const pts of [
    [[0, 0.08], [0.14, -0.02], [0.14, 0.18]],
    [[0.12, 0.06], [L - 0.11, 0.06], [L - 0.11, 0.1], [0.12, 0.1]],
    [[L, 0.08], [L - 0.13, 0.01], [L - 0.13, 0.15]],
  ]) {
    item.face({
      pts: localPoly(vf, pts), kind: 'top', color: iron, ao: 0.18, cls: 'vane', anim: swing,
    });
  }
}

/** Gable-end detail: bracing, a vent or loft opening, sometimes a hoist beam. */
function gableDressing(item, g, pal, rng) {
  const apexS = g.w / 2;
  const wood = { color: pal.timber, ao: 0.16 };
  const tb = 0.09;

  // Rake beams following the two roof edges, plus a collar tie.
  beam(item, g, 0, g.h, apexS, 0, tb, wood);
  beam(item, g, apexS, 0, g.w, g.h, tb, wood);
  beam(item, g, 0.06, g.h - tb / 2, g.w - 0.06, g.h - tb / 2, tb, wood);

  const collarT = g.h * 0.55;
  const halfW = (apexS * (g.h - collarT)) / g.h;
  beam(item, g, apexS - halfW + 0.05, collarT, apexS + halfW - 0.05, collarT, tb * 0.75, wood);
  beam(item, g, apexS, collarT, apexS, g.h - tb, tb * 0.7, wood);

  if (rng.chance(0.55) && g.h > 0.85) {
    const w = Math.min(0.42, halfW * 1.1);
    windowOpening(item, g, apexS - w / 2, collarT * 0.34, w, Math.min(0.4, collarT * 0.5), {
      wallColor: pal.plaster,
      frameColor: shade(pal.timber, 0.9),
      glassColor: shade(pal.glass, 0.7),
      bars: 'cross',
      frameW: 0.05,
      cls: 'loft-window',
    });
  } else if (rng.chance(0.5)) {
    // Loft hatch with a hoist beam poking out of the apex.
    const w = Math.min(0.5, halfW * 1.2), h = 0.42;
    panel(item, g, apexS - w / 2, collarT * 0.4, w, h, {
      color: shade(pal.door, 0.9), texture: { type: 'planksV', spacing: 0.11 }, ao: 0.34, cls: 'hatch',
    });
    beam(item, g, apexS, 0.04, apexS, collarT * 0.4, 0.07, wood);
  }
}

/** Moss on damp thatch. Drawn as overlapping clusters — single discs read as
 *  polka dots rather than growth. */
function mossPatches(item, s, pal, rng) {
  const patches = rng.int(2, 4);
  for (let i = 0; i < patches; i++) {
    const cs = rng.float(0.2, Math.max(0.25, s.w - 0.2));
    const ct = rng.float(s.h * 0.4, s.h * 0.92);
    const scale = rng.float(0.7, 1.3);
    for (let k = 0; k < rng.int(3, 5); k++) {
      item.face({
        pts: discOn(s, cs + rng.gauss(0, 0.11) * scale, ct + rng.gauss(0, 0.07) * scale,
          rng.float(0.07, 0.15) * scale, 9),
        kind: s.kind,
        color: shade(pal.foliage, rng.float(0.9, 1.35)),
        ao: 0.1, opacity: rng.float(0.3, 0.5), cls: 'moss',
      });
    }
  }
}

/** Slight tonal variation across a tiled roof — patched or faded courses. */
function roofWear(item, s, pal, rng) {
  const n = rng.int(1, 3);
  for (let i = 0; i < n; i++) {
    const w = rng.float(0.4, Math.max(0.5, s.w * 0.4));
    const h = rng.float(0.2, Math.max(0.25, s.h * 0.4));
    item.face({
      pts: rectOn(s, rng.float(0, Math.max(0, s.w - w)), rng.float(0, Math.max(0, s.h - h)), w, h),
      kind: s.kind, color: shade(pal.roof, rng.float(0.82, 1.18)),
      ao: 0.08, opacity: 0.35, cls: 'roof-wear',
    });
  }
}

/**
 * A real dormer volume standing out of the slope, not painted onto it.
 *
 * It gets its own scene item, and it sorts correctly for free: its lowest
 * point sits partway up the slope, so its minimum z is above the storey box's
 * maximum z and the separating-axis test puts it in front of the roof. The
 * side cheek is a trapezoid whose lower edge follows the slope, so nothing
 * pokes out below the roof plane.
 */
function dormer(scene, s, pal, rng, role, det) {
  const up = [0, 0, 1];
  const dw = rng.float(0.62, 0.95);
  if (s.w < dw + 1.0) return;

  const ps = rng.float(0.45, s.w - dw - 0.45);
  const t = rng.float(0.4, 0.62) * s.h;        // distance down-slope to the front wall
  const back = Math.min(0.62, t - 0.15);       // how far back into the roof it cuts
  if (back < 0.28) return;

  const P = add(add(s.o, mul(s.u, ps)), mul(s.v, t));   // front bottom, at the u=0 edge
  const B = sub(P, mul(s.v, back));                     // back bottom, higher up the slope
  const climb = B[2] - P[2];
  const wallH = climb + rng.float(0.34, 0.5);

  const facing = s.kind === 'slopeLeft' ? 'left' : 'right';
  const it = scene.item(`${role}-dormer`);

  // Cheek: visible on whichever end of the u axis faces the camera.
  const nearEnd = s.u[0] + s.u[1] > 0 ? dw : 0;
  const C = add(P, mul(s.u, nearEnd));
  const CB = add(B, mul(s.u, nearEnd));
  const cheekDir = [B[0] - P[0], B[1] - P[1], 0];
  const cheekLen = Math.hypot(cheekDir[0], cheekDir[1]);
  it.face({
    pts: [C, add(C, mul(up, wallH)), add(CB, mul(up, wallH)), CB],
    kind: facing === 'left' ? 'right' : 'left',
    color: pal.plaster,
    basis: { u: [cheekDir[0] / cheekLen, cheekDir[1] / cheekLen, 0], v: [0, 0, -1] },
    texture: { type: 'plaster' },
    ao: 0.26, cls: 'dormer-cheek',
  });

  // Front wall, drawn in its own local space so the window code applies as-is.
  const front = {
    o: add(P, mul(up, wallH)), u: s.u, v: [0, 0, -1],
    w: dw, h: wallH, kind: facing,
  };
  front.pts = [front.o, add(front.o, mul(s.u, dw)), add(P, mul(s.u, dw)), P];
  it.face({
    pts: front.pts, kind: facing, color: pal.plaster, basis: front,
    texture: { type: 'plaster' }, ao: 0.24, cls: 'dormer-face',
  });
  const wW = dw * 0.66, wH = Math.min(wallH * 0.62, 0.5);
  windowOpening(it, front, (dw - wW) / 2, wallH * 0.22, wW, wH, {
    wallColor: pal.plaster,
    frameColor: shade(pal.timber, 0.9),
    glassColor: pal.glass,
    bars: glazingFor(det, pal.bars === 'leaded' ? 'leaded' : 'cross'),
    frameW: 0.05,
    cls: 'dormer-window',
  });
  eaveShadow(it, front, Math.min(wallH * 0.4, 0.16), 0.4);

  // Its own little gable roof, ridge perpendicular to the main one so the
  // gable end faces the camera.
  //
  // The box is derived from all four base corners rather than from P alone:
  // when the slope descends along +x the u axis is -y, so the dormer extends
  // in the negative direction and P is the max corner, not the min.
  const corners = [P, add(P, mul(s.u, dw)), B, add(B, mul(s.u, dw))];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const rb = {
    x: Math.min(...xs), y: Math.min(...ys), z: P[2],
    dx: Math.max(...xs) - Math.min(...xs),
    dy: Math.max(...ys) - Math.min(...ys),
    dz: wallH,
  };
  const dr = gableRoof(rb, {
    axis: facing === 'left' ? 'y' : 'x',
    rise: dw * rng.float(0.34, 0.5),
    overhang: 0.09, verge: 0.08,
    thickness: ROOF_THICKNESS[pal.roofMat] * 0.7,
  });
  for (const g0 of dr.gables) {
    const g = asFace(g0);
    it.face({ pts: g.pts, kind: g.kind, color: pal.plaster, basis: g, texture: { type: 'plaster' }, ao: 0.2, cls: 'dormer-gable' });
    beam(it, g, 0, g.h, g.w / 2, 0, 0.06, { color: pal.timber, ao: 0.14 });
    beam(it, g, g.w / 2, 0, g.w, g.h, 0.06, { color: pal.timber, ao: 0.14 });
  }
  // A dormer's back slope is buried in the main roof, which was already drawn.
  // Keeping it would paint a flap of roofing over the plane it sits in.
  for (const sl0 of dr.slopes) {
    if (sl0.kind === 'slopeBack') continue;
    const sl = asFace(sl0);
    it.face({ pts: sl.pts, kind: sl.kind, color: pal.roof, basis: sl, texture: { type: pal.roofMat }, ao: 0.18, cls: 'dormer-roof' });
  }
  for (const fa0 of dr.fascia) {
    if (fa0.back) continue;
    const fa = asFace(fa0);
    it.face({ pts: fa.pts, kind: fa.kind, color: pal.timber, basis: fa, ao: 0.26, cls: 'dormer-fascia' });
  }
}

// --- props ---------------------------------------------------------------

/**
 * Chimney placement is a depth-sorting problem as much as an aesthetic one.
 *
 * A stack rising out of the middle of a roof has no separating axis against
 * the storey it belongs to, so the sorter cannot know that the near slope
 * should hide its lower half — it renders as a slab floating in front of the
 * roof. Two placements avoid the situation entirely:
 *
 *   external — against the visible gable end, clear of the wall plane in x or
 *              y, so it is unambiguously in front. Also the most characteristic
 *              medieval arrangement.
 *   ridge    — starting just below the ridge line, so there is no part of it
 *              that any roof plane ought to occlude.
 */
function chimney(scene, M, pal, rng) {
  const p = M.main;
  const eaveZ = p.plinthH + p.floors * p.floorH;
  const peakZ = eaveZ + p.roof.rise;
  const s = rng.float(0.4, 0.56);
  const top = peakZ + rng.float(0.24, 0.5);
  const onX = p.roof.axis === 'x';
  // The gable end is blocked by the cross-wing (+x) or the porch (+y).
  const external = onX ? !M.wing : !M.porch;

  let b, shoulder = null;
  if (external) {
    // A chimney breast: wider *along* the wall than the shaft, but projecting
    // no further out from it, then stepping in above. Letting the base also
    // grow outward turns it into a buttress that swallows the whole gable end.
    const g = rng.float(0.11, 0.2);
    const baseZ = eaveZ * rng.float(0.48, 0.7);
    // The shaft starts where the base stops rather than running through it:
    // that gives the two boxes a clean separation on z, so the sorter draws
    // the base first instead of guessing at two overlapping solids.
    if (onX) {
      b = { x: p.w, y: p.d / 2 - s / 2, z: baseZ, dx: s * 0.85, dy: s, dz: top - baseZ };
      shoulder = { x: p.w, y: b.y - g, z: 0, dx: b.dx, dy: b.dy + g * 2, dz: baseZ };
    } else {
      b = { x: p.w / 2 - s / 2, y: p.d, z: baseZ, dx: s, dy: s * 0.85, dz: top - baseZ };
      shoulder = { x: b.x - g, y: p.d, z: 0, dx: b.dx + g * 2, dy: b.dy, dz: baseZ };
    }
  } else {
    const z0 = peakZ - 0.2;
    b = onX
      ? { x: p.w - s - 0.3, y: p.d / 2 - s / 2, z: z0, dx: s, dy: s, dz: top - z0 }
      : { x: p.w / 2 - s / 2, y: p.d - s - 0.3, z: z0, dx: s, dy: s, dz: top - z0 };
  }
  const cx = b.x, cy = b.y;
  // Against a stone ground floor a stone stack disappears into the wall, so
  // the breast always contrasts with whatever it is bonded to.
  const brick = pal.stoneGround || rng.chance(0.5) ? { type: 'brick' } : { type: 'stone' };
  const col = brick.type === 'brick' ? pal.brick : pal.stone;

  // The shoulder is its own item: it is wider than the shaft, so it needs to
  // sort independently against the wall it leans on.
  if (shoulder) {
    const sIt = scene.item('chimney-base', boxBounds(shoulder));
    const sf = boxFaces(shoulder);
    for (const f of [sf.left, sf.right, sf.top]) {
      sIt.face({ pts: f.pts, kind: f.kind, color: col, basis: f, texture: brick, ao: 0.28, cls: 'chimney' });
    }
    groundShadow(sIt, sf.left, 0.24, 0.3);
    groundShadow(sIt, sf.right, 0.24, 0.3);
  }

  const it = scene.item('chimney', boxBounds(b));
  const fs = boxFaces(b);
  for (const f of [fs.left, fs.right]) {
    it.face({ pts: f.pts, kind: f.kind, color: col, basis: f, texture: brick, ao: 0.28, cls: 'chimney' });
  }
  // Corbelled cap.
  const cap = { x: cx - 0.06, y: cy - 0.06, z: top, dx: b.dx + 0.12, dy: b.dy + 0.12, dz: 0.12 };
  const cf = boxFaces(cap);
  for (const f of [cf.left, cf.right, cf.top]) {
    it.face({ pts: f.pts, kind: f.kind, color: shade(col, 1.08), basis: f, texture: { type: 'stone' }, ao: 0.2, cls: 'chimney-cap' });
  }

  // Pots.
  const pots = rng.int(1, 2);
  for (let i = 0; i < pots; i++) {
    const px = cx + b.dx * ((i + 0.5) / pots);
    const cyl = cylinderFaces(px, cy + b.dy / 2, top + 0.32, 0.09, 0.2, 12);
    const bodyF = asFace(cyl.body), topF = asFace(cyl.top);
    it.face({ pts: bodyF.pts, kind: bodyF.kind, color: shade(col, 0.95), ao: 0.3, cls: 'chimney-pot' });
    it.face({ pts: topF.pts, kind: 'top', color: shade(col, 0.6), ao: 0.1, cls: 'chimney-pot' });
  }

  if (rng.chance(0.55)) {
    plume(scene, cx + b.dx / 2, cy + b.dy / 2, top + 0.45, {
      // Puffs overlap heavily so the column reads as one body of smoke rather
      // than a string of beads; a lazy hearth hands off about once a second.
      rng, color: hsl(216, 10, 88), count: 7,
      r0: 0.09, growth: 1.2, gap: 1.05, wander: 0.07,
      opacity: 0.34, falloff: 0.04, dur: rng.float(0.85, 1.2),
    });
  }
}

/** Bracket and swinging board on the front wall — the shop sign. */
function hangingSign(scene, M, pal, rng) {
  const host = M.porch ?? M.main;
  const y = host.y + host.d;
  // Hang it above the ground-floor ceiling line, where a real inn sign goes —
  // at head height it fouls the doorway it is advertising.
  const zTop = host.plinthH + host.floorH * (host.floors > 1 ? 1.2 : 1.0);
  let sx = host.x + rng.float(0.3, Math.max(0.35, host.w - 0.6));

  // An external chimney lands on this same wall when the ridge runs along y and
  // no porch is in the way — the two rules that put a breast on the front. It
  // occupies the middle of the wall, so a sign drawn there hangs in front of the
  // brickwork. Re-pick to one side of it; the draw only happens in that case, so
  // every other seed keeps the sign it already had.
  const frontStack = M.chimney && !M.porch && M.main.roof.axis === 'y';
  if (frontStack) {
    const mid = host.x + host.w / 2;
    const clear = 0.6;                       // half the widest breast, plus air
    // Low bound keeps the board's own half-width inside the wall corner.
    const segs = [[host.x + 0.4, mid - clear], [mid + clear, host.x + host.w - 0.55]]
      .filter((s) => s[1] > s[0]);
    // On a wall too narrow for either side, the far corner is the least bad spot.
    const seg = segs.length ? segs[segs.length > 1 ? rng.int(0, 1) : 0] : null;
    sx = seg ? rng.float(seg[0], seg[1]) : host.x + host.w - 0.5;
  }

  const reach = rng.float(0.36, 0.48);

  const it = scene.item('sign', [sx - 0.1, y, zTop - 0.85, sx + 0.14, y + reach + 0.08, zTop + 0.06]);

  // Wrought-iron bracket: arm plus a diagonal stay.
  const arm = { x: sx, y, z: zTop - 0.04, dx: 0.035, dy: reach, dz: 0.04 };
  for (const f of [boxFaces(arm).left, boxFaces(arm).right, boxFaces(arm).top]) {
    it.face({ pts: f.pts, kind: f.kind, color: pal.iron, ao: 0.14, cls: 'sign-bracket' });
  }
  // Stay, as a slender strut rather than a filled triangle — the solid form
  // reads as a black wedge stuck to the wall at this scale.
  const ay = y + reach * 0.68, az = zTop - 0.05, bz = zTop - 0.44;
  const dy = ay - y, dz = az - bz;
  const l = Math.hypot(dy, dz), t = 0.022;
  const px = (-dz / l) * t, pz = (dy / l) * t;
  it.face({
    pts: [
      [sx, y - px, bz - pz], [sx, ay - px, az - pz],
      [sx, ay + px, az + pz], [sx, y + px, bz + pz],
    ],
    kind: 'right', color: pal.iron, ao: 0.1, cls: 'sign-bracket',
  });

  // Board: a thin box so it catches the light on two faces like everything else.
  // The board is lifted well above the base accent: shutter colours are dark
  // earths, and a signboard at that value disappears against the wall.
  const boardCol = shade(pal.accent, 1.5);
  const bw = rng.float(0.5, 0.66), bh = rng.float(0.42, 0.56);
  const board = { x: sx - bw / 2 + 0.02, y: y + reach - 0.05, z: zTop - 0.09 - bh, dx: bw, dy: 0.05, dz: bh };
  const bf = boxFaces(board);
  // Everything below hangs off the eye at the end of the arm, so it all shares
  // one animation object and swings as a single piece.
  const swing = {
    type: 'sway', amp: rng.float(2.5, 4.5), dur: rng.float(3.4, 4.8),
    delay: -rng.float(0, 4), pivot: [sx, y + reach - 0.02, zTop - 0.06],
  };
  for (const f of [bf.left, bf.right, bf.top]) {
    it.face({
      pts: f.pts, kind: f.kind, color: boardCol, basis: f,
      texture: f === bf.left ? { type: 'planksV', spacing: 0.12 } : null,
      ao: 0.22, cls: 'sign-board', anim: swing,
    });
  }
  // Emblem.
  const face = bf.left;
  it.face({
    pts: discOn(face, bw / 2, bh * 0.45, Math.min(bw, bh) * 0.28, 10),
    kind: face.kind, color: rng.chance(0.5) ? shade(boardCol, 1.55) : pal.timberLight,
    ao: 0.12, cls: 'sign-emblem', anim: swing,
  });
}

/** Barrels, crates and a water butt scattered on the open ground. */
function groundProps(scene, M, pal, rng, det) {
  const slots = scatterSlots(rng, M.footprint, M.occupied, { count: scaleCount(det, [2, 5]) });

  for (const [px, py] of slots) {
    const kind = rng.weighted({ barrel: 4, crate: 3, butt: 2, logs: 2, bench: 2, sacks: 2, wheel: 1 });
    if (kind === 'barrel' || kind === 'butt') {
      const r = kind === 'butt' ? rng.float(0.24, 0.3) : rng.float(0.16, 0.22);
      const h = kind === 'butt' ? rng.float(0.5, 0.62) : rng.float(0.38, 0.5);
      const col = shade(pal.timber, rng.float(1.25, 1.6));
      const cyl = cylinderFaces(px, py, h, r, h, 14);
      const it = scene.item(kind, cyl.bounds);
      const body = asFace(cyl.body), top = asFace(cyl.top);
      it.face({ pts: body.pts, kind: 'right', color: col, basis: body, texture: { type: 'planksV', spacing: 0.09 }, ao: 0.34, cls: 'prop' });
      // Iron hoops.
      for (const ht of [h * 0.18, h * 0.72]) {
        it.face({
          pts: hoop(cyl, ht), kind: 'right', color: pal.iron, ao: 0.16, cls: 'iron',
        });
      }
      it.face({ pts: top.pts, kind: 'top', color: shade(col, kind === 'butt' ? 0.5 : 0.92), basis: top, texture: { type: 'planks', spacing: 0.09 }, ao: 0.2, cls: 'prop' });
    } else if (kind === 'crate') {
      const s = rng.float(0.32, 0.46), h = rng.float(0.3, 0.44);
      const b = { x: px - s / 2, y: py - s / 2, z: 0, dx: s, dy: s, dz: h };
      const it = scene.item('crate', boxBounds(b));
      const fs = boxFaces(b);
      const col = shade(pal.timber, rng.float(1.3, 1.7));
      for (const fc of [fs.left, fs.right, fs.top]) {
        it.face({ pts: fc.pts, kind: fc.kind, color: col, basis: fc, texture: { type: 'planks', spacing: 0.11 }, ao: 0.26, cls: 'prop' });
      }
      // Corner battens.
      for (const fc of [fs.left, fs.right]) {
        for (const sx of [0.03, fc.w - 0.07]) {
          panel(it, fc, sx, 0, 0.04, fc.h, { color: shade(col, 0.8), ao: 0.1, cls: 'prop' });
        }
      }
    } else if (kind === 'bench') {
      // Trestle bench: two slab legs and a plank top, running along x so its
      // long axis is the one the camera can see the most of.
      const w = rng.float(0.7, 1.05), h = rng.float(0.22, 0.3), d = 0.26;
      const col = shade(pal.timber, rng.float(1.3, 1.6));
      const it = scene.item('bench', [px - w / 2, py - d / 2, 0, px + w / 2, py + d / 2, h + 0.08]);
      for (const lx of [px - w / 2 + 0.05, px + w / 2 - 0.12]) {
        solid(it, { x: lx, y: py - d / 2 + 0.03, z: 0, dx: 0.07, dy: d - 0.06, dz: h }, {
          color: shade(col, 0.86), ao: 0.3, cls: 'prop',
        });
      }
      solid(it, { x: px - w / 2, y: py - d / 2, z: h, dx: w, dy: d, dz: 0.055 }, {
        color: col, texture: { type: 'planks', spacing: 0.1 }, ao: 0.24, cls: 'prop',
        top: { color: shade(col, 1.1), texture: { type: 'planks', spacing: 0.1 }, ao: 0.14, cls: 'prop' },
      });
    } else if (kind === 'sacks') {
      // Grain sacks: billboard blobs, the same concession foliage makes.
      const it = scene.item('sacks', [px - 0.3, py - 0.28, 0, px + 0.3, py + 0.28, 0.5]);
      const placed = [];
      for (let i = 0; i < rng.int(2, 3); i++) {
        placed.push([px + rng.gauss(0, 0.12), py + rng.gauss(0, 0.1), rng.float(0.3, 0.42)]);
      }
      placed.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
      const hessian = hsl(36, 18, 52);
      for (const [sx, sy, hh] of placed) {
        const r = hh * 0.5;
        const f = { o: [sx - r, sy, hh], u: [1, 0, 0], v: [0, 0, -1] };
        const col = shade(hessian, rng.float(0.92, 1.1));
        // Heavy bottom, narrower shoulder, then a rope tie — the silhouette is
        // what says "sack"; three stacked discs just say "peanut".
        it.face({ pts: discOn(f, r, hh - r, r, 10), kind: 'left', color: col, ao: 0.34, cls: 'prop' });
        it.face({ pts: discOn(f, r, hh * 0.34, r * 0.82, 9), kind: 'left', color: col, ao: 0.3, cls: 'prop' });
        it.face({
          pts: rectOn(f, r - r * 0.34, hh * 0.13, r * 0.68, 0.035),
          kind: 'left', color: shade(col, 0.7), ao: 0.2, cls: 'prop',
        });
        it.face({ pts: discOn(f, r, hh * 0.05, r * 0.36, 8), kind: 'left', color: shade(col, 1.08), ao: 0.24, cls: 'prop' });
      }
    } else if (kind === 'wheel') {
      // Cart wheel stood against the wall. Solid rather than spoked-through —
      // at this size the spokes over a dark web read as a wheel, and cutting
      // real holes would need a compound path the renderer doesn't emit.
      const r = rng.float(0.26, 0.34);
      const f = { o: [px - r, py, r * 2], u: [1, 0, 0], v: [0, 0, -1] };
      const it = scene.item('wheel', [px - r, py - 0.08, 0, px + r, py + 0.08, r * 2 + 0.05]);
      const rim = shade(pal.timber, 1.35);
      it.face({ pts: discOn(f, r, r, r, 16), kind: 'left', color: rim, ao: 0.26, cls: 'prop' });
      it.face({ pts: discOn(f, r, r, r * 0.86, 16), kind: 'left', color: shade(rim, 0.62), ao: 0.34, cls: 'prop' });
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * i) / 6;
        beam(it, f, r - Math.cos(a) * r * 0.88, r - Math.sin(a) * r * 0.88,
          r + Math.cos(a) * r * 0.88, r + Math.sin(a) * r * 0.88, 0.035,
          { color: rim, ao: 0.16, cls: 'prop' });
      }
      it.face({ pts: discOn(f, r, r, r * 0.2, 10), kind: 'left', color: pal.iron, ao: 0.2, cls: 'iron' });
    } else {
      // Split firewood stood on end. Modelled as full-height cylinders rather
      // than thin discs, which just read as pebbles from this angle.
      const n = rng.int(5, 8);
      const it = scene.item('logs', [px - 0.3, py - 0.3, 0, px + 0.3, py + 0.3, 0.45]);
      const placed = [];
      for (let i = 0; i < n; i++) {
        const lx = px + rng.gauss(0, 0.11);
        const ly = py + rng.gauss(0, 0.11);
        placed.push([lx, ly, rng.float(0.24, 0.36)]);
      }
      // Back to front, so the near logs overlap the far ones.
      placed.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
      for (const [lx, ly, lh] of placed) {
        const cyl = cylinderFaces(lx, ly, lh, 0.072, lh, 10);
        const top = asFace(cyl.top), body = asFace(cyl.body);
        it.face({ pts: body.pts, kind: 'right', color: shade(pal.timber, 1.25), basis: body, texture: { type: 'planksV', spacing: 0.07 }, ao: 0.3, cls: 'prop' });
        it.face({ pts: top.pts, kind: 'top', color: shade(pal.timber, 1.95), ao: 0.28, cls: 'prop' });
      }
    }
  }
}

/** Thin band around a cylinder body at height `ht` below its top. */
function hoop(cyl, ht) {
  const top = cyl.bounds[5];
  const pts = cyl.body.pts;
  const half = pts.length / 2;
  const front = pts.slice(0, half);
  const out = front.map((p) => [p[0], p[1], top - ht]);
  return out.concat(front.slice().reverse().map((p) => [p[0], p[1], top - ht - 0.045]));
}
