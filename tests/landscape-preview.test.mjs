import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { landscapePaths, transparentInk } from '../src/generators/landscapes/preview.js';

test('landscape paths retain source order, fill, stroke and zero-width outlines', () => {
  const svg = `<svg><g transform='translate(0,0)'>
    <polyline points=' 0,0 10,0 10,10' style='fill:rgba(100,100,100,0.3);stroke:gray;stroke-width:0'/>
    <polyline points="0,0 5,5" style="fill:none;stroke:black;stroke-width:1.5"/>
    <text transform='translate(1,2)'>Shop</text>
  </g></svg>`;
  assert.deepEqual([...landscapePaths(svg)], [
    { path: 'M0,0 L10,0 10,10', fill: 'rgba(100,100,100,0.3)', stroke: 'gray', strokeWidth: 0 },
    { path: 'M0,0 L5,5', fill: 'none', stroke: 'black', strokeWidth: 1.5 },
  ]);
});

test('ink conversion removes composited white without losing gray or translucent black', () => {
  const pixels = new Uint8ClampedArray([255,255,255,255, 100,100,100,255, 0,0,0,128, 255,0,0,0]);
  transparentInk(pixels);
  assert.deepEqual([...pixels], [0,0,0,0, 0,0,0,155, 0,0,0,128, 0,0,0,0]);
});

test('all starter landscapes retain every polyline and valid styling', async () => {
  for (let i = 0; i < 10; i++) {
    const painting = JSON.parse(gunzipSync(await readFile(new URL(`../public/cache/landscapes-v2/${i}.json.gz`, import.meta.url))));
    let count = 0;
    for (const shape of landscapePaths(painting.svg)) {
      count++;
      assert.ok(Number.isFinite(shape.strokeWidth) && shape.strokeWidth >= 0);
      assert.ok(shape.path.startsWith('M') && !shape.path.includes('NaN'));
    }
    assert.equal(count, [...painting.svg.matchAll(/<polyline\b/g)].length);
    assert.ok(count > 1000);
  }
});

test('unsupported geometry fails explicitly rather than silently dropping shapes', () => {
  assert.throws(() => [...landscapePaths('<svg><path d="M0,0L1,1"/></svg>')], /Unsupported landscape/);
  assert.throws(() => [...landscapePaths('<svg><polyline points="0,0 1,1" transform="rotate(90)"/></svg>')], /Unsupported landscape/);
  assert.throws(() => [...landscapePaths('<svg><polyline points="0,0 1,1" style="opacity:0.5"/></svg>')], /Unsupported landscape/);
  assert.throws(() => [...landscapePaths('<svg><g transform="translate(5,0)"></g></svg>')], /Unsupported landscape/);
});
