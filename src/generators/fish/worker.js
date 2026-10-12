importScripts('unframe.js');
self.onmessage = async ({ data: { seed, engine = 'wasm' } }) => {
  try {
    importScripts('engine.js');
    if (engine !== 'javascript') {
      importScripts('../shared/wasm.js');
      const kernels = await ArtKernels.loadArtKernels(new URL('../shared/kernels-v1.wasm', location.href));
      seg_isect_poly = kernels.polygonIntersections;
    }
    jsr = str_to_seed(seed);
    const name = binomen();
    jsr = str_to_seed(name);
    const svg = unframeFish(draw_svg(cleanup(reframe(fish(generate_params()), 20, ''))));
    self.postMessage({ type: 'painting-ready', artRevision: 2, svg, width: 520, height: 320, paperColor: 'floralwhite' });
  } catch (error) { self.postMessage({ type: 'painting-error', message: String(error) }); }
};
