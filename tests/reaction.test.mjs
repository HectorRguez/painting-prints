import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { buildReaction, generateReaction, orientHighLeft, reactionParameters } from '../src/generators/reaction/generate.js';
import { initialReaction, resolveParameters } from '../src/generators/reaction/parameters.js';
import { advanceReaction, concentrationStatistics } from '../src/generators/reaction/solver.js';
import { traceContours, signedArea } from '../src/generators/shared/isocontours.js';
import { prepare } from '../src/generators/reaction/build.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const blank = size => ({ size, u: new Float64Array(size * size).fill(1), v: new Float64Array(size * size), elapsed: 0 });
const sum = field => field.reduce((a, b) => a + b, 0);
const difference = (a, b) => Math.sqrt(a.reduce((total, value, i) => total + (value - b[i]) ** 2, 0) / a.length);
const kinetic = { feed: .037, kill: .063, diffusionU: .8, diffusionV: .4, dt: .5 };

function turnField(field, size) {
  const result = new Float64Array(field.length);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) result[x * size + size - 1 - y] = field[y * size + x];
  return result;
}

function hasCrossing(points) {
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const segments = points.map((a, i) => {
    const b = points[(i + 1) % points.length];
    return { a, b, i, minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]), minY: Math.min(a[1], b[1]), maxY: Math.max(a[1], b[1]) };
  }).sort((a, b) => a.minX - b.minX);
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const a = segments[i], b = segments[j];
    if (b.minX > a.maxX) break;
    if (a.maxY < b.minY || b.maxY < a.minY || Math.abs(a.i - b.i) === 1 || Math.abs(a.i - b.i) === points.length - 1) continue;
    if (cross(a.a, a.b, b.a) * cross(a.a, a.b, b.b) < -1e-12
      && cross(b.a, b.b, a.a) * cross(b.a, b.b, a.b) < -1e-12) return true;
  }
  return false;
}

test('parameters reproduce seeds, honor explicit zero values and reject unsupported or unsafe overrides', () => {
  assert.deepEqual(reactionParameters('growth 雨 & /'), reactionParameters('growth 雨 & /'));
  const controls = { feed: .041, kill: .062, diffusionU: .9, diffusionV: .45, dt: .5,
    duration: 1400, rotation: 0, noise: 0, feedGradient: 0, inkDensity: 0, clusterSeparation: 0 };
  const p = resolveParameters('control study', controls);
  for (const [key, value] of Object.entries(controls)) assert.equal(p[key], value);
  assert.deepEqual(controls, { feed: .041, kill: .062, diffusionU: .9, diffusionV: .45, dt: .5,
    duration: 1400, rotation: 0, noise: 0, feedGradient: 0, inkDensity: 0, clusterSeparation: 0 });
  for (const override of [{ feed: NaN }, { size: 175.5 }, { contourCount: 0 }, { typo: 1 },
    { dt: .8, diffusionU: 1.15 }, { seedRadius: -1 }, { size: 224, duration: 4200, dt: .2 },
    { size: 96, spread: .29, seedRadius: 10, seedElongation: 2.3 }]) assert.throws(() => resolveParameters('bad', override), RangeError);
});

test('the unperturbed Gray–Scott state stays exact and pure diffusion preserves mass and its maximum principle', () => {
  const initial = blank(33);
  assert.deepEqual(advanceReaction(initial, kinetic, 100).u, initial.u);
  assert.deepEqual(advanceReaction(initial, kinetic, 100).v, initial.v);
  initial.u[16 * 33 + 16] = .6;
  const before = initial.u.slice();
  const result = advanceReaction(initial, { ...kinetic, feed: 0, kill: 0 }, 8);
  assert.ok(Math.abs(sum(result.u) - sum(before)) < 1e-10, 'A compact diffusing disturbance must conserve mass before reaching the reservoir');
  assert.ok(result.u.every(value => value >= .6 && value <= 1), 'Diffusion must neither overshoot nor sharpen its extrema');
  assert.ok(result.v.every(value => value === 0));
  assert.deepEqual(initial.u, before, 'The solver must not mutate a saved initial state');
});

test('autocatalysis transfers U to V without inventing mass, and the stencil respects quarter turns', () => {
  const initial = blank(35);
  for (let y = 10; y < 23; y++) for (let x = 11; x < 20; x++) {
    initial.u[y * 35 + x] = .5 + (x % 3) * .03;
    initial.v[y * 35 + x] = .23 + (y % 4) * .015;
  }
  const result = advanceReaction(initial, kinetic, 1);
  let predictedChange = 0;
  for (let i = 0; i < initial.u.length; i++) predictedChange += kinetic.dt
    * (kinetic.feed * (1 - initial.u[i] - initial.v[i]) - kinetic.kill * initial.v[i]);
  const change = sum(result.u) + sum(result.v) - sum(initial.u) - sum(initial.v);
  assert.ok(Math.abs(change - predictedChange) < 2e-10, 'Only feed and removal alter total concentration');
  const turned = { ...initial, u: turnField(initial.u, 35), v: turnField(initial.v, 35) };
  const evolved = advanceReaction(initial, kinetic, 80), evolvedTurned = advanceReaction(turned, kinetic, 80);
  assert.ok(difference(turnField(evolved.u, 35), evolvedTurned.u) < 1e-13);
  assert.ok(difference(turnField(evolved.v, 35), evolvedTurned.v) < 1e-13);
});

test('halving the Euler time step converges over the same physical time', () => {
  const initial = blank(41);
  for (let y = 17; y <= 23; y++) for (let x = 15; x <= 25; x++) {
    initial.u[y * 41 + x] = .5; initial.v[y * 41 + x] = .25;
  }
  const evolve = dt => advanceReaction(initial, { ...kinetic, dt }, Math.round(24 / dt));
  const coarse = evolve(.8), fine = evolve(.4), reference = evolve(.1);
  const error = state => difference(state.u, reference.u) + difference(state.v, reference.v);
  assert.ok(error(fine) < error(coarse) * .65, 'Temporal refinement must reduce the error, not merely produce another texture');
  assert.equal(coarse.elapsed, fine.elapsed);
});

test('nearby feed rates perturb the solution continuously before a pattern transition', () => {
  const p = resolveParameters('local response', { size: 96, duration: 600, spread: .12, seedRadius: 4, seedElongation: 1 });
  const initial = initialReaction('local response', p);
  // An explicit uniform field ensures that this study actually changes feed.
  delete initial.feedField;
  const evolve = delta => advanceReaction(initial, { ...p, feed: p.feed + delta }, 80);
  const base = evolve(0), near = evolve(.00001), farther = evolve(.00002);
  const small = difference(base.v, near.v), large = difference(base.v, farther.v);
  assert.ok(small > 1e-8 && small < 1e-4);
  assert.ok(large / small > 1.8 && large / small < 2.2,
    'Small kinetic edits should have a local linear response, not select a different geometry template');
});

test('supported extreme rates stay finite and nonnegative without clamping', () => {
  for (const controls of [
    { feed: .024, kill: .057, diffusionU: .65, diffusionV: .3, dt: .8 },
    { feed: .065, kill: .068, diffusionU: 1.15, diffusionV: .6, dt: .7 },
    { feed: .024, kill: .068, diffusionU: 1.15, diffusionV: .3, dt: .2 },
    { feed: .065, kill: .057, diffusionU: .65, diffusionV: .6, dt: .8 },
  ]) {
    const p = resolveParameters('numerical extremes', { ...controls, size: 96, duration: 600 });
    const result = advanceReaction(initialReaction('numerical extremes', p), p, Math.ceil(p.duration / p.dt));
    assert.ok(result.u.every(value => Number.isFinite(value) && value >= 0 && value <= 1 + 1e-12));
    assert.ok(result.v.every(value => Number.isFinite(value) && value >= 0 && value < 1));
  }
});

test('compound contours preserve holes with nonzero fill and remain simple', () => {
  const size = 65;
  const values = Float64Array.from({ length: size * size }, (_, i) => {
    const radius = Math.hypot(i % size - 32, Math.floor(i / size) - 32);
    return Math.min(radius - 10, 22 - radius);
  });
  const contours = traceContours(values, size, size, .123).map(contour => orientHighLeft(contour.points, values, size));
  assert.equal(contours.length, 2);
  const areas = contours.map(signedArea).sort((a, b) => a - b);
  assert.ok(areas[0] < -300 && areas[1] > 1400, 'The inner contour must subtract a hole from the outer region');
  assert.ok(Math.abs(areas.reduce((a, b) => a + b, 0) - Math.PI * ((22 - .123) ** 2 - (10 + .123) ** 2)) < 3);
  for (const points of contours) assert.ok(!hasCrossing(points));
});

test('48 default histories remain distinct, developed, bounded and topologically clean', { timeout: 240000 }, () => {
  const fields = new Set(), geometry = new Set(), habits = new Set(), layouts = new Set();
  for (let i = 0; i < 48; i++) {
    const seed = `reaction-review-${String(i).padStart(2, '0')}`;
    const { state, paths, parameters, metrics } = buildReaction(seed);
    habits.add(parameters.habit); layouts.add(parameters.clusterCount);
    fields.add(hash(Buffer.from(state.v.buffer)));
    geometry.add(hash(JSON.stringify(paths.map(path => path.points))));
    assert.ok(metrics.minU >= 0 && metrics.maxU <= 1 + 1e-12 && metrics.minV >= 0 && metrics.maxV < 1, seed);
    assert.ok(metrics.coverage > .015 && metrics.coverage < .65 && metrics.varianceV > .001, `${seed}: extinguished or saturated field`);
    assert.ok(metrics.elapsed > 250 && metrics.elapsed <= parameters.duration + parameters.dt, `${seed}: meaningful bounded growth time`);
    assert.ok(paths.length >= 4 && paths.length < 1000, `${seed}: useful contour complexity`);
    for (const path of paths) {
      assert.equal(path.closed, true, `${seed}: incomplete contour`);
      assert.ok(!hasCrossing(path.points), `${seed}: self-crossing contour`);
      for (const point of path.points) for (const value of point) {
        assert.ok(Number.isFinite(value) && value >= parameters.padding - 1e-7
          && value <= 1000 - parameters.padding + 1e-7, `${seed}: print margins`);
      }
    }
  }
  assert.equal(fields.size, 48); assert.equal(geometry.size, 48);
  assert.equal(habits.size, 3); assert.equal(layouts.size, 3);
});

test('style overrides change the drawing without changing the chemical solution', () => {
  const overrides = { size: 128, duration: 900, feed: .05, kill: .062, seedRadius: 4, spread: .17 };
  const first = buildReaction('override study', overrides);
  const next = buildReaction('override study', { ...overrides, lineWidth: 1.8, inkDensity: 0, padding: 120 });
  assert.deepEqual(first.state.v, next.state.v);
  assert.notDeepEqual(first.paths, next.paths);
  const source = generateReaction('override study', { ...overrides, inkDensity: 0 });
  assert.equal(source.mode, 'reaction'); assert.equal(source.artRevision, 1);
  assert.ok(!/<image|<rect|NaN|Infinity/.test(source.svg));
  assert.ok(!/fill="#/.test(source.svg), 'The ink-only override must leave the interior transparent');
});

test('large grids and refined time steps retain viable contours, while extinction is explicit', { timeout: 30000 }, () => {
  for (const [seed, controls] of [
    ['reaction-stress-largest', { size: 224, duration: 2600, dt: .75, spread: .14, feed: .038, kill: .0608 }],
    ['reaction-stress-fine-time', { size: 128, duration: 2100, dt: .2, spread: .14, seedRadius: 4, seedElongation: 1.2, feed: .036, kill: .0636 }],
  ]) {
    const { metrics, paths, parameters } = buildReaction(seed, controls);
    assert.ok(metrics.coverage > .05 && metrics.coverage < .5);
    assert.ok(metrics.minU >= 0 && metrics.maxU <= 1 && metrics.minV >= 0 && metrics.maxV < 1);
    assert.ok(metrics.boundaryActivity < parameters.threshold, 'Visible contours must clear the reservoir guard ring');
    for (const path of paths) {
      assert.ok(path.closed && !hasCrossing(path.points));
      assert.ok(path.points.every(point => point.every(value => Number.isFinite(value)
        && value >= parameters.padding - 1e-7 && value <= 1000 - parameters.padding + 1e-7)));
    }
  }
  assert.throws(() => buildReaction('reaction-extinction', { feed: .024, kill: .068, size: 96,
    duration: 600, spread: .12, seedRadius: 3, seedElongation: 1, nuclei: 3 }), /extinguish/,
  'Unproductive chemistry must report extinction rather than quietly substituting a different seed or model');
});

test('the bundled classic worker reproduces the source and exposes its chosen parameters', { timeout: 30000 }, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'reaction-worker-'));
  try {
    await prepare(pathToFileURL(`${folder}/`));
    const code = await readFile(join(folder, 'worker.js'), 'utf8');
    let result;
    const context = vm.createContext({ performance, postMessage: value => { result = value; } }); context.self = context;
    vm.runInContext(code, context);
    await context.onmessage({ data: { seed: 'reaction worker 雨' } });
    assert.equal(result.type, 'painting-ready');
    const original = generateReaction('reaction worker 雨');
    assert.equal(result.svg, original.svg);
    assert.equal(JSON.stringify(result.parameters), JSON.stringify(original.parameters));
    assert.ok(result.generationMs > 0 && result.generationMs < 15000);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
