import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { randomSource } from '../src/generators/shared/port.js';
import { contourParameters, contourRanges, contourFamilies, terrainModel, terrainHeight, buildContours, generateContours } from '../src/generators/contours/generate.js';

function bilinear(scene, x, y) {
  const n = scene.parameters.resolution, gx = (x - 50) / 900 * (n - 1), gy = (y - 50) / 900 * (n - 1);
  const i = Math.min(n - 2, Math.floor(gx)), j = Math.min(n - 2, Math.floor(gy)), a = gx - i, b = gy - j;
  return scene.field[j * n + i] * (1 - a) * (1 - b) + scene.field[j * n + i + 1] * a * (1 - b)
    + scene.field[(j + 1) * n + i] * (1 - a) * b + scene.field[(j + 1) * n + i + 1] * a * b;
}
function winding(points, x, y) {
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j], b = points[i], side = (b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1]);
    if (a[1] <= y && b[1] > y && side > 0) sum++;
    if (a[1] > y && b[1] <= y && side < 0) sum--;
  }
  return sum;
}

test('48 terrains are unique, bounded true isolines with correct compound holes', { timeout: 45000 }, () => {
  const hashes = new Set(), families = new Set(), random = randomSource('terrain-topology-probes');
  let lagoons = 0, islands = 0;
  for (let i = 0; i < 48; i++) {
    const seed = `contours-review-${String(i).padStart(2, '0')}`, scene = buildContours(seed), art = generateContours(seed);
    hashes.add(createHash('sha256').update(art.svg).digest('hex')); families.add(scene.parameters.family);
    assert.ok(scene.metrics.landFraction > .02 && scene.metrics.landFraction < .65);
    assert.ok(scene.contours.length >= 12 && scene.contours.length < 500);
    assert.ok(art.svg.length < 650000 && !/NaN|Infinity|<image/.test(art.svg));
    lagoons += scene.metrics.lagoons; islands += scene.metrics.islands;
    for (const contour of scene.contours) for (const [x, y] of contour.points) {
      assert.ok(x > 60 && y > 60 && x < 940 && y < 940);
      assert.ok(Math.abs(bilinear(scene, x, y) - contour.level) < 1e-9, `${seed}: detached isoline`);
    }
    for (const index of [0, 5, 10]) {
      const contours = scene.contours.filter(c => c.index === index), level = contours[0]?.level;
      if (level === undefined) continue;
      for (let probe = 0; probe < 70; probe++) {
        const x = 60 + random() * 880, y = 60 + random() * 880, height = bilinear(scene, x, y);
        if (Math.abs(height - level) < .012) continue; // Polygonal contour approximation near the true curve.
        const occupied = contours.reduce((sum, c) => sum + winding(c.points, x, y), 0) !== 0;
        assert.equal(occupied, height > level, `${seed}: wrong fill topology at level${index}`);
      }
    }
  }
  assert.equal(hashes.size, 48); assert.deepEqual([...families].sort(), [...contourFamilies].sort());
  assert.ok(lagoons >= 3 && islands >= 55, 'review includes real holes and separated islands');
});

test('refining the height grid preserves terrain area and extrema', () => {
  for (const family of contourFamilies) {
    const a = buildContours(`refinement-${family}`, { family, resolution: 129 });
    const b = buildContours(`refinement-${family}`, { family, resolution: 257 });
    assert.ok(Math.abs(a.maximum - b.maximum) / b.maximum < .006);
    assert.ok(Math.abs(a.metrics.landFraction - b.metrics.landFraction) < .003);
    assert.equal(a.metrics.islands, b.metrics.islands);
  }
});

test('height fields are continuous, finite and smoothly vanish before the paper boundary', () => {
  for (const family of contourFamilies) {
    const p = contourParameters(`smooth-${family}`, { family }), model = terrainModel(`smooth-${family}`, p);
    for (let i = 0; i < 80; i++) {
      const theta = i * Math.PI / 40, x = Math.cos(theta) * .96, y = Math.sin(theta) * .96;
      assert.equal(terrainHeight(model, x * 1.01, y * 1.01), 0);
      assert.ok(terrainHeight(model, x * .999, y * .999) < .00001);
      const a = terrainHeight(model, x * .6, y * .6), b = terrainHeight(model, x * .6 + 1e-6, y * .6);
      assert.ok(Number.isFinite(a) && a >= 0 && Math.abs(a - b) < .0001);
    }
  }
});

test('seed and controls reproduce the same geometry without affecting ambient random state', () => {
  const seed = 'map 雪 & / ? 42', first = generateContours(seed);
  for (let i = 0; i < 50; i++) Math.random();
  assert.deepEqual(generateContours(seed), first);
  const parameters = contourParameters(seed), model = terrainModel(seed, parameters);
  for (const key of ['spread', 'peakWidth', 'roughness', 'warp', 'rotation', 'valleyDepth']) {
    const a = terrainModel(seed, contourParameters(seed, { [key]: (contourRanges[key][0] + contourRanges[key][1]) / 2 }));
    const b = terrainModel(seed, contourParameters(seed, { [key]: (contourRanges[key][0] + contourRanges[key][1]) / 2 + 1e-5 }));
    const change = Math.abs(terrainHeight(a, .2, -.3) - terrainHeight(b, .2, -.3));
    assert.ok(change > 1e-12 && change < .001, `${key}: smooth control response`);
  }
  assert.equal(model.parameters, parameters);
  assert.throws(() => generateContours(seed, { peakWidth: 0 }), /peakWidth/);
  assert.throws(() => generateContours(seed, { resolution: 201.1 }), /integer/);
  assert.throws(() => generateContours(seed, { octaves: Infinity }), /octaves/);
  assert.throws(() => generateContours(seed, { unknown: 1 }), /Unknown/);
});

test('joint boundary controls produce bounded, nonblank contours without silent parameter clamping', () => {
  for (const family of contourFamilies) for (const t of [0, 1]) {
    const overrides = { family, peakCount: t ? 12 : 3, spread: t ? .74 : .25, peakWidth: t ? .1 : .3,
      elongation: t ? 2.3 : 1, roughness: .3, warp: .13, frequency: 3, lacunarity: 2.2,
      hurst: .55, octaves: 4, levels: t ? 28 : 10, seaLevel: t ? .38 : .12, valleyDepth: .65 };
    const scene = buildContours(`boundary-${family}-${t}`, overrides);
    for (const [key, value] of Object.entries(overrides)) assert.equal(scene.parameters[key], value);
    assert.ok(scene.contours.length > 9);
    assert.ok(scene.metrics.landFraction > .003 && scene.metrics.landFraction < .7);
    for (const contour of scene.contours) assert.ok(contour.points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x > 50 && x < 950 && y > 50 && y < 950));
  }
});
