import { line } from '../shared/port.js';
import { clamp, mix, dot } from './model.js';
import { shadeContours } from './contours.js';

const gray = value => `#${Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0').repeat(3)}`;

export function makeCamera(grid, p) {
  const co = Math.cos(p.cameraAzimuth), si = Math.sin(p.cameraAzimuth);
  const ce = Math.cos(p.cameraElevation), se = Math.sin(p.cameraElevation);
  const distance = p.perspective > 0 ? 850 / p.perspective : 1e9;
  const raw = (x, y, z) => {
    const cx = x * co - z * si, cz = x * si + z * co;
    const depth = distance + cz * ce - y * se;
    const scale = distance / depth;
    return { x: cx * scale, y: (-cz * se - y * ce) * scale, depth, perspectiveScale: scale };
  };
  const projected = [];
  for (let j = 0; j < grid.nz; j++) for (let i = 0; i < grid.nx; i++) {
    const h = grid.heights[j * grid.nx + i];
    if (h > 0.6) projected.push(raw(grid.x0 + i * grid.dx, h, grid.z0 + j * grid.dz));
  }
  const bounds = { left: Math.min(...projected.map(p => p.x)), right: Math.max(...projected.map(p => p.x)),
    top: Math.min(...projected.map(p => p.y)), bottom: Math.max(...projected.map(p => p.y)) };
  const scale = Math.min(1280 / (bounds.right - bounds.left), 695 / (bounds.bottom - bounds.top));
  const offset = [707 - (bounds.right + bounds.left) * scale / 2, 580 - (bounds.bottom + bounds.top) * scale / 2];
  const project = (x, y, z) => {
    const point = raw(x, y, z);
    return { ...point, x: point.x * scale + offset[0], y: point.y * scale + offset[1] };
  };
  return { project, scale, bounds, distance, direction: [-si * ce, se, -co * ce] };
}

export function depthBuffer(vertices, cells, width = 708, height = 501) {
  const depths = new Float64Array(width * height); depths.fill(Infinity);
  const shades = new Float32Array(width * height), coverage = new Float32Array(width * height);
  const sx = width / 1414, sy = height / 1000;
  const raster = (a, b, c) => {
    const ax = a.x * sx, ay = a.y * sy, bx = b.x * sx, by = b.y * sy, cx = c.x * sx, cy = c.y * sy;
    const determinant = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(determinant) < 1e-8) return;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const u = ((by - cy) * (x + 0.5 - cx) + (cx - bx) * (y + 0.5 - cy)) / determinant;
      const v = ((cy - ay) * (x + 0.5 - cx) + (ax - cx) * (y + 0.5 - cy)) / determinant;
      const w = 1 - u - v;
      if (Math.min(u, v, w) < -0.001) continue;
      const depth = 1 / (u / a.depth + v / b.depth + w / c.depth);
      const index = y * width + x;
      if (depth < depths[index]) {
        depths[index] = depth;
        shades[index] = depth * (u * a.shade / a.depth + v * b.shade / b.depth + w * c.shade / c.depth);
        coverage[index] = depth * (u * (a.coverage || 0) / a.depth + v * (b.coverage || 0) / b.depth + w * (c.coverage || 0) / c.depth);
      }
    }
  };
  for (const cell of cells) {
    const [a, b, c, d] = cell.indices.map(i => vertices[i]);
    raster(a, b, c); raster(a, c, d);
  }
  const visible = (point, tolerance = 4.5) => {
    const x = Math.floor(point.x * sx), y = Math.floor(point.y * sy);
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return point.depth <= depths[y * width + x] + tolerance;
  };
  return { width, height, depths, shades, coverage, visible };
}

// Smooth illumination along the projected surface, not across visibility
// breaks. Subtracting the local depth-plane slope lets a steeply viewed
// continuous face use the full kernel instead of becoming horizontal bands.
export function filterLighting({ shades, depths, width, height }) {
  const output = new Float32Array(shades.length), radius = 5;
  const weights = Array.from({ length: radius * 2 + 1 }, (_, i) => Math.exp(-((i - radius) ** 2) / (2 * 2.1 ** 2)));
  const slope = (a, b) => !Number.isFinite(a) ? (Number.isFinite(b) ? b : 0)
    : !Number.isFinite(b) || Math.abs(a) < Math.abs(b) ? a : b;
  for (let y = radius; y < height - radius; y++) for (let x = radius; x < width - radius; x++) {
    const index = y * width + x, depth = depths[index];
    if (!Number.isFinite(depth)) continue;
    const gx = slope(depth - depths[index - 1], depths[index + 1] - depth);
    const gy = slope(depth - depths[index - width], depths[index + width] - depth);
    let sum = 0, weight = 0;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const at = index + dy * width + dx;
      if (Math.abs(depths[at] - depth - gx * dx - gy * dy) > 6) continue;
      const w = weights[dx + radius] * weights[dy + radius];
      sum += shades[at] * w; weight += w;
    }
    output[index] = sum / (weight || 1);
  }
  return output;
}

export function sunlight(grid, p, x, z) {
  const surface = grid.sample(x, z);
  let normal = surface.normal;
  if (grid.dx && grid.dz) {
    // Filter only the illumination normal at the terrain sampling scale.
    // Heights and exact bicubic normals used by geometry stay unchanged.
    const rx = grid.dx * 1.7, rz = grid.dz * 1.7;
    const gx = (grid.sample(x + rx, z).height - grid.sample(x - rx, z).height) / (2 * rx);
    const gz = (grid.sample(x, z + rz).height - grid.sample(x, z - rz).height) / (2 * rz);
    const length = Math.hypot(gx, 1, gz); normal = [-gx / length, 1 / length, -gz / length];
  }
  const light = [Math.cos(p.lightAzimuth) * Math.cos(p.lightElevation), Math.sin(p.lightElevation), Math.sin(p.lightAzimuth) * Math.cos(p.lightElevation)];
  const diffuse = Math.max(0, dot(normal, light));
  const dx = Math.cos(p.lightAzimuth), dz = Math.sin(p.lightAzimuth), rise = Math.tan(p.lightElevation);
  const obstructionAt = t => grid.sample(x + dx * t, z + dz * t).height - surface.height - rise * t - 1.6;
  let obstruction = -Infinity, maximumAt = 6;
  for (let t = 6; t < 380; t += 20) {
    const value = obstructionAt(t);
    if (value > obstruction) { obstruction = value; maximumAt = t; }
  }
  // A coarse ray can skip a narrow crest and produce repeated scallops in a
  // moving shadow edge. Refine the peak continuously along the same ray;
  // already dark or clearly unobstructed rays need no extra samples.
  if (obstruction > -8 && obstruction < 9) {
    for (let t = Math.max(2, maximumAt - 20); t <= Math.min(380, maximumAt + 20); t += 2.5) {
      obstruction = Math.max(obstruction, obstructionAt(t));
    }
  }
  const shadow = clamp(obstruction / 9, 0, 1);
  return { diffuse, shadow, normal };
}

export function renderDuneTerrain(grid, ridges, p) {
  const camera = makeCamera(grid, p), vertices = [], cells = [], paths = [];
  for (let j = 0; j < grid.nz; j++) for (let i = 0; i < grid.nx; i++) {
    const x = grid.x0 + i * grid.dx, z = grid.z0 + j * grid.dz, h = grid.heights[j * grid.nx + i];
    const light = sunlight(grid, p, x, z);
    const shade = ((1 - light.diffuse) ** 1.7 * 0.25 + light.shadow * 0.23) * p.contrast * clamp(h / 5, 0, 1);
    vertices.push({ ...camera.project(x, h, z), world: [x, h, z], shade, coverage: clamp((h - 0.8) / 3, 0, 1), shadow: light.shadow });
  }
  let shadowCells = 0, surfaceCells = 0;
  for (let j = 0; j < grid.nz - 1; j++) for (let i = 0; i < grid.nx - 1; i++) {
    const indices = [j * grid.nx + i, j * grid.nx + i + 1, (j + 1) * grid.nx + i + 1, (j + 1) * grid.nx + i];
    const points = indices.map(index => vertices[index]);
    const x = grid.x0 + (i + 0.5) * grid.dx, z = grid.z0 + (j + 0.5) * grid.dz;
    const h = points.reduce((sum, point) => sum + point.world[1], 0) / 4;
    if (h > 0.2) {
      surfaceCells++;
      if (points.some(point => point.shadow > 0.5)) shadowCells++;
    }
    cells.push({ indices, depth: points.reduce((sum, point) => sum + point.depth, 0) / 4 });
  }
  const visibility = depthBuffer(vertices, cells);
  // Keep the original small coverage filter separate from the wider
  // illumination filter: shadow smoothing must not soften dune silhouettes.
  const coverage = new Float32Array(visibility.shades.length);
  const weights = [1, 4, 6, 4, 1];
  for (let y = 2; y < visibility.height - 2; y++) for (let x = 2; x < visibility.width - 2; x++) {
    const index = y * visibility.width + x;
    if (!Number.isFinite(visibility.depths[index])) continue;
    let sand = 0, weight = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const at = index + dy * visibility.width + dx;
      if (Math.abs(visibility.depths[at] - visibility.depths[index]) > 18) continue;
      const w = weights[dx + 2] * weights[dy + 2];
      sand += visibility.coverage[at] * w; weight += w;
    }
    coverage[index] = sand / (weight || 1);
  }
  visibility.lighting = filterLighting(visibility);
  // A separate pale surface fill keeps fully illuminated faces attached to the
  // dune, while all lighting thresholds and darker tones remain unchanged.
  const ground = shadeContours(coverage, visibility.width, visibility.height, 0.35);
  if (ground.d) paths.push({ d: ground.d, fill: p.palette === 'ochre' ? '#f6edde' : gray(249), stroke: 'none', width: 0, role: 'sand' });
  const shading = [];
  const colors = ['#f0e3cf', '#e7d2b5', '#d5b58f', '#bb926c', '#9c7352', '#785238'];
  for (const [index, level] of [0.025, 0.065, 0.115, 0.18, 0.27, 0.37].entries()) {
    const contours = shadeContours(visibility.lighting, visibility.width, visibility.height, level);
    const color = p.palette === 'ochre' ? colors[index] : gray(255 - level * 255 * 1.4);
    if (contours.d) paths.push({ d: contours.d, fill: color, stroke: color, width: 0.12, role: 'shade' });
    shading.push({ level, loops: contours.loops });
  }
  const lines = [];
  const ink = (world, role, width, tone, predicate = () => true) => {
    let segment = [], worldSegment = [];
    const flush = () => {
      if (segment.length > 2) {
        paths.push({ d: line(segment), fill: 'none', stroke: p.palette === 'ochre' ? (role === 'crest' ? '#71513e' : '#ac8966') : gray(tone), width, role });
        lines.push({ role, points: worldSegment, screen: segment });
      }
      segment = []; worldSegment = [];
    };
    for (const point of world) {
      const projection = camera.project(...point);
      if (projection.x < 65 || projection.x > 1349 || projection.y < 85 || projection.y > 935
        || !visibility.visible(projection) || !predicate(point)) { flush(); continue; }
      const previous = worldSegment.at(-1);
      // Newton's phase solution can switch branches where star arms meet.
      // A texture stroke must not bridge that discontinuity through the air.
      if (role === 'ripple' && previous && Math.hypot(point[0] - previous[0], point[1] - previous[1], point[2] - previous[2]) > 17) flush();
      segment.push([projection.x, projection.y]); worldSegment.push(point);
    }
    flush();
  };
  // Crest lines use the same sampled terrain and visibility as every ripple.
  for (const ridge of ridges) {
    const world = [];
    for (const segment of ridge.segments) for (let j = 0; j < 5; j++) {
      const t = j / 5, x = mix(segment.a[0], segment.b[0], t), z = mix(segment.a[1], segment.b[1], t);
      const requested = mix(segment.a[2], segment.b[2], t), h = grid.sample(x, z).height;
      world.push([x, h + 0.5, z, requested]);
    }
    // Buried skeletons do not leave artificial lines on a neighboring dune.
    ink(world, 'crest', 1.15, 54, point => point[1] > 3 && point[1] < point[3] + 3.5);
  }
  const wind = [Math.cos(p.windAzimuth), Math.sin(p.windAzimuth)], cross = [-wind[1], wind[0]];
  const extent = 1100, spacing = p.rippleWavelength;
  for (let u = -extent; u < extent; u += spacing) {
    const frequency = Math.sin(u * 91.73 + p.phase) * 43758.5453;
    if (frequency - Math.floor(frequency) > p.rippleDensity) continue;
    const world = [];
    for (let v = -extent; v < extent; v += 7) {
      const warp = p.rippleSlope * spacing * (Math.sin(v * 0.022 + p.phase) + 0.45 * Math.sin(v * 0.051 + u * 0.008));
      // Constant phase on the tilted surface: phi=wind·(x,z)+beta*h(x,z).
      // The terrain term bends ripples around horns and along local shoulders.
      const beta = Math.min(0.9, p.rippleSlope * 3.5);
      let along = u + warp;
      for (let step = 0; step < 6; step++) {
        const qx = wind[0] * along + cross[0] * v, qz = wind[1] * along + cross[1] * v;
        const h = grid.sample(qx, qz);
        const derivative = 1 + beta * (h.gx * wind[0] + h.gz * wind[1]);
        along -= clamp((along + beta * h.height - u - warp) / Math.max(0.2, derivative), -20, 20);
      }
      const x = wind[0] * along + cross[0] * v, z = wind[1] * along + cross[1] * v;
      const surface = grid.sample(x, z);
      const windward = surface.gx * wind[0] + surface.gz * wind[1];
      world.push([x, surface.height + 0.35, z, surface.height > 3 && windward > 0.018 && Math.abs(along + beta * surface.height - u - warp) < 0.1]);
    }
    ink(world, 'ripple', 0.5, 135, point => point[3]);
  }
  return { paths, camera, visibility, lines, shading, metrics: { surfaceCells, shadowCells, visibleCrests: lines.filter(line => line.role === 'crest').length,
    rippleStrokes: lines.filter(line => line.role === 'ripple').length } };
}
