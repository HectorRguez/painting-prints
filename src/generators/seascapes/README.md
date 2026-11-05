# Sea and Small Boats

Seeded ink drawings range from quiet ripples and wind chop to broad rolling
swells and occasional large breaking waves. Four sea states vary both the
underlying wavelengths and the visible crest geometry. Rough scenes can have
a dominant foreground crest about 165–250 canvas units tall in a 1000-unit
composition, mixed with smaller unbroken swells. Curl opening, reach, shoulder,
foam edge and position vary; large curls are not stacked into repeated symbols.

Fleets contain two to eight boats, with varied spacing, depth and size. The six
families are battened sailboats, two-sail cutters, luggers, covered sampans, open
skiffs and small fishing boats with cabins. Hull curvature and freeboard, bow
rise, rig height and spread, canopy shape, heading and rigging are procedural.
There are no boat images or fixed SVG symbols. See the
[review gallery and full-size examples](../../../docs/seascapes-review.md).

## Water and composition

The low-frequency sea is a sum of three directional Gerstner components.
Their total steepness stays below 0.63, preventing the supporting surface from
folding over itself. Position inversion and analytic tangents let boat centers
and roll follow the same water field. Depth changes perspective, wave scale
and ink weight. This follows the construction and non-overturning condition
described by Mark Finch in [GPU Gems, chapter 1](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models).

The visible crests are an illustration of that sea, not a fluid simulation.
Low S-shaped ripples, pointed chop, asymmetric shoulders, broad swells, spilling
crests and overhanging breakers use different explicit curve profiles. The
illustrated overhangs are not computed by the non-overturning Gerstner field.
Irregular placement, tapered strokes, sparse hatching and open-water channels
avoid a regular mesh. Local white faces hide more distant marks; the existing
ink renderer removes their white after compositing.

Boats and crests are drawn in depth order. Placement rejects overlapping
vessels and foreground wave faces that would cut through a sail, figure or
cabin. Waves may cover the lower meniscus. The submerged keel is omitted, and
a short wake joins each hull to its waterline. Boat bounds include their rigs
and oars, not just their hulls. Requested fleets are reduced if a safely spaced
layout cannot fit. The open water and small vessels take their visual cue from
this repository's Shan Shui landscape renderer; the geometry is new code.

## Integration

`generate.js` is pure JavaScript. The build bundles `worker.js` as a classic
worker using the existing esbuild dependency. Generation needs no WASM or
network requests. Flat SVG paths work with the line preview, SVG/PNG exports,
PDF print layout and compressed browser cache. `bundled: false` means the first
view generates a new seed instead of shipping binary starter paintings. Art
revision 2 identifies this expanded wave and fleet design.

## Reproduce the review

```sh
node --test tests/seascapes.test.mjs
node scripts/art-review/seascapes.mjs --count 48 --out /tmp/seascape-review
```

The SVG audit has no extra dependencies. Open its `contact-sheet.svg` and
individual SVGs in a browser. `report.json` records hashes, generation times,
sea-state and boat-family counts, arrangements, wave heights and boat geometry.

For PNG specimens and JPEG documentation previews, install the optional local
review tools and use the actual app renderer:

```sh
npm install --no-save --package-lock=false canvas path2d
node scripts/art-review/seascapes.mjs --count 48 --raster --out /tmp/seascape-review
```

This produces `contact-sheet.png`, `seascapes-contact.jpg`, and full-size
`seascapes-large-wave.jpg`, `seascapes-calm.jpg`, and `seascapes-fleet.jpg`.
Raster previews use `renderLinePreview`, including its white-to-transparency
compositing. Canvas and Path2D are optional review dependencies, not runtime
requirements of the generator.

The test batch checks 48 distinct drawings, finite coordinates, margins,
separated boats, actual boat geometry within collision bounds, foreground
wave clearance, all sea states and boat families, and both headings. It also
checks surface inversion and tangents, non-overturning waves, deterministic
seeds, cache restoration, shared URLs and vector exports. The finite seeded
program offers many combinations; the batch proves uniqueness for the
reviewed seeds, not a mathematical infinity of possible drawings.
