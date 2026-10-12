import { attributes, canvasPreview } from './preview.js';

export function renderLinePreview(painting, options) {
  return canvasPreview(painting, context => {
    context.lineCap = context.lineJoin = 'round';
    for (const match of painting.svg.matchAll(/<path\b([^>]+)>/g)) {
      const a = attributes(match[1]);
      const path = new Path2D(a.d);
      if (a.fill !== 'none') { context.fillStyle = a.fill; context.fill(path); }
      context.strokeStyle = a.stroke;
      context.lineWidth = Number(a['stroke-width']);
      context.stroke(path);
    }
  }, { width: 2400, ...options, ...(painting.whiteToAlpha ? { filter: pixels => {
    // Solid faces occlude earlier lines; remove their paper only after drawing.
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i + 3] *= 1 - pixels[i] / 255;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
    }
  } } : {}) });
}
