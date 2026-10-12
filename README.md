# Painting

A minimal procedural-art gallery with Flowers, Landscapes, Fish, and Maps. Flowers, landscapes, and fish are based on work by **Lingdong Huang**. Maps are adapted from **Amit Patel / Red Blob Games**.
**Live:** https://hectorrguez.github.io/painting-prints/

The interface uses Drawably controls.

Every displayed artwork writes its seed to the URL, for example `fish/?seed=painting-stock-v1-fish-0`. Sharing or reopening that URL loads that exact cached painting or regenerates it from the same seed.

| Style | Generation speedup | Canvas rendering speedup |
| --- | ---: | ---: |
| Flowers | 1.24× | Already canvas |
| Landscapes | Unchanged | 4.11× desktop / 3.62× phone crop |
| Fish | 1.48× | 6.40× |
| Maps | 1.31× | 27.31× |

Three paired seeds on local Chromium, 12 October 2026. Generation compares the
original JavaScript calculation path with our WASM hybrid. Rendering compares
native canvas with resvg at identical resolutions, including PNG encoding;
fish/maps previously displayed SVG directly, so these are renderer measurements,
not whole-page or original-demo speedups. Results vary by image and device.
Reproduce with [the benchmark](scripts/benchmark-engines.html). All previews are
cached PNGs; original vector export sources are retained.
