import { canvasPreview } from '../shared/preview.js';

// Shan Shui's pinned output is a flat, ordered list of polylines. Draw those
// same paths with the browser's native rasterizer, without an SVG/WASM parse.
// Keep the SVG itself untouched for downloads and the print renderer.
export function* landscapePaths(svg) {
  for (const tag of svg.matchAll(/<([^>]+)>/g)) {
    const name = tag[1].match(/^\/?([\w-]+)/)?.[1];
    if (tag[1].startsWith('/')) continue;
    if (name === 'svg') continue;
    // The previous resvg preview loads no fonts, so upstream shop labels are
    // already omitted. Their text remains in the original SVG download.
    if (name === 'text') continue;
    const attributes = Object.fromEntries([...tag[1].matchAll(/([\w-]+)\s*=\s*(['"])(.*?)\2/g)].map(match => [match[1], match[3]]));
    if (name === 'g' && (!attributes.transform || attributes.transform === 'translate(0,0)')) continue;
    if (name !== 'polyline' || !attributes.points || Object.keys(attributes).some(key => !['points', 'style'].includes(key))) {
      throw new Error('Unsupported landscape drawing');
    }
    const style = Object.fromEntries((attributes.style || '').split(';').filter(Boolean).map(rule => rule.split(':').map(value => value.trim())));
    if (Object.keys(style).some(key => !['fill', 'stroke', 'stroke-width'].includes(key))) throw new Error('Unsupported landscape style');
    const strokeWidth = Number(style['stroke-width'] ?? 1);
    yield {
      path: 'M' + attributes.points.trim().replace(/\s+/, ' L'),
      fill: style.fill || 'black', stroke: style.stroke || 'none', strokeWidth,
    };
  }
}

// Apply the existing sRGB ink-alpha matrix after compositing every shape.
// White mountain fills must hide earlier strokes before becoming transparent.
export function transparentInk(data) {
  for (let i = 0; i < data.length; i += 4) {
    const luminance = .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
    data[i + 3] = Math.round(data[i + 3] * (1 - luminance / 255));
    data[i] = data[i + 1] = data[i + 2] = 0;
  }
}

export async function renderLandscapePreview(painting, { crop = false, measure = true } = {}) {
  const sourceWidth = painting.previewWidth || painting.width;
  const viewWidth = crop ? painting.width : sourceWidth;
  const width = crop ? 2048 : 4096;
  return canvasPreview(painting, context => {
    if (crop) context.translate(-(sourceWidth - viewWidth) / 2, 0);
    context.lineCap = 'butt';
    context.lineJoin = 'miter';
    for (const { path, fill, stroke, strokeWidth } of landscapePaths(painting.svg)) {
      const shape = new Path2D(path);
      if (fill !== 'none') { context.fillStyle = fill; context.fill(shape); }
      if (stroke !== 'none' && strokeWidth > 0) {
        context.strokeStyle = stroke; context.lineWidth = strokeWidth; context.stroke(shape);
      }
    }
  }, { width, viewWidth, measure, filter: transparentInk });
}
