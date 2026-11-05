import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traceContours, signedArea } from '../src/generators/shared/isocontours.js';

test('analytic circle contours close and converge to the true area under grid refinement', () => {
  let previous = Infinity;
  for (const n of [25, 49, 97]) {
    const r = .61, field = Array.from({ length: n * n }, (_, i) => {
      const x = (i % n) / (n - 1) * 2 - 1, y = Math.floor(i / n) / (n - 1) * 2 - 1;
      return x * x + y * y;
    });
    const loops = traceContours(field, n, n, r * r);
    assert.equal(loops.length, 1); assert.ok(loops[0].closed);
    const error = Math.abs(Math.abs(signedArea(loops[0].points)) * (2 / (n - 1)) ** 2 - Math.PI * r * r);
    assert.ok(error < previous * .4); previous = error;
    for (const [x, y] of loops[0].points) assert.ok(Math.abs(Math.hypot(x * 2 / (n - 1) - 1, y * 2 / (n - 1) - 1) - r) < .003);
  }
});

test('planar isolines end at the boundary and are never closed by a spurious diagonal', () => {
  const field = Array.from({ length: 25 }, (_, i) => i % 5 + 2 * Math.floor(i / 5));
  const [trace] = traceContours(field, 5, 5, 5.3);
  assert.equal(trace.closed, false);
  for (const [x, y] of trace.points) assert.ok(Math.abs(x + 2 * y - 5.3) < 1e-12);
  const onBoundary = ([x, y]) => x === 0 || y === 0 || x === 4 || y === 4;
  assert.ok(onBoundary(trace.points[0]) && onBoundary(trace.points.at(-1)));
});

test('saddle connectivity uses the bilinear determinant, with consistent shared edges', () => {
  // Mean is positive while determinant is negative: a mean-based decider fails.
  const values = [10, -3, -3, .1];
  const loops = traceContours(values, 2, 2, 0);
  assert.equal(loops.length, 2);
  assert.ok(loops.some(({ points }) => points.some(p => p[1] === 0) && points.some(p => p[0] === 0)));
  const mirrored = traceContours(values.map(x => -x), 2, 2, 0);
  assert.deepEqual(mirrored, loops);
  const ring = Array.from({ length: 1681 }, (_, i) => (((i % 41 - 20) / 4) ** 2 + ((Math.floor(i / 41) - 20) / 4) ** 2 - 4) ** 2);
  const contours = traceContours(ring, 41, 41, 3);
  assert.equal(contours.length, 2); assert.ok(contours.every(c => c.closed));
});

test('constant fields, exact ties and invalid inputs are handled deterministically', () => {
  assert.deepEqual(traceContours(new Float64Array(16), 4, 4, 0), []);
  const checker = Array.from({ length: 49 }, (_, i) => (i + Math.floor(i / 7)) % 3 - 1);
  assert.deepEqual(traceContours(checker, 7, 7, 0), traceContours(checker, 7, 7, 0));
  assert.throws(() => traceContours([0, NaN, 1, 2], 2, 2, 0), /finite/);
  assert.throws(() => traceContours([1], 1, 1, 0), /grid/);
});
