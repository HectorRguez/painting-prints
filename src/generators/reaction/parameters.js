import { randomSource } from '../shared/port.js';

const between = (random, lo, hi) => lo + random() * (hi - lo);
export const parameterRanges = {
  size: [96, 224], feed: [.024, .065], kill: [.057, .068],
  diffusionU: [.65, 1.15], diffusionV: [.3, .6], dt: [.2, .8], duration: [600, 4200],
  nuclei: [3, 24], spread: [.06, .29], aspect: [.35, 1], seedRadius: [3, 10],
  clusterCount: [1, 3], clusterSeparation: [0, .85],
  seedElongation: [1, 2.3], rotation: [-Math.PI, Math.PI], noise: [0, .025],
  feedGradient: [-.002, .002], gradientAngle: [-Math.PI, Math.PI],
  threshold: [.08, .24], contourSpacing: [.025, .09], contourCount: [1, 4],
  lineWidth: [.7, 1.8], padding: [65, 150], inkDensity: [0, 1],
};

export function reactionParameters(seed) {
  const random = randomSource(`${seed}:reaction`);
  for (let i = 0; i < 6; i++) random();
  const choice = random();
  const habit = choice < .32 ? 'dividing spots' : choice < .65 ? 'coral fronts' : 'labyrinth';
  const feed = habit === 'dividing spots' ? between(random, .031, .039)
    : habit === 'coral fronts' ? between(random, .051, .057) : between(random, .034, .042);
  const kill = habit === 'dividing spots' ? .0635 + (feed - .035) * .14 + between(random, -.0004, .0004)
    : habit === 'coral fronts' ? between(random, .0616, .0625) : between(random, .060, .0612);
  const diffusionU = between(random, .68, .93);
  return { habit, size: 176, feed, kill, diffusionU, diffusionV: diffusionU * between(random, .48, .52),
    dt: .75, duration: between(random, 1900, 3000), nuclei: 9 + Math.floor(random() * 12),
    spread: between(random, .13, .25), aspect: between(random, .48, 1),
    seedRadius: between(random, 3.8, 6), seedElongation: between(random, 1, 1.7),
    rotation: between(random, -Math.PI, Math.PI), noise: between(random, .002, .015),
    feedGradient: between(random, -.0008, .0008), gradientAngle: between(random, -Math.PI, Math.PI),
    threshold: between(random, .10, .14), contourSpacing: between(random, .065, .085), contourCount: 4,
    lineWidth: between(random, 1.05, 1.45), padding: between(random, 82, 112), inkDensity: between(random, .45, .95),
    clusterCount: 1 + Math.floor(random() * 2.6), clusterSeparation: between(random, .35, .85),
  };
}

export function resolveParameters(seed, overrides = {}) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new TypeError('Expected reaction parameter overrides');
  const result = { ...reactionParameters(seed), ...overrides };
  for (const key of Object.keys(overrides)) if (!(key in parameterRanges)) throw new RangeError(`Unknown reaction parameter: ${key}`);
  for (const [key, [lo, hi]] of Object.entries(parameterRanges)) {
    if (!Number.isFinite(result[key]) || result[key] < lo || result[key] > hi) throw new RangeError(`${key} must be between ${lo} and ${hi}`);
  }
  for (const key of ['size', 'nuclei', 'contourCount', 'clusterCount']) if (!Number.isInteger(result[key])) throw new RangeError(`${key} must be an integer`);
  // Explicit diffusion alone permits dt*D <= 1.25 for this stencil. The
  // stricter limit leaves room for autocatalysis instead of clipping negatives.
  if (result.dt * result.diffusionU > .85 || result.dt * result.diffusionV > .85) throw new RangeError('Time step is too large for the diffusion rate');
  if (result.size ** 2 * Math.ceil(result.duration / result.dt) > 180_000_000) throw new RangeError('Grid size and duration exceed the reaction work budget; use a coarser grid or shorter duration');
  if (result.spread * result.size + result.seedRadius * result.seedElongation * 1.2 >= (result.size - 1) / 2 - 12) {
    throw new RangeError('Initial nuclei need twelve grid cells of clearance from the reservoir');
  }
  return result;
}

export function initialReaction(seed, parameters) {
  const p = parameters, size = p.size, random = randomSource(`${seed}:nuclei`);
  const u = new Float64Array(size * size).fill(1), v = new Float64Array(size * size);
  const feedField = new Float64Array(size * size);
  const nuclei = [], c = Math.cos(p.rotation), s = Math.sin(p.rotation);
  for (let i = 0; i < p.nuclei; i++) {
    const separation = p.clusterCount > 1 ? p.clusterSeparation : 0;
    const angle = between(random, 0, Math.PI * 2), radius = Math.sqrt(random()) * p.spread * size * (1 - separation);
    const centerAngle = (i % p.clusterCount) * Math.PI * 2 / p.clusterCount;
    const x = Math.cos(angle) * radius + Math.cos(centerAngle) * separation * p.spread * size;
    const y = (Math.sin(angle) * radius + Math.sin(centerAngle) * separation * p.spread * size) * p.aspect;
    nuclei.push({ x: (size - 1) / 2 + x * c - y * s, y: (size - 1) / 2 + x * s + y * c,
      radius: p.seedRadius * between(random, .8, 1.2), angle: p.rotation + between(random, -.8, .8) });
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    feedField[i] = p.feed + p.feedGradient * ((x / (size - 1) - .5) * Math.cos(p.gradientAngle)
      + (y / (size - 1) - .5) * Math.sin(p.gradientAngle));
    for (const n of nuclei) {
      const dx = x - n.x, dy = y - n.y, nc = Math.cos(n.angle), ns = Math.sin(n.angle);
      const distance = Math.hypot((dx * nc + dy * ns) / p.seedElongation, -dx * ns + dy * nc) / n.radius;
      if (distance < 1) {
        const amount = .25 + (random() - .5) * p.noise;
        v[i] = amount; u[i] = 1 - amount * 2;
      }
    }
  }
  return { size, u, v, feedField, nuclei, elapsed: 0 };
}
