import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { ribbonParameters, resolveRibbonParameters, buildRibbons, generateRibbons,
  ribbonField, rk4Step, adaptiveStep, segmentDistance } from '../src/generators/ribbons/generate.js';

import { ribbonExtremeCases } from '../src/generators/ribbons/review-cases.js';

const norm = p => Math.hypot(...p);
const difference = (a, b) => [a[0] - b[0], a[1] - b[1]];
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Independent polygon-edge sweep: catches offset folds and intersections
// between separate ribbons without relying on the production clearance grid.
function assertSimpleDisjointPolygons(ribbons, label) {
  const edges = ribbons.flatMap((ribbon, ribbonId) => ribbon.polygon.map((a, edgeId, polygon) => ({
    a, b: polygon[(edgeId + 1) % polygon.length], ribbonId, edgeId, size: polygon.length,
  }))).map(edge => ({ ...edge, xmin: Math.min(edge.a[0], edge.b[0]), xmax: Math.max(edge.a[0], edge.b[0]),
    ymin: Math.min(edge.a[1], edge.b[1]), ymax: Math.max(edge.a[1], edge.b[1]) })).sort((a, b) => a.xmin - b.xmin);
  let active = [];
  for (const edge of edges) {
    active = active.filter(other => other.xmax >= edge.xmin);
    for (const other of active) {
      if (edge.ymin > other.ymax || other.ymin > edge.ymax) continue;
      if (edge.ribbonId === other.ribbonId && (Math.abs(edge.edgeId - other.edgeId) === 1 || Math.abs(edge.edgeId - other.edgeId) === edge.size - 1)) continue;
      const ab = cross(edge.a, edge.b, other.a) * cross(edge.a, edge.b, other.b);
      const cd = cross(other.a, other.b, edge.a) * cross(other.a, other.b, edge.b);
      assert.ok(!(ab < -1e-20 && cd < -1e-20), `${label}: intersecting polygon edges ${edge.ribbonId}/${edge.edgeId} and ${other.ribbonId}/${other.edgeId}`);
    }
    active.push(edge);
  }
}

function assertRibbonClearance(ribbons, spacing, label) {
  const segments = ribbons.flatMap((ribbon, ribbonId) => ribbon.centerline.slice(1).map((b, i) => {
    const a = ribbon.centerline[i], radius = ribbon.nominalWidth / 2 + spacing / 2;
    return { a, b, radius, ribbonId, xmin: Math.min(a[0], b[0]) - radius, xmax: Math.max(a[0], b[0]) + radius,
      ymin: Math.min(a[1], b[1]) - radius, ymax: Math.max(a[1], b[1]) + radius };
  })).sort((a, b) => a.xmin - b.xmin);
  let active = [];
  for (const segment of segments) {
    active = active.filter(other => other.xmax >= segment.xmin);
    for (const other of active) {
      if (segment.ribbonId === other.ribbonId || segment.ymin > other.ymax || other.ymin > segment.ymax) continue;
      assert.ok(segmentDistance(segment.a, segment.b, other.a, other.b) >= segment.radius + other.radius - 1e-9, `${label}: ribbon spacing violated`);
    }
    active.push(segment);
  }
}

function verifyGeometry(geometry, label) {
  const { ribbons, paths, parameters, diagnostics } = geometry;
  assert.ok(ribbons.length > 0 && ribbons.length <= parameters.ribbon.count, `${label}: bounded ribbon count`);
  assert.equal(diagnostics.count, ribbons.length);
  const field = ribbonField(parameters);
  for (const ribbon of ribbons) {
    assert.ok(ribbon.length >= parameters.ribbon.minLength && ribbon.length <= parameters.ribbon.maxLength + 1e-6);
    assert.equal(ribbon.widths[0], 0); assert.equal(ribbon.widths.at(-1), 0);
    assert.ok(ribbon.maxIntegrationError <= parameters.integration.tolerance, `${label}: accepted error exceeds tolerance`);
    const reference = field.potential(ribbon.centerline[0]);
    let area = 0;
    ribbon.polygon.forEach((point, i, polygon) => { const next = polygon[(i + 1) % polygon.length]; area += point[0] * next[1] - point[1] * next[0]; });
    assert.ok(Math.abs(area) > .0001, `${label}: zero-area ribbon`);
    ribbon.centerline.forEach((point, i) => {
      assert.ok(Number.isFinite(point[0]) && Number.isFinite(point[1]));
      assert.ok(Math.abs(field.potential(point) - reference) < .0005, `${label}: streamline left its potential contour`);
      assert.ok(ribbon.widths[i] >= 0 && ribbon.widths[i] <= ribbon.nominalWidth / 2 + 1e-12);
      assert.ok(Math.abs(norm(ribbon.normals[i]) - 1) < 1e-10);
      if (i) {
        const ds = norm(difference(point, ribbon.centerline[i - 1]));
        assert.ok(ds <= parameters.integration.step * 1.001);
        assert.ok(Math.abs(ribbon.widths[i] - ribbon.widths[i - 1]) <= .18 * ds + 1e-10, `${label}: abrupt width change at bend`);
        assert.ok(ribbon.normals[i][0] * ribbon.normals[i - 1][0] + ribbon.normals[i][1] * ribbon.normals[i - 1][1] > .97, `${label}: flipped normal`);
      }
    });
  }
  for (const path of paths) for (const point of path.points) for (const value of point)
    assert.ok(Number.isFinite(value) && value >= 99 && value <= 901, `${label}: finite uncropped print geometry`);
  assertSimpleDisjointPolygons(ribbons, label);
  assertRibbonClearance(ribbons, parameters.ribbon.spacing, label);
}

test('ribbon parameters and overrides are reproducible, explicit, independent, and validated', () => {
  for (const seed of ['', 'flow 雪 & ribbons', 'ribbons-1']) {
    assert.deepEqual(ribbonParameters(seed), ribbonParameters(seed));
    assert.deepEqual(generateRibbons(seed), generateRibbons(seed));
  }
  const base = ribbonParameters('control'), altered = resolveRibbonParameters('control', { family: 'eddy', ribbon: { width: .08 }, field: { anisotropy: 1.8 } });
  assert.deepEqual(resolveRibbonParameters('control', { family: base.family }), base, 'repeating the selected family must not perturb unrelated random parameters');
  assert.equal(altered.family, 'eddy'); assert.equal(altered.ribbon.width, .08); assert.equal(altered.field.anisotropy, 1.8);
  altered.field.vortices[0].center[0] = 999;
  assert.deepEqual(ribbonParameters('control'), base);
  for (const overrides of [{ ribbon: { width: NaN } }, { ribbon: { width: .2 } }, { ribbon: { count: 3.5 } }, { mystery: 1 }, { field: { harmonics: [{ frequency: 1 }] } }, { style: { palette: ['url(bad)'] } }, { field: { drift: { speed: 0 }, harmonics: [], vortices: [] } }])
    assert.throws(() => buildRibbons('bad-parameters', overrides));
  assert.notEqual(generateRibbons('control').svg, generateRibbons('control', { ribbon: { width: .08 } }).svg);
});

test('analytic curl agrees with potential derivatives and has negligible divergence, including vortex centers', () => {
  const families = ['sweep', 'meander', 'eddy', 'confluence'];
  for (const family of families) {
    const parameters = resolveRibbonParameters('derivative-check', { family, field: { anisotropy: family === 'eddy' ? 2 : .5 } });
    const field = ribbonField(parameters), epsilon = 1e-5;
    for (let x = -.9; x <= .9; x += .3) for (let y = -.9; y <= .9; y += .3) {
      const p = [x, y], xp = [x + epsilon, y], xm = [x - epsilon, y], yp = [x, y + epsilon], ym = [x, y - epsilon];
      const numericCurl = [(field.potential(yp) - field.potential(ym)) / (2 * epsilon), -(field.potential(xp) - field.potential(xm)) / (2 * epsilon)];
      assert.ok(norm(difference(field.velocity(p), numericCurl)) < 2e-7);
      const divergence = (field.velocity(xp)[0] - field.velocity(xm)[0] + field.velocity(yp)[1] - field.velocity(ym)[1]) / (2 * epsilon);
      assert.ok(Math.abs(divergence) < 1e-6);
    }
  }
  const centered = ribbonField(resolveRibbonParameters('core', { field: { angle: 0, anisotropy: 1, drift: { speed: 0, angle: 0 }, harmonics: [], vortices: [{ center: [0, 0], radius: .1, circulation: 5 }] } }));
  assert.equal(norm(centered.velocity([0, 0])), 0);
  assert.ok(norm(centered.velocity([1e-6, 0])) < .000006, 'soft vortex core has no point singularity');
});

test('RK4 converges at fourth order; adaptive tolerance controls actual global error', () => {
  const rotation = ([x, y]) => [-y, x], expected = [Math.cos(6), Math.sin(6)];
  const fixed = step => { let p = [1, 0]; for (let i = 0; i < Math.round(6 / step); i++) p = rk4Step(rotation, p, step); return norm(difference(p, expected)); };
  const coarse = fixed(.2), fine = fixed(.1);
  assert.ok(coarse / fine > 14 && coarse / fine < 18);
  const adaptive = tolerance => {
    let point = [1, 0], elapsed = 0, steps = 0;
    while (elapsed < 6 - 1e-12) {
      const result = adaptiveStep(rotation, point, Math.min(.6, 6 - elapsed), { tolerance, minStep: 1e-7 });
      assert.ok(result && result.error <= tolerance); point = result.point; elapsed += result.step; steps++;
    }
    return { error: norm(difference(point, expected)), steps };
  };
  const loose = adaptive(1e-4), tight = adaptive(1e-8);
  assert.ok(tight.error < loose.error / 30 && tight.steps > loose.steps);
  assert.equal(adaptiveStep(() => [NaN, 0], [0, 0], .1, { tolerance: 1e-7, minStep: .0001 }), null);
});

test('segment clearance handles crossings, collinear overlaps, endpoints, and separation', () => {
  assert.equal(segmentDistance([0, 0], [1, 1], [0, 1], [1, 0]), 0);
  assert.equal(segmentDistance([0, 0], [1, 0], [.5, 0], [2, 0]), 0);
  assert.equal(segmentDistance([0, 0], [1, 0], [1, 0], [2, 1]), 0);
  assert.equal(segmentDistance([0, 0], [1, 0], [0, .5], [1, .5]), .5);
});

test('48 seeds have distinct coordinates, all field families, and simple noncrossing ribbon geometry', () => {
  const hashes = new Set(), families = new Set();
  for (let i = 0; i < 48; i++) {
    const seed = `ribbons-review-${String(i).padStart(2, '0')}`, geometry = buildRibbons(seed);
    verifyGeometry(geometry, seed);
    hashes.add(hash(geometry.ribbons.map(r => r.polygon))); families.add(geometry.parameters.family);
  }
  assert.equal(hashes.size, 48); assert.deepEqual([...families].sort(), ['confluence', 'eddy', 'meander', 'sweep']);
});



test('supported parameter extremes retain finite, noncrossing, tapered ribbons', () => {
  for (const [index, { name, overrides }] of ribbonExtremeCases.entries()) verifyGeometry(buildRibbons(`ribbons-extreme-${String(index).padStart(2, '0')}`, overrides), name);
});

test('shipping worker reproduces source geometry and parameter metadata', async () => {
  const code = await readFile(new URL('../public/generators/ribbons/worker.js', import.meta.url), 'utf8');
  let result;
  const context = vm.createContext({ performance, structuredClone, postMessage: value => { result = value; } });
  context.self = context; vm.runInContext(code, context);
  await context.onmessage({ data: { seed: 'ribbons-worker-雪' } });
  const expected = generateRibbons('ribbons-worker-雪');
  assert.equal(result.type, 'painting-ready'); assert.equal(result.svg, expected.svg);
  assert.equal(JSON.stringify(result.parameters), JSON.stringify(expected.parameters));
  assert.equal(result.artRevision, 1); assert.equal(result.whiteToAlpha, false);
  assert.ok(Number.isFinite(result.generationMs));
});
