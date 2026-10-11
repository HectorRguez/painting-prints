// Line-art presentation of Mapgen4's original elevation and river algorithms.
import Mapgen from '../../vendor/mapgen4/map.ts';
import { choosePoints } from '../../vendor/mapgen4/generate-points.ts';
import { TriangleMesh } from '../../vendor/mapgen4/dual-mesh/index.ts';
import { Generator } from '../../tmp/map-constraints.ts';
import Delaunator from 'delaunator';

export function generateMap(seed: number) {
  const spacing = 8;
  const points = choosePoints(seed, spacing, 35);
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
  const elevation = { seed, island: .65, noisy_coastlines: .01, hill_height: .02, mountain_jagged: 0, mountain_sharpness: 9.8, mountain_folds: .05, ocean_depth: 1.4 };
  const constraints = new Generator();
  constraints.setElevationParam(elevation);
  map.assignElevation(elevation, { constraints: constraints.elevation, size: 128 });
  map.assignRainfall({ wind_angle_deg: seed % 360, raininess: .9, rain_shadow: .5, evaporation: .5 });
  map.assignRivers({ lg_min_flow: 2.7, lg_river_width: -2.4, flow: .2 });
  const paths: string[] = [];
  const point = (x, y) => `${x.toFixed(2)},${y.toFixed(2)}`;
  // March each triangulated elevation surface at equally spaced heights.
  // Group each level into one path to keep the exported SVG small.
  for (const level of [0, .06, .12, .18, .24, .30, .36, .42, .48, .54, .60, .66, .72, .78, .84, .90]) {
    let d = '';
    for (let t = 0; t < mesh.numSolidTriangles; t++) {
      const regions = mesh.r_around_t(t);
      const intersections: number[][] = [];
      for (let edge = 0; edge < 3; edge++) {
        const a = regions[edge], b = regions[(edge + 1) % 3];
        const ea = map.elevation_r[a], eb = map.elevation_r[b];
        if ((ea < level) === (eb < level)) continue;
        const fraction = (level - ea) / (eb - ea);
        intersections.push([
          mesh.x_of_r(a) + fraction * (mesh.x_of_r(b) - mesh.x_of_r(a)),
          mesh.y_of_r(a) + fraction * (mesh.y_of_r(b) - mesh.y_of_r(a)),
        ]);
      }
      if (intersections.length === 2) d += `M${point(...intersections[0])}L${point(...intersections[1])}`;
    }
    paths.push(`<path stroke-width="${level === 0 ? 1.5 : .55}" opacity="${level === 0 ? 1 : .68}" d="${d}"/>`);
  }
  for (let t = 0; t < mesh.numSolidTriangles; t++) {
    const s = map.s_downslope_t[t];
    if (s < 0 || map.elevation_t[t] < 0 || map.flow_s[s] < 2.5) continue;
    const next = mesh.t_outer_s(s);
    paths.push(`<path stroke-width="${Math.min(2.6, .5 + Math.sqrt(map.flow_s[s]) * .07).toFixed(2)}" d="M${point(mesh.x_of_t(t), mesh.y_of_t(t))}L${point(mesh.x_of_t(next), mesh.y_of_t(next))}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000"><g fill="none" stroke="#292722" stroke-linecap="round" stroke-linejoin="round">${paths.join('')}</g></svg>`;
}
self.onmessage = ({ data: { seed } }) => {
  try {
    let hash = 2166136261;
    for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    self.postMessage({ type: 'painting-ready', svg: generateMap(hash >>> 0 || 1), width: 1000, height: 1000, paperColor: '#fff' });
  } catch (error) { self.postMessage({ type: 'painting-error', message: String(error) }); }
};
