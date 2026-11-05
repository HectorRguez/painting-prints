import { randomSource } from '../shared/port.js';

export const ribbonFamilies = ['sweep', 'meander', 'eddy', 'confluence'];
const TAU = 2 * Math.PI;
const palettes = [
  ['#3b686d', '#b76d51', '#c6ac77'],
  ['#374f6a', '#7e9c9a', '#c29764'],
  ['#495e53', '#9c765a', '#b3ac86'],
  ['#685873', '#b17c73', '#7b9997'],
];

// The families are parameter priors, never stored paths or coordinate glyphs.
export function ribbonParameters(seed, familyOverride) {
  const random = randomSource(`ribbons:parameters:${seed}`);
  for (let i = 0; i < 9; i++) random();
  const pick = (lo, hi) => lo + (hi - lo) * random();
  const selectedFamily = ribbonFamilies[Math.floor(random() * ribbonFamilies.length)];
  const family = familyOverride ?? selectedFamily;
  if (!ribbonFamilies.includes(family)) throw new RangeError('Unknown ribbon family');
  const angle = pick(-Math.PI, Math.PI);
  const harmonics = Array.from({ length: 3 }, (_, i) => ({
    frequency: pick(.35, 1.0) * (1 + i * .55), angle: pick(-Math.PI, Math.PI),
    amplitude: pick(.025, .10) / (1 + i * .5), phase: pick(0, TAU),
  }));
  let speed = pick(.55, .85), vortices = [];
  if (family === 'meander') {
    speed = pick(.32, .48);
    harmonics[0] = { frequency: pick(.65, 1.1), angle: pick(-.3, .3), amplitude: pick(.48, .75), phase: pick(0, TAU) };
  } else if (family === 'eddy') {
    speed = pick(.035, .095);
    vortices = [{ center: [pick(-.20, .20), pick(-.20, .20)], radius: pick(.35, .65), circulation: (random() < .5 ? -1 : 1) * pick(1.8, 3.4) }];
    harmonics.forEach(h => { h.amplitude *= .55; });
  } else if (family === 'confluence') {
    speed = pick(.10, .26);
    const offset = pick(.33, .50), polarity = random() < .5 ? -1 : 1;
    vortices = [-1, 1].map(side => ({ center: [pick(-.15, .15), side * offset], radius: pick(.26, .43), circulation: side * polarity * pick(1.5, 2.9) }));
  } else {
    vortices = [{ center: [pick(-.5, .5), pick(-.5, .5)], radius: pick(.45, .8), circulation: pick(-1.1, 1.1) }];
  }
  return {
    family,
    field: { angle, anisotropy: pick(.8, 1.35), drift: { speed, angle: pick(-.1, .1) }, harmonics, vortices },
    integration: { step: .013, minStep: .00025, tolerance: .000002, minSpeed: .00001, maxSteps: 1600 },
    ribbon: { count: Math.floor(pick(17, 27)), width: pick(.035, .065), widthVariation: pick(.18, .44),
      spacing: pick(.018, .035), taper: pick(.13, .25), taperPower: pick(.8, 1.4),
      maxLength: family === 'eddy' ? pick(4.3, 5.8) : pick(2.7, 4.4), minLength: .32, stripes: Math.floor(pick(2, 5)) },
    composition: { center: [pick(-.035, .035), pick(-.035, .035)],
      radii: family === 'confluence' ? [pick(.70, .86), pick(.85, .95)] : [pick(.83, .95), family === 'sweep' ? pick(.55, .78) : pick(.68, .92)],
      angle: angle + pick(-.2, .2), seedBias: pick(.55, .85) },
    style: { palette: [...palettes[Math.floor(random() * palettes.length)]], ink: '#35434a', outlineFraction: pick(.12, .35), lineWidth: .65 },
  };
}

function merge(base, overrides, path = '') {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new TypeError(`${path || 'overrides'} must be an object`);
  const result = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(base, key)) throw new TypeError(`Unknown parameter ${path}${key}`);
    result[key] = base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])
      ? merge(base[key], value, `${path}${key}.`) : value;
  }
  return result;
}

function range(value, lo, hi, name, integer = false) {
  if (!Number.isFinite(value) || value < lo || value > hi || (integer && !Number.isInteger(value)))
    throw new RangeError(`${name} must be ${integer ? 'an integer ' : ''}in [${lo}, ${hi}]`);
}
function pair(value, lo, hi, name) {
  if (!Array.isArray(value) || value.length !== 2) throw new TypeError(`${name} must contain two numbers`);
  value.forEach(v => range(v, lo, hi, name));
}
function keys(object, allowed, name) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) throw new TypeError(`${name} must be an object`);
  for (const key of Object.keys(object)) if (!allowed.includes(key)) throw new TypeError(`Unknown ${name}.${key}`);
}

export function resolveRibbonParameters(seed, overrides = {}) {
  const parameters = merge(ribbonParameters(seed, overrides.family), overrides);
  const { field, integration, ribbon, composition, style } = parameters;
  range(field.angle, -TAU, TAU, 'field.angle'); range(field.anisotropy, .5, 2, 'field.anisotropy');
  range(field.drift.speed, 0, 2, 'field.drift.speed'); range(field.drift.angle, -TAU, TAU, 'field.drift.angle');
  if (!Array.isArray(field.harmonics) || field.harmonics.length > 8) throw new RangeError('field.harmonics must contain 0–8 modes');
  field.harmonics.forEach((h, i) => {
    const key = `field.harmonics[${i}]`; keys(h, ['frequency', 'angle', 'amplitude', 'phase'], key);
    range(h.frequency, .1, 5, `${key}.frequency`); range(h.angle, -TAU, TAU, `${key}.angle`);
    range(h.amplitude, 0, 1.5, `${key}.amplitude`); range(h.phase, -TAU, TAU, `${key}.phase`);
  });
  if (!Array.isArray(field.vortices) || field.vortices.length > 4) throw new RangeError('field.vortices must contain 0–4 vortices');
  field.vortices.forEach((v, i) => {
    const key = `field.vortices[${i}]`; keys(v, ['center', 'radius', 'circulation'], key);
    pair(v.center, -1.5, 1.5, `${key}.center`); range(v.radius, .1, 1.3, `${key}.radius`); range(v.circulation, -5, 5, `${key}.circulation`);
  });
  if (!field.drift.speed && !field.harmonics.some(h => h.amplitude) && !field.vortices.some(v => v.circulation)) throw new RangeError('Field must have nonzero drift, a harmonic, or a vortex');
  range(integration.step, .003, .04, 'integration.step'); range(integration.minStep, .00001, .002, 'integration.minStep');
  range(integration.tolerance, .00000001, .0001, 'integration.tolerance'); range(integration.minSpeed, .0000001, .001, 'integration.minSpeed');
  range(integration.maxSteps, 200, 4000, 'integration.maxSteps', true);
  range(ribbon.count, 4, 48, 'ribbon.count', true); range(ribbon.width, .015, .11, 'ribbon.width');
  range(ribbon.widthVariation, 0, .6, 'ribbon.widthVariation'); range(ribbon.spacing, .007, .1, 'ribbon.spacing');
  range(ribbon.taper, .04, .45, 'ribbon.taper'); range(ribbon.taperPower, .6, 2, 'ribbon.taperPower');
  range(ribbon.maxLength, 1.2, 8, 'ribbon.maxLength'); range(ribbon.minLength, .12, .5, 'ribbon.minLength'); range(ribbon.stripes, 0, 7, 'ribbon.stripes', true);
  pair(composition.center, -.1, .1, 'composition.center'); pair(composition.radii, .45, .95, 'composition.radii');
  range(composition.angle, -TAU, TAU, 'composition.angle'); range(composition.seedBias, .25, 1.5, 'composition.seedBias');
  range(style.outlineFraction, 0, 1, 'style.outlineFraction'); range(style.lineWidth, .3, 1.5, 'style.lineWidth');
  if (!Array.isArray(style.palette) || style.palette.length < 1 || style.palette.length > 5 || style.palette.some(c => !/^#[0-9a-f]{6}$/i.test(c))) throw new TypeError('style.palette must contain 1–5 six-digit hex colors');
  if (!/^#[0-9a-f]{6}$/i.test(style.ink)) throw new TypeError('style.ink must be a six-digit hex color');
  return structuredClone(parameters);
}
