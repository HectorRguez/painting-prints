import { randomSource, drawing, line } from '../shared/port.js';

const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const mix = (a, b, t) => a + (b - a) * t;
const pick = (random, low, high) => mix(low, high, random());
const gray = value => `#${Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0').repeat(3)}`;

// The same bounded Gerstner field positions every crest and vessel. The
// illustrative breakers below can curl; the boat-supporting field cannot fold.
export function seaParameters(seed) {
  const random = randomSource(`${seed}:water`);
  const state = random();
  const regime = state < 0.24 ? 'calm' : state < 0.48 ? 'wind sea' : state < 0.78 ? 'rolling swell' : 'breakers';
  const ranges = {
    calm: [0.18, 0.42, 330, 510], 'wind sea': [0.6, 1.05, 240, 410],
    'rolling swell': [1.05, 1.55, 540, 820], breakers: [1.35, 1.9, 610, 900],
  }[regime];
  const roughness = pick(random, ranges[0], ranges[1]);
  const direction = pick(random, -0.6, 0.6);
  const steepness = pick(random, 0.32, 0.62);
  const waves = [1, 0.57, 0.29].map((ratio, index) => {
    const wavelength = pick(random, ranges[2], ranges[3]) * ratio;
    const k = TAU / wavelength;
    const angle = direction + pick(random, -0.3, 0.3);
    const amplitude = roughness * (index === 0 ? 27 : index === 1 ? 12 : 4.5);
    return { k, amplitude, dx: Math.cos(angle), dz: Math.sin(angle),
      phase: random() * TAU, lateral: steepness / (3 * k) };
  });
  return { width: 1414, height: 1000, horizon: pick(random, 260, 345),
    regime, roughness, steepness, waves, texture: random() * TAU, wind: random() < 0.5 ? -1 : 1 };
}

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

// Different profiles change the wave silhouette as well as its size. Only the
// breaker has an overhanging lip; broad swells and low ripples keep open faces.
function waveProfile(patch) {
  const { crest: c, shoulder, fall, shape } = patch;
  if (shape === 'ripple') return [
    ...cubic([-0.5, 0], [-0.3, 0.32], [-0.16, -0.76], [0.04, -0.72]),
    ...cubic([0.04, -0.72], [0.24, -0.68], [0.3, 0.3], [0.5, 0.04]).slice(1),
  ];
  if (shape === 'breaker') {
    const head = patch.crest, reach = patch.reach, opening = patch.opening;
    return [
      ...cubic([-0.5, 0.04], [-0.25, patch.shoulder], [head - 0.22, -1.13], [head, -1]),
      ...cubic([head, -1], [head + reach * 0.65, -1.02], [head + reach * 1.12, -opening - 0.1], [head + reach, -opening], 16).slice(1),
      ...cubic([head + reach, -opening], [head + reach * 0.76, -opening + 0.07],
        [head + reach * 0.65, -opening - 0.18], [head + reach * 0.28, -opening - 0.08], 12).slice(1),
      ...cubic([head + reach * 0.28, -opening - 0.08], [head - reach * 0.25, -opening + 0.06],
        [0.2, 0.08], [0.5, 0.1]).slice(1),
    ];
  }
  if (shape === 'spilling') return [
    ...cubic([-0.5, 0.03], [-0.23, patch.shoulder], [c - 0.12, -1.06], [c, -1]),
    ...cubic([c, -1], [c + 0.045, -1.02], [c + 0.05, -0.68], [c + 0.14, -0.66], 16).slice(1),
    ...cubic([c + 0.14, -0.66], [0.35, -0.35], [0.33, -0.03], [0.5, 0.08]).slice(1),
  ];
  if (shape === 'chop') return [
    ...cubic([-0.5, 0.07], [-0.25, 0.13], [c - 0.14, -0.56], [c, -1]),
    ...cubic([c, -1], [c + 0.02, -0.68], [0.26, 0.03], [0.5, 0.12]).slice(1),
  ];
  return [
    ...cubic([-0.5, 0], [-0.23, shoulder], [c - (shape === 'swell' ? 0.29 : 0.18), -0.94], [c, -1]),
    ...cubic([c, -1], [c + fall, -1.03], [0.36, -0.04], [0.5, 0.02]).slice(1),
  ];
}

function patchPoint(sea, patch, [u, v]) {
  const px = patch.x + u * patch.length * sea.wind;
  const grain = (Math.sin(u * 31 + patch.phase) * 0.2 + Math.sin(u * 61 + patch.phase) * 0.08) * patch.depth;
  return [px, patch.y + v * patch.amplitude + (px - patch.x) * patch.tilt + grain];
}

function wavePatches(sea, random) {
  const patches = [];
  const channel = { x: pick(random, 0.22, 0.78) * sea.width, bend: pick(random, -260, 260), width: pick(random, 90, 190) };
  const add = (x, depth, length, amplitude, shape, major = false) => {
    const center = seaSurface(sea, x, depth);
    const tilt = clamp(center.slope * 0.13, -0.065, 0.065);
    amplitude = Math.min(amplitude, (925 - center.y - Math.abs(tilt * length / 2)) / 0.32);
    const patch = { x, y: center.y, depth, length, amplitude, shape, major, tilt,
      crest: pick(random, -0.05, 0.2), shoulder: pick(random, -0.12, 0.28), fall: pick(random, 0.07, 0.24),
      reach: pick(random, 0.13, 0.27), opening: pick(random, 0.37, 0.76),
      layers: major ? 5 + Math.floor(random() * 4) : 1 + Math.floor(random() * (2 + depth * 3)), phase: random() * TAU };
    if (shape === 'breaker') patch.crest = pick(random, -0.09, 0.075);
    patch.profile = waveProfile(patch);
    if (shape === 'breaker' || shape === 'spilling') {
      patch.profile = patch.profile.map(([u, v], i) => {
        const foam = Math.sin(clamp((i - 20) / 25, 0, 1) * Math.PI);
        return [u, v + foam * (Math.sin(i * 2.3 + patch.phase) + Math.sin(i * 4.1)) * 0.011];
      });
    }
    const points = [...patch.profile, [0.5, 0.32], [-0.5, 0.32]].map(point => patchPoint(sea, patch, point));
    patch.bounds = { left: Math.min(...points.map(p => p[0])) - 2, right: Math.max(...points.map(p => p[0])) + 2,
      top: Math.min(...points.map(p => p[1])) - 2, bottom: Math.max(...points.map(p => p[1])) + 2 };
    patches.push(patch);
  };
  const candidates = sea.regime === 'calm' ? 125 : 160;
  for (let i = 0; i < candidates; i++) {
    const depth = pick(random, 0.012, 0.98) ** 1.24;
    const x = pick(random, 105, sea.width - 105);
    const openWater = channel.x + channel.bend * Math.sin(depth * 2.6);
    if (Math.abs(x - openWater) < channel.width * (0.4 + depth) && random() < 0.7) continue;
    const length = Math.min(pick(random, 55, 190) * (0.38 + depth * 0.94), 2 * Math.min(x - 60, sea.width - 60 - x));
    if (patches.some(p => Math.abs(p.depth - depth) < 0.023 && Math.abs(p.x - x) < (p.length + length) * 0.3)) continue;
    const choice = random();
    const shape = sea.regime === 'calm' ? (choice < 0.8 ? 'ripple' : 'swell')
      : sea.regime === 'wind sea' ? (choice < 0.62 ? 'chop' : choice < 0.83 ? 'ripple' : 'shoulder')
      : choice < 0.2 ? 'ripple' : choice < 0.38 ? 'chop' : 'swell';
    const amplitude = length * pick(random, 0.045, 0.125) * sea.roughness * (0.42 + depth * 0.72);
    add(x, depth, length, amplitude, shape);
  }
  const dramatic = sea.regime === 'breakers';
  const count = sea.regime === 'calm' ? 1 : dramatic ? 1 + Math.floor(random() * 2.8) : 2 + Math.floor(random() * 2);
  let primary;
  for (let i = 0; i < count; i++) {
    const length = dramatic ? (i === 0 ? pick(random, 505, 690) : pick(random, 290, 480)) : pick(random, 310, 570);
    const depth = dramatic ? (i === 0 ? pick(random, 0.81, 0.94) : pick(random, 0.66, 0.88)) : pick(random, 0.77, 0.96);
    let x = pick(random, length / 2 + 75, sea.width - length / 2 - 75);
    if (primary) {
      // Major crests occupy different parts of the sea. A second curl should
      // not repeat the first directly underneath it like a stack of symbols.
      const sign = primary.x < sea.width / 2 ? 1 : -1;
      x = clamp(primary.x + sign * (primary.length + length) * pick(random, 0.35, 0.47),
        length / 2 + 75, sea.width - length / 2 - 75);
      if (i === 2) x = clamp(sea.width - x + pick(random, -100, 100), length / 2 + 75, sea.width - length / 2 - 75);
    }
    const amplitude = dramatic ? (i === 0 ? pick(random, 165, 250) : pick(random, 65, 140)) : sea.regime === 'rolling swell'
      ? pick(random, 65, 145) : sea.regime === 'wind sea' ? pick(random, 25, 55) : pick(random, 10, 22);
    const shape = dramatic ? (i === 0 ? (random() < 0.75 ? 'breaker' : 'spilling') : (random() < 0.7 ? 'swell' : 'spilling'))
      : sea.regime === 'wind sea' ? 'chop' : 'swell';
    add(x, depth, length, amplitude, shape, true);
    if (!primary) primary = patches.at(-1);
  }
  return patches.sort((a, b) => a.depth - b.depth);
}

function drawWave(sea, patch, paths) {
  const pen = makePen(paths), { length: L, amplitude: A, depth, shape, profile: local } = patch;
  const project = point => patchPoint(sea, patch, point);
  const points = local.map(project);
  const tone = mix(151, 48, depth), width = mix(0.46, patch.major ? 1.9 : 1.4, depth);
  pen([...points, project([0.5, 0.32]), project([-0.5, 0.32])], 0.08, 255, '#ffffff');
  inkStroke(paths, points, width, tone, patch.phase);
  if (shape === 'breaker' || shape === 'spilling') {
    // Long, unequal contour strokes sweep down the shoulder and stop before
    // the foam. The lip itself is broken by short, uneven foamy marks.
    for (let j = 0; j < patch.layers; j++) {
      const t = j / patch.layers, end = -0.83 + t * 0.42;
      const face = cubic([-0.43 + t * 0.18, 0.09 + t * 0.08], [-0.2 + t * 0.17, 0.08],
        [patch.crest - 0.12 + t * 0.09, end - 0.02], [patch.crest - 0.05 + t * 0.05, end]);
      inkStroke(paths, face.map(project), width * (0.48 - t * 0.2), tone + 25 + j * 10, patch.phase + j);
    }
    for (let j = 0; j < 14; j++) {
      const index = 22 + Math.round(j * 1.4), point = local[index];
      const flutter = Math.sin(j * 1.7 + patch.phase);
      const a = project([point[0] - 0.004, point[1] + 0.015]);
      const b = project([point[0] - 0.009 - flutter * 0.008, point[1] + 0.033 + (flutter + 1) * 0.014]);
      inkStroke(paths, quadratic(a, [(a[0] + b[0]) / 2 - sea.wind * 2, a[1] + 2], b, 5),
        width * (0.28 + (flutter + 1) * 0.07), tone + 20 + (j % 3) * 12, patch.phase);
    }
  } else {
    for (let j = 1; j <= patch.layers; j++) {
      const trim = Math.min(15, 3 + j * 2);
      const inset = local.slice(trim, -trim).map(([u, v], index, list) => {
        const t = index / (list.length - 1), p = project([u, v]);
        return [p[0], p[1] + j * (1.1 + depth * (patch.major ? 3.2 : 1.3)) * (0.6 + Math.sin(t * Math.PI) ** 0.6 * 0.4)];
      });
      inkStroke(paths, inset, width * Math.max(0.14, 0.5 - j * 0.045), tone + j * 12 + 7, patch.phase + j);
    }
  }
  // A few broken, low marks let large faces meet the surrounding water.
  if (patch.major && A > 60) {
    for (let j = 0; j < 4; j++) {
      const side = j < 2 ? -1 : 1, shift = (j % 2) * 0.035;
      const a = project([side * (0.32 + shift), 0.16 + shift]);
      const b = project([side * (0.47 + shift), 0.13 + shift]);
      inkStroke(paths, quadratic(a, [(a[0] + b[0]) / 2, a[1] + A * 0.025], b), width * 0.42, tone + 32, patch.phase);
    }
  }
}

function boatLayout(sea, random, crests) {
  const requestedCount = 2 + Math.floor(random() * 6.8);
  const arrangement = ['scattered', 'crossing', 'flotilla', 'procession'][Math.floor(random() * 4)];
  const boats = [], fleetX = pick(random, 0.3, 0.7) * sea.width;
  const fleetDirection = random() < 0.5 ? -1 : 1;
  for (let i = 0; i < requestedCount; i++) {
    for (let attempt = 0; attempt < 150; attempt++) {
      const hero = i === 0 || (i === 1 && requestedCount > 5 && attempt < 20);
      const depth = hero ? pick(random, 0.39, 0.65) : pick(random, 0.11, 0.57);
      const length = hero ? pick(random, 132, 194) : pick(random, 61, 137) * (0.57 + depth);
      let x = pick(random, 125, sea.width - 125);
      if (attempt < 25 && arrangement === 'flotilla') x = fleetX + pick(random, -370, 370);
      if (attempt < 30 && arrangement === 'procession') x = mix(190, sea.width - 190, (i + random()) / requestedCount);
      if (attempt < 30 && arrangement === 'crossing') x = 250 + depth * 1200 + pick(random, -230, 230);
      const center = seaSurface(sea, x, depth);
      const bow = seaSurface(sea, x + length * 0.38, depth);
      const stern = seaSurface(sea, x - length * 0.38, depth);
      const angle = clamp(Math.atan2(bow.y - stern.y, length * 0.76), -0.18, 0.18);
      const kind = ['sail', 'sampan', 'skiff', 'cutter', 'lugger', 'fishing'][Math.floor(random() * 6)];
      const height = length * (['sail', 'cutter', 'lugger'].includes(kind) ? 0.94 : kind === 'fishing' ? 0.45 : 0.33);
      const bounds = { left: x - length * 0.82, right: x + length * 0.82,
        top: center.y - height - length * 0.16, bottom: center.y + length * 0.21 };
      if (bounds.top < 90 || bounds.left < 75 || bounds.right > sea.width - 75) continue;
      if (boats.some(other => bounds.left < other.bounds.right + 24 && bounds.right > other.bounds.left - 24
        && bounds.top < other.bounds.bottom + 22 && bounds.bottom > other.bounds.top - 22)) continue;
      // Nearer crests may cover a meniscus, but must never slice a sail/cabin
      // or make a far vessel appear on top of a tall foreground wave.
      if (crests.some(patch => patch.depth > depth && patch.bounds.left < bounds.right + 4
        && patch.bounds.right > bounds.left - 4 && patch.bounds.top < center.y + length * 0.012
        && patch.bounds.bottom > bounds.top)) continue;
      boats.push({ x, y: center.y, depth, length, angle, kind, bounds,
        freeboard: pick(random, kind === 'fishing' ? 0.07 : 0.045, kind === 'fishing' ? 0.105 : 0.082),
        bowRise: pick(random, 1.3, 2.3), sternRise: pick(random, 1.05, 1.65), beam: pick(random, 0.83, 1.04),
        heading: arrangement === 'procession' ? fleetDirection : random() < 0.5 ? -1 : 1,
        wind: sea.wind, sailLean: pick(random, -0.11, 0.09), mastHeight: pick(random, 0.64, 0.88),
        sailSpread: pick(random, 0.36, 0.51), canopy: pick(random, 0.3, 0.49), canopyHeight: pick(random, 0.34, 0.49),
        battens: 4 + Math.floor(random() * 4), hullTone: pick(random, 42, 75) });
      break;
    }
  }
  return { boats: boats.sort((a, b) => a.depth - b.depth), arrangement, requestedCount };
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
  const deck = quadratic([-0.49, -rim * boat.sternRise], [-0.08, -rim * 0.45], [0.51, -rim * boat.bowRise]);
  const bottom = quadratic([0.41 * boat.beam, 0.003], [0.02, 0.035], [-0.39 * boat.beam, 0.008]);
  mark([...deck, ...bottom], 0.95, boat.hullTone, '#ffffff');
  stroke([-0.48, -rim * (boat.sternRise - 0.25)], [-0.08, -rim * 0.2], [0.49, -rim * (boat.bowRise - 0.3)], 0.65);
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
  } else if (boat.kind === 'cutter' || boat.kind === 'lugger') {
    const top = [-0.08 + boat.sailLean * 0.5, -boat.mastHeight];
    const foot = [-0.08, -rim];
    if (boat.kind === 'cutter') {
      const clew = [-0.48, -rim - 0.055];
      mark([...quadratic(top, [-0.3, -boat.mastHeight * 0.57], clew), foot], 0.8, boat.hullTone, '#ffffff');
      const jibTop = [top[0] + 0.015, top[1] + 0.11], jibFoot = [0.46, -rim * 1.7];
      mark([...quadratic(jibTop, [0.27, -boat.mastHeight * 0.36], jibFoot), [0.02, -rim - 0.065]], 0.75, boat.hullTone, '#ffffff');
      for (let j = 1; j < 4; j++) {
        const t = j / 4;
        mark([[mix(top[0], clew[0], t), mix(top[1], clew[1], t)],
          [mix(top[0], foot[0], t), mix(top[1], foot[1], t)]], 0.33, boat.hullTone + 38);
      }
      mark([clew, foot], 1.0);
      mark([top, [0.5, -rim * boat.bowRise]], 0.3, boat.hullTone + 30);
    } else {
      const peak = [top[0] + 0.18, top[1] + 0.045], throat = [top[0] - 0.19, top[1] + 0.16];
      const clew = [-boat.sailSpread, -rim - 0.07], tack = [0.2, -rim - 0.12];
      mark([throat, peak, ...quadratic(peak, [0.35, -boat.mastHeight * 0.4], tack).slice(1), clew], 0.8, boat.hullTone, '#ffffff');
      mark([[throat[0] - 0.04, throat[1] + 0.008], [peak[0] + 0.025, peak[1] - 0.008]], 1.0);
      for (let j = 1; j < 4; j++) {
        const t = j / 4;
        stroke([mix(throat[0], clew[0], t), mix(throat[1], clew[1], t)],
          [0.005, mix(top[1], tack[1], t) + 0.055], [mix(peak[0], tack[0], t), mix(peak[1], tack[1], t)], 0.32, boat.hullTone + 35);
      }
      mark([top, [-0.43, -rim]], 0.3, boat.hullTone + 28);
    }
    mark([foot, [top[0], top[1] - 0.035]], 1.05, boat.hullTone - 9);
    const pennant = boat.wind * boat.heading;
    mark([[top[0], top[1] - 0.025], [top[0] + pennant * 0.12, top[1] - 0.005], [top[0], top[1] + 0.01]], 0.35, boat.hullTone, '#ffffff');
  } else if (boat.kind === 'fishing') {
    const left = -boat.canopy * 0.65, right = boat.canopy * 0.42;
    const roofY = -0.2 - boat.canopyHeight * 0.14;
    mark([[left, -rim], [left, roofY], [right, roofY - 0.018], [right + 0.025, -rim]], 0.85, boat.hullTone, '#ffffff');
    mark([[left - 0.035, roofY], [right + 0.055, roofY - 0.018]], 1.0);
    for (let j = 0; j < 2; j++) {
      const x = mix(left + 0.04, right - 0.07, j);
      mark([[x, roofY + 0.035], [x + 0.055, roofY + 0.031], [x + 0.055, roofY + 0.09], [x, roofY + 0.092]], 0.4, boat.hullTone + 20, '#ffffff');
    }
    mark([[-0.27, -rim], [-0.27, -0.4], [0.34, -0.26]], 0.65);
    mark([[-0.27, -0.4], [0.34, -rim * 1.2]], 0.32, boat.hullTone + 35);
  } else if (boat.kind === 'sampan') {
    const a = -boat.canopy * 0.65, b = boat.canopy * 0.55;
    const roof = quadratic([a, -rim * 0.7], [-0.04, -boat.canopyHeight], [b, -rim * 0.8]);
    mark([...roof, [a, -rim * 0.7]], 0.85, boat.hullTone, '#ffffff');
    for (let j = 1; j < 7; j++) {
      const shift = j * 0.007;
      const inner = quadratic([a + shift, -rim * 0.72], [-0.04, -boat.canopyHeight + shift * 2], [b - shift, -rim * 0.8]);
      mark(inner, 0.4, boat.hullTone + 30 + j * 3);
    }
    mark([[a, -rim * 0.7], [a + 0.025, -0.17]], 0.55);
    mark([[b, -rim * 0.8], [b - 0.015, -0.15]], 0.55);
  }
  // A tiny rower/sculler makes the boats human-scaled. Geometry remains local
  // to the hull, so mast, canopy, figure and oar all share its roll angle.
  const personX = ['sampan', 'fishing'].includes(boat.kind) ? 0.33 : -0.3;
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
  const paths = [];
  const crests = wavePatches(sea, randomSource(`${seed}:crests`));
  const { boats, arrangement, requestedCount } = boatLayout(sea, randomSource(`${seed}:fleet`), crests);
  const layers = [...crests.map(patch => ({ depth: patch.depth, patch })), ...boats.map(boat => ({ depth: boat.depth, boat }))];
  layers.sort((a, b) => a.depth - b.depth);
  for (const layer of layers) {
    if (layer.patch) drawWave(sea, layer.patch, paths);
    else {
      const start = paths.length;
      drawBoat(sea, layer.boat, paths);
      layer.boat.pathRange = [start, paths.length];
    }
  }
  return { sea, crests, boats, arrangement, requestedCount, paths };
}

export function generateSeascape(seed) {
  const { sea, paths } = buildSeascape(seed);
  return { ...drawing(paths, { width: sea.width, height: sea.height, whiteToAlpha: true, rounded: true }),
    mode: 'seascapes', seed, artRevision: 2 };
}
