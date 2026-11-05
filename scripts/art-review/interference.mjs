import { reviewArt } from './review.mjs';
import { generateInterference, interferenceFamilies } from '../../src/generators/interference/generate.js';
const extremes = process.argv.includes('--extremes');
const cases = interferenceFamilies.flatMap(family => [0, 1].map(t => ({ family,
  radius: t ? 360 : 220, pitch: t ? 5 : 12, warp: 75, warpFrequency: 2.5,
  aspect: t ? .5 : 1.8, detune: t ? .9 : 1.12, sourceCount: 3,
  lineWidth: 2.5, separation: t ? 40 : 285, layoutJitter: 1, radiusVariation: .3 })));
if (extremes && !process.argv.includes('--count')) process.argv.push('--count', '8');
if (extremes && !process.argv.includes('--prefix')) process.argv.push('--prefix', 'interference-stress');
await reviewArt({ mode: 'interference',
  generate: seed => generateInterference(seed, extremes ? cases[Number(seed.split('-').at(-1)) % cases.length] : {}),
  describe: art => `${art.metrics.family} · ${art.metrics.rings} rings`, examples: [0, 1, 3, 16] });
