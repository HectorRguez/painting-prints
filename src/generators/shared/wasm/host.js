import { createFlowerKernels } from '../../flowers/wasm.js';

// Shared worker-local WASM instance. All buffers are bounded by the current
// job and released when its worker terminates. No cross-origin isolation needed.
export async function loadArtKernels(url) {
  const response=await fetch(url);
  if(!response.ok)throw new Error('Could not load the drawing engine');
  return createArtKernels(await response.arrayBuffer());
}
export async function createArtKernels(bytes) {
  const { instance } = await WebAssembly.instantiate(bytes);
  return createFlowerKernels(instance.exports);
}
