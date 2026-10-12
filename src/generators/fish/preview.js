import { attributes, canvasPreview, strokePaths } from '../shared/preview.js';

export function fishPaths(svg) {
  // Fishdraw's single path already excludes the frame and name. Its separate
  // floralwhite paper rectangle belongs only in exports with a background.
  return [...svg.matchAll(/<path\b([^>]+)>/g)].map(match => attributes(match[1]));
}

export function renderFishPreview(painting, options) {
  return canvasPreview(painting, context => strokePaths(context, fishPaths(painting.svg)), options);
}
