import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPaintingCache, pickUnseen, retainPainting, cacheEntry } from '../src/painting-cache.js';
const base = new URL('https://example.com/painting/');
const stock = Array.from({ length: 10 }, (_, i) => ({ artRevision: 2, mode: 'fish', seed: `fish-${i}`, width: 520, height: 320, asset: `fish/${i}.json.gz` }));
const store = () => {
  const data = new Map();
  return { get: async key => data.get(key), put: async (key, value) => data.set(key, structuredClone(value)) };
};
const options = storage => ({ storage, fetcher: async () => ({ ok: true, json: async () => ({ fish: stock }) }), random: () => .25 });

test('ten distinct cached pictures are served before fresh generation is needed', async () => {
  const cache = createPaintingCache(base, options(store()));
  const seeds = [];
  for (let i = 0; i < 10; i++) seeds.push((await cache.next('fish', seeds.at(-1)))?.seed);
  assert.equal(new Set(seeds).size, 10);
  assert.ok(seeds.every(Boolean));
  assert.equal(await cache.next('fish', seeds.at(-1)), null);
  assert.equal(pickUnseen(stock, new Set(), 'fish-0', () => 0).seed, 'fish-1');
});

test('fresh paintings replace the oldest item and survive a new cache instance', async () => {
  const storage = store();
  const cache = createPaintingCache(base, options(storage));
  const fresh = { ...stock[0], seed: 'fresh', payload: new Blob(['source']) };
  await cache.remember(fresh);
  const saved = await storage.get('fish');
  assert.equal(saved.entries.length, 10);
  assert.equal(saved.entries.at(-1).seed, 'fresh');
  assert.ok(!saved.entries.some(entry => entry.seed === 'fish-0'));
  const reloaded = createPaintingCache(base, { ...options(storage), random: () => .999 });
  assert.equal((await reloaded.next('fish')).seed, 'fresh');
  assert.equal(retainPainting(saved.entries, fresh).length, 10);
});

test('storage restrictions and a missing stock manifest still permit fresh generation', async () => {
  const storage = { get: async () => { throw new Error('private'); }, put: async () => { throw new Error('quota'); } };
  const cache = createPaintingCache(base, { storage, fetcher: async () => { throw new Error('offline'); } });
  assert.equal(await cache.next('fish'), null);
  const fresh = { ...stock[0], seed: 'fresh' };
  assert.equal((await cache.remember(fresh)).seed, 'fresh');
});

test('a partial saved cache is topped up from bundled paintings without duplicates', async () => {
  const storage = store();
  await storage.put('fish', { version: 1, entries: [stock[5], { ...stock[0], seed: 'saved-fresh' }] });
  const cache = createPaintingCache(base, options(storage));
  const seeds = [];
  for (let i = 0; i < 10; i++) seeds.push((await cache.next('fish'))?.seed);
  assert.equal(new Set(seeds).size, 10);
  assert.ok(seeds.includes('saved-fresh'));
  assert.ok(seeds.every(Boolean));
});

test('compressed cache restores the full source rather than exporting the preview', async () => {
  const painting = { mode: 'fish', seed: 'full', width: 520, height: 320, svg: '<svg>original vectors</svg>' };
  const entry = await cacheEntry(painting);
  const cache = createPaintingCache(base, options(store()));
  assert.deepEqual(await cache.resolve(entry), painting);
  await assert.rejects(cache.resolve({ ...entry, seed: 'different' }), /mismatch/);
  assert.equal('preview' in entry, false);
});

test('older framed fish in browser storage cannot replace the unframed stock', async () => {
  const storage = store();
  await storage.put('fish', { version: 1, entries: stock.map(entry => ({ ...entry, artRevision: 1 })) });
  const cache = createPaintingCache(base, options(storage));
  for (let i = 0; i < 10; i++) assert.equal((await cache.next('fish')).artRevision, 2);
});


test('bundled SVG originals load without any raster preview request', async () => {
  const painting = { mode: 'fish', seed: 'fish-0', svg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10"/></svg>' };
  const { payload } = await cacheEntry(painting);
  const requests = [];
  const cache = createPaintingCache(base, {
    storage: store(), random: () => 0,
    fetcher: async url => {
      requests.push(url.pathname);
      if (url.pathname.endsWith('manifest.json')) return { ok: true, json: async () => ({ fish: stock }) };
      return { ok: true, blob: async () => payload };
    },
  });
  const selected = await cache.next('fish');
  assert.deepEqual(await cache.resolve(selected), painting);
  assert.deepEqual(requests, ['/painting/cache/manifest.json', '/painting/cache/fish/0.json.gz']);
});

test('reopening a style restores its last displayed painting instead of choosing randomly', async () => {
  const storage = store();
  const cache = createPaintingCache(base, options(storage));
  await cache.remember(stock[7]);
  const reopened = createPaintingCache(base, { ...options(storage), random: () => 0 });
  assert.equal((await reopened.next('fish')).seed, stock[7].seed);
});

test('narrow landscape cache entries cannot override panoramic starter images', async () => {
  const storage = store();
  const wide = { mode: 'landscapes', artRevision: 2, seed: 'wide', previewWidth: 3200, asset: 'landscapes-v2/0.json.gz' };
  await storage.put('landscapes', { version: 1, latest: 'narrow', entries: [{ ...wide, artRevision: 1, seed: 'narrow' }] });
  const cache = createPaintingCache(base, { storage, fetcher: async () => ({ ok: true, json: async () => ({ landscapes: [wide] }) }) });
  assert.equal((await cache.next('landscapes')).seed, 'wide');
});

test('remembered stock landscapes pick up new pre-rendered previews after a deployment', async () => {
  const storage = store();
  const old = { mode: 'landscapes', artRevision: 2, seed: 'wide', asset: 'landscapes-v2/0.json.gz', inkOffset: { x: 0, y: 2 } };
  await storage.put('landscapes', { version: 1, latest: old.seed, entries: [old] });
  const updated = { ...old, previewAsset: 'landscapes-preview-v1/0.png' };
  const cache = createPaintingCache(base, { storage, fetcher: async () => ({ ok: true, json: async () => ({ landscapes: [updated] }) }) });
  assert.deepEqual(await cache.next('landscapes'), updated);
});

test('a fresh landscape retains its raster preview and original SVG independently after reload', async () => {
  const storage = store();
  const painting = { mode: 'landscapes', artRevision: 2, seed: 'fresh-wide', svg: '<svg>original panorama</svg>' };
  const entry = { ...await cacheEntry(painting), previewBlob: new Blob(['preview'], { type: 'image/png' }), inkOffset: { x: 0, y: 0 } };
  await createPaintingCache(base, options(storage)).remember(entry);
  const cache = createPaintingCache(base, options(storage));
  const restored = await cache.next('landscapes');
  assert.equal(await restored.previewBlob.text(), 'preview');
  assert.deepEqual(await cache.resolve(restored), painting);
});

test('each style can reopen a prepared preview while retaining its complete export source', async () => {
  const storage = store();
  for (const mode of ['flowers', 'fish', 'maps']) {
    const painting = { mode, artRevision: mode === 'maps' ? 4 : mode === 'fish' ? 2 : 1, seed: 'ready-preview',
      ...(mode === 'flowers' ? { png: 'paper', transparentPng: 'ink' } : { svg: '<svg>vectors</svg>' }) };
    const type = mode === 'flowers' ? 'image/png' : 'image/svg+xml';
    const entry = { ...await cacheEntry(painting), previewBlob: new Blob(['ready'], { type }), inkOffset: { x: 1, y: -2 } };
    await createPaintingCache(base, options(storage)).remember(entry);
    const cache = createPaintingCache(base, options(storage));
    const restored = await cache.find(mode, painting.seed);
    assert.equal(await restored.previewBlob.text(), 'ready');
    assert.equal(restored.previewBlob.type, type);
    assert.deepEqual(restored.inkOffset, entry.inkOffset);
    assert.deepEqual(await cache.resolve(restored), painting);
  }
});

test('all ten bundled landscapes include a 4096 by 1024 PNG preview and separate SVG source', async () => {
  const directory = new URL('../public/cache/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
  assert.equal(manifest.landscapes.length, 10);
  for (const entry of manifest.landscapes) {
    assert.match(entry.asset, /\.json\.gz$/);
    const image = await readFile(new URL(entry.previewAsset, directory));
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(image.readUInt32BE(16), 4096);
    assert.equal(image.readUInt32BE(20), 1024);
    assert.equal(typeof entry.inkOffset.y, 'number');
    const crop = await readFile(new URL(entry.cropPreviewAsset, directory));
    assert.equal(crop.readUInt32BE(16), 2048);
    assert.equal(crop.readUInt32BE(20), Math.round(2048 / Math.SQRT2));
  }
});

test('shared seeds bypass the last/random image and can find stock displaced by personal entries', async () => {
  const storage = store();
  const cache = createPaintingCache(base, options(storage));
  for (let i = 0; i < 10; i++) await cache.remember({ ...stock[0], seed: `personal-${i}` });
  assert.equal((await cache.find('fish', 'fish-0')).seed, 'fish-0');
  assert.equal((await cache.find('fish', 'personal-2')).seed, 'personal-2');
  assert.equal(await cache.find('fish', 'new-shared-seed'), null);
});

test('older map renderings cannot override the revised terrain and rivers', async () => {
  const storage=store();
  const old={mode:'maps',artRevision:3,seed:'old-map',asset:'maps-v3/0.json.gz'};
  await storage.put('maps',{version:1,latest:old.seed,entries:[old]});
  const updated={mode:'maps',artRevision:4,seed:'new-map',asset:'maps-v4/0.json.gz',previewAsset:'maps-preview-v2/0.svg'};
  const cache=createPaintingCache(base,{storage,fetcher:async()=>({ok:true,json:async()=>({maps:[updated]})})});
  assert.deepEqual(await cache.next('maps'),updated);
  assert.equal(await cache.find('maps',old.seed),null);
});
