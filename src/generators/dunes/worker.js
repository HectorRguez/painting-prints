import { serve } from '../shared/port.js';
import { generateDunes } from './generate.js';
serve(generateDunes);
