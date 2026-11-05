export const foldStudies = [
  { name: 'open-fan', controls: { family: 'fan', composition: 'single', aperture: 5.2, innerRadius: 45, width: 300, tilt: .25, arch: 35, twist: .25 } },
  { name: 'narrow-fan', controls: { family: 'fan', composition: 'single', aperture: 1.4, innerRadius: 200, width: 150, pleats: 8, tilt: .2, arch: 0, twist: 0 } },
  { name: 'fine-pleats', controls: { composition: 'single', pleats: 32, amplitude: 36, spacingVariation: .08, pleatRoundness: .6, edgeLift: .05, tilt: .25 } },
  { name: 'soft-pleats', controls: { composition: 'single', pleats: 8, amplitude: 4, spacingVariation: 0, pleatRoundness: 1.8, edgeSoftness: 2, edgeLift: .5 } },
  { name: 'broad-sweep', controls: { family: 'sweep', composition: 'single', width: 380, length: 450, bend: 100, taper: .45, aspect: 1.3, twist: 0, arch: 0, tilt: 0, endRound: .09 } },
  { name: 'slender-sweep', controls: { family: 'sweep', composition: 'single', width: 150, length: 800, bend: 0, taper: 0, aspect: .75, twist: -.8, arch: 35, tilt: .2, endRound: 0 } },
  { name: 'grazing-view', controls: { composition: 'single', tilt: .6, arch: 0, twist: 0, amplitude: 20, lightElevation: .3, lightAzimuth: Math.PI, cameraRoll: -Math.PI } },
  { name: 'high-light', controls: { composition: 'single', lightElevation: 1.3, lightAzimuth: -Math.PI, amplitude: 10, padding: 170, edgeWave: 0 } },
  { name: 'close-pair', controls: { composition: 'paired', companionScale: .85, separation: .1, companionRotation: -Math.PI, padding: 80 } },
  { name: 'open-pair', controls: { composition: 'paired', companionScale: .45, separation: .38, companionRotation: Math.PI, palette: 'peacock', padding: 170 } },
];
