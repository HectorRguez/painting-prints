import { randomSource } from '../shared/port.js';

export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const mix = (a, b, t) => a + (b - a) * t;
const between = (random, a, b) => mix(a, b, random());
const unit = ([x, y, z]) => { const n = Math.hypot(x, y, z); return [x / n, y / n, z / n]; };
export const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);

export function duneParameters(seed) {
  const random = randomSource(`${seed}:dune-parameters`);
  const morphology = ['barchan', 'transverse', 'linear', 'star'][Math.floor(random() * 4)];
  return {
    morphology, palette: 'ink', windAzimuth: between(random, .9, 2.05), windDivergence: between(random, morphology === 'linear' ? 2.05 : 0.6, morphology === 'linear' ? 2.7 : 1.9),
    secondaryWind: between(random, 0.35, 0.85), shearRatio: between(random, 1.65, 3.1),
    saturationLength: between(random, 8, 17), crestLength: between(random, 245, 385),
    crestHeight: between(random, 53, 82), horns: between(random, 0.32, 0.65),
    asymmetry: between(random, -0.23, 0.23), curvature: between(random, 0.07, 0.18),
    stossExponent: between(random, 2.6, 3.4), slipAngle: between(random, 29, 34) * Math.PI / 180,
    relief: between(random, 1, 1.32), spacing: between(random, 230, 350), density: between(random, 0.65, 1),
    rippleWavelength: between(random, 11, 19), rippleSlope: between(random, 0.08, 0.22), rippleDensity: between(random, 0.32, 0.62),
    cameraAzimuth: between(random, -0.32, 0.32), cameraElevation: between(random, .36, .56),
    perspective: between(random, 0.28, 0.47), lightAzimuth: between(random, -2.7, -1.5),
    lightElevation: between(random, 0.34, 0.66), contrast: between(random, 0.65, 1),
    phase: random() * TAU,
    ridgeBands: 5 + Math.floor(random() * 6), lineWeight: between(random, .85, 1.2),
    travelerCount: 1 + Math.floor(random() * 3), camelCount: random() < .65 ? 1 + Math.floor(random() * 3) : 0,
    figureScale: between(random, .85, 1.12), caravanSpacing: between(random, 27, 43),
    figureHeading: random() < .5 ? between(random, -.25, .25) : between(random, Math.PI - .25, Math.PI),
    camelLoad: between(random, .35, .85),
  };
}

const limits = {
  windAzimuth: [-Math.PI, Math.PI], windDivergence: [0.1, 2.8], secondaryWind: [0, 1], shearRatio: [1.25, 4],
  saturationLength: [3, 30], crestLength: [170, 520], crestHeight: [22, 95], horns: [0.1, 0.85],
  asymmetry: [-0.4, 0.4], curvature: [0, 0.28], stossExponent: [1.8, 4], slipAngle: [0.42, 0.62],
  relief: [0.55, 1.55], spacing: [175, 430], density: [0.4, 1.2], rippleWavelength: [5, 24],
  rippleSlope: [0, 0.35], rippleDensity: [0, 1], cameraAzimuth: [-0.65, 0.65], cameraElevation: [0.22, 0.95],
  perspective: [0, 0.5], lightAzimuth: [-Math.PI, Math.PI], lightElevation: [0.22, 1.1], contrast: [0.3, 1.2], phase: [-1000, 1000],
  ridgeBands: [0, 16], lineWeight: [.65, 1.6], travelerCount: [0, 8], camelCount: [0, 6],
  figureScale: [.6, 1.6], caravanSpacing: [18, 70], figureHeading: [-Math.PI, Math.PI], camelLoad: [0, 1],
};

export function resolveParameters(seed, overrides = {}) {
  const parameters = duneParameters(seed);
  for (const [key, value] of Object.entries(overrides)) {
    if (key === 'palette') {
      if (!['ochre', 'ink'].includes(value)) throw new RangeError('Unknown dune palette');
    } else if (key === 'morphology') {
      if (!['barchan', 'transverse', 'linear', 'star'].includes(value)) throw new RangeError('Unknown dune morphology');
    } else if (!(key in limits) || !Number.isFinite(value) || value < limits[key][0] || value > limits[key][1]) {
      throw new RangeError(`Dune parameter ${key} is outside its supported range`);
    }
    parameters[key] = value;
  }
  for (const key of ['ridgeBands', 'travelerCount', 'camelCount']) if (!Number.isInteger(parameters[key])) throw new RangeError(`${key} must be an integer`);
  return parameters;
}

// Kroy et al. (2005), eqs. 2 and 6 inspire the cosine-power windward
// section and parabolic cross-crest envelope. This is a geometric surrogate,
// not a time integration of their shear/flux/mass-conservation equations.
export function stossProfile(q, exponent = 3) {
  return Math.abs(q) >= 1 ? 0 : Math.cos(Math.PI * Math.abs(q) / 2) ** exponent;
}
export const crestEnvelope = u => Math.max(0, 1 - u * u);

export function ridgeSkeletons(seed, p) {
  const random = randomSource(`${seed}:dune-layout`), ridges = [], dunes = [];
  const wind = [Math.cos(p.windAzimuth), Math.sin(p.windAzimuth)];
  const crosswind = [-wind[1], wind[0]];
  const addRidge = (dune, fn, lee, steps = 30) => {
    const points = Array.from({ length: steps + 1 }, (_, i) => fn(i / steps));
    const segments = points.slice(1).map((b, i) => {
      const a = points[i], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
      let normal = [-dz / Math.sqrt(l2), dx / Math.sqrt(l2)];
      if (normal[0] * lee[0] + normal[1] * lee[1] < 0) normal = normal.map(x => -x);
      return { a, b, dx, dz, l2, normal };
    });
    ridges.push({ dune: dune.id, points, segments, lee });
  };
  const positions = [];
  if (p.morphology === 'barchan' || p.morphology === 'star') {
    const rows = p.morphology === 'star' ? 3 : 4;
    for (let row = 0; row < rows; row++) for (let col = 0; col < 3; col++) {
      if (random() > p.density && positions.length > 3) continue;
      positions.push([(col - 1) * p.spacing * 1.6 + between(random, -100, 100),
        (row - (rows - 1) / 2) * p.spacing * 0.95 + between(random, -95, 95)]);
    }
  } else {
    const count = Math.round(mix(3, 6, (p.density - 0.4) / 0.8));
    for (let i = 0; i < count; i++) positions.push([0, (i - (count - 1) / 2) * p.spacing]);
  }
  for (const [index, position] of positions.entries()) {
    const length = p.crestLength * between(random, 0.72, 1.22);
    const height = p.crestHeight * p.relief * between(random, 0.7, 1.24) * (position[1] < -180 ? 1.28 : 1);
    const dune = { id: index, kind: p.morphology, center: position, length, height,
      horns: p.horns * between(random, 0.85, 1.15), asymmetry: p.asymmetry + between(random, -0.08, 0.08),
      phase: random() * TAU };
    dunes.push(dune);
    if (p.morphology === 'barchan') {
      addRidge(dune, t => {
        const u = t * 2 - 1;
        const across = u * length / 2, down = dune.horns * length * (u * u + dune.asymmetry * u * 0.6);
        return [position[0] + crosswind[0] * across + wind[0] * down,
          position[1] + crosswind[1] * across + wind[1] * down, height * crestEnvelope(u)];
      }, wind);
    } else if (p.morphology === 'star') {
      const arms = 3 + Math.floor(random() * 3);
      dune.arms = arms;
      for (let j = 0; j < arms; j++) {
        const angle = p.windAzimuth + j * TAU / arms + between(random, -0.14, 0.14) * p.windDivergence;
        const armLength = length * between(random, 0.6, 1.05);
        addRidge(dune, t => {
          const bend = p.curvature * armLength * Math.sin(Math.PI * t) * Math.sin(angle * 2 + dune.phase);
          return [position[0] + Math.cos(angle) * t * armLength - Math.sin(angle) * bend,
            position[1] + Math.sin(angle) * t * armLength + Math.cos(angle) * bend,
            height * (1 - t * t)];
        }, [Math.cos(angle + Math.PI / 2), Math.sin(angle + Math.PI / 2)], 24);
      }
    } else {
      const linear = p.morphology === 'linear';
      const resultantAngle = p.windAzimuth + Math.atan2(p.secondaryWind * Math.sin(p.windDivergence), 1 + p.secondaryWind * Math.cos(p.windDivergence));
      const angle = linear ? resultantAngle : p.windAzimuth + Math.PI / 2;
      const axis = [Math.cos(angle), Math.sin(angle)], normal = [-axis[1], axis[0]];
      const center = [position[1] * normal[0], position[1] * normal[1]];
      dune.center = center; dune.length = linear ? length * 3.4 : length * 3.8;
      addRidge(dune, t => {
        const u = t * 2 - 1;
        const bend = p.curvature * length * (Math.sin(u * 4.3 + dune.phase) + 0.35 * Math.sin(u * 8.4 - dune.phase));
        const h = height * crestEnvelope(u) ** 0.48 * (0.88 + 0.12 * Math.sin(u * 5 + dune.phase));
        return [center[0] + axis[0] * u * dune.length / 2 + normal[0] * bend,
          center[1] + axis[1] * u * dune.length / 2 + normal[1] * bend, h];
      }, linear ? normal : wind, 48);
    }
  }
  return { ridges, dunes, wind };
}

export function makeTerrain(ridges, p) {
  const segments = ridges.flatMap(ridge => ridge.segments.map(segment => ({ ...segment, dune: ridge.dune })));
  const stossAspect = 0.28 * (1 - 1 / p.shearRatio);
  const stossWidth = h => Math.max(h / stossAspect, p.saturationLength * 7);
  const leeWidth = h => h / Math.tan(p.slipAngle);
  const sample = (x, z) => {
    let height = 0, owner = -1, lee = false;
    for (const s of segments) {
      const t = clamp(((x - s.a[0]) * s.dx + (z - s.a[1]) * s.dz) / s.l2, 0, 1);
      const qx = s.a[0] + t * s.dx, qz = s.a[1] + t * s.dz;
      const h = mix(s.a[2], s.b[2], t);
      if (h <= height) continue;
      const dx = x - qx, dz = z - qz, distance = Math.hypot(dx, dz);
      const isLee = dx * s.normal[0] + dz * s.normal[1] > 0;
      const width = isLee ? leeWidth(h) : stossWidth(h);
      if (distance >= width) continue;
      const q = distance / width;
      const candidate = h * (isLee ? (1 - q) : stossProfile(q, p.stossExponent));
      if (candidate > height) { height = candidate; owner = s.dune; lee = isLee; }
    }
    return { height, owner, lee };
  };
  return { sample, stossWidth, leeWidth };
}

export function terrainGrid(terrain, p, resolution = 164, { width = 1800, depth = 1404 } = {}) {
  const nx = resolution + 1, nz = Math.round(resolution * depth / width) + 1;
  const x0 = -width / 2, z0 = -depth / 2, dx = width / (nx - 1), dz = depth / (nz - 1);
  const heights = new Float64Array(nx * nz), owners = new Int16Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const point = terrain.sample(x0 + i * dx, z0 + j * dz);
    // Fade the illustrated field before the frame; no rectangular terrain cut.
    const edge = Math.min(i / 12, (nx - 1 - i) / 12, j / 10, (nz - 1 - j) / 10, 1);
    const fade = Math.sin(Math.max(0, edge) * Math.PI / 2) ** 2;
    heights[j * nx + i] = point.height * fade; owners[j * nx + i] = point.owner;
  }
  const cubic = (a, b, c, d, t) => {
    const c1 = (c - a) / 2, c2 = a - 2.5 * b + 2 * c - 0.5 * d, c3 = (d - a) / 2 + 1.5 * (b - c);
    return [b + t * (c1 + t * (c2 + t * c3)), c1 + t * (2 * c2 + t * 3 * c3)];
  };
  const at = (i, j) => heights[Math.max(0, Math.min(nz - 1, j)) * nx + Math.max(0, Math.min(nx - 1, i))];
  const sample = (x, z) => {
    const gx = (x - x0) / dx, gz = (z - z0) / dz;
    if (gx < 0 || gx >= nx - 1 || gz < 0 || gz >= nz - 1) return { height: 0, normal: [0, 1, 0], gx: 0, gz: 0 };
    const i = Math.floor(gx), j = Math.floor(gz), tx = gx - i, tz = gz - j;
    const rows = [-1, 0, 1, 2].map(k => cubic(at(i - 1, j + k), at(i, j + k), at(i + 1, j + k), at(i + 2, j + k), tx));
    const h = cubic(rows[0][0], rows[1][0], rows[2][0], rows[3][0], tz);
    if (h[0] <= 0) return { height: 0, normal: [0, 1, 0], gx: 0, gz: 0 };
    const gradientX = cubic(rows[0][1], rows[1][1], rows[2][1], rows[3][1], tz)[0] / dx, gradientZ = h[1] / dz;
    return { height: h[0], normal: unit([-gradientX, 1, -gradientZ]), gx: gradientX, gz: gradientZ };
  };
  return { nx, nz, x0, z0, dx, dz, heights, owners, sample };
}
