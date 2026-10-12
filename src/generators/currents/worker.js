import computeStreamlines from './upstream/index.js';
import { serve, loadKernel, seedNumber, drawing, line } from '../shared/port.js';
serve(async seed => {
  const k = await loadKernel();
  k.seedNoise(seedNumber(seed));
  const paths = [];
  const tracer = computeStreamlines({
    boundingBox: { left: 0, top: 0, width: 1, height: 1 }, seed: { x: 0.5, y: 0.5 },
    dSep: 0.012, dTest: 0.008, timeStep: 0.003, stepsPerIteration: 10000, maxTimePerIteration: 1000,
    vectorField: p => { const a = k.angle(p.x, p.y); return { x: Math.cos(a), y: Math.sin(a) }; },
    onStreamlineAdded: points => paths.push({ d: line(points.map(p => [60 + p.x * 880, 60 + p.y * 880])), width: 0.75 }),
  });
  await tracer.run();
  return drawing(paths);
});
