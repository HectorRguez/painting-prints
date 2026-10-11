import { test } from 'node:test';
import assert from 'node:assert/strict';
import { printLayout } from '../src/print-layout.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 0.001, `${a} differs from ${b}`);

test('flower is square and centered horizontally and vertically on portrait A4', () => {
  const { width, height, orientation, format, art } = printLayout('flowers');
  assert.equal(orientation, 'portrait');
  assert.equal(format, 'a4');
  near(width, 210); near(height, 297);
  near(art.width, art.height);
  near(art.x, width - art.x - art.width);
  near(art.y, height - art.y - art.height);
  assert.ok(art.width >= 150 && art.width <= 190);
});

test('both landscape sizes fit with equal opposite margins and preserve the composition', () => {
  for (const paper of ['a4', 'a3']) {
    const { width, height, orientation, art } = printLayout('landscapes', paper);
    assert.equal(orientation, 'landscape');
    assert.ok(width > height);
    near(art.width / art.height, Math.SQRT2);
    near(art.x, width - art.x - art.width);
    near(art.y, height - art.y - art.height);
    assert.ok(art.x >= 10 && art.y >= 10);
  }
  assert.ok(printLayout('landscapes', 'a3').art.width > printLayout('landscapes', 'a4').art.width);
});

test('unsupported landscape sizes fail clearly', () => {
  assert.throws(() => printLayout('landscapes', 'letter'), /Unsupported/);
});
