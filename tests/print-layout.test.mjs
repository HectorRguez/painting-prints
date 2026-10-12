import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projects, pageModes } from '../src/projects.js';
import { printLayout } from '../src/print-layout.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 0.001, `${a} differs from ${b}`);

test('print defaults keep flowers square on portrait A4 and landscapes wide', () => {
  const { width, height, orientation, format, art } = printLayout('flowers');
  assert.equal(orientation, 'portrait');
  assert.equal(format, 'a4');
  near(width, 210); near(height, 297);
  near(art.width, art.height);
  near(art.x, width - art.x - art.width);
  near(art.y, height - art.y - art.height);
  assert.ok(art.width >= 150 && art.width <= 190);
  const landscape = printLayout('landscapes');
  assert.equal(landscape.orientation, 'landscape');
  near(landscape.art.width / landscape.art.height, Math.SQRT2);
  near(printLayout('landscapes', 'a3').width, 420);
  assert.ok(printLayout('landscapes', 'a3').art.width > landscape.art.width);
});

test('all paper/orientation combinations keep the full art centered without distortion', () => {
  for (const mode of pageModes) {
    for (const paper of ['a4', 'a3']) {
      for (const orientation of ['portrait', 'landscape']) {
        const { width, height, art } = printLayout(mode, paper, orientation);
        assert.equal(width > height, orientation === 'landscape');
        near(2 * art.x + art.width, width);
        near(2 * art.y + art.height, height);
        near(art.width / art.height, projects[mode].ratio);
        assert.ok(art.x >= 9.999 && art.y >= 9.999);
      }
    }
  }
  assert.throws(() => printLayout('flowers', 'a4', 'diagonal'), /Unsupported/);
  assert.throws(() => printLayout('landscapes', 'letter'), /Unsupported/);
});
