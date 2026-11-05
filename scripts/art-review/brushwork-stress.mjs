import { reviewArt } from './review.mjs';
import { generateBrushwork } from '../../src/generators/brushwork/generate.js';
import { brushworkStressCases } from './brushwork-cases.mjs';
const index = seed => Number(seed.match(/(\d+)$/)[1]);
await reviewArt({mode:'brushwork',generate:seed=>generateBrushwork(seed,brushworkStressCases[index(seed)].controls),describe:(_,seed)=>brushworkStressCases[index(seed)].name,examples:[0,1,2,3]});
