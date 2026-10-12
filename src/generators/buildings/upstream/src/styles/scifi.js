/**
 * Sci-fi / cyberpunk style pack.
 *
 * Two things drive the look, and both are cheap in this engine:
 *
 *   Cantilevers. Storey modules shift and grow as they stack, so upper volumes
 *   jut out over lower ones. It is the jetty trick from the medieval pack taken
 *   much further, and it works for the same reason: each module is its own box,
 *   cleanly separated on z, so the sorter never has to guess.
 *
 *   Emissive surfaces. Neon strips, window glow and signage are drawn with the
 *   lighting class `top` whatever direction they actually face — an emissive
 *   material isn't lit by the sun, so it shouldn't be dimmed by orientation.
 *   Each strip is a soft radial halo with a hot core laid over it.
 */

import { hsl, shade, tint } from '../color.js';
import {
  boxFaces, boxBounds, flatRoof, discOn, cylinderFaces, asFace, rectOn,
} from '../geometry.js';
import { panel, beam, eaveShadow, groundShadow, layoutBays } from '../facade.js';
import { localPoly } from '../projection.js';
import {
  bounds, contactShadow, scatterSlots, solid, volume, groundPatch, plume,
} from './common.js';
import { resolveDetail, scaleCount } from '../detail.js';

// Emissive surfaces bypass directional lighting entirely.
const EMISSIVE = 'top';

// --- palette -------------------------------------------------------------

export function palette(rng) {
  const p = rng.fork('palette');

  // Hulls stay dark and nearly colourless; all the chroma is reserved for the
  // light sources, which is what makes them read as light rather than paint.
  const hull = hsl(p.float(198, 236), p.float(6, 18), p.float(17, 27));

  const neon = p.pick([
    hsl(186, 92, 58),  // cyan
    hsl(318, 86, 62),  // magenta
    hsl(28, 94, 56),   // amber
    hsl(96, 76, 54),   // acid green
    hsl(258, 74, 64),  // violet
    hsl(8, 88, 58),    // red
  ]);
  // Secondary is pushed well round the hue circle so the two never muddle.
  const neon2 = tint(neon, p.float(120, 240), p.float(-6, 6), p.float(-4, 4));

  return {
    hull,
    hullLight: shade(hull, 1.45),
    hullDark: shade(hull, 0.66),
    panelTone: tint(hull, p.float(-10, 10), p.float(2, 10), p.float(4, 10)),
    neon, neon2,
    glass: hsl(p.float(190, 220), p.float(26, 44), p.float(20, 30)),
    metal: hsl(p.float(200, 226), p.float(3, 9), p.float(44, 56)),
    hazard: hsl(p.float(40, 52), p.float(72, 92), p.float(50, 60)),
    ground: hsl(p.float(210, 240), p.float(4, 12), p.float(22, 30)),
    // Once per building so the whole envelope agrees.
    window: p.weighted({ strip: 5, grid: 3, slit: 2 }),
    edgeLight: p.chance(0.75),
    hazardBand: p.chance(0.55),
    sign: p.chance(0.7),
    greebles: p.chance(0.8),
  };
}

// --- massing -------------------------------------------------------------

export function massing(rng, opts = {}) {
  const m = rng.fork('massing');
  const floors = opts.floors ?? m.int(3, 6);
  const mw = opts.width ?? m.int(2, 4);
  const md = opts.depth ?? m.int(2, 4);
  const floorH = m.float(0.72, 0.92);

  const boxes = [];
  let z = 0;
  let x = 0, y = 0, w = mw, d = md;
  for (let i = 0; i < floors; i++) {
    const h = i === 0 ? floorH * m.float(1.1, 1.35) : floorH;
    boxes.push({ x, y, z, dx: w, dy: d, dz: h, cantilever: i > 0 });
    z += h;
    // Every couple of storeys the module jumps: it shifts along one axis and
    // may grow, producing an overhang over the storey below.
    if (i < floors - 1 && m.chance(0.55)) {
      if (m.chance(0.5)) {
        const grow = m.float(0.2, 0.5);
        x -= grow; w += grow;
      } else {
        const grow = m.float(0.2, 0.5);
        y -= grow; d += grow;
      }
      // Occasionally pull one in instead, for a stepped profile.
      if (m.chance(0.35)) { w -= m.float(0.15, 0.4); d -= m.float(0.15, 0.4); }
      w = Math.max(1.2, w); d = Math.max(1.2, d);
    }
  }

  const fpX0 = Math.min(...boxes.map((b) => b.x));
  const fpY0 = Math.min(...boxes.map((b) => b.y));
  const parts = [{ role: 'main', x: 0, y: 0, w: mw, d: md, floors, boxes }];
  const occupied = [[fpX0, fpY0, mw, md]];

  // Service core at the +x/+y corner: narrow, taller, capped with plant.
  let core = null;
  if (m.chance(0.5)) {
    const s = m.float(0.9, 1.4);
    const cf = floors + m.int(1, 3);
    const cBoxes = [];
    let cz = 0;
    for (let i = 0; i < cf; i++) {
      cBoxes.push({ x: mw, y: md, z: cz, dx: s, dy: s, dz: floorH, cantilever: false });
      cz += floorH;
    }
    core = { role: 'core', x: mw, y: md, w: s, d: s, floors: cf, boxes: cBoxes };
    parts.push(core);
    occupied.push([mw, md, mw + s, md + s]);
  }

  // Low podium / service block on +x.
  let podium = null;
  if (m.chance(0.45)) {
    const pw = m.float(1.2, 2.0);
    const pd = m.float(1.2, Math.max(1.3, md - 0.3));
    const py = m.float(0, Math.max(0, md - pd));
    podium = {
      role: 'podium', x: mw, y: py, w: pw, d: pd, floors: 1,
      boxes: [{ x: mw, y: py, z: 0, dx: pw, dy: pd, dz: floorH * m.float(1.0, 1.4), cantilever: false }],
    };
    parts.push(podium);
    occupied.push([mw, py, mw + pw, py + pd]);
  }

  return {
    parts, main: parts[0], core, podium, occupied,
    floorH,
    parapet: m.float(0.14, 0.26),
    masts: m.int(1, 3),
    // Appended, so every earlier decision — and so every existing seed's
    // massing — is untouched.
    drone: m.chance(0.45),
    footprint: bounds(occupied),
  };
}

// --- build ---------------------------------------------------------------

export function build(scene, rng, opts = {}) {
  const pal = { ...palette(rng), ...opts.palette };
  const det = resolveDetail(opts.detail);
  const M = massing(rng, opts);
  const d = rng.fork('dressing');

  contactShadow(scene, M.footprint, { opacity: 0.5, spread: 0.45, color: hsl(230, 40, 8) });
  groundPatch(scene, 'apron',
    [M.footprint.x0 - 0.6, M.footprint.y1, M.footprint.x1 + 0.6, M.footprint.y1 + 1.1],
    { color: pal.ground, texture: { type: 'paving', size: 0.6 }, ao: 0.12, cls: 'apron' });

  for (const part of M.parts) buildPart(scene, part, M, pal, d.fork(part.role), det);

  if (pal.sign) signPylon(scene, M, pal, d.fork('sign'), det);
  if (M.drone && det.props > 0) drone(scene, M, pal, d.fork('drone'), det);
  if (det.props > 0) groundProps(scene, M, pal, d.fork('props'), det);

  return {
    palette: pal,
    massing: {
      parts: M.parts.map((p) => ({ role: p.role, x: p.x, y: p.y, w: p.w, d: p.d, floors: p.floors })),
      cantilevers: M.main.boxes.filter((b) => b.cantilever).length,
    },
    footprint: M.footprint,
  };
}

function buildPart(scene, part, M, pal, rng, det) {
  part.boxes.forEach((b, i) => {
    const isTop = i === part.boxes.length - 1;
    const it = scene.item(`${part.role}-mod${i}`, boxBounds(b));
    const fs = boxFaces(b);

    for (const key of ['left', 'right']) {
      drawWall(it, fs[key], {
        pal, det, rng: rng.fork(`w${i}${key}`),
        isGround: i === 0, isTop, index: i,
        overhang: b.cantilever && i > 0 && !isTop,
      });
    }

    if (isTop) roofDeck(scene, it, b, M, pal, rng.fork('roof'), part.role, det);

    // Hull greebles: pipework and equipment boxes bolted to the front face.
    if (det.dressing && pal.greebles && rng.chance(0.6)) {
      greebles(scene, b, pal, rng.fork(`gr${i}`), `${part.role}${i}`, det);
    }
  });
}

// --- emissive helpers ----------------------------------------------------

/**
 * A glowing strip: a soft halo, then a hot core. `f` is the face, the rest is
 * in face-local coordinates.
 */
function neonStrip(item, f, s, t, w, h, color, opts = {}) {
  const { glow = 0.4, cls = 'neon', anim = null, halo = true } = opts;
  // Bleed scales with the strip's *thickness*, never its length. Sizing it off
  // the long axis makes a three-tile light band bloom three tiles in every
  // direction and washes the whole building out.
  const bleed = Math.min(w, h) * 1.6 + 0.05;
  // Halo and core share one animation object so they brighten together — a
  // core pulsing inside a steady halo reads as a rendering fault.
  if (halo) {
    item.face({
      pts: rectOn(f, s - bleed, t - bleed, w + bleed * 2, h + bleed * 2),
      kind: EMISSIVE, color, soft: true, softOpacity: glow, ao: 0, cls: `${cls}-glow`, anim,
    });
  }
  item.face({
    pts: rectOn(f, s, t, w, h),
    kind: EMISSIVE, color: shade(color, 1.35), ao: 0, cls, anim,
  });
}

/**
 * How a light behaves. Most just breathe; a small share of tubes have gone bad
 * and gutter instead, which is most of what sells the district as lived-in.
 *
 * Periods come from a fixed ladder rather than a continuous range, and that is
 * deliberate. A facade here can carry forty lights, and drawing `dur` from
 * `rng.float()` gives forty specs that differ in the third decimal, so none of
 * them collapse and the stylesheet grows a rule per window. Quantising the
 * period and leaving the *delay* continuous keeps one rule per behaviour while
 * every light still runs out of step with its neighbours — which is the part
 * anyone can actually see.
 */
const PULSE_PERIODS = [1.9, 2.4, 3.1];
const SLOW_PERIODS = [3.4, 4.3, 5.2];
const FLICKER_PERIODS = [1.5, 2.3, 3.1];

function lightAnim(rng, { flicker = 0.14, lo = 0.75, slow = false } = {}) {
  if (rng.chance(flicker)) {
    return {
      type: 'flicker', dur: rng.pick(FLICKER_PERIODS),
      delay: -rng.float(0, 4), lo: rng.chance(0.5) ? 0.3 : 0.45,
    };
  }
  return {
    type: 'pulse', dur: rng.pick(slow ? SLOW_PERIODS : PULSE_PERIODS),
    delay: -rng.float(0, 5), lo,
  };
}

// --- walls ---------------------------------------------------------------

function drawWall(item, f, c) {
  const { pal, rng, det } = c;

  item.face({
    pts: f.pts, kind: f.kind, color: pal.hull, basis: f,
    texture: { type: 'techPanel', size: rng.float(0.36, 0.5) },
    ao: 0.26, cls: 'hull',
  });

  // Frame the module: a lighter rib around the top and bottom edges.
  panel(item, f, 0, 0, f.w, 0.07, { color: pal.panelTone, ao: 0.18, cls: 'rib' });
  panel(item, f, 0, f.h - 0.07, f.w, 0.07, { color: pal.hullDark, ao: 0.2, cls: 'rib' });

  if (pal.window === 'strip') stripWindows(item, f, c);
  else if (pal.window === 'grid') gridWindows(item, f, c);
  else slitWindows(item, f, c);

  // Edge lighting along the module's floor line.
  if (pal.edgeLight && !c.isGround) {
    neonStrip(item, f, 0.06, 0.03, f.w - 0.12, 0.035, pal.neon, {
      glow: 0.42, cls: 'edge-light', halo: det.glow,
      anim: lightAnim(rng, { flicker: 0.1, slow: true }),
    });
  }

  if (c.isGround && pal.hazardBand) {
    panel(item, f, 0, f.h - 0.2, f.w, 0.13, {
      color: pal.hazard, texture: { type: 'hazard', spacing: 0.15 }, ao: 0.18, cls: 'hazard',
    });
  }

  // Vertical conduit runs.
  if (rng.chance(0.5)) {
    const s = rng.chance(0.5) ? 0.1 : f.w - 0.18;
    for (let k = 0; k < 2; k++) {
      panel(item, f, s + k * 0.07, 0, 0.045, f.h, { color: pal.metal, ao: 0.24, cls: 'conduit' });
    }
  }
  // Access hatch.
  if (rng.chance(0.3)) {
    const s = rng.float(0.2, Math.max(0.25, f.w - 0.5));
    panel(item, f, s, f.h * 0.5, 0.3, 0.22, { color: pal.hullDark, ao: 0.3, cls: 'hatch' });
    panel(item, f, s + 0.03, f.h * 0.5 + 0.03, 0.24, 0.16, {
      color: pal.panelTone, texture: { type: 'ribbed', spacing: 0.05 }, ao: 0.22, cls: 'hatch',
    });
  }

  if (c.overhang || c.isTop) eaveShadow(item, f, Math.min(f.h * 0.35, 0.24), 0.45);
  if (c.isGround) groundShadow(item, f, Math.min(f.h * 0.25, 0.26), 0.35);
}

/** One continuous recessed light band per module. */
function stripWindows(item, f, c) {
  const { pal, rng } = c;
  const inset = 0.16;
  const w = f.w - inset * 2;
  const h = Math.min(f.h * 0.34, 0.34);
  const t = f.h * rng.float(0.26, 0.4);
  if (w < 0.3) return;

  panel(item, f, inset - 0.04, t - 0.04, w + 0.08, h + 0.08, { color: pal.hullDark, ao: 0.3, cls: 'window-recess' });
  panel(item, f, inset, t, w, h, { color: pal.glass, ao: 0.44, cls: 'window-glass' });
  // Interior light bleeding out along the bottom of the recess.
  neonStrip(item, f, inset, t + h - 0.05, w, 0.05, pal.neon2, {
    glow: 0.34, cls: 'window-light', halo: c.det.glow,
    anim: lightAnim(rng, { flicker: 0.12, slow: true }),
  });
  const n = Math.max(2, Math.round(w / 0.45));
  for (let i = 1; i < n; i++) {
    beam(item, f, inset + (w * i) / n, t, inset + (w * i) / n, t + h, 0.04, { color: pal.hull, ao: 0.1, cls: 'mullion' });
  }
}

/** Regular cells of lit and dark glass — habitation blocks. */
function gridWindows(item, f, c) {
  const { pal, rng } = c;
  const bays = layoutBays(f.w, rng.float(0.55, 0.8));
  const h = Math.min(f.h * 0.42, 0.4);
  const t = f.h * 0.28;
  for (let i = 0; i < bays.n; i++) {
    const ww = bays.w * 0.6;
    const s = i * bays.w + (bays.w - ww) / 2;
    panel(item, f, s - 0.03, t - 0.03, ww + 0.06, h + 0.06, { color: pal.hullDark, ao: 0.28, cls: 'window-recess' });
    // A minority of cells are lit; a fully lit facade reads as a light box.
    // Lit cells still get their glass pane, with the emissive core inset
    // inside it — otherwise the whole aperture is one flat slab of colour and
    // stops reading as a window.
    panel(item, f, s, t, ww, h, { color: pal.glass, ao: 0.45, cls: 'window-glass' });
    if (rng.chance(0.4)) {
      const m = Math.min(ww, h) * 0.16;
      neonStrip(item, f, s + m, t + m, ww - m * 2, h - m * 2,
        rng.chance(0.7) ? pal.neon2 : pal.neon,
        { glow: 0.26, cls: 'window-light', halo: c.det.glow, anim: lightAnim(rng, { flicker: 0.16 }) });
    }
  }
}

/** Narrow vertical slits — industrial and defensive. */
function slitWindows(item, f, c) {
  const { pal, rng } = c;
  const bays = layoutBays(f.w, rng.float(0.4, 0.6));
  const h = Math.min(f.h * 0.5, 0.46);
  const t = f.h * 0.26;
  for (let i = 0; i < bays.n; i++) {
    const ww = Math.min(0.11, bays.w * 0.25);
    const s = i * bays.w + (bays.w - ww) / 2;
    panel(item, f, s - 0.03, t - 0.03, ww + 0.06, h + 0.06, { color: pal.hullDark, ao: 0.26, cls: 'window-recess' });
    neonStrip(item, f, s, t, ww, h, pal.neon2, {
      glow: 0.26, cls: 'window-light', halo: c.det.glow,
      anim: lightAnim(rng, { flicker: 0.14 }),
    });
  }
}

// --- roof ----------------------------------------------------------------

function roofDeck(scene, item, b, M, pal, rng, role, det) {
  const roof = flatRoof(b, { parapet: M.parapet, thickness: 0.12 });
  const deck = asFace(roof.deck);
  item.face({
    pts: deck.pts, kind: 'top', color: pal.hullDark, basis: deck,
    texture: { type: 'techPanel', size: 0.5 }, ao: 0.18, cls: 'roof-deck',
  });
  for (const pb of roof.parapets) {
    solid(item, pb, { color: pal.hull, ao: 0.22, cls: 'parapet',
      top: { color: pal.panelTone, ao: 0.14, cls: 'parapet-cap' } });
  }

  const z = roof.eaveZ;
  const inner = roof.inner;

  // Antenna masts, tallest on the service core.
  const nMasts = role === 'core' ? M.masts + 1 : Math.max(0, M.masts - 1);
  for (let i = 0; i < nMasts; i++) {
    const mx = rng.float(inner.x + 0.1, Math.max(inner.x + 0.1, inner.x + inner.dx - 0.15));
    const my = rng.float(inner.y + 0.1, Math.max(inner.y + 0.1, inner.y + inner.dy - 0.15));
    const h = rng.float(0.8, 2.2);
    const it = scene.item('mast', [mx - 0.1, my - 0.1, z, mx + 0.1, my + 0.1, z + h + 0.2]);
    solid(it, { x: mx - 0.035, y: my - 0.035, z, dx: 0.07, dy: 0.07, dz: h }, { color: pal.metal, ao: 0.26, cls: 'mast' });
    // Cross-arms.
    for (let k = 0; k < rng.int(1, 3); k++) {
      const az = z + h * rng.float(0.4, 0.9);
      solid(it, { x: mx - 0.13, y: my - 0.02, z: az, dx: 0.26, dy: 0.04, dz: 0.035 }, { color: pal.metal, ao: 0.2, cls: 'mast' });
    }
    // Aircraft warning lamp. Each mast blinks on its own offset — a rooftop of
    // lamps flashing in unison reads as one object, not as separate masts.
    const lf = { o: [mx - 0.05, my, z + h + 0.09], u: [1, 0, 0], v: [0, 0, -1] };
    const flash = { type: 'blink', dur: rng.pick([1.7, 2.2, 2.7]), delay: -rng.float(0, 3), on: 14, lo: 0.14 };
    it.face({ pts: discOn(lf, 0.05, -0.05, 0.1, 10), kind: EMISSIVE, color: pal.neon, soft: true, softOpacity: 0.55, ao: 0, cls: 'beacon-glow', anim: flash });
    it.face({ pts: discOn(lf, 0.05, -0.05, 0.035, 8), kind: EMISSIVE, color: shade(pal.neon, 1.5), ao: 0, cls: 'beacon', anim: flash });
  }

  // Cooling stacks and a dish.
  for (let i = 0; i < rng.int(1, 3); i++) {
    const r = rng.float(0.12, 0.2);
    const cx = rng.float(inner.x + r, Math.max(inner.x + r, inner.x + inner.dx - r));
    const cy = rng.float(inner.y + r, Math.max(inner.y + r, inner.y + inner.dy - r));
    const h = rng.float(0.24, 0.5);
    const cyl = cylinderFaces(cx, cy, z + h, r, h, 12);
    const it = scene.item('cooler', cyl.bounds);
    const body = asFace(cyl.body), top = asFace(cyl.top);
    it.face({ pts: body.pts, kind: 'right', color: pal.metal, basis: body, texture: { type: 'ribbed', spacing: 0.08 }, ao: 0.3, cls: 'cooler' });
    it.face({ pts: top.pts, kind: 'top', color: pal.hullDark, ao: 0.18, cls: 'cooler' });
    it.face({
      pts: discOn(top, r, r, r * 0.6, 10), kind: EMISSIVE, color: pal.neon2,
      soft: true, softOpacity: det.glow ? 0.4 : 0, ao: 0, cls: 'cooler-glow',
      anim: { type: 'pulse', dur: rng.pick(PULSE_PERIODS), delay: -rng.float(0, 3), lo: 0.5 },
    });
  }
}

// --- signage and greebles ------------------------------------------------

/**
 * Vertical sign pylon on the front face: a dark blade carrying stacked glyph
 * blocks. Deliberately abstract — never real lettering.
 */
function signPylon(scene, M, pal, rng, det) {
  const host = M.main;
  const b0 = host.boxes[0];
  const y = b0.y + b0.dy;
  const topZ = host.boxes[Math.min(host.boxes.length - 1, 2)].z + 0.4;
  const h = rng.float(1.2, Math.max(1.3, topZ));
  const w = rng.float(0.28, 0.42);
  const x = b0.x + rng.float(0.15, Math.max(0.2, b0.dx - w - 0.15));
  const z = rng.float(0.6, 1.0);

  const it = scene.item('sign', [x, y, z, x + w, y + 0.16, z + h]);
  const { faces } = { faces: solid(it, { x, y, z, dx: w, dy: 0.12, dz: h }, {
    color: pal.hullDark, ao: 0.26, cls: 'sign-blade',
  }) };

  const face = faces.left;
  const glyphs = rng.int(3, 6);
  const gh = (h - 0.12) / glyphs;
  for (let i = 0; i < glyphs; i++) {
    const gw = w * rng.float(0.4, 0.7);
    neonStrip(it, face, (w - gw) / 2, 0.06 + i * gh + gh * 0.18, gw, gh * 0.56,
      rng.chance(0.7) ? pal.neon : pal.neon2,
      { glow: 0.44, cls: 'glyph', halo: det.glow, anim: lightAnim(rng, { flicker: 0.2, lo: 0.55 }) });
  }
  // Edge tube down the blade's outer face.
  neonStrip(it, faces.right, 0.02, 0.06, 0.035, h - 0.12, pal.neon2, {
    glow: 0.4, cls: 'sign-edge', halo: det.glow,
    anim: lightAnim(rng, { flicker: 0.1, lo: 0.55 }),
  });
}

/**
 * Courier drone holding station off the front of the building.
 *
 * It sorts trivially: it hovers clear of the footprint on +y, so the separating
 * axis puts it in front of everything without any special case. The whole craft
 * shares one animation object — rotors turning while the hull bobs would need
 * two nested transforms, and a drone that moves as one piece is the more
 * convincing of the two.
 */
function drone(scene, M, pal, rng, det) {
  const fp = M.footprint;
  const x = rng.float(fp.x0 + 0.2, fp.x1 - 0.2);
  const y = fp.y1 + rng.float(0.5, 1.0);
  const z = rng.float(1.4, 2.8);
  const w = rng.float(0.26, 0.36), d = 0.16, h = 0.075;

  const it = scene.item('drone', [x - w, y - 0.3, z - 0.2, x + w, y + 0.3, z + 0.3]);
  const float = { type: 'bob', amp: rng.float(2.5, 5), dur: rng.float(2.2, 3.6), delay: -rng.float(0, 3) };

  // Faces are pushed through `solid` into a temporary item so they can all be
  // tagged with one animation object afterwards.
  const hull = { x: x - w / 2, y: y - d / 2, z, dx: w, dy: d, dz: h };
  const parts = [hull,
    { x: x - w / 2 - 0.05, y: y - 0.02, z: z + h - 0.02, dx: 0.06, dy: 0.05, dz: 0.03 },
    { x: x + w / 2 - 0.01, y: y - 0.02, z: z + h - 0.02, dx: 0.06, dy: 0.05, dz: 0.03 },
  ];
  const stage = { faces: [], face(f) { this.faces.push(f); return this; } };
  for (const b of parts) {
    solid(stage, b, {
      color: pal.hullDark, texture: { type: 'techPanel', size: 0.14 }, ao: 0.26, cls: 'drone',
      top: { color: pal.panelTone, ao: 0.16, cls: 'drone' },
    });
  }
  // Running light on the belly, and a sensor eye on the front face.
  const belly = { o: [x - 0.09, y, z - 0.02], u: [1, 0, 0], v: [0, 0, -1] };
  stage.face({
    pts: discOn(belly, 0.09, -0.09, 0.18, 12), kind: EMISSIVE, color: pal.neon,
    soft: true, softOpacity: 0.5, ao: 0, cls: 'drone-light',
  });
  stage.face({
    pts: discOn(belly, 0.09, -0.09, 0.045, 8), kind: EMISSIVE, color: shade(pal.neon, 1.5),
    ao: 0, cls: 'drone-light',
  });

  for (const f of stage.faces) it.face({ ...f, anim: float });
}

/** Pipework and equipment bolted onto the front of a module. */
function greebles(scene, b, pal, rng, tag, det) {
  const y = b.y + b.dy;
  const it = scene.item(`greeble-${tag}`, [b.x, y, b.z, b.x + b.dx, y + 0.34, b.z + b.dz]);

  const n = rng.int(1, 3);
  for (let i = 0; i < n; i++) {
    const kind = rng.weighted({ box: 4, pipe: 3, fan: 2 });
    const px = b.x + rng.float(0.12, Math.max(0.15, b.dx - 0.5));
    if (kind === 'box') {
      const w = rng.float(0.22, 0.4), h = rng.float(0.18, 0.3), d = rng.float(0.1, 0.2);
      const z = b.z + rng.float(0.15, Math.max(0.2, b.dz - h - 0.1));
      solid(it, { x: px, y, z, dx: w, dy: d, dz: h }, {
        color: pal.panelTone, texture: { type: 'techPanel', size: 0.22 }, ao: 0.26, cls: 'greeble',
      });
    } else if (kind === 'pipe') {
      const d = rng.float(0.08, 0.14);
      solid(it, { x: px, y, z: b.z + 0.04, dx: d, dy: d, dz: b.dz - 0.08 }, {
        color: pal.metal, ao: 0.28, cls: 'pipe',
      });
      // Collars.
      for (let k = 0; k < 2; k++) {
        const cz = b.z + b.dz * (0.3 + k * 0.4);
        solid(it, { x: px - 0.02, y, z: cz, dx: d + 0.04, dy: d + 0.02, dz: 0.05 }, { color: pal.hullDark, ao: 0.2, cls: 'pipe' });
      }
    } else {
      const s = rng.float(0.2, 0.3);
      const z = b.z + rng.float(0.12, Math.max(0.15, b.dz - s - 0.1));
      const faces = solid(it, { x: px, y, z, dx: s, dy: 0.1, dz: s }, {
        color: pal.hullDark, ao: 0.28, cls: 'greeble',
      });
      const fr = s * 0.34;
      it.face({
        pts: discOn(faces.left, s / 2, s / 2, fr, 10),
        kind: faces.left.kind, color: pal.metal, ao: 0.3, cls: 'fan',
      });
      // Extractor blades. This face points at the camera, so a screen-space
      // rotation is very nearly the true motion here.
      const spin = { type: 'spin', dur: rng.pick([0.8, 1.1, 1.5]), delay: -rng.float(0, 2), reverse: rng.chance(0.5) };
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        it.face({
          pts: localPoly(faces.left, [
            [s / 2 + Math.cos(a) * fr * 0.16, s / 2 + Math.sin(a) * fr * 0.16],
            [s / 2 + Math.cos(a - 0.5) * fr * 0.92, s / 2 + Math.sin(a - 0.5) * fr * 0.92],
            [s / 2 + Math.cos(a + 0.28) * fr * 0.92, s / 2 + Math.sin(a + 0.28) * fr * 0.92],
          ]),
          kind: faces.left.kind, color: shade(pal.hullDark, 1.3), ao: 0.2, cls: 'fan-blade', anim: spin,
        });
      }
    }
  }
}

// --- ground --------------------------------------------------------------

function groundProps(scene, M, pal, rng, det) {
  const slots = scatterSlots(rng, M.footprint, M.occupied, { count: scaleCount(det, [2, 4]), near: 0.3, far: 1.0, spacing: 0.7 });
  for (const [px, py] of slots) {
    const kind = rng.weighted({ crate: 4, tank: 3, post: 2, vent: 2 });
    if (kind === 'crate') {
      const s = rng.float(0.34, 0.5), h = rng.float(0.28, 0.42);
      const { item, faces } = volume(scene, 'crate', { x: px - s / 2, y: py - s / 2, z: 0, dx: s, dy: s, dz: h }, {
        color: pal.panelTone, texture: { type: 'techPanel', size: 0.24 }, ao: 0.28, cls: 'prop',
        top: { color: pal.hullDark, ao: 0.18, cls: 'prop' },
      });
      panel(item, faces.left, 0.04, h * 0.3, s - 0.08, 0.07, {
        color: pal.hazard, texture: { type: 'hazard', spacing: 0.09 }, ao: 0.14, cls: 'hazard',
      });
    } else if (kind === 'tank') {
      const r = rng.float(0.16, 0.24), h = rng.float(0.45, 0.7);
      const cyl = cylinderFaces(px, py, h, r, h, 12);
      const it = scene.item('tank', cyl.bounds);
      const body = asFace(cyl.body), top = asFace(cyl.top);
      it.face({ pts: body.pts, kind: 'right', color: pal.metal, basis: body, texture: { type: 'ribbed', spacing: 0.09 }, ao: 0.32, cls: 'prop' });
      it.face({ pts: top.pts, kind: 'top', color: pal.hullDark, ao: 0.18, cls: 'prop' });
      neonStrip(it, { ...body, w: r * 2, h }, 0, h * 0.35, r * 1.6, 0.045, pal.neon2, {
        glow: 0.34, cls: 'tank-light', halo: det.glow,
        anim: lightAnim(rng, { flicker: 0.15 }),
      });
    } else if (kind === 'post') {
      const h = rng.float(1.4, 2.0);
      const it = scene.item('post', [px - 0.12, py - 0.12, 0, px + 0.12, py + 0.12, h + 0.2]);
      solid(it, { x: px - 0.05, y: py - 0.05, z: 0, dx: 0.1, dy: 0.1, dz: h }, { color: pal.metal, ao: 0.26, cls: 'post' });
      const lf = { o: [px - 0.1, py + 0.05, h + 0.16], u: [1, 0, 0], v: [0, 0, -1] };
      it.face({ pts: discOn(lf, 0.1, -0.1, 0.2, 12), kind: EMISSIVE, color: pal.neon, soft: true, softOpacity: 0.6, ao: 0, cls: 'lamp-glow' });
      it.face({ pts: discOn(lf, 0.1, -0.1, 0.06, 8), kind: EMISSIVE, color: shade(pal.neon, 1.5), ao: 0, cls: 'lamp' });
    } else {
      // Street vent with steam.
      const s = rng.float(0.3, 0.44);
      const it = scene.item('vent', [px - s, py - s, 0, px + s, py + s, 1.6]);
      solid(it, { x: px - s / 2, y: py - s / 2, z: 0, dx: s, dy: s, dz: 0.07 }, {
        color: pal.metal, texture: { type: 'ribbed', spacing: 0.06 }, ao: 0.24, cls: 'prop',
        top: { color: pal.hullDark, texture: { type: 'ribbed', spacing: 0.06 }, ao: 0.2, cls: 'prop' },
      });
      // Steam catching the neon it rises through — hence the emissive class on
      // something that isn't a light source.
      plume(scene, px, py, 0.14, {
        rng, color: tint(pal.neon, 0, -70, 30), kind: EMISSIVE,
        count: 6, r0: 0.11, growth: 1.22, gap: 1.0, wander: 0.05,
        opacity: 0.24, falloff: 0.03, dur: rng.pick([0.55, 0.7]),
        cls: 'steam', name: 'steam',
      });
    }
  }
}
