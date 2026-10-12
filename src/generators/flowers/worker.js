importScripts('../shared/canvas.js');
self.onmessage = async ({ data: { engine = 'wasm' } }) => {
  try {
    if (engine === 'javascript') importScripts('upstream.js', 'generate.js');
    else {
      importScripts('../shared/wasm.js');
      self.artKernels = await ArtKernels.loadArtKernels(new URL('../shared/kernels-v1.wasm', location.href));
      importScripts('engine.js', 'generate.js');
    }
  } catch (error) { self.postMessage({ type: 'painting-error', message: String(error) }); }
};
