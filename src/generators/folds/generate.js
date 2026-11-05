import { drawing, line } from '../shared/port.js';
import { traceContours } from './isocontours.js';
import { resolveFoldParameters, foldPalettes, companionParameters } from './parameters.js';
import { foldLighting, projectFold, projectionBounds } from './surface.js';
export { foldSurface, foldNormal, foldLighting, projectFold, projectionJacobian, projectionBounds } from './surface.js';
export { foldParameters, resolveFoldParameters } from './parameters.js';

const mix = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Simplify the already projected vector bands, so the stated tolerance is in
// page geometry rather than the distorted parameter domain.
function hasCrossing(points) {
  const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const edges = points.map((a, i) => { const b = points[(i + 1) % points.length];
    return { a, b, i, lo: Math.min(a[0], b[0]), hi: Math.max(a[0], b[0]),
      top: Math.min(a[1], b[1]), bottom: Math.max(a[1], b[1]) }; }).sort((a, b) => a.lo - b.lo);
  let active = [];
  for (const edge of edges) {
    active = active.filter(other => other.hi > edge.lo + 1e-8);
    for (const other of active) {
      const distance = Math.abs(edge.i - other.i);
      if (distance <= 1 || distance === points.length - 1 || other.bottom <= edge.top + 1e-8 || edge.bottom <= other.top + 1e-8) continue;
      if (orient(edge.a, edge.b, other.a) * orient(edge.a, edge.b, other.b) < -1e-8
        && orient(other.a, other.b, edge.a) * orient(other.a, other.b, edge.b) < -1e-8) return true;
    }
    active.push(edge);
  }
  return false;
}

export function simplifyLoop(points, tolerance = .08) {
  if (points.length < 5) return points;
  const distance2 = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], d = dx * dx + dy * dy;
    const t = d ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / d, 0, 1) : 0;
    return (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
  };
  const path = [...points, points[0]], keep = new Uint8Array(path.length);
  keep[0] = keep[path.length - 1] = 1;
  const stack = [[0, path.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let farthest = tolerance * tolerance, at = -1;
    for (let i = first + 1; i < last; i++) {
      const d = distance2(path[i], path[first], path[last]);
      if (d > farthest) { farthest = d; at = i; }
    }
    if (at !== -1) { keep[at] = 1; stack.push([first, at], [at, last]); }
  }
  const result = path.filter((_, i) => keep[i]).slice(0, -1);
  return result.length >= 3 && !hasCrossing(result) ? result : points;
}

function shade(palette, value, warmth) {
  const colors = foldPalettes[palette], t = clamp(value, 0, 1) * 2;
  const low = t < 1 ? colors[0] : colors[1], high = t < 1 ? colors[1] : colors[2];
  return `#${low.map((c, i) => Math.round(clamp(mix(c, high[i], t % 1) + warmth * [3, 1, -2][i], 0, 255))
    .toString(16).padStart(2, '0')).join('')}`;
}

function projectionGuard(p) {
  const { min, max } = projectionBounds(p);
  if (min * max <= 0 || Math.min(Math.abs(min), Math.abs(max)) / Math.max(Math.abs(min), Math.abs(max)) < .015) {
    throw new RangeError('Fold controls produce an overlapping or nearly singular sheet projection; reduce tilt, arch, or twist');
  }
  return { min, max };
}

function buildSheet(p) {
  const projection = projectionGuard(p), facets = [];
  const nu = p.pleats * 48, nv = 96, columns = nu + 3, rows = nv + 3;
  const values = new Float64Array(columns * rows); values.fill(-1);
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    values[(j + 1) * columns + i + 1] = foldLighting(p, i / nu, j / nv);
  }
  const sample = (x, y) => {
    x = clamp(x, 0, columns - 1.00001); y = clamp(y, 0, rows - 1.00001);
    const i = Math.floor(x), j = Math.floor(y), a = x - i, b = y - j;
    return mix(mix(values[j * columns + i], values[j * columns + i + 1], a),
      mix(values[(j + 1) * columns + i], values[(j + 1) * columns + i + 1], a), b);
  };
  for (let level = .1; level < .96; level += .018) {
    for (const contour of traceContours(values, columns, rows, level)) {
      const points = contour.points;
      let orientation = 0;
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
        if (length < 1e-8) continue;
        const x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2;
        const delta = sample(x - dy / length * .05, y + dx / length * .05)
          - sample(x + dy / length * .05, y - dx / length * .05);
        if (Math.abs(delta) > Math.abs(orientation)) orientation = delta;
      }
      if (orientation < 0) points.reverse();
      facets.push({ level, color: shade(p.palette, level, 0), points: points.map(([x, y]) =>
        projectFold(p, clamp((x - 1) / nu, 0, 1), clamp((y - 1) / nv, 0, 1))) });
    }
  }
  return { facets, projection, lightingGrid: { values, columns, rows, nu, nv } };
}

function fitTransform(lines, width, height, padding) {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const points of lines) for (const [x, y] of points) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  const scale = Math.min((width - 2 * padding) / (right - left), (height - 2 * padding) / (bottom - top));
  return ([x, y]) => [width / 2 + (x - (left + right) / 2) * scale, height / 2 + (y - (top + bottom) / 2) * scale];
}

export function buildFolds(seed, overrides = {}) {
  const parameters = resolveFoldParameters(seed, overrides), p = parameters;
  const sheets = [];
  if (p.composition === 'paired') {
    const other = companionParameters(seed, p);
    sheets.push({ parameters: other, ...buildSheet(other), scale: p.companionScale, offset: [p.separation * 900, -p.separation * 550] });
  }
  sheets.push({ parameters: p, ...buildSheet(p), scale: 1, offset: p.composition === 'paired' ? [-90, 55] : [0, 0] });
  for (const sheet of sheets) {
    const center = fitTransform(sheet.facets.map(facet => facet.points), 800, 800, 0);
    const transform = point => { const [x, y] = center(point); return [(x - 400) * sheet.scale + sheet.offset[0], (y - 400) * sheet.scale + sheet.offset[1]]; };
    sheet.project = (u, v) => transform(projectFold(sheet.parameters, u, v));
    sheet.facets.forEach(facet => { facet.points = facet.points.map(transform); });
  }
  const facets = sheets.flatMap(sheet => sheet.facets);
  const fit = fitTransform(facets.map(facet => facet.points), 1000, 1000, p.padding);
  facets.forEach(facet => { facet.points = simplifyLoop(facet.points.map(fit)); });
  const paths = [];
  for (const sheet of sheets) {
    const project = sheet.project;
    sheet.project = (u, v) => fit(project(u, v));
    const byLevel = new Map();
    for (const facet of sheet.facets) {
      if (!byLevel.has(facet.level)) byLevel.set(facet.level, { d: '', fill: facet.color, stroke: facet.color, width: .12 });
      byLevel.get(facet.level).d += line(facet.points, true);
    }
    sheet.paths = [...byLevel.values()];
    paths.push(...sheet.paths);
  }
  return { parameters, sheets, facets, paths };
}

export function generateFolds(seed, overrides = {}) {
  const scene = buildFolds(seed, overrides);
  return { ...drawing(scene.paths, { rounded: true }), mode: 'folds', seed, artRevision: 1,
    parameters: scene.parameters, metrics: { sheets: scene.sheets.length, bands: scene.paths.length,
      contours: scene.facets.length, vertices: scene.facets.reduce((sum, facet) => sum + facet.points.length, 0),
      surfaces: scene.sheets.map(sheet => ({ parameters: sheet.parameters, scale: sheet.scale,
        offset: sheet.offset, projectionJacobian: sheet.projection })) } };
}
