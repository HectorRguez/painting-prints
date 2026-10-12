import { projects } from './projects.js';
const namespace = 'http://www.w3.org/2000/svg';
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// The bundled generators produce self-contained SVG. Keep the original drawing
// as markup, without constructing hundreds of thousands of DOM nodes to wrap it.
export function artworkSvg(painting, background = false, preview = false) {
  const { mode, height } = painting;
  const panoramic = mode === 'landscapes' && painting.previewWidth;
  const width = preview && panoramic ? painting.previewWidth : painting.width;
  let viewBox = `0 0 ${width} ${height}`, contents;
  if (mode === 'flowers') {
    contents = `<image href="${escape(background ? painting.png : painting.transparentPng)}" width="${width}" height="${height}"/>`;
  } else {
    const root = painting.svg.match(/<svg\b([^>]*)>/);
    const end = painting.svg.lastIndexOf('</svg>');
    if (!root || end < root.index + root[0].length) throw new Error('Invalid artwork SVG');
    viewBox = root[1].match(/\bviewBox\s*=\s*(["'])(.*?)\1/)?.[2] || viewBox;
    let drawing = painting.svg.slice(root.index + root[0].length, end);
    if (panoramic) {
      viewBox = `0 0 ${width} ${height}`;
      // Crop the source geometry before applying the transparent-ink filter.
      // Preview panning and zoom never change this centered export region.
      if (!preview) drawing = `<g transform="translate(${-(painting.previewWidth - painting.width) / 2} 0)">${drawing}</g>`;
    }
    let definitions = '', paper = '', attributes = '';
    if (background && painting.texture) {
      definitions = `<defs><pattern id="paper-texture" patternUnits="userSpaceOnUse" width="512" height="512"><image href="${escape(painting.texture)}" width="512" height="512"/></pattern></defs>`;
      paper = `<rect width="${width}" height="${height}" fill="url(#paper-texture)"/>`;
      attributes = ' style="mix-blend-mode:multiply"';
    } else if (background) {
      paper = `<rect width="${width}" height="${height}" fill="${escape(painting.paperColor || 'white')}"/>`;
    }
    if ((!background && mode === 'landscapes') || painting.whiteToAlpha) {
      definitions = `<defs><filter id="transparent-ink" x="0" y="0" width="${width}" height="${height}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.2126 -0.7152 -0.0722 1 0"/></filter></defs>`;
      attributes = ' filter="url(#transparent-ink)"';
    }
    contents = `${definitions}${paper}<g${attributes}>${drawing}</g>`;
  }
  return `<svg xmlns="${namespace}" width="${width}" height="${height}" viewBox="${escape(viewBox)}" style="isolation:isolate"><title>${escape(projects[mode].title)}</title><desc>Artwork by ${escape(projects[mode].author)}. Seed ${escape(painting.seed)}.</desc>${contents}</svg>`;
}
