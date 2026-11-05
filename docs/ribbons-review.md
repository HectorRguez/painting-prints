# Flow ribbons: model and review

The generator makes abstract bands from a shared smooth flow field. It contains
no traced images, stored SVG glyphs, or hand-authored ribbon control points.
Four visual families change the distributions of the same field and composition
parameters: drift-dominated sweeps, harmonic meanders, a single eddy, and paired
vortices. Seeded aspect ratios and orientation vary the overall arrangement;
separation and tapering leave deliberate negative space.

## Research and implemented ideas

- **Bridson, Hourihan, and Nordenstam (2007), _Curl-Noise for Procedural Fluid
  Flow_.** [Author PDF](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph2007-curlnoise.pdf),
  [DOI](https://doi.org/10.1145/1276377.1276435). Section 2.1, equation (2),
  supplies the two-dimensional streamfunction construction and its
  divergence-free property. Section 2.3 explains why modifying the potential
  preserves that property. This implementation uses analytic Fourier modes and
  regularized vortices, rather than their Perlin-noise/boundary model. Tests
  compare analytic derivatives with finite differences, measure divergence,
  and check that traced curves remain near a constant potential.
- **Jobard and Lefer (1997), _Creating Evenly-Spaced Streamlines of Arbitrary
  Density_.** [DOI](https://doi.org/10.1007/978-3-7091-6876-9_5).
  Sections 2.1–2.3 motivate bidirectional integration, nearby seeding, separate
  seeding/stopping distances, and a spatial grid; section 3 discusses tapering.
  Our adaptation measures exact segment distances with finite ribbon widths,
  uses adaptive integration, and mixes nearby seeds with random restarts.
  It is not a verbatim implementation of their midpoint/sample-point method.
  Tests measure inter-ribbon clearance and independently check polygon crossings.
- **Hanson and Ma (1995), _Parallel Transport Approach to Curve Framing_,
  Indiana University TR425.** [University PDF](https://scholarworks.iu.edu/dspace/bitstreams/23d6fd59-b151-4064-88a7-f7e058b2cc69/download).
  Sections 2.4 and 3 explain frame changes at zero curvature and show the
  neighboring-point tangent formula. The corner discussion on page 12 warns
  that wide offsets can collide on the inside of bends. This planar generator
  uses a consistent 90-degree rotation of the tangent, curvature-dependent
  width, and an explicit polygon validity gate. It does not implement their
  three-dimensional parallel-transport/quaternion algorithm. Tests check
  continuous normals, bounded width changes, and simple offset polygons.

For numerical implementation, the [GNU Scientific Library ODE documentation](https://www.gnu.org/software/gsl/doc/html/ode-initval.html)
describes classical RK4 with step-doubling error estimation and accepting the
two-half-step result. The code here is an original JavaScript implementation;
no paper illustrations or source code are copied.

## Field equations

Coordinates `p=(x,y)` are dimensionless. The print map is
`P=(500+400x, 500+400y)`, with the tracing domain inside `[-1,1]²`.
An anisotropy `a` and rotation `θ` give `q=A p`, where

```text
A = diag(a, 1/a) R(-θ),  det(A) = 1.

ψ(q) = U(q_y cos β − q_x sin β)
     + Σ_j [b_j / k_j] sin(k_j n_j · q + φ_j)
     − ½ Σ_l Γ_l r_l² log(1 + ||q−c_l||² / r_l²)

k_j = π f_j,  n_j = (cos α_j, sin α_j)
v(p) = (∂ψ/∂y, −∂ψ/∂x),  ∇_p ψ = Aᵀ ∇_q ψ.
```

All derivatives are analytic. The positive vortex radius removes the point
singularity: its gradient is `−Γ(q−c)/(1+||q−c||²/r²)`. Mixed partial derivatives
cancel, so the unnormalized velocity has zero divergence. A constant potential
defines a streamline.

We trace `dp/ds = ±v/||v||` to obtain roughly uniform arc-length samples. This
normalization preserves streamline geometry and potential; it does **not**
claim to preserve the velocity field's divergence. Integration stops near a
stationary point instead of dividing by an arbitrarily small speed.

## Integration, placement, and ribbon geometry

Each step compares one RK4 step of length `h` with two steps of `h/2`.
The local error estimate is `||p_half−p_full||/15`. Failed steps shrink with the
fifth-root error controller; exceeding tolerance at `minStep` terminates that
branch rather than accepting an inaccurate result. A second check limits
the tangent turn to approximately 8.5 degrees per accepted segment. Error
tolerance is local; global convergence is tested separately against an exact
circular trajectory.

Centerlines grow in both directions. A spatial grid accelerates exact distances
between proposed and existing segments. Two ribbons reserve the sum of their
nominal half-widths plus the requested gap. Nearby candidates are placed outside
that clearance, while random restarts reach separate flow regions. Growth stops
at the composition boundary, a neighboring band, a loop, a stationary point,
the length limit, or the numerical budget. Very short curves are discarded.

At each sample, the centered tangent `T_i` gives a planar normal
`N_i=(-T_iy,T_ix)`. The ribbon edges are `p_i ± w_i N_i`. Half-width combines:

- a seeded nominal width and gentle longitudinal modulation;
- a sine taper raised to `taperPower`, reaching zero at both ends;
- a curvature cap `w ≤ 0.48/|κ|`;
- forward and backward arc-length passes enforcing `|Δw| ≤ 0.18 Δs`.

The final polygon is checked for self-intersections before acceptance. This
last gate covers numerical/discrete cases that the local curvature bound alone
does not prove safe. Interior stripes use the same normal/width coordinates;
they stop before very narrow regions instead of bridging them with a chord.

## Parameter API and supported ranges

`ribbonParameters(seed)` exposes the seeded defaults.
`buildRibbons(seed, overrides={})` and `generateRibbons(seed, overrides={})`
deep-merge validated overrides. Arrays replace arrays; they are not merged by
index. A `family` override chooses that family's priors before merging the
remaining controls. Unknown keys, missing array-entry properties, non-finite
numbers, invalid colors, and out-of-range values throw useful errors.

Lengths below are normalized coordinates: `0.01` corresponds to four units in
the 1000-unit SVG. Angles are radians.

| Parameter | Supported range | Effect |
| --- | --- | --- |
| `family` | `sweep`, `meander`, `eddy`, `confluence` | Parameter priors only |
| `field.angle` | `−2π…2π` | Rotate the entire field |
| `field.anisotropy` | `0.5…2` | Stretch one field axis and compress the other |
| `field.drift.speed` / `.angle` | `0…2` / `−2π…2π` | Background current |
| `field.harmonics` | 0–8 entries | Fourier potential terms |
| harmonic `frequency` / `amplitude` | `0.1…5` / `0…1.5` | Spatial frequency and velocity amplitude |
| harmonic `angle` / `phase` | `−2π…2π` | Wave orientation and phase |
| `field.vortices` | 0–4 entries | Smooth circulation centers |
| vortex `center` | each coordinate `−1.5…1.5` | Center in transformed field coordinates |
| vortex `radius` / `circulation` | `0.1…1.3` / `−5…5` | Core scale and signed rotational strength |
| `integration.step` / `minStep` | `0.003…0.04` / `0.00001…0.002` | Maximum step and accuracy floor |
| `integration.tolerance` | `10⁻⁸…10⁻⁴` | Local position error estimate |
| `integration.minSpeed` | `10⁻⁷…10⁻³` | Stationary-point cutoff |
| `integration.maxSteps` | 200–4000 | Work bound per direction |
| `ribbon.count` | 4–48 | Maximum target count; packing may produce fewer |
| `ribbon.width` / `widthVariation` | `0.015…0.11` / `0…0.6` | Maximum full width and reduction range |
| `ribbon.spacing` | `0.007…0.1` | Guaranteed centerline-reservation gap |
| `ribbon.taper` / `taperPower` | `0.04…0.45` / `0.6…2` | End-taper length and shape |
| `ribbon.maxLength` / `minLength` | `1.2…8` / `0.12…0.5` | Centerline length limits |
| `ribbon.stripes` | 0–7 | Interior longitudinal marks |
| `composition.center` | each coordinate `−0.1…0.1` | Placement of the tracing domain |
| `composition.radii` | each radius `0.45…0.95` | Elliptical composition footprint |
| `composition.angle` / `seedBias` | `−2π…2π` / `0.25…1.5` | Footprint rotation and seed concentration |
| `style.palette` / `ink` | 1–5 six-digit hex colors / one hex color | Band and outline colors |
| `style.outlineFraction` | `0…1` | Fraction of unfilled bands |
| `style.lineWidth` | `0.3…1.5` SVG units | Boundary stroke weight |

Example with a specifically positioned pair of vortices:

```js
const art = generateRibbons('paired-current', {
  family: 'confluence',
  field: {
    anisotropy: 1.15,
    drift: { speed: .18, angle: .2 },
    vortices: [
      { center: [-.12, -.38], radius: .32, circulation: 2.4 },
      { center: [ .08,  .42], radius: .40, circulation: -2.0 },
    ],
  },
  ribbon: { width: .065, spacing: .025, taper: .18, count: 22 },
  composition: { radii: [.72, .92], angle: .35 },
});
```

## Repeatable validation

Build the worker through the normal preparation command, then run
`node --test tests/ribbons.test.mjs`. The suite checks:

1. Unicode/empty-seed determinism, immutable parameters, override effects, and
   rejected invalid input.
2. Analytic curl versus finite-difference derivatives, near-zero divergence,
   and regular behavior at a vortex center.
3. Fourth-order convergence against an exact rotating trajectory, improved
   global error with tighter local tolerance, and rejected invalid steps.
4. Segment-distance crossing, collinearity, endpoint, and separation cases.
5. Forty-eight distinct coordinate sets spanning every family; finite bounds,
   potential conservation, taper endpoints, continuous normals, bounded width
   changes, an independent polygon intersection sweep, and width-aware clearance.
6. Ten named parameter-extreme cases covering dense/fine, broad/sparse, rapid
   fields, small domains, tight integration, short curves, four vortices,
   outline-only, solid-only, and low-frequency/large-core fields.
7. Shipping-worker SVG and parameter parity, revision, timing, and color handling.

The optional raster audit uses Cairo and `path2d` to run the application's
actual line-preview renderer, not a separate approximation:

```sh
node scripts/art-review/ribbons.mjs --count 48 --raster \
  --out /tmp/painting-art-review/ribbons-final
node scripts/art-review/ribbons.mjs --count 10 --prefix ribbons-extreme \
  --extremes --raster --out /tmp/painting-art-review/ribbons-extremes
```

The reports include exact resolved parameters, geometry/SVG and PNG hashes,
timings, path counts, file sizes, pixel coverage, ink bounds, and edge-clipping
checks. The `review-cases.js` fixture is shared by tests and the extreme audit;
it is not imported by the shipping worker.

Final local audit (2026-11-05, 1200-pixel actual-renderer PNGs):

| Batch | Distinct SVG / PNG | Mean / maximum generation | Largest SVG | Ink coverage | Clipped edge pixels |
| --- | --- | --- | --- | --- | --- |
| 48 defaults | 48 / 48 | 58 / 144 ms | 220,212 bytes | 4.60–14.49% | 0 |
| 10 extremes | 10 / 10 | 93 / 295 ms | 875,872 bytes | 2.42–17.41% | 0 |

Accepted counts were 9–26 ribbons for defaults and 4–48 for extremes. The final
batches required no polygon rejections after the width-envelope correction.
Numerical tests require analytic curl error below `2×10⁻⁷`, divergence below
`10⁻⁶`, potential drift below `5×10⁻⁴`, and no gap violations beyond `10⁻⁹`
coordinate tolerance. Halving the RK4 step gives the expected approximately
16-fold reduction in error on the exact circular reference. Timing numbers
describe this local run, not a cross-device performance guarantee.

## Review findings and limits

The first geometry audit found a tiny self-fold near a saddle turn despite a
clean contact sheet. Propagating curvature-driven width reduction along the
curve fixed the abrupt expansion; the explicit polygon acceptance gate now
guards the remaining numerical cases. A rapid-field extreme reproduced this
failure before the fix. The checks were retained rather than relaxed.

The four-family gallery and the extreme gallery are reviewed as raster output.
This is a static illustrative flow model, not a fluid simulation or a
three-dimensional twisted textile model. Dense/extreme settings intentionally
produce more intricate or fragmented arrangements than the default priors.
`count` is a target, so a broad sparse request can fit fewer bands; accepted
count and rejection counts are reported. A zero field is rejected, and
mutually canceling or unrenderable custom settings fail explicitly if no valid
ribbon can be placed. No finite seed audit proves every possible parameter
combination; the runtime numerical, clearance, and polygon checks remain active.

Gallery: [48 defaults](previews/ribbons-contact.jpg),
[parameter extremes](previews/ribbons-extremes-contact.jpg).
Full-size family examples: [sweep](previews/ribbons-example-00.jpg),
[confluence](previews/ribbons-example-03.jpg),
[eddy](previews/ribbons-example-04.jpg), and
[meander](previews/ribbons-example-16.jpg).

## Application integration

The full repository suite passed (60 tests), followed by a production build and Chromium browser verification. Checks cover desktop and 390×844, 844×390, and 320×568 phone layouts; correct image proportions; seed reload and history; exactly one regeneration of an outdated cached revision; 3200-pixel PNG exports with paper and transparency; and SVG/PDF downloads. PNG checks decode pixels to verify visible artwork, page ratio, opaque paper, and transparent margins.

[Browser results](previews/ribbons-browser-results.json) and [48-seed parameters, hashes, and measurements](previews/ribbons-report.json) are committed alongside the gallery. [Additional stress results](previews/ribbons-extremes-report.json) record the larger parameter study. Run `npm test`, `npm run build`, then `node scripts/check-browser.mjs` to reproduce. The browser script needs Playwright/Chromium; the optional raster review needs Cairo `canvas` and `path2d`. These verification tools are not application runtime dependencies.
