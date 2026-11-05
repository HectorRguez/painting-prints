import { reviewArt } from './review.mjs';
import { generateDunes } from '../../src/generators/dunes/generate.js';
import { resolveParameters } from '../../src/generators/dunes/model.js';

const index = process.argv.indexOf('--overrides');
const overrides = index < 0 ? {} : JSON.parse(process.argv[index + 1]);
await reviewArt({ mode: 'dunes', generate: seed => generateDunes(seed, overrides),
  parameters: seed => resolveParameters(seed, overrides),
  describe: painting => painting.parameters.morphology, examples: [0, 1, 6, 9, 33] });
