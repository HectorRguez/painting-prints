import { randomSource, drawing, line } from '../shared/port.js';

const TAU = Math.PI * 2, mix = (a, b, t) => a + (b - a) * t;
export const interferenceFamilies = ['circular', 'elliptic', 'warped', 'triplet'];
export const interferenceRanges = {
  sourceCount: [2, 3], radius: [220, 360], pitch: [5, 12], detune: [.9, 1.12],
  layoutJitter: [0, 1], radiusVariation: [0, .3], separation: [40, 285], aspect: [.5, 1.8], rotation: [-Math.PI, Math.PI],
  angleDifference: [-.5, .5], warp: [0, 75], warpFrequency: [.5, 2.5],
  lineWidth: [.9, 2.5], phase: [0, 1], chordError: [.08, .5], hue: [0, 360],
  saturation: [0, .5], accent: [0, 1],
};

export function interferenceParameters(seed, overrides = {}) {
  const r = randomSource(`${seed}:interference-controls`), pick = (a, b) => mix(a, b, r());
  const chosen = interferenceFamilies[Math.floor(r() * interferenceFamilies.length)];
  const family = overrides.family ?? chosen;
  if (!interferenceFamilies.includes(family)) throw new RangeError('Unknown interference family');
  const parameters = {
    family, sourceCount: family === 'triplet' ? 3 : 2,
    radius: pick(260, 340), layoutJitter: pick(.15, .65), radiusVariation: pick(.06, .2), pitch: pick(6.2, 10), detune: pick(.94, 1.075),
    separation: family === 'triplet' ? pick(90, 220) : pick(80, 250),
    aspect: family === 'circular' ? pick(.94, 1.06) : pick(.58, 1.65),
    rotation: pick(-Math.PI, Math.PI), angleDifference: family === 'circular' ? 0 : pick(-.32, .32),
    warp: family === 'warped' ? pick(30, 65) : family === 'triplet' ? pick(0, 30) : 0,
    warpFrequency: pick(.65, 1.8), lineWidth: pick(1.3, 2.1), phase: pick(.12, .88),
    chordError: .2, hue: pick(0, 360), saturation: pick(.05, .35), accent: r() < .7 ? 0 : pick(.35, 1),
    ...overrides,
  };
  for (const key of Object.keys(overrides)) if (key !== 'family' && !Object.hasOwn(interferenceRanges, key)) throw new RangeError(`Unknown interference control: ${key}`);
  for (const [key, [low, high]] of Object.entries(interferenceRanges)) if (!Number.isFinite(parameters[key]) || parameters[key] < low || parameters[key] > high) throw new RangeError(`${key} must be ${low}–${high}`);
  if (!Number.isInteger(parameters.sourceCount)) throw new RangeError('sourceCount must be an integer');
  return parameters;
}

export function interferenceModel(seed, parameters) {
  const p = parameters, r = randomSource(`${seed}:interference-sources`), pick = (a, b) => mix(a, b, r());
  return Array.from({ length: p.sourceCount }, (_, i) => {
    const layoutAngle = p.rotation + i * TAU / p.sourceCount + pick(-.4, .4) * p.layoutJitter;
    const offset = p.separation / 2 * (1 + pick(-.35, .35) * p.layoutJitter);
    return { x: Math.cos(layoutAngle) * offset, y: Math.sin(layoutAngle) * offset,
      radius: p.radius * (1 + pick(-1, 1) * p.radiusVariation), pitch: p.pitch * p.detune ** i,
      aspect: p.aspect * pick(.94, 1.06), angle: p.rotation + p.angleDifference * (i - (p.sourceCount - 1) / 2),
      phase: (p.phase + i * pick(.16, .65)) % 1,
      warpX: p.warp * pick(.6, 1), warpY: p.warp * pick(-.8, .8),
      frequencyX: p.warpFrequency * pick(.85, 1.15), frequencyY: p.warpFrequency * pick(.85, 1.15),
      phaseX: pick(0, TAU), phaseY: pick(0, TAU) };
  });
}

// Two sinusoidal shears, each with determinant1, followed by an area-preserving
// ellipse transform. The inverse is explicit, so same-source rings cannot fold
// across each other even at the largest supported warp.
export function transformCarrier(source, x, y) {
  x += source.warpX * Math.sin(y / source.radius * Math.PI * source.frequencyY + source.phaseX);
  y += source.warpY * Math.sin(x / source.radius * Math.PI * source.frequencyX + source.phaseY);
  const scale = Math.sqrt(source.aspect), u = x * scale, v = y / scale;
  const co = Math.cos(source.angle), si = Math.sin(source.angle);
  return [source.x + u * co - v * si, source.y + u * si + v * co];
}

export function inverseCarrier(source, px, py) {
  const dx = px - source.x, dy = py - source.y, co = Math.cos(source.angle), si = Math.sin(source.angle), scale = Math.sqrt(source.aspect);
  let x = (dx * co + dy * si) / scale, y = (-dx * si + dy * co) * scale;
  y -= source.warpY * Math.sin(x / source.radius * Math.PI * source.frequencyX + source.phaseY);
  x -= source.warpX * Math.sin(y / source.radius * Math.PI * source.frequencyY + source.phaseX);
  return [x, y];
}

export function carrierIndex(source, x, y) {
  const p = inverseCarrier(source, x, y);
  return Math.hypot(...p) / source.pitch - source.phase;
}

export function carrierRing(source, index, chordError) {
  const radius = (index + source.phase) * source.pitch;
  const at = angle => transformCarrier(source, radius * Math.cos(angle), radius * Math.sin(angle));
  const points = [];
  function subdivide(a, b, pa, pb, depth) {
    const middle = (a + b) / 2, pm = at(middle);
    const error = Math.hypot(pm[0] - (pa[0] + pb[0]) / 2, pm[1] - (pa[1] + pb[1]) / 2);
    if (error > chordError && depth < 10) {
      subdivide(a, middle, pa, pm, depth + 1); subdivide(middle, b, pm, pb, depth + 1);
    } else points.push(pa);
  }
  for (let i = 0; i < 32; i++) {
    const a = i * TAU / 32, b = (i + 1) * TAU / 32;
    subdivide(a, b, at(a), at(b), 0);
  }
  return points;
}

function ink(hue, saturation, lightness) {
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = n => { const k = (n + hue / 30) % 12; return lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return '#' + [0, 8, 4].map(n => Math.round(channel(n) * 255).toString(16).padStart(2, '0')).join('');
}

export function buildInterference(seed, overrides = {}) {
  const parameters = interferenceParameters(seed, overrides), sources = interferenceModel(seed, parameters), rings = [];
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  sources.forEach((source, i) => {
    const count = Math.floor(source.radius / source.pitch - source.phase);
    for (let index = 1; index <= count; index++) {
      const points = carrierRing(source, index, parameters.chordError);
      for (const [x, y] of points) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
      rings.push({ source: i, index, points });
    }
  });
  const scale = Math.min(860 / (right - left), 860 / (bottom - top));
  const fit = { scale, x: 500 - (left + right) / 2 * scale, y: 500 - (top + bottom) / 2 * scale };
  const paths = rings.map(ring => {
    const tone = ring.source === 0 ? .14 : .14 + parameters.accent * .13;
    const hue = (parameters.hue + ring.source * 120 * parameters.accent) % 360;
    return { d: line(ring.points.map(([x, y]) => [fit.x + x * scale, fit.y + y * scale]), true),
      fill: 'none', stroke: ink(hue, parameters.saturation + parameters.accent * .15, tone), width: parameters.lineWidth * scale };
  });
  return { parameters, sources, rings, fit, paths,
    metrics: { family: parameters.family, sources: sources.length, rings: rings.length,
      points: rings.reduce((sum, ring) => sum + ring.points.length, 0), minimumPitch: Math.min(...sources.map(s => s.pitch)) * scale } };
}

export function generateInterference(seed, overrides = {}) {
  const scene = buildInterference(seed, overrides);
  return { ...drawing(scene.paths, { rounded: true }), mode: 'interference', seed, artRevision: 1,
    parameters: scene.parameters, metrics: scene.metrics };
}
