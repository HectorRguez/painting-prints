# Currents

Based on [anvaka/noisylines](https://github.com/anvaka/noisylines), MIT.
Reference snapshot: `anvaka-streamlines-930bd2e`. Upstream source and license are kept in `upstream/`.

The vendored code is [anvaka/streamlines](https://github.com/anvaka/streamlines),
the library behind Noisy Lines. Its original spacing and RK4 tracing run in a
worker; repeated gradient-noise field evaluation runs in `engine.wasm`.
The bounded square composition and seeded field are our adaptation.

Previews and PNG/PDF rendering use the shared native canvas renderer. SVG export
retains the vector paths. Ten starter drawings live in `public/cache/currents/`.
