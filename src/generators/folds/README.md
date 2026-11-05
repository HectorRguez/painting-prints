# Folded Light

Folds draws broad decorative sheets with rounded pleats, curved free edges and
restrained color. A seed chooses a sweeping or open fan-shaped sheet, its
continuous shape controls, illumination, palette and placement. About 27% of
default compositions add a smaller complementary sheet behind the first.
All shapes and shading bands are ordinary filled SVG paths. There are no stored
silhouettes, image textures, SVG gradients or new runtime dependencies.

## Research and the model's limits

Two primary graphics papers inform the construction:

- James F. Blinn, **Simulation of Wrinkled Surfaces**, SIGGRAPH 1978,
  [DOI 10.1145/965139.507101](https://doi.org/10.1145/965139.507101),
  [Caltech/JPL record](https://authors.library.caltech.edu/records/8btac-nj102),
  [original paper](https://www.microsoft.com/en-us/research/wp-content/uploads/1978/01/p286-blinn.pdf).
  Its central idea is to change surface normals for illumination while retaining
  a simpler visible surface. We use that principle: sinusoidal relief determines
  the normals, while the smooth sheet determines the silhouette. Our displacement
  uses the sheet's height coordinate and a diffuse lighting model; this is not a
  reproduction of every equation or reflectance example in Blinn's paper.
- Chengcheng Tang, Pengbo Bo, Johannes Wallner and Helmut Pottmann,
  **Interactive design of developable surfaces**, ACM TOG 35(2), 2016,
  [author manuscript](https://miro.geometrie.tuwien.ac.at/geom/ig/publications/2015/developable2015/developable2015.pdf).
  Section 2, equation 1 describes a ruled patch between two boundary curves,
  `S(u,v) = (1−v) a(u) + v b(u)`. This guided the use of continuous boundary
  curves and cross-sheet coordinates, rather than independent fold stickers.
  Our twisting fans, relief and bowed ends do **not** enforce the paper's
  developability constraints or use its optimization solver.

The result is an artistic relief/bump-shaded sheet. It is not a physically
developable origami pattern, cloth simulation or manufacturing plan. Pleat
shadows are represented by local normal-based shading; there is no cast-shadow,
interreflection, thickness, self-contact or energy-minimization simulation.
Paired sheets use explicit whole-sheet ordering, not interwoven geometry.

## Geometry and lighting

The material domain is `(u,v) ∈ [0,1]²`. A smooth endpoint remapping bows the
two cut edges. With `e = endRound`, it replaces `u` by

```
u' = u + e (1−2u) ((2v−1)²−1/2) (exp(−u/.12) + exp(−(1−u)/.12)).
```

The sweep follows `C(u) = (L(u−1/2), B sin(1.6π(u−1/2)+phase/4))`.
Its transverse coordinate follows the unit normal to `C`; the width combines a
cosine taper and a low-frequency edge wave. The effective bend is limited to

```
B_eff = min(B, .9 L² / (W (1+edgeWave) (1.6π)²)).
```

This caps the curvature-width product of the planar offset strip before the
camera projection. The requested bend remains in the parameter record; this
derived geometric limit is part of the model, not a retry with a different seed.

A fan uses a continuously varying inner radius and width:

```
θ = (u−1/2) aperture + twist v²/2
r = innerRadius (1+edgeWave sin(3.8u+phase))
    + width v (1+edgeWave sin(4.3u−phase)).
```

The planar position is `(r cos θ, r sin θ)`. Both families also have a broad
arch and cross-sheet twist in their height coordinate. Rotation and positive
aspect scaling act on the geometry before illumination. A camera tilt projects
the sheet orthographically; `cameraRoll` rotates the resulting composition.

Pleat phase and relief are continuous equations:

```
φ = pleats (u + spacingVariation sin(2πu))
h = amplitude [½−½cos(2πφ)]^pleatRoundness
    [edgeLift + (1−edgeLift) sin(πv)^edgeSoftness].
```

`spacingVariation ≤ .08` keeps the phase derivative positive, so folds cannot
reverse their order. We compute `normalize(Su × Sv)` on the relief-displaced
surface with central differences in `u` and one-sided differences at the two
`v` boundaries. The numerical step is `1e−5` in material coordinates. The
upward normal receives diffuse illumination:

```
I = .12 + .82 max(0, normal · lightDirection).
```

The illumination field is sampled at 48 intervals per pleat and 96 across the
sheet. Marching squares uses shared edge identities and a bilinear saddle
decider. A narrow exterior guard forces closed contours; the illuminated side
sets loop winding so holes remain holes. Filled bands sample the palette at
levels `.1, .118, …, .946`, then map through the smooth sheet projection.
This is vector quantization of a smooth shading field, not an image embedded
inside the SVG.

Projected contour polylines are simplified with a maximum `.08` page-unit
deviation. A crossing check retains the original loop if simplification would
cross its own edges. There is a complete base fill beneath the shading bands,
which prevents exposed mesh-cell gaps. A `.12` unit matching-color stroke
covers antialias seams between neighboring filled bands.

## Projection and composition constraints

The default parameter factory checks its seeded camera before returning the
recipe. Most candidates already fit. For a narrow, high-arched fan that turns
away from the camera, it derives a feasible default tilt from
`J(t) = A cos(t) − B sin(t)`, where `A` is the face-on Jacobian and `−B` is the
edge-on Jacobian. A bound on `B/A` selects a tilt retaining at least half the
face-on factor at sampled points; a face-on pose is the conservative fallback.
The chosen value is recorded directly in `foldParameters(seed)`. The companion's
independent pose is checked after selecting its family and may use a smaller
tilt. No artwork or seed is regenerated to search for an acceptable result.

A 49×25 material grid checks the signed Jacobian of the smooth projected
surface before shading. The sign must stay constant and the smallest magnitude
must exceed 1.5% of the largest. Coupled controls that fail this check throw a
`RangeError`; explicitly overridden main-sheet controls are not silently
flattened, retried or replaced. Reducing
tilt, arch or twist usually restores a valid projection. This finite-grid check
is a practical guard, not a formal proof for every continuous point. Tests also
check densely sampled silhouettes and every generated filled loop for crossing.

Each sheet is normalized consistently, then placed in the shared composition.
The companion has the opposite family, a complementary palette and an
independent seeded shape. It is painted completely first. The main sheet's
opaque base and bands are painted afterwards, so overlaps have one clean
front/back order. The combined composition is finally fitted to its page margin.

## API and controls

```js
import { foldParameters, buildFolds, generateFolds } from './generate.js';

const defaults = foldParameters('silk-study');
const painting = generateFolds('silk-study', {
  family: 'fan', composition: 'paired', palette: 'peacock',
  aperture: 4.2, pleats: 18, amplitude: 20, innerRadius: 95,
  cameraRoll: -.7, companionScale: .65, separation: .28,
});
```

`foldParameters(seed)` returns the complete primary recipe.
`resolveFoldParameters(seed, overrides)` validates controls without mutating
the caller's object. `buildFolds` returns the sheet recipes, projection guards,
illumination grids, filled-loop geometry, paths and a `sheet.project(u,v)`
function for independent inspection. `generateFolds` returns the app's SVG
painting object, `mode: 'folds'`, `artRevision: 1`, the primary parameters and
`metrics.surfaces` with every derived sheet's parameters and placement.

All angles are radians and lengths use arbitrary material coordinates.
Unknown names, nonfinite numbers and unsupported choices throw. The ranges
below are individual control limits; combinations must also pass the projection
guard. Zero relief, tilt and curvature are meaningful supported controls.

| Controls | Supported values | Main effect |
| --- | --- | --- |
| `family` | `fan`, `sweep` | Polar opening or broad flowing strip |
| `composition` | `single`, `paired` | One or two ordered sheets |
| `palette` | `peacock`, `terracotta`, `indigo`, `saffron`, `rose` | Shadow/midtone/highlight colors |
| `pleats` | integer 8–32 | Fold count |
| `aperture`, `innerRadius` | 1.4–5.2; 45–200 | Fan opening and negative space |
| `width`, `length` | 150–380; 450–800 | Sheet breadth; sweep length |
| `amplitude`, `pleatRoundness` | 0–36; .6–1.8 | Relief and rounded/sharp lighting profile |
| `spacingVariation` | 0–.08 | Smoothly varying pleat spacing |
| `edgeLift`, `edgeSoftness` | .05–.5; .4–2 | Fold strength near free edges |
| `bend`, `twist`, `arch` | 0–100; −.8–.8; 0–95 | Broad sheet gesture |
| `edgeWave`, `taper`, `endRound` | 0–.35; 0–.45; 0–.09 | Asymmetry, waist and bowed cut ends |
| `phase` | −1000–1000 | Coherent edge-wave phase |
| `rotation`, `cameraRoll` | −π–π | Material rotation; image-plane rotation |
| `tilt`, `aspect` | 0–.6; .75–1.3 | Main-sheet viewing angle; positive planar stretch |
| `lightAzimuth`, `lightElevation` | −π–π; .3–1.3 | Coherent directional illumination |
| `companionScale`, `separation` | .45–.85; .1–.38 | Pair proportion and spacing |
| `companionRotation` | −π–π | Relative companion camera roll |
| `padding` | 80–170 | Page margin on a 1000×1000 canvas |

Fan aperture/radius do not affect a sweep; sweep length/bend/taper do not affect
a fan. Companion controls apply to paired compositions. The ten supported
studies in `review-cases.js` exercise intentionally different extremes, including
low contrast, dense folds, very broad/long sheets and close/open pair placement.

## Validation and repeatable review

```sh
node --test tests/folds.test.mjs
node scripts/art-review/folds.mjs --count 48 --out /tmp/folds-review
# Optional local Cairo tooling runs the actual app preview renderer:
npm install --no-save --package-lock=false canvas path2d
node scripts/art-review/folds.mjs --count 48 --raster --out /tmp/folds-review
node scripts/art-review/folds.mjs --studies --raster --out /tmp/folds-extremes
```

Tests cover analytic flat-sheet and annular-fan coordinates, surface normals,
Jacobian and illumination; the exact sinusoidal height derivative; rotation of
normals and light together; simplification error; independent nonzero-winding
agreement with the continuous lighting; actual paired-sheet overlap coverage;
48 distinct bounded compositions; all filled-loop crossings; ten extreme
studies; 512 additional default recipes and their companions; explicit rejection
of an unsafe override; and bundled-worker parity.

The raster audit records SVG/PNG hashes, exact parameters, surface metadata,
generation time, SVG size, path count, ink coverage and page-edge pixels. It
fails on duplicate, blank, saturated or clipped output. Its Cairo shim executes
the app's `renderLinePreview`; Canvas is optional review tooling, not a runtime
dependency. The [review gallery](../../../docs/folds-review.md) records the final
batch, examples and remaining approximation limits.
