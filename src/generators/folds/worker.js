import { serve } from '../shared/port.js';
import { generateFolds } from './generate.js';
serve(generateFolds);
