import { preparePort } from '../shared/port-build.mjs';
export const prepare = output => preparePort(new URL('./', import.meta.url), output, ['LICENSE']);
