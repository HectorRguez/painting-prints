# Cityscapes

Based on [fogleman/ln](https://github.com/fogleman/ln), MIT.
Reference snapshot: `fogleman-ln-12e6c6e`. Upstream source and license are kept in `upstream/`.

The original Go visibility engine compiles to WASM using Go 1.27.2. The adapter
adds seeded towers and strips the unused desktop PNG writer during the build,
so no Go third-party dependencies are required. Visible paths cross into JS
once; canvas draws them, and SVG retains their geometry. Only opening Create
for this style downloads the Go runtime and engine; starter previews do not.
The browser host terminates each worker after receiving its result.

Previews and PNG/PDF rendering use the shared native canvas renderer. SVG export
retains the vector paths. Ten starter drawings live in `public/cache/cityscapes/`.
