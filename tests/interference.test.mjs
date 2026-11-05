import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { interferenceParameters, interferenceModel, interferenceFamilies, interferenceRanges,
  transformCarrier, inverseCarrier, carrierIndex, carrierRing, buildInterference, generateInterference } from '../src/generators/interference/generate.js';

const area = points => Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

test('composed carrier maps are invertible and preserve area even at maximum warp', () => {
  for (let i = 0; i < 8; i++) {
    const p = interferenceParameters(`map-${i}`, { warp: 75, warpFrequency: 2.5, aspect: i % 2 ? .5 : 1.8 });
    for (const source of interferenceModel(`map-${i}`, p)) for (let y = -300; y <= 300; y += 100) for (let x = -300; x <= 300; x += 100) {
      const transformed = transformCarrier(source, x, y), inverse = inverseCarrier(source, ...transformed);
      assert.ok(Math.hypot(inverse[0] - x, inverse[1] - y) < 1e-10);
      const e = .0001, px = transformCarrier(source, x + e, y), py = transformCarrier(source, x, y + e);
      const determinant = ((px[0] - transformed[0]) * (py[1] - transformed[1]) - (px[1] - transformed[1]) * (py[0] - transformed[0])) / e ** 2;
      assert.ok(Math.abs(determinant - 1) < .0001, 'shears must not collapse or fold the plane');
    }
  }
});

test('ring tessellation converges to the area-preserving analytic carrier', () => {
  const p = interferenceParameters('convergence', { warp: 65, warpFrequency: 2.4 });
  const source = interferenceModel('convergence', p)[0], index = 25;
  const radius = (index + source.phase) * source.pitch, exact = Math.PI * radius ** 2;
  const coarse = carrierRing(source, index, .5), fine = carrierRing(source, index, .08);
  assert.ok(fine.length > coarse.length);
  assert.ok(Math.abs(area(fine) - exact) < Math.abs(area(coarse) - exact));
  assert.ok(Math.abs(area(fine) - exact) / exact < .001);
  for (const point of fine) assert.ok(Math.abs(carrierIndex(source, ...point) - index) < 1e-10);
});

test('unwarped circular carriers produce the predicted hyperbolic difference-index fringes', () => {
  const common = { radius: 300, pitch: 8, phase: 0, aspect: 1, angle: 0,
    warpX: 0, warpY: 0, frequencyX: 1, frequencyY: 1, phaseX: 0, phaseY: 0, y: 0 };
  const left = { ...common, x: -100 }, right = { ...common, x: 100 };
  const a = 32, b = Math.sqrt(100 ** 2 - a ** 2);
  for (let t = -.9; t <= .9; t += .1) {
    const x = a * Math.cosh(t), y = b * Math.sinh(t);
    const fringe = carrierIndex(left, x, y) - carrierIndex(right, x, y);
    assert.ok(Math.abs(fringe - 2 * a / common.pitch) < 1e-12);
  }
});

test('48 seeded compositions are distinct, bounded and remain on their analytic carriers', () => {
  const hashes = new Set(), families = new Set();
  for (let i = 0; i < 48; i++) {
    const seed = `interference-review-${String(i).padStart(2, '0')}`, scene = buildInterference(seed);
    const art = generateInterference(seed);
    hashes.add(createHash('sha256').update(art.svg).digest('hex')); families.add(scene.parameters.family);
    assert.ok(scene.rings.length >= 40 && scene.rings.length <= 230);
    assert.ok(scene.metrics.minimumPitch > 3, 'nominal radial pitch after fitting');
    assert.ok(art.svg.length < 900000 && !/NaN|Infinity/.test(art.svg));
    for (const ring of scene.rings) for (const point of ring.points) {
      assert.ok(Math.abs(carrierIndex(scene.sources[ring.source], ...point) - ring.index) < 1e-9);
      const x = scene.fit.x + point[0] * scene.fit.scale, y = scene.fit.y + point[1] * scene.fit.scale;
      assert.ok(x >= 69.9 && y >= 69.9 && x <= 930.1 && y <= 930.1);
    }
  }
  assert.equal(hashes.size, 48); assert.deepEqual([...families].sort(), [...interferenceFamilies].sort());
});

test('controls are reproducible, continuously alter geometry and reject invalid requests', () => {
  const seed = 'moire 雪 & / 42', expected = generateInterference(seed);
  for (let i = 0; i < 50; i++) Math.random();
  assert.deepEqual(generateInterference(seed), expected);
  const base = interferenceParameters(seed);
  for (const name of ['separation', 'aspect', 'rotation', 'warp', 'detune', 'phase']) {
    const low = interferenceRanges[name][0], high = interferenceRanges[name][1];
    const a = buildInterference(seed, { [name]: (low + high) / 2 });
    const b = buildInterference(seed, { [name]: (low + high) / 2 + (high - low) * .0001 });
    const ca = a.rings.find(r => r.source === 1 && r.index === 10).points[0];
    const cb = b.rings.find(r => r.source === 1 && r.index === 10).points[0];
    const delta = Math.hypot(ca[0] - cb[0], ca[1] - cb[1]);
    assert.ok(delta > 1e-8 && delta < .5, `${name}: nearby controls must give nearby curves`);
  }
  assert.equal(base.sourceCount, interferenceParameters(seed).sourceCount);
  assert.throws(() => generateInterference(seed, { warp: Infinity }), /warp/);
  assert.throws(() => generateInterference(seed, { sourceCount: 2.5 }), /integer/);
  assert.throws(() => generateInterference(seed, { radius: -1 }), /radius/);
  assert.throws(() => generateInterference(seed, { unknown: 1 }), /Unknown/);
});

test('joint parameter extrema stay finite and printable without clamping requested controls', () => {
  for (const family of interferenceFamilies) for (const t of [0, 1]) {
    const overrides = { family, radius: t ? 360 : 220, pitch: t ? 5 : 12, warp: 75,
      warpFrequency: 2.5, aspect: t ? .5 : 1.8, detune: t ? .9 : 1.12, sourceCount: 3,
      lineWidth: 2.5, separation: t ? 40 : 285, layoutJitter: 1, radiusVariation: .3 };
    const scene = buildInterference(`extreme-${family}-${t}`, overrides);
    for (const [key, value] of Object.entries(overrides)) assert.equal(scene.parameters[key], value);
    const expected = scene.sources.reduce((sum, source) => sum + Math.floor(source.radius / source.pitch - source.phase), 0);
    assert.equal(scene.paths.length, expected, 'every complete carrier ring is emitted');
    assert.ok(scene.paths.length >= 30 && scene.paths.length <= 315);
    assert.ok(scene.paths.every(p => !/NaN|Infinity/.test(p.d)));
  }
});
