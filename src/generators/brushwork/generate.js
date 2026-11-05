import { randomSource, drawing, line } from '../shared/port.js';
import { brushPalettes, brushColorParameters, pigmentColor } from './palettes.js';
export { brushPalettes, pigmentColor } from './palettes.js';

const TAU = 2 * Math.PI, mix = (a, b, t) => a + (b - a) * t;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const brushFamilies = ['orbit', 'sweep', 'crossing', 'rising'];
export const brushRanges = {
  width: [24, 220], dryness: [0, .85], bristles: [40, 160],
  pressureVariation: [0, .65], taper: [.4, 1.8], bend: [.2, 1.25],
  sweep: [3.6, 6.05], radialWobble: [0, .12], aspect: [.65, 1.35], rotation: [-Math.PI, Math.PI],
  roughness: [0, 2.5], pigment: [.35, 1], accent: [0, 1],
  hueShift: [-180, 180], saturation: [0, 1.4],
  strokeCount: [1, 4], scale: [.65, 1], samples: [120, 400], chordError: [.02, .2],
};

export function brushParameters(seed, overrides = {}) {
  const r = randomSource(`${seed}:brush-controls`), pick = (a, b) => mix(a, b, r());
  const selected = brushFamilies[Math.floor(r() * brushFamilies.length)], family = overrides.family ?? selected;
  if (!brushFamilies.includes(family)) throw new RangeError('Unknown brushwork family');
  const p = { family, width: pick(110, 190), dryness: pick(.32, .66), bristles: 100,
    pressureVariation: pick(.18, .42), taper: pick(.45, .85), bend: pick(.5, 1),
    sweep: pick(4.7, 5.75), aspect: pick(.78, 1.2), rotation: pick(-Math.PI, Math.PI), radialWobble: pick(.025, .065),
    roughness: pick(.3, .8), pigment: pick(.92, 1), accent: r() < .6 ? 0 : pick(.65, 1),
    strokeCount: family === 'orbit' ? 1 : family === 'crossing' ? 3 : 2,
    scale: pick(.82, .97), samples: 240, chordError: .1, ...brushColorParameters(seed), ...overrides };
  if (!Object.hasOwn(brushPalettes, p.palette)) throw new RangeError('Unknown brushwork palette');
  for (const key of Object.keys(overrides)) if (key !== 'family' && key !== 'palette' && !Object.hasOwn(brushRanges, key)) throw new RangeError(`Unknown brushwork control: ${key}`);
  for (const [key, [lo, hi]] of Object.entries(brushRanges)) if (!Number.isFinite(p[key]) || p[key] < lo || p[key] > hi) throw new RangeError(`${key} must be ${lo}–${hi}`);
  for (const key of ['bristles', 'strokeCount', 'samples']) if (!Number.isInteger(p[key])) throw new RangeError(`${key} must be an integer`);
  return p;
}

export function brushStrokes(seed, p) {
  const r = randomSource(`${seed}:brush-composition`), pick = (a, b) => mix(a, b, r());
  const strokes = [];
  for (let i = 0; i < p.strokeCount; i++) {
    const primary = i === 0, orbit = p.family === 'orbit' || p.family === 'crossing' && i === 0;
    const span = primary ? pick(600, 730) : pick(360, 610);
    let angle = p.rotation;
    let x = 0, y = 0;
    if (p.family === 'rising') { angle += -.2 + i * .18; x = (i - (p.strokeCount - 1) / 2) * 160; y = i * 42; }
    else if (p.family === 'crossing' && !primary) { angle += i === 1 ? 1.1 : -.7; x = pick(-90, 90); y = pick(-80, 130); }
    else if (!primary) { x = pick(-150, 150); y = pick(-140, 140); angle += pick(.7, 1.2); }
    strokes.push({ kind: orbit ? 'arc' : 'sweep', center: [x, y], angle,
      span, radius: primary ? pick(235, 290) : pick(130, 200), aspect: p.aspect,
      start: pick(-Math.PI, Math.PI), extent: p.sweep * (primary ? 1 : .65),
      bend: p.bend * (r() < .5 ? -1 : 1), bias: pick(-.3, .3), phase: pick(0, TAU),
      width: p.width * (primary ? 1 : pick(.35, .72)),
      pigment: p.pigment * (primary ? 1 : pick(.7, 1)), accent: !primary && i === 1 ? p.accent : 0,
      pressurePhase: pick(0, TAU), drift: pick(-.1, .1), radialWobble: p.radialWobble });
  }
  return strokes;
}

// Analytic trajectory and first derivative, before the composition rotation.
export function gestureAt(stroke, t) {
  let x, y, dx, dy, ddx, ddy;
  if (stroke.kind === 'arc') {
    const theta = stroke.start + stroke.extent * t;
    const modulation = 1 + stroke.radialWobble * Math.sin(2 * theta + stroke.phase) + stroke.drift * (t - .5);
    const radius = stroke.radius * modulation;
    const dr = stroke.radius * (2 * stroke.radialWobble * Math.cos(2 * theta + stroke.phase) * stroke.extent + stroke.drift);
    const ddr = -stroke.radius * 4 * stroke.radialWobble * Math.sin(2 * theta + stroke.phase) * stroke.extent ** 2;
    x = radius * Math.cos(theta); y = radius * Math.sin(theta) * stroke.aspect;
    dx = dr * Math.cos(theta) - radius * Math.sin(theta) * stroke.extent;
    dy = (dr * Math.sin(theta) + radius * Math.cos(theta) * stroke.extent) * stroke.aspect;
    ddx = ddr * Math.cos(theta) - 2 * dr * Math.sin(theta) * stroke.extent - radius * Math.cos(theta) * stroke.extent ** 2;
    ddy = (ddr * Math.sin(theta) + 2 * dr * Math.cos(theta) * stroke.extent - radius * Math.sin(theta) * stroke.extent ** 2) * stroke.aspect;
  } else {
    const phase = TAU * t + stroke.phase;
    x = stroke.span * (t - .5);
    y = stroke.span * (.23 * stroke.bend * Math.sin(phase) + stroke.bias * (t - .5) ** 2);
    dx = stroke.span;
    dy = stroke.span * (.23 * stroke.bend * TAU * Math.cos(phase) + 2 * stroke.bias * (t - .5));
    ddx = 0; ddy = stroke.span * (-.23 * stroke.bend * TAU ** 2 * Math.sin(phase) + 2 * stroke.bias);
  }
  const co = Math.cos(stroke.angle), si = Math.sin(stroke.angle);
  return { point: [stroke.center[0] + x * co - y * si, stroke.center[1] + x * si + y * co],
    tangent: [dx * co - dy * si, dx * si + dy * co],
    curvature: (dx * ddy - dy * ddx) / Math.hypot(dx, dy) ** 3 };
}

export function simplifyTrace(points, tolerance) {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const queue = [[0, points.length - 1]], limit = tolerance ** 2;
  while (queue.length) {
    const [a, b] = queue.pop(), start = points[a], end = points[b];
    const dx = end[0] - start[0], dy = end[1] - start[1], length = dx * dx + dy * dy;
    let farthest = -1, maximum = limit;
    for (let i = a + 1; i < b; i++) {
      const q = length ? clamp(((points[i][0] - start[0]) * dx + (points[i][1] - start[1]) * dy) / length) : 0;
      const distance = (points[i][0] - start[0] - q * dx) ** 2 + (points[i][1] - start[1] - q * dy) ** 2;
      if (distance > maximum) { maximum = distance; farthest = i; }
    }
    if (farthest >= 0) { keep[farthest] = 1; queue.push([a, farthest], [farthest, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

export function pressureAt(stroke, p, t) {
  const attack = Math.min(1, t / .065) ** .45;
  const release = Math.max(0, 1 - t ** 1.8) ** p.taper;
  const pulse = 1 + p.pressureVariation * Math.sin(TAU * t + stroke.pressurePhase);
  return attack * release * pulse;
}

export function bristleGeometry(seed, stroke, p, strokeIndex = 0) {
  const r = randomSource(`${seed}:bristles:${strokeIndex}`), pick = (a, b) => mix(a, b, r());
  const base = Array.from({ length: p.samples + 1 }, (_, j) => {
    const t = j / p.samples, { point, tangent, curvature } = gestureAt(stroke, t), speed = Math.hypot(...tangent);
    const pressure = Math.min(pressureAt(stroke, p, t), 1.5 / (Math.abs(curvature) * stroke.width || 1e-12));
    return { t, point, tangent: tangent.map(v => v / speed), normal: [-tangent[1] / speed, tangent[0] / speed], pressure, curvature };
  });
  // Propagate width reductions along arc length so a curvature cap cannot
  // abruptly expand into a notch just beyond a tight turn.
  for (const direction of [1, -1]) for (let j = direction > 0 ? 1 : base.length - 2; j >= 0 && j < base.length; j += direction) {
    const a = base[j - direction], b = base[j];
    const distance = Math.hypot(b.point[0] - a.point[0], b.point[1] - a.point[1]);
    b.pressure = Math.min(b.pressure, a.pressure + distance / stroke.width);
  }
  const bands = [];
  for (let i = 0; i < p.bristles; i++) {
    const u = (i + .5) / p.bristles * 2 - 1, phase = pick(0, TAU), frequency = pick(5, 12);
    const width = stroke.width / p.bristles * pick(1.35, 2.0), variation = pick(0, .045) + Math.abs(u) ** 4 * .14;
    let upper = [], lower = [], points = [];
    const flush = () => {
      if (upper.length > 2) bands.push({ points: simplifyTrace(upper, p.chordError).concat(simplifyTrace(lower, p.chordError).reverse()), centerline: points, bristle: i,
        color: pigmentColor(p, stroke.pigment, stroke.accent, variation), u });
      upper = []; lower = []; points = [];
    };
    for (const frame of base) {
      const { t, normal: n, tangent: tangent, point, pressure } = frame;
      const contact = 1 - p.dryness * (.5 + 1.25 * t) - .38 * Math.abs(u) ** 3
        + .22 * Math.sin(t * frequency * TAU + phase) + .08 * Math.sin(37 * t + u * 11);
      if (contact < .06 || pressure < .018) { flush(); continue; }
      const rough = p.roughness * (Math.sin(t * 37 + stroke.phase + u * .7)
        + Math.abs(u) ** 8 * Math.sin(t * 81 + phase * 2));
      const spread = stroke.width * .5 * pressure;
      const offset = u * spread + rough * (.3 + Math.abs(u));
      const lag = Math.abs(u) ** 2 * stroke.width * .035 * (1 - pressure);
      const center = [point[0] + n[0] * offset - tangent[0] * lag, point[1] + n[1] * offset - tangent[1] * lag];
      const half = width * .5 * Math.max(.15, pressure) * clamp(contact * 2, .15, 1);
      upper.push([center[0] + n[0] * half, center[1] + n[1] * half]);
      lower.push([center[0] - n[0] * half, center[1] - n[1] * half]);
      points.push(center);
    }
    flush();
  }
  return { bands, frames: base };
}

export function buildBrushwork(seed, overrides = {}) {
  const parameters = brushParameters(seed, overrides), strokes = brushStrokes(seed, parameters);
  const geometry = strokes.map((stroke, i) => bristleGeometry(seed, stroke, parameters, i));
  const all = geometry.flatMap(g => g.bands);
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const band of all) for (const [x, y] of band.points) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
  const scale = parameters.scale * Math.min(850 / (right - left), 850 / (bottom - top));
  const fit = { scale, x: 500 - (left + right) * scale / 2, y: 500 - (top + bottom) * scale / 2 };
  const paths = all.map(band => ({ d: line(band.points.map(([x, y]) => [fit.x + x * scale, fit.y + y * scale]), true),
    fill: band.color, stroke: 'none', width: 0 }));
  return { parameters, strokes, geometry, fit, paths,
    metrics: { family: parameters.family, palette: parameters.palette, strokes: strokes.length, bristles: parameters.bristles,
      fragments: paths.length, points: all.reduce((sum, b) => sum + b.points.length, 0) } };
}

export function generateBrushwork(seed, overrides = {}) {
  const scene = buildBrushwork(seed, overrides);
  return { ...drawing(scene.paths), mode: 'brushwork', seed, artRevision: 2,
    parameters: scene.parameters, metrics: scene.metrics };
}
