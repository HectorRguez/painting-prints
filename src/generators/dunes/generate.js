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
  const { ridges, dunes, wind } = ridgeSkeletons(seed, parameters);
  const terrain = makeTerrain(ridges, parameters);
  const grid = terrainGrid(terrain, parameters, 224);
  const rendered = renderDuneTerrain(grid, ridges, parameters);
  const travelers = placeTravelers(seed, grid, rendered.camera, rendered.visibility, parameters);
  return { parameters, ridges, dunes, wind, terrain, grid, ...rendered,
    paths: [...rendered.paths, ...travelers.paths], figures: travelers.figures, figureStrokes: travelers.strokes,
    metrics: { ...rendered.metrics, travelers: travelers.figures.filter(f => f.kind === 'traveler').length,
      camels: travelers.figures.filter(f => f.kind === 'camel').length } };
}
export function generateDunes(seed, overrides = {}) {
  const scene = buildDunes(seed, overrides);
  return { ...drawing(scene.paths, { width: 1414, height: 1000, whiteToAlpha: scene.parameters.palette === 'ink', rounded: true }),
    mode: 'dunes', seed, artRevision: 2, parameters: scene.parameters, metrics: scene.metrics };
}
