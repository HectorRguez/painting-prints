// Line-art presentation of Mapgen4's original elevation and river algorithms.
import Mapgen from '../../vendor/mapgen4/map.ts';
import { choosePoints } from '../../vendor/mapgen4/generate-points.ts';
import { fromPointsFile, toPointsFile } from '../../vendor/mapgen4/serialize-points.ts';
import { riverSegments } from './map-rivers.js';
import { TriangleMesh } from '../../vendor/mapgen4/dual-mesh/index.ts';
import { Generator } from '../../tmp/map-constraints.ts';
import Delaunator from 'delaunator';
import Geometry from '../../vendor/mapgen4/geometry.ts';
import { terrainSvg } from './map-svg.js';

export function generateMap(seed: number) {
  const spacing = 5.5;
  // Upstream uses one fixed, precomputed mesh, including its Uint16 round trip.
  // Only the elevation/noise seed changes when generating a new map.
  const points = fromPointsFile(toPointsFile(choosePoints(12345, spacing, 35)));
  const mesh = new TriangleMesh(TriangleMesh.addGhostStructure({
    points: points.points, delaunator: Delaunator.from(points.points),
    numBoundaryPoints: points.numExteriorBoundaryPoints,
  })) as any;
  mesh.is_boundary_t = Int8Array.from({ length: mesh.numTriangles }, (_, t) => mesh.r_around_t(t).some(r => mesh.is_boundary_r(r)) ? 1 : 0);
  mesh.length_s = Float32Array.from({ length: mesh.numSides }, (_, s) => {
    const a = mesh.r_begin_s(s), b = mesh.r_end_s(s);
    return Math.hypot(mesh.x_of_r(a) - mesh.x_of_r(b), mesh.y_of_r(a) - mesh.y_of_r(b));
  });
  const peaks = Array.from({ length: points.numMountainPoints }, (_, i) => mesh.t_inner_s(mesh._s_of_r[i + points.numExteriorBoundaryPoints + points.numInteriorBoundaryPoints]));
  const map = new Mapgen(mesh, peaks, { spacing });
  const elevation = { seed, island: .5, noisy_coastlines: .01, hill_height: .02, mountain_jagged: 0, mountain_sharpness: 9.8, mountain_folds: .05, ocean_depth: 1.4 };
  const constraints = new Generator();
  constraints.setElevationParam(elevation);
  map.assignElevation(elevation, { constraints: constraints.elevation, size: 128 });
  map.assignRainfall({ wind_angle_deg: 0, raininess: .9, rain_shadow: .5, evaporation: .5 });
  const riverParams = { lg_min_flow: 2.7, lg_river_width: -2.4, flow: .2 };
  map.assignRivers(riverParams);
  const indices = new Int32Array(3 * mesh.numSolidSides);
  const positions = new Float32Array(2 * (mesh.numRegions + mesh.numTriangles));
  const elevations = new Float32Array(positions.length);
  Geometry.setMeshGeometry(mesh, positions);
  Geometry.setMapGeometry(map, elevation.mountain_folds, indices, elevations);
  const vertices = Array.from({ length: positions.length / 2 }, (_, i) => [positions[2*i], positions[2*i+1], elevations[2*i]]);
  // Feed the original river geometry into a vector version of its curved,
  // variable-width shader, then drape it over the actual folded terrain.
  const riverBuffer = new Float32Array(24 * mesh.numSolidTriangles);
  const riverCount = Geometry.setRiverGeometry(map, spacing, riverParams, riverBuffer);
  const rivers = riverSegments(riverBuffer.subarray(0, riverCount * 12));
  return terrainSvg(vertices, indices, rivers);
}
if (typeof self !== 'undefined') self.onmessage = ({ data: { seed } }) => {
  try {
    let hash = 2166136261;
    for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    self.postMessage({ type: 'painting-ready', artRevision: 4, svg: generateMap(hash >>> 0 || 1), width: 1000, height: 1000, paperColor: '#fff' });
  } catch (error) { self.postMessage({ type: 'painting-error', message: String(error) }); }
};
