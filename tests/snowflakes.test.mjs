import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { hexLattice, directions, growSnowflake } from '../src/generators/snowflakes/growth.js';
import { snowflakeGeometry, generateSnowflake, crystalContours } from '../src/generators/snowflakes/generate.js';
import { artworkSvg } from '../src/artwork-svg.js';
import { cacheEntry, createPaintingCache } from '../src/painting-cache.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const seeds = Array.from({ length: 48 }, (_, i) => `snowflake-review-${String(i).padStart(3, '0')}`);

function assertSimpleOutlines(paths, seed) {
  const bins = new Map(), segments = [];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (const [loop, path] of paths.filter(path => path.role === 'outline').entries()) {
    for (let edge = 0; edge < path.points.length; edge++) {
      const a = path.points[edge], b = path.points[(edge + 1) % path.points.length];
      const current = { a, b, loop, edge, size: path.points.length };
      const candidates = new Set(), keys = [];
      for (let x = Math.floor(Math.min(a[0], b[0]) / 24); x <= Math.floor(Math.max(a[0], b[0]) / 24); x++) {
        for (let y = Math.floor(Math.min(a[1], b[1]) / 24); y <= Math.floor(Math.max(a[1], b[1]) / 24); y++) {
          const key = `${x},${y}`; keys.push(key);
          for (const id of bins.get(key) || []) candidates.add(id);
        }
      }
      for (const id of candidates) {
        const other = segments[id];
        if (other.loop === loop && (Math.abs(edge - other.edge) <= 1 || Math.abs(edge - other.edge) === current.size - 1)) continue;
        const crosses = cross(a, b, other.a) * cross(a, b, other.b) < -1e-8
          && cross(other.a, other.b, a) * cross(other.a, other.b, b) < -1e-8;
        assert.ok(!crosses, `${seed}: simplified outline crosses itself`);
      }
      for (const key of keys) { if (!bins.has(key)) bins.set(key, []); bins.get(key).push(segments.length); }
      segments.push(current);
    }
  }
}

test('circular vapor reservoir encloses every simulated site and its neighbors', () => {
  const { sites, neighbors, reservoirRadius } = hexLattice();
  assert.ok(reservoirRadius > 110);
  sites.forEach((site, id) => {
    if (!site.reservoir) for (let side = 0; side < 6; side++) {
      assert.ok(neighbors[id * 6 + side] >= 0, `Missing diffusion neighbor at ${site.q},${site.r}`);
    }
  });
});

test('48 seeds grow connected sixfold crystals with bounded, distinct vector geometry', { timeout: 180_000 }, () => {
  const { at, fieldRadius, sites, reservoirRadius } = hexLattice();
  const hashes = new Set(), masks = new Set(), habits = new Set();
  for (const seed of seeds) {
    const start = performance.now();
    const { crystal, paths } = snowflakeGeometry(seed);
    const occupied = new Set();
    for (let q = -fieldRadius; q <= fieldRadius; q++) for (let r = -fieldRadius; r <= fieldRadius; r++) {
      const id = at(q, r);
      if (id < 0 || crystal.born[id] < 0) continue;
      occupied.add(`${q},${r}`);
      assert.equal(crystal.born[at(-r, q + r)], crystal.born[id], `${seed}: rotational symmetry`);
      assert.equal(crystal.born[at(r, q)], crystal.born[id], `${seed}: reflected growth history`);
    }
    assert.ok(occupied.size > 500, `${seed}: sparse/unfinished crystal`);
    const reached = new Set(['0,0']), pending = [[0, 0]];
    while (pending.length) {
      const [q, r] = pending.pop();
      for (const [dq, dr] of directions) {
        const key = `${q + dq},${r + dr}`;
        if (occupied.has(key) && !reached.has(key)) { reached.add(key); pending.push([q + dq, r + dr]); }
      }
    }
    assert.equal(reached.size, occupied.size, `${seed}: detached crystal fragment`);
    assert.ok(crystal.radius < reservoirRadius - 18, `${seed}: crystal reached the vapor boundary`);
    assert.ok(crystal.radius >= crystal.parameters.targetRadius);
    assert.ok(crystal.steps < 12000);
    for (const path of paths) {
      assert.ok(path.points.length >= 2);
      for (const [x, y] of path.points) {
        assert.ok(Number.isFinite(x) && Number.isFinite(y));
        assert.ok(x >= 74 && x <= 926 && y >= 74 && y <= 926, `${seed}: clipped artwork`);
      }
    }
    const vertices = paths.filter(path => path.closed).flatMap(path => path.points);
    const pointKey = (x, y) => `${x.toFixed(5)},${y.toFixed(5)}`;
    const vertexSet = new Set(vertices.map(([x, y]) => pointKey(x, y)));
    for (const [x, y] of vertices) {
      const a = x - 500, b = y - 500;
      assert.ok(vertexSet.has(pointKey(500 + a / 2 - b * Math.sqrt(3) / 2, 500 + a * Math.sqrt(3) / 2 + b / 2)), `${seed}: outline lost sixfold symmetry`);
    }
    assertSimpleOutlines(paths, seed);
    const geometryHash = hash(JSON.stringify(paths));
    const maskHash = hash([...occupied].sort().join(';'));
    assert.ok(!hashes.has(geometryHash), `${seed}: duplicate drawing`);
    assert.ok(!masks.has(maskHash), `${seed}: duplicate crystal shape`);
    hashes.add(geometryHash); masks.add(maskHash); habits.add(crystal.parameters.habit);
    assert.ok(performance.now() - start < 10000, `${seed}: generation is too slow`);
    assert.ok(crystal.born.length === sites.length);
  }
  assert.equal(habits.size, 4);
});

test('seed strings reproduce every growth boundary and SVG byte', () => {
  for (const seed of ['snow 雪 & = / ? #', 'a'.repeat(256), '0', 'snowflake-review-017']) {
    assert.deepEqual(generateSnowflake(seed), generateSnowflake(seed));
  }
});

test('growth contours belong to the crystal rather than being detached decorations', () => {
  const crystal = growSnowflake('snowflake-review-009');
  const loops = crystalContours(crystal);
  assert.ok(loops.length >= 1);
  for (const loop of loops) {
    assert.ok(loop.length >= 6);
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      assert.ok(Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1]) - 1) < 1e-10, 'Broken hex-cell boundary');
    }
  }
});

test('fresh snowflakes round-trip through browser-cache payloads and SVG exports', async () => {
  const painting = generateSnowflake('snowflake-cache-and-export');
  const entry = await cacheEntry(painting);
  const data = new Map();
  const options = { storage: { get: async key => data.get(key), put: async (key, value) => data.set(key, value) },
    fetcher: async () => ({ ok: true, json: async () => ({}) }) };
  const base = new URL('https://example.test/painting/');
  const cache = createPaintingCache(base, options);
  assert.equal(await cache.next('snowflakes'), null);
  await cache.remember(entry);
  const reopened = createPaintingCache(base, options);
  assert.deepEqual(await reopened.resolve(await reopened.find('snowflakes', painting.seed)), painting);
  for (const background of [false, true]) {
    const svg = artworkSvg(painting, background);
    assert.ok(svg.includes('Snow Crystal Studies'));
    assert.ok(svg.includes(`Seed ${painting.seed}`));
    assert.equal(svg.includes('<rect'), background);
    assert.ok(!/NaN|Infinity|<image|<use/.test(svg));
  }
});

test('shipping worker returns the same seeded vectors as the pure generator', { timeout: 30_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'snowflake-worker-'));
  try {
    const { prepare } = await import('../src/generators/snowflakes/build.mjs');
    await mkdir(directory, { recursive: true });
    await prepare(pathToFileURL(directory + '/'));
    const source = await readFile(join(directory, 'worker.js'), 'utf8');
    let message;
    const context = vm.createContext({ performance, postMessage: data => { message = data; } });
    context.self = context;
    vm.runInContext(source, context);
    await context.onmessage({ data: { seed: 'shipping-snowflake' } });
    const expected = generateSnowflake('shipping-snowflake');
    assert.equal(message.type, 'painting-ready');
    assert.equal(message.mode, 'snowflakes');
    assert.equal(message.seed, expected.seed);
    assert.equal(message.svg, expected.svg);
    assert.equal(message.artRevision, 1);
    assert.ok(message.generationMs >= 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
