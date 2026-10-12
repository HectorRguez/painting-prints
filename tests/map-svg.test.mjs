import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project, hiddenInterval, visibleIntervals, terrainSvg } from '../src/generators/maps/svg.js';

test('the hybrid 3D projection raises mountain peaks above sea level', () => {
  const sea=project([500,500,0]), peak=project([500,500,1]);
  assert.equal(sea[0],peak[0]);
  assert.ok(peak[1]<sea[1]);
  assert.ok(peak[2]>sea[2]);
  assert.deepEqual(project([500,500,-1]),sea);
});

test('a foreground triangle hides only the line interval behind it', () => {
  const a=[-1,.25,0], b=[2,.25,0], triangle=[[0,0,1],[1,0,1],[0,1,1]];
  const interval=hiddenInterval(a,b,triangle);
  assert.ok(Math.abs(interval[0]-1/3)<1e-8);
  assert.ok(Math.abs(interval[1]-7/12)<1e-8);
  assert.deepEqual(visibleIntervals(a,b,[triangle]),[[0,interval[0]],[interval[1],1]]);
  assert.equal(hiddenInterval(a,b,triangle.map(([x,y])=>[x,y,-1])),null);
  assert.equal(hiddenInterval(a,b,triangle.map(([x,y])=>[x,y,0])),null);
});

test('hidden-line clipping also handles a line crossing a face in depth', () => {
  const triangle=[[0,0,1],[1,0,1],[0,1,1]];
  const interval=hiddenInterval([.1,.1,0],[.2,.1,2],triangle);
  assert.equal(interval[0],0);
  assert.ok(interval[1]>.48 && interval[1]<.5);
});

test('3D terrain exports real vector lines on a transparent normalized canvas', () => {
  const vertices=[[400,400,-.1],[600,400,-.1],[500,500,1],[600,600,-.1],[400,600,-.1]];
  const indices=Int32Array.from([0,1,2,1,3,2,3,4,2,4,0,2]);
  const svg=terrainSvg(vertices,indices,[]);
  assert.ok(svg.includes('viewBox="0 0 1000 1000"'));
  assert.match(svg,/data-feature="coast"[^>]*d="M/);
  assert.match(svg,/data-feature="hatch"[^>]*d="M/);
  assert.ok(!/<image|<canvas|NaN|Infinity/.test(svg));
  assert.equal(terrainSvg(vertices,indices,[]),svg);
});

test('projection matches the original default top-down coasts and height-50 mountains', () => {
  assert.deepEqual(project([125,700,0]),[125,700,0]);
  assert.deepEqual(project([125,700,1]),[125,650,50]);
  assert.deepEqual(project([900,125,.5]),[900,100,25]);
});
