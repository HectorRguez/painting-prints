import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { artworkSvg } from '../src/artwork-svg.js';
const painting = { mode: 'landscapes', seed: 'wide', width: 100, height: 100, previewWidth: 400,
  svg: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><rect x="0" width="100" height="100" fill="black"/><rect x="150" y="40" width="100" height="20" fill="black"/><rect x="300" width="100" height="100" fill="black"/></svg>' };

test('panoramic preview keeps the entire source but every export crops its center', async () => {
  await initWasm(await readFile(new URL('../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url)));
  for (const background of [false, true]) {
    const markup = artworkSvg(painting, background);
    assert.ok(markup.includes('viewBox="0 0 100 100"'));
    assert.ok(markup.includes('translate(-150 0)'));
    const renderer = new Resvg(markup);
    const output = renderer.render();
    assert.equal(output.width, 100);
    assert.equal(output.height, 100);
    const pixels = output.pixels;
    assert.equal(pixels[(50 * 100 + 50) * 4], 0);
    assert.equal(pixels[(50 * 100 + 50) * 4 + 3], 255);
    if (background) assert.equal(pixels[0], 255);
    else assert.equal(pixels[3], 0);
    output.free(); renderer.free();
  }
  const preview = new Resvg(artworkSvg(painting, false, true));
  const output = preview.render();
  assert.equal(output.width, 400);
  assert.equal(output.height, 100);
  assert.equal(output.pixels[3], 255);
  output.free(); preview.free();
});
