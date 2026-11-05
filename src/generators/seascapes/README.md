# Sea and Small Boats

A seeded ink drawing of open water, from quiet ripples to rolling swells, with
one to four small sailboats, covered sampans, or open skiffs. Hull curvature,
freeboard, sail spread and height, canopy shape, heading, rigging and position
are generated from the seed. There are no boat images or fixed SVG symbols.

The low-frequency sea is a sum of three directional Gerstner components.
Their total steepness stays below 0.63, preventing the surface from folding
over itself. Position inversion and analytic surface tangents let boat centers
and roll follow the same underlying water field. Depth changes perspective,
wave scale and ink weight. This follows the construction and non-overturning
condition described by Mark Finch in [GPU Gems, chapter 1](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models).

The visible marks are an illustration of that sea, not a fluid simulation.
Irregularly spaced asymmetric crest arcs, tapered strokes and hatching suggest
water without drawing a regular mesh. Local white shapes hide distant marks;
the existing ink renderer removes their white after compositing. Boats have
bounded, separated silhouettes, and their white hulls and sails occlude water
behind them. Their below-water keels are omitted, with a meniscus and wake
joining each vessel to its waterline. The open water and small vessels take
their visual cue from this repository's Shan Shui landscape renderer; the
geometry is a new implementation rather than an extraction of its boat art.

## Integration

`generate.js` is pure JavaScript. The build bundles `worker.js` as a classic
worker using the existing esbuild dependency. Generation needs no WASM or
network requests. Flat SVG paths work with the existing line preview, SVG/PNG
exports, PDF print layout and compressed browser cache. `bundled: false` means
the first view generates a new seed instead of shipping ten binary starter
paintings; the next visit restores the generated painting from the cache.

## Reproduce the review

```sh
node --test tests/seascapes.test.mjs
node scripts/art-review/seascapes.mjs --count 48 --out /tmp/seascape-review
```

Open `/tmp/seascape-review/contact-sheet.svg` in a browser, then inspect its
individual SVGs at full size. `report.json` records the seed, SHA-256 drawing
hash, generation time, path count, sea state and boat geometry for every image.
The test batch checks all 48 hashes, finite coordinates, margins, separated
boat silhouettes, both headings and all three boat families. It also checks
surface inversion and tangents, non-overturning waves, cache restoration,
shared URLs and vector exports. Pixel previews should be produced through
`renderLinePreview`, so white occlusion and transparency match the app.
