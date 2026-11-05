import { drawing, line, fitLines } from '../shared/port.js';
import { traceContours, signedArea } from '../shared/isocontours.js';
import { reactionParameters, resolveParameters, initialReaction } from './parameters.js';
import { advanceReaction, concentrationStatistics } from './solver.js';

export { reactionParameters };

// Nonzero fills need opposite windings around holes. Orient each contour with
// the higher concentration on its left, using the sampled field gradient.
export function orientHighLeft(points, values, size) {
  const sample = (x, y) => {
    x = Math.max(0, Math.min(size - 1.000001, x)); y = Math.max(0, Math.min(size - 1.000001, y));
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const i = iy * size + ix;
    return values[i] * (1 - fx) * (1 - fy) + values[i + 1] * fx * (1 - fy)
      + values[i + size] * (1 - fx) * fy + values[i + size + 1] * fx * fy;
  };
  let strongest = 0;
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length], dx = b[0] - a[0], dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    if (length < 1e-9) return;
    const x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2, nx = -dy / length * .05, ny = dx / length * .05;
    const difference = sample(x + nx, y + ny) - sample(x - nx, y - ny);
    if (Math.abs(difference) > Math.abs(strongest)) strongest = difference;
  });
  return strongest >= 0 ? points : points.toReversed();
}

export function buildReaction(seed, overrides = {}) {
  const parameters = resolveParameters(seed, overrides);
  let state = initialReaction(seed, parameters);
  const requestedSteps = Math.ceil(parameters.duration / parameters.dt);
  let steps = 0, statistics, stoppedAtBoundary = false;
  // Stop at a low-concentration guard ring, well before the active pattern
  // reaches the fixed reservoir. Nothing is clipped or masked to a frame.
  while (steps < requestedSteps) {
    const count = Math.min(96, requestedSteps - steps);
    state = advanceReaction(state, parameters, count);
    steps += count;
    statistics = concentrationStatistics(state, parameters.threshold);
    if (statistics.boundaryActivity > .008) { stoppedAtBoundary = true; break; }
  }
  const contours = [];
  for (let level = 0; level < parameters.contourCount; level++) {
    const threshold = parameters.threshold + level * parameters.contourSpacing;
    for (const contour of traceContours(state.v, parameters.size, parameters.size, threshold)) {
      if (!contour.closed) throw new Error('Reaction contour reached the reservoir');
      // Sub-cell specks are below the spatial accuracy of this simulation.
      if (Math.abs(signedArea(contour.points)) < .25) continue;
      contours.push({ ...contour, points: orientHighLeft(contour.points, state.v, parameters.size), threshold, level });
    }
  }
  if (!contours.length) throw new RangeError('These reaction parameters extinguish the pattern; change feed, kill or initial nuclei');
  const placed = fitLines(contours.map(contour => contour.points), 1000, 1000, parameters.padding);
  const colors = ['#304e50', '#658586', '#a1b4ae', '#c2ccc3'];
  const paths = contours.map((contour, i) => ({ ...contour, points: placed[i],
    width: parameters.lineWidth * (contour.level === 0 ? 1 : Math.max(.36, .72 - contour.level * .12)),
    stroke: colors[contour.level] }));
  return { parameters, state, paths, metrics: { ...statistics, steps, elapsed: state.elapsed,
    stoppedAtBoundary, contours: paths.length, nuclei: state.nuclei.length } };
}

export function generateReaction(seed, overrides = {}) {
  const scene = buildReaction(seed, overrides);
  const paths = [];
  for (let level = 0; level < scene.parameters.contourCount; level++) {
    const contours = scene.paths.filter(path => path.level === level);
    if (!contours.length) continue;
    const strength = scene.parameters.inkDensity * (.18 + level * .17);
    const color = [245, 242, 235].map((component, i) => Math.round(component + ([36, 77, 78][i] - component) * strength).toString(16).padStart(2, '0')).join('');
    paths.push({ d: contours.map(path => line(path.points, true)).join(''),
      fill: strength ? `#${color}` : 'none', stroke: contours[0].stroke, width: contours[0].width });
  }
  return { ...drawing(paths, { rounded: true }),
    mode: 'reaction', seed, artRevision: 1, parameters: scene.parameters, metrics: scene.metrics };
}
