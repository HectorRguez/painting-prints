# Reaction Fields

Seeded Gray–Scott reaction–diffusion, rendered as layered vector concentration contours. The spots and connected fronts come from evolving two scalar fields; there are no stored pattern tiles or drawn worm templates. Three small, continuous parameter neighborhoods favor dividing spots, branching coral-like fronts, and labyrinths. These names describe the sampled neighborhoods, not a classifier or a guarantee for arbitrary overrides.

```js
import { reactionParameters, buildReaction, generateReaction } from './generate.js';

const controls = reactionParameters('tide-pool');
const study = buildReaction('tide-pool', {
  feed: .038, kill: .0608, diffusionU: .85, diffusionV: .42,
  duration: 2400, clusterCount: 2, clusterSeparation: .7,
});
// study.parameters, study.state.{u,v}, study.paths, study.metrics
const painting = generateReaction('tide-pool', { inkDensity: 0 });
// Actual, transparent, outlined SVG; no raster image embedded in the SVG.
```

## Model and papers

The implemented kinetics are

```
∂u/∂t = Du ∇²u − uv² + F(x,y)(1 − u)
∂v/∂t = Dv ∇²v + uv² − (F(x,y) + k)v
```

Here `F(x,y)` is `feed` plus an optional smooth linear gradient. Most of the domain starts at `(u,v)=(1,0)`. Seeded elliptical nuclei start near `(.5,.25)` with small, reproducible perturbations. Their count, size, elongation, orientation, aspect, and one-to-three-cluster arrangement are controls. All initial nuclei must clear the reservoir by twelve cells.

- **Implemented model:** John E. Pearson, *Complex Patterns in a Simple System*, Science 261, 189–192 (1993), [DOI 10.1126/science.261.5118.189](https://doi.org/10.1126/science.261.5118.189), [open primary paper](https://arxiv.org/pdf/patt-sol/9304003). Pearson demonstrates varied patterns from finite perturbations under the same two-species kinetics, including dividing spots. Our numerical units, initial geometry, boundary condition, and duration differ. In particular, these finite-amplitude patterns should not all be described as linear Turing instabilities.
- **Front-composition inspiration, different chemistry:** K. J. Lee, W. D. McCormick, Q. Ouyang, and H. L. Swinney, *Pattern Formation by Interacting Chemical Fronts*, Science 261, 192–194 (1993), [DOI 10.1126/science.261.5118.192](https://doi.org/10.1126/science.261.5118.192), [primary paper PDF](https://www.metabolic-economics.de/pages/seminar_theoretische_biologie_2007/literatur/schaber/Lee1992Science261.pdf). Their experimental front interactions and thresholded images motivated finite initial colonies and contour-based composition. This implementation does **not** simulate their ferrocyanide–iodate–sulfite chemistry.
- **Pattern-selection context, different equations:** Aric Hagberg and Ehud Meron, *Complex Patterns in Reaction–Diffusion Systems: A Tale of Two Front Instabilities*, Chaos 4, 477–484 (1994), [DOI 10.1063/1.166047](https://doi.org/10.1063/1.166047), [open primary paper](https://arxiv.org/pdf/patt-sol/9405001). Their analysis distinguishes front instabilities that lead to labyrinths and spot dynamics in another activator–inhibitor model. It informs the review of front behavior; those equations and their mechanism are not implemented here.
- **Contour topology:** Gregory M. Nielson and Bernd Hamann, *The Asymptotic Decider: Resolving the Ambiguity in Marching Cubes* (1991), [DOI 10.1109/VISUAL.1991.175782](https://doi.org/10.1109/VISUAL.1991.175782), [primary publication record](https://escholarship.org/uc/item/17p025zk). The shared marching-squares helper uses the corresponding bilinear saddle decision on ambiguous cells.

This is an artistic numerical model, not a calibrated simulation of any particular organism or chemical experiment. Long-time pattern selection can change near bifurcations; changing a parameter continuously does not imply that the final contour topology stays constant.

## Numerical choices and boundaries

Explicit Euler uses Float64 double buffers and a nine-point Laplacian: `.2` for each cardinal neighbor, `.05` for each diagonal, and `−1` at the center. The weights sum to zero, preserve quarter-turn/reflection symmetry, and make the leading spatial error more isotropic than a cardinal-only stencil. Spatial and time units are numerical; the diffusion coefficients include the grid-scale convention. Finite grid anisotropy still exists.

The outermost row and column remain a fixed `(1,0)` reservoir, rather than wrapping a pattern around a torus. Every 96 steps the generator checks a twelve-cell guard band. It stops if that band's `v` exceeds `.008`, before the visible concentration contours approach the rectangular reservoir. This is an early stop of the actual simulation, not a mask or a clipped silhouette. `metrics.elapsed`, `steps`, and `stoppedAtBoundary` disclose the actual integration. Requested time is rounded up to one step, and the guard is sampled in blocks.

No concentration clamping hides unstable updates. Overrides enforce `dt * max(Du,Dv) ≤ .85`, below this stencil's diffusion-only Euler stability limit of `1.25`; the extra margin allows for reaction dynamics. Numerical tests cover positivity, mass transfer, symmetry, and short-time temporal convergence. This empirical supported envelope is not a proof of stability for arbitrary initial fields supplied directly to the low-level solver.

`advanceReaction(state, parameters, steps)` in `solver.js` is the lower-level solver for numerical studies. It copies its input concentration arrays and accepts an optional fixed `feedField`. It does not apply the artwork's guard-ring stop or parameter validation. Use `resolveParameters` for supported artwork controls.

## Supported controls

All overrides are explicit, finite numbers. Unknown keys, out-of-range values, and fractional count/grid controls throw. Zero is respected where supported. `habit` is descriptive seeded metadata, not an override. Changing feed/kill can move a custom study outside that seeded neighborhood.

| Control | Supported range | Meaning |
| --- | --- | --- |
| `size` | integer 96–224 | Square simulation grid; default 176 |
| `feed`, `kill` | .024–.065; .057–.068 | Supply and removal rates |
| `diffusionU`, `diffusionV` | .65–1.15; .3–.6 | Numerical diffusion rates |
| `dt`, `duration` | .2–.8; 600–4200 | Integration step and requested time |
| `nuclei`, `seedRadius` | integer 3–24; 3–10 cells | Initial perturbation count and base radius |
| `seedElongation`, `noise` | 1–2.3; 0–.025 | Nucleus aspect and concentration perturbation |
| `spread`, `aspect` | .06–.29; .35–1 | Initial colony extent as a grid fraction and its aspect |
| `clusterCount`, `clusterSeparation` | integer 1–3; 0–.85 | Initial colony layout and separation within its extent |
| `rotation` | −π–π | Initial colony and nucleus orientation |
| `feedGradient`, `gradientAngle` | −.002–.002; −π–π | Linear environmental variation and direction |
| `threshold` | .08–.24 | Lowest displayed `v` isovalue |
| `contourSpacing`, `contourCount` | .025–.09; integer 1–4 | Concentration bands |
| `lineWidth`, `padding` | .7–1.8; 65–150 SVG units | Outline weight and 1000-unit page margin |
| `inkDensity` | 0–1 | Filled ink-band strength; zero gives outlined, unfilled contours |

These ranges are coupled. In addition to the time-step restriction, the requested `size² × ceil(duration/dt)` must be at most 180 million cell updates. The conservative initial-clearance requirement is `spread*size + 1.2*seedRadius*seedElongation < (size−1)/2−12`. Consequently, not every Cartesian combination in the table is accepted. For example, refining `dt` can require a smaller grid or shorter duration.

Defaults sample these kinetic neighborhoods continuously:

| Seeded neighborhood | Feed | Kill |
| --- | --- | --- |
| Dividing spots | .031–.039 | `.0635 + .14*(feed−.035) ± .0004` |
| Coral fronts | .051–.057 | .0616–.0625 |
| Labyrinth | .034–.042 | .060–.0612 |

Other supported rate combinations can extinguish the initial perturbations, become nearly uniform, or produce less useful artwork. If no selected contours survive, generation reports extinction; it does not silently replace the seed, parameters, or simulation. The ranges are a numerical exploration envelope, not a promise that every combination makes a successful print.

## Vector output and review

Each concentration level is traced with shared, edge-stitched marching squares. Open contours are rejected; sub-cell loops below `.25` grid-cell area are omitted as below spatial accuracy. Closed loops are oriented with high concentration on their left, so outer boundaries and holes have opposite winding under SVG/canvas nonzero fill. All loops at a level form one compound path. Higher bands overlay lower ones with a restrained teal ink palette. The color bands represent the computed field rather than extra decorative shapes. Contours remain polylines; no smoothing changes their topology.

The SVG consists only of flat paths. Its exterior and holes are transparent, with actual colored interiors (`whiteToAlpha: false`). The same geometry is used by the fast preview and exported SVG/PNG/PDF.

Run `node --test tests/reaction.test.mjs tests/isocontours.test.mjs` for mathematical and geometry checks. Run `node scripts/art-review/reaction.mjs --count 48 --out /tmp/reaction-review --raster --width 1200` for the reproducible rendered review, contact sheet, exact parameters, field statistics, hashes, timings, and pixel bounds. Raster review requires the local Cairo `canvas` and `path2d` audit dependencies; generation itself has no new runtime dependency. See [the recorded review](../../../docs/reaction-review.md) for results and gallery links.
