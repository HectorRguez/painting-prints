import { noise, seedNoise } from '../shared/noise';
export { seedNoise };
export function angle(x: f64, y: f64): f64 {
  return noise(x * 2.8, y * 2.8) * 6.28 + noise(x * 6 + 13, y * 6 + 19) * 0.7;
}
