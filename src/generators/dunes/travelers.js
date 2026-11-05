import { randomSource, line } from '../shared/port.js';
import { mix } from './model.js';

const lerp3 = (a, b, t) => a.map((x, i) => mix(x, b[i], t));
const between = (r, a, b) => mix(a, b, r());

function curved(points, close = false, steps = 5) {
  const result = [], n = points.length;
  for (let i = 0; i < n - (close ? 0 : 1); i++) {
    const at = j => points[close ? (j + n) % n : Math.max(0, Math.min(n - 1, j))];
    const a = at(i - 1), b = at(i), c = at(i + 1), d = at(i + 2);
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      result.push(b.map((v, k) => .5 * ((2 * v) + (-a[k] + c[k]) * t
        + (2 * a[k] - 5 * v + 4 * c[k] - d[k]) * t * t
        + (-a[k] + 3 * v - 3 * c[k] + d[k]) * t * t * t)));
    }
  }
  if (!close) result.push(points.at(-1));
  return result;
}

// Articulated world-space figures. Every planted foot queries the same surface
// as the dune marks; a camera/depth test clips limbs behind foreground terrain.
export function figureGeometry(kind, center, height, heading, grid, seed, loadChance) {
  const r = randomSource(seed), forward = [Math.cos(heading), Math.sin(heading)];
  const across = [-forward[1], forward[0]], ground = grid.sample(...center).height;
  const primitives = [], feet = [], gait = between(r, -1, 1);
  const at = (x, y, z = 0) => [center[0] + forward[0] * x * height + across[0] * z * height,
    ground + y * height, center[1] + forward[1] * x * height + across[1] * z * height];
  const foot = (x, z) => {
    const p = at(x, 0, z); p[1] = grid.sample(p[0], p[2]).height + .12;
    feet.push(p); return p;
  };
  const stroke = (points, options = {}) => primitives.push({ points, width: .62, ...options });
  const shape = (points, fill = '#333333') => stroke(curved(points.map(p => at(...p)), true), { closed: true, fill, width: .66 });
  const ellipse = (x, y, rx, ry, z = 0) => Array.from({ length: 20 }, (_, i) => {
    const a = i * Math.PI / 10; return at(x + rx * Math.cos(a), y + ry * Math.sin(a), z);
  });
  if (kind === 'traveler') {
    const shoulder = between(r, .115, .16), hip = between(r, .09, .14), robe = between(r, .32, .46);
    for (const side of [-1, 1]) {
      const f = foot(side * (.11 + .09 * gait), side * .055);
      const pelvis = at(side * .045, robe + .08, side * .045);
      const knee = lerp3(pelvis, f, .55); knee[0] += forward[0] * height * .055 * side;
      knee[2] += forward[1] * height * .055 * side;
      stroke([pelvis, knee, f]);
      const toe = [...f]; toe[0] += forward[0] * height * .07; toe[2] += forward[1] * height * .07;
      toe[1] = grid.sample(toe[0], toe[2]).height + .12; stroke([f, toe]);
    }
    shape([[-hip, robe], [-shoulder, .73], [-.065, .81], [.055, .82], [shoulder, .72], [hip * 1.2, robe - .025]]);
    stroke(ellipse(0, .91, .071, .082), { closed: true, fill: '#333333', width: .66 });
    stroke(curved([at(-.06, .94), at(0, .95), at(.06, .93)]), { width: .35, stroke: '#ffffff' });
    const elbow = at(.2 + gait * .025, .6), hand = at(.25, .48 + gait * .08);
    stroke([at(shoulder, .73), elbow, hand]);
    stroke([at(-shoulder, .73, .04), at(-.22, .58, .04), at(-.14, .48, .04)], { width: .5 });
    if (r() < .65) {
      const staffFoot = at(.31, 0); staffFoot[1] = grid.sample(staffFoot[0], staffFoot[2]).height + .12;
      stroke([at(.27, .78), staffFoot], { width: .5 });
    }
    return { kind, center, height, heading, gait, feet, primitives, load: false };
  }
  const length = between(r, .98, 1.2), hump = between(r, .98, 1.12), neck = between(r, .86, .96);
  const loaded = r() < loadChance;
  for (const side of [-1, 1]) for (const end of [-1, 1]) {
    const x = end * length * .33, stride = .13 * gait * side + .025 * end;
    const f = foot(x + stride, side * .085);
    const hip = at(x, end > 0 ? .52 : .49, side * .08);
    const knee = lerp3(hip, f, .52);
    knee[0] += forward[0] * height * (end < 0 ? .045 : -.025);
    knee[2] += forward[1] * height * (end < 0 ? .045 : -.025);
    stroke([hip, knee, f], { width: side < 0 ? .52 : .68 });
    const toe = [...f]; toe[0] += forward[0] * height * .06; toe[2] += forward[1] * height * .06;
    toe[1] = grid.sample(toe[0], toe[2]).height + .12; stroke([f, toe], { width: .65 });
  }
  shape([[-.51 * length, .5], [-.43 * length, .62], [-.24 * length, .67], [-.09 * length, hump],
    [.07 * length, hump + .015], [.23 * length, .67], [.4 * length, .61], [.51 * length, .79],
    [.6 * length, neck], [.75 * length, neck + .015], [.81 * length, neck - .045],
    [.69 * length, neck - .085], [.61 * length, .72], [.55 * length, .48], [.3 * length, .42], [-.29 * length, .4]]);
  stroke([at(-.48 * length, .56), at(-.61 * length, .41), at(-.6 * length, .32)], { width: .6 });
  stroke([at(.61 * length, neck + .015), at(.59 * length, neck + .09), at(.65 * length, neck + .035)], { width: .55 });
  stroke(ellipse(.72 * length, neck - .02, .012, .012), { closed: true, fill: '#292929', width: .2 });
  if (loaded) {
    const load = between(r, .09, .15);
    shape([[-.23 * length, .61], [-.2 * length, .61 + load], [.1 * length, .64 + load], [.19 * length, .56], [.05 * length, .5], [-.23 * length, .52]], '#ffffff');
    stroke([at(-.13 * length, .78), at(-.07 * length, .55)], { width: .48 });
    stroke([at(.02 * length, .79), at(.08 * length, .56)], { width: .48 });
  }
  return { kind, center, height, heading, gait, feet, primitives, load: loaded, proportions: { length, hump, neck } };
}

export function placeTravelers(seed, grid, camera, visibility, p) {
  const count = p.travelerCount + p.camelCount;
  if (!count) return { figures: [], paths: [], strokes: [] };
  const r = randomSource(`${seed}:caravan`);
  const heading = p.figureHeading - p.cameraAzimuth;
  const baseScale = camera.scale * (camera.verticalScale ?? Math.cos(p.cameraElevation));
  const kinds = [...Array(p.travelerCount).fill('traveler'), ...Array(p.camelCount).fill('camel')];
  let best = [], bestScore = -Infinity;
  for (let attempt = 0; attempt < 95; attempt++) {
    const center = [between(r, -330, 330), between(r, -360, 380)];
    const origin = camera.project(center[0], grid.sample(...center).height, center[1]);
    const routeScale = Math.hypot(camera.scale * origin.perspectiveScale * Math.cos(heading),
      (camera.depthScale ?? Math.sin(p.cameraElevation) * camera.scale) * Math.sin(heading));
    const offsets = [0];
    for (let i = 1; i < count; i++) {
      const size = kind => (kind === 'camel' ? 48 : 18) * p.figureScale;
      const distance = Math.max(p.caravanSpacing, (size(kinds[i - 1]) + size(kinds[i])) / 2 + 6) / Math.max(.25, routeScale);
      offsets.push(offsets.at(-1) + distance);
    }
    const spacing = p.caravanSpacing / Math.max(.25, routeScale);
    const candidates = []; let score = 0;
    for (let i = 0; i < count; i++) {
      const distance = offsets[i] - offsets.at(-1) / 2;
      const bend = Math.sin(i * .6 + p.phase) * spacing * .15;
      const x = center[0] + Math.cos(heading) * distance - Math.sin(heading) * bend;
      const z = center[1] + Math.sin(heading) * distance + Math.cos(heading) * bend;
      const surface = grid.sample(x, z), projected = camera.project(x, surface.height + .15, z);
      if (surface.height < 6 || Math.hypot(surface.gx, surface.gz) > .65 || !visibility.visible(projected, 1.8)) continue;
      const height = (kinds[i] === 'camel' ? 23.5 : 15.5) * p.figureScale / baseScale;
      const figure = figureGeometry(kinds[i], [x, z], height, heading, grid, `${seed}:figure-${i}`, p.camelLoad);
      const top = camera.project(x, surface.height + height * 1.12, z);
      if (projected.x < camera.width / 2 - 500 || projected.x > camera.width / 2 + 500 || projected.y < camera.height * .25 || projected.y > camera.height * .865
        || top.y < camera.height * .16 || !visibility.visible(top, 1.8)) continue;
      const feetVisible = figure.feet.map(foot => visibility.visible(camera.project(...foot), 3));
      if (feetVisible.filter(Boolean).length < (figure.kind === 'camel' ? 2 : 1)) continue;
      const minFoot = Math.min(...figure.feet.map(foot => foot[1])), maxFoot = Math.max(...figure.feet.map(foot => foot[1]));
      if (maxFoot - minFoot > height * .32) continue;
      const outline = figure.primitives.flatMap(primitive => primitive.points.map(point => camera.project(...point)));
      figure.bounds = { left: Math.min(...outline.map(p => p.x)), right: Math.max(...outline.map(p => p.x)),
        top: Math.min(...outline.map(p => p.y)), bottom: Math.max(...outline.map(p => p.y)) };
      const box = figure.bounds;
      const halfPrint = camera.height * Math.SQRT2 / 2;
      if (box.left < camera.width / 2 - halfPrint + 12 || box.right > camera.width / 2 + halfPrint - 12) continue;
      if (candidates.some(other => box.left < other.bounds.right + 3 && box.right > other.bounds.left - 3
        && box.top < other.bounds.bottom + 3 && box.bottom > other.bounds.top - 3)) continue;
      figure.feetVisible = feetVisible; figure.id = i;
      candidates.push(figure);
      score += 100 + Math.min(3, projected.y / 250) - Math.hypot(surface.gx, surface.gz);
    }
    if (score > bestScore) { best = candidates; bestScore = score; }
    if (best.length === count && attempt > 15) break;
  }
  const paths = [], strokes = [];
  best.sort((a, b) => camera.project(...[b.center[0], grid.sample(...b.center).height, b.center[1]]).depth
    - camera.project(...[a.center[0], grid.sample(...a.center).height, a.center[1]]).depth);
  for (const figure of best) {
    for (const foot of figure.feet) {
      const ground = [-.13, -.065, 0, .065, .13].map(t => {
        const x = foot[0] + t * figure.height, z = foot[2];
        return [x, grid.sample(x, z).height + .15, z];
      });
      figure.primitives.unshift({ points: ground, width: .38 });
    }
    for (const primitive of figure.primitives) {
    const world = [];
    for (let i = 0; i < primitive.points.length - 1; i++) {
      const a = primitive.points[i], b = primitive.points[i + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(...a.map((v, j) => v - b[j])) / 2));
      for (let j = 0; j < steps; j++) world.push(lerp3(a, b, j / steps));
    }
    world.push(primitive.points.at(-1));
    const projected = world.map(point => camera.project(...point)), flags = projected.map(point => visibility.visible(point, 3));
    if (primitive.closed && flags.every(Boolean)) {
      paths.push({ d: line(projected.map(p => [p.x, p.y]), true), fill: primitive.fill || 'none', stroke: primitive.stroke || '#292929',
        width: primitive.width * p.lineWeight, role: 'figure' });
      strokes.push({ figure: figure.id, points: world, closed: true });
    } else {
      let run = [];
      const flush = () => {
        if (run.length >= 2) {
          paths.push({ d: line(run.map(i => [projected[i].x, projected[i].y])), fill: 'none', stroke: primitive.stroke || '#292929', width: primitive.width * p.lineWeight, role: 'figure' });
          strokes.push({ figure: figure.id, points: run.map(i => world[i]), closed: false });
        }
        run = [];
      };
      for (let i = 0; i < world.length; i++) { if (flags[i]) run.push(i); else flush(); }
      flush();
    }
    }
  }
  return { figures: best, paths, strokes };
}
