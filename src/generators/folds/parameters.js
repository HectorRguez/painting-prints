import { randomSource } from '../shared/port.js';
import { fitDefaultProjection } from './surface.js';

export const foldPalettes = {
  peacock: [[23, 66, 67], [56, 123, 118], [217, 229, 211]],
  terracotta: [[88, 38, 40], [190, 91, 65], [246, 204, 156]],
  indigo: [[27, 35, 68], [75, 98, 140], [210, 217, 225]],
  saffron: [[100, 55, 35], [205, 147, 60], [250, 228, 176]],
  rose: [[66, 37, 56], [159, 91, 111], [235, 202, 198]],
};

export const foldRanges = {
  pleats: [8, 32], aperture: [1.4, 5.2], innerRadius: [45, 200], width: [150, 380], length: [450, 800],
  amplitude: [0, 36], bend: [0, 100], twist: [-.8, .8], arch: [0, 95], edgeWave: [0, .35],
  taper: [0, .45], phase: [-1000, 1000], tilt: [0, .6], rotation: [-Math.PI, Math.PI],
  lightAzimuth: [-Math.PI, Math.PI], lightElevation: [.3, 1.3], padding: [80, 170],
  cameraRoll: [-Math.PI, Math.PI], aspect: [.75, 1.3], endRound: [0, .09],
  companionScale: [.45, .85], separation: [.1, .38], companionRotation: [-Math.PI, Math.PI],
  spacingVariation: [0, .08], edgeLift: [.05, .5], edgeSoftness: [.4, 2], pleatRoundness: [.6, 1.8],
};

export function foldParameters(seed) {
  const random = randomSource(`${seed}:fold-parameters`);
  const between = (a, b) => a + (b - a) * random();
  const family = random() < .55 ? 'fan' : 'sweep';
  const parameters = { family, palette: Object.keys(foldPalettes)[Math.floor(random() * 5)],
    pleats: Math.floor(between(13, 24)), aperture: between(1.8, 4.7), innerRadius: between(65, 160),
    width: between(210, 330), length: between(500, 680), amplitude: between(13, 28),
    bend: between(35, 85), twist: between(-.7, .7), arch: between(35, 85),
    edgeWave: between(.15, .32), taper: between(.1, .35), phase: between(0, Math.PI * 2),
    tilt: between(.25, .55), rotation: between(-Math.PI, Math.PI),
    lightAzimuth: between(-2.7, -1.6), lightElevation: between(.55, .95),
    padding: between(105, 155), cameraRoll: between(-Math.PI, Math.PI), aspect: between(.8, 1.22),
    endRound: between(.035, .085), composition: random() < .27 ? 'paired' : 'single',
    companionScale: between(.58, .78), separation: between(.2, .32),
    companionRotation: .9, spacingVariation: .025, edgeLift: .2, edgeSoftness: .7, pleatRoundness: 1 };
  return fitDefaultProjection(parameters);
}

export function companionParameters(seed, primary) {
  return fitDefaultProjection({ ...foldParameters(`${seed}:companion`),
    palette: { peacock: 'saffron', saffron: 'peacock', indigo: 'terracotta', terracotta: 'indigo', rose: 'saffron' }[primary.palette],
    family: primary.family === 'fan' ? 'sweep' : 'fan', tilt: primary.tilt,
    cameraRoll: primary.cameraRoll + primary.companionRotation,
    lightAzimuth: primary.lightAzimuth, lightElevation: primary.lightElevation });
}

export function resolveFoldParameters(seed, overrides = {}) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new TypeError('Fold overrides must be an object');
  const parameters = foldParameters(seed);
  for (const [name, value] of Object.entries(overrides)) {
    const choices = name === 'family' ? ['fan', 'sweep'] : name === 'composition' ? ['single', 'paired']
      : name === 'palette' ? Object.keys(foldPalettes) : null;
    if (choices ? !choices.includes(value) : !Object.hasOwn(foldRanges, name) || !Number.isFinite(value)
      || value < foldRanges[name][0] || value > foldRanges[name][1] || name === 'pleats' && !Number.isInteger(value)) {
      throw new RangeError(`Unsupported fold parameter ${name}`);
    }
    parameters[name] = value;
  }
  return parameters;
}
