import { buildBuilding } from './upstream/src/index.js';
import { serve, loadKernel, randomSource, drawing, line, fitLines } from '../shared/port.js';
serve(async seed => {
  const k = await loadKernel();
  const random = randomSource(seed);
  const style = ['medieval', 'cozy', 'modern'][Math.floor(random() * 3)];
  const { scene } = buildBuilding(seed, { style, detail: 'medium', floors: 2 + Math.floor(random() * 2) });
  if (scene.items.length > 2000) throw new Error('Building is too complex');
  const boxes = new Float64Array(k.memory.buffer, k.boxesPointer(), scene.items.length * 6);
  scene.items.forEach((item, i) => boxes.set(item.bounds(), i * 6));
  k.sort(scene.items.length);
  const order = new Int32Array(k.memory.buffer, k.orderPointer(), scene.items.length);
  const faces = Array.from(order).flatMap(i => scene.items[i].faces)
    .filter(f => f.pts.length >= 3 && !/shadow|smoke|glow/.test(f.cls || '') && (f.opacity ?? 1) > 0.6);
  const count = faces.reduce((n, f) => n + f.pts.length, 0);
  if (count > 100000) throw new Error('Building is too complex');
  const points = new Float64Array(k.memory.buffer, k.pointsPointer(), count * 3);
  let offset = 0;
  for (const f of faces) for (const p of f.pts) { points.set(p, offset); offset += 3; }
  k.project(count); offset = 0;
  const polygons = faces.map(f => f.pts.map(() => { const p = [points[offset], points[offset + 1]]; offset += 3; return p; }));
  return drawing(fitLines(polygons, 1000, 1000, 85).map(points => ({ d: line(points, true), fill: '#ffffff', width: 0.85 })), { whiteToAlpha: true });
});
