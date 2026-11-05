import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { buildDunes, generateDunes, duneParameters } from '../src/generators/dunes/generate.js';
import { resolveParameters, ridgeSkeletons, makeTerrain, terrainGrid, stossProfile, crestEnvelope } from '../src/generators/dunes/model.js';
import { makeCamera, depthBuffer, sunlight, filterLighting } from '../src/generators/dunes/render.js';
import { shadeContours } from '../src/generators/dunes/contours.js';
import { prepare } from '../src/generators/dunes/build.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const fields = ['barchan', 'transverse', 'linear', 'star'];
const straightRidge = [{ dune: 0, segments: [{ a: [0, -300, 60], b: [0, 300, 60], dx: 0, dz: 600, l2: 360000, normal: [1, 0] }] }];

test('dune seed and explicit overrides are stable and reject unsupported values', () => {
  const seed = 'Dunes 雨 & sand / 42', parameters = duneParameters(seed);
  for (let i = 0; i < 100; i++) Math.random();
  assert.deepEqual(parameters, duneParameters(seed));
  const overrides = { morphology: 'star', horns: .7, cameraElevation: .55, palette: 'ink' };
  const before = { ...overrides };
  assert.deepEqual(resolveParameters(seed, overrides), { ...parameters, ...overrides });
  assert.deepEqual(overrides, before);
  for (const value of [{ mystery: 1 }, { horns: NaN }, { density: Infinity }, { morphology: 'cloud' }, { cameraElevation: 0 }, { palette: 'blue' }]) {
    assert.throws(() => resolveParameters(seed, value), RangeError);
  }
});

test('paper-inspired stoss and cross-crest profiles preserve their analytic shape and asymmetric slopes', () => {
  for (let i = 0; i <= 100; i++) {
    const q = i / 100;
    near(stossProfile(q, 3), Math.cos(Math.PI * q / 2) ** 3);
    near(stossProfile(-q, 3), stossProfile(q, 3));
    near(crestEnvelope(q), 1 - q * q);
    if (i) assert.ok(stossProfile(q, 3) < stossProfile(q - .01, 3));
  }
  assert.equal(stossProfile(1.5), 0);
  assert.equal(crestEnvelope(1.2), 0);
  const p = resolveParameters('analytic', { saturationLength: 30, stossExponent: 3 });
  const terrain = makeTerrain(straightRidge, p), H = 60;
  assert.ok(terrain.stossWidth(H) > terrain.leeWidth(H) * 2);
  assert.ok(terrain.stossWidth(5) >= 7 * p.saturationLength);
  near(H / terrain.leeWidth(H), Math.tan(p.slipAngle));
  for (const q of [.05, .2, .45, .8, .95]) {
    near(terrain.sample(-q * terrain.stossWidth(H), 0).height, H * stossProfile(q, 3));
    near(terrain.sample(q * terrain.leeWidth(H), 0).height, H * (1 - q));
  }
  const stronger = makeTerrain(straightRidge, { ...p, shearRatio: 4 });
  assert.ok(stronger.stossWidth(H) < terrain.stossWidth(H));
});

test('wind regimes produce downwind barchan horns, transverse/longitudinal ridges and joined star arms', () => {
  for (const morphology of fields) {
    const p = resolveParameters('ridge topology', { morphology, horns: .1, asymmetry: .4 });
    const { ridges, dunes, wind } = ridgeSkeletons('ridge topology', p);
    assert.ok(ridges.length >= 3);
    for (const dune of dunes) {
      const group = ridges.filter(ridge => ridge.dune === dune.id);
      if (morphology === 'star') {
        assert.ok(group.length >= 3 && group.length <= 5);
        for (const ridge of group) {
          assert.deepEqual(ridge.points[0], [...dune.center, dune.height]);
          near(ridge.points.at(-1)[2], 0);
        }
      } else if (morphology === 'barchan') {
        const points = group[0].points, center = points[(points.length - 1) / 2];
        for (const horn of [points[0], points.at(-1)]) {
          assert.ok((horn[0] - center[0]) * wind[0] + (horn[1] - center[1]) * wind[1] > 0, 'horns must point downwind even at asymmetric extremes');
          near(horn[2], 0);
        }
        near(center[2], dune.height);
      } else {
        const a = group[0].points[0], b = group[0].points.at(-1), dx = b[0] - a[0], dz = b[1] - a[1];
        const theta = morphology === 'linear' ? p.windAzimuth + Math.atan2(p.secondaryWind * Math.sin(p.windDivergence), 1 + p.secondaryWind * Math.cos(p.windDivergence)) : p.windAzimuth + Math.PI / 2;
        assert.ok(Math.abs((dx * Math.cos(theta) + dz * Math.sin(theta)) / Math.hypot(dx, dz)) > .98);
      }
    }
  }
});

test('bicubic surface normals match finite differences and camera projection preserves perspective', () => {
  const p = resolveParameters('normals', { morphology: 'barchan' });
  const terrain = makeTerrain(straightRidge, p), grid = terrainGrid(terrain, p, 80);
  for (let x = -220; x < 80; x += 7.3) for (let z = -150; z < 150; z += 31) {
    const s = grid.sample(x, z), epsilon = .001;
    const gx = (grid.sample(x + epsilon, z).height - grid.sample(x - epsilon, z).height) / (2 * epsilon);
    const gz = (grid.sample(x, z + epsilon).height - grid.sample(x, z - epsilon).height) / (2 * epsilon);
    near(s.gx, gx, 1e-5); near(s.gz, gz, 1e-5);
    near(Math.hypot(...s.normal), 1, 1e-10);
    assert.ok(s.normal[1] > 0 && s.height >= 0);
  }
  const camera = makeCamera(grid, { ...p, cameraAzimuth: 0, perspective: .45 });
  assert.ok(camera.project(100, 0, -300).perspectiveScale > camera.project(100, 0, 300).perspectiveScale);
  assert.ok(camera.project(0, 60, 0).y < camera.project(0, 0, 0).y);
  const orthographic = makeCamera(grid, { ...p, cameraAzimuth: 0, perspective: 0 });
  near(orthographic.project(100, 0, 300).perspectiveScale, 1, 1e-6);
});

test('depth visibility is independent of draw order and distinguishes hidden surfaces', () => {
  const square = (depth, shade) => [[200, 200], [500, 200], [500, 500], [200, 500]].map(([x, y]) => ({ x, y, depth, shade }));
  const vertices = [...square(20, .1), ...square(10, .4)];
  const cells = [{ indices: [0, 1, 2, 3] }, { indices: [4, 5, 6, 7] }];
  const first = depthBuffer(vertices, cells), reversed = depthBuffer(vertices, [...cells].reverse());
  assert.deepEqual(first.depths, reversed.depths); assert.deepEqual(first.shades, reversed.shades);
  assert.equal(first.visible({ x: 350, y: 350, depth: 10 }, .01), true);
  assert.equal(first.visible({ x: 350, y: 350, depth: 20 }, .01), false);
  assert.equal(first.visible({ x: -1, y: 350, depth: 1 }), false);
});

test('raster lighting uses reciprocal depth to interpolate perspective attributes', () => {
  const vertices = [
    { x: 0, y: 0, depth: 10, shade: .1, coverage: .2 },
    { x: 1414, y: 0, depth: 20, shade: .7, coverage: .9 },
    { x: 0, y: 1000, depth: 40, shade: .4, coverage: .5 },
  ];
  const buffer = depthBuffer(vertices, [{ indices: [0, 1, 2, 2] }], 10, 10);
  const u = .5, v = .25, w = .25;
  const depth = 1 / (u / 10 + v / 20 + w / 40);
  near(buffer.depths[22], depth);
  near(buffer.shades[22], depth * (u * .1 / 10 + v * .7 / 20 + w * .4 / 40), 1e-7);
  near(buffer.coverage[22], depth * (u * .2 / 10 + v * .9 / 20 + w * .5 / 40), 1e-7);
});

test('terrain casts shadows toward the lee of the light and retains a unit normal on flat ground', () => {
  const p = resolveParameters('sun', { lightAzimuth: 0, lightElevation: .3 });
  const flat = { sample: () => ({ height: 0, normal: [0, 1, 0] }) };
  near(sunlight(flat, p, 0, 0).diffuse, Math.sin(.3));
  assert.equal(sunlight(flat, p, 0, 0).shadow, 0);
  const hill = { sample: (x, z) => ({ height: 85 * Math.exp(-(((x - 90) / 30) ** 2) - (z / 100) ** 2), normal: [0, 1, 0] }) };
  assert.ok(sunlight(hill, p, 0, 0).shadow > .9);
  assert.equal(sunlight(hill, { ...p, lightAzimuth: Math.PI }, 0, 0).shadow, 0);
});

test('lighting smoothing follows sloping faces and never crosses a visibility break', () => {
  const width = 40, height = 40, shades = new Float32Array(width * height), depths = new Float64Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    depths[y * width + x] = x < 20 ? 100 : 200; shades[y * width + x] = x < 20 ? 0 : 1;
  }
  const broken = filterLighting({ shades, depths, width, height });
  for (let x = 6; x < 34; x++) near(broken[20 * width + x], x < 20 ? 0 : 1);
  shades.fill(0); shades[20 * width + 20] = 1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) depths[y * width + x] = 100 + 10 * x + 15 * y;
  const sloping = filterLighting({ shades, depths, width, height });
  assert.ok(sloping[24 * width + 20] > .001, 'a steep continuous face must use the wider lighting kernel');
  near(sloping[24 * width + 20], sloping[20 * width + 24], 1e-9);
  assert.ok(sloping[20 * width + 20] < .1);
});

test('filtered illumination normals preserve an analytic slope without changing terrain heights', () => {
  const p = resolveParameters('normal lighting');
  const normal = [-.3, 1, .2], length = Math.hypot(...normal);
  const grid = { dx: 8, dz: 8, sample: (x, z) => ({ height: 100 + .3 * x - .2 * z, normal: [0, 1, 0] }) };
  const before = grid.sample(24, 37).height, lit = sunlight(grid, p, 24, 37);
  for (let i = 0; i < 3; i++) near(lit.normal[i], normal[i] / length);
  near(Math.hypot(...lit.normal), 1);
  assert.equal(grid.sample(24, 37).height, before);
});

test('vectorized lighting preserves dark islands and bright holes under nonzero SVG fill', () => {
  const w = 90, h = 90, field = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const r = Math.hypot(x - 45, y - 45);
    field[y * w + x] = Math.max(0, 1 - Math.abs(r - 23) / 10);
  }
  const { loops } = shadeContours(field, w, h, .5, w, h);
  assert.equal(loops.length, 2);
  const winding = ([x, y]) => loops.reduce((total, points) => {
    let n = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1], side = (b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1]);
      if (a[1] <= y && b[1] > y && side > 0) n++;
      if (a[1] > y && b[1] <= y && side < 0) n--;
    }
    return total + n;
  }, 0);
  assert.equal(winding([45.5, 45.5]), 0, 'the bright center must remain a hole');
  assert.notEqual(winding([68.5, 45.5]), 0, 'the ring must remain filled');
  assert.equal(winding([4, 4]), 0);
});

function checkGeometry(scene, seed) {
  assert.ok(scene.paths.length > (scene.parameters.rippleDensity > 0 ? 20 : 3) && scene.paths.length < 6500, `${seed}: path count`);
  assert.ok(scene.metrics.visibleCrests > 0, `${seed}: no visible dune ridge`);
  for (const path of scene.paths) {
    assert.ok(!/NaN|Infinity/.test(path.d), seed);
    const numbers = path.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
    for (let i = 0; i < numbers.length; i += 2) {
      assert.ok(numbers[i] > 20 && numbers[i] < 1394, `${seed}: horizontal margin ${numbers[i]}`);
      assert.ok(numbers[i + 1] > 45 && numbers[i + 1] < 955, `${seed}: vertical margin ${numbers[i + 1]}`);
    }
  }
  for (const stroke of scene.lines) if (stroke.role === 'ripple') {
    for (let i = 1; i < stroke.points.length; i++) {
      const a = stroke.points[i - 1], b = stroke.points[i];
      assert.ok(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) <= 17, `${seed}: discontinuous ripple root`);
    }
  }
  for (const stroke of scene.lines) for (let i = 0; i < stroke.points.length; i += 4) {
    const point = stroke.points[i], surface = scene.grid.sample(point[0], point[2]);
    assert.ok(point[1] - surface.height >= 0 && point[1] - surface.height <= .51, `${seed}: floating texture`);
    const projected = scene.camera.project(...point);
    assert.ok(scene.visibility.visible(projected), `${seed}: hidden-line leak`);
  }
}

test('48 seeded dune fields are unique, bounded, visible and cover all four morphologies', { timeout: 240000 }, () => {
  const hashes = new Set(), morphologies = new Set();
  for (let i = 0; i < 48; i++) {
    const seed = `dunes-review-${String(i).padStart(2, '0')}`, scene = buildDunes(seed);
    checkGeometry(scene, seed);
    hashes.add(hash(scene.paths.map(path => path.d).join(''))); morphologies.add(scene.parameters.morphology);
    assert.ok(scene.metrics.rippleStrokes > 0, seed);
  }
  assert.equal(hashes.size, 48); assert.deepEqual([...morphologies].sort(), fields.toSorted());
});

test('extreme supported geometry, lighting and camera controls remain finite with true surface texture', { timeout: 180000 }, () => {
  const cases = [
    { morphology: 'barchan', horns: .1, asymmetry: .4, crestHeight: 95, relief: 1.55, cameraElevation: .22 },
    { morphology: 'barchan', horns: .85, asymmetry: -.4, crestLength: 170, density: 1.2, cameraElevation: .95 },
    { morphology: 'transverse', spacing: 175, curvature: .28, stossExponent: 1.8, shearRatio: 1.25, lightElevation: .22 },
    { morphology: 'transverse', spacing: 430, crestLength: 520, stossExponent: 4, shearRatio: 4, perspective: .5 },
    { morphology: 'linear', windAzimuth: Math.PI, windDivergence: 2.8, secondaryWind: 1, rippleWavelength: 5, rippleSlope: .35 },
    { morphology: 'linear', windDivergence: .1, secondaryWind: 0, perspective: 0, rippleDensity: 0, palette: 'ink' },
    { morphology: 'star', crestHeight: 22, relief: .55, saturationLength: 30, density: .4, lightAzimuth: Math.PI },
    { morphology: 'star', crestHeight: 95, relief: 1.55, cameraAzimuth: .65, windDivergence: 2.8, rippleWavelength: 24 },
  ];
  for (const [i, overrides] of cases.entries()) checkGeometry(buildDunes(`dune-extreme-${i}`, overrides), `extreme ${i}`);
});

test('low-angle visible texture also passes independent rays toward the camera eye', { timeout: 30000 }, () => {
  for (const morphology of ['barchan', 'star']) {
    const scene = buildDunes(`dune-eye-ray-${morphology}`, { morphology, cameraElevation: .22,
      perspective: .5, crestHeight: 95, relief: 1.55 });
    const p = scene.parameters, distance = scene.camera.distance;
    const eye = [-Math.sin(p.cameraAzimuth) * Math.cos(p.cameraElevation) * distance,
      Math.sin(p.cameraElevation) * distance, -Math.cos(p.cameraAzimuth) * Math.cos(p.cameraElevation) * distance];
    const points = scene.lines.flatMap(line => line.points), stride = Math.ceil(points.length / 280);
    let checked = 0, obstruction = 0;
    for (let i = 0; i < points.length; i += stride) {
      const point = points[i], ray = eye.map((value, j) => value - point[j]);
      const length = Math.hypot(...ray); ray.forEach((_, j) => ray[j] /= length);
      for (let t = 6; t < 1500; t += 4) {
        const x = point[0] + t * ray[0], y = point[1] + t * ray[1], z = point[2] + t * ray[2];
        if (x < scene.grid.x0 || x > scene.grid.x0 + (scene.grid.nx - 1) * scene.grid.dx
          || z < scene.grid.z0 || z > scene.grid.z0 + (scene.grid.nz - 1) * scene.grid.dz) break;
        obstruction = Math.max(obstruction, scene.grid.sample(x, z).height - y);
      }
      checked++;
    }
    assert.ok(checked > 200);
    // The 224-cell terrain and half-size visibility buffer approximate a
    // bicubic surface. Permit <2 world units (roughly a print pixel here),
    // while rejecting texture seen through a genuinely foreground ridge.
    assert.ok(obstruction < 2, `${morphology}: terrain obscures a visible stroke by ${obstruction}`);
  }
});

test('public generator and bundled classic worker reproduce identical SVG and parameters', { timeout: 30000 }, async () => {
  const seed = 'worker sand & 雨', painting = generateDunes(seed);
  assert.deepEqual(painting, generateDunes(seed));
  assert.equal(painting.mode, 'dunes'); assert.equal(painting.artRevision, 1);
  assert.equal(painting.whiteToAlpha, false); assert.ok(!painting.svg.includes('<image'));
  const folder = await mkdtemp(join(tmpdir(), 'painting-dune-worker-'));
  try {
    await prepare(pathToFileURL(`${folder}/`));
    const worker = new Worker(`
      const { parentPort, workerData } = require('node:worker_threads');
      globalThis.self = { postMessage: message => parentPort.postMessage(message) };
      require(workerData);
      parentPort.on('message', data => self.onmessage({ data }));
    `, { eval: true, workerData: join(folder, 'worker.js') });
    let received;
    try {
      received = await new Promise((resolve, reject) => {
        worker.once('message', resolve); worker.once('error', reject); worker.postMessage({ seed });
      });
    } finally { await worker.terminate(); }
    assert.equal(received.type, 'painting-ready');
    assert.equal(received.svg, painting.svg);
    assert.deepEqual(JSON.parse(JSON.stringify(received.parameters)), painting.parameters);
    assert.ok(received.generationMs > 0);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
