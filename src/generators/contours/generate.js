import { randomSource, drawing, line } from '../shared/port.js';
import { traceContours, signedArea } from '../shared/isocontours.js';

const TAU = Math.PI * 2;
const mix = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const contourFamilies = ['archipelago', 'caldera', 'ridge', 'headlands'];
export const contourRanges = {
  resolution: [129, 289], peakCount: [3, 12], spread: [.25, .74], peakWidth: [.1, .3],
  elongation: [1, 2.3], roughness: [0, .3], warp: [0, .13], frequency: [1.5, 3],
  lacunarity: [1.6, 2.2], hurst: [.55, 1.05], octaves: [2, 4], seaLevel: [.12, .38],
  levels: [10, 28], depression: [0, 1.2], valleyDepth: [0, .65], rotation: [-Math.PI, Math.PI], hue: [0, 360],
};

export function contourParameters(seed, overrides = {}) {
  const r = randomSource(`${seed}:terrain-parameters`), pick = (a, b) => mix(a, b, r());
  const chosen = contourFamilies[Math.floor(r() * contourFamilies.length)];
  const family = overrides.family ?? chosen;
  const palette = randomSource(`${seed}:terrain-palette`), paletteRange = [[15, 48], [195, 225], [90, 160], [170, 195]][Math.floor(palette() * 4)];
  if (!contourFamilies.includes(family)) throw new RangeError('Unknown contour family');
  const p = {
    family, resolution: 241, peakCount: family === 'archipelago' ? 6 + Math.floor(r() * 5) : 3 + Math.floor(r() * 4),
    spread: family === 'archipelago' ? pick(.52, .7) : family === 'caldera' ? pick(.3, .42) : pick(.4, .64),
    peakWidth: family === 'archipelago' ? pick(.105, .155) : pick(.19, .27),
    elongation: family === 'ridge' ? pick(1.6, 2.2) : pick(1.05, 1.6),
    roughness: pick(.12, .26), warp: pick(.025, .105), frequency: pick(1.6, 2.8),
    lacunarity: pick(1.7, 2.1), hurst: pick(.6, .95), octaves: 4,
    seaLevel: family === 'archipelago' ? pick(.25, .35) : pick(.18, .28), levels: 15 + Math.floor(r() * 10),
    depression: family === 'caldera' ? pick(.7, 1.1) : 0,
    valleyDepth: family === 'headlands' ? pick(.3, .55) : pick(.04, .12),
    rotation: pick(-Math.PI, Math.PI), hue: mix(...paletteRange, palette()),
    ...overrides,
  };
  for (const [key, value] of Object.entries(overrides)) if (key !== 'family' && !Object.hasOwn(contourRanges, key)) throw new RangeError(`Unknown contour control: ${key}`);
  for (const [key, [lo, hi]] of Object.entries(contourRanges)) {
    if (!Number.isFinite(p[key]) || p[key] < lo || p[key] > hi) throw new RangeError(`${key} must be ${lo}–${hi}`);
  }
  for (const key of ['resolution', 'peakCount', 'octaves', 'levels']) if (!Number.isInteger(p[key])) throw new RangeError(`${key} must be an integer`);
  return p;
}

export function terrainModel(seed, parameters) {
  const p = parameters, r = randomSource(`${seed}:terrain-structure`), pick = (a, b) => mix(a, b, r());
  const peaks = [];
  for (let i = 0; i < p.peakCount; i++) {
    let x, y, angle = pick(-Math.PI, Math.PI), width = p.peakWidth * pick(.7, 1.2);
    if (p.family === 'caldera') {
      const a = TAU * (i + pick(-.2, .2)) / p.peakCount;
      x = Math.cos(a) * p.spread; y = Math.sin(a) * p.spread * pick(.8, 1.05); angle = a + Math.PI / 2;
    } else if (p.family === 'ridge') {
      x = mix(-p.spread, p.spread, (i + .3) / p.peakCount); y = p.spread * .22 * Math.sin(i * 1.3 + pick(-.5, .5)); angle = pick(-.45, .45);
    } else {
      const a = pick(0, TAU), radius = p.spread * Math.sqrt(r());
      x = Math.cos(a) * radius; y = Math.sin(a) * radius;
      if (p.family === 'headlands') { x *= .7; width *= 1.1; angle = Math.atan2(y, x); }
    }
    peaks.push({ x, y, width, aspect: p.elongation * pick(.85, 1.1), angle, amplitude: pick(.65, 1.25) });
  }
  const valleys = Array.from({ length: 3 + Math.floor(r() * 4) }, () => {
    const angle = pick(0, TAU), radius = pick(.28, .65);
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, angle,
      width: pick(.05, .11), aspect: pick(2.5, 4.5) };
  });
  const waves = [];
  for (let octave = 0; octave < p.octaves; octave++) for (let j = 0; j < 3; j++) {
    const angle = pick(0, TAU), frequency = p.frequency * p.lacunarity ** octave;
    waves.push({ kx: Math.cos(angle) * Math.PI * frequency, ky: Math.sin(angle) * Math.PI * frequency,
      amplitude: p.lacunarity ** (-p.hurst * octave), phase: pick(0, TAU) });
  }
  return { parameters: p, peaks, valleys, waves, totalAmplitude: waves.reduce((sum, w) => sum + w.amplitude, 0) };
}

function spectrum(model, x, y, shift = 0) {
  let sum = 0;
  for (const w of model.waves) sum += w.amplitude * Math.sin(w.kx * x + w.ky * y + w.phase + shift);
  return sum / model.totalAmplitude;
}

// A 2D Gaussian implicit field, spectrally perturbed before extracting levels.
// This is a terrain illustration, not erosion or a calibrated elevation map.
export function terrainHeight(model, x, y) {
  const p = model.parameters, co = Math.cos(p.rotation), si = Math.sin(p.rotation);
  const u = x * co + y * si, v = -x * si + y * co;
  x = u + p.warp * spectrum(model, u * .65, v * .65, 1.7);
  y = v + p.warp * spectrum(model, u * .65, v * .65, 4.1);
  let h = 0;
  for (const peak of model.peaks) {
    const dx = x - peak.x, dy = y - peak.y, co = Math.cos(peak.angle), si = Math.sin(peak.angle);
    const a = (dx * co + dy * si) / (peak.width * peak.aspect), b = (-dx * si + dy * co) / peak.width;
    h += peak.amplitude * Math.exp(-.5 * (a * a + b * b));
  }
  for (const valley of model.valleys) {
    const dx = x - valley.x, dy = y - valley.y, co = Math.cos(valley.angle), si = Math.sin(valley.angle);
    const a = (dx * co + dy * si) / (valley.width * valley.aspect), b = (-dx * si + dy * co) / valley.width;
    h -= p.valleyDepth * Math.exp(-.5 * (a * a + b * b));
  }
  h -= p.depression * Math.exp(-(x * x + y * y) / (.8 * p.spread) ** 2);
  h *= 1 + p.roughness * spectrum(model, x, y) * 2.5;
  // Smooth compact support protects the paper margin without cutting contours.
  const t = clamp((Math.hypot(u, v) - .77) / .19, 0, 1);
  const taper = 1 - t * t * t * (t * (t * 6 - 15) + 10);
  return Math.max(0, h) * taper;
}

function color(hue, saturation, light) {
  const a = saturation * Math.min(light, 1 - light);
  const channel = n => { const k = (n + hue / 30) % 12; return light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return '#' + [0, 8, 4].map(n => Math.round(channel(n) * 255).toString(16).padStart(2, '0')).join('');
}

export function buildContours(seed, overrides = {}) {
  const parameters = contourParameters(seed, overrides), model = terrainModel(seed, parameters);
  const n = parameters.resolution, field = new Float64Array(n * n);
  let maximum = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const h = terrainHeight(model, x / (n - 1) * 2 - 1, y / (n - 1) * 2 - 1);
    field[y * n + x] = h; maximum = Math.max(maximum, h);
  }
  if (maximum < 1e-6) throw new Error('The terrain has no relief');
  for (let i = 0; i < field.length; i++) field[i] /= maximum;
  const paths = [], contours = [], toCanvas = ([x, y]) => [50 + x / (n - 1) * 900, 50 + y / (n - 1) * 900];
  const sample = (x, y) => terrainHeight(model, x / (n - 1) * 2 - 1, y / (n - 1) * 2 - 1) / maximum;
  for (let index = -3; index < parameters.levels; index++) {
    const level = index < 0 ? parameters.seaLevel * (1 + index * .22)
      : mix(parameters.seaLevel, .94, index / (parameters.levels - 1));
    const loops = traceContours(field, n, n, level).filter(c => c.closed && Math.abs(signedArea(c.points)) > .4);
    for (const contour of loops) {
      const [a, b] = contour.points, dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
      const x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2;
      // Consistent high-on-left winding makes depressions real compound holes.
      if (sample(x - dy / d * .06, y + dx / d * .06) < sample(x + dy / d * .06, y - dx / d * .06)) contour.points.reverse();
      contours.push({ level, index, points: contour.points.map(toCanvas) });
    }
    if (!loops.length) continue;
    const d = loops.map(c => line(c.points.map(toCanvas), true)).join('');
    const t = Math.max(0, index / (parameters.levels - 1));
    paths.push({ d, fill: index < 0 ? 'none' : color(parameters.hue, mix(.28, .37, t), mix(.86, .43, t)),
      stroke: index < 0 ? '#7c9696' : color(parameters.hue, .2, .3), width: index < 0 ? .9 : index % 5 === 0 ? 1.65 : .55 });
  }
  const coast = contours.filter(c => c.index === 0), landArea = coast.reduce((sum, c) => sum + signedArea(c.points), 0);
  return { parameters, model, field, maximum, paths, contours,
    metrics: { family: parameters.family, contours: contours.length, islands: coast.filter(c => signedArea(c.points) > 0).length,
      lagoons: coast.filter(c => signedArea(c.points) < 0).length, landFraction: Math.abs(landArea) / 1e6, grid: n } };
}

export function generateContours(seed, overrides = {}) {
  const scene = buildContours(seed, overrides);
  return { ...drawing(scene.paths, { rounded: true }), mode: 'contours', seed, artRevision: 1,
    parameters: scene.parameters, metrics: scene.metrics };
}
