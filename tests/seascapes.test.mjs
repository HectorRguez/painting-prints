import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepare } from '../src/generators/seascapes/build.mjs';
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
  assert.equal(first.artRevision, 5);
  assert.equal(first.whiteToAlpha, true);
  assert.equal(first.previewWidth, 3200);
  assert.equal(first.height, 800);
  assert.match(first.svg, /width="3200" height="800"/);
  assert.equal(first.width / first.height, Math.SQRT2);
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
  let largeScenes = 0, calmScenes = 0, emptyScenes = 0, totalBoats = 0;
  let minRoughness = Infinity, maxRoughness = -Infinity;
  for (let i = 0; i < 48; i++) {
    const seed = `seascape-review-${String(i).padStart(2, '0')}`;
    const scene = buildSeascape(seed);
    const svg = generateSeascape(seed).svg;
    hashes.add(createHash('sha256').update(svg).digest('hex'));
    assert.ok(!/NaN|Infinity|<image|<script/.test(svg), seed);
    assert.ok(scene.paths.length > 150 && scene.paths.length < 2200, seed);
    assert.ok(svg.length < 2000000, seed);
    assert.ok(scene.boats.length >= 0 && scene.boats.length <= 4, seed);
    minRoughness = Math.min(minRoughness, scene.sea.roughness);
    maxRoughness = Math.max(maxRoughness, scene.sea.roughness);
    counts.add(scene.boats.length);
    regimes.add(scene.sea.regime); arrangements.add(scene.arrangement);
    scene.crests.forEach(crest => shapes.add(crest.shape));
    const maximumCrest = Math.max(...scene.crests.map(crest => crest.amplitude));
    if (scene.sea.regime === 'breakers') {
      assert.ok(maximumCrest >= 145, `${seed}: dramatic waves must be genuinely large`);
      assert.equal(scene.crests.filter(patch => patch.shape === 'breaker').length <= 1, true, 'do not stack duplicate curls');
      for (const boat of scene.boats) {
        assert.ok(['skiff', 'sampan', 'fishing'].includes(boat.kind), seed + ': storm working boat');
        assert.ok(boat.length < 130, seed + ': storm vessel must remain small');
      }
      largeScenes++;
    }
    if (scene.sea.regime === 'calm') {
      assert.ok(maximumCrest < 25, `${seed}: calm sea must remain calm`);
      calmScenes++;
    }
    if (!scene.boats.length) emptyScenes++;
    totalBoats += scene.boats.length;
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
      const printLeft = (scene.sea.width - scene.sea.printWidth) / 2;
      assert.ok(boat.bounds.left > printLeft + 45 && boat.bounds.right < printLeft + scene.sea.printWidth - 45, seed + ': vessel must fit the central print crop');
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
  assert.ok(counts.has(0) && counts.has(1) && counts.has(2) && counts.has(3));
  assert.ok(totalBoats / 48 >= 1 && totalBoats / 48 <= 2, 'default fleet should average one to two vessels');
  assert.deepEqual([...headings].sort(), [-1, 1]);
  assert.ok(minRoughness < 0.3 && maxRoughness > 1.6, 'batch must cover calm and large seas');
  assert.deepEqual([...regimes].sort(), ['breakers', 'calm', 'rolling swell', 'wind sea']);
  assert.ok(['breaker', 'chop', 'ripple', 'shoulder', 'swell'].every(shape => shapes.has(shape)));
  assert.equal(arrangements.size, 4);
  assert.ok(largeScenes >= 8 && calmScenes >= 8 && emptyScenes >= 4, 'batch must show distinct sea states and intentional empty seas');
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


test('scene controls preserve other seeded parameters and enforce sparse fleet distributions', () => {
  const seed = 'controlled open water', base = seaParameters(seed), overrides = { roughness: .3, boatCount: 0 };
  const changed = seaParameters(seed, overrides);
  for (const name of ['direction', 'steepness', 'horizon', 'wind', 'texture']) assert.equal(base[name], changed[name]);
  assert.equal(buildSeascape(seed, overrides).boats.length, 0);
  assert.equal(buildSeascape(seed, { regime: 'calm', boatCount: 3, boatScale: .7 }).boats.length, 3);
  assert.deepEqual(overrides, { roughness: .3, boatCount: 0 });
  for (const value of [null, [], { mystery: 1 }, { boatCount: 8 }, { boatCount: 1.5 }, { roughness: Infinity },
    { regime: 'tsunami' }, { wind: 0 }, { breaker: { curl: 3 } }]) assert.throws(() => seaParameters(seed, value), RangeError);
  let total = 0, empty = 0, four = 0;
  for (let i = 0; i < 512; i++) {
    const count = seaParameters('fleet-distribution-' + i).boatCount;
    total += count; empty += count === 0; four += count === 4;
  }
  assert.ok(total / 512 > 1.15 && total / 512 < 1.8);
  assert.ok(empty / 512 > .1 && empty / 512 < .26);
  assert.ok(four / 512 < .05);
});


test('scene extremes keep visible geometry finite and inside print margins', () => {
  const cases = [
    { regime: 'calm', roughness: .15, steepness: .1, boatCount: 0 },
    { regime: 'wind sea', roughness: 2, steepness: .62, direction: .9, horizon: 240, boatCount: 4, boatScale: 1.2 },
    { regime: 'rolling swell', roughness: 1.9, direction: -.9, horizon: 370, wind: -1, boatCount: 1 },
    { regime: 'breakers', direction: .9, breaker: { curl: .45, crestPosition: -.14, overhang: .09, lipDrop: .22,
      shoulderLift: .2, foamScale: 1.3, foamMarks: 6, flowLines: 5 } },
    { regime: 'breakers', breaker: { curl: 0, crestPosition: .06, overhang: .02, lipDrop: .06,
      shoulderLift: .02, foamScale: .6, foamMarks: 0, flowLines: 1 } },
    { regime: 'breakers', boatCount: 0, wind: -1, horizon: 240, roughness: 2, steepness: .62,
      breaker: { flowSpread: 1.2, foamScale: 1.3 } },
  ];
  for (const [index, overrides] of cases.entries()) {
    const scene = buildSeascape('sea-stress-' + index + '-00', overrides);
    for (const path of scene.paths) {
      assert.ok(!/NaN|Infinity/.test(path.d));
      const values = path.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
      for (let i = 0; i < values.length; i += 2) {
        assert.ok(values[i] > 20 && values[i] < scene.sea.width - 20, 'stress ' + index + ': horizontal margin');
        assert.ok(values[i + 1] > 45 && values[i + 1] < 955, 'stress ' + index + ': vertical margin');
      }
    }
  }
});

test('bundled classic worker returns revision5 SVG and parameters identical to direct generation', { timeout: 20000 }, async () => {
  const seed = 'worker sea & waves 雨', painting = generateSeascape(seed);
  const folder = await mkdtemp(join(tmpdir(), 'painting-sea-worker-'));
  try {
    await prepare(pathToFileURL(folder + '/'));
    const worker = new Worker(`
      const { parentPort, workerData } = require('node:worker_threads');
      globalThis.self = { postMessage: message => parentPort.postMessage(message) };
      require(workerData);
      parentPort.on('message', data => self.onmessage({ data }));
    `, { eval: true, workerData: join(folder, 'worker.js') });
    let result;
    try {
      result = await new Promise((resolve, reject) => {
        worker.once('message', resolve); worker.once('error', reject); worker.postMessage({ seed });
      });
    } finally { await worker.terminate(); }
    assert.equal(result.type, 'painting-ready'); assert.equal(result.artRevision, 5);
    assert.equal(result.svg, painting.svg); assert.deepEqual(result.parameters, painting.parameters);
  } finally { await rm(folder, { recursive: true, force: true }); }
});


test('panorama contains independently placed side water and a composed center print region', () => {
  for (let i = 0; i < 48; i++) {
    const seed = `seascape-review-${String(i).padStart(2, '0')}`;
    const scene = buildSeascape(seed), painting = generateSeascape(seed);
    const left = (scene.sea.width - scene.sea.printWidth) / 2, right = left + scene.sea.printWidth;
    const groups = [scene.crests.filter(p => p.x < left), scene.crests.filter(p => p.x >= left && p.x <= right), scene.crests.filter(p => p.x > right)];
    for (const group of groups) assert.ok(group.length > 10, `${seed}: side water and center must all have geometry`);
    const signatures = groups.map(group => group.map(p => `${p.length.toFixed(3)}:${p.phase.toFixed(3)}`).sort().join('|'));
    assert.equal(new Set(signatures).size, 3, 'Side water must not repeat the center panel');
    const centerMajor = groups[1].filter(p => p.major);
    assert.ok(centerMajor.length >= 1, 'Every center crop has a deliberate major wave');
    const panorama = artworkSvg(painting, true, true), crop = artworkSvg(painting, true);
    assert.match(panorama, /width="3200" height="800"/);
    assert.ok(!panorama.includes('transform="translate('));
    assert.ok(crop.includes(`translate(${-(3200 - 800 * Math.SQRT2) / 2} 0)`));
    const points = [...painting.svg.matchAll(/ d="([^"]+)"/g)].flatMap(match => match[1].match(/-?\d+(?:\.\d+)?/g).map(Number));
    const xs = points.filter((_, index) => index % 2 === 0), ys = points.filter((_, index) => index % 2 === 1);
    assert.ok(Math.min(...xs) < 240 && Math.max(...xs) > 2960, 'Output fills the actual panoramic source');
    assert.ok(Math.min(...ys) > 30 && Math.max(...ys) < 770, 'Source retains vertical print margins');
  }
});
