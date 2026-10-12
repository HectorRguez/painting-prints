# Buildings

Based on [N3R01N/iso-building-generator](https://github.com/N3R01N/iso-building-generator), MIT.
Reference snapshot: `N3R01N-iso-building-generator-a637827`. Upstream source and license are kept in `upstream/`.

The original seeded facade/geometry generator runs in a worker. Depth sorting
and all 3D point projection are batched in WASM. Canvas draws opaque white faces
in painter order, then converts white to transparency, retaining occlusion.
SVG uses the equivalent filter. The adaptation disables colour, animation,
textures and soft shadows, and uses medium geometry detail. There are no DOM
nodes per face. The kernel is checked against the original sorter/projector.

Previews and PNG/PDF rendering use the shared native canvas renderer. SVG export
retains the vector paths. Ten starter drawings live in `public/cache/buildings/`.
