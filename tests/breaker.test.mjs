import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breakingWave } from '../src/generators/seascapes/breaker.js';

const patch = { length: 620, amplitude: 210, shape: 'breaker', phase: 2.712 };
const controls = {
  curl: [.18, 1], radiusX: [patch.length * .17, patch.length * .24],
  radiusY: [patch.amplitude * .43, patch.amplitude * .57], lean: [-.12, -.025],
  startAngle: [Math.PI * 1.03, Math.PI * 1.12], lipRatio: [.045, .085],
};
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const turn = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function intersects(a, b, c, d) {
  const epsilon = 1e-10;
  const sign = value => Math.abs(value) < epsilon ? 0 : Math.sign(value);
  const onSegment = (p, q, r) => r[0] >= Math.min(p[0], q[0]) - epsilon
    && r[0] <= Math.max(p[0], q[0]) + epsilon && r[1] >= Math.min(p[1], q[1]) - epsilon
    && r[1] <= Math.max(p[1], q[1]) + epsilon;
  const [abC, abD, cdA, cdB] = [turn(a, b, c), turn(a, b, d), turn(c, d, a), turn(c, d, b)].map(sign);
  return abC * abD < 0 && cdA * cdB < 0
    || abC === 0 && onSegment(a, b, c) || abD === 0 && onSegment(a, b, d)
    || cdA === 0 && onSegment(c, d, a) || cdB === 0 && onSegment(c, d, b);
}

function displacement(a, b) {
  assert.equal(a.length, b.length, 'A continuous control must retain corresponding outline samples');
  return Math.max(...a.map((point, i) => distance(point, b[i])));
}

function checkGeometry(wave, label) {
  const outline = wave.outline;
  assert.ok(outline.length > 20, `${label}: usable continuous contour`);
  for (const points of [outline, wave.shoulder, wave.face, ...wave.strokes.map(s => s.points), ...wave.foam.map(s => s.points)]) {
    assert.ok(points.length >= 2, `${label}: empty stroke`);
    for (const point of points) {
      assert.equal(point.length, 2);
      assert.ok(point.every(value => Number.isFinite(value) && Math.abs(value) < 2), `${label}: finite normalized geometry`);
    }
  }
  assert.ok(outline[0][0] < -.45 && outline.at(-1)[0] > .45, `${label}: wave spans its support`);
  assert.ok(Math.min(...outline.map(point => point[1])) < -.8, `${label}: wave has a crest`);
  for (let i = 1; i < outline.length; i++) {
    assert.ok(distance(outline[i - 1], outline[i]) < .11, `${label}: disconnected shoulder, lip or face`);
  }
  // Close below all the water, so the audit tests a silhouette without
  // accidentally cutting across the slightly undulating waterline itself.
  const floor = Math.max(...outline.map(point => point[1])) + .1;
  const polygon = [...outline, [outline.at(-1)[0], floor], [outline[0][0], floor]];
  let twiceArea = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    twiceArea += a[0] * b[1] - b[0] * a[1];
    for (let j = i + 2; j < polygon.length; j++) {
      if (i === 0 && j === polygon.length - 1) continue;
      assert.ok(!intersects(a, b, polygon[j], polygon[(j + 1) % polygon.length]), `${label}: outline crosses itself at ${i}/${j}`);
    }
  }
  assert.ok(Math.abs(twiceArea) > .2, `${label}: collapsed water sheet`);
}

test('breaker overrides reproduce geometry and replace shape defaults without selecting another template', () => {
  const overrides = { curl: .61, radiusX: 132, radiusY: 108, lean: -.065,
    startAngle: 3.35, lipRatio: .063, flowBundles: 6, foamClusters: 7, foamScale: .95 };
  const original = structuredClone({ patch, overrides });
  const first = breakingWave(patch, overrides);
  for (let i = 0; i < 100; i++) Math.random();
  assert.deepEqual(breakingWave(patch, overrides), first);
  for (const [name, value] of Object.entries(overrides)) assert.equal(first.parameters[name], value);
  assert.deepEqual(breakingWave({ ...patch, shape: 'spilling' }, overrides), first,
    'The explicit curl must override the spilling/breaker default');
  assert.deepEqual({ patch, overrides }, original, 'Inputs must remain reusable');
  assert.notDeepEqual(breakingWave({ ...patch, phase: patch.phase + 1 }, overrides).foam, first.foam);
});

test('continuous controls move the water sheet smoothly, including the spilling-to-curl transition', () => {
  for (const [name, [low, high]] of Object.entries(controls)) {
    assert.ok(displacement(breakingWave(patch, { [name]: low }).outline,
      breakingWave(patch, { [name]: high }).outline) > 1e-4, `${name}: control must change the silhouette`);
    for (const fraction of [.01, .5, .99]) {
      const value = low + (high - low) * fraction;
      const a = breakingWave(patch, { [name]: value }).outline;
      const b = breakingWave(patch, { [name]: value + (high - low) * 1e-4 }).outline;
      const change = displacement(a, b);
      assert.ok(change > 1e-9 && change < .002, `${name}: small input changes must give small visible changes`);
    }
  }
  let previous;
  for (let i = 0; i <= 82; i++) {
    const outline = breakingWave(patch, { curl: .18 + i * .01 }).outline;
    if (previous) assert.ok(displacement(previous, outline) < .025, 'Curl must not jump between silhouette families');
    previous = outline;
  }
});

test('supported seeded waves and boundary parameter combinations have finite, connected, simple silhouettes', () => {
  for (let i = 0; i < 64; i++) {
    checkGeometry(breakingWave({ length: 340 + i * 7, amplitude: 65 + i * 3,
      shape: i % 2 ? 'spilling' : 'breaker', phase: i * .719 }), `seeded wave ${i}`);
  }
  // Cover low-curl spilling, intermediate curls and full overhangs with both
  // endpoints of each independent normalized shape control.
  for (let i = 0; i < 128; i++) {
    const overrides = { curl: [.18, .48, .74, 1][i % 4],
      radiusX: controls.radiusX[(i >> 2) & 1], radiusY: controls.radiusY[(i >> 3) & 1],
      lean: controls.lean[(i >> 4) & 1], startAngle: controls.startAngle[(i >> 5) & 1],
      lipRatio: controls.lipRatio[(i >> 6) & 1] };
    checkGeometry(breakingWave({ ...patch, phase: i * .719 }, overrides), `boundary combination ${i}`);
  }
});

test('low-curl spilling regressions do not fold the returning face through the crest', () => {
  for (const regression of [
    { length: 715.8333333333, amplitude: 179, shape: 'spilling', phase: 17.6712 },
    { length: 562.5, amplitude: 245.5, shape: 'spilling', phase: 30.9246 },
  ]) checkGeometry(breakingWave(regression), `spilling phase ${regression.phase}`);
});
