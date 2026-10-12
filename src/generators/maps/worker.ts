import { generateMap } from './generate.ts';
import { loadArtKernels } from '../shared/wasm/host.js';

self.onmessage = async ({ data: { seed, engine = 'wasm' } }) => {
  try {
    const kernels = engine === 'javascript' ? undefined : await loadArtKernels(new URL('../shared/kernels-v1.wasm', self.location.href));
    let hash = 2166136261;
    for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    self.postMessage({ type: 'painting-ready', artRevision: 4, svg: generateMap(hash >>> 0 || 1, kernels), width: 1000, height: 1000, paperColor: '#fff' });
  } catch (error) { self.postMessage({ type: 'painting-error', message: String(error) }); }
};
