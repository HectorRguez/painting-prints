import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderLinePreview } from '../src/generators/shared/line-preview.js';

test('fill-only and zero-width SVG paths cannot inherit a previous canvas stroke', async () => {
  const calls = [], previousCanvas = globalThis.OffscreenCanvas, previousPath = globalThis.Path2D;
  const context = { scale() {}, fill(path) { calls.push(['fill', path.d, this.fillStyle]); },
    stroke(path) { calls.push(['stroke', path.d, this.strokeStyle, this.lineWidth]); } };
  globalThis.Path2D = class { constructor(d) { this.d = d; } };
  globalThis.OffscreenCanvas = class { getContext() { return context; } async convertToBlob() { return new Blob(); } };
  try {
    await renderLinePreview({ width: 100, height: 100, svg: `<svg>
      <path d="M1,1L2,2" fill="none" stroke="#123456" stroke-width="4"/>
      <path d="M3,3L4,4Z" fill="#aabbcc" stroke="none" stroke-width="2"/>
      <path d="M5,5L6,6Z" fill="#ccbbaa" stroke="#abcdef" stroke-width="0"/>
      <path d="M7,7L8,8" fill="none" stroke="#654321" stroke-width="1"/>
    </svg>` }, { measure: false });
    assert.deepEqual(calls, [['stroke', 'M1,1L2,2', '#123456', 4], ['fill', 'M3,3L4,4Z', '#aabbcc'],
      ['fill', 'M5,5L6,6Z', '#ccbbaa'], ['stroke', 'M7,7L8,8', '#654321', 1]]);
  } finally { globalThis.OffscreenCanvas = previousCanvas; globalThis.Path2D = previousPath; }
});
