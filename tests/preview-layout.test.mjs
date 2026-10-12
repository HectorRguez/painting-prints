import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inkOffset } from '../src/preview-layout.js';

test('visible pixels center on both axes despite uneven transparent margins', () => {
  const pixels = { width: 100, height: 100, data: new Uint8ClampedArray(40000) };
  pixels.data[(10 * 100 + 20) * 4 + 3] = 255;
  pixels.data[(49 * 100 + 59) * 4 + 3] = 100;
  // Ignore barely visible noise at the edge.
  pixels.data[(99 * 100 + 99) * 4 + 3] = 3;
  assert.deepEqual(inkOffset(pixels), { x: 10, y: 20 });
  pixels.data.fill(0);
  assert.deepEqual(inkOffset(pixels), { x: 0, y: 0 });
});
