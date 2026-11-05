# Interference

Interference superposes two or three indexed families of closed curves. Their small differences in spacing, position, phase, and deformation create visible moiré bands. Every carrier ring is generated from its mathematical definition and exported as a real SVG path. There are no bitmap interference textures, stored rosettes, or hand-drawn fringe templates.

The model describes geometric superposition of ink gratings. It does not solve a wave equation, simulate diffraction, compute optical amplitudes, or predict perceived brightness.

## API and reproducibility

```js
import {
  interferenceParameters, interferenceModel,
  transformCarrier, inverseCarrier, carrierIndex,
  buildInterference, generateInterference,
} from './generate.js';

const seed = 'orbit-study-17';
const controls = {
  family: 'warped', sourceCount: 2, pitch: 8.4, detune: 1.025,
  separation: 180, layoutJitter: .35, radiusVariation: .12,
  warp: 42, warpFrequency: 1.3, lineWidth: 1.6,
};
const parameters = interferenceParameters(seed, controls);
const sources = interferenceModel(seed, parameters);
const transformed = transformCarrier(sources[0], 100, 0);
const original = inverseCarrier(sources[0], ...transformed);
const index = carrierIndex(sources[0], ...transformed);
const scene = buildInterference(seed, controls);
const painting = generateInterference(seed, controls);
```

`interferenceParameters(seed, overrides = {})` resolves and validates controls. `interferenceFamilies` and `interferenceRanges` expose the valid names and numerical bounds. Seeded random streams determine source layout and geometry independently of ambient `Math.random()`; the same seed and overrides reproduce the same painting.

`interferenceModel` returns the complete source descriptors: center, maximum radius, pitch, aspect, angle, phase, shear amplitudes/frequencies, and shear phases. `carrierRing(source, index, chordError)` samples one transformed ring. `buildInterference` returns `{parameters, sources, rings, fit, paths, metrics}`; ring vertices remain in pre-fit model coordinates and `fit` maps them onto the page. The flat paths already contain fitted coordinates.

`generateInterference` returns the application painting object with a 1000×1000 SVG, `mode: 'interference'`, seed, `artRevision: 1`, resolved parameters, metrics, and paper/export metadata. The worker uses this same generator. It needs no network request or new runtime dependency, and paintings are generated on demand and cached locally.

## Carrier mathematics

For source `i`, the untransformed ring with integer index `n` has radius

```
r_n = (n + phase_i) * pitch_i
pitch_i = pitch * detune^i
```

Indices begin at 1 and end at `floor(radius_i/pitch_i - phase_i)`. Thus `radius` limits a finite carrier family; it is not a disk fill or the radius of every ring. Changing radius, pitch, or phase can add or remove an outer ring at an integer-count boundary.

The planar map applies two ordered sinusoidal shears, an ellipse transform, rotation, and translation:

```
x1 = x + Ax * sin(pi*fy*y/R + px)
y1 = y + Ay * sin(pi*fx*x1/R + py)
(x2,y2) = (sqrt(aspect)*x1, y1/sqrt(aspect))
T(x,y) = center + rotate(angle, (x2,y2))
```

The second shear uses the already updated `x1`. Each shear has Jacobian determinant 1. The diagonal ellipse transform has determinant `sqrt(aspect)/sqrt(aspect) = 1`, and rotation also preserves area. The full map is globally invertible: undo the affine transform, subtract the vertical shear, then subtract the horizontal shear. Consequently the **analytic** rings of one source cannot fold or intersect each other, even at maximum supported warp. Different sources intentionally cross to create the superposition.

The inverse defines a continuous carrier index at any model-space point:

```
g_i(x,y) = length(inverseCarrier_i(x,y))/pitch_i - phase_i
```

Each drawn analytic ring satisfies `g_i = n`. For two equal-pitch, exactly circular, unwarped sources, constant `g_1-g_2` means constant distance difference from the two centers, giving the familiar hyperbolic fringe geometry. The dedicated test constructs that exact limit. Default `circular` compositions are near-circular, with slight per-source aspect variation, so their fringes need not be exact hyperbolas.

The program draws the carrier rings, not additional difference-index curves. Large apparent bands emerge when the actual lines overlap. The index equation explains geometry; it does not select the most visible fringe order or specify its brightness.

## Papers and what is adapted

| Primary source | Connection to this generator | What is not claimed |
| --- | --- | --- |
| Isaac Amidror and Roger D. Hersch, *Mathematical moiré models and their limitations*, Journal of Modern Optics 57(1), 23–36 (2010). [DOI 10.1080/09500340903494629](https://doi.org/10.1080/09500340903494629); [open primary PDF](https://lspwww.epfl.ch/publications/moire/mmmatl.pdf), §2, especially equations 8–10. | Indexed carrier curves and their difference indices explain the superposition geometry. The circular-source case supplies an analytic hyperbola check. | The indicial model does not predict intensity profiles or guarantee which fringe order dominates. Our invertible shears are a construction for this artwork, not a reproduced optical experiment. |
| Isaac Amidror and Roger D. Hersch, *Fourier-based analysis and synthesis of moirés in the superposition of geometrically transformed periodic structures*, JOSA A 15(5), 1100–1113 (1998). [DOI 10.1364/JOSAA.15.001100](https://doi.org/10.1364/JOSAA.15.001100); [primary publisher record and abstract](https://opg.optica.org/josaa/abstract.cfm?uri=josaa-15-5-1100). | Broader context for separating the geometry of transformed layers from their periodic intensity profiles. | There is no implemented FFT, Fourier-spectrum synthesis, or intensity-profile reconstruction. |

## Complete parameter reference

Model lengths are numerical drawing units **before** the composition is fitted onto the page. All numerical bounds are inclusive. Defaults below are seeded intervals or discrete choices. Unknown keys, nonfinite numbers, out-of-range values, and fractional source counts throw; supported zero values are honored.

| Control | Supported range | Default | Role and interaction |
| --- | --- | --- | --- |
| `family` | `circular`, `elliptic`, `warped`, `triplet` | Seeded choice | Selects starting neighborhoods; explicit numerical overrides still apply. |
| `sourceCount` | Integer 2–3 | Triplet: 3; others: 2 | Number of carrier systems. More sources create denser crossing regions. |
| `radius` | 220–360 model units | 260–340 | Base maximum radial extent. Works with pitch and phase to determine ring count. |
| `radiusVariation` | 0–.30 | .06–.20 | Per-source radius factor lies in `1 ± radiusVariation`. Zero makes maximum radii equal. |
| `pitch` | 5–12 model units | 6.2–10 | Base radial spacing before deformation. Smaller values produce more rings and denser ink. |
| `detune` | .90–1.12 | .94–1.075 | Pitch multiplier from source to source. For three sources the factors are `1`, `detune`, and `detune²`. One gives equal pitches. |
| `separation` | 40–285 model units | Triplet: 90–220; others: 80–250 | Diameter of the nominal source-center layout circle. For two unjittered sources this equals their separation; for three it does not equal each pairwise distance. |
| `layoutJitter` | 0–1 | .15–.65 | Scales center-angle offsets of up to .4 radians and radial-offset variation of up to 35%. Zero gives the regular two/three-source layout. |
| `aspect` | .50–1.80 | Circular: .94–1.06; others: .58–1.65 | Base ellipse aspect, with an additional .94–1.06 seeded factor per source. Axis scales are `sqrt(aspect)` and its reciprocal. |
| `rotation` | −π–π radians | Seeded full range | Rotates both the center layout and base carrier orientations. |
| `angleDifference` | −.50–.50 radians | Circular: 0; others: −.32–.32 | Adjacent source orientation difference, distributed symmetrically around the base rotation. |
| `warp` | 0–75 model units | Warped: 30–65; triplet: 0–30; others: 0 | Base shear strength. Per-source horizontal amplitude is .6–1 times this value; vertical amplitude is −.8–.8 times it. Zero removes both shears. |
| `warpFrequency` | .50–2.50 | .65–1.80 | Base dimensionless shear frequency, independently varied by .85–1.15 per axis. The spatial period of an individual shear is `2*sourceRadius/frequency`. |
| `phase` | 0–1 ring periods | .12–.88 | Base fractional radial offset. Each source receives an additional seeded offset, modulo one. Endpoints 0 and 1 are periodic equivalents. |
| `chordError` | .08–.50 model units | .20 | Adaptive midpoint-to-chord tolerance; smaller values add vertices. It is a subdivision criterion, not a formal global Hausdorff bound. |
| `lineWidth` | .90–2.50 model units | 1.3–2.1 | Carrier stroke thickness; scales with the geometry during final fitting. Interacts strongly with pitch and raster resolution. |
| `hue` | 0–360 degrees | Seeded full range | Base ink hue. |
| `saturation` | 0–.50 | .05–.35 | Base ink saturation; the accent control adds up to .15 to the rendering saturation. |
| `accent` | 0–1 | 70% of seeds: 0; otherwise .35–1 | Changes later-source hue and lightness. Zero gives one common ink tone; geometry is unchanged. |

All source-level random quantities are available in `buildInterference(...).sources`. They are reproducible derived data rather than hidden overrides. For example, `layoutJitter: 0` regularizes the centers but does not disable seeded phase, aspect, or shear variation. `radiusVariation: 0` equalizes radius limits but does not equalize pitches unless `detune` is also 1.

To study one effect, keep the seed fixed and vary one control. Adjust `detune` for radial beat spacing, `angleDifference` for relative ellipse orientation, `warp` for nonlinear deformation, or `layoutJitter` for an irregular center layout. Increasing radius while keeping pitch fixed adds rings, but final fitting also shrinks the entire arrangement. Increasing line width does not move analytic carriers; it changes the apparent contrast and can close white gaps in a dense print.

Integer source counts and ring counts are discrete. Phase wraps modulo one. Geometry of an existing analytic ring varies continuously with the continuous controls, but the finite set of displayed rings can change at an outer-count boundary; no claim of a globally smooth SVG string is made.

## Sampling, page fit, and vector export

Each ring starts with 32 angular sectors. A sector is split recursively when the transformed midpoint differs from the chord midpoint by more than `chordError`, up to depth 10. This samples the deformation itself, rather than drawing a low-resolution circle and moving only its corners. The analytic map is exact; the resulting SVG is a finite polyline approximation.

All ring vertices are fitted together, with uniform scale and translation, into the central 860×860 region of the 1000×1000 page. Centerlines therefore occupy coordinates 70–930 on at least one dimension, with extra space on the other. Stroke widths scale by the same factor and can extend slightly beyond those centerline bounds. No SVG clipping mask crops the rings.

The exported SVG contains only closed, unfilled paths with rounded joins/caps. Its untouched page area is transparent, and paper color belongs to the surrounding application. Colors are actual inks; no white-to-alpha conversion is used. SVG downloads retain vectors. PNG previews rasterize those paths, and the application's current PDF exporter embeds a rendered PNG rather than preserving vector paths inside the PDF.

Metrics include source count, ring count, total sampled vertices, family, and `minimumPitch`. Despite its historical property name, `minimumPitch` is the **minimum nominal radial pitch times the final fit scale**. It is not a lower bound on Euclidean white space between deformed curves: anisotropy, shear, stroke width, and cross-source intersections all affect local gaps.

At small preview sizes, regular lines can alias into extra bands; this is especially visible in thumbnails and dense three-source compositions. Inspect the full-resolution output or SVG when evaluating fine line quality. The maximum-width/minimum-pitch stress configurations can appear nearly solid in places, despite valid carrier geometry. This is a meaningful limit of that parameter combination, not a claim of physical shadowing or constructive wave interference.

## Validation and reproduction

Six dedicated test groups connect the implementation to mathematical properties:

1. **Inverse and Jacobian:** eight maximum-warp source models, both extreme aspect values, and a 7×7 point grid per source. Round-trip error is below `1e-10`; finite-difference Jacobians differ from 1 by less than `1e-4`. This detects folding or an incorrect shear order.
2. **Curve refinement:** reduce chord tolerance from .5 to .08. Vertex count increases, polygonal area error decreases, and the fine area is within .1% of the preserved circle area. Vertices satisfy the inverse-derived ring index to `1e-10`.
3. **Analytic fringe identity:** exact unwarped circular sources with equal pitch are sampled along a known hyperbola. Their index difference stays constant to `1e-12`.
4. **48 defaults:** unique SVGs, all four families, useful ring counts, nominal pitch above 3 fitted units, finite page bounds, and every sampled vertex on its indexed analytic carrier to `1e-9`.
5. **Parameters:** Unicode-seed determinism survives unrelated `Math.random()` calls. Nearby changes to separation, aspect, rotation, warp, detune, and phase move an existing carrier point by a small nonzero amount. Unknown keys, infinity, negative radius, and fractional source count are rejected.
6. **Joint extremes:** eight combinations span the families, high warp/frequency, extreme aspect, fine/coarse pitches, detuning, center spacing, radius, line width, maximum layout jitter, and maximum radius variation. Requested controls are preserved and expected ring counts are checked from the source descriptors.

These analytic and numerical checks complement raster review. They do not prove perceptual contrast, a minimum white gap, or a global error bound for every sampled curve under every possible combination.

```sh
node --test tests/interference.test.mjs
node scripts/art-review/interference.mjs --count 48 --out /tmp/interference-review --raster --width 1200
node scripts/art-review/interference.mjs --extremes --out /tmp/interference-extremes --raster --width 1200
```

The audit uses the application's actual line renderer with local Cairo `canvas` and `path2d` audit dependencies. Reports retain seeds, exact resolved controls, timings, SVG/PNG hashes, path counts, metrics, raster coverage, and bounds. The [review gallery and recorded measurements](../../../docs/interference-review.md) include the default and extreme batches.
