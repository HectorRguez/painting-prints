import { line } from '../shared/port.js';
import { traceContours } from '../shared/isocontours.js';

function distance(point, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
}
function simplify(points, tolerance) {
  if (points.length <= 3) return points;
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let farthest = tolerance, index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = distance(points[i], points[first], points[last]);
      if (d > farthest) { farthest = d; index = i; }
    }
    if (index > 0) { keep[index] = 1; stack.push([first, index], [index, last]); }
  }
  return points.filter((_, i) => keep[i]);
}

// Shared marching squares traces the depth-tested illumination; this module
// only chooses fill winding and simplifies contours to print-scale geometry.
export function shadeContours(values, width, height, threshold, outputWidth = 1414, outputHeight = 1000) {
  const sample = (x, y) => {
    const i = Math.max(0, Math.min(width - 2, Math.floor(x))), j = Math.max(0, Math.min(height - 2, Math.floor(y)));
    const tx = Math.max(0, Math.min(1, x - i)), ty = Math.max(0, Math.min(1, y - j));
    const a = values[j * width + i], b = values[j * width + i + 1];
    const c = values[(j + 1) * width + i], d = values[(j + 1) * width + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
  const loops = [];
  for (const trace of traceContours(values, width, height, threshold)) {
    if (!trace.closed || trace.points.length < 7) continue;
    const points = trace.points;
    let direction = 0;
    for (let i = 0; i < points.length; i += Math.max(1, Math.floor(points.length / 9))) {
      const a = points[i], b = points[(i + 1) % points.length], dx = b[0] - a[0], dy = b[1] - a[1];
      const length = Math.hypot(dx, dy), x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2;
      if (length > 0) direction += sample(x + dy / length * 0.15, y - dx / length * 0.15)
        - sample(x - dy / length * 0.15, y + dx / length * 0.15);
    }
    if (direction < 0) points.reverse(); // High values stay to the right.
    const screen = points.map(([x, y]) => [(x + 0.5) * outputWidth / width, (y + 0.5) * outputHeight / height]);
    screen.push(screen[0]); loops.push(simplify(screen, 0.5));
  }
  return { d: loops.map(points => line(points, true)).join(''), loops };
}
