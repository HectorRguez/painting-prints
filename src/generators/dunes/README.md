# Dune Fields

Dune Fields draws a continuous three-dimensional sand surface, then projects
its ridges, lighting and ripples into flat SVG paths. Seeds produce barchan,
transverse, linear and star-inspired fields. The default palette uses six
restrained ochre shadow tones, a pale sand base and fine brown lines; an `ink` override gives a
monochrome version. No stored dune silhouettes, raster textures or runtime
libraries are used.

## Mathematical inspiration

The construction draws on three primary research papers:

- Kroy, Fischer and Obermayer, **On the shape of barchan dunes** (2005),
  [DOI 10.1088/0953-8984/17/14/012](https://doi.org/10.1088/0953-8984/17/14/012),
  [open paper](https://arxiv.org/pdf/cond-mat/0501152).
  Equation 2 motivates the cosine-power windward section; equation 6 supplies
  the parabolic transverse height envelope. Here these are normalized as
  `h/H = cos(πq/2)^α` and `H(u)/Hmax = 1 − u²`, respectively. The default
  exponent stays near 3. Curved skeletons extend the profile family into the
  other illustrated landforms.
- Kroy, Sauermann and Herrmann, **Minimal model for aeolian sand dunes** (2002),
  [DOI 10.1103/PhysRevE.66.031302](https://doi.org/10.1103/PhysRevE.66.031302),
  [open paper](https://arxiv.org/pdf/cond-mat/0203040).
  Saturation-limited transport motivates an independent lower width scale.
  Our `max(H/aspect, 7*saturationLength)` width rule is an artistic proxy;
  the factor 7 is not a fitted result from the paper. The aspect control uses
  the qualitative dependence on excess wind shear, `1 − 1/shearRatio`.
- Parteli and Herrmann, **Dune formation on the present Mars** (2007),
  [DOI 10.1103/PhysRevE.76.041307](https://doi.org/10.1103/PhysRevE.76.041307),
  [open paper](https://arxiv.org/pdf/0705.0809).
  Its bimodal-wind experiments motivate separate wind-divergence and relative
  strength controls. Linear ridges follow the vector resultant of two winds.
  The default linear family uses widely separated wind directions; selecting a
  morphology explicitly remains an artistic choice, not a simulated transition.

For observed form and orientation, see Lancaster's
[aeolian landforms chapter](https://www.nps.gov/articles/aeolian.htm) and
[NASA/JPL's barchan and linear dunes](https://www.jpl.nasa.gov/images/pia23669-barchan-and-linear-dunes/).
Barchan horns point downwind; star arms meet at a common summit. Those
relationships are tested independently of the renderer.

This generator does not integrate sediment flux, saltation, avalanches or the
mass-conservation PDE of the papers. It does not predict dune migration,
physical size or real weather. World units and visible ripple spacing are
chosen for illustration.

## Geometry and rendering

Each ridge has a continuous center curve and a tapered height profile. The
windward side uses the cosine-power section; the lee section descends at the
chosen slip angle. Neighboring sections form one height surface, so intersecting
dunes do not become separate overlapping stickers. Star dunes combine three to
five arms; long ridges have seeded curvature and height variation.

A sampled height field uses bicubic interpolation with analytic derivatives.
Exact unit normals describe the surface. Illumination uses normals filtered
over the terrain sampling scale, so unresolved small slope changes do not
become scalloped shadows. Terrain rays toward the light cast shadows; a fine
search around the strongest obstruction refines the initial coarse ray.
Camera projection and a software depth buffer determine which surface marks
are visible. A separate pale coverage fill keeps fully illuminated faces
connected to the terrain. Lighting is interpolated with perspective weights
and filtered along the local projected depth plane, rejecting neighbors across
visibility breaks. This wider lighting filter does not change terrain heights,
line positions, coverage boundaries or occlusion. The result becomes closed
vector contours through the shared marching-squares helper. The high-value side sets each loop's winding, preserving illuminated
holes without a raster image in the SVG.

Ripples follow constant values of the surface phase
`φ(x,z) = wind·(x,z) + β h(x,z)`, with a small coherent perturbation. Solving
this field bends the lines around shoulders and horns. Ripples are restricted
to windward slopes and tested against the same depth buffer as the crests.
Discontinuous phase roots are split, so a line cannot jump between star arms.
The finite depth and lighting grids are rendering approximations; every
export remains ordinary editable path geometry.

## Parameters

```js
import { duneParameters, buildDunes, generateDunes } from './generate.js';

const defaults = duneParameters('desert-42');
const painting = generateDunes('desert-42', {
  morphology: 'barchan', horns: 0.7, asymmetry: -0.2,
  windAzimuth: 0.4, crestHeight: 70, spacing: 310,
  cameraElevation: 0.45, lightElevation: 0.35,
  rippleWavelength: 10, rippleDensity: 0.7,
});
```

`buildDunes(seed, overrides)` also returns the skeletons, sampled terrain,
camera, depth buffer, visible line geometry and shading loops for inspection.
Overrides are validated, and unknown names or unsupported values throw.
Angles are radians; lengths use arbitrary world units.

`duneParameters(seed)` returns the complete resolved default record. Seeded
ranges below are sampled continuously unless a discrete choice is stated.
Explicit overrides replace those values without resampling other controls.
World units are an illustration scale, not metres.

| Parameter | Seeded default | Allowed override | Units | Effect |
| --- | --- | --- | --- | --- |
| `morphology` | Equal choice among four families | `barchan`, `transverse`, `linear`, `star` | Category | Selects curved crescent, crosswind ridge, resultant-wind ridge, or joined radial arms. |
| `palette` | `ochre` | `ochre`, `ink` | Category | Restrained sand colors or monochrome; ink enables white-to-alpha export. |
| `windAzimuth` | −0.9–0.9 | −π–π | Radians | Dominant wind direction, barchan horn direction, star rotation and ripple phase direction. |
| `windDivergence` | Linear: 2.05–2.7; others: 0.6–1.9 | 0.1–2.8 | Radians | Angle between the two winds for linear ridges; changes angular irregularity of star arms. |
| `secondaryWind` | 0.35–0.85 | 0–1 | Relative strength | Weights the second wind in the linear-ridge resultant; zero uses the primary wind alone. |
| `shearRatio` | 1.65–3.1 | 1.25–4 | Dimensionless proxy | Raises the stoss aspect through `0.28*(1−1/shearRatio)`; stronger shear narrows the windward side at fixed height. |
| `saturationLength` | 8–17 | 3–30 | World units | Sets the independent lower stoss-width bound `7*saturationLength`. |
| `crestLength` | 245–385 | 170–520 | World units | Base width of a barchan, scale of star arms, or base long-ridge length before the family-specific multiplier. |
| `crestHeight` | 36–67 | 22–95 | World units | Base crest height before relief and per-dune variation; width changes with height through the section equations. |
| `horns` | 0.32–0.65 | 0.1–0.85 | Length fraction | Downwind bend of the barchan crest tips; affects only barchans. |
| `asymmetry` | −0.23–0.23 | −0.4–0.4 | Dimensionless | Imbalance between the two barchan horns; both still point downwind throughout the supported range. |
| `curvature` | 0.07–0.18 | 0–0.28 | Length fraction | Bends linear/transverse center curves and star arms; barchans use horns and asymmetry instead. |
| `stossExponent` | 2.6–3.4 | 1.8–4 | Dimensionless | Power of the normalized cosine windward profile; changes the shoulder and taper without moving the crest. |
| `slipAngle` | 29°–34°, stored in radians | 0.42–0.62 | Radians | Sets the lee descent through `leeWidth = height/tan(slipAngle)`. |
| `relief` | 0.85–1.25 | 0.55–1.55 | Height multiplier | Scales crest height, with corresponding changes to stoss/lee width, overlap and shadows. |
| `spacing` | 230–350 | 175–430 | World units | Separates dune centers or long ridges; interacts with width and density to create connected or isolated fields. |
| `density` | 0.65–1 | 0.4–1.2 | Dimensionless | Retention probability for barchan/star placements (at least four), or control of the three-to-six long-ridge count. Values above one retain all discrete placements. |
| `rippleWavelength` | 8–14 | 5–24 | World units | Distance between surface-phase levels before the height term and coherent warp bend them. |
| `rippleSlope` | 0.08–0.22 | 0–0.35 | Dimensionless | Strength of the terrain-height term and coherent ripple warp; zero gives straight planform phase lines that still lie on the surface. |
| `rippleDensity` | 0.45–0.82 | 0–1 | Probability | Fraction of phase lines retained; zero removes ripples while retaining crests and lighting. |
| `cameraAzimuth` | −0.32–0.32 | −0.65–0.65 | Radians | Rotates the viewpoint around the field without rotating the winds. |
| `cameraElevation` | Star: 0.38–0.56; others: 0.26–0.56 | 0.22–0.95 | Radians | Low values emphasize overlapping relief; higher values expose the dune planform. |
| `perspective` | 0.28–0.47 | 0–0.5 | Dimensionless | Controls camera distance (`850/perspective`); zero is approximately orthographic. |
| `lightAzimuth` | −2.7–−1.5 | −π–π | Radians | Horizontal direction toward the sun; changes illuminated faces and the direction of cast shadows. |
| `lightElevation` | 0.34–0.66 | 0.22–1.1 | Radians | Sun height; lower values lengthen cast shadows and emphasize relief. |
| `contrast` | 0.65–1 | 0.3–1.2 | Multiplier | Scales the diffuse/shadow field before quantizing it into the fixed restrained palette. |
| `phase` | 0–2π | −1000–1000 | Radians | Shifts coherent ripple waviness and the deterministic choice of retained phase lines. |

The controls have intentional couplings. For a linear field the ridge angle is
`windAzimuth + atan2(secondaryWind*sin(windDivergence),
1 + secondaryWind*cos(windDivergence))`; it is not simply the primary wind.
Changing `horns` or `asymmetry` has no effect on other families. Changing the
morphology override does not resample the seed's remaining defaults.

Height and relief also change dune width, so raising either while reducing
spacing can merge several dunes into one surface. Density changes how many
centers are populated; it does not model sediment supply. The camera fits the
active surface inside the print margins, so a larger field can appear smaller
on paper. Low camera angles increase occlusion, while high angles reveal horns
and star arms. Light azimuth/elevation and contrast can make the same geometry
read as either a pale sunlit field or a more strongly shaded relief. None of
those lighting controls changes the geometry or hidden-line visibility.

## Validation and reproducible review

```sh
node --test tests/dunes.test.mjs tests/isocontours.test.mjs
node scripts/art-review/dunes.mjs --count 48 --out /tmp/dune-review
# Optional local Canvas tools reproduce the actual app renderer:
npm install --no-save --package-lock=false canvas path2d
node scripts/art-review/dunes.mjs --count 48 --raster --out /tmp/dune-review
node scripts/art-review/dunes.mjs --count 4 --raster --out /tmp/dune-ink \
  --overrides '{"palette":"ink","cameraElevation":0.6}'
```

The audit writes SVGs, a contact sheet and JSON records containing the exact
parameters, hashes, generation times and geometry metrics. Raster mode also
writes PNGs and JPEG examples, checks unique pixel hashes, and detects empty
or clipped output. Canvas is an optional review tool, not a runtime dependency.

The tests cover the cited analytic profiles, horn and ridge orientation,
star-arm connectivity, surface-normal derivatives, perspective, order-independent
visibility, independent eye-ray checks, perspective-correct lighting, filtered
illumination across sloping faces and visibility breaks, terrain shadows,
shading-hole winding, deterministic output,
48 distinct seeded fields, parameter extremes and bundled-worker parity.
See the [review gallery](../../../docs/dunes-review.md) for the final specimens.
