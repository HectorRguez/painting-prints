import { prepareExport, pngBlob } from './export.js';
import wasmUrl from '@resvg/resvg-wasm/index_bg.wasm?url';
import { measureInk, measurePngInk, renderSvgPng, renderSvgPreview } from './ink-measurement.js';
import { artworkSvg } from './artwork-svg.js';
import { cacheEntry } from './painting-cache.js';
self.onmessage = async ({ data: { entry, assetUrl, settings, previewOptions = {} } }) => {
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
    const crop = painting.mode === 'landscapes' && previewOptions.cropLandscape;
    let offset = crop ? { x: 0, y: 0 } : cached.inkOffset;
    let preview;
    if (painting.mode === 'flowers') {
      // Nonflowers already provides its finished pixels. Avoid an SVG wrapper
      // and a WASM renderer download just to decode and align this PNG.
      preview = pngBlob(painting.transparentPng);
      offset ||= await measurePngInk(preview);
    } else if (painting.mode === 'landscapes') {
      const markup = artworkSvg(painting, false, !crop);
      const rendered = await renderSvgPreview(markup, crop ? 2048 : 4096, fetch(wasmUrl), !offset);
      preview = rendered.preview;
      offset ||= rendered.offset;
    } else {
      const markup = artworkSvg(painting, false, true);
      offset ||= await measureInk(markup, fetch(wasmUrl));
      preview = new Blob([markup], { type: 'image/svg+xml' });
    }
    if (painting.mode === 'landscapes') offset.x = 0;
    if (!crop) cached.inkOffset = offset;
    // Reopening any style can display its prepared preview directly. Keep its
    // complete compressed source separately for background and print exports.
    cached[crop ? 'cropPreviewBlob' : 'previewBlob'] = preview;
    self.postMessage({ entry: cached, preview, offset });
  } catch (error) { self.postMessage({ error: String(error) }); }
};
