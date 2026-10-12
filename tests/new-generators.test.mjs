import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { buildBuilding } from '../src/generators/buildings/upstream/src/index.js';
import { artworkSvg } from '../src/artwork-svg.js';
import { gunzipSync } from 'node:zlib';

function generate(mode, seed) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./fixtures/generator-host.mjs', import.meta.url), { workerData: { mode, seed } });
    const timer = setTimeout(() => finish(new Error(`${mode} timed out`)), 30000);
    function finish(error, data) { clearTimeout(timer); void worker.terminate(); error ? reject(error) : resolve(data); }
    worker.once('error', error => finish(error));
    worker.once('message', data => finish(data.type === 'painting-error' ? new Error(data.message) : null, data));
  });
}

for (const mode of ['currents', 'cityscapes', 'buildings']) {
  test(`${mode}: shipping WASM worker produces distinct, repeatable vector drawings`, { timeout: 90000 }, async () => {
    const seed = `painting-stock-v1-${mode}-0`;
    const a = await generate(mode, seed);
    const b = await generate(mode, seed);
    const c = await generate(mode, 'gallery-review-2');
    const cached = JSON.parse(gunzipSync(await readFile(new URL(`../public/cache/${mode}/0.json.gz`, import.meta.url))));
    assert.equal(a.svg, cached.svg, 'opening a cached seed must reproduce the same artwork');
    assert.equal(a.svg, b.svg);
    assert.notEqual(a.svg, c.svg);
    assert.ok(a.svg.includes('<path'));
    assert.ok(!/NaN|Infinity|<image/.test(a.svg));
    assert.ok(a.width > 0 && a.height > 0);
    for (const background of [false, true]) {
      const svg = artworkSvg({ ...a, mode, seed: 'gallery-review-1' }, background);
      assert.ok(svg.includes('Seed gallery-review-1'));
      assert.ok(!svg.includes('<image'));
    }
  });
}

test('building WASM sorting and projection match the original engine', async () => {
  const bytes = await readFile(new URL('../public/generators/buildings/engine.wasm', import.meta.url));
  const { instance: { exports: k } } = await WebAssembly.instantiate(bytes, { env: { abort() { throw Error('WASM aborted'); } } });
  for (const style of ['medieval', 'cozy', 'modern']) {
    const { scene } = buildBuilding('parity', { style, detail: 'medium' });
    const boxes = new Float64Array(k.memory.buffer, k.boxesPointer(), scene.items.length * 6);
    scene.items.forEach((item, i) => boxes.set(item.bounds(), i * 6));
    k.sort(scene.items.length);
    assert.deepEqual(Array.from(new Int32Array(k.memory.buffer, k.orderPointer(), scene.items.length)), scene.sorted().map(item => scene.items.indexOf(item)));
    const input = scene.items.flatMap(item => item.faces.flatMap(face => face.pts));
    const points = new Float64Array(k.memory.buffer, k.pointsPointer(), input.length * 3);
    input.forEach((point, i) => points.set(point, i * 3)); k.project(input.length);
    input.forEach(([x, y, z], i) => {
      assert.equal(points[i * 3], (x - y) * 32);
      assert.equal(points[i * 3 + 1], (x + y) * 16 - z * 32);
    });
  }
});
