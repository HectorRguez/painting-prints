import { randomSource, drawing, line, fitLines } from '../shared/port.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const profiles = [
  { name: 'elliptic', a: .78, b: .83, breadth: [.25, .35], lobes: 0 },
  { name: 'ovate', a: .58, b: 1.05, breadth: [.30, .41], lobes: 0 },
  { name: 'lanceolate', a: .88, b: 1.12, breadth: [.15, .23], lobes: 0 },
  { name: 'obovate', a: 1.12, b: .69, breadth: [.25, .36], lobes: 0 },
  { name: 'lobed', a: .67, b: .82, breadth: [.33, .43], lobes: 5 },
  { name: 'cordate', a: .38, b: .77, breadth: [.42, .51], lobes: 0 },
  { name: 'spatulate', a: 1.75, b: .38, breadth: [.25, .34], lobes: 0 },
  { name: 'falcate', a: .79, b: 1.12, breadth: [.12, .19], lobes: 0 },
];

function knotValue(knots, t, rounded = false) {
  let lo = 0, hi = knots.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (knots[mid][0] < t) lo = mid; else hi = mid;
  }
  const [a, b] = [knots[lo], knots[hi]];
  const fraction = clamp((t - a[0]) / (b[0] - a[0]), 0, 1);
  return lerp(a[1], b[1], rounded ? .5 - .5 * Math.cos(Math.PI * fraction) : fraction);
}

function irregularMargin(random, count, strength, style) {
  const spacing = Array.from({ length: count }, () => .55 + random() * .95);
  const total = spacing.reduce((sum, size) => sum + size, 0);
  const knots = [[0, 0]];
  let t = 0;
  for (let i = 0; i < count; i++) {
    const step = spacing[i] / total;
    const peak = style === 'serrate' ? .53 + random() * .31 : .30 + random() * .37;
    const notch = strength * (.48 + random() * .9) * (random() < .16 ? 1.45 : 1);
    knots.push([t + step * peak, -strength * random() * .16]);
    t += step;
    knots.push([i === count - 1 ? 1 : t, i === count - 1 ? 0 : Math.min(.18, notch)]);
  }
  return { knots, style, count };
}

function irregularLobes(random, count) {
  const tips = Array.from({ length: count }, (_, i) => (i + .38 + (random() - .5) * .22) / count);
  const depths = Array.from({ length: count + 1 }, () => .23 + random() * .15);
  const knots = [[0, 1 - depths[0]]];
  tips.forEach((tip, i) => {
    knots.push([tip, .95 + random() * .10]);
    if (i < tips.length - 1) knots.push([lerp(tip, tips[i + 1], .42 + random() * .16), 1 - depths[i + 1]]);
  });
  knots.push([1, 1 - depths.at(-1)]);
  return { tips, knots };
}

function clip(polygon, nx, ny, c) {
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = a[0] * nx + a[1] * ny - c;
    const db = b[0] * nx + b[1] * ny - c;
    if (da <= 1e-8) result.push(a);
    if ((da < 0) !== (db < 0)) {
      const t = da / (da - db);
      result.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
    }
  }
  return result;
}

// A bounded Voronoi tessellation supplies the closed minor-vein loops. Each
// region is mapped between two major veins, so its network joins those veins
// and cannot cross the leaf margin. This is a geometric model, not an auxin
// simulation; see README.md for the biological constraints and references.
function areoles(width, height, spacing, random) {
  const count = Math.max(1, Math.round(width * height / (spacing * spacing)));
  const sites = [];
  // Best-candidate spacing avoids both accidental dense clumps and visible
  // lattice rows. Varying the candidate count retains small and large areoles.
  for (let i = 0; i < count; i++) {
    let best, bestDistance = -1;
    const candidates = 3 + Math.floor(random() * 4);
    for (let j = 0; j < candidates; j++) {
      const point = [random() * width, random() * height];
      let nearest = Infinity;
      for (const site of sites) nearest = Math.min(nearest, (point[0] - site[0]) ** 2 + (point[1] - site[1]) ** 2);
      if (nearest > bestDistance) { best = point; bestDistance = nearest; }
    }
    sites.push(best);
  }
  const cells = sites.map((site, index) => {
    let polygon = [[0, 0], [width, 0], [width, height], [0, height]];
    for (let j = 0; j < sites.length && polygon.length; j++) {
      if (j === index) continue;
      const other = sites[j];
      polygon = clip(polygon, other[0] - site[0], other[1] - site[1],
        (other[0] ** 2 + other[1] ** 2 - site[0] ** 2 - site[1] ** 2) / 2);
    }
    return polygon.map(([x, y]) => [clamp(x / width, 0, 1), clamp(y / height, 0, 1)]);
  });
  const edges = new Map();
  const pointKey = p => p.map(v => Math.round(v * 1e7)).join(',');
  for (const cell of cells) for (let i = 0; i < cell.length; i++) {
    const a = cell[i], b = cell[(i + 1) % cell.length];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-7) continue;
    const keys = [pointKey(a), pointKey(b)].sort();
    edges.set(keys.join('|'), [a, b]);
  }
  return { cells, edges: [...edges.values()] };
}

export function leafGeometry(seed) {
  const random = randomSource(seed);
  // Warm up the small PRNG before choosing the silhouette: adjacent readable
  // seed strings should not all select the same profile.
  for (let i = 0; i < 8; i++) random();
  const profile = profiles[Math.floor(random() * profiles.length)];
  const length = 690 + random() * 90;
  const breadth = lerp(...profile.breadth, random()) * length;
  const a = profile.a + (random() - .5) * .16;
  const b = profile.b + (random() - .5) * .14;
  const peak = a / (a + b);
  const normalizer = peak ** a * (1 - peak) ** b;
  const bend = profile.name === 'falcate'
    ? (random() < .5 ? -1 : 1) * length * (.23 + random() * .12)
    : (random() - .5) * 95;
  const lean = (random() - .5) * 55;
  const asymmetry = (random() - .5) * .13;
  const phase = random() * TAU;
  const lobes = profile.lobes ? 3 + Math.floor(random() * 4) : 0;
  const teeth = (profile.name === 'cordate' ? 26 : 17) + Math.floor(random() * 14);
  const marginStyle = ['serrate', 'dentate', 'crenate'][Math.floor(random() * 3)];
  const marginStrength = (lobes ? .026 : .048) + random() * (lobes ? .039 : .052);
  const margins = [-1, 1].map(() => irregularMargin(random, teeth, marginStrength, marginStyle));
  const lobing = lobes ? [-1, 1].map(() => irregularLobes(random, lobes)) : null;
  const basalShear = profile.name === 'cordate' ? length * (.24 + random() * .08) : 0;
  const angle = (random() - .5) * .72;
  const pairs = lobes ? lobes + 1 : 8 + Math.floor(random() * 5);
  const sweep = .13 + random() * .11;
  const fineSpacing = 12.5 + random() * 4.5;
  const skeleton = [], regions = [];
  const center = t => bend * Math.sin(Math.PI * t) + lean * t;
  const envelopeWidth = (t, side) => {
    if (t <= 0 || t >= 1) return 0;
    const base = breadth * t ** a * (1 - t) ** b / normalizer;
    const uneven = 1 + side * asymmetry * Math.sin(Math.PI * t) + .018 * Math.sin(13 * t + phase + side);
    const neck = profile.name === 'spatulate' ? .38 + .62 * clamp((t - .32) / .38, 0, 1) : 1;
    // Keep a small blade beside the thick midrib as a spoon-shaped leaf
    // narrows into its petiole, rather than pinching it to subpixel width.
    const basalBlade = profile.name === 'spatulate' ? breadth * .012 * Math.sin(Math.PI * t) ** .35 * Math.exp(-10 * t) : 0;
    return base * uneven * neck + basalBlade;
  };
  // A vertical shear creates basal lobes around the cordate petiole notch.
  // Since y is displaced only as a function of x, the shear preserves the
  // orientation and connectivity of the existing vein map.
  const shear = x => basalShear * (1 - Math.exp(-3.8 * (x / breadth) ** 2));
  const rotate = (x, y) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
  const position = (u, t, side) => {
    const margin = margins[side < 0 ? 0 : 1];
    const gate = profile.name === 'spatulate' ? clamp((t - .22) / .32, 0, 1) : 1;
    const indentation = knotValue(margin.knots, t, margin.style === 'crenate') * Math.sin(Math.PI * clamp(t, 0, 1)) ** .65 * gate;
    // Concentrate raggedness at the edge instead of corrugating the whole
    // skeleton. With indentation <= .18, d(u - indentation*u^4)/du >= .28,
    // so even deep notches cannot fold the interior vein network.
    const innerRadius = u - indentation * u ** 4;
    const lobe = lobing ? knotValue(lobing[side < 0 ? 0 : 1].knots, t, true) : 1;
    // Lobe indentation also fades toward the midrib. Its minimum derivative
    // is positive (lobe >= .62), so composition with the margin map stays
    // monotone while leaving inner areoles less distorted near a sinus.
    const radius = innerRadius + (lobe - 1) * innerRadius ** 2;
    const x = center(t) + side * envelopeWidth(t, side) * radius;
    return rotate(x, -length * t + shear(x));
  };
  const add = (points, role, width, stroke) => {
    if (points.length > 1) skeleton.push({ points, role, width, stroke });
  };
  const sample = (fn, count) => Array.from({ length: count + 1 }, (_, i) => fn(i / count));
  // Keep the hierarchy legible at gallery scale; tiny loops are visible when
  // zoomed or printed, rather than making an equally dark wire mesh.
  const ink = { primary: '#373d32', secondary: '#4b5242', tertiary: '#6c7461', margin: '#5d6551' };
  // Fix both endpoints at the base/apex; this keeps the basal blade covered
  // and preserves a strictly monotone, non-folding map between adjacent veins.
  const veinAt = (root, u) => root + sweep * Math.sin(Math.PI * root) * Math.pow(u, 1.27);
  for (const side of [-1, 1]) {
    const roots = [0];
    if (lobes) {
      // An oak-like lateral vein feeds the tip of each lobe, not its sinus.
      for (const target of lobing[side < 0 ? 0 : 1].tips) {
        let lo = 0, hi = 1;
        for (let step = 0; step < 28; step++) {
          const mid = (lo + hi) / 2;
          if (veinAt(mid, 1) < target) lo = mid; else hi = mid;
        }
        roots.push((lo + hi) / 2);
      }
    } else {
      for (let i = 1; i < pairs; i++) roots.push(clamp((i + (random() - .5) * .27 + side * .08) / pairs, .01, .99));
    }
    roots.push(1);
    for (let r = 0; r < roots.length - 1; r++) {
      const lo = roots[r], hi = roots[r + 1];
      const mid = (lo + hi) / 2;
      const regionWidth = Math.max(5, envelopeWidth(veinAt(mid, .5), side) * (lobes ? .85 : 1));
      const regionHeight = Math.max(5, (hi - lo) * length * .82);
      const network = areoles(regionWidth, regionHeight, fineSpacing, random);
      const bladeT = ([u, v]) => lerp(veinAt(lo, u), veinAt(hi, u), v);
      const map = ([u, v]) => position(u, bladeT([u, v]), side);
      const mappedLine = (start, end, minimum) => sample(t => map([lerp(start[0], end[0], t), lerp(start[1], end[1], t)]),
        Math.max(minimum, Math.ceil(Math.abs(bladeT(start) - bladeT(end)) * length / 1.25)));
      regions.push({ side, lo, hi, cells: network.cells, edges: network.edges });
      for (const [start, end] of network.edges) {
        // Boundaries are already drawn by a major vein or the blade margin.
        if ([0, 1].some(k => Math.abs(start[k] - end[k]) < 1e-7 && (start[k] < 1e-7 || start[k] > 1 - 1e-7))) continue;
        const points = mappedLine(start, end, 4);
        add(points, 'minor', .44 + random() * .14, ink.tertiary);
      }
      // Freely ending veinlets are subordinate branches inside closed areoles.
      for (const cell of network.cells) {
        if (cell.length < 4 || random() > .34) continue;
        const center = cell.reduce((sum, p) => [sum[0] + p[0] / cell.length, sum[1] + p[1] / cell.length], [0, 0]);
        const edge = Math.floor(random() * cell.length);
        const start = cell[edge], end = cell[(edge + 1) % cell.length];
        const root = [lerp(start[0], end[0], .5), lerp(start[1], end[1], .5)];
        const tip = [lerp(root[0], center[0], .74), lerp(root[1], center[1], .74)];
        add(mappedLine(root, tip, 3), 'veinlet', .32, ink.tertiary);
      }
    }
    // Secondary veins thin toward the margin instead of stopping abruptly.
    for (const root of roots.slice(1, -1)) for (let part = 0; part < 5; part++) {
      add(sample(v => {
        const u = (part + v) / 5;
        return position(u, veinAt(root, u), side);
      }, 10), 'secondary', lerp(1.9, .60, (part + .5) / 5) * (1 - root * .28), ink.secondary);
    }
    const outlineSamples = [...Array.from({ length: 701 }, (_, i) => i / 700),
      ...margins[side < 0 ? 0 : 1].knots.map(knot => knot[0]),
      ...(lobing ? lobing[side < 0 ? 0 : 1].knots.map(knot => knot[0]) : [])].sort((a, b) => a - b);
    add(outlineSamples.map(t => position(1, t, side)), 'margin', .78, ink.margin);
  }
  for (let part = 0; part < 10; part++) {
    add(sample(t => position(0, (part + t) / 10, 1), 10), 'primary', lerp(3.7, .45, (part + .5) / 10), ink.primary);
  }
  // The petiole is an attached continuation of the midrib, with a slight bend.
  const stalkLength = 64 + random() * 48;
  const stalkBend = (random() - .5) * 35;
  const basalTangent = (center(.0001) - center(0)) / (.0001 * length);
  add(sample(t => {
    const x = -basalTangent * stalkLength * t + stalkBend * t * t;
    return rotate(x, stalkLength * t + shear(x));
  }, 24), 'petiole', 3.4, ink.primary);
  const fitted = fitLines(skeleton.map(path => path.points), 1000, 1000, 88);
  return { paths: skeleton.map((path, i) => ({ ...path, points: fitted[i] })), regions,
    traits: { profile: profile.name, lobes, teeth, marginStyle, marginStrength, secondaryPairs: pairs - 1, fineSpacing,
      length, breadth, bend, basalShear, angle, areoles: regions.reduce((sum, region) => sum + region.cells.length, 0) } };
}

export function generateLeaf(seed) {
  const { paths, traits } = leafGeometry(seed);
  return { ...drawing(paths.map(path => ({ d: line(path.points), width: path.width, stroke: path.stroke })), { rounded: true }),
    mode: 'leaves', seed, artRevision: 2, traits };
}
