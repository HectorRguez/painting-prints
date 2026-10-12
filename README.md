# Painting

A minimal procedural-art gallery with Flowers, Landscapes, Fish, and Maps.

**Live:** https://hectorrguez.github.io/painting-prints/

The interface uses Drawably controls and a transparent hand-drawn favicon. Each style keeps its latest image. First visits use a bundled collection of ten paintings per style; Create always creates a fresh image.

Every displayed artwork writes its seed to the URL, for example `fish/?seed=painting-stock-v1-fish-0`. Sharing or reopening that URL loads that exact cached painting or regenerates it from the same seed. Create creates a new URL, and browser Back/Forward restores prior seeds. Artwork framing adapts to the device; zoom and pan are not part of the link.

Generation, SVG preparation, centering, and export rendering run in Web Workers. Landscapes use a 4096-pixel-wide raster preview for smooth zooming; their cached source and SVG downloads remain vector. Other previews use SVG (flowers preserve their original raster artwork inside SVG). Landscapes display a panorama while exports crop the central composition. Downloads support SVG, PNG, and PDF, with A4/A3 settings and optional paper backgrounds; supported phones can share files directly.

Phones and narrow layouts show only the landscape's central export crop as a 2048-pixel-wide image. Desktop keeps the panorama and can zoom out to fit its full width. The download control always uses the same Download label and icon, including when the phone opens its native file sheet.

## Local development

Run `npm ci`, then `npm run dev`. Use `npm test` for checks and `npm run build` for the GitHub Pages output. Pushing to `main` runs the build/test/publish workflow.

See [cache instructions](scripts/cache/README.md) to rebuild the starter artwork.

## Code layout

```text
src/
  generators/
    flowers/       Nonflowers source, adapter, worker, WASM and build
    landscapes/    Shan Shui source, adapter, worker and build
    fish/          Fishdraw source, framing, worker, WASM and build
    maps/          Mapgen4 source, terrain/river SVG, worker, WASM and build
    shared/        Canvas compatibility and WASM loading/memory
  ...              Gallery UI, preview, download and cache code
public/cache/      Bundled starter artwork and direct previews
scripts/           Build, cache maintenance and benchmark tools
tests/             Behavior and artwork equivalence checks
docs/              Engine explanation and measured performance
```

To change a style, start in `src/generators/<style>/`. `project.js` holds its
caption/defaults, `worker.js` (or `.ts`) is its entry point, `generate.js` (or `.ts`)
contains the adapter, and `build.mjs` prepares its browser files. Fish uses its
original generator directly from its worker. `kernels.ts`/`wasm.js` contain that
style's optional accelerated calculations. Treat `upstream/` and its licenses as
unchanged reference snapshots.

`src/projects.js` is the small style registry. Every style is served at
`generators/<style>/worker.js`; the app, cache baker and benchmark use that same
entry point. Workers accept `{ mode, seed }` and return `painting-ready` or
`painting-error`; upstream flower/landscape scripts also read the seed from the
worker URL. The shared WASM binary is built once.

**Generated files stay out of Git.** `npm run prepare-generators` recreates
`public/generators/`; `npm run build` recreates `dist/`. Do not hand-edit either.
No generator source lives in `public/`, and no build step writes patched source
back into `src/`. New styles follow the same directory layout and register in
`src/projects.js` (plus their UI tab/routes).

## Artwork and attribution

Flowers, landscapes, and fish are based on work by **Lingdong Huang**. Maps are adapted from **Amit Patel / Red Blob Games**. Every page links to the original repository below its drawing. See [THIRD_PARTY.md](THIRD_PARTY.md) for source snapshots, licenses, modifications, and interface dependencies.

### Rendering efficiency

Every starter image has a direct preview asset: PNG for Flowers/Landscapes, SVG for Fish/Maps. Opening one does not decompress its print source or initialize a rendering worker. Newly generated previews are also retained in browser storage for all styles. Print sources remain independent, preserving vector exports and original flower paper backgrounds.

Fresh landscapes are rasterized once at full preview resolution; the same pixels determine their ink bounds. Phone crops use the export composition and skip ink alignment. Flowers use their native PNG directly and measure alignment in an offscreen canvas, avoiding an SVG wrapper and WASM download. Their two paper/transparent versions share one border calculation. Map hidden-line clipping reuses triangle coefficients and avoids per-test constraint/depth arrays. Generation and preparation remain in cancellable workers; the original geometry, random sequence, preview resolution and export sources are preserved.

Maps follow Mapgen4's original default mesh density, fixed mesh seed, elevation/rainfall settings and height-50 oblique projection. Flow-dependent curved rivers are sampled from the upstream shader and draped over the folded surface. Monochrome hatching replaces biome colors and raster shading; exports remain transparent SVG paths. Renderer revision 4 replaces the earlier map interpretation, so older map seed links now render with these updated settings. Rebuild starter maps with `node scripts/cache/rebuild-maps.mjs` followed by `node scripts/cache/prepare-direct-previews.mjs` (after preparing the engines).

Fresh Flowers, Fish and Maps use a small WebAssembly engine for pixel operations
and geometry clipping, alongside the original JavaScript generation rules. All
work remains off the main thread and seeded output is preserved. See
[engine details, measured improvements and benchmark instructions](docs/generation-engine.md).
