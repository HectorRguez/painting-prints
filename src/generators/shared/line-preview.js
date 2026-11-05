import { attributes, canvasPreview } from './preview.js';

export function renderLinePreview(painting, options) {
  return canvasPreview(painting, context => {
    context.lineCap = context.lineJoin = 'round';
    for (const match of painting.svg.matchAll(/<path\b([^>]+)>/g)) {
      const a = attributes(match[1]);
      const path = new Path2D(a.d);
      if (a.fill !== 'none') { context.fillStyle = a.fill; context.fill(path); }
      // Canvas ignores invalid strokeStyle='none' and lineWidth=0 assignments;
      // SVG uses them to suppress strokes. Skip drawing instead of reusing the
      // preceding path's stroke state, especially for filled contour regions.
      const width = Number(a['stroke-width']);
      if (a.stroke !== 'none' && width > 0) {
        context.strokeStyle = a.stroke;
        context.lineWidth = width;
        context.stroke(path);
      }
    }
  }, { width: 2400, ...options, ...(painting.whiteToAlpha ? { filter: pixels => {
    // Solid faces occlude earlier lines; remove their paper only after drawing.
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i + 3] *= 1 - pixels[i] / 255;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
    }
  } } : {}) });
}
