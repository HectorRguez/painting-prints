import { initialView, zoomAt, constrainView } from './view-transform.js';

export function createViewer(viewport, artwork) {
  let view = initialView();
  const pointers = new Map();
  let gesture;
  let lastTap;
  let tap;

  function apply(next) {
    view = constrainView(next, viewport.getBoundingClientRect(), { width: artwork.offsetWidth, height: artwork.offsetHeight });
    viewport.dataset.magnified = String(view.scale > 1.001);
    // Resize the SVG's viewport instead of magnifying a cached compositor texture.
    // The wrapper retains its baseline dimensions for pan bounds and pointer math.
    artwork.style.setProperty('--view-scale', view.scale);
    artwork.style.transform = `translate(${view.x}px, ${view.y}px)`;
    viewport.classList.toggle('zoomed', artwork.offsetWidth * view.scale > viewport.clientWidth
      || artwork.offsetHeight * view.scale > viewport.clientHeight);
  }
  function reset() {
    pointers.clear();
    gesture = undefined;
    tap = undefined;
    lastTap = undefined;
    apply(initialView());
  }
  function fit() {
    reset();
  }
  function point(event) {
    const bounds = viewport.getBoundingClientRect();
    return { x: event.clientX - bounds.left - bounds.width / 2, y: event.clientY - bounds.top - bounds.height / 2 };
  }
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  function startGesture() {
    const [a, b] = [...pointers.values()];
    gesture = a ? { view: { ...view }, anchor: b ? midpoint(a, b) : a, distance: b ? Math.max(1, distance(a, b)) : 0 } : undefined;
  }
  viewport.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target?.closest?.('a, button') || !artwork.firstElementChild) return;
    const position = point(event);
    pointers.set(event.pointerId, position);
    viewport.setPointerCapture(event.pointerId);
    tap = pointers.size === 1 ? { position, time: performance.now(), touch: event.pointerType !== 'mouse' } : undefined;
    startGesture();
  });
  viewport.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const position = point(event);
    pointers.set(event.pointerId, position);
    if (tap && distance(tap.position, position) > 8) tap = undefined;
    const [a, b] = [...pointers.values()];
    if (b && gesture.distance) {
      apply(zoomAt(gesture.view, gesture.view.scale * distance(a, b) / gesture.distance, gesture.anchor, midpoint(a, b)));
    } else {
      apply({ ...gesture.view, x: gesture.view.x + a.x - gesture.anchor.x, y: gesture.view.y + a.y - gesture.anchor.y });
    }
  });
  function endPointer(event) {
    if (!pointers.has(event.pointerId)) return;
    if (event.type === 'pointerup' && tap?.touch && performance.now() - tap.time < 300) {
      if (lastTap && performance.now() - lastTap.time < 350 && distance(tap.position, lastTap.position) < 25) fit();
      else lastTap = { position: tap.position, time: performance.now() };
    } else lastTap = undefined;
    pointers.delete(event.pointerId);
    tap = undefined;
    startGesture();
  }
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) viewport.addEventListener(name, endPointer);
  viewport.addEventListener('dblclick', fit);
  viewport.addEventListener('wheel', event => {
    if (!artwork.firstElementChild) return;
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1);
    apply(zoomAt(view, view.scale * Math.exp(-delta * 0.002), point(event)));
  }, { passive: false });
  viewport.addEventListener('keydown', event => {
    if (['+', '=', '-', '_'].includes(event.key)) {
      event.preventDefault();
      apply(zoomAt(view, view.scale * (['+', '='].includes(event.key) ? 1.25 : 0.8), { x: 0, y: 0 }));
    } else if (event.key === '0') { event.preventDefault(); fit(); }
    else if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      apply({ ...view, x: view.x + (event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0),
        y: view.y + (event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0) });
    }
  });
  // Rotation and browser chrome resizing restore the height-filling baseline.
  const observer = new ResizeObserver(reset);
  observer.observe(viewport);
  return { reset };
}
