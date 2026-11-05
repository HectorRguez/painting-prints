import { randomSource } from '../shared/port.js';

const mix = (a, b, t) => a + (b - a) * t;
const add = (a, b, scale = 1) => [a[0] + b[0] * scale, a[1] + b[1] * scale];
const unit = ([x, y]) => { const d = Math.hypot(x, y) || 1; return [x / d, y / d]; };
const sample = (fn, n) => Array.from({ length: n + 1 }, (_, i) => fn(i / n));
const cubicPoint = (a, b, c, d, t) => {
  const s = 1 - t;
  return [s ** 3 * a[0] + 3 * s * s * t * b[0] + 3 * s * t * t * c[0] + t ** 3 * d[0],
    s ** 3 * a[1] + 3 * s * s * t * b[1] + 3 * s * t * t * c[1] + t ** 3 * d[1]];
};
const bezier = (a, b, c, d, n = 44) => sample(t => cubicPoint(a, b, c, d, t), n);

function inside([x, y], polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}

const limits = {
  curl: [.18, 1], crestPosition: [-.18, -.035], shoulderWidth: [.24, .4], shoulderLift: [.05, .4],
  overhang: [.18, .34], lipDrop: [.24, .55], hollow: [.2, .38],
  lipRatio: [.018, .05], flowBundles: [5, 11], flowSpread: [.7, 1.2],
  foamClusters: [4, 11], foamScale: [.65, 1.3], sprayCount: [0, 60],
};

export function validateBreakerOverrides(overrides = {}) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new RangeError('Breaker overrides must be an object');
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in limits) || !Number.isFinite(value) || value < limits[key][0] || value > limits[key][1]
      || ['flowBundles', 'foamClusters', 'sprayCount'].includes(key) && !Number.isInteger(value)) {
      throw new RangeError('Unsupported breaker parameter: ' + key);
    }
  }
  return overrides;
}

// The water sheet has an asymmetric rising shoulder, a projecting lip and a
// concave returning face. These continuously controlled curves are not an
// elliptical curl or a stored outline. The open wedge belongs to the sky.
export function breakingWave(patch, overrides = {}) {
  const L = patch.length, A = patch.amplitude;
  if (!(L > 0 && A > 0) || !Number.isFinite(L + A + patch.phase)) throw new RangeError('Invalid wave dimensions');
  const random = randomSource('crest:' + patch.phase);
  const between = (a, b) => mix(a, b, random());
  const defaults = {
    curl: patch.shape === 'breaker' ? between(.72, 1) : between(.18, .46),
    crestPosition: between(-.155, -.075), shoulderWidth: between(.28, .37), shoulderLift: between(.18, .3),
    overhang: between(.23, .32), lipDrop: between(.34, .51), hollow: between(.25, .35),
    lipRatio: between(.022, .039), flowBundles: 6 + Math.floor(random() * 4),
    flowSpread: between(.8, 1.12), foamClusters: 5 + Math.floor(random() * 5),
    foamScale: between(.8, 1.15), sprayCount: 18 + Math.floor(random() * 22),
  };
  validateBreakerOverrides(overrides);
  const parameters = { ...defaults, ...overrides };
  const { curl, crestPosition, shoulderWidth, shoulderLift, overhang, lipDrop, hollow, lipRatio,
    flowBundles, flowSpread, foamClusters, foamScale, sprayCount } = parameters;
  const crestX = L * crestPosition, lipThickness = A * lipRatio;
  const back = [-L / 2, -A * shoulderLift], peak = [crestX, -A], foot = [L / 2, A * .04];
  const shoulderControls = [back, [back[0] + L * shoulderWidth * .55, -A * (shoulderLift + .04)],
    [crestX - L * shoulderWidth * .65, -A * (1.01 + .03 * curl)], peak];
  const tip = [crestX + L * overhang * (.6 + .4 * curl), -A * (1 - lipDrop * curl)];
  const rimControls = [peak, [crestX + L * overhang * .55, -A * (1.04 - .03 * curl)],
    [tip[0] - L * .035, -A * (1 - lipDrop * curl * .62)], tip];
  const innerTip = [tip[0] - lipThickness * .15, tip[1] + lipThickness * .55];
  const throat = [crestX + L * (.035 + .04 * (1 - curl)), -A * (.24 + .16 * curl)];
  const faceControls = [innerTip,
    [mix(tip[0] - L * .08, crestX - L * .025, hollow / .38 * curl), tip[1] - A * .035],
    [throat[0] - L * .03, throat[1] - A * .15], throat];
  const footControls = [throat, [throat[0] + L * .055, -A * .08], [L * .28, A * .03], foot];
  const shoulder = bezier(...shoulderControls), rim = bezier(...rimControls, 58);
  const face = [...bezier(...faceControls, 44), ...bezier(...footControls, 44).slice(1)];
  const outline = [...shoulder, ...rim.slice(1), innerTip, ...face.slice(1)];
  const polygon = [...outline, [L / 2, A * .22], [-L / 2, A * .22]];
  const strokes = [], masses = [];
  const spacing = Array.from({ length: flowBundles }, () => between(.5, 1.8));
  const total = spacing.reduce((sum, value) => sum + value, 0);
  let position = 0;
  const flowPoint = (t, v) => {
    const root = [mix(-.49, .49, t) * L, A * (.05 + .12 * t * t + .025 * Math.sin(t * 5 + patch.phase))];
    const endpoint = cubicPoint(...rimControls, mix(.015, .97, t));
    const controlA = [mix(-.41 * L, footControls[2][0], t), A * mix(-shoulderLift * .75, .025, t)];
    const controlB = [mix(crestX - .18 * L * flowSpread, faceControls[1][0], t), mix(-.79 * A, tip[1] - .065 * A, t)];
    return cubicPoint(root, controlA, controlB, add(endpoint, [0, A * .035]), v);
  };
  const longestRun = (points, accepts) => {
    let run = [], best = [];
    for (const point of points) {
      if (accepts(point)) run.push(point);
      else { if (run.length > best.length) best = run; run = []; }
    }
    if (run.length > best.length) best = run;
    return best;
  };
  const trace = (t, width, tone, trim) => {
    const points = sample(v => flowPoint(t, v), 100).slice(trim);
    const segment = longestRun(points, point => inside(point, polygon));
    const length = segment.slice(1).reduce((sum, point, i) => sum + Math.hypot(point[0] - segment[i][0], point[1] - segment[i][1]), 0);
    if (segment.length > 12 && length > L * .14) strokes.push({ points: segment, width, tone });
  };
  for (let i = 0; i < flowBundles; i++) {
    position += spacing[i];
    const t = (position - spacing[i] * .5) / total;
    if (i % 3 !== 0) {
      const spread = between(.035, .075), start = between(.1, .4);
      const pairs = sample(q => {
        const v = mix(start, .995, q), radius = spread * Math.sin(q * Math.PI / 2) ** .7;
        return [flowPoint(Math.max(.005, t - radius), v), flowPoint(Math.min(.995, t + radius), v)];
      }, 100);
      const run = longestRun(pairs, pair => pair.every(point => inside(point, polygon)));
      if (run.length > 20) {
        const tapered = run.map((pair, index) => {
          const fade = Math.min(1, run[0] === pairs[0] ? 1 : index / 8,
            run.at(-1) === pairs.at(-1) ? 1 : (run.length - 1 - index) / 8);
          const middle = [(pair[0][0] + pair[1][0]) / 2, (pair[0][1] + pair[1][1]) / 2];
          return pair.map(point => [mix(middle[0], point[0], fade), mix(middle[1], point[1], fade)]);
        });
        masses.push({ points: [...tapered.map(pair => pair[0]), ...tapered.map(pair => pair[1]).reverse()], tone: between(55, 105) });
      }
    }
    trace(t, between(1.1, 3.1), between(60, 100), Math.floor(between(0, 25)));
    const companions = 3 + Math.floor(random() * 5);
    for (let j = 0; j < companions; j++) {
      trace(Math.min(.985, t + (j + 1) * between(.004, .01)), between(.35, .8), between(80, 145), Math.floor(between(3, 25)));
    }
  }

  // Fine, uneven curved hatching carries the volume between broad ink veins.
  // Different starting positions leave quiet channels instead of a stripe grid.
  const hatchCount = 58 + Math.floor(random() * 24);
  for (let i = 0; i < hatchCount; i++) {
    const t = (i + between(.15, .85)) / hatchCount;
    if (Math.sin(t * 19 + patch.phase) > .8 && random() < .65) continue;
    trace(t, between(.28, .6), between(105, 160), Math.floor(between(0, 42)));
  }

  const foam = [], spray = [];
  const frame = t => {
    const p = cubicPoint(...rimControls, t);
    const before = cubicPoint(...rimControls, Math.max(0, t - .002));
    const after = cubicPoint(...rimControls, Math.min(1, t + .002));
    const tangent = unit([after[0] - before[0], after[1] - before[1]]);
    return { p, tangent, n: [tangent[1], -tangent[0]] };
  };
  const bankPhase = between(0, Math.PI * 2);
  const bank = sample(t => {
    const f = frame(t);
    return add(f.p, f.n, (1.2 + 1.8 * Math.sin(t * 27 + bankPhase)) * Math.sin(Math.PI * t) ** .45);
  }, 95);
  const underside = sample(t => {
    const q = 1 - t, f = frame(q);
    return add(f.p, f.n, -A * foamScale * (.06 + .025 * Math.sin(q * 17 + bankPhase)) * Math.sin(Math.PI * t) ** .45);
  }, 95);
  foam.push({ points: [...bank, ...underside], width: .3, fill: '#ffffff', tone: 120 });
  const ribbon = (points, width) => {
    const left = [], right = [];
    points.forEach((p, i) => {
      const before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)];
      const n = unit([before[1] - after[1], after[0] - before[0]]);
      const t = i / (points.length - 1), radius = width * (1 - t) ** .8 + .15;
      left.push(add(p, n, radius)); right.push(add(p, n, -radius));
    });
    return [...left, ...right.reverse()];
  };
  const gaps = Array.from({ length: foamClusters }, () => between(.4, 1.7));
  const sumGaps = gaps.reduce((sum, value) => sum + value, 0);
  let offset = 0;
  for (let i = 0; i < foamClusters; i++) {
    offset += gaps[i];
    const t = .04 + .9 * (offset - gaps[i] * .45) / sumGaps;
    const f = frame(t), root = add(f.p, f.n, -A * .012);
    const reach = between(28, 55) * (.6 + A / 650) * foamScale * (.7 + .5 * t);
    if (i % 2 === 0) {
      const start = add(f.p, f.n, -A * .025), end = add(f.p, f.n, -reach * between(.8, 1.3));
      const tongue = bezier(start, add(add(start, f.n, -reach * .4), f.tangent, reach * .15),
        add(end, f.tangent, reach * .2), end, 24);
      foam.push({ points: ribbon(tongue, between(3, 6) * foamScale), fill: '#ffffff', tone: 95, width: .5 });
    }
    const branches = 2 + Math.floor(random() * 2);
    for (let j = 0; j < branches; j++) {
      const size = reach * between(.55, 1.25), spread = between(-.35, .4);
      const origin = add(root, f.tangent, between(-9, 8));
      const end = add(origin, [size * (.85 + spread), size * mix(.25, .9, t) + between(-3, 7)]);
      const points = bezier(origin, add(origin, [size * (.28 + spread * .5), -size * between(.15, .35)]),
        add(end, [size * between(.1, .3), -size * between(.35, .55)]), end, 22);
      foam.push({ points: ribbon(points, between(1.6, 3.3) * foamScale), fill: '#ffffff', tone: 100, width: .65 });
      if (j === 0 && random() < .75) {
        const base = points[10], tip = add(base, [size * .55, size * between(-.1, .3)]);
        const fork = bezier(base, add(base, [size * .08, -size * .35]), add(tip, [size * .02, -size * .4]), tip, 16);
        foam.push({ points: ribbon(fork, between(1.1, 2.1) * foamScale), fill: '#ffffff', tone: 100, width: .6 });
      }
    }
  }
  for (let i = 0; i < sprayCount; i++) {
    const f = frame(between(.1, 1)), center = add(f.p, f.n, between(10, 52) * foamScale);
    center[0] += between(2, 42); center[1] += between(-10, 26);
    const radius = between(.45, 1.2), stretch = between(1.2, 2.4);
    spray.push({ points: sample(t => [center[0] + radius * Math.cos(t * Math.PI * 2),
      center[1] + radius * stretch * Math.sin(t * Math.PI * 2)], 9), width: .3, fill: '#ffffff', tone: between(95, 165) });
  }
  // Ink only exposed foam boundaries; overlapping white forks join without
  // internal seams. Rounded cloud lobes are deliberately absent.
  const contours = [];
  const bounds = foam.map(({ points }) => ({ left: Math.min(...points.map(p => p[0])), right: Math.max(...points.map(p => p[0])),
    top: Math.min(...points.map(p => p[1])), bottom: Math.max(...points.map(p => p[1])) }));
  foam.forEach((shape, index) => {
    let run = [];
    const flush = () => { if (run.length > 1) contours.push({ points: run, width: .6, fill: 'none', tone: 80 }); run = []; };
    const points = [...shape.points, shape.points[0]];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1], middle = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const hidden = foam.some((other, j) => j !== index && middle[0] > bounds[j].left && middle[0] < bounds[j].right
        && middle[1] > bounds[j].top && middle[1] < bounds[j].bottom && inside(middle, other.points));
      if (hidden) flush(); else { if (!run.length) run.push(a); run.push(b); }
    }
    flush();
  });
  const trails = [];
  // The foot becomes long low sweeps in the surrounding water, so the rising
  // mass belongs to the sea instead of ending at a freestanding pedestal.
  for (let i = 0; i < 4; i++) {
    const q = i / 3, end = [L * mix(.5, .63, q), A * mix(.17, .28, q)];
    trails.push({ points: bezier([L * mix(-.02, .2, q), A * mix(.08, .18, q)],
      [L * .25, A * mix(.08, .19, q)], [L * .43, A * mix(.2, .31, q)], end, 54),
      width: i === 1 ? 5.5 : between(.7, 1.8), tone: between(75, 135) });
  }
  trails.push({ points: bezier([-L * .63, A * .17], [-L * .57, A * .12],
    [-L * .54, -A * shoulderLift * .8], [-L * .44, -A * (shoulderLift + .03)], 44), width: 1.2, tone: 110 });
  const normalized = points => points.map(([x, y]) => [x / L, y / A]);
  return { mask: normalized(polygon), outline: normalized(outline), shoulder: normalized(shoulder), rim: normalized(rim), face: normalized(face),
    strokes: strokes.map(stroke => ({ ...stroke, points: normalized(stroke.points) })),
    masses: masses.map(mass => ({ ...mass, points: normalized(mass.points) })),
    trails: trails.map(stroke => ({ ...stroke, points: normalized(stroke.points) })),
    foam: [...foam.map(s => ({ ...s, tone: 255, width: .1 })), ...contours, ...spray].map(stroke => ({ ...stroke, points: normalized(stroke.points) })),
    parameters: { ...parameters, lipThickness } };
}
