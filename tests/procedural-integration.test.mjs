import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { projects } from '../src/projects.js';
import { artworkSvg } from '../src/artwork-svg.js';
import { cacheEntry, createPaintingCache } from '../src/painting-cache.js';
import { pageFromPath, pageUrl } from '../src/pages.js';

function runWorker(mode, seed) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./fixtures/generator-host.mjs', import.meta.url), { workerData: { mode, seed } });
    const timer = setTimeout(() => finish(new Error(`${mode}: worker timed out`)), 60000);
    function finish(error, result) { clearTimeout(timer); void worker.terminate(); error ? reject(error) : resolve(result); }
    worker.once('error', error => finish(error));
    worker.once('message', data => finish(data.type === 'painting-error' ? new Error(data.message) : null, data));
  });
}

for (const mode of Object.keys(projects).filter(mode => projects[mode].bundled === false)) {
  test(`${mode}: shipping worker, compressed cache, seed URL and vector export agree`, { timeout: 120000 }, async () => {
    const module = await import(`../src/generators/${mode}/generate.js`);
    const entry = Object.entries(module).find(([name]) => /^generate[A-Z]/.test(name));
    assert.ok(entry, 'Generator exports its pure entry point');
    const seed = 'paper study 雨 / & ? # 71';
    const expected = await entry[1](seed), first = await runWorker(mode, seed), repeated = await runWorker(mode, seed);
    assert.equal(first.svg, expected.svg); assert.equal(first.svg, repeated.svg);
    assert.equal(first.artRevision, projects[mode].artRevision);
    assert.ok(first.svg.length > 1000 && first.svg.length < 8_000_000);
    assert.ok(!/<image|<script|NaN|Infinity/.test(first.svg));
    assert.equal(first.width / first.height, projects[mode].ratio);
    const saved = new Map(), base = new URL('https://example.test/painting/');
    const cache = createPaintingCache(base, {
      storage: { get: async mode => saved.get(mode), put: async (mode, value) => saved.set(mode, value) },
      fetcher: async () => ({ ok: true, json: async () => ({}) }),
    });
    assert.equal(await cache.next(mode), null);
    await cache.remember(await cacheEntry(expected));
    const cached = await cache.find(mode, seed);
    assert.deepEqual(await cache.resolve(cached), expected);
    const url = pageUrl(mode, base, seed);
    assert.equal(url.searchParams.get('seed'), seed);
    assert.equal(pageFromPath(url.pathname, base.pathname), mode);
    for (const background of [false, true]) {
      const exported = artworkSvg(expected, background);
      assert.ok(exported.includes(projects[mode].title));
      assert.ok(exported.includes('paper study 雨 / &amp; ? # 71'));
      assert.ok(!/<image|<script|NaN|Infinity/.test(exported));
      assert.equal(exported.includes('<rect'), background);
    }
  });
}
