import { drawing } from '../shared/port.js';
import { duneParameters, resolveParameters, ridgeSkeletons, makeTerrain, terrainGrid } from './model.js';
import { renderDuneTerrain } from './render.js';
import { placeTravelers } from './travelers.js';
import { buildInkLandscape } from './ink-landscape.js';

export { duneParameters } from './model.js';
export function buildDunes(seed, overrides = {}) {
  const parameters = resolveParameters(seed, overrides);
  if (parameters.palette === 'ink') {
    const scene = buildInkLandscape(seed, parameters);
    const travelers = placeTravelers(seed, scene.grid, scene.camera, scene.visibility, parameters);
    return { ...scene, paths: [...scene.paths, ...travelers.paths], figures: travelers.figures, figureStrokes: travelers.strokes,
      metrics: { ...scene.metrics, travelers: travelers.figures.filter(f => f.kind === 'traveler').length,
        camels: travelers.figures.filter(f => f.kind === 'camel').length } };
  }
  // Neighboring independently seeded fields share one sampled height surface,
  // visibility buffer and camera. They are neither stretched nor SVG tiles.
  const ridges = [], dunes = [];
  const wind = [Math.cos(parameters.windAzimuth), Math.sin(parameters.windAzimuth)];
  for (const [band, offset] of [-1400, 0, 1400].entries()) {
    const field = ridgeSkeletons(band === 1 ? seed : `${seed}:neighbor-${band}`, parameters);
    const idOffset = dunes.length;
    for (const dune of field.dunes) dunes.push({ ...dune, id: dune.id + idOffset, center: [dune.center[0] + offset, dune.center[1]] });
    for (const ridge of field.ridges) ridges.push({ ...ridge, dune: ridge.dune + idOffset,
      points: ridge.points.map(([x, z, h]) => [x + offset, z, h]),
      segments: ridge.segments.map(segment => ({ ...segment, a: [segment.a[0] + offset, ...segment.a.slice(1)], b: [segment.b[0] + offset, ...segment.b.slice(1)] })) });
  }
  const terrain = makeTerrain(ridges, parameters);
  const grid = terrainGrid(terrain, parameters, 440, { width: 4400, depth: 1408 });
  const rendered = renderDuneTerrain(grid, ridges, parameters, { width: 3200, height: 800, panoramic: true });
  const travelers = placeTravelers(seed, grid, rendered.camera, rendered.visibility, parameters);
  return { parameters, ridges, dunes, wind, terrain, grid, ...rendered,
    paths: [...rendered.paths, ...travelers.paths], figures: travelers.figures, figureStrokes: travelers.strokes,
    metrics: { ...rendered.metrics, travelers: travelers.figures.filter(f => f.kind === 'traveler').length,
      camels: travelers.figures.filter(f => f.kind === 'camel').length } };
}
export function generateDunes(seed, overrides = {}) {
  const scene = buildDunes(seed, overrides);
  return { ...drawing(scene.paths, { width: 3200, height: 800, whiteToAlpha: scene.parameters.palette === 'ink', rounded: true }),
    width: 800 * Math.SQRT2, height: 800, previewWidth: 3200, mode: 'dunes', seed, artRevision: 3, parameters: scene.parameters, metrics: scene.metrics };
}
