import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artworkSvg } from '../src/artwork-svg.js';
const painting = { mode: 'landscapes', seed: 'a&b', width: 20, height: 10,
 svg: '<svg width="20" height="10" style="mix-blend-mode:multiply" viewBox="1 2 20 10"><path fill="white" d="M0 0L1 1"/><path stroke="black" d="M2 2L3 3"/></svg>' };
test('worker-safe SVG formatting preserves occlusion order and viewBox', () => {
  const svg = artworkSvg(painting);
  assert.ok(svg.includes('viewBox="1 2 20 10"'));
  assert.ok(svg.includes('<g filter="url(#transparent-ink)"><path fill="white"'));
  assert.ok(svg.indexOf('fill="white"') < svg.indexOf('stroke="black"'));
  assert.ok(svg.includes('a&amp;b'));
  assert.ok(!svg.includes('mix-blend-mode:multiply'));
});
test('paper is optional and flower source pixels stay unchanged', () => {
  assert.ok(artworkSvg(painting, true).includes('<rect width="20" height="10" fill="white"/>'));
  const flower = { ...painting, mode: 'flowers', png: 'data:image/png;base64,original', transparentPng: 'data:image/png;base64,foreground' };
  assert.ok(artworkSvg(flower).includes(flower.transparentPng));
  assert.ok(artworkSvg(flower, true).includes(flower.png));
});
