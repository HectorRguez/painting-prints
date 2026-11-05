import { randomSource, drawing, line, fitLines } from '../shared/port.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const profiles = [
  { name: 'elliptic', a: .78, b: .83, breadth: [.25, .35], lobes: 0 },
  { name: 'ovate', a: .58, b: 1.05, breadth: [.30, .41], lobes: 0 },
  { name: 'lanceolate', a: .88, b: 1.12, breadth: [.15, .23], lobes: 0 },
  { name: 'obovate', a: 1.12, b: .69, breadth: [.25, .36], lobes: 0 },
  { name: 'lobed', a: .67, b: .82, breadth: [.30, .40], lobes: 5 },
];

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
  const bend = (random() - .5) * 95;
  const lean = (random() - .5) * 55;
  const asymmetry = (random() - .5) * .13;
  const phase = random() * TAU;
  const lobes = profile.lobes ? 4 + Math.floor(random() * 3) : 0;
  const lobeDepth = .18 + random() * .13;
  const teeth = profile.name === 'lobed' ? 0 : (random() < .48 ? 20 + Math.floor(random() * 17) : 0);
  const toothDepth = .012 + random() * .018;
  const angle = (random() - .5) * .72;
  const pairs = lobes ? lobes + 1 : 8 + Math.floor(random() * 5);
  const sweep = .13 + random() * .11;
  const fineSpacing = 12.5 + random() * 4.5;
  const skeleton = [], regions = [];
  const center = t => bend * Math.sin(Math.PI * t) + lean * t;
  const halfWidth = (t, side) => {
    if (t <= 0 || t >= 1) return 0;
    const base = breadth * t ** a * (1 - t) ** b / normalizer;
    const uneven = 1 + side * asymmetry * Math.sin(Math.PI * t) + .018 * Math.sin(13 * t + phase + side);
    const lobed = lobes ? 1 - lobeDepth * (.5 + .5 * Math.cos(TAU * (t * lobes + .13))) : 1;
    const serrated = teeth ? 1 - toothDepth * (1 - ((t * teeth + .14 * side) % 1)) : 1;
    return base * uneven * lobed * serrated;
  };
  const position = (u, t, side) => {
    const x = center(t) + side * halfWidth(t, side) * u;
    const y = -length * t;
    return [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
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
      for (let i = 0; i < lobes; i++) {
        const target = (i + .37) / lobes;
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
      const regionWidth = Math.max(5, halfWidth(veinAt(mid, .5), side));
      const regionHeight = Math.max(5, (hi - lo) * length * .82);
      const network = areoles(regionWidth, regionHeight, fineSpacing, random);
      const map = ([u, v]) => position(u, lerp(veinAt(lo, u), veinAt(hi, u), v), side);
      regions.push({ side, lo, hi, cells: network.cells, edges: network.edges });
      for (const [start, end] of network.edges) {
        // Boundaries are already drawn by a major vein or the blade margin.
        if ([0, 1].some(k => Math.abs(start[k] - end[k]) < 1e-7 && (start[k] < 1e-7 || start[k] > 1 - 1e-7))) continue;
        const points = sample(t => map([lerp(start[0], end[0], t), lerp(start[1], end[1], t)]), 4);
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
        add(sample(t => map([lerp(root[0], tip[0], t), lerp(root[1], tip[1], t)]), 3), 'veinlet', .32, ink.tertiary);
      }
    }
    // Secondary veins thin toward the margin instead of stopping abruptly.
    for (const root of roots.slice(1, -1)) for (let part = 0; part < 5; part++) {
      add(sample(v => {
        const u = (part + v) / 5;
        return position(u, veinAt(root, u), side);
      }, 10), 'secondary', lerp(1.9, .60, (part + .5) / 5) * (1 - root * .28), ink.secondary);
    }
    add(sample(t => position(1, t, side), 700), 'margin', .78, ink.margin);
  }
  for (let part = 0; part < 10; part++) {
    add(sample(t => position(0, (part + t) / 10, 1), 10), 'primary', lerp(3.7, .45, (part + .5) / 10), ink.primary);
  }
  // The petiole is an attached continuation of the midrib, with a slight bend.
  const stalkLength = 64 + random() * 48;
  const stalkBend = (random() - .5) * 35;
  add(sample(t => {
    const x = stalkBend * t * t, y = stalkLength * t;
    return [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
  }, 24), 'petiole', 3.4, ink.primary);
  const fitted = fitLines(skeleton.map(path => path.points), 1000, 1000, 88);
  return { paths: skeleton.map((path, i) => ({ ...path, points: fitted[i] })), regions,
    traits: { profile: profile.name, lobes, teeth, secondaryPairs: pairs - 1, fineSpacing,
      length, breadth, bend, angle, areoles: regions.reduce((sum, region) => sum + region.cells.length, 0) } };
}

export function generateLeaf(seed) {
  const { paths, traits } = leafGeometry(seed);
  return { ...drawing(paths.map(path => ({ d: line(path.points), width: path.width, stroke: path.stroke })), { rounded: true }),
    mode: 'leaves', seed, artRevision: 1, traits };
}
