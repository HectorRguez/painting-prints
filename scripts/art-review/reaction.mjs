import { reviewArt } from './review.mjs';
import { generateReaction, reactionParameters } from '../../src/generators/reaction/generate.js';

await reviewArt({ mode: 'reaction', generate: generateReaction, parameters: reactionParameters,
  describe: painting => painting.parameters.habit, examples: [0, 3, 8] });
