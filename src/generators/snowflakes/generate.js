import { drawing, line } from '../shared/port.js';
import { growSnowflake, hexLattice } from './growth.js';

const root3 = Math.sqrt(3);
const corners = [[1, 1], [0, 2], [-1, 1], [-1, -1], [0, -2], [1, -1]];
const across = [[0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0]];

// Integer vertex coordinates make neighboring cells share exact endpoints.
// Trace their union; the exported drawing contains contours, not a hex grid.
export function crystalContours(crystal, time = crystal.steps) {
  const { at, fieldRadius } = hexLattice();
  const solid = (q, r) => { const id = at(q, r); return id >= 0 && crystal.born[id] >= 0 && crystal.born[id] <= time; };
  const edges = new Map();
  for (let q = -fieldRadius; q <= fieldRadius; q++) {
    for (let r = -fieldRadius; r <= fieldRadius; r++) {
      if (!solid(q, r)) continue;
      for (let side = 0; side < 6; side++) {
        const [dq, dr] = across[side];
        if (solid(q + dq, r + dr)) continue;
        const a = corners[side], b = corners[(side + 1) % 6];
        edges.set(`${2 * q + r + a[0]},${3 * r + a[1]}`, [2 * q + r + b[0], 3 * r + b[1]]);
      }
    }
  }
  const loops = [];
  while (edges.size) {
    const start = edges.keys().next().value;
    let vertex = start;
    const points = [];
    do {
      const [x, y] = vertex.split(',').map(Number);
      points.push([x * root3 / 2, y / 2]);
      const end = edges.get(vertex);
      if (!end) throw new Error('Open snow crystal contour');
      edges.delete(vertex);
      vertex = end.join(',');
    } while (vertex !== start);
    loops.push(points);
  }
  return loops;
}

function distanceToSegment(point, start, end) {
  const dx = end[0] - start[0], dy = end[1] - start[1];
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(point[0] - start[0] - dx * t, point[1] - start[1] - dy * t);
}

function simplifyOpen(points, tolerance) {
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const pending = [[0, points.length - 1]];
  while (pending.length) {
    const [first, last] = pending.pop();
    let farthest = tolerance, index = -1;
    for (let i = first + 1; i < last; i++) {
      const distance = distanceToSegment(points[i], points[first], points[last]);
      if (distance > farthest) { farthest = distance; index = i; }
    }
    if (index >= 0) {
      keep[index] = 1;
      pending.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function simplifyLoop(points, tolerance) {
  // Remove sub-cell stair steps while retaining the lattice's faceted tips.
  // Contours have a deterministic traversal order. Retained vertices stay on
  // the original boundary; their symmetry orbits are restored below.
  let split = 1, farthest = 0;
  points.forEach((p, i) => {
    const distance = Math.hypot(p[0] - points[0][0], p[1] - points[0][1]);
    if (distance > farthest) { farthest = distance; split = i; }
  });
  return [...simplifyOpen(points.slice(0, split + 1), tolerance).slice(0, -1),
    ...simplifyOpen([...points.slice(split), points[0]], tolerance).slice(0, -1)];
}

function vertexOrbit([x, y]) {
  const vx = Math.round(x * 2 / root3), vy = Math.round(y * 2);
  let bestX = -Infinity, bestY = 0;
  for (const reflection of [-1, 1]) {
    let a = vx, b = vy * reflection;
    for (let turn = 0; turn < 6; turn++) {
      if (a > bestX || (a === bestX && b > bestY)) { bestX = a; bestY = b; }
      [a, b] = [(a - b) / 2, (3 * a + b) / 2];
    }
  }
  return `${bestX},${bestY}`;
}

function simplifyContours(loops, tolerance) {
  // Conservatively retain a vertex everywhere if any symmetric arm needs it.
  // This avoids direction/tie-breaking artifacts from simplifying one long
  // closed outline in arbitrary traversal order.
  const keep = new Set(loops.flatMap(points => simplifyLoop(points, tolerance).map(vertexOrbit)));
  return loops.map(points => points.filter(point => keep.has(vertexOrbit(point))));
}

function growthRidges(crystal) {
  const { at } = hexLattice();
  const solid = (q, r) => { const id = at(q, r); return id >= 0 && crystal.born[id] >= 0; };
  let tip = 0;
  while (solid(tip + 1, 0)) tip++;
  const arms = [[[0, 0], [Math.max(0, tip - .7) * root3, 0]]];
  const lengths = new Array(tip + 1).fill(0);
  for (let q = 3; q < tip - 2; q++) {
    let r = 1;
    while (r < q && solid(q, r)) r++;
    // A ray reaching the neighboring arm's sector is part of a broad plate,
    // not a separate branch. Drawing it would invent a decorative spider web.
    lengths[q] = r >= q ? 0 : r - 1;
  }
  let previous = 0;
  for (let q = 4; q < tip - 3; q++) {
    if (crystal.parameters.habit.includes('plate')) break;
    const length = lengths[q];
    if (length < 4 || q - previous < 4) continue;
    if (length < Math.max(...lengths.slice(q - 2, q + 3))) continue;
    previous = q;
    const r = Math.max(1, length - .6);
    for (const sign of [-1, 1]) arms.push([[q * root3, 0], [(q + r / 2) * root3, sign * r * 1.5]]);
  }
  const result = [];
  for (let turn = 0; turn < 6; turn++) {
    const angle = turn * Math.PI / 3, c = Math.cos(angle), s = Math.sin(angle);
    for (const points of arms) result.push(points.map(([x, y]) => [x * c - y * s, x * s + y * c]));
  }
  return result;
}

export function snowflakeGeometry(seed) {
  const crystal = growSnowflake(seed);
  const outline = crystalContours(crystal).filter(points => points.length > 12);
  const maximum = Math.max(...outline.flatMap(points => points.map(([x, y]) => Math.hypot(x, y))));
  const scale = 425 / maximum;
  const angle = crystal.parameters.rotation, c = Math.cos(angle), s = Math.sin(angle);
  const place = points => points.map(([x, y]) => [500 + (x * c - y * s) * scale, 500 + (x * s + y * c) * scale]);
  const tolerance = crystal.parameters.habit === 'sectored plate' ? 1.2 : .7;
  const paths = simplifyContours(outline, tolerance).map(points => ({ points: place(points), closed: true, width: 1.7, stroke: '#282c30', role: 'outline' }));
  for (const points of growthRidges(crystal)) paths.push({ points: place(points), closed: false, width: .9, stroke: '#626970', role: 'ridge' });
  // Growth boundaries are a restrained illustration of the two changes in
  // conditions. No independent polygons are stamped into the crystal.
  for (const time of crystal.phaseTimes) {
    for (const points of simplifyContours(crystalContours(crystal, time).filter(points => points.length > 24), tolerance)) {
      paths.push({ points: place(points), closed: true, width: .6, stroke: '#93999d', role: 'growth boundary' });
    }
  }
  return { crystal, paths };
}

export function generateSnowflake(seed) {
  const { crystal, paths } = snowflakeGeometry(seed);
  return { ...drawing(paths.map(path => ({ d: line(path.points, path.closed), width: path.width, stroke: path.stroke })), { rounded: true }),
    mode: 'snowflakes', seed, artRevision: 1,
    snowflake: { habit: crystal.parameters.habit, steps: crystal.steps, radius: crystal.radius,
      parameters: crystal.parameters, contours: paths.filter(path => path.role === 'outline').length } };
}
