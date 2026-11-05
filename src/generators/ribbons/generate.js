import { randomSource, drawing, line } from '../shared/port.js';
import { ribbonParameters, resolveRibbonParameters } from './parameters.js';
import { ribbonField, adaptiveStep } from './field.js';
export { ribbonParameters, resolveRibbonParameters } from './parameters.js';
export { ribbonField, adaptiveStep, rk4Step } from './field.js';

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const normalize = point => { const d = Math.hypot(...point); return d ? point.map(v => v / d) : [0, 0]; };

export function pointSegmentDistance(point, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], squared = dx * dx + dy * dy;
  const t = squared ? clamp(((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / squared, 0, 1) : 0;
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
}
export function segmentDistance(a, b, c, d) {
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}

class SegmentGrid {
  constructor(size = .10) { this.size = size; this.cells = new Map(); }
  keys(a, b, radius) {
    const result = [];
    for (let x = Math.floor((Math.min(a[0], b[0]) - radius) / this.size); x <= Math.floor((Math.max(a[0], b[0]) + radius) / this.size); x++)
      for (let y = Math.floor((Math.min(a[1], b[1]) - radius) / this.size); y <= Math.floor((Math.max(a[1], b[1]) + radius) / this.size); y++) result.push(`${x},${y}`);
    return result;
  }
  add(segment) {
    for (const key of this.keys(segment.a, segment.b, segment.radius)) {
      if (!this.cells.has(key)) this.cells.set(key, []);
      this.cells.get(key).push(segment);
    }
  }
  close(a, b, radius, gap, exclude = () => false) {
    const visited = new Set();
    for (const key of this.keys(a, b, radius + gap)) for (const segment of this.cells.get(key) || []) {
      if (visited.has(segment) || exclude(segment)) continue;
      visited.add(segment);
      if (segmentDistance(a, b, segment.a, segment.b) < radius + segment.radius + gap) return true;
    }
    return false;
  }
}

function domain(parameters, point, radius = 0) {
  if (Math.max(Math.abs(point[0]), Math.abs(point[1])) + radius > 1) return false;
  const { center, radii, angle } = parameters.composition;
  const x = point[0] - center[0], y = point[1] - center[1], c = Math.cos(angle), s = Math.sin(angle);
  return ((x * c + y * s) / (radii[0] - radius)) ** 2 + ((-x * s + y * c) / (radii[1] - radius)) ** 2 < 1;
}

function traceBranch(parameters, field, seed, sign, width, lengthLimit, existing, local) {
  const { integration, ribbon } = parameters;
  const points = [seed]; let arc = 0, maxError = 0, refinements = 0;
  const velocity = point => {
    const v = field.velocity(point), speed = Math.hypot(...v);
    return speed > integration.minSpeed ? v.map(value => sign * value / speed) : [0, 0];
  };
  const selfGap = ribbon.spacing * .5;
  for (let i = 0; i < integration.maxSteps; i++) {
    const current = points.at(-1), tangent = velocity(current);
    if (Math.hypot(...tangent) < .5) return { points, arc, maxError, refinements, reason: 'stagnation' };
    let step = Math.min(integration.step, lengthLimit - arc), proposal;
    if (step <= integration.minStep) return { points, arc, maxError, refinements, reason: 'length' };
    // Bound the tangent turn too: an accurate integration can still sample a
    // tight bend too sparsely for a visually smooth offset polygon.
    for (let j = 0; j < 12; j++) {
      proposal = adaptiveStep(velocity, current, step, integration);
      if (!proposal) break;
      const nextTangent = velocity(proposal.point);
      if (tangent[0] * nextTangent[0] + tangent[1] * nextTangent[1] > .989) break;
      step = proposal.step / 2; proposal = null; refinements++;
      if (step < integration.minStep) break;
    }
    if (!proposal || distance(current, proposal.point) < integration.minStep * .25) return { points, arc, maxError, refinements, reason: 'accuracy' };
    const next = proposal.point, nextArc = arc + distance(current, next);
    if (nextArc > 8 * proposal.step && distance(next, seed) < 1.5 * proposal.step)
      return { points, arc, maxError, refinements, reason: 'loop' };
    if (!domain(parameters, next, width / 2 + .004)) return { points, arc, maxError, refinements, reason: 'boundary' };
    if (existing.close(current, next, width / 2, ribbon.spacing)) return { points, arc, maxError, refinements, reason: 'neighbor' };
    const neighborhood = 2.5 * width + 3 * integration.step;
    if (local.close(current, next, width / 2, selfGap, segment => Math.abs(sign * nextArc - segment.arc) < neighborhood))
      return { points, arc, maxError, refinements, reason: 'loop' };
    local.add({ a: current, b: next, radius: width / 2, arc: sign * (arc + nextArc) / 2 });
    points.push(next); arc = nextArc; maxError = Math.max(maxError, proposal.error);
    if (proposal.step < integration.step * .99) refinements++;
  }
  return { points, arc, maxError, refinements, reason: 'budget' };
}

function ribbonGeometry(centerline, nominalWidth, parameters, phase) {
  const arc = [0];
  for (let i = 1; i < centerline.length; i++) arc.push(arc.at(-1) + distance(centerline[i - 1], centerline[i]));
  const length = arc.at(-1), taperLength = Math.min(length * .4, parameters.ribbon.taper);
  const tangents = centerline.map((point, i) => {
    const before = centerline[Math.max(0, i - 1)], after = centerline[Math.min(centerline.length - 1, i + 1)];
    return normalize([after[0] - before[0], after[1] - before[1]]);
  });
  // A consistent 90-degree rotation of the oriented tangent has no Frenet
  // normal sign flip at zero curvature/inflections. This is a planar frame.
  const normals = tangents.map(([x, y]) => [-y, x]);
  const widths = arc.map((s, i) => {
    const envelope = Math.sin(Math.PI / 2 * clamp(s / taperLength, 0, 1)) ** parameters.ribbon.taperPower *
      Math.sin(Math.PI / 2 * clamp((length - s) / taperLength, 0, 1)) ** parameters.ribbon.taperPower;
    const breathing = .86 + .14 * Math.sin(phase + s * Math.PI / length) ** 2;
    const before = tangents[Math.max(0, i - 1)], after = tangents[Math.min(tangents.length - 1, i + 1)];
    const turn = Math.abs(Math.atan2(before[0] * after[1] - before[1] * after[0], before[0] * after[0] + before[1] * after[1]));
    const ds = arc[Math.min(arc.length - 1, i + 1)] - arc[Math.max(0, i - 1)];
    const curvature = turn / Math.max(ds, 1e-8);
    return Math.min(nominalWidth / 2 * breathing * envelope, .48 / Math.max(curvature, 1e-8));
  });
  // Carry curvature restrictions away from a tight turn instead of allowing
  // the offset to jump back to full width at the next coarse sample. This
  // Lipschitz envelope bounds |dw/ds| and prevents folded inner corners.
  for (let i = 1; i < widths.length; i++) widths[i] = Math.min(widths[i], widths[i - 1] + .18 * (arc[i] - arc[i - 1]));
  for (let i = widths.length - 2; i >= 0; i--) widths[i] = Math.min(widths[i], widths[i + 1] + .18 * (arc[i + 1] - arc[i]));
  const edge = fraction => centerline.map((point, i) => [point[0] + normals[i][0] * widths[i] * fraction, point[1] + normals[i][1] * widths[i] * fraction]);
  const left = edge(-1), right = edge(1);
  // Shared tip coordinates appear once, avoiding zero-length polygon edges.
  const polygon = [...left, ...right.slice(1, -1).toReversed()];
  return { centerline, normals, widths, polygon, arc, length, nominalWidth, edge };
}

function simplePolygon(polygon) {
  const grid = new SegmentGrid(.07);
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], checked = new Set();
    for (const key of grid.keys(a, b, 0)) for (const other of grid.cells.get(key) || []) {
      if (checked.has(other) || Math.abs(i - other.index) === 1 || Math.abs(i - other.index) === polygon.length - 1) continue;
      checked.add(other);
      if (cross(a, b, other.a) * cross(a, b, other.b) < -1e-20 && cross(other.a, other.b, a) * cross(other.a, other.b, b) < -1e-20) return false;
    }
    grid.add({ a, b, radius: 0, index: i });
  }
  return true;
}

function mixColor(a, b, t) {
  const rgb = color => [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
  const ca = rgb(a), cb = rgb(b);
  return '#' + ca.map((v, i) => Math.round(v + (cb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

export function buildRibbons(seed, overrides = {}) {
  const parameters = resolveRibbonParameters(seed, overrides), field = ribbonField(parameters);
  const random = randomSource(`ribbons:geometry:${seed}`), existing = new SegmentGrid(), ribbons = [], paths = [];
  const queue = []; let queueIndex = 0, attempts = 0, rejectedShort = 0, rejectedGeometry = 0;
  const toPrint = points => points.map(([x, y]) => [500 + 400 * x, 500 + 400 * y]);
  const candidate = () => {
    if (queueIndex < queue.length && random() < .80) return queue[queueIndex++];
    const { center, radii, angle, seedBias } = parameters.composition;
    const theta = random() * Math.PI * 2, radius = random() ** seedBias;
    const x = Math.cos(theta) * radii[0] * radius, y = Math.sin(theta) * radii[1] * radius;
    return [center[0] + x * Math.cos(angle) - y * Math.sin(angle), center[1] + x * Math.sin(angle) + y * Math.cos(angle)];
  };
  while (ribbons.length < parameters.ribbon.count && attempts < parameters.ribbon.count * 35) {
    attempts++;
    const point = candidate(), width = parameters.ribbon.width * (1 - parameters.ribbon.widthVariation * random());
    if (!domain(parameters, point, width / 2 + .005) || existing.close(point, point, width / 2, parameters.ribbon.spacing * 1.35)) continue;
    const local = new SegmentGrid(), length = parameters.ribbon.maxLength * (.8 + .2 * random());
    const forward = traceBranch(parameters, field, point, 1, width, length / 2, existing, local);
    const backward = traceBranch(parameters, field, point, -1, width, length / 2, existing, local);
    const centerline = [...backward.points.toReversed(), ...forward.points.slice(1)];
    if (forward.arc + backward.arc < parameters.ribbon.minLength || centerline.length < 12) { rejectedShort++; continue; }
    const shape = ribbonGeometry(centerline, width, parameters, random() * Math.PI * 2);
    if (!simplePolygon(shape.polygon)) { rejectedGeometry++; continue; }
    for (let i = 1; i < centerline.length; i++) existing.add({ a: centerline[i - 1], b: centerline[i], radius: width / 2 });
    // Nearby candidate seeds make deliberate bundles, with random restarts to
    // reach separated field basins. Exact segment distances control spacing.
    const stride = Math.max(2, Math.floor(.18 / parameters.integration.step));
    for (let i = stride; i < centerline.length - stride; i += stride) for (const sign of [-1, 1]) {
      const offset = width / 2 + parameters.ribbon.width / 2 + parameters.ribbon.spacing * (1.3 + random() * .35);
      queue.push([centerline[i][0] + sign * shape.normals[i][0] * offset, centerline[i][1] + sign * shape.normals[i][1] * offset]);
    }
    const choice = random(), palette = parameters.style.palette;
    const color = palette[Math.min(palette.length - 1, Math.floor(choice ** 1.7 * palette.length))];
    const filled = random() >= parameters.style.outlineFraction;
    const outline = filled ? mixColor(color, parameters.style.ink, .35) : parameters.style.ink;
    paths.push({ points: toPrint(shape.polygon), closed: true, fill: filled ? color : 'none', stroke: outline, width: parameters.style.lineWidth, role: 'ribbon' });
    const stripeCount = parameters.ribbon.stripes;
    for (let stripe = 1; stripe <= stripeCount; stripe++) {
      const fraction = -1 + stripe * 2 / (stripeCount + 1);
      // Stop interior marks just before a converged tip to avoid dark pinches.
      let points = [];
      const flush = () => {
        if (points.length > 2) paths.push({ points: toPrint(points), closed: false, fill: 'none', stroke: filled ? mixColor(color, '#f5f2eb', .48) : mixColor(outline, '#f5f2eb', .35), width: .42, role: 'stripe' });
        points = [];
      };
      shape.edge(fraction).forEach((point, i) => { if (shape.widths[i] > .0018) points.push(point); else flush(); });
      flush();
    }
    const { edge, ...geometry } = shape;
    ribbons.push({ ...geometry, filled, color, termination: [backward.reason, forward.reason], maxIntegrationError: Math.max(backward.maxError, forward.maxError), refinements: backward.refinements + forward.refinements });
  }
  if (!ribbons.length) throw new Error('No ribbon fits these field and spacing parameters');
  return { parameters, ribbons, paths, diagnostics: { attempts, rejectedShort, rejectedGeometry, count: ribbons.length, target: parameters.ribbon.count,
    totalLength: ribbons.reduce((sum, ribbon) => sum + ribbon.length, 0), maxIntegrationError: Math.max(...ribbons.map(ribbon => ribbon.maxIntegrationError)) } };
}

export function generateRibbons(seed, overrides = {}) {
  const { parameters, paths, diagnostics } = buildRibbons(seed, overrides);
  return { ...drawing(paths.map(path => ({ d: line(path.points, path.closed), fill: path.fill, stroke: path.stroke, width: path.width })), { rounded: true }),
    mode: 'ribbons', seed, artRevision: 1, parameters, traits: { family: parameters.family, ribbons: diagnostics.count, palette: parameters.style.palette }, metrics: diagnostics };
}
