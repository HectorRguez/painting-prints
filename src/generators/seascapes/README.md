# Sea and Small Boats

Revision 5 draws a true **3200 × 800 panorama**, with a centered
**800√2 × 800 print composition** matching Landscapes. Independently placed
side swells extend the water field; the SVG is not a horizontally stretched
version of a smaller scene. Boats and the main wave stay inside the print crop.

Large waves are deliberately simple: one broad shoulder, a short falling lip,
an open face, two or three interior strokes and a few tiny broken foam marks.
The previous dense ribbons, fine hatch field, branching foam and large hook
are removed. Calm water, wind chop, rolling swells and empty seas remain.
See the [review galleries and before/after](../../../docs/seascapes-review.md).

The earlier art reference,
[Hokusai's Under the Wave off Kanagawa](https://www.metmuseum.org/art/collection/search/45434),
now informs only the sweeping rise and short forward lip. The output is a
restrained geometric interpretation in the gallery's ink style, without a
traced outline, reference bitmap or stored boat symbol.

## Surface, projection and composition

The supporting surface sums three directional Gerstner components, following
Mark Finch's construction in
[GPU Gems, chapter 1](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models).
For each component, phase is `k*(dx*u + dz*distance) + phaseOffset`, horizontal
motion is `lateral*dx*cos(phase)`, and height is `amplitude*sin(phase)`.
The sum of `k*lateral` is at most 0.62, keeping the horizontal derivative
positive. Six Newton steps invert projected x; analytic tangents and the same
field position the boats and their waterlines.

Geometry uses a **4000 × 1000 logical world**. Depth `d` controls perspective
scale `s = 0.19 + 0.81*d`, distance `460*(1/s − 1)`, and projected base height
`horizon + (855 − horizon)*d^1.35`. A uniform 0.8 conversion is baked into every
SVG coordinate and stroke width, producing the 3200 × 800 source. Wavelengths
and boat proportions do not stretch when the scene becomes wide. The center
1000√2 logical units receive a deliberate major wave and the sparse fleet;
each side receives three independent larger swells and its own small marks.

The painting returns `width: 800*Math.SQRT2`, `height: 800` and
`previewWidth: 3200`. The project has `panoramic: true` and `ratio: Math.SQRT2`.
Preview panning changes the viewed region; exports always use the center crop.
Waves may cross the crop's left/right edges naturally, but vessels fit wholly
inside it. Top/bottom margins and the full panorama's outer edges stay clear.

Small wave profiles are seeded cubic curves. The larger spilling sheet uses
an asymmetric cubic shoulder, short rim, tiny tucked tip and falling face.
For span `L`, rise `A`, crest position `c`, projection `o` and curl `q`, the
peak is `(L*c, −A)` and the rim ends at:

```js
x = L * (c + o * (0.65 + q));
y = A * (-1 + lipDrop);
```

The tip then tucks back by `L*o*(0.25 + q)` while dropping
`A*(0.04 + 0.03*q)`. These short curves retain a simple silhouette across the
supported ranges. Default lip reach is below 7% of the wave span. The main
breaking wave spans 850–1080 logical units and rises 150–225, or roughly
680–864 × 120–180 source units before local surface tilt. Larger neighboring
swells join it to the sea. Sparse shoulder strokes stay inside the sheet;
foam strokes that enter the small air opening below the tip are clipped out.
White masks remove hidden background lines before white-to-alpha compositing.

This is an illustration, not a simulation of wave breaking, boat dynamics or
fluid transport. Gerstner steepness controls the supporting field; `curl`
controls the separate drawn sheet, without implying a physical relationship.

## Boats

Default fleets request about 1.5 boats on average. The reviewed 48 seeds
actually place **86 vessels, averaging 1.79**, including five empty seas.
Before collision/occlusion rejection, the probabilities are:

| Count | Calm, wind sea, rolling swell | Breakers |
| --- | ---: | ---: |
| 0 | 15% | 20% |
| 1 | 31% | 40% |
| 2 | 41% | 36% |
| 3 | 11% | 4% |
| 4 | 2% | 0% |

Battened sailboats, cutters, luggers, sampans, skiffs and fishing boats derive
from hull/rig/figure geometry. Breaker scenes use small skiffs, sampans and
fishing boats, with default hull lengths below 130 logical units (104 source
units). Placement bounds include rigs, figures, oars and wakes. Boats avoid
one another, the crop edges and any nearer crest that would cut through their
upper structures. Hulls stop at the waterline; short menisci and wakes follow
the supporting field. Requested counts can decrease if clear water runs out.

## Public controls

```js
import { seaParameters, buildSeascape, generateSeascape } from './generate.js';

const defaults = seaParameters('sea-42');
const painting = generateSeascape('sea-42', {
  regime: 'breakers', boatCount: 1, boatScale: 0.8,
  breaker: { curl: 0.25, overhang: 0.05, flowLines: 2, foamMarks: 3 },
});
```

Unknown controls, nonfinite values, unsupported categories and out-of-range
values throw. Inputs remain reusable. Overriding a scalar preserves unrelated
seeded controls; changing the regime changes its relevant wave ranges.
`buildSeascape` returns logical-world paths, crests, resolved breaker controls,
boats and collision bounds. `generateSeascape` returns source-unit SVG paths
and the resolved logical sea record as `parameters`.

| Scene control | Seeded default | Allowed range / units | Effect |
| --- | --- | --- | --- |
| `regime` | Calm 24%, wind sea 24%, rolling swell 30%, breakers 22% | Those four strings | Scale, crest type, composition and vessel families. |
| `roughness` | Calm .18–.42; wind sea .6–1.05; rolling 1.05–1.55; breakers 1.35–1.9 | .15–2, dimensionless | Supporting amplitudes and smaller crest relief. |
| `direction` | −.6–.6 | −.9–.9 radians | Gerstner direction, with per-component angular variation. |
| `steepness` | .32–.62 | .1–.62 | Horizontal displacement below the folding threshold. |
| `horizon` | 260–345 | 240–370 logical units | Distant water height and projected depth. Multiply by .8 for source units. |
| `wind` | −1 or 1 | −1 or 1 | Mirrors crests, sails and storm composition. |
| `boatCount` | Probabilities above | Integer 0–4 | Requested count subject to visibility and clearances. |
| `boatScale` | 1 | .6–1.2 | Scales hull, rig, figure, wake and collision bounds together. |
| `breaker` | Seeded per crest | Object below | Shared overrides for the scene's spilling crests. |

`breakingWave(patch, overrides)` accepts positive `length` and `amplitude` in
logical units, finite `phase`, and `shape` (`breaker` or `spilling`). Its points
are normalized by span/rise; ink widths are logical units.

| Sheet control | Seeded range | Allowed range / units | Effect |
| --- | --- | --- | --- |
| `curl` | Breaker .1–.32; spilling .1–.2 | 0–.45 | Short lip projection and tucked return, coupled with `overhang`. |
| `crestPosition` | −.1–.015 | −.14–.06 of span | Peak displacement along the sheet. |
| `shoulderWidth` | .27–.36 | .22–.4 of span | Rising shoulder breadth. |
| `shoulderLift` | .04–.12 | .02–.2 of rise | Shoulder entry height. |
| `overhang` | .035–.065 | .02–.09 of span | Lip reach; deliberately much smaller than revision 4. |
| `lipDrop` | .09–.17 | .06–.22 of rise | Downward travel along the short rim. |
| `flowLines` | Integer 2–3 | Integer 1–5 | Open interior shoulder strokes; no closed ink ribbons. |
| `flowSpread` | .8–1.1 | .6–1.2 multiplier | Spacing of interior strokes within the same silhouette. |
| `foamMarks` | Integer 2–4 | Integer 0–6 | Short broken rim strokes, possibly fewer after air-opening clipping. |
| `foamScale` | .8–1.1 | .6–1.3 multiplier | Foam stroke lengths and offsets. |

Revision 5 removes `hollow`, `lipRatio`, `flowBundles`, `foamClusters` and
`sprayCount`; callers should use the simpler controls above. Old values are
rejected rather than silently interpreted. The resolved sea record also
contains fixed dimensions, `printWidth`, `outputScale`, random texture phase
and the three wave components (`k`, amplitude, direction cosines, phase and
lateral displacement). They are derived metadata, not extra public overrides.

## Reproducible review

The pure JavaScript generator uses the existing esbuild worker bundle, flat
SVG paths, and no new runtime dependencies. Art revision **5** is present in
the painting and project metadata; the shared worker transports it unchanged.
Older cached seascapes regenerate from their saved seed.

```sh
node --test tests/seascapes.test.mjs tests/breaker.test.mjs
node scripts/art-review/seascapes.mjs --count 48 --raster --out /tmp/seascape-review
node scripts/art-review/seascapes.mjs --stress --raster --out /tmp/seascape-stress
node scripts/art-review/seascapes.mjs --seeds 25,33 --raster --out /tmp/seascape-detail
```

The audit writes full panorama and `-crop` SVG/PNG files, both contact sheets,
JPEG examples and JSON with parameters, hashes, timing, geometry and separate
raster bounds. It uses the application's line renderer, including masks and
white-to-alpha compositing, through optional native `canvas`/`path2d` packages.
Omit `--raster` for SVG-only review. Eight stress scenes exercise bounds and
sparse/dense overrides. All 56 reviewed sources, panoramas and crops have
unique hashes; this claim applies to the reviewed set, not all possible seeds.

Fourteen tests cover determinism, control continuity, 64 shape-boundary
combinations plus 64 seeded shapes, 128 interior-mark containment cases,
48 full scenes, true side geometry, center-crop vessel bounds, boat/wave
clearance, analytic supporting tangents/inversion, sparse fleet probabilities,
scene extremes, caching, centered vector exports and exact worker parity.
