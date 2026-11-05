# Ink Gestures — parameter and visual review

Ink Gestures composes pressure-shaped brush strokes with imperfect bristle contact: broken circles, flowing bends and layered counterstrokes, with occasional rust pigment. Geometry and texture come from equations and seeded numbers. There are no stored glyphs, traced outlines or raster assets.

![48 consecutive seeds](previews/brushwork-contact.jpg)

## Mathematical model and source

Steve Strassmann's **Hairy Brushes in Computer-Generated Images** (MIT, 1986; SIGGRAPH paper DOI [10.1145/15886.15911](https://doi.org/10.1145/15886.15911)) is the primary inspiration. The [MIT thesis](https://dspace.mit.edu/server/api/core/bitstreams/618d714e-613f-4863-9bc0-b67e4e38100f/content) separates brush, stroke, dip and paper models (chapter 3), with pressure-dependent bristle spread/contact (section 5.4). This implementation adapts the bristle/contact abstraction; it does not reproduce the complete kinetic model or simulate liquid, absorption or pigment diffusion.

For loops, `theta = start + sweep*t`, `r = R*(1 + wobble*sin(2*theta + phase) + drift*(t-.5))`, and `C(t) = (r*cos(theta), aspect*r*sin(theta))`. Flowing strokes use `C(t) = span*(t-.5, .23*bend*sin(2*pi*t+phase) + bias*(t-.5)^2)`. Each curve receives seeded translation and rotation. Both derivatives are analytic; curvature is `cross(C',C'') / |C'|^3`. These are composition families with continuous parameters, not fixed outlines.

Pressure combines a short attack, decaying release and low-frequency pulse. Spread is proportional to pressure. Half-width times absolute curvature is limited to .75, keeping offsets inside the local radius of curvature. Forward/backward arc-length propagation limits half-width change to .5 units per unit traveled, preventing notches at tight bends. This local bound does not prohibit intentional crossings between separate strokes.

Bristles sample the tangent/normal frame. Lateral placement includes coherent roughness, stronger edge irregularity and a small backward lag. A seeded contact signal combines dryness, progress, edge pressure and two oscillations; lost contact splits a bristle into separate polygons. Pressure and contact control width. Opaque ink colors mix toward paper for lighter pigment. Strokes paint in order; this is not optical watercolor blending.

Polygon edges are simplified with an explicit distance tolerance. One uniform composition fit into an 850-unit square inside a 1000-unit page preserves at least 75 units of margin. Seeds use the repository's finite 32-bit generator; sample uniqueness is not a proof of unlimited uniqueness.

## Parameterization

`generateBrushwork(seed, overrides)` accepts the controls below. Defaults are seeded within narrower ranges; overrides are validated, zero is respected, and unknown keys fail. Units refer to the unscaled construction plane.

| Control | Default | Accepted range | Effect |
| --- | --- | --- | --- |
| family | equal choice | orbit, sweep, crossing, rising | Arrangement and trajectory type |
| width | 110–190 | 24–220 | Primary width before pressure/fit |
| dryness | .32–.66 | 0–.85 | Contact loss toward trailing end |
| bristles | 100 | 40–160 integer | Fibers per stroke |
| pressureVariation | .18–.42 | 0–.65 | Pressure pulse amplitude |
| taper | .45–.85 | .4–1.8 | Release exponent; larger tapers earlier |
| bend | .5–1 | .2–1.25 | Sinusoidal bend amplitude |
| sweep | 4.7–5.75 | 3.6–6.05 radians | Arc extent |
| radialWobble | .025–.065 | 0–.12 | Radial harmonic deformation |
| aspect | .78–1.2 | .65–1.35 | Loop vertical scale |
| rotation | full turn | -pi–pi radians | Composition rotation |
| roughness | .3–.8 | 0–2.5 | Bristle lateral displacement |
| pigment | .92–1 | .35–1 | Ink density relative to paper |
| accent | 60% zero; else .65–1 | 0–1 | Rust mix in first counterstroke; lone strokes have none |
| strokeCount | orbit 1, crossing 3, others 2 | 1–4 integer | Number of trajectories |
| scale | .82–.97 | .65–1 | Occupancy of inset fit box |
| samples | 240 | 120–400 integer | Contact/curve sampling intervals |
| chordError | .1 | .02–.2 | Simplification tolerance against sampled edge |

Secondary seeded values include primary spans 600–730 and radii 235–290; secondary spans 360–610 and radii 130–200; secondary width .35–.72 of primary; secondary pigment .7–1 of requested pigment; radial drift -.1–.1; bend sign; phases; bristle contact frequency 5–12 cycles; and width factor 1.35–2. Placement differs by family to balance overlap and negative space. These are artistic priors, not measured physical constants.

## Review and tests

The [default report](previews/brushwork-report.json) and [stress report](previews/brushwork-stress-report.json) record seeds, parameters, SVG/PNG SHA-256, bounds, ink coverage, file size and timing. The **48 consecutive defaults yield 48 distinct SVGs and PNGs**, no ink in the outer two pixels, and no blank/saturated images. Local generation averaged **61.6 ms**, maximum **151.6 ms**; SVG averaged **485 KB**, maximum **901 KB**. Timing excludes rasterization and is machine-specific.

![Joint parameter extremes](previews/brushwork-stress.jpg)

Eight named joint extremes cover maximum width/curvature/pressure, dry thin loops, flattened wide loops, short arcs, dense crossings, thin rising strokes, sparse coarse fibers and dense fine fibers. All remain unique, finite, nonempty and unclipped while retaining requested controls. Maximum stress SVG: 3.01 MB. Extreme combinations are deliberately less curated than normal defaults.

Tests independently compare derivatives to finite differences and exact circles; verify pressure endpoints, orthonormal frames, curvature/width-slope bounds, point-to-segment simplification error, dryness reducing contact, color-only geometry invariance, continuity of geometric parameters, 48-seed diversity/bounds, override validation and joint extremes. Shipping worker tests compare SVG to the pure generator and round-trip compressed cache, seed URL and exports.

All 60 repository tests pass. The production build and browser checks pass. The app's actual Canvas renderer produced both galleries. Browser checks cover desktop and three mobile sizes, navigation/reload/history, stale-cache regeneration and SVG, paper/transparent PNG and PDF downloads. SVG stays vector; the current PDF embeds raster artwork.

## Reproduce

```sh
npm ci
PAINTING_GO=/path/to/go npm test
PAINTING_GO=/path/to/go npm run build
npm install --no-save --package-lock=false canvas@3.2.3 path2d@0.2.2 playwright@1.58.2
node scripts/art-review/brushwork.mjs --count 48 --raster --out .artifacts/brushwork
node scripts/art-review/brushwork-stress.mjs --count 8 --prefix brushwork-stress --raster --out .artifacts/brushwork-stress
npx playwright install chromium
node scripts/check-browser.mjs
```

`--overrides '{"family":"orbit","dryness":0}'` supports controlled experiments; `--width 3200` inspects print detail. Fine bristles merge at thumbnail size and can resemble hair at high zoom. Four simple composition families provide a coherent but limited vocabulary; they do not model handwriting or semantic symbols.
