import { inkOffset } from '../../preview-layout.js';

export function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*(['"])([\s\S]*?)\2/g)].map(match => [match[1], match[3]]));
}

// Draw once, measure the same pixels, and retain a bitmap for cheap zoom/pan.
// This module runs in the preview worker, never on the UI thread.
export async function canvasPreview(painting, draw, { width = 3200, viewWidth = painting.width, measure = true, filter } = {}) {
  const height = Math.max(1, Math.round(width * painting.height / viewWidth));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.scale(width / viewWidth, width / viewWidth);
  context.miterLimit = 4;
  draw(context);
  let offset;
  if (filter || measure) {
    const pixels = context.getImageData(0, 0, width, height);
    if (filter) { filter(pixels.data); context.putImageData(pixels, 0, 0); }
    if (measure) offset = inkOffset(pixels);
  }
  return { preview: await canvas.convertToBlob({ type: 'image/png' }), offset };
}

export function strokePaths(context, paths) {
  context.lineCap = context.lineJoin = 'round';
  for (const path of paths) {
    if (!path.d || path.fill !== 'none') throw new Error('Unsupported preview path');
    context.strokeStyle = path.stroke;
    context.lineWidth = Number(path['stroke-width']);
    context.globalAlpha = Number(path.opacity ?? 1);
    context.stroke(new Path2D(path.d));
  }
}
