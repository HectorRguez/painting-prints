# Contours

Contours builds a continuous, seeded height field, samples it on a square grid, and draws filled elevation bands and shorelines as real SVG paths. Separated islands, ridges, depressions, and connected headlands emerge from the field. The four families choose arrangements and parameter neighborhoods; they are not stored coastlines or finished map templates.

The result is an imagined topographic print. There are no geographic coordinates, physical elevation units, tectonics, hydrology, or erosion simulation.

## API and reproducibility

```js
import {
  contourParameters, terrainModel, terrainHeight,
  buildContours, generateContours,
} from './generate.js';

const seed = 'island-study-17';
const parameters = contourParameters(seed, {
  family: 'caldera', spread: .39, peakWidth: .22,
  depression: .9, roughness: .18, levels: 22, hue: 205,
});
const model = terrainModel(seed, parameters);
const height = terrainHeight(model, .2, -.1); // Unnormalized, numerical height.
const scene = buildContours(seed, parameters);
const painting = generateContours(seed, parameters);
```

`contourParameters(seed, overrides = {})` resolves and validates every public control. `contourFamilies` and `contourRanges` expose the family names and numerical bounds. The same seed and controls reproduce the same result without using ambient `Math.random()` or the network.

`terrainModel` exposes the seeded peaks, valleys, finite wave spectrum, and parameters. `terrainHeight(model, x, y)` evaluates the analytic field in the coordinate domain `[-1,1]²`. `buildContours` returns `{parameters, model, field, maximum, paths, contours, metrics}`. `field` is a normalized Float64 grid; `maximum` records the raw sampled maximum. Contours include their normalized `level`, level `index`, and page-coordinate vertices. `paths` are the flat SVG drawing primitives.

`generateContours` returns the application painting object: a 1000×1000 SVG, `mode: 'contours'`, seed, `artRevision: 1`, parameters, metrics, and paper/export metadata. All geometry is generated locally. The worker runs this same generator; on-demand paintings use the application's cache rather than a stock-image collection.

## Mathematical construction

First rotate the query into terrain coordinates `(u,v)`. Two phase-shifted evaluations of a bounded finite Fourier sum displace those coordinates by `warp`. The spectrum contains three seeded directions per octave:

```
S(x,y) = sum_j a_j sin(kx_j*x + ky_j*y + phase_j) / sum_j a_j
frequency_o = frequency * lacunarity^o
a_o = lacunarity^(-hurst*o)
|k_o| = pi * frequency_o
```

Each positive peak is an oriented elliptical Gaussian. In its local coordinates `(a,b)`, with the widths already divided out, its contribution is `amplitude * exp(-(a²+b²)/2)`. Several narrower, elongated negative Gaussians make valleys. A separate radial negative Gaussian makes a controllable central depression. The resulting height is multiplied by `1 + 2.5*roughness*S(x,y)` and floored at zero.

The field has smooth radial support: it is unchanged for `r ≤ .77`, tapers between `.77` and `.96`, and is zero beyond `.96`. In the transition,

```
t = clamp((r - .77) / .19, 0, 1)
taper = 1 - (6*t^5 - 15*t^4 + 10*t^3)
height = max(0, perturbedHeight) * taper
```

The taper has zero first and second derivatives at its endpoints. It keeps positive contour levels away from the page boundary without cutting paths with an SVG clipping mask. The floor at zero can introduce a derivative change where a valley reaches zero; smoothness is not claimed everywhere at that floor.

Sampling uses the requested grid resolution, followed by normalization to its maximum. Three unfilled lower shore bands lie at `.34`, `.56`, and `.78` times `seaLevel`. The `levels` filled bands are evenly spaced from `seaLevel` through `.94`. Raising sea level can separate islands or expose holes; these topology changes are expected consequences of thresholding a continuous surface.

Marching squares interpolates intersections on grid edges and stitches shared edges into contours. Ambiguous saddle cells use a bilinear determinant decision, rather than an arithmetic mean of the four corners. This matters where two islands almost join. The contour vertices lie on the bilinearly interpolated sampled level; the straight segments between them approximate the curved isoline inside a cell.

Only closed loops with absolute area above `.4` grid-cell units are retained. High terrain is placed consistently on the left of each loop, so holes wind oppositely to exterior boundaries. Loops at the same level are combined in one nonzero-fill path. Higher filled bands overlay lower ones. No smoothing or independently drawn decorative shoreline changes the contour geometry.

## Papers and what is adapted

| Primary source | Idea used here | Scope of the adaptation |
| --- | --- | --- |
| James F. Blinn, *A Generalization of Algebraic Surface Drawing*, ACM Transactions on Graphics 1(3), 235–256 (1982). [DOI 10.1145/357306.357310](https://doi.org/10.1145/357306.357310); [open primary PDF](https://www.microsoft.com/en-us/research/wp-content/uploads/1982/07/p235-blinn.pdf), §2, pp. 237–238. | Sum Gaussian density contributions and extract threshold geometry. | Our own two-dimensional terrain field uses elliptical positive peaks, negative valleys, and finite Fourier perturbations. It does not implement the paper's molecular interpretation or three-dimensional rendering algorithm. |
| Gregory M. Nielson and Bernd Hamann, *The Asymptotic Decider: Resolving the Ambiguity in Marching Cubes*, IEEE Visualization '91, 83–91 (1991). [DOI 10.1109/VISUAL.1991.175782](https://doi.org/10.1109/VISUAL.1991.175782); [open primary PDF](https://graphics.stanford.edu/courses/cs164-10-spring/Handouts/paper_p83-nielson.pdf). | Resolve ambiguous bilinear face connectivity from the saddle rather than the corner average. | The shared helper applies this face-level principle to two-dimensional marching squares. No marching-cubes volume or three-dimensional mesh is constructed. |

The `hurst` control is an amplitude-decay exponent in a small, explicit Fourier sum. The generator does not claim an exact fractional Brownian field or a stochastic terrain process derived from an additional paper.

## Complete parameter reference

Lengths below use the analytic terrain domain `[-1,1]²`, unless another unit is stated. Numerical bounds are inclusive. Defaults are seed-selected intervals, not fixed constants. Integer controls reject fractional values; unknown controls and nonfinite/out-of-range numbers throw rather than being silently clamped.

| Control | Supported values | Default | Effect and interaction |
| --- | --- | --- | --- |
| `family` | `archipelago`, `caldera`, `ridge`, `headlands` | Seeded choice | Chooses peak arrangement and initial parameter neighborhoods. Overrides still apply afterward. |
| `resolution` | Integer 129–289 | 241 | Samples per axis. More samples reduce contour discretization error and increase work and SVG detail. |
| `peakCount` | Integer 3–12 | Archipelago: 6–10; others: 3–6 | Number of positive Gaussian peaks. Overlap means this is not an island count. |
| `spread` | .25–.74 | Archipelago: .52–.70; caldera: .30–.42; others: .40–.64 | Placement extent. Larger spread with narrow peaks tends to separate land masses; the fixed support still bounds the drawing. |
| `peakWidth` | .10–.30 | Archipelago: .105–.155; others: .19–.27 | Base Gaussian minor-axis width. Per-peak widths vary by .7–1.2; headland widths receive another factor of 1.1. |
| `elongation` | 1–2.3 | Ridge: 1.6–2.2; others: 1.05–1.6 | Base peak aspect multiplier, with .85–1.1 seeded variation. Major width is minor width times aspect. |
| `roughness` | 0–.30 | .12–.26 | Multiplicative finite-spectrum relief. Zero removes this modulation, but not Gaussian valleys or coordinate warp. |
| `warp` | 0–.13 | .025–.105 | Coordinate displacement amplitude per axis. Changes contour geometry before sampling. Zero removes this displacement only. |
| `frequency` | 1.5–3 | 1.6–2.8 | Lowest spectral frequency; base wavelength is `2/frequency` terrain units. Affects both roughness and coordinate warp. |
| `lacunarity` | 1.6–2.2 | 1.7–2.1 | Frequency multiplier between octaves; also participates in amplitude decay. |
| `hurst` | .55–1.05 | .60–.95 | Octave amplitude exponent. Larger values reduce the relative strength of fine-scale relief. |
| `octaves` | Integer 2–4 | 4 | Three seeded waves per octave. More octaves add smaller-scale structure, subject to sampling resolution. |
| `seaLevel` | .12–.38 of normalized maximum | Archipelago: .25–.35; others: .18–.28 | Threshold for the first filled band; controls coast connectivity and exposed depressions. |
| `levels` | Integer 10–28 | 15–24 | Filled elevation levels from sea level to .94, plus three unfilled lower shore bands. |
| `depression` | 0–1.2 raw field units | Caldera: .7–1.1; others: 0 | Central negative Gaussian amplitude. Its width depends on `.8*spread`; stronger values can open a lagoon. |
| `valleyDepth` | 0–.65 raw field units | Headlands: .30–.55; others: .04–.12 | Strength of seeded elongated negative Gaussians. Interacts with peak overlap and sea level. |
| `rotation` | −π–π radians | Seeded full range | Rotates the terrain frame, including its placement and texture. |
| `hue` | 0–360 degrees | One seeded interval: 15–48, 90–160, 170–195, or 195–225 | Changes ink color without changing the scalar field. |

Each model also exposes its seeded per-peak amplitudes, widths, angles, and aspects, its three-to-six valley descriptors, and every spectral direction/phase. These are derived model data, not additional top-level override keys. Families arrange peaks around a perturbed ring (`caldera`), along a gently varying axis (`ridge`), in a disk (`archipelago`), or in a compressed disk with outward orientations (`headlands`). None guarantees its namesake topology for every seed and override.

Useful controlled comparisons hold the seed fixed. Change `seaLevel` to study one landscape at different thresholds; change `roughness` while holding `warp: 0` to isolate height modulation; change `resolution` while keeping all other controls fixed to examine discretization. `resolution` also slightly changes the sampled normalizing maximum. Changing an integer count or the family is deliberately discrete. Small continuous control changes produce small height changes, but can still connect or split contour regions at a saddle.

## Drawing, metrics, and limitations

The analytic square maps to page coordinates 50–950 on a 1000-unit page. The compact support makes the actual margin larger; the drawing is not rescaled independently for each seed. This preserves meaningful composition-size differences. The exporter uses flat paths with rounded caps/joins. White-to-alpha conversion is disabled: the exterior and holes are transparent, while band interiors carry actual color. The application can place its paper color behind that artwork. SVG downloads retain vector geometry; PNG previews rasterize it, and the current PDF exporter embeds a rendered PNG.

Palette saturation and lightness vary with band index. Shore strokes are `.9` page units, every fifth filled level has a `1.65` stroke, and the other filled levels have `.55` strokes. These are fixed style decisions rather than public controls.

Metrics report contour count, grid resolution, family, coastline components (`islands`), coastline holes (`lagoons`), and `landFraction`. That fraction is the signed compound area at sea level divided by the entire 1000² page area; it is neither geographic area nor raster ink coverage. Holes and very small islands below the loop-area cutoff can disappear at coarse resolution. Extreme roughness and low resolution can expose polygonal sampling, so this should not be described as exact cartography or a physically evolved landscape.

## Validation and reproduction

Five generator test groups cover more than image hashes:

1. **48 seeds:** distinct SVGs, all four families, 12–499 retained loops, nonblank land fractions, finite bounds, and every contour vertex matching its bilinear grid level within `1e-9`. At levels 0, 5, and 10, up to 70 seeded probes compare compound winding with the height field; probes within `.012` of a level are omitted to allow polygonal approximation. The batch includes separated islands and actual holes.
2. **Spatial refinement:** compare 129² and 257² grids for each family. Raw maxima differ by less than .6%, page land fractions by less than .003, and the tested island counts agree.
3. **Continuity and boundary:** 80 directions per family verify a zero exterior, vanishing heights near the support boundary, and small response to a `1e-6` spatial displacement.
4. **Determinism and controls:** Unicode seeds reproduce the full painting despite calls to ambient `Math.random()`; six continuous controls receive nearby-value checks; invalid counts, infinity, and unknown keys are rejected.
5. **Joint extremes:** two opposing parameter combinations for each family exercise narrow/wide peaks, spread, count, dense levels, maximum warp/roughness, and strong valleys. Tests check that requests are honored and geometry remains finite, bounded, and nonblank.

Four shared contour tests add analytic-circle area convergence, correct open-plane endpoints, a saddle where the corner mean gives the wrong topology, annulus loops, deterministic exact ties, and invalid-input handling. These checks do not establish correctness for every possible override combination or a uniform approximation error bound over all fields.

```sh
node --test tests/contours.test.mjs tests/isocontours.test.mjs
node scripts/art-review/contours.mjs --count 48 --out /tmp/contours-review --raster --width 1200
node scripts/art-review/contours.mjs --extremes --out /tmp/contours-extremes --raster --width 1200
```

The raster audit uses the application's line renderer with local Cairo `canvas` and `path2d` audit dependencies. It saves each SVG/PNG, a contact sheet, and `report.json` with exact controls, hashes, times, path counts, metrics, and rendered ink bounds. Generation has no new runtime dependency. The [recorded review and gallery](../../../docs/contours-review.md) separates measured results from model claims.
