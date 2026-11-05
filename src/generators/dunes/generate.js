import { drawing } from '../shared/port.js';
import { duneParameters, resolveParameters, ridgeSkeletons, makeTerrain, terrainGrid } from './model.js';
import { renderDuneTerrain } from './render.js';

export { duneParameters } from './model.js';
export function buildDunes(seed, overrides = {}) {
  const parameters = resolveParameters(seed, overrides);
  const { ridges, dunes, wind } = ridgeSkeletons(seed, parameters);
  const terrain = makeTerrain(ridges, parameters);
  const grid = terrainGrid(terrain, parameters, 224);
  const rendered = renderDuneTerrain(grid, ridges, parameters);
  return { parameters, ridges, dunes, wind, terrain, grid, ...rendered };
}
export function generateDunes(seed, overrides = {}) {
  const scene = buildDunes(seed, overrides);
  return { ...drawing(scene.paths, { width: 1414, height: 1000, whiteToAlpha: scene.parameters.palette === 'ink', rounded: true }),
    mode: 'dunes', seed, artRevision: 1, parameters: scene.parameters, metrics: scene.metrics };
}
