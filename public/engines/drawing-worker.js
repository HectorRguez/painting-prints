importScripts('unframed-art.js');
self.onmessage = async ({ data: { mode, seed } }) => {
  try {
    let svg, width, height;
    if (mode === 'fish') {
      importScripts('../upstream/fishdraw/fishdraw.js');
      jsr = str_to_seed(seed);
      const name = binomen();
      jsr = str_to_seed(name);
      svg = draw_svg(cleanup(reframe(fish(generate_params()), 20, '')));
      width = 520; height = 320;
    } else throw new Error('Unknown drawing');
    svg = unframeDrawing(mode, svg);
    self.postMessage({ type: 'painting-ready', artRevision: 2, svg, width, height, paperColor: 'floralwhite' });
  } catch (error) { self.postMessage({ type: 'painting-error', message: String(error) }); }
};
