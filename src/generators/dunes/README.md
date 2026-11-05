# Dune Fields — ink landscapes and tiny caravans

Revision 2 defaults to sweeping monochrome dune crests, open sand, curved slope hatching, and a sparse group of procedural travelers and camels. A continuous height field supports the marks and planted feet; depth tests suppress geometry behind nearer terrain. Shapes, proportions, poses, and placement come from seeded mathematics, without stock silhouettes or raster textures.

The earlier ochre surface study remains available with `palette: 'ochre'`. It uses a separate geometric model and lighting renderer. The default ink landscape is an illustrative redesign, not the old shaded terrain with its colors removed.

## API

```js
import { duneParameters, buildDunes, generateDunes } from './generate.js';

const seed = 'desert-42';
const defaults = duneParameters(seed);
const painting = generateDunes(seed, {
  crestHeight: 72, relief: 1.15, curvature: .16,
  ridgeBands: 8, rippleDensity: .55, lineWeight: 1,
  travelerCount: 2, camelCount: 3,
  figureScale: 1, caravanSpacing: 40,
  figureHeading: Math.PI, camelLoad: .7,
});
const scene = buildDunes(seed, { travelerCount: 0, camelCount: 0 });
```

`duneParameters(seed)` returns the full seeded control record. `buildDunes(seed, overrides = {})` also returns the terrain, sampling grid, camera, visibility buffer, ridges, visible surface strokes, figure geometry, foot contacts, figure bounds, and rendered paths. `generateDunes` returns the 1414×1000 painting with SVG, `mode: 'dunes'`, `artRevision: 2`, resolved parameters, and metrics. The classic worker forwards that same revision and result.

Seeds and explicit controls reproduce the drawing without ambient `Math.random()` or network access. Overrides do not resample unrelated controls. Unknown names, nonfinite/out-of-range numbers, and fractional figure/hatch counts throw. Zero-valued supported controls are honored.

## Default ink model

The terrain has four to seven broad ridges, with five or six under the default density range. Each ridge has a seeded center, width, depth, asymmetric main summit, optional secondary summit, and bending crest line. A compact height envelope combines two Gaussian bumps with a power of `1-u²`, normalized to the ridge's chosen height. It vanishes at the lateral ends. These are our own composition equations, not a reconstruction of a measured dune.

The retained morphology names select profile variations. `linear` uses a broader envelope; `star` permits a stronger secondary peak; `barchan` adds a crescent-like plan bend; `transverse` uses the general sweeping profile. In ink mode these names are **illustrative profile neighborhoods**, not promises of true planform star arms, barchan horns, or a simulated wind-selected morphology. The older ochre model retains those explicit planform constructions.

The front-facing section uses a cosine-power windward profile and the back section a linear lee descent:

```text
stoss(q) = cos(pi*q/2)^stossExponent, for 0 <= q < 1
stossWidth(H) = max(H / (0.28*(1 - 1/shearRatio)), 7*saturationLength)
leeWidth(H) = H / tan(slipAngle)
terrain(x,z) = maximum of the ridge sections at (x,z)
```

The maximum makes one continuous height surface, although its derivatives can change at ridge intersections. Seeded per-ridge width factors vary the sections. The long-axis envelopes, broad layering, and finite composition limits are artistic choices. World units are a drawing scale, not metres.

Geometry queries use the analytic surface directly. A 225×177 height grid and 943×667 depth buffer approximate visibility; this avoids baking sampled-height scallops into the crest silhouettes. Surface derivatives use centered finite differences for placement and inspection. No terrain lighting fills are emitted in ink mode.

The ink view is deliberately an oblique illustration with a mild depth-scale adjustment, rather than a calibrated pinhole camera. Its mapping is explicit:

```text
s(z) = 1 - z*perspective/2300
X = 707 + 0.87*(x + 0.25*z*sin(cameraAzimuth))*s(z)
Y = 600 - z*(0.4 + 0.55*cameraElevation) - 0.87*h*s(z)
depth = 5000 + z
```

This mapping also governs figure placement and the independent visibility-ray test. The ochre renderer has its own actual perspective camera.

Crests use tapered ink endings. Buried or disconnected crest remnants shorter than 200 page units are omitted; subordinate edge runs need 220 units. Hatch/ripple marks are restricted to retained crest intervals so a discarded remnant cannot leave an unexplained bundle floating on the page. These are visible-feature selection rules, not alterations to terrain height or a clipping mask.

Short groups of curves run down the front shoulders. Their lateral drift grows nonlinearly with descent, while sampled heights keep every mark on the terrain. Some ridges instead receive a few longer shoulder traces. Those traces adaptively subdivide when a world-space chord exceeds 8 units or midpoint deviation exceeds .2, up to depth 10. This prevents extreme relief from producing long, coarse segments. A small number of broad traces supplies volume without covering the scene with a technical wire grid.

## People and camels

Figures are generated from articulated world-space geometry, not pasted icons. Travelers have variable robe width/length, head, arms, jointed legs, stride stance, and optional staff. Camels have independently varied body length, hump height, neck/head, four jointed legs, tail, ears, stride stance, and optional load. Their compact side silhouettes are solid ink; small negative-space details keep loads and clothing legible. These are static illustrated poses, not locomotion or anatomical simulations.

At unit `figureScale`, the base projected height is approximately 15.5 units for a person and 23.5 for a camel, before depth scaling and the camel's hump/head proportions. Default figures are intentionally tiny relative to the 1414-unit scene. Heading favors side views by default, with continuous overrides available.

Every planted foot queries the same active terrain surface and is lifted by only `.12` world units to avoid numerical self-occlusion. Knees and hips articulate between those contacts. Placement rejects overly uneven ground, fully hidden feet, out-of-frame figures, and overlapping projected body bounds. Small ground accents sit on the terrain under the feet. Body/limb strokes are depth-tested against nearer dunes, and fully visible closed silhouettes occlude marks behind them.

A deterministic search evaluates up to 95 candidate caravan routes. `caravanSpacing` is a requested center spacing; a conservative silhouette-size clearance may increase it. Bounds also enforce at least a three-unit separation between projected figures. Count controls are **requested maxima**: an overfull route or hidden terrain can yield fewer figures instead of overlapping, floating, or rescaling them. Actual counts are returned in `metrics.travelers` and `metrics.camels`. All 48 default reviewed seeds placed their requested counts; two deliberately crowded stress cases placed fewer.

Changing only figure controls leaves the terrain paths unchanged. `travelerCount: 0, camelCount: 0` removes every figure. `buildDunes` exposes `figures[].feet`, `feetVisible`, `bounds`, `gait`, proportions/load metadata, and `figureStrokes` for independent inspection.

## Primary research and scope

| Primary paper | Adaptation | Limits |
| --- | --- | --- |
| Kroy, Fischer and Obermayer, *On the shape of barchan dunes* (2005). [DOI 10.1088/0953-8984/17/14/012](https://doi.org/10.1088/0953-8984/17/14/012); [open primary paper](https://arxiv.org/pdf/cond-mat/0501152), equations 2 and 6. | The cosine-power windward section informs both renderers. The older ochre planform uses a parabolic transverse crest envelope. | The ink landscape's asymmetric Gaussian summit envelope and composition are our own illustration choices; they are not equation 6 or a solved dune equilibrium. |
| Kroy, Sauermann and Herrmann, *Minimal model for aeolian sand dunes* (2002). [DOI 10.1103/PhysRevE.66.031302](https://doi.org/10.1103/PhysRevE.66.031302); [open primary paper](https://arxiv.org/pdf/cond-mat/0203040). | Saturation-limited transport motivates an independent lower width scale; excess shear motivates qualitative aspect variation. | `max(H/aspect, 7*saturationLength)` is a geometric proxy. The factor 7 is not fitted from the paper, and no flux/saltation equations are integrated. |
| Parteli and Herrmann, *Dune formation on the present Mars* (2007). [DOI 10.1103/PhysRevE.76.041307](https://doi.org/10.1103/PhysRevE.76.041307); [open primary paper](https://arxiv.org/pdf/0705.0809), bimodal-wind discussion. | Inspiration for the optional ochre model's wind-divergence and relative-strength controls and resultant-directed linear ridges. | This mechanism is not implemented in the default ink composition. Neither renderer predicts Mars conditions, dune migration, or wind-driven morphology transitions. |

Neither model integrates sediment mass conservation, erosion, avalanches, or grain trajectories. The ink camera, hatching, figures, and caravan arrangement are artistic constructions. The numerical tests establish stated geometric properties rather than physical realism.

## Parameter reference

Bounds are inclusive. Angles are radians unless indicated. Lengths are numerical world/drawing units. The palette distinction below matters: several older lighting and wind-regime controls apply only to the optional ochre model.

| Control | Seeded default | Supported override | Effect |
| --- | --- | --- | --- |
| `palette` | `ink` | `ink`, `ochre` | Selects the new open ink landscape or the earlier shaded planform study. |
| `morphology` | Four-way seeded choice | `barchan`, `transverse`, `linear`, `star` | Ink: profile neighborhoods described above. Ochre: explicit planform constructions. |
| `crestLength` | 245–385 | 170–520 | Ink broad-ridge width is 3.5–4.5 times this value, constrained to 880–1620 world units; ochre uses its family-specific length factors. |
| `crestHeight` | 53–82 | 22–95 | Base height, multiplied by relief and seeded per-ridge variation. |
| `relief` | 1–1.32 | .55–1.55 | Height multiplier; section widths change with height as well. |
| `spacing` | 230–350 | 175–430 | Ink: smoothly maps to a 650–1050-unit depth extent. Ochre: separates placement rows/ridges. |
| `density` | .65–1 | .4–1.2 | Ink ridge count is `round(3 + 3*density)`; count is deliberately discrete. Ochre controls retention/count of planform dunes. |
| `curvature` | .07–.18 | 0–.28 | Bending of crest depth and curvature of shoulder hatching. |
| `asymmetry` | −.23–.23 | −.4–.4 | Ink: shifts the main summit within its envelope. Ochre: barchan horn imbalance. |
| `horns` | .32–.65 | .1–.85 | Crescent-like bend in the ink barchan neighborhood; explicit downwind horn bend in ochre. |
| `stossExponent` | 2.6–3.4 | 1.8–4 | Cosine-power front/windward section exponent. |
| `slipAngle` | 29°–34°, stored in radians | .42–.62 | Lee-section descent via `H/tan(slipAngle)`. |
| `shearRatio` | 1.65–3.1 | 1.25–4 | Geometric windward aspect proxy `0.28*(1−1/shearRatio)`. |
| `saturationLength` | 8–17 | 3–30 | Lower windward-width scale `7*saturationLength`; may be inactive when height already implies a wider section. |
| `windAzimuth` | .9–2.05 | −π–π | Ink: crest phase and small hatch-deflection bias. Ochre: actual orientation of its geometric wind construction. |
| `windDivergence` | Linear: 2.05–2.7; others: .6–1.9 | .1–2.8 | Ochre only: two-wind angle and star-arm irregularity. Does not alter the new ink surface. |
| `secondaryWind` | .35–.85 | 0–1 | Ochre only: relative strength in the linear-ridge wind resultant. |
| `rippleWavelength` | 11–19 | 5–24 | Ink local hatch spacing, with a seeded .45–.8 multiplier; ochre surface-phase wavelength. |
| `rippleSlope` | .08–.22 | 0–.35 | Ink hatch descent extent; ochre height coupling and coherent phase warp. |
| `rippleDensity` | .32–.62 | 0–1 | Ink bundle count/density; zero removes hatching and longer ripples. Ochre retention probability for phase lines. |
| `ridgeBands` | Integer 5–10 | Integer 0–16 | Base number of strokes per ink hatch bundle, with seeded .75–1.4 variation. The three occasional long shoulder traces are separate. |
| `lineWeight` | .85–1.2 | .65–1.6 | Ink terrain and figure stroke multiplier. In ochre it affects figures, while the original terrain stroke weights remain fixed. |
| `cameraAzimuth` | −.32–.32 | −.65–.65 | Ink oblique horizontal depth shear; ochre camera rotation. |
| `cameraElevation` | .36–.56 | .22–.95 | Ink depth spacing coefficient `.4 + .55*cameraElevation`; ochre physical camera angle. |
| `perspective` | .28–.47 | 0–.5 | Ink depth-dependent size adjustment; zero removes it. Ochre camera-distance control. |
| `phase` | 0–2π | −1000–1000 | Ink caravan-route bend phase; ochre ripple waviness and retained-line selection. |
| `lightAzimuth` | −2.7–−1.5 | −π–π | Ochre lighting only. |
| `lightElevation` | .34–.66 | .22–1.1 | Ochre light height and shadow length only. |
| `contrast` | .65–1 | .3–1.2 | Ochre shadow/diffuse-tone multiplier only. |
| `travelerCount` | Integer 1–3 | Integer 0–8 | Requested maximum number of walkers; actual placement is visibility/clearance constrained. |
| `camelCount` | 65% chance of integer 1–3; otherwise 0 | Integer 0–6 | Requested maximum camel count. |
| `figureScale` | .85–1.12 | .6–1.6 | Scales articulated people/camels and their required clearance. |
| `caravanSpacing` | 27–43 | 18–70 | Desired projected center spacing, increased when needed for silhouette clearance. |
| `figureHeading` | Near 0 or π | −π–π | Heading relative to the view reference; default side views keep tiny silhouettes readable. |
| `camelLoad` | .35–.85 | 0–1 | Seeded probability of a visible pack/load. Zero removes loads, one loads every placed camel. |

The figure pose/proportion samples are derived from the seed and exposed by `buildDunes`, not extra override keys. Count, topology, retained visible features, and placement eligibility can change discretely even when the underlying continuous surface controls change smoothly. Large figures plus large counts/spacing may not fit; placement reports the resulting counts rather than silently shrinking the figures.

## Export and validation

All output is flat SVG path geometry. The ink renderer uses white-to-alpha conversion after drawing so silhouette cutouts and negative-space load/clothing details remain transparent in the final ink layer. SVG downloads retain vectors. The preview/PNG exporter rasterizes those paths; the existing PDF exporter embeds a rendered PNG.

The 18 dune test groups retain the optional renderer's analytic profiles, planform orientation, bicubic derivatives, perspective, shadow, lighting-filter, winding, and independent eye-ray checks. Revision-2 checks additionally cover continuous ink-field controls, absence of filled dune slabs, 48 unique bounded scenes, surface-attached marks, sampled visibility, every planted foot, nonoverlapping figure bounds, articulated geometry variation, zero-count removal, terrain invariance under figure controls, and independent oblique viewing rays. The long-ripple adaptive sampler is exercised by the existing extreme-relief geometry test. Bundled-worker parity includes `artRevision: 2`.

Visibility is a finite-grid approximation. The independent ink ray check allows less than three world units of sampled obstruction; the optional ochre ray check retains its stricter two-unit allowance. These are tested bounds for specified cases, not a universal visibility proof. Tiny details naturally disappear at thumbnail size, and optional ochre shading retains its finite-grid contour limitations.

```sh
node --test tests/dunes.test.mjs tests/isocontours.test.mjs
node scripts/art-review/dunes.mjs --count 48 --raster --width 1414 --out /tmp/dunes-review
node scripts/art-review/dunes.mjs --stress --raster --width 1414 --out /tmp/dunes-stress
node scripts/art-review/dunes.mjs --count 4 --raster --out /tmp/dunes-bare \
  --overrides '{"travelerCount":0,"camelCount":0,"rippleDensity":0}'
```

The review wrapper writes every SVG/PNG, contact sheets, exact control records, hashes, timings, byte/path counts, placement metrics, and actual-renderer pixel bounds. Local Cairo `canvas` and `path2d` are optional review dependencies, not runtime dependencies. See the [review gallery and recorded results](../../../docs/dunes-review.md).
