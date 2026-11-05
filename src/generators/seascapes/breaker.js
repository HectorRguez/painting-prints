import { randomSource } from '../shared/port.js';

const mix = (a, b, t) => a + (b - a) * t;
const sample = (fn, n = 32) => Array.from({ length: n + 1 }, (_, i) => fn(i / n));
const point = (a, b, c, d, t) => {
  const s = 1 - t;
  return [s ** 3 * a[0] + 3 * s * s * t * b[0] + 3 * s * t * t * c[0] + t ** 3 * d[0],
    s ** 3 * a[1] + 3 * s * s * t * b[1] + 3 * s * t * t * c[1] + t ** 3 * d[1]];
};
function inside([x, y], polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}
const curve = (controls, n = 32) => sample(t => point(...controls, t), n);

const limits = {
  curl: [0, .45], crestPosition: [-.14, .06], shoulderWidth: [.22, .4], shoulderLift: [.02, .2],
  overhang: [.02, .09], lipDrop: [.06, .22], flowLines: [1, 5],
  flowSpread: [.6, 1.2], foamMarks: [0, 6], foamScale: [.6, 1.3],
};

export function validateBreakerOverrides(overrides = {}) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new RangeError('Breaker overrides must be an object');
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in limits) || !Number.isFinite(value) || value < limits[key][0] || value > limits[key][1]
      || ['flowLines', 'foamMarks'].includes(key) && !Number.isInteger(value)) {
      throw new RangeError('Unsupported breaker parameter: ' + key);
    }
  }
  return overrides;
}

// A broad rising shoulder meets a short spilling lip and an open falling face.
// The lip can lean forward, but it cannot form a closed tube or a large hook.
// Sparse marks carry the water's direction; there are no filled ink ribbons,
// overlapping foam polygons, branching fingers or decorative spray fields.
export function breakingWave(patch, overrides = {}) {
  const { length: L, amplitude: A, phase } = patch;
  if (!(L > 0 && A > 0) || !Number.isFinite(L + A + phase)) throw new RangeError('Invalid wave dimensions');
  validateBreakerOverrides(overrides);
  const random = randomSource('crest:' + phase), between = (a, b) => mix(a, b, random());
  const parameters = {
    curl: between(.1, patch.shape === 'breaker' ? .32 : .2),
    crestPosition: between(-.1, .015), shoulderWidth: between(.27, .36), shoulderLift: between(.04, .12),
    overhang: between(.035, .065), lipDrop: between(.09, .17),
    flowLines: 2 + Math.floor(random() * 2), flowSpread: between(.8, 1.1),
    foamMarks: 2 + Math.floor(random() * 3), foamScale: between(.8, 1.1), ...overrides,
  };
  const { curl, crestPosition: c, shoulderWidth: w, shoulderLift: lift, overhang, lipDrop,
    flowLines, flowSpread, foamMarks, foamScale } = parameters;
  // Normalized coordinates make the composition's wavelength and relief
  // independent from these shape controls. A tiny tucked tip distinguishes the crest from a hill; the return cannot grow into a tube.
  const peak = [c, -1], tip = [c + overhang * (.65 + curl), -1 + lipDrop];
  const shoulderControls = [[-.5, .02], [-.5 + w * .5, -lift], [c - w * .5, -1.02], peak];
  const rimControls = [peak, [c + overhang * .45, -1.025], [tip[0] - overhang * .1, tip[1] - lipDrop * .6], tip];
  const tucked = [tip[0] - overhang * (.25 + curl), tip[1] + .04 + .03 * curl];
  const lipControls = [tip, [tip[0] + .003, tip[1] + .02], [tucked[0], tucked[1] - .018], tucked];
  const faceControls = [tucked, [tucked[0] + .015, tucked[1] + .18 + curl * .16], [.29, .075], [.5, .03]];
  const shoulder = curve(shoulderControls, 40), rim = curve(rimControls, 18), face = [...curve(lipControls, 12), ...curve(faceControls, 44).slice(1)];
  const outline = [...shoulder, ...rim.slice(1), ...face.slice(1)];
  const mask = [...outline, [.5, .24], [-.5, .24]];
  const strokes = [];
  for (let i = 0; i < flowLines; i++) {
    const inset = (.035 + i * .044) * flowSpread;
    const end = .71 - i * .09, start = .08 + i * .045;
    const points = sample(t => {
      const q = mix(start, end, t), p = point(...shoulderControls, q);
      return [p[0] + inset * .4, p[1] + inset * (1 + Math.sin(q * Math.PI))];
    }, 32);
    strokes.push({ points, width: between(.55, 1.15), tone: between(105, 150) });
  }
  // A few short parallel streaks sit just below the lip. Unequal gaps and
  // lengths suggest broken foam without outlining a separate cloud or hand.
  const foam = [];
  for (let i = 0; i < foamMarks; i++) {
    const t = (i + between(.12, .5)) / Math.max(1, foamMarks), span = between(.055, .13) * foamScale;
    const points = sample(q => {
      const p = point(...rimControls, Math.min(.98, t + q * span));
      return [p[0], p[1] + (.018 + i % 2 * .016) * foamScale + .012 * Math.sin(q * Math.PI)];
    }, 10);
    // The tucked tip creates a little air below it: clip marks there rather
    // than allowing a foam streak to float across that opening.
    let run = [], longest = [];
    for (const p of points) {
      if (inside(p, mask)) run.push(p); else { if (run.length > longest.length) longest = run; run = []; }
    }
    if (run.length > longest.length) longest = run;
    const width = between(.5, .8), tone = between(100, 145);
    if (longest.length > 2) foam.push({ points: longest, width, tone, fill: 'none' });
  }
  const trails = [
    { points: curve([[.15, .12], [.29, .17], [.45, .16], [.61, .2]], 32), width: .7, tone: 125 },
    { points: curve([[-.61, .13], [-.51, .09], [-.4, .09], [-.27, .14]], 30), width: .55, tone: 145 },
  ];
  // Widths are ink units; points stay normalized for projection onto the sea.
  return { parameters, outline, mask, shoulder, rim, face, strokes, foam, trails, masses: [] };
}
