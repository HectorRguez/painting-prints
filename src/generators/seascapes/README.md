# Sea and Small Boats

Seeded ink drawings range from quiet ripples and wind chop to broad rolling
swells and occasional large breaking waves. The large crests take their visual
cue from Hokusai's [Under the Wave off Kanagawa](https://www.metmuseum.org/art/collection/search/45434):
a broad rising water face, thin overhanging lip, flowing bands and branching
foam. They retain this gallery's monochrome ink style. No traced outline,
reference bitmap or fixed wave symbol is used at runtime.

A large foreground wave spans 740–940 canvas units and rises 225–300 units in
a 1414×1000 composition. Intermediate swells connect it to the surrounding sea.
Quiet scenes retain small ripples. See the
[48-scene review gallery](../../../docs/seascapes-review.md).

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

The visible crests illustrate that sea; they are not a fluid simulation.
Small crests use seeded cubic curves: crest position, shoulder, trough,
roundness, fall, span and height vary. Large crests use a rolled elliptical
water sheet joined to a curved shoulder and concave face. Its center is
`(span × lean, −rise + radiusY)` and its terminal angle is
`π × (1.5 + 0.48 × curl)`. The curl therefore changes continuously.
The non-overturning Gerstner field does not compute these overhangs.

`breakingWave(patch, overrides)` in `breaker.js` returns its sampled geometry
and chosen `parameters`. `patch` supplies `length`, `amplitude`, `phase` and
`shape` (`breaker` or `spilling`); `overrides` can adjust individual controls
while preserving the seeded detail. The app chooses these controls from the
seed and does not expose sliders. Supported design ranges are:

| Control | Seeded range | Effect |
| --- | --- | --- |
| `curl` | 0.18–0.48 spilling; 0.74–1 breaking | Continuous rotation of the lip |
| `radiusX` | 17–24% of span | Width of the rolled crest |
| `radiusY` | 43–57% of rise | Vertical curvature |
| `lean` | −0.12 to −0.025 of span | Crest displacement |
| `startAngle` | 1.03π–1.12π radians | Shoulder entry angle |
| `lipRatio` | 0.045–0.085 | Thickness = rise × ratio × curl |
| `flowBundles` | 5–8 | Unequal groups of tapered water strands |
| `foamClusters` | 5–8 | Unequal groups of foam lobes and branches |
| `foamScale` | 0.8–1.2 | Overall foam size |

Foam grows in the ellipse's local normal field, with coherent forward motion
and falling branch tips. Lobes and tapered ribbons overlap; only exposed
perimeter segments receive ink, avoiding seams between the foam pieces.
Irregular spacing, taper, stream length, branch lengths and spray vary by seed.
These bounded equations and ranges are art-direction constraints, rather than
a catalog of stored silhouettes. Local white faces hide distant marks; the
existing ink renderer removes their white after compositing.

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
revision 3 identifies the parametric rolled crests. Older cached seascapes regenerate once with their saved seed.

## Reproduce the review

```sh
node --test tests/seascapes.test.mjs tests/breaker.test.mjs
node scripts/art-review/seascapes.mjs --count 48 --out /tmp/seascape-review
```

The SVG audit has no extra dependencies. Open its `contact-sheet.svg` and
individual SVGs in a browser. `report.json` records hashes, generation times,
sea-state and boat-family counts, arrangements, wave heights, boat geometry and the exact controls for each breaking wave.

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
checks continuous crest controls, non-intersecting wave silhouettes, surface
inversion and tangents, non-overturning waves, deterministic
seeds, cache restoration, shared URLs and vector exports. The finite seeded
program offers many combinations; the batch proves uniqueness for the
reviewed seeds, not a mathematical infinity of possible drawings.
