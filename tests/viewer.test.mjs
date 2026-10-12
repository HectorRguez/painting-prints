import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialView, zoomAt, constrainView } from '../src/view-transform.js';
import { createViewer } from '../src/viewer.js';

test('zoom keeps the artwork point under the fingers as their midpoint moves', () => {
  const before = { scale: 1.5, x: 20, y: -10 };
  const anchor = { x: 80, y: 50 }, destination = { x: 95, y: 70 };
  const after = zoomAt(before, 3, anchor, destination);
  for (const axis of ['x', 'y']) {
    assert.equal((anchor[axis] - before[axis]) / before.scale,
      (destination[axis] - after[axis]) / after.scale);
  }
  assert.equal(zoomAt(before, 100, anchor).scale, 6);
  assert.equal(zoomAt(before, 0.01, anchor).scale, 1);
});

test('panning cannot lose the painting; zooming out returns it to the center', () => {
  const viewport = { width: 320, height: 560 }, artwork = { width: 320, height: 320 };
  const result = constrainView({ scale: 2, x: 10000, y: -10000 }, viewport, artwork);
  assert.ok(Math.abs(result.x) < artwork.width);
  assert.ok(Math.abs(result.y) < artwork.height);
  assert.deepEqual(constrainView({ scale: 0.5, x: 100, y: -200 }, viewport, artwork), { scale: 1, x: 0, y: 0 });
});

function fixture(artWidth = 320, artHeight = 320) {
  const listeners = new Map();
  const viewport = { dataset: {}, clientWidth: 320, clientHeight: 560, classList: { toggle() {} }, setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 560 }),
    addEventListener(name, callback) { listeners.set(name, callback); } };
  const artwork = { style: { setProperty(name, value) { this[name] = value; } }, offsetWidth: artWidth, offsetHeight: artHeight, firstElementChild: {} };
  globalThis.ResizeObserver = class { observe() {} };
  const viewer = createViewer(viewport, artwork);
  const fire = (type, id, x, y, extra = {}) => listeners.get(type)({ type, pointerId: id,
    clientX: x, clientY: y, button: 0, pointerType: 'touch', preventDefault() {}, ...extra });
  return { artwork, viewer, fire };
}

test('two fingers pinch in and out, then one finger pans without a jump', () => {
  const { artwork, fire } = fixture();
  fire('pointerdown', 1, 110, 280); fire('pointerdown', 2, 210, 280);
  fire('pointermove', 1, 60, 280); fire('pointermove', 2, 260, 280);
  assert.equal(artwork.style.transform, 'translate(0px, 0px)');
  assert.equal(artwork.style['--view-scale'], 2);
  fire('pointerup', 2, 260, 280);
  fire('pointermove', 1, 90, 300);
  assert.equal(artwork.style.transform, 'translate(30px, 20px)');
  assert.equal(artwork.style['--view-scale'], 2);
  fire('pointercancel', 1, 90, 300);
  fire('pointermove', 1, 300, 300);
  assert.equal(artwork.style.transform, 'translate(30px, 20px)');
  assert.equal(artwork.style['--view-scale'], 2);
  fire('pointerdown', 3, 110, 280); fire('pointerdown', 4, 210, 280);
  fire('pointermove', 3, 145, 280); fire('pointermove', 4, 175, 280);
  assert.equal(artwork.style.transform, 'translate(0px, 0px)');
  assert.equal(artwork.style['--view-scale'], 1);
});

test('a phone can pan its screen-filling image at the default scale and double-tap restores its height-filling baseline', () => {
  const { artwork, fire } = fixture(792, 560);
  fire('pointerdown', 1, 160, 280); fire('pointermove', 1, 210, 280); fire('pointerup', 1, 210, 280);
  assert.equal(artwork.style.transform, 'translate(50px, 0px)');
  assert.equal(artwork.style['--view-scale'], 1);
  fire('pointerdown', 2, 160, 280); fire('pointerup', 2, 160, 280);
  fire('pointerdown', 3, 160, 280); fire('pointerup', 3, 160, 280);
  assert.equal(artwork.style.transform, 'translate(0px, 0px)');
  assert.equal(artwork.style['--view-scale'], 1);
});

test('double-tap and a new painting reset the viewer; keyboard zoom has an accessible alternative', () => {
  const { artwork, viewer, fire } = fixture();
  fire('keydown', 0, 0, 0, { key: '+' });
  assert.equal(artwork.style['--view-scale'], 1.25);
  fire('pointerdown', 1, 160, 280); fire('pointerup', 1, 160, 280);
  fire('pointerdown', 2, 160, 280); fire('pointerup', 2, 160, 280);
  assert.equal(artwork.style.transform, 'translate(0px, 0px)');
  assert.equal(artwork.style['--view-scale'], 1);
  fire('keydown', 0, 0, 0, { key: '+' });
  viewer.reset();
  assert.deepEqual(initialView(), { scale: 1, x: 0, y: 0 });
  assert.equal(artwork.style.transform, 'translate(0px, 0px)');
  assert.equal(artwork.style['--view-scale'], 1);
});


test('wheel, keyboard and pinch cannot shrink below the height-filling baseline', () => {
  const { artwork, fire, viewer } = fixture(792, 560);
  viewer.reset();
  fire('wheel', 0, 160, 280, { deltaY: 10000, deltaMode: 0 });
  assert.equal(artwork.style.transform, 'translate(0px, 0px)');
  assert.equal(artwork.style['--view-scale'], 1);
  fire('keydown', 0, 0, 0, { key: '-' });
  assert.equal(artwork.style.transform, 'translate(0px, 0px)');
  assert.equal(artwork.style['--view-scale'], 1);
  fire('pointerdown', 1, 60, 280); fire('pointerdown', 2, 260, 280);
  fire('pointermove', 1, 150, 280); fire('pointermove', 2, 170, 280);
  assert.equal(artwork.style['--view-scale'], 1);
});

test('panning stops at the image edges without exposing empty strips', () => {
  assert.deepEqual(constrainView({ scale: 1, x: 10000, y: -10000 },
    { width: 320, height: 560 }, { width: 792, height: 560 }),
    { scale: 1, x: 236, y: 0 });
});
