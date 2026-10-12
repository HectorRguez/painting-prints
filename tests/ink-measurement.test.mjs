import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderSvgPreview } from '../src/ink-measurement.js';

test('SVG export rendering returns a PNG of the requested size and visible ink bounds', async () => {
  const wasm = await readFile(new URL('../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url));
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect x="20" y="60" width="40" height="20"/></svg>';
  const { preview, offset } = await renderSvgPreview(svg, 100, wasm);
  assert.deepEqual(offset, { x: 10, y: -20 });
  assert.equal(preview.type, 'image/png');
  const png = Buffer.from(await preview.arrayBuffer());
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 100);
  assert.equal(png.readUInt32BE(20), 100);
});
