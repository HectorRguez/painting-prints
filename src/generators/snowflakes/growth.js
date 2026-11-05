import { randomSource } from '../shared/port.js';

// Axial coordinates on a hexagonal lattice. Each site represents an entire
// orbit under six rotations and reflection, so the six arms share one history.
export const directions = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
const fieldRadius = 200;
const reservoirRadius = 168;
const maximumSteps = 12000;
let lattice;

function representative(q, r) {
  let bestQ = -Infinity, bestR = 0;
  for (let reflection = 0; reflection < 2; reflection++) {
    let a = reflection ? r : q, b = reflection ? q : r;
    for (let turn = 0; turn < 6; turn++) {
      if (a > bestQ || (a === bestQ && b > bestR)) { bestQ = a; bestR = b; }
      [a, b] = [-b, a + b];
    }
  }
  return [bestQ, bestR];
}

export function hexLattice() {
  if (lattice) return lattice;
  const side = fieldRadius * 2 + 1;
  const map = new Int32Array(side * side).fill(-1);
  const orbits = new Map(), sites = [];
  for (let q = -fieldRadius; q <= fieldRadius; q++) {
    for (let r = -fieldRadius; r <= fieldRadius; r++) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) > fieldRadius) continue;
      const [a, b] = representative(q, r), key = `${a},${b}`;
      let id = orbits.get(key);
      if (id === undefined) {
        id = sites.length;
        orbits.set(key, id);
        const radius = Math.sqrt(a * a + a * b + b * b);
        sites.push({ q: a, r: b, radius, reservoir: radius >= reservoirRadius });
      }
      map[(q + fieldRadius) * side + r + fieldRadius] = id;
    }
  }
  const at = (q, r) => Math.abs(q) > fieldRadius || Math.abs(r) > fieldRadius
    ? -1 : map[(q + fieldRadius) * side + r + fieldRadius];
  const neighbors = new Int32Array(sites.length * 6);
  sites.forEach((site, id) => directions.forEach(([q, r], direction) => {
    neighbors[id * 6 + direction] = at(site.q + q, site.r + r);
  }));
  lattice = { at, sites, neighbors, fieldRadius, reservoirRadius };
  return lattice;
}

const between = (random, low, high) => low + random() * (high - low);

export function snowflakeParameters(seed) {
  const random = randomSource(seed);
  const kind = random();
  const habit = kind < .30 ? 'fern dendrite' : kind < .61 ? 'stellar dendrite'
    : kind < .84 ? 'sectored plate' : 'plate with branches';
  const ranges = {
    'fern dendrite': [.32, .47, .00002, .0014],
    'stellar dendrite': [.29, .44, .002, .009],
    'sectored plate': [.18, .34, .018, .052],
    'plate with branches': [.24, .34, .065, .13],
  };
  const [b0, b1, g0, g1] = ranges[habit];
  const beta = between(random, b0, b1);
  const gamma = between(random, g0, g1);
  const alpha = between(random, .72, 1.15);
  const targetRadius = between(random, 112, 144);
  const firstChange = between(random, .22, .40);
  const secondChange = between(random, .55, .76);
  // A crystal passes through different air layers. Shared changes
  // affect all tips; independent random ornaments are never attached to arms.
  const phases = [
    { radius: 0, beta, gamma, alpha },
    { radius: firstChange * targetRadius,
      beta: beta * between(random, .91, 1.09),
      gamma: habit === 'plate with branches' ? between(random, .001, .006) : gamma * between(random, .38, 1.5),
      alpha: alpha * between(random, .91, 1.08) },
    { radius: secondChange * targetRadius,
      beta: beta * between(random, .92, 1.13),
      gamma: habit === 'fern dendrite' ? between(random, .00002, .0017)
        : habit === 'plate with branches' ? between(random, .001, .012) : gamma * between(random, .35, 1.7),
      alpha: alpha * between(random, .90, 1.1) },
  ];
  return { habit, targetRadius, phases, rotation: between(random, -Math.PI / 12, Math.PI / 12) };
}

export function growSnowflake(seed) {
  const parameters = snowflakeParameters(seed);
  const { sites, neighbors, at } = hexLattice();
  const count = sites.length;
  let phaseIndex = 0, phase = parameters.phases[0];
  let state = new Float64Array(count).fill(phase.beta);
  let next = new Float64Array(count);
  const vapor = new Float64Array(count);
  const receptive = new Uint8Array(count);
  const born = new Int32Array(count).fill(-1);
  const phaseTimes = [];
  state[at(0, 0)] = 1;
  born[at(0, 0)] = 0;
  let radius = 0, steps = 0;

  for (; steps < maximumSteps && radius < parameters.targetRadius; steps++) {
    if (parameters.phases[phaseIndex + 1]?.radius <= radius) {
      const previous = phase;
      phase = parameters.phases[++phaseIndex];
      // Reiter's changing-environment variant rescales mobile vapor only;
      // deposited mass stays in place and no existing crystal is erased.
      const ratio = phase.beta / previous.beta;
      for (let id = 0; id < count; id++) if (!receptive[id]) state[id] *= ratio;
      phaseTimes.push(steps);
    }
    for (let id = 0; id < count; id++) {
      let receives = state[id] >= 1;
      for (let j = 0; j < 6 && !receives; j++) {
        const neighbor = neighbors[id * 6 + j];
        if (neighbor >= 0 && state[neighbor] >= 1) receives = true;
      }
      receptive[id] = receives ? 1 : 0;
      vapor[id] = receives ? 0 : state[id];
    }
    for (let id = 0; id < count; id++) {
      if (sites[id].reservoir) { next[id] = phase.beta; continue; }
      let surrounding = 0;
      for (let j = 0; j < 6; j++) surrounding += vapor[neighbors[id * 6 + j]];
      next[id] = state[id] + phase.alpha * (surrounding / 12 - vapor[id] / 2)
        + receptive[id] * phase.gamma;
      if (next[id] >= 1 && born[id] < 0) {
        born[id] = steps + 1;
        radius = Math.max(radius, sites[id].radius);
      }
    }
    [state, next] = [next, state];
  }
  if (radius < parameters.targetRadius) throw new Error('Snow crystal growth did not finish');
  return { parameters, born, steps, radius, phaseTimes };
}
