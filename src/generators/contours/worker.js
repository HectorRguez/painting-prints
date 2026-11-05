import { serve } from '../shared/port.js';
import { generateContours } from './generate.js';
serve(generateContours);
