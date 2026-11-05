# Painting

A procedural-art gallery for making, exploring and printing reproducible drawings. Choose a style, generate a new composition, and export it with or without paper. All artwork is generated in the browser.

**[Open the gallery](https://hectorrguez.github.io/painting-prints/)**

The collection combines two adapted engines by Lingdong Huang with **six original generators developed for this repository**: Leaf Skeletons, Snowflakes, Seascapes, Ribbons, Dunes and Ink Gestures.

## The collection

| Style | What it creates | Origin and implementation |
| --- | --- | --- |
| [Flowers](https://hectorrguez.github.io/painting-prints/flowers/) | Layered botanical compositions with native raster output and complete, uncropped PNG exports. | Adapted from Lingdong Huang's [nonflowers](https://github.com/LingDong-/nonflowers). [Engine and samples](src/generators/flowers/README.md). |
| [Landscapes](https://hectorrguez.github.io/painting-prints/landscapes/) | Panoramic ink mountains, water and scenery; the print composition uses a central landscape crop. | Adapted from Lingdong Huang's [shan-shui-inf](https://github.com/LingDong-/shan-shui-inf). [Engine and samples](src/generators/landscapes/README.md). |
| [Leaf Skeletons](https://hectorrguez.github.io/painting-prints/leaves/) | Eight botanical profile families, ragged margins, branching major veins and connected minor-vein cells. | Original analytic blade geometry, bounded Voronoi networks and orientation-preserving deformations. [Model and controls](src/generators/leaves/README.md). |
| [Snowflakes](https://hectorrguez.github.io/painting-prints/snowflakes/) | Fern, stellar, sectored-plate and branched-plate crystals with exact sixfold symmetry. | Original JavaScript implementation of a hexagonal cellular growth model, with seeded changes in growth conditions. [Model and review](src/generators/snowflakes/README.md). |
| [Seascapes](https://hectorrguez.github.io/painting-prints/seascapes/) | Panoramic calm water, swells and simple spilling crests with sparse procedural boats. | Gerstner supporting waves, sparse crest outlines and six vessel families. [Model and controls](src/generators/seascapes/README.md) · [Review](docs/seascapes-review.md). |
| [Ribbons](https://hectorrguez.github.io/painting-prints/ribbons/) | Flowing abstract bands, eddies, meanders and converging currents with deliberate open space. | Analytic streamfunctions, adaptive streamline integration and curvature-aware ribbon boundaries. [API](src/generators/ribbons/README.md) · [Equations, parameters and review](docs/ribbons-review.md). |
| [Dunes](https://hectorrguez.github.io/painting-prints/dunes/) | Panoramic ink ridges, curved shoulder hatching and tiny procedural walkers and camels. | Continuous asymmetric terrain, articulated figures, terrain-sampled feet and depth-tested visibility. An ochre surface study is also available through the API. [Model and controls](src/generators/dunes/README.md) · [Review](docs/dunes-review.md). |
| [Brushwork / Ink Gestures](https://hectorrguez.github.io/painting-prints/brushwork/) | Broad broken loops and flowing gestures in ten seeded palettes, with dry-brush texture. | Analytic trajectories, varying pressure, curvature-limited width and independently seeded bristle contact. [Model and colors](src/generators/brushwork/README.md) · [Review](docs/brushwork-review.md). |

## Samples of every style

These are actual outputs from the shipping browser workers. Click a sample to open the same seed in the gallery. Each style has two examples; [the sample manifest](docs/samples/manifest.json) records seeds, artwork revisions, dimensions and image hashes. The [reproduction script](scripts/readme-samples.mjs) also saves complete panoramic views for Landscapes, Seascapes and Dunes.

| Style | Sample 1 | Sample 2 |
| --- | --- | --- |
| **Flowers** | <a href="https://hectorrguez.github.io/painting-prints/flowers/?seed=painting-stock-v1-flowers-0"><img src="docs/samples/flowers-1.jpg" width="300" alt="Flowers, procedural sample 1"></a> | <a href="https://hectorrguez.github.io/painting-prints/flowers/?seed=painting-stock-v1-flowers-1"><img src="docs/samples/flowers-2.jpg" width="300" alt="Flowers, procedural sample 2"></a> |
| **Landscapes** | <a href="https://hectorrguez.github.io/painting-prints/landscapes/?seed=painting-stock-v1-landscapes-0"><img src="docs/samples/landscapes-1.jpg" width="300" alt="Landscapes, procedural sample 1"></a> | <a href="https://hectorrguez.github.io/painting-prints/landscapes/?seed=painting-stock-v1-landscapes-3"><img src="docs/samples/landscapes-2.jpg" width="300" alt="Landscapes, procedural sample 2"></a> |
| **Leaf Skeletons** | <a href="https://hectorrguez.github.io/painting-prints/leaves/?seed=leaf-review-008"><img src="docs/samples/leaves-1.jpg" width="300" alt="Leaf Skeletons, procedural sample 1"></a> | <a href="https://hectorrguez.github.io/painting-prints/leaves/?seed=leaf-review-017"><img src="docs/samples/leaves-2.jpg" width="300" alt="Leaf Skeletons, procedural sample 2"></a> |
| **Snowflakes** | <a href="https://hectorrguez.github.io/painting-prints/snowflakes/?seed=snowflake-review-000"><img src="docs/samples/snowflakes-1.jpg" width="300" alt="Snowflakes, procedural sample 1"></a> | <a href="https://hectorrguez.github.io/painting-prints/snowflakes/?seed=snowflake-review-007"><img src="docs/samples/snowflakes-2.jpg" width="300" alt="Snowflakes, procedural sample 2"></a> |
| **Seascapes** | <a href="https://hectorrguez.github.io/painting-prints/seascapes/?seed=seascape-review-33"><img src="docs/samples/seascapes-1.jpg" width="300" alt="Seascapes, procedural sample 1"></a> | <a href="https://hectorrguez.github.io/painting-prints/seascapes/?seed=seascape-review-01"><img src="docs/samples/seascapes-2.jpg" width="300" alt="Seascapes, procedural sample 2"></a> |
| **Ribbons** | <a href="https://hectorrguez.github.io/painting-prints/ribbons/?seed=ribbons-review-00"><img src="docs/samples/ribbons-1.jpg" width="300" alt="Ribbons, procedural sample 1"></a> | <a href="https://hectorrguez.github.io/painting-prints/ribbons/?seed=ribbons-review-16"><img src="docs/samples/ribbons-2.jpg" width="300" alt="Ribbons, procedural sample 2"></a> |
| **Dunes** | <a href="https://hectorrguez.github.io/painting-prints/dunes/?seed=dunes-review-09"><img src="docs/samples/dunes-1.jpg" width="300" alt="Dunes, procedural sample 1"></a> | <a href="https://hectorrguez.github.io/painting-prints/dunes/?seed=dunes-review-15"><img src="docs/samples/dunes-2.jpg" width="300" alt="Dunes, procedural sample 2"></a> |
| **Brushwork** | <a href="https://hectorrguez.github.io/painting-prints/brushwork/?seed=brushwork-review-11"><img src="docs/samples/brushwork-1.jpg" width="300" alt="Brushwork, procedural sample 1"></a> | <a href="https://hectorrguez.github.io/painting-prints/brushwork/?seed=brushwork-review-16"><img src="docs/samples/brushwork-2.jpg" width="300" alt="Brushwork, procedural sample 2"></a> |

The original models compute their geometry from seeded equations or growth rules. Named families select parameter distributions; they do not select stored finished outlines. Their linked reviews include larger galleries, equations, parameter ranges, stress cases and approximation limits.

## Using the gallery

1. Choose a style from the desktop tabs or phone selector.
2. Select **Create** for a fresh seeded composition. Zoom and pan to inspect the drawing. Landscapes, Seascapes and Dunes share a wide desktop panorama and a centered landscape crop on phones and in downloads.
3. Copy the page URL to share the displayed seed.
4. Open **Settings** to choose PNG, SVG or PDF, optional paper, and PDF page size/orientation; then select **Download**.

For example, [`ribbons/?seed=a-flow`](https://hectorrguez.github.io/painting-prints/ribbons/?seed=a-flow) reproduces that generator's default recipe. The seed and artwork revision determine the result. A revised generator may regenerate an older cached seed; seeds do not freeze historical versions of the code.

| Format | Output |
| --- | --- |
| PNG | Raster artwork with optional paper. Flowers preserves its native source pixels; the other styles normally export at 3200 pixels wide. |
| SVG | Vector geometry for Landscapes and the six original generators. Flowers embeds its raster source in an SVG wrapper. |
| PDF | A printable page with the chosen size/orientation; the current exporter embeds a rendered PNG. |

Flowers and Landscapes each ship ten starter paintings. The six newer styles generate on demand. Generated artwork and previews are cached locally in IndexedDB where available, so returning to a style or reloading its seed can reuse the same drawing. The app is a static site and needs no application server or API key.

## Parameters and reproducibility

The browser interface exposes style selection, generation, viewing and export settings. Detailed shape controls are JavaScript APIs documented with each generator. They are not interactive sliders, and arbitrary overrides are not encoded in the gallery's seed URLs.

For example:

```js
import { generateDunes } from './src/generators/dunes/generate.js';

const painting = generateDunes('caravan-study', {
  crestHeight: 72,
  curvature: .16,
  travelerCount: 2,
  camelCount: 3,
  figureScale: 1,
  caravanSpacing: 40,
});

// painting.svg, painting.width, painting.height,
// painting.parameters and painting.metrics are available for inspection.
```

The models use bounded, validated controls and deterministic random streams. Many return intermediate geometry for independent measurement. Their finite seed space provides extensive reproducible variation; the sample audits establish uniqueness for the reviewed sets. These are artistic models: a snowflake's growth parameters are not calibrated weather, a wave is not a fluid simulation, and the dune terrain is an illustrative height field.

## Mathematical and visual inspiration

The original implementations draw on these primary sources. Each model's documentation distinguishes the implemented idea from the parts of the source that are not reproduced.

| Generator | Sources and adapted ideas |
| --- | --- |
| Leaves | Runions et al., [*Modeling and visualization of leaf venation patterns*](https://algorithmicbotany.org/papers/venation.sig2005.pdf): hierarchical veins and connected networks. Botanical profile references are linked in the [leaf documentation](src/generators/leaves/README.md). |
| Snowflakes | Clifford Reiter's [local cellular model](https://webbox.lafayette.edu/~reiterc/mvp/sfn/sfn_pp.pdf), with Libbrecht's [branching-instability explanation](https://www.snowcrystals.com/branching/branching.html). |
| Seascapes | [*GPU Gems*: Effective Water Simulation from Physical Models](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models) for supporting waves; Hokusai's [*Under the Wave off Kanagawa*](https://www.metmuseum.org/art/collection/search/45434) for the drawn breaker. |
| Ribbons | Bridson et al., [*Curl-Noise for Procedural Fluid Flow*](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph2007-curlnoise.pdf), and Jobard/Lefer, [*Creating Evenly-Spaced Streamlines of Arbitrary Density*](https://doi.org/10.1007/978-3-7091-6876-9_5). |
| Dunes | Kroy et al., [*On the shape of barchan dunes*](https://arxiv.org/pdf/cond-mat/0501152) and [*Minimal model for aeolian sand dunes*](https://arxiv.org/pdf/cond-mat/0203040): windward sections and qualitative width relationships. |
| Ink Gestures | Strassmann, [*Hairy Brushes in Computer-Generated Images*](https://dspace.mit.edu/server/api/core/bitstreams/618d714e-613f-4863-9bc0-b67e4e38100f/content): pressure-dependent bristle spread and contact. |

## Run locally

Use **Node.js 22** and npm, matching CI.

```sh
npm ci
npm run dev
```

Vite starts the local site and prepares the generator workers first. The development server prints its URL. For a production build:

```sh
npm test
npm run build
npm run preview
```

Run test/build commands sequentially because both prepare `public/generators/`. AssemblyScript compiles the shared numeric kernels using the installed npm tools; a separate Go toolchain is no longer required.

## Code structure

| Location | Responsibility |
| --- | --- |
| [src/projects.js](src/projects.js) | Style registry, labels, page ratios and artwork revisions. |
| [src/generators/](src/generators/) | Per-style generation, metadata, worker entry points and build adapters. |
| [src/generators/shared/](src/generators/shared/) | Seeded randomness, SVG helpers, Canvas line preview and shared WASM kernels. |
| [src/main.js](src/main.js), [src/interface.js](src/interface.js) | Gallery navigation, controls, rendering state and responsive style selection. |
| [src/painting-cache.js](src/painting-cache.js) | Bundled and local artwork caching, seed recovery and compressed payloads. |
| [src/artwork-svg.js](src/artwork-svg.js), [src/export.js](src/export.js), [src/pdf.js](src/pdf.js) | Export formatting, paper/transparency and printable PDFs. |
| [scripts/prepare-generators.mjs](scripts/prepare-generators.mjs), [scripts/prepare-pages.mjs](scripts/prepare-pages.mjs) | Worker preparation and direct style pages for the static build. |
| [scripts/art-review/](scripts/art-review/) and [docs/](docs/) | Reproducible sample batches, visual galleries, research and parameter documentation. |
| [public/cache/](public/cache/) | The twenty bundled starter paintings and preview assets. |

The six original generators run in cancellable browser workers. Their drawings are ordinary SVG path data, rendered through the shared preview/export pipeline. Review images under `docs/previews/` document results; the live generators compute new artwork rather than selecting from those images.

## Testing and visual review

```sh
npm test
npm run build
npm install --no-save --package-lock=false playwright@1.58.2
npx playwright install chromium
node scripts/check-browser.mjs
```

The [current refinement audit](docs/refinement-review.md) records **122 passing tests**, the production build, and visual/browser checks for all eight styles. The [earlier integration audit](docs/integration-review.md) preserves the original ten-style merge history. Tests cover mathematical identities, connectedness, symmetry, geometry bounds, crossings, determinism, worker parity, caching and exports as appropriate to each model. The browser suite checks direct links, Create/back navigation, revision upgrades, phone layouts, transparent/paper pixels and downloaded files. Artifacts are written to `.artifacts/browser/`.

Each original style has a committed 48-seed visual review, with additional extreme or stress cases. Panoramic reviews save both the complete drawing and its central print crop. To generate another batch through the actual line renderer:

```sh
npm install --no-save --package-lock=false canvas@3.2.3 path2d@0.2.2
node scripts/art-review/ribbons.mjs --count 48 --raster --out .artifacts/ribbons
node scripts/art-review/dunes.mjs --count 48 --raster --width 3200 --out .artifacts/dunes
node scripts/art-review/snowflakes.mjs --count 48 --raster --out .artifacts/snowflakes
node scripts/art-review/brushwork-stress.mjs --count 8 --prefix brushwork-stress \
  --raster --out .artifacts/brushwork-stress
```

Regenerate the README samples with `node scripts/readme-samples.mjs` after preparing workers and installing Playwright.

Leaves and Snowflakes have dedicated [leaf](src/generators/leaves/README.md#verification) and [snowflake](src/generators/snowflakes/README.md) review commands. Raster tooling is optional and is not a runtime dependency. To rebuild Flowers/Landscapes starter assets, follow the [bundled-cache guide](scripts/cache/README.md).

## Credits and deployment

| Contribution | Credit |
| --- | --- |
| Original flower engine | Lingdong Huang — [nonflowers](https://github.com/LingDong-/nonflowers); [retained license](src/generators/flowers/upstream/LICENSE). |
| Original landscape engine | Lingdong Huang — [shan-shui-inf](https://github.com/LingDong-/shan-shui-inf); [retained license](src/generators/landscapes/upstream/LICENSE). |
| Leaf Skeletons, Snowflakes, Seascapes, Ribbons, Dunes and Ink Gestures | Original implementations developed for Painting in this repository, with research attribution in each model's documentation. |
| Interface controls, icons and typography | Daniel Belyi — [Drawably](https://github.com/danielwh2/drawably); its license ships with the dependency. |

Upstream source snapshots and licenses remain with the two adapted engines. Research citations describe inspiration and model provenance; they do not replace those source licenses.

[Pull-request CI](.github/workflows/checks.yml) runs tests, builds the site and performs Chromium verification. The [Pages workflow](.github/workflows/pages.yml) tests and publishes `dist/` to GitHub Pages when `main` changes. Deployment uses relative asset paths and generated style subpages.
