import { reviewArt } from './review.mjs';
import { generateBrushwork } from '../../src/generators/brushwork/generate.js';
const i = process.argv.indexOf('--overrides');
const overrides = i < 0 ? {} : JSON.parse(process.argv[i + 1]);
await reviewArt({ mode: 'brushwork', generate: seed => generateBrushwork(seed, overrides),
  describe: art => `${art.metrics.family} · ${art.parameters.palette} · ${art.metrics.strokes} strokes`, examples: [6, 11, 16, 22, 25, 26, 34] });
