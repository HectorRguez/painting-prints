import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderSvgPreview, renderSvgPng } from '../src/ink-measurement.js';

test('a single raster pass returns the same PNG with bounds from its visible pixels', async () => {
  const wasm = await readFile(new URL('../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url));
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect x="20" y="60" width="40" height="20"/></svg>';
  const { preview, offset } = await renderSvgPreview(svg, 100, wasm);
  assert.deepEqual(offset, { x: 10, y: -20 });
  assert.equal(preview.type, 'image/png');
  assert.deepEqual(await preview.arrayBuffer(), await (await renderSvgPng(svg, 100, wasm)).arrayBuffer());
  assert.equal((await renderSvgPreview(svg, 100, wasm, false)).offset, undefined);
});
