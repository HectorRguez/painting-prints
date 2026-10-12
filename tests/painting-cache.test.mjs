import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPaintingCache, pickUnseen, cacheEntry } from '../src/painting-cache.js';
const base = new URL('https://example.com/painting/');
const stock = Array.from({ length: 10 }, (_, i) => ({ artRevision: 2, mode: 'landscapes', seed: `landscapes-${i}`, width: 520, height: 320, asset: `landscapes/${i}.json.gz` }));
const store = () => {
  const data = new Map();
  return { get: async key => data.get(key), put: async (key, value) => data.set(key, structuredClone(value)) };
};
const options = storage => ({ storage, fetcher: async () => ({ ok: true, json: async () => ({ landscapes: stock }) }), random: () => .25 });

test('starter selection avoids repeats and the current seed, then reports exhaustion', async () => {
  const cache = createPaintingCache(base, options(store()));
  const seeds = [];
  for (let i = 0; i < 10; i++) seeds.push((await cache.next('landscapes', seeds.at(-1)))?.seed);
  assert.equal(new Set(seeds).size, 10);
  assert.ok(seeds.every(Boolean));
  assert.equal(await cache.next('landscapes', seeds.at(-1)), null);
  assert.equal(pickUnseen(stock, new Set(), 'landscapes-0', () => 0).seed, 'landscapes-1');
});

test('fresh paintings replace the oldest item and survive a new cache instance', async () => {
  const storage = store();
  const cache = createPaintingCache(base, options(storage));
  const fresh = { ...stock[0], seed: 'fresh', payload: new Blob(['source']) };
  await cache.remember(fresh);
  const saved = await storage.get('landscapes');
  assert.equal(saved.entries.length, 10);
  assert.equal(saved.entries.at(-1).seed, 'fresh');
  assert.ok(!saved.entries.some(entry => entry.seed === 'landscapes-0'));
  const reloaded = createPaintingCache(base, { ...options(storage), random: () => .999 });
  assert.equal((await reloaded.next('landscapes')).seed, 'fresh');
});

test('storage restrictions and a missing stock manifest still permit fresh generation', async () => {
  const storage = { get: async () => { throw new Error('private'); }, put: async () => { throw new Error('quota'); } };
  const cache = createPaintingCache(base, { storage, fetcher: async () => { throw new Error('offline'); } });
  assert.equal(await cache.next('landscapes'), null);
  const fresh = { ...stock[0], seed: 'fresh' };
  assert.equal((await cache.remember(fresh)).seed, 'fresh');
});

test('a partial saved cache is topped up from bundled paintings without duplicates', async () => {
  const storage = store();
  await storage.put('landscapes', { version: 1, entries: [stock[5], { ...stock[0], seed: 'saved-fresh' }] });
  const cache = createPaintingCache(base, options(storage));
  const seeds = [];
  for (let i = 0; i < 10; i++) seeds.push((await cache.next('landscapes'))?.seed);
  assert.equal(new Set(seeds).size, 10);
  assert.ok(seeds.includes('saved-fresh'));
  assert.ok(seeds.every(Boolean));
});

test('compressed cache restores the full source rather than exporting the preview', async () => {
  const painting = { mode: 'landscapes', seed: 'full', width: 520, height: 320, svg: '<svg>original vectors</svg>' };
  const entry = await cacheEntry(painting);
  const cache = createPaintingCache(base, options(store()));
  assert.deepEqual(await cache.resolve(entry), painting);
  await assert.rejects(cache.resolve({ ...entry, seed: 'different' }), /mismatch/);
});

test('bundled SVG originals load without any raster preview request', async () => {
  const painting = { mode: 'landscapes', seed: 'landscapes-0', svg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10"/></svg>' };
  const { payload } = await cacheEntry(painting);
  const requests = [];
  const cache = createPaintingCache(base, {
    storage: store(), random: () => 0,
    fetcher: async url => {
      requests.push(url.pathname);
      if (url.pathname.endsWith('manifest.json')) return { ok: true, json: async () => ({ landscapes: stock }) };
      return { ok: true, blob: async () => payload };
    },
  });
  const selected = await cache.next('landscapes');
  assert.deepEqual(await cache.resolve(selected), painting);
  assert.deepEqual(requests, ['/painting/cache/manifest.json', '/painting/cache/landscapes/0.json.gz']);
});

test('remembered stock landscapes pick up new pre-rendered previews after a deployment', async () => {
  const storage = store();
  const old = { mode: 'landscapes', artRevision: 2, seed: 'wide', asset: 'landscapes-v2/0.json.gz', inkOffset: { x: 0, y: 2 } };
  await storage.put('landscapes', { version: 1, latest: old.seed, entries: [old] });
  const updated = { ...old, previewAsset: 'landscapes-preview-v1/0.png' };
  const cache = createPaintingCache(base, { storage, fetcher: async () => ({ ok: true, json: async () => ({ landscapes: [updated] }) }) });
  assert.deepEqual(await cache.next('landscapes'), updated);
});

test('each style can reopen a prepared preview while retaining its complete export source', async () => {
  const storage = store();
  for (const mode of ['flowers', 'landscapes']) {
    const painting = { mode, artRevision: mode === 'flowers' ? 1 : 2, seed: 'ready-preview',
      ...(mode === 'flowers' ? { png: 'paper', transparentPng: 'ink' } : { svg: '<svg>vectors</svg>' }) };
    const type = 'image/png';
    const entry = { ...await cacheEntry(painting), previewBlob: new Blob(['ready'], { type }), inkOffset: { x: 1, y: -2 } };
    await createPaintingCache(base, options(storage)).remember(entry);
    const cache = createPaintingCache(base, options(storage));
    const restored = await cache.next(mode);
    assert.equal(restored.seed, painting.seed);
    assert.equal(await restored.previewBlob.text(), 'ready');
    assert.equal(restored.previewBlob.type, type);
    assert.deepEqual(restored.inkOffset, entry.inkOffset);
    assert.deepEqual(await cache.resolve(restored), painting);
  }
});

test('shared seeds bypass the last/random image and can find stock displaced by personal entries', async () => {
  const storage = store();
  const cache = createPaintingCache(base, options(storage));
  for (let i = 0; i < 10; i++) await cache.remember({ ...stock[0], seed: `personal-${i}` });
  assert.equal((await cache.find('landscapes', 'landscapes-0')).seed, 'landscapes-0');
  assert.equal((await cache.find('landscapes', 'personal-2')).seed, 'personal-2');
  assert.equal(await cache.find('landscapes', 'new-shared-seed'), null);
});

test('old SVG previews migrate without losing the latest seed or original source', async () => {
  const storage = store();
  const payload = new Blob(['original']);
  const entries = [{ ...stock[0], previewAsset: 'landscapes-preview-v1/0.svg', previewBlob: new Blob(['svg'], { type: 'image/svg+xml' }) },
    { ...stock[1], seed: 'personal', asset: undefined, payload, previewBlob: new Blob(['svg'], { type: 'image/svg+xml' }) }];
  await storage.put('landscapes', { version: 1, latest: 'personal', entries });
  const cache = createPaintingCache(base, { ...options(storage), fetcher: async () => ({ ok: true, json: async () => ({ landscapes: stock.map(entry => ({ ...entry, previewAsset: 'new.png' })) }) }) });
  const personal = await cache.next('landscapes');
  assert.equal(personal.seed, 'personal');
  assert.equal(await personal.payload.text(), 'original');
  assert.equal(personal.previewBlob, undefined);
  const bundled = await cache.find('landscapes', stock[0].seed);
  assert.equal(bundled.previewAsset, 'new.png');
  assert.equal(bundled.previewBlob, undefined);
});

test('outdated art cannot override current stock or be restored through a seed URL', async () => {
  for (const [mode, artRevision] of [['landscapes', 2]]) {
    const storage = store();
    const current = { mode, artRevision, seed: 'stock', asset: `${mode}/0.json.gz` };
    const stale = { ...current, artRevision: artRevision - 1 };
    await storage.put(mode, { version: 1, latest: 'obsolete', entries: [stale, { ...stale, seed: 'obsolete' }] });
    const cache = createPaintingCache(base, { storage,
      fetcher: async () => ({ ok: true, json: async () => ({ [mode]: [current] }) }) });
    assert.deepEqual(await cache.next(mode), current, mode);
    assert.deepEqual(await cache.find(mode, 'stock'), current, mode);
    assert.equal(await cache.find(mode, 'obsolete'), null, mode);
  }
});
