import { randomSource } from '../shared/port.js';

const mix = (a, b, t) => a + (b - a) * t;
const add = (a, b, scale = 1) => [a[0] + b[0] * scale, a[1] + b[1] * scale];
const unit = ([x, y]) => { const d = Math.hypot(x, y) || 1; return [x / d, y / d]; };
const sample = (fn, n) => Array.from({ length: n + 1 }, (_, i) => fn(i / n));
const bezier = (a, b, c, d, n = 36) => sample(t => {
  const s = 1 - t;
  return [s ** 3 * a[0] + 3 * s * s * t * b[0] + 3 * s * t * t * c[0] + t ** 3 * d[0],
    s ** 3 * a[1] + 3 * s * s * t * b[1] + 3 * s * t * t * c[1] + t ** 3 * d[1]];
}, n);

function inside([x, y], polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}

// A rolled water sheet, rather than a stored wave silhouette. Span and rise
// set scale; curl angle, radius, lean and lip thickness set the overhang. Foam
// branches grow from the sheet's tangent/normal field in image-space units.
export function breakingWave(patch, overrides = {}) {
  const random = randomSource(`crest:${patch.phase}`);
  const between = (a, b) => mix(a, b, random());
  const L = patch.length, A = patch.amplitude;
  const defaults = {
    curl: patch.shape === 'breaker' ? between(.74, 1) : between(.18, .48),
    radiusX: L * between(.17, .24), radiusY: A * between(.43, .57),
    lean: between(-.12, -.025), startAngle: Math.PI * between(1.03, 1.12),
    lipRatio: between(.045, .085), flowBundles: 5 + Math.floor(random() * 4),
    foamClusters: 5 + Math.floor(random() * 4), foamScale: between(.8, 1.2),
  };
  const parameters = { ...defaults, ...overrides };
  const { curl, radiusX, radiusY, lean, startAngle, lipRatio, flowBundles, foamClusters, foamScale } = parameters;
  const center = [L * lean, -A + radiusY];
  const endAngle = Math.PI * (1.5 + curl * .48);
  const lipThickness = A * lipRatio * curl;
  const ellipse = angle => [center[0] + radiusX * Math.cos(angle), center[1] + radiusY * Math.sin(angle)];
  const arc = sample(t => ellipse(mix(startAngle, endAngle, t)), 54);
  const back = [-L / 2, A * .025], foot = [L / 2, A * .045];
  const tangent = unit([-radiusX * Math.sin(startAngle), radiusY * Math.cos(startAngle)]);
  const shoulder = bezier(back, add(back, [L * between(.12, .2), A * between(-.06, .07)]),
    add(arc[0], tangent, -L * between(.09, .15)), arc[0]);
  const tip = arc.at(-1);
  const innerTip = add(tip, unit([center[0] - tip[0], center[1] - tip[1]]), lipThickness);
  const face = bezier(innerTip,
    add(innerTip, [L * mix(.02, -.3, curl), A * mix(.16, -.13, curl)]),
    [center[0] + L * mix(.19, -.015, curl), A * between(-.05, .06)], foot, 62);
  const outline = [...shoulder, ...arc.slice(1), innerTip, ...face.slice(1)];
  const polygon = [...outline, [L / 2, A * .22], [-L / 2, A * .22]];
  const strokes = [];
  const streamlines = flowBundles;
  const spacing = Array.from({ length: streamlines }, () => between(.5, 1.7));
  const totalSpacing = spacing.reduce((a, b) => a + b, 0);
  let position = 0;
  const trace = (t, width, tone, trim) => {
    const root = [mix(-.48, .48, t) * L, A * (.12 + .035 * Math.sin(t * 5 + patch.phase))];
    const angle = mix(startAngle, endAngle, mix(.12, .96, t));
    const target = add(ellipse(angle), [0, A * .025]);
    const points = bezier(root, [mix(-.25, .16, t) * L, A * (.03 + .05 * Math.sin(t * 3))],
      [center[0] + radiusX * mix(-.93, -.35, t), mix(-.42, -.57, t) * A], target, 86).slice(trim);
    let segment = [];
    for (const p of points) {
      if (inside(p, polygon)) segment.push(p);
      else { if (segment.length > 3) strokes.push({ points: segment, width, tone }); segment = []; }
    }
    if (segment.length > 3) strokes.push({ points: segment, width, tone });
  };
  for (let i = 0; i < streamlines; i++) {
    position += spacing[i];
    const t = (position - spacing[i] * .5) / totalSpacing;
    trace(t, between(2.5, 5.5), between(65, 105), 0);
    const companions = 1 + Math.floor(random() * 3);
    for (let j = 0; j < companions; j++) {
      trace(Math.min(.98, t + (j + 1) * between(.007, .014)), between(.35, .7), between(85, 145), Math.floor(between(0, 20)));
    }
  }

  const foam = [], spray = [];
  // A continuous, irregular foam bank joins the branches to the water sheet.
  // Low-frequency offsets change each bank's thickness without a serrated edge.
  const bankPhase = between(0, Math.PI * 2);
  const bankStart = .1, bankEnd = 1;
  const frame = t => {
    const angle = mix(startAngle, endAngle, t);
    return { p: ellipse(angle), n: unit([Math.cos(angle) / radiusX, Math.sin(angle) / radiusY]) };
  };
  const bank = sample(t => {
    const f = frame(mix(bankStart, bankEnd, t));
    return add(f.p, f.n, (2 + Math.sin(t * 23 + bankPhase) * 2) * Math.sin(t * Math.PI) ** .4);
  }, 80);
  const underside = sample(t => {
    const f = frame(mix(bankEnd, bankStart, t));
    return add(f.p, f.n, -A * (.045 + .024 * Math.sin(t * 19 + bankPhase) + .012 * Math.sin(t * 43)) * Math.sin(t * Math.PI) ** .4);
  }, 80);
  foam.push({ points: [...bank, ...underside], width: .3, fill: '#ffffff', tone: 150 });
  const ribbon = (points, width) => {
    const left = [], right = [];
    points.forEach((p, i) => {
      const before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)];
      const n = unit([before[1] - after[1], after[0] - before[0]]);
      const t = i / (points.length - 1), radius = width * (1 - t) ** .6 + .35;
      left.push(add(p, n, radius)); right.push(add(p, n, -radius));
    });
    return [...left, ...right.reverse()];
  };
  const clusters = foamClusters;
  for (let i = 0; i < clusters; i++) {
    const t = .35 + .65 * (i + between(.08, .95)) / clusters;
    const f = frame(t);
    const root = add(f.p, f.n, between(-1, 5));
    const cloudRadius = between(8, 16) * (.8 + A / 600) * foamScale;
    const cloudPhase = between(0, Math.PI * 2);
    const cloud = (center, radius) => sample(t => {
      const angle = t * Math.PI * 2;
      const r = radius * (1 + .13 * Math.sin(angle * 5 + cloudPhase) + .06 * Math.sin(angle * 9 + cloudPhase));
      return add(center, [r * Math.cos(angle), r * .8 * Math.sin(angle)]);
    }, 45);
    foam.push({ points: cloud(root, cloudRadius), fill: '#ffffff', tone: 100, width: .7 });
    for (let k = 0; k < 3; k++) {
      const center = add(root, [cloudRadius * between(-.7, 1), cloudRadius * between(-.5, .3)]);
      foam.push({ points: cloud(center, cloudRadius * between(.35, .7)), fill: '#ffffff', tone: 100, width: .7 });
    }
    const reach = between(13, 27) * (.7 + A / 600) * (.55 + .65 * t) * foamScale;
    const droop = mix(.05, .65, t) * between(.8, 1.2);
    // All tips travel with the crest and fall under gravity. Branches have
    // their own lengths and spread, instead of stamping a fixed foam glyph.
    const stem = bezier(root, add(root, [reach * .1, -reach * .5]),
      add(root, [reach * .9, -reach * .65]), add(root, [reach, reach * droop]), 18);
    const branches = [{ points: stem, width: between(3, 5) }];
    const fingers = 1 + Math.floor(random() * 3);
    for (let j = 0; j < fingers; j++) {
      const base = stem[Math.floor(between(.2, .7) * (stem.length - 1))];
      const size = reach * between(.45, 1.05);
      const spread = between(-.6, .5);
      branches.push({ points: bezier(base, add(base, [size * spread, -size * .7]),
        add(base, [size * (.65 + spread), -size * .9]), add(base, [size * (.9 + spread), size * (droop + between(-.1, .15))]), 14),
        width: between(1.5, 3.5) });
    }
    for (const branch of branches) foam.push({ points: ribbon(branch.points, branch.width),
      width: between(.5, .85), fill: '#ffffff', tone: between(65, 115) });
  }
  const droplets = 35 + Math.floor(random() * 30);
  for (let i = 0; i < droplets; i++) {
    const f = frame(between(.25, 1));
    const center = add(f.p, f.n, between(12, 54));
    center[0] += between(-6, 32); center[1] += between(-8, 28);
    const radius = between(.6, 1.8);
    spray.push({ points: sample(t => [center[0] + radius * Math.cos(t * Math.PI * 2), center[1] + radius * 1.25 * Math.sin(t * Math.PI * 2)], 8),
      width: .3, fill: '#ffffff', tone: between(110, 180) });
  }
  const contours = [];
  const bounds = foam.map(({ points }) => ({ left: Math.min(...points.map(p => p[0])), right: Math.max(...points.map(p => p[0])),
    top: Math.min(...points.map(p => p[1])), bottom: Math.max(...points.map(p => p[1])) }));
  foam.forEach((shape, index) => {
    let run = [];
    const flush = () => { if (run.length > 1) contours.push({ points: run, width: .65, fill: 'none', tone: 100 }); run = []; };
    const points = [...shape.points, shape.points[0]];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const middle = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const hidden = foam.some((other, j) => j !== index && middle[0] > bounds[j].left && middle[0] < bounds[j].right
        && middle[1] > bounds[j].top && middle[1] < bounds[j].bottom && inside(middle, other.points));
      if (hidden) flush(); else { if (!run.length) run.push(a); run.push(b); }
    }
    flush();
  });
  const normalized = points => points.map(([x, y]) => [x / L, y / A]);
  return { outline: normalized(outline), shoulder: normalized(shoulder), rim: normalized(arc), face: normalized(face),
    strokes: strokes.map(stroke => ({ ...stroke, points: normalized(stroke.points) })),
    foam: [...foam.map(s => ({ ...s, tone: 255, width: .1 })), ...contours, ...spray].map(stroke => ({ ...stroke, points: normalized(stroke.points) })),
    parameters: { ...parameters, lipThickness } };
}
