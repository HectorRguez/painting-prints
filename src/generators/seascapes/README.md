# Sea and Small Boats

Seeded ink seascapes range from empty calm water to wind chop, rolling swells
and large breaking waves. Revision 4 gives the large waves an asymmetric rising
shoulder, pointed overhang, open concave face, tapered ink ribbons and thin
forked foam. Longer neighboring swells connect the crest to the foreground,
while a quieter distant gap leaves room for small working boats.

The visual reference is Hokusai's
[Under the Wave off Kanagawa](https://www.metmuseum.org/art/collection/search/45434).
We interpret its sweeping water mass, hollow opening, flowing dark/light bands
and irregular foam in this gallery's monochrome ink style. No reference image,
traced outline or stored wave/boat symbol is used at runtime. See the
[before/after comparison and reviewed galleries](../../../docs/seascapes-review.md).

## Water model and drawn geometry

The supporting sea sums three directional Gerstner components, following
Mark Finch's construction in
[GPU Gems, chapter 1](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models).
For each component, phase is `k*(dx*u + dz*distance) + phaseOffset`, horizontal
motion is `lateral*dx*cos(phase)`, and height is `amplitude*sin(phase)`.
The sum of `k*lateral` stays at or below 0.62, so the horizontal derivative
remains positive. Six Newton steps invert screen x to its surface parameter;
analytic tangents and the same field position every boat and its waterline.

Depth `d` controls perspective scale `s = 0.19 + 0.81*d`, represented distance
`460*(1/s − 1)`, and projected base height
`horizon + (855 − horizon)*d^1.35`. Fine distant crests, shorter marks and lower
ink contrast establish depth. The shapes drawn over this field are an artistic
interpretation, not a fluid simulation or a calculated breaking instability.

Small wave profiles use seeded cubic curves. Large waves use an asymmetric
shoulder and rim followed by two returning face curves. Given span `L` and
rise `A`, the peak is `(L*crestPosition, −A)` and the lip tip is:

```js
x = L * (crestPosition + overhang * (0.6 + 0.4 * curl));
y = -A * (1 - lipDrop * curl);
lipThickness = A * lipRatio;
```

Hollow depth, shoulder entry and lip fall vary continuously. The face curves
and their control relationships retain a simple silhouette over the supported
ranges. Ink ribbons widen toward the crest; fine, uneven hatching fills the
spaces between them. Only connected runs on the water sheet are retained,
and clipped ribbon ends taper. White foam branches grow in the rim's local
frame, fork, narrow and turn downward. Only exposed boundaries receive ink,
so overlapping branches join without internal seams. Foam tongues interrupt
the dark ribbons, and sparse spray varies in size and reach.

The primary storm crest spans 820–970 canvas units and nominally rises
270–350 units in a 1414 × 1000 composition. The lower margin can reduce its
height. Its off-center position, two larger neighboring swells, intermediate
crests and fewer small background marks are generated together. Quiet sea
states retain their more delicate wave patterns.

## Boats and placement

Default fleets now average about 1.5 requested boats under the seeded
probabilities. The reviewed first 48 seeds contain **1.77 boats on average**,
down from 5.48 in the previous review. Intentional empty seas are part of the
composition. Before placement, the discrete probabilities are:

| Boat count | Calm, wind sea, rolling swell | Breakers |
| --- | ---: | ---: |
| 0 | 15% | 20% |
| 1 | 31% | 40% |
| 2 | 41% | 36% |
| 3 | 11% | 4% |
| 4 | 2% | 0% |

The six families are battened sailboats, cutters, luggers, covered sampans,
open skiffs and small fishing boats. Storm scenes favor small skiffs, sampans
and fishing boats, keeping tall rigs out of those compositions. Hull curves,
freeboard, bow/stern rise, beam, rigging, canopy, heading and figure are all
procedural. Default storm hull lengths stay below 130 canvas units.

Boats and waves render in depth order. Placement bounds include rigs, figures,
oars and wakes. It rejects vessel collisions and nearer wave faces that would
cut a sail, figure or cabin. The hull stops at its waterline; a short meniscus
and wake anchor it to the same Gerstner surface. A requested count can be
reduced when the available clear water cannot fit it.

## Public controls

```js
import { seaParameters, buildSeascape, generateSeascape } from './generate.js';

const defaults = seaParameters('sea-42');
const painting = generateSeascape('sea-42', {
  regime: 'breakers', boatCount: 1, boatScale: 0.8,
  breaker: { curl: 0.85, overhang: 0.3, hollow: 0.32, foamScale: 1.1 },
});
```

All three functions accept scene overrides. Unknown controls, nonfinite values,
unsupported categories and out-of-range values throw. Inputs remain reusable;
overriding one scalar does not consume a different sequence of random values.
Changing the sea state changes its relevant default wave ranges.
`buildSeascape` also returns boats, crests, exact breaker parameters, placement
bounds and paths. `generateSeascape` includes the resolved sea record as
`parameters`; each breaker in the build result has its own resolved record.

| Scene control | Seeded default | Override range / units | Effect |
| --- | --- | --- | --- |
| `regime` | Calm 24%, wind sea 24%, rolling swell 30%, breakers 22% | Those four strings | Wave scales, composition and vessel selection. |
| `roughness` | Calm 0.18–0.42; wind sea 0.6–1.05; rolling swell 1.05–1.55; breakers 1.35–1.9 | 0.15–2, dimensionless | Supporting wave amplitudes and small drawn crests. |
| `direction` | −0.6–0.6 | −0.9–0.9 radians | Primary direction of the Gerstner components; each gets a small angular variation. |
| `steepness` | 0.32–0.62 | 0.1–0.62, dimensionless | Horizontal displacement; remains below the fold threshold. |
| `horizon` | 260–345 | 240–370 canvas units | Height of the distant water and depth projection. |
| `wind` | −1 or 1 | −1 or 1 | Mirrored crest direction, sail direction and storm composition. |
| `boatCount` | Probabilities above | Integer 0–4 | Requested vessels, subject to collision and wave clearance. |
| `boatScale` | 1 | 0.6–1.2 multiplier | Hull, rig, figure and placement-bound scale together. |
| `breaker` | Seeded per wave | Object using the table below | Overrides shared across the scene's breaking/spilling crests. |

`breakingWave(patch, overrides)` is also exported by `breaker.js`. `patch`
supplies positive `length` and `amplitude` in canvas units, a finite `phase`
and `shape` (`breaker` or `spilling`). These are the individual sheet controls:

| Breaker control | Seeded range | Allowed range / units | Effect |
| --- | --- | --- | --- |
| `curl` | Breaker 0.72–1; spilling 0.18–0.46 | 0.18–1 | Coupled forward reach, lip drop and hollow. |
| `crestPosition` | −0.155–−0.075 | −0.18–−0.035 of span | Peak displacement along the water sheet. |
| `shoulderWidth` | 0.28–0.37 | 0.24–0.4 of span | Breadth of the rising back curve. |
| `shoulderLift` | 0.18–0.3 | 0.05–0.4 of rise | Elevated shoulder entry that meets surrounding swells. |
| `overhang` | 0.23–0.32 | 0.18–0.34 of span | Forward lip projection, coupled with curl. |
| `lipDrop` | 0.34–0.51 | 0.24–0.55 of rise | Downward tip travel as curl increases. |
| `hollow` | 0.25–0.35 | 0.2–0.38, dimensionless | Concavity of the returning face through a bounded control-point interpolation. |
| `lipRatio` | 0.022–0.039 | 0.018–0.05 of rise | Thin outer-to-inner tip separation. |
| `flowBundles` | Integer 6–9 | Integer 5–11 | Unequally spaced groups of dark ribbons and fine water strands. |
| `flowSpread` | 0.8–1.12 | 0.7–1.2 multiplier | Sweep of the flow field within the same silhouette. |
| `foamClusters` | Integer 5–9 | Integer 4–11 | Unequal groups of narrow forked fingers. |
| `foamScale` | 0.8–1.15 | 0.65–1.3 multiplier | Foam bank, finger reach and spray displacement. |
| `sprayCount` | Integer 18–39 | Integer 0–60 | Detached droplets; zero removes them. |

These controls are geometric art-direction choices. Curl is not derived from
Gerstner steepness, and the drawing does not solve Navier–Stokes, wave impact,
boat dynamics or fluid transport. The Met reference guides visual structure;
GPU Gems guides only the bounded supporting surface.

## Integration and reproducible review

The existing esbuild dependency bundles the pure JavaScript generator as a
classic worker. There are no new runtime packages or network requests.
Flat SVG paths support preview, SVG/PNG/PDF exports and browser caching.
Art revision **4** travels through the worker and project metadata; older cached
seascapes regenerate with their saved seed.

```sh
node --test tests/seascapes.test.mjs tests/breaker.test.mjs
node scripts/art-review/seascapes.mjs --count 48 --raster --out /tmp/seascape-review
node scripts/art-review/seascapes.mjs --stress --raster --out /tmp/seascape-stress
node scripts/art-review/seascapes.mjs --seeds 2,7,25,33 --raster --out /tmp/seascape-detail
node scripts/art-review/seascapes.mjs --count 4 --raster --out /tmp/empty-sea \
  --overrides '{"regime":"calm","boatCount":0}'
```

Omit `--raster` for a dependency-free SVG audit. Raster review uses optional
local `canvas` and `path2d` packages to run the actual app renderer, including
white-to-alpha compositing. It writes SVG/PNG specimens, contact sheets,
JPEG examples and JSON records containing resolved parameters, hashes,
performance, boat distributions and raster bounds. The stress command renders
eight reproducible combinations of low/high controls.

Thirteen tests cover determinism, validated overrides, continuous controls,
256 boundary silhouettes, 64 independently seeded silhouettes, ribbon
self-intersection/containment, 48 default scenes, sparse fleet probabilities,
boat/foreground clearance, supporting surface inversion/tangents, parameter
extremes, caching/shared links/vector export and exact worker parity. The
[review document](../../../docs/seascapes-review.md) includes the actual metrics,
before/after hero, full gallery, stress gallery and downloadable JSON reports.
