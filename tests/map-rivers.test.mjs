import { test } from 'node:test';
import assert from 'node:assert/strict';
import { riverSegments } from '../src/generators/maps/rivers.js';
import { drapeSegment, terrainSvg } from '../src/generators/maps/svg.js';

// Triangle vertices correspond to red, green and blue barycentric coordinates.
const triangleBuffer = (w1,w2) => Float32Array.from([10,0,w1,w2, 0,0,w1,w2, 0,10,w1,w2]);

test('rivers follow the upstream shader arc between side midpoints', () => {
  const segments=riverSegments(triangleBuffer(.1,.4));
  assert.deepEqual(segments[0].a,[0,5,0]);
  assert.deepEqual(segments.at(-1).b,[5,0,0]);
  for(const {a,b,width} of segments) {
    for(const [x,y] of [a,b]) assert.ok(Math.abs(Math.sqrt(x*x+y*y+x*y)/10-.5)<1e-8);
    assert.ok(Number.isFinite(width) && width>0);
  }
  assert.ok(segments.at(-1).width>segments[0].width*2);
  const wider=riverSegments(triangleBuffer(.2,.8));
  assert.ok(Math.abs(wider[3].width/segments[3].width-2)<1e-6);
});

test('river segments split at terrain folds and interpolate the surface elevation', () => {
  assert.deepEqual(drapeSegment([-1,.25,0],[2,.25,0],[[0,0,0],[1,0,1],[0,1,0]]),[[0,.25,0],[.75,.25,.75]]);
  assert.equal(drapeSegment([2,2,0],[3,3,0],[[0,0,0],[1,0,1],[0,1,0]]),null);
});

test('export retains different river widths as true vectors over the terrain', () => {
  const vertices=[[0,0,.01],[1000,0,.01],[0,1000,.01]];
  const svg=terrainSvg(vertices,Int32Array.from([0,1,2]),[
    {a:[10,10,0],b:[20,20,0],width:.5},
    {a:[30,30,0],b:[40,40,0],width:2},
  ]);
  assert.match(svg,/data-feature="river" stroke-width="0.5"/);
  assert.match(svg,/data-feature="river" stroke-width="2"/);
  assert.ok(!/<image|NaN|Infinity/.test(svg));
});
