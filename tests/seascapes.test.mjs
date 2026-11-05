import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildSeascape, generateSeascape, seaParameters, seaSurface } from '../src/generators/seascapes/generate.js';
import { artworkSvg } from '../src/artwork-svg.js';
import { cacheEntry, createPaintingCache } from '../src/painting-cache.js';
import { defaultSettings } from '../src/export-settings.js';
import { pageFromPath, pageUrl } from '../src/pages.js';

test('seascapes reproduce a seed without depending on ambient random state', () => {
  const first = generateSeascape('sea 雨 & boats / 42');
  for (let i = 0; i < 200; i++) Math.random();
  const second = generateSeascape('sea 雨 & boats / 42');
  assert.deepEqual(first, second);
  assert.equal(first.mode, 'seascapes');
  assert.equal(first.artRevision, 2);
  assert.equal(first.whiteToAlpha, true);
  assert.equal(first.width / first.height, 1.414);
  assert.notEqual(first.svg, generateSeascape('sea 雨 & boats / 43').svg);
});

test('Gerstner surface has no overturning, discontinuities or failed coordinate inversion', () => {
  for (let i = 0; i < 64; i++) {
    const sea = seaParameters(`surface-${i}`);
    const steepness = sea.waves.reduce((sum, wave) => sum + wave.k * wave.lateral, 0);
    assert.ok(steepness < 0.63);
    for (const depth of [0, 0.1, 0.35, 0.7, 1]) {
      for (let x = 30; x < sea.width; x += 29) {
        const point = seaSurface(sea, x, depth);
        assert.ok(Math.abs(point.x - x) < 1e-7, `${i}: inaccurate surface inversion`);
        assert.ok(point.dxdu > 0.06, `${i}: overturning surface`);
        assert.ok(Number.isFinite(point.y) && Number.isFinite(point.slope));
        const near = seaSurface(sea, x + 0.001, depth);
        assert.ok(Math.abs((near.y - point.y) / 0.001 - point.slope) < 0.005, 'surface tangent must match the drawn field');
      }
    }
  }
});

test('48 review seeds have unique finite drawings, clear margins and non-colliding floating boats', { timeout: 30000 }, () => {
  const hashes = new Set(), kinds = new Set(), counts = new Set(), headings = new Set();
  const regimes = new Set(), shapes = new Set(), arrangements = new Set();
  let largeScenes = 0, calmScenes = 0, fleetScenes = 0;
  let minRoughness = Infinity, maxRoughness = -Infinity;
  for (let i = 0; i < 48; i++) {
    const seed = `seascape-review-${String(i).padStart(2, '0')}`;
    const scene = buildSeascape(seed);
    const svg = generateSeascape(seed).svg;
    hashes.add(createHash('sha256').update(svg).digest('hex'));
    assert.ok(!/NaN|Infinity|<image|<script/.test(svg), seed);
    assert.ok(scene.paths.length > 150 && scene.paths.length < 1000, seed);
    assert.ok(svg.length < 900000, seed);
    assert.ok(scene.boats.length >= 2 && scene.boats.length <= 8, seed);
    minRoughness = Math.min(minRoughness, scene.sea.roughness);
    maxRoughness = Math.max(maxRoughness, scene.sea.roughness);
    counts.add(scene.boats.length);
    regimes.add(scene.sea.regime); arrangements.add(scene.arrangement);
    scene.crests.forEach(crest => shapes.add(crest.shape));
    const maximumCrest = Math.max(...scene.crests.map(crest => crest.amplitude));
    if (scene.sea.regime === 'breakers') {
      assert.ok(maximumCrest >= 160, `${seed}: dramatic waves must be genuinely large`);
      assert.equal(scene.crests.filter(patch => patch.shape === 'breaker').length <= 1, true, 'do not stack duplicate curls');
      largeScenes++;
    }
    if (scene.sea.regime === 'calm') {
      assert.ok(maximumCrest < 25, `${seed}: calm sea must remain calm`);
      calmScenes++;
    }
    if (scene.boats.length >= 6) fleetScenes++;
    for (const path of scene.paths) {
      const numbers = path.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
      assert.equal(numbers.length % 2, 0, seed);
      for (let j = 0; j < numbers.length; j += 2) {
        assert.ok(numbers[j] > 20 && numbers[j] < scene.sea.width - 20, `${seed}: horizontal clipping`);
        assert.ok(numbers[j + 1] > 45 && numbers[j + 1] < scene.sea.height - 45, `${seed}: vertical clipping`);
      }
    }
    for (const [index, boat] of scene.boats.entries()) {
      kinds.add(boat.kind); headings.add(boat.heading);
      const water = seaSurface(scene.sea, boat.x, boat.depth);
      assert.equal(boat.y, water.y, `${seed}: detached boat`);
      assert.ok(Math.abs(boat.angle) <= 0.18, `${seed}: excessive roll`);
      for (const path of scene.paths.slice(...boat.pathRange)) {
        const values = path.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
        for (let j = 0; j < values.length; j += 2) {
          assert.ok(values[j] >= boat.bounds.left && values[j] <= boat.bounds.right
            && values[j + 1] >= boat.bounds.top && values[j + 1] <= boat.bounds.bottom,
          `${seed}: ${boat.kind} extends beyond its collision bounds`);
        }
      }
      for (const crest of scene.crests.filter(crest => crest.depth > boat.depth)) {
        assert.ok(crest.bounds.right <= boat.bounds.left - 4 || crest.bounds.left >= boat.bounds.right + 4
          || crest.bounds.top >= boat.y + boat.length * 0.012 || crest.bounds.bottom <= boat.bounds.top,
        `${seed}: a foreground crest cuts through a vessel`);
      }
      for (const other of scene.boats.slice(index + 1)) {
        const a = boat.bounds, b = other.bounds;
        assert.ok(a.right + 23 <= b.left || b.right + 23 <= a.left
          || a.bottom + 21 <= b.top || b.bottom + 21 <= a.top, `${seed}: overlapping vessels`);
      }
    }
  }
  assert.equal(hashes.size, 48);
  assert.deepEqual([...kinds].sort(), ['cutter', 'fishing', 'lugger', 'sail', 'sampan', 'skiff']);
  assert.deepEqual([...counts].sort(), [2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...headings].sort(), [-1, 1]);
  assert.ok(minRoughness < 0.3 && maxRoughness > 1.6, 'batch must cover calm and large seas');
  assert.deepEqual([...regimes].sort(), ['breakers', 'calm', 'rolling swell', 'wind sea']);
  assert.deepEqual([...shapes].sort(), ['breaker', 'chop', 'ripple', 'shoulder', 'spilling', 'swell']);
  assert.equal(arrangements.size, 4);
  assert.ok(largeScenes >= 8 && calmScenes >= 8 && fleetScenes >= 12, 'batch must show distinct sea states and larger fleets');
});

test('fresh seascapes persist without stock assets and preserve vector exports and shared URLs', async () => {
  const painting = generateSeascape('shared sea & boats');
  const base = new URL('https://example.test/painting/');
  const saved = new Map();
  const options = {
    storage: { get: async mode => saved.get(mode), put: async (mode, value) => saved.set(mode, value) },
    fetcher: async () => ({ ok: true, json: async () => ({}) }),
  };
  const cache = createPaintingCache(base, options);
  assert.equal(await cache.next('seascapes'), null);
  await cache.remember(await cacheEntry(painting));
  const reloaded = createPaintingCache(base, options);
  const entry = await reloaded.next('seascapes');
  assert.deepEqual(await reloaded.resolve(entry), painting);
  assert.equal((await reloaded.find('seascapes', painting.seed)).seed, painting.seed);
  const url = pageUrl('seascapes', base, painting.seed);
  assert.equal(url.searchParams.get('seed'), painting.seed);
  assert.equal(pageFromPath(url.pathname, base.pathname), 'seascapes');
  assert.equal(defaultSettings('seascapes').orientation, 'landscape');
  for (const background of [false, true]) {
    const svg = artworkSvg(painting, background);
    assert.ok(svg.includes('Sea and Small Boats'));
    assert.ok(svg.includes('transparent-ink'));
    assert.ok(svg.includes('shared sea &amp; boats'));
    assert.ok(!svg.includes('<image'));
    assert.equal(svg.includes('<rect'), background);
  }
});
