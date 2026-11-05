import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { buildFolds, generateFolds, foldParameters, resolveFoldParameters, foldSurface,
  foldNormal, foldLighting, projectFold, projectionJacobian, projectionBounds, simplifyLoop } from '../src/generators/folds/generate.js';
import { companionParameters } from '../src/generators/folds/parameters.js';
import { foldStudies } from '../src/generators/folds/review-cases.js';
import { prepare } from '../src/generators/folds/build.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const flat = { composition: 'single', amplitude: 0, bend: 0, arch: 0, twist: 0, endRound: 0,
  edgeWave: 0, taper: 0, rotation: 0, tilt: 0, cameraRoll: 0, aspect: 1 };
const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function selfCrosses(points) {
  const n = points.length;
  const edges = points.map((a, i) => { const b = points[(i + 1) % n]; return { a, b, i,
    left: Math.min(a[0], b[0]), right: Math.max(a[0], b[0]), top: Math.min(a[1], b[1]), bottom: Math.max(a[1], b[1]) }; });
  edges.sort((a, b) => a.left - b.left);
  let active = [];
  for (const edge of edges) {
    active = active.filter(other => other.right > edge.left + 1e-8);
    for (const other of active) {
      const d = Math.abs(edge.i - other.i);
      if (d <= 1 || d === n - 1 || other.bottom <= edge.top + 1e-8 || edge.bottom <= other.top + 1e-8) continue;
      if (orient(edge.a, edge.b, other.a) * orient(edge.a, edge.b, other.b) < -1e-8
        && orient(other.a, other.b, edge.a) * orient(other.a, other.b, edge.b) < -1e-8) return true;
    }
    active.push(edge);
  }
  return false;
}
function winding(points, point) {
  let result = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (a[1] <= point[1] && b[1] > point[1] && orient(a, b, point) > 0) result++;
    if (a[1] > point[1] && b[1] <= point[1] && orient(a, b, point) < 0) result--;
  }
  return result;
}
function geometry(scene, label) {
  assert.ok(scene.paths.length > 0 && scene.paths.length <= 96, label);
  for (const sheet of scene.sheets) {
    assert.ok(sheet.projection.min * sheet.projection.max > 0, `${label}: projection reverses orientation`);
    const boundary = [];
    for (let i = 0; i < 180; i++) boundary.push(sheet.project(i / 180, 0));
    for (let i = 0; i < 40; i++) boundary.push(sheet.project(1, i / 40));
    for (let i = 0; i < 180; i++) boundary.push(sheet.project(1 - i / 180, 1));
    for (let i = 0; i < 40; i++) boundary.push(sheet.project(0, 1 - i / 40));
    assert.ok(!selfCrosses(boundary), `${label}: global silhouette intersects itself`);
    for (const facet of sheet.facets) {
      assert.ok(facet.points.length >= 3 && !selfCrosses(facet.points), `${label}: crossing filled contour at ${facet.level}`);
      for (const point of facet.points) for (const x of point) {
        assert.ok(Number.isFinite(x) && x >= scene.parameters.padding - 1e-6
          && x <= 1000 - scene.parameters.padding + 1e-6, `${label}: invalid page bounds`);
      }
    }
  }
}

test('parameters are explicit and deterministic; overrides preserve inputs and reject invalid controls', () => {
  assert.deepEqual(foldParameters('雨 / fold'), foldParameters('雨 / fold'));
  assert.notDeepEqual(foldParameters('one'), foldParameters('two'));
  const controls = { amplitude: 0, tilt: 0, composition: 'single' }, saved = structuredClone(controls);
  assert.equal(resolveFoldParameters('one', controls).amplitude, 0);
  assert.deepEqual(controls, saved);
  for (const bad of [{ pleats: 7 }, { pleats: 12.5 }, { tilt: NaN }, { width: Infinity },
    { palette: 'missing' }, { family: 'template' }, { arbitrary: 1 }, { spacingVariation: .5 }]) {
    assert.throws(() => resolveFoldParameters('one', bad), RangeError);
  }
  assert.throws(() => resolveFoldParameters('one', null), TypeError);
});

test('flat sweep and annular fan match their analytic coordinates, normals, Jacobian and illumination', () => {
  for (const family of ['sweep', 'fan']) {
    const p = resolveFoldParameters('analytic', { ...flat, family });
    for (const u of [.08, .37, .62, .93]) for (const v of [.1, .4, .9]) {
      const point = foldSurface(p, u, v), projected = projectFold(p, u, v), normal = foldNormal(p, u, v);
      if (family === 'sweep') {
        near(point[0], p.length * (u - .5)); near(point[1], p.width * (v - .5));
        near(projectionJacobian(p, u, v), p.length * p.width, .0002);
      } else {
        const angle = (u - .5) * p.aperture, r = p.innerRadius + p.width * v;
        near(point[0], r * Math.cos(angle)); near(point[1], r * Math.sin(angle));
        near(projectionJacobian(p, u, v), -p.aperture * p.width * r, .001);
      }
      near(point[2], 0); near(projected[0], point[0]); near(projected[1], point[1]);
      normal.forEach((x, i) => near(x, i === 2 ? 1 : 0));
      near(foldLighting(p, u, v), .12 + .82 * Math.sin(p.lightElevation));
    }
  }
});

test('pleat normals match the analytic height derivative and rotate with the light', () => {
  const p = resolveFoldParameters('normal', { ...flat, family: 'sweep', amplitude: 20, pleats: 16, spacingVariation: .04 });
  for (const u of [.012, .123, .327, .723, .921]) {
    const phase = p.pleats * (u + p.spacingVariation * Math.sin(2 * Math.PI * u));
    const derivative = p.amplitude * Math.PI * Math.sin(2 * Math.PI * phase) * p.pleats
      * (1 + 2 * Math.PI * p.spacingVariation * Math.cos(2 * Math.PI * u));
    const slope = -derivative / p.length, length = Math.hypot(slope, 1), normal = foldNormal(p, u, .5);
    near(normal[0], slope / length, .000002); near(normal[1], 0, 1e-7); near(normal[2], 1 / length, .000002);
    const rotated = { ...p, rotation: .7, lightAzimuth: p.lightAzimuth + .7 };
    near(foldLighting(rotated, u, .5), foldLighting(p, u, .5), 1e-8);
  }
});

test('simplification controls geometric error and retains small closed loops', () => {
  const original = Array.from({ length: 500 }, (_, i) => [40 * Math.cos(i / 500 * Math.PI * 2), 20 * Math.sin(i / 500 * Math.PI * 2)]);
  const simple = simplifyLoop(original, .08);
  assert.ok(simple.length < 100 && simple.length >= 3 && !selfCrosses(simple));
  for (const point of original) {
    let closest = Infinity;
    for (let i = 0; i < simple.length; i++) {
      const a = simple[i], b = simple[(i + 1) % simple.length], dx = b[0] - a[0], dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy)));
      closest = Math.min(closest, Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy));
    }
    assert.ok(closest <= .080001);
  }
  assert.ok(simplifyLoop(original.map(p => p.map(x => x * .0001))).length >= 3);
});

test('filled-band winding reproduces the continuous lighting and paired sheets have complete ordered coverage', { timeout: 30000 }, () => {
  const scene = buildFolds('folds-review-07', { composition: 'paired', separation: .1, companionScale: .85 });
  assert.equal(scene.sheets.length, 2);
  assert.deepEqual(scene.paths, scene.sheets.flatMap(sheet => sheet.paths));
  let checked = 0, overlaps = 0;
  for (const sheet of scene.sheets) {
    const levels = [...new Set(sheet.facets.map(f => f.level))];
    for (const u of [.11, .29, .53, .71, .89]) for (const v of [.17, .43, .79]) {
      const point = sheet.project(u, v), value = foldLighting(sheet.parameters, u, v);
      for (const level of levels) {
        if (Math.abs(level - value) < .035) continue;
        const count = sheet.facets.filter(f => f.level === level).reduce((sum, f) => sum + winding(f.points, point), 0);
        assert.equal(count !== 0, value > level, `UV(${u},${v}) expected ${value} at level ${level}`); checked++;
      }
      const covered = scene.sheets.map(s => s.facets.filter(f => f.level === .1).reduce((sum, f) => sum + winding(f.points, point), 0) !== 0);
      if (covered.every(Boolean)) overlaps++;
    }
  }
  assert.ok(checked > 1000 && overlaps > 0, 'Exercise lighting, holes and actual sheet overlaps');
});

test('48 seeded compositions are unique, bounded, simple and varied', { timeout: 180000 }, () => {
  const hashes = new Set(), families = new Set(), compositions = new Set(), palettes = new Set();
  let pairs = 0;
  for (let i = 0; i < 48; i++) {
    const seed = `folds-review-${String(i).padStart(2, '0')}`, scene = buildFolds(seed);
    geometry(scene, seed); hashes.add(hash(JSON.stringify(scene.paths)));
    families.add(scene.parameters.family); compositions.add(scene.parameters.composition); palettes.add(scene.parameters.palette);
    pairs += scene.sheets.length === 2;
  }
  assert.equal(hashes.size, 48); assert.equal(families.size, 2); assert.equal(compositions.size, 2); assert.equal(palettes.size, 5);
  assert.ok(pairs >= 7 && pairs <= 22);
});

test('diverse parameter extremes retain coherent surfaces and unsafe projections fail explicitly', { timeout: 60000 }, () => {
  for (const [i, study] of foldStudies.entries()) geometry(buildFolds(`folds-study-${i}`, study.controls), study.name);
  assert.throws(() => buildFolds('guard-0', { family: 'fan', composition: 'single', aperture: 1.4, innerRadius: 45, width: 150,
    arch: 95, tilt: .6, rotation: -Math.PI, aspect: .75, twist: -.8 }), /projection/);
});

test('512 fresh default recipes and their companions have feasible projections, including former narrow-fan failures', { timeout: 60000 }, () => {
  let sheets = 0;
  for (let i = 0; i < 512; i++) {
    const seed = `fold-projection-stress-${i}`, primary = foldParameters(seed);
    const recipes = primary.composition === 'paired' ? [primary, companionParameters(seed, primary)] : [primary];
    for (const recipe of recipes) {
      const { min, max } = projectionBounds(recipe);
      assert.ok(min * max > 0 && Math.min(Math.abs(min), Math.abs(max)) / Math.max(Math.abs(min), Math.abs(max)) >= .015, seed);
      sheets++;
    }
  }
  assert.ok(sheets > 600);
  for (const number of [236, 496]) {
    const seed = `fold-projection-stress-${number}`;
    geometry(buildFolds(seed), seed);
    assert.ok(foldParameters(seed).tilt < .3, 'The returned default recipe records its feasible camera');
  }
  assert.throws(() => buildFolds('fold-projection-stress-236', { tilt: .4054090488702059 }), /projection/,
    'An explicitly requested unsafe camera remains an error');
});

test('bundled worker reproduces source paths, revision and complete parameter metadata', { timeout: 60000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'folds-worker-'));
  try {
    await prepare(pathToFileURL(`${directory}/`));
    let result;
    const context = vm.createContext({ performance, postMessage: value => { result = value; } }); context.self = context;
    vm.runInContext(await readFile(join(directory, 'worker.js'), 'utf8'), context);
    await context.onmessage({ data: { seed: 'fold worker 雨' } });
    const source = generateFolds('fold worker 雨');
    assert.equal(result.type, 'painting-ready'); assert.equal(result.mode, 'folds'); assert.equal(result.artRevision, 1);
    assert.equal(result.svg, source.svg); assert.equal(JSON.stringify(result.parameters), JSON.stringify(source.parameters));
    assert.equal(JSON.stringify(result.metrics), JSON.stringify(source.metrics));
    // VM-context arithmetic is substantially slower than native modules or a
    // browser worker; retain a runaway ceiling, not a machine-speed benchmark.
    assert.ok(result.generationMs > 0 && result.generationMs < 30000);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
