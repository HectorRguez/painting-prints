import { attributes, canvasPreview, strokePaths } from '../shared/preview.js';

export function mapDrawing(svg) {
  const group = attributes(svg.match(/<g\b([^>]+)>/)?.[1] || '');
  const transform = group.transform?.match(/^scale\(([-\d.e+]+)\) translate\(([-\d.e+]+),([-\d.e+]+)\)$/);
  if (!transform) throw new Error('Unsupported map transform');
  const paths = [...svg.matchAll(/<path\b([^>]+)>/g)].map(match => ({ ...group, ...attributes(match[1]) }));
  return { scale: Number(transform[1]), x: Number(transform[2]), y: Number(transform[3]), paths };
}

export function renderMapPreview(painting, options) {
  return canvasPreview(painting, context => {
    const drawing = mapDrawing(painting.svg);
    context.scale(drawing.scale, drawing.scale);
    context.translate(drawing.x, drawing.y);
    strokePaths(context, drawing.paths);
  }, options);
}
