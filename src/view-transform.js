export const initialView = () => ({ scale: 1, x: 0, y: 0 });

export function zoomAt(view, scale, anchor, destination = anchor) {
  const nextScale = Math.min(6, Math.max(1, scale));
  const ratio = nextScale / view.scale;
  return { scale: nextScale, x: destination.x - (anchor.x - view.x) * ratio,
    y: destination.y - (anchor.y - view.y) * ratio };
}

export function constrainView(view, viewport, artwork) {
  view = { ...view, scale: Math.min(6, Math.max(1, view.scale)) };
  const limit = (size, art) => Math.max(0, (art * view.scale - size) / 2);
  const x = limit(viewport.width, artwork.width);
  const y = limit(viewport.height, artwork.height);
  return { scale: view.scale, x: x ? Math.max(-x, Math.min(x, view.x)) : 0,
    y: y ? Math.max(-y, Math.min(y, view.y)) : 0 };
}
