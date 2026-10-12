# Bundled painting cache

The app ships ten generated paintings per style (60 total) in `public/cache/`. Landscapes load a pre-rendered 4096 × 1024 PNG directly, fetching their compressed SVG source only when an export needs it. Flowers load direct transparent PNG previews; Fish load 3200-pixel-wide PNG previews. Compressed originals are fetched separately for export. Opening a style automatically shows a random cached painting. Every click on Create generates a fresh painting; returning to an already opened style reuses its decoded preview immediately. The last displayed painting is also restored after a reload. Generation, decompression, preview rendering, and pixel-based centering run in cancellable workers. Fresh paintings and their landscape previews persist in IndexedDB where available.

To rebuild the starter collection, install dependencies and run `npm run prepare-generators`. Serve the repository with a static HTTP server, open `scripts/cache/bake.html`, and choose **Prepare paintings**. Keep that page open until **Save painting cache** becomes available. Extract the downloaded ZIP into `public/cache/`, run `node scripts/cache/measure-ink.mjs` to precompute centering, then rebuild the landscape and direct previews as described below before `npm run build`. The baker uses the same per-style workers as the app, without iframe wrappers. Seeds are recorded in the manifest and full painting payloads; artwork credits and export backgrounds are preserved.

Landscapes use 3200 × 800 panoramic sources for the viewer, with a centered 800√2 × 800 crop for every export. `node scripts/cache/widen-landscapes.mjs` rebuilds the ten panoramic starter landscapes and their ink offsets. Landscape revision 2 rejects older narrow browser entries.

After rebuilding the landscapes or the starter collection, run `node scripts/cache/render-landscape-previews.mjs` to replace the ten high-resolution preview images and update the manifest. Keep the `.json.gz` SVG sources for vector exports; these are separate from the screen previews. Then run `npm run build`.

Each landscape also includes a 2048-pixel-wide `cropPreviewAsset` containing exactly the central export composition for phones. Use `--crop-only` to rebuild those ten crops without re-rendering the desktop panoramas. Shared seed URLs look up the original starter collection even when personal paintings have displaced it from the bounded browser cache.

Prepare lightweight first-load previews for Flowers, Fish with `node scripts/cache/prepare-direct-previews.mjs`. Flowers use the original transparent PNG pixels; Fish are rasterized offline from their original SVG using resvg. Fresh runtime previews use the browser’s native canvas rasterizer, with minor antialiasing differences. All twenty retain their separate compressed print source and measured ink offsets. Run this after replacing these cached paintings or changing their artwork. No browser rendering is needed to build these previews.


The three additional styles use their native canvas renderer directly during baking.
To rebuild just those thirty previews and vector sources, open
`bake.html?styles=currents,cityscapes,buildings` on the same
static server. The ZIP includes a merged manifest, preserving existing styles.
Extract it into `public/cache/` and rebuild. These previews are 2400 pixels wide,
with transparent paper and measured ink offsets; no separate rasterization step
is needed for these styles.

Optionally run `python scripts/cache/optimize-png.py currents cityscapes buildings`
(requires Pillow) before building. It converts grayscale previews to PNG's
grayscale-plus-alpha encoding, checks every decoded pixel, and keeps only smaller
files. This reduces transfer size without changing resolution or transparency.
