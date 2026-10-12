import { prepareExport, pngBlob } from './export.js';
import wasmUrl from '@resvg/resvg-wasm/index_bg.wasm?url';
import { measureInk, renderSvgPng } from './ink-measurement.js';
import { artworkSvg } from './artwork-svg.js';
import { cacheEntry } from './painting-cache.js';
self.onmessage = async ({ data: { entry, assetUrl, settings } }) => {
  try {
    let painting = entry;
    if (!painting.svg && !painting.png) {
      let payload = entry.payload;
      if (!payload) {
        const response = await fetch(assetUrl);
        if (!response.ok) throw new Error('Could not load painting');
        payload = await response.blob();
      }
      painting = await new Response(payload.stream().pipeThrough(new DecompressionStream('gzip'))).json();
      if (painting.mode !== entry.mode || painting.seed !== entry.seed) throw new Error('Cached painting mismatch');
    }
    if (settings) {
      const file = await prepareExport(painting, settings, (art, dimensions, background) =>
        art.mode === 'flowers' ? pngBlob(background ? art.png : art.transparentPng)
          : renderSvgPng(artworkSvg(art, background), dimensions?.width || 3200, fetch(wasmUrl)));
      self.postMessage({ file });
      return;
    }
    const cached = entry.svg || entry.png ? await cacheEntry(painting) : entry;
    const markup = artworkSvg(painting, false, true);
    const offset = cached.inkOffset || await measureInk(markup, fetch(wasmUrl));
    if (painting.mode === 'landscapes') offset.x = 0;
    cached.inkOffset = offset;
    // Rasterize the expensive panorama once, off the UI thread. Zooming reuses
    // this 4096 × 1024 preview; the cached source and exports retain the SVG.
    const preview = painting.mode === 'landscapes'
      ? await renderSvgPng(markup, 4096, fetch(wasmUrl))
      : new Blob([markup], { type: 'image/svg+xml' });
    if (painting.mode === 'landscapes') cached.previewBlob = preview;
    self.postMessage({ entry: cached, preview, offset });
  } catch (error) { self.postMessage({ error: String(error) }); }
};
