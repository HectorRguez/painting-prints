import { randomSource, line } from '../shared/port.js';
import { clamp, mix, stossProfile } from './model.js';
import { depthBuffer } from './render.js';

const between = (r, a, b) => mix(a, b, r());
const gray = value => `#${Math.round(value).toString(16).padStart(2, '0').repeat(3)}`;

function surfaceCurve(at, steps = 80) {
  const points = [at(0)];
  const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  const refine = (a, b, pa, pb, depth) => {
    const m = (a + b) / 2, pm = at(m), chord = pa.map((v, i) => (v + pb[i]) / 2);
    if (depth < 10 && (distance(pa, pb) > 8 || distance(pm, chord) > .2)) {
      refine(a, m, pa, pm, depth + 1); refine(m, b, pm, pb, depth + 1);
    } else points.push(pb);
  };
  for (let i = 0; i < steps; i++) refine(i / steps, (i + 1) / steps, points.at(-1), at((i + 1) / steps), 0);
  return points;
}

// An illustrated, continuous ridge landscape. Broad asymmetric crest envelopes
// replace the isolated planform study in the optional ochre renderer. The
// windward cosine section remains the geometric inspiration, not a sand PDE.
export function inkLandscapeModel(seed, p) {
  const r = randomSource(`${seed}:ink-landscape`), layers = [];
  const count = Math.round(3 + p.density * 3), extent = mix(650, 1050, (p.spacing - 175) / 255);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1), width = p.crestLength * between(r, 3.5, 4.5);
    const layer = { id: i, center: between(r, -130, 130), width: clamp(width, 880, 1620),
      z: 20 + mix(extent / 2, -extent / 2, t) + between(r, -35, 35),
      height: p.crestHeight * p.relief * between(r, .85, 1.4) * mix(.72, 1.35, t),
      peak: between(r, -.38, .38) + p.asymmetry * .35, breadth: between(r, .43, .76),
      secondary: between(r, .05, p.morphology === 'star' ? .8 : .48),
      secondPeak: between(r, -.65, .65), phase: r() * Math.PI * 2 + p.windAzimuth,
      bend: p.curvature * width * between(r, .6, 1.15),
      slopeWidth: between(r, .85, 1.15), };
    const envelope = u => {
      if (Math.abs(u) >= 1) return 0;
      const main = Math.exp(-(((u - layer.peak) / layer.breadth) ** 2));
      const secondary = layer.secondary * Math.exp(-(((u - layer.secondPeak) / .34) ** 2));
      return (1 - u * u) ** (p.morphology === 'linear' ? 1.15 : 1.7) * (main + secondary);
    };
    let max = 0; for (let j = 0; j <= 100; j++) max = Math.max(max, envelope(j / 50 - 1));
    layer.crest = x => {
      const u = (x - layer.center) / (layer.width / 2), height = layer.height * envelope(u) / max;
      const z = layer.z + layer.bend * (.7 * Math.sin(u * 2.7 + layer.phase)
        + (p.morphology === 'barchan' ? p.horns * u * u : .22 * Math.sin(u * 5 - layer.phase)));
      return { height, z, u };
    };
    layers.push(layer);
  }
  const stossWidth = h => Math.max(h / (.28 * (1 - 1 / p.shearRatio)), p.saturationLength * 7);
  const leeWidth = h => h / Math.tan(p.slipAngle);
  const sample = (x, z) => {
    let height = 0, owner = -1;
    for (const layer of layers) {
      const crest = layer.crest(x); if (!crest.height) continue;
      const front = z < crest.z, width = (front ? stossWidth(crest.height) : leeWidth(crest.height)) * layer.slopeWidth;
      const q = Math.abs(z - crest.z) / width;
      const h = crest.height * (front ? stossProfile(q, p.stossExponent) : Math.max(0, 1 - q));
      if (h > height) { height = h; owner = layer.id; }
    }
    return { height, owner };
  };
  return { layers, sample, stossWidth, leeWidth };
}

export function makeInkCamera(p) {
  const depthScale = .4 + p.cameraElevation * .55, scale = .87;
  const project = (x, y, z) => {
    const perspectiveScale = 1 - z * p.perspective / 2300;
    return { x: 707 + (x + z * Math.sin(p.cameraAzimuth) * .25) * scale * perspectiveScale,
      y: 600 - z * depthScale - y * scale * perspectiveScale,
      depth: 5000 + z, perspectiveScale };
  };
  return { project, scale, verticalScale: 1, distance: 5000,
    direction: [0, Math.SQRT1_2, -Math.SQRT1_2], depthScale };
}

export function buildInkLandscape(seed, p) {
  const terrain = inkLandscapeModel(seed, p), camera = makeInkCamera(p);
  const nx = 225, nz = 177, x0 = -900, z0 = -704, dx = 1800 / (nx - 1), dz = 1408 / (nz - 1);
  const heights = new Float64Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) heights[j * nx + i] = terrain.sample(x0 + i * dx, z0 + j * dz).height;
  const sample = (x, z) => {
    const s = terrain.sample(x, z), e = .03;
    const gx = (terrain.sample(x + e, z).height - terrain.sample(x - e, z).height) / (2 * e);
    const gz = (terrain.sample(x, z + e).height - terrain.sample(x, z - e).height) / (2 * e);
    const length = Math.hypot(gx, 1, gz);
    return { ...s, gx, gz, normal: [-gx / length, 1 / length, -gz / length] };
  };
  // Geometry queries stay on the analytic field. The grid approximates only
  // visibility, so sampling a sharp crest cannot scallop its ink silhouette.
  const grid = { nx, nz, x0, z0, dx, dz, heights, sample };
  const vertices = [], cells = [], paths = [], lines = [], r = randomSource(`${seed}:ink-hatching`);
  for (let j = 0; j < grid.nz; j++) for (let i = 0; i < grid.nx; i++) {
    const x = grid.x0 + i * grid.dx, z = grid.z0 + j * grid.dz, h = grid.heights[j * grid.nx + i];
    vertices.push({ ...camera.project(x, h, z), shade: 0 });
  }
  for (let j = 0; j < grid.nz - 1; j++) for (let i = 0; i < grid.nx - 1; i++) {
    cells.push({ indices: [j * grid.nx + i, j * grid.nx + i + 1, (j + 1) * grid.nx + i + 1, (j + 1) * grid.nx + i] });
  }
  const visibility = depthBuffer(vertices, cells, 943, 667);
  const ink = (world, role, width, tone, owner, intervals = null) => {
    let points = [], screen = [];
    const flush = () => {
      const distances = [0];
      for (let i = 1; i < screen.length; i++) distances.push(distances[i - 1] + Math.hypot(screen[i][0] - screen[i - 1][0], screen[i][1] - screen[i - 1][1]));
      const length = distances.at(-1) || 0, minimum = role === 'crest' ? 200 : role === 'edge' ? 220 : 6;
      if (points.length > 2 && length >= minimum) {
        if (role === 'crest') {
          // Long ridge remnants fade into the sand at occlusion/merge points;
          // short disconnected remnants convey no useful silhouette and vanish.
          for (let i = 0; i < screen.length - 1; i += 3) {
            const end = Math.min(screen.length - 1, i + 3), middle = (distances[i] + distances[end]) / 2;
            const taper = clamp(Math.min(middle, length - middle) / 38, .18, 1);
            paths.push({ d: line(screen.slice(i, end + 1)), fill: 'none', stroke: gray(mix(145, tone, taper)),
              width: width * p.lineWeight * taper, role });
          }
        } else paths.push({ d: line(screen), fill: 'none', stroke: gray(tone), width: width * p.lineWeight, role });
        lines.push({ role, points, screen, owner });
      }
      points = []; screen = [];
    };
    for (const point of world) {
      const projected = camera.project(...point), s = terrain.sample(point[0], point[2]);
      if (projected.x < 67 || projected.x > 1347 || projected.y < 130 || projected.y > 927
        || point[1] < 2 || s.owner !== owner || !visibility.visible(projected, 3)
        || intervals && !intervals.some(([a, b]) => point[0] >= a && point[0] <= b)) { flush(); continue; }
      points.push(point); screen.push([projected.x, projected.y]);
    }
    flush();
  };
  const ridges = [];
  for (const layer of terrain.layers) {
    const points = [];
    for (let j = 0; j <= 240; j++) {
      const x = layer.center + layer.width * (j / 240 - .5), c = layer.crest(x);
      points.push([x, grid.sample(x, c.z).height + .35, c.z]);
    }
    ridges.push({ dune: layer.id, points: points.map(([x, y, z]) => [x, z, y]) });
    ink(points, 'crest', 1.25, 45, layer.id);
    const intervals = lines.filter(l => l.role === 'crest' && l.owner === layer.id)
      .map(l => [Math.min(...l.points.map(p => p[0])), Math.max(...l.points.map(p => p[0]))]);
    // A second, short line just below selected crests supplies an engraved
    // edge, while the broad light-facing surfaces stay open.
    const edge = [];
    for (let j = 0; j <= 160; j++) {
      const u = mix(-.74, .74, j / 160), x = layer.center + layer.width * u / 2, c = layer.crest(x);
      const z = c.z - terrain.stossWidth(c.height) * .025 * Math.sin((u + 1) * Math.PI / 2);
      edge.push([x, grid.sample(x, z).height + .35, z]);
    }
    ink(edge, 'edge', .55, 110, layer.id, intervals);
    const longRipples = layer.id % 3 === 1;
    if (longRipples && p.rippleDensity) for (let band = 1; band <= 3; band++) {
      const start = -.65 + band * .025, end = .45 - band * .045;
      const world = surfaceCurve(t => {
        const u = mix(start, end, t), x = layer.center + layer.width * u / 2, c = layer.crest(x);
        const q = (.055 * band) * Math.sin(Math.PI * t) ** .7;
        const z = c.z - terrain.stossWidth(c.height) * q;
        return [x, grid.sample(x, z).height + .35, z];
      });
      ink(world, 'ripple', .48, 115 + band * 9, layer.id, intervals);
    }
    const bundles = longRipples ? 1 : 1 + Math.floor(p.rippleDensity * 4);
    for (let bundle = 0; bundle < bundles; bundle++) {
      const center = longRipples ? .64 : -.7 + (bundle + .5) * 1.4 / bundles + between(r, -.08, .08);
      const q0 = between(r, .004, .015);
      const q1 = between(r, .13, .28) + p.rippleSlope * .24;
      const count = Math.round(p.ridgeBands * between(r, .75, 1.4));
      const step = p.rippleWavelength * between(r, .45, .8);
      if (!p.rippleDensity) continue;
      for (let i = 0; i < count; i++) {
        const x0 = layer.center + layer.width * center / 2 + (i - count / 2) * step;
        const c = layer.crest(x0), front = terrain.stossWidth(c.height) * layer.slopeWidth;
        const local = (i + .5) / count;
        const end = q0 + (q1 - q0) * (.45 + .55 * Math.sin(Math.PI * local));
        const world = [], steps = Math.max(18, Math.ceil(front * end / 5));
        for (let j = 0; j <= steps; j++) {
          const q = mix(q0, end, j / steps);
          const direction = Math.tanh((center - layer.peak) * 3) + .18 * Math.cos(p.windAzimuth);
          const drift = front * (1.05 + p.curvature) * q ** 1.65 * direction;
          const x = x0 + drift, z = c.z - front * q;
          world.push([x, grid.sample(x, z).height + .35, z]);
        }
        ink(world, 'ripple', .48, between(r, 100, 142), layer.id, intervals);
      }
    }
  }
  return { parameters: p, terrain, grid, camera, visibility, ridges, dunes: terrain.layers,
    wind: [Math.cos(p.windAzimuth), Math.sin(p.windAzimuth)], paths, lines, shading: [],
    metrics: { surfaceCells: cells.length, shadowCells: 0,
      visibleCrests: lines.filter(l => l.role === 'crest').length, rippleStrokes: lines.filter(l => l.role === 'ripple').length } };
}
