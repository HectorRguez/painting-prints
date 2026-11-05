import { randomSource, drawing, line } from '../shared/port.js';

const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const mix = (a, b, t) => a + (b - a) * t;
const pick = (random, low, high) => mix(low, high, random());
const gray = value => `#${Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0').repeat(3)}`;

// A small, non-overturning Gerstner spectrum. All rows and all vessels sample
// the same surface; random numbers choose the sea, never individual vertices.
export function seaParameters(seed) {
  const random = randomSource(`${seed}:water`);
  const roughness = pick(random, 0.3, 1.12);
  const direction = pick(random, -0.6, 0.6);
  const steepness = pick(random, 0.32, 0.62);
  const waves = [1, 0.57, 0.29].map((ratio, index) => {
    const wavelength = pick(random, 310, 490) * ratio;
    const k = TAU / wavelength;
    const angle = direction + pick(random, -0.3, 0.3);
    const amplitude = roughness * (index === 0 ? 27 : index === 1 ? 12 : 4.5);
    return { k, amplitude, dx: Math.cos(angle), dz: Math.sin(angle),
      phase: random() * TAU, lateral: steepness / (wavesCount * k) };
  });
  return { width: 1414, height: 1000, horizon: pick(random, 255, 355),
    roughness, steepness, waves, texture: random() * TAU, wind: random() < 0.5 ? -1 : 1 };
}
const wavesCount = 3;

function surfaceAtParameter(sea, u, depth) {
  const scale = 0.19 + depth * 0.81;
  const distance = 460 * (1 / scale - 1);
  let displacement = 0, elevation = 0, dxdu = 1, dydu = 0;
  for (const wave of sea.waves) {
    const phase = wave.k * (wave.dx * u + wave.dz * distance) + wave.phase;
    displacement += wave.lateral * wave.dx * Math.cos(phase);
    elevation += wave.amplitude * Math.sin(phase);
    dxdu -= wave.lateral * wave.k * wave.dx ** 2 * Math.sin(phase);
    dydu -= wave.amplitude * wave.k * wave.dx * Math.cos(phase);
  }
  return { x: sea.width / 2 + (u + displacement) * scale,
    y: sea.horizon + (855 - sea.horizon) * depth ** 1.35 - elevation * scale,
    slope: dydu / dxdu, dxdu: dxdu * scale, scale };
}

export function seaSurface(sea, x, depth) {
  const scale = 0.19 + depth * 0.81;
  let u = (x - sea.width / 2) / scale;
  for (let i = 0; i < 6; i++) {
    const point = surfaceAtParameter(sea, u, depth);
    u -= (point.x - x) / point.dxdu;
  }
  return surfaceAtParameter(sea, u, depth);
}

function sampled(start, end, count, fn) {
  return Array.from({ length: count + 1 }, (_, i) => fn(mix(start, end, i / count), i / count));
}

function quadratic(a, b, c, count = 20) {
  return sampled(0, 1, count, t => [
    (1 - t) ** 2 * a[0] + 2 * t * (1 - t) * b[0] + t ** 2 * c[0],
    (1 - t) ** 2 * a[1] + 2 * t * (1 - t) * b[1] + t ** 2 * c[1],
  ]);
}

function makePen(paths) {
  return (points, width = 0.75, tone = 70, fill = 'none') => {
    paths.push({ d: line(points, fill !== 'none'), fill, stroke: gray(tone), width });
  };
}

function cubic(a, b, c, d, count = 24) {
  return sampled(0, 1, count, t => [
    (1 - t) ** 3 * a[0] + 3 * (1 - t) ** 2 * t * b[0] + 3 * (1 - t) * t ** 2 * c[0] + t ** 3 * d[0],
    (1 - t) ** 3 * a[1] + 3 * (1 - t) ** 2 * t * b[1] + 3 * (1 - t) * t ** 2 * c[1] + t ** 3 * d[1],
  ]);
}

// A filled, tapered stroke gives small variations of ink width without SVG
// filters or browser-specific stroke effects. All coordinates remain explicit.
function inkStroke(paths, points, width, tone, phase = 0) {
  const left = [], right = [];
  for (let i = 0; i < points.length; i++) {
    const before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)];
    const dx = after[0] - before[0], dy = after[1] - before[1];
    const length = Math.hypot(dx, dy) || 1;
    const t = i / (points.length - 1);
    const radius = width * (0.15 + 0.85 * Math.sin(Math.PI * t) ** 0.4)
      * (0.44 + 0.1 * Math.sin(t * 19 + phase));
    left.push([points[i][0] - dy / length * radius, points[i][1] + dx / length * radius]);
    right.push([points[i][0] + dy / length * radius, points[i][1] - dx / length * radius]);
  }
  paths.push({ d: line([...left, ...right.reverse()], true), fill: gray(tone), stroke: gray(tone), width: 0.08 });
}

function wavePatches(sea, random, paths) {
  const pen = makePen(paths), patches = [];
  const bands = 20 + Math.floor(random() * 5);
  const channel = { x: pick(random, 0.25, 0.75) * sea.width, bend: pick(random, -240, 240), width: pick(random, 90, 195) };
  for (let band = 0; band < bands; band++) {
    const count = 4 + Math.floor(random() * 4);
    for (let slot = 0; slot < count; slot++) {
      const depth = clamp((band + random()) / bands, 0.015, 0.99);
      const x = mix(105, sea.width - 105, (slot + pick(random, 0.12, 0.88)) / count);
      const openWater = channel.x + channel.bend * Math.sin(depth * 2.6);
      if (Math.abs(x - openWater) < channel.width * (0.4 + depth) && random() < 0.68) continue;
      const length = Math.min(pick(random, 66, 190) * (0.43 + depth * 0.92),
        2 * Math.min(x - 55, sea.width - 55 - x));
      const center = seaSurface(sea, x, depth);
      const amplitude = length * pick(random, 0.055, 0.145) * sea.roughness * (0.45 + depth * 0.75);
      patches.push({ x, y: center.y, depth, length, amplitude, tilt: clamp(center.slope * 0.17, -0.065, 0.065),
        crest: pick(random, -0.03, 0.2), shoulder: pick(random, -0.08, 0.32), fall: pick(random, 0.07, 0.23),
        layers: 1 + Math.floor(random() * (2 + depth * 3)),
        curl: depth > 0.48 && sea.roughness > 0.7 && random() < 0.25, phase: random() * TAU });
    }
  }
  // One or two long, low foreground swells break the short-wave rhythm.
  for (let i = 0; i < 2; i++) {
    const depth = pick(random, 0.76, 0.94), x = pick(random, 270, sea.width - 270);
    const center = seaSurface(sea, x, depth), length = pick(random, 240, 370);
    patches.push({ x, y: center.y, depth, length, amplitude: length * pick(random, 0.09, 0.16) * sea.roughness,
      tilt: clamp(center.slope * 0.15, -0.06, 0.06), crest: pick(random, 0.06, 0.2),
      shoulder: pick(random, 0, 0.28), fall: pick(random, 0.08, 0.2), layers: 4,
      curl: sea.roughness > 0.75, phase: random() * TAU });
  }
  patches.sort((a, b) => a.y - b.y);
  for (const patch of patches) {
    const { x, y, length: L, amplitude: A, depth, crest } = patch;
    const local = [
      ...cubic([-0.5, 0], [-0.19, patch.shoulder], [crest - 0.18, -0.94], [crest, -1]),
      ...cubic([crest, -1], [crest + patch.fall, -1.04], [0.38, -0.1], [0.5, -0.12]).slice(1),
    ];
    const project = ([u, v]) => {
      const px = x + u * L * sea.wind;
      const grain = (Math.sin(u * 31 + patch.phase) * 0.2 + Math.sin(u * 61 + patch.phase) * 0.08) * depth;
      return [px, y + v * A + (px - x) * patch.tilt + grain];
    };
    const points = local.map(project);
    const tone = mix(151, 52, depth), width = mix(0.46, 1.45, depth);
    // Only a small wave face is opaque; broad open-water gaps stay untouched.
    pen([...points, project([0.5, 0.32]), project([-0.5, 0.32])], 0.08, 255, '#ffffff');
    inkStroke(paths, points, width, tone, patch.phase);
    for (let j = 1; j <= patch.layers; j++) {
      const trim = Math.min(13, 3 + j * 2);
      const inset = local.slice(trim, -trim).map(([u, v], index, list) => {
        const t = index / (list.length - 1);
        const p = project([u, v]);
        const feather = Math.sin(t * Math.PI) ** 0.6;
        return [p[0], p[1] + j * (1.1 + depth * 1.3) * (0.6 + feather * 0.4)];
      });
      inkStroke(paths, inset, width * (0.5 - j * 0.045), tone + j * 14 + 7, patch.phase + j);
    }
    if (patch.curl) {
      // Broken streaks suggest foam without drawing ornamental loops at each
      // crest. The wet front of the wave stays distinct from its long shoulder.
      for (let j = 0; j < 3; j++) {
        const t = j / 3;
        const a = project([crest - 0.09 - t * 0.14, -0.92 + t * 0.12]);
        const b = [a[0] - sea.wind * (2 + depth * 2), a[1] + 4 + depth * 4];
        inkStroke(paths, [a, b], width * 0.4, tone + 40, patch.phase);
      }
    }
  }
  return patches;
}

function boatLayout(sea, random) {
  const count = 1 + Math.floor(random() * 3.7);
  const boats = [];
  const heroX = pick(random, 0.25, 0.75) * sea.width;
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < 50; attempt++) {
      const depth = i === 0 ? pick(random, 0.44, 0.67) : pick(random, 0.17, 0.55);
      const length = i === 0 ? pick(random, 145, 205) : pick(random, 65, 145) * (0.6 + depth);
      const x = i === 0 && attempt === 0 ? heroX : pick(random, 180, sea.width - 180);
      const center = seaSurface(sea, x, depth);
      const bow = seaSurface(sea, x + length * 0.38, depth);
      const stern = seaSurface(sea, x - length * 0.38, depth);
      const angle = clamp(Math.atan2(bow.y - stern.y, length * 0.76), -0.15, 0.15);
      const kind = ['sail', 'sampan', 'skiff'][Math.floor(random() * 3)];
      const height = length * (kind === 'sail' ? 0.92 : kind === 'sampan' ? 0.3 : 0.25);
      const bounds = { left: x - length * 0.8, right: x + length * 0.8,
        top: center.y - height - length * 0.14, bottom: center.y + length * 0.2 };
      if (bounds.top < 85 || bounds.left < 80 || bounds.right > sea.width - 80) continue;
      if (boats.some(other => bounds.left < other.bounds.right + 30 && bounds.right > other.bounds.left - 30
        && bounds.top < other.bounds.bottom + 35 && bounds.bottom > other.bounds.top - 35)) continue;
      boats.push({ x, y: center.y, depth, length, angle, kind, bounds,
        freeboard: pick(random, 0.055, 0.082), heading: random() < 0.5 ? -1 : 1, wind: sea.wind, sailLean: pick(random, -0.12, 0.1),
        mastHeight: pick(random, 0.63, 0.88), sailSpread: pick(random, 0.38, 0.55), canopy: pick(random, 0.3, 0.45),
        battens: 4 + Math.floor(random() * 4), hullTone: pick(random, 48, 78) });
      break;
    }
  }
  return boats.sort((a, b) => a.depth - b.depth);
}

function drawBoat(sea, boat, paths) {
  const pen = makePen(paths), L = boat.length;
  const co = Math.cos(boat.angle), si = Math.sin(boat.angle);
  const project = ([x, y]) => [boat.x + L * (boat.heading * x * co - y * si), boat.y + L * (boat.heading * x * si + y * co)];
  const mark = (points, width = 0.7, tone = boat.hullTone, fill = 'none') =>
    pen(points.map(project), width * (0.65 + L / 240), tone, fill);
  const stroke = (a, b, c, width = 0.7, tone = boat.hullTone) => mark(quadratic(a, b, c), width, tone);
  const rim = boat.freeboard;
  // Build the visible hull only down to its waterline. Its submerged keel is
  // implicit rather than drawing a complete boat and letting waves cross it.
  const deck = quadratic([-0.49, -rim * 1.4], [-0.08, -rim * 0.52], [0.51, -rim * 1.85]);
  const bottom = quadratic([0.41, 0.003], [0.02, 0.035], [-0.39, 0.008]);
  mark([...deck, ...bottom], 0.95, boat.hullTone, '#ffffff');
  stroke([-0.48, -rim * 1.15], [-0.08, -rim * 0.28], [0.49, -rim * 1.55], 0.65);
  stroke([-0.405, -rim * 0.55], [0, 0.01], [0.43, -rim * 0.7], 0.6, boat.hullTone + 15);
  for (let j = 0; j < 8; j++) {
    const x = mix(-0.36, 0.35, j / 7);
    mark([[x, -rim * 0.6], [x + 0.02, 0.012]], 0.33, boat.hullTone + 47);
  }
  if (boat.kind === 'sail') {
    const top = [-0.08 + boat.sailLean, -boat.mastHeight];
    const foot = [-0.09, -rim * 0.7];
    const wind = boat.wind * boat.heading;
    const spread = wind * boat.sailSpread;
    const clew = [top[0] + spread, -0.14];
    const head = [top[0] + spread * 0.36, top[1] + 0.1];
    const luff = quadratic(top, [mix(top[0], foot[0], 0.5) - wind * 0.035, mix(top[1], foot[1], 0.5)], foot);
    const leech = quadratic(head, [top[0] + spread * 1.07, -boat.mastHeight * 0.55], clew);
    mark([...luff, clew, ...leech.reverse(), top], 0.8, boat.hullTone, '#ffffff');
    for (let j = 1; j < boat.battens; j++) {
      const t = j / boat.battens;
      const left = luff[Math.round(t * 20)];
      const right = leech[Math.round((1 - t) * 20)];
      stroke(left, [mix(left[0], right[0], 0.5), mix(left[1], right[1], 0.5) + 0.014], right, 0.4, boat.hullTone + 25);
    }
    mark([[foot[0], -rim], [top[0] - 0.004, top[1] - 0.035]], 1.15, boat.hullTone - 10);
    mark([[top[0], top[1] - 0.018], [0.42, -rim * 1.35]], 0.38, boat.hullTone + 35);
    mark([[top[0], top[1] - 0.018], [-0.42, -rim * 1.1]], 0.38, boat.hullTone + 35);
    // A small pennant follows the same wind direction as the sail.
    mark([[top[0], top[1] - 0.025], [top[0] + wind * 0.12, top[1] - 0.01], [top[0], top[1] + 0.01]], 0.35, boat.hullTone, '#ffffff');
  } else if (boat.kind === 'sampan') {
    const a = -boat.canopy * 0.65, b = boat.canopy * 0.55;
    const roof = quadratic([a, -rim * 0.7], [-0.04, -0.44], [b, -rim * 0.8]);
    mark([...roof, [a, -rim * 0.7]], 0.85, boat.hullTone, '#ffffff');
    for (let j = 1; j < 7; j++) {
      const shift = j * 0.007;
      const inner = quadratic([a + shift, -rim * 0.72], [-0.04, -0.44 + shift * 2], [b - shift, -rim * 0.8]);
      mark(inner, 0.4, boat.hullTone + 30 + j * 3);
    }
    mark([[a, -rim * 0.7], [a + 0.025, -0.17]], 0.55);
    mark([[b, -rim * 0.8], [b - 0.015, -0.15]], 0.55);
  }
  // A tiny rower/sculler makes the boats human-scaled. Geometry remains local
  // to the hull, so mast, canopy, figure and oar all share its roll angle.
  const personX = boat.kind === 'sampan' ? 0.33 : -0.3;
  const figure = sampled(0, TAU, 12, t => [personX + Math.cos(t) * 0.017, -0.17 + Math.sin(t) * 0.02]);
  mark(figure, 0.4, boat.hullTone, gray(boat.hullTone));
  mark([[personX - 0.028, -0.178], [personX, -0.204], [personX + 0.031, -0.178]], 0.4, boat.hullTone, '#ffffff');
  stroke([personX, -0.15], [personX - 0.013, -0.11], [personX + 0.015, -rim], 1.1);
  mark([[personX - 0.012, -0.12], [personX + 0.07, -0.1], [personX + 0.14, 0.07]], 0.55);
  mark([[personX + 0.04, -0.12], [personX + 0.2, 0.11]], 0.7);
  // The foreground meniscus and short wake anchor the hull in this same sea.
  for (let j = 0; j < 3; j++) {
    const half = L * (0.51 + j * 0.11);
    const points = sampled(boat.x - half, boat.x + half, 50, (x, t) => {
      const p = seaSurface(sea, x, boat.depth);
      return [x, boat.y + (x - boat.x) * Math.tan(boat.angle) + L * (0.023 + j * 0.025)
        + (p.y - boat.y - (x - boat.x) * Math.tan(boat.angle)) * 0.15 * Math.sin(t * Math.PI)];
    });
    pen(points, j === 0 ? 0.75 : 0.4, boat.hullTone + 30 + j * 35);
  }
}

export function buildSeascape(seed) {
  const sea = seaParameters(seed);
  const random = randomSource(`${seed}:composition`);
  const paths = [];
  const crests = wavePatches(sea, random, paths);
  const boats = boatLayout(sea, random);
  for (const boat of boats) drawBoat(sea, boat, paths);
  return { sea, crests, boats, paths };
}

export function generateSeascape(seed) {
  const { sea, paths } = buildSeascape(seed);
  return { ...drawing(paths, { width: sea.width, height: sea.height, whiteToAlpha: true, rounded: true }),
    mode: 'seascapes', seed, artRevision: 1 };
}
