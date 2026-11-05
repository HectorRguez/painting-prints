import { serve } from '../shared/port.js';
import { generateSnowflake } from './generate.js';

serve(generateSnowflake);
