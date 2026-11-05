import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { brushFamilies, brushRanges, brushParameters, brushStrokes, gestureAt, pressureAt, simplifyTrace, bristleGeometry, buildBrushwork, generateBrushwork } from '../src/generators/brushwork/generate.js';
const close = (a,b,e=1e-7) => assert.ok(Math.abs(a-b)<=e, `${a} != ${b}`);
const digest = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');

test('seeded Unicode and empty seeds reproduce parameters and vector artwork', () => {
  for (const seed of ['', '墨 / ? & 71']) assert.deepEqual(generateBrushwork(seed), generateBrushwork(seed));
  const overrides = Object.freeze({dryness:0, roughness:0, accent:0, radialWobble:0});
  const p = brushParameters('controls', overrides);
  for (const key of Object.keys(overrides)) assert.equal(p[key],0);
  for (const [key,[lo,hi]] of Object.entries(brushRanges)) for (const value of [lo-1,hi+1,NaN,Infinity]) assert.throws(()=>brushParameters('x',{[key]:value}),RangeError);
  for (const key of ['strokeCount','samples','bristles']) assert.throws(()=>brushParameters('x',{[key]:brushRanges[key][0]+.5}),RangeError);
  assert.throws(()=>brushParameters('x',{family:'glyph'}),RangeError);
  assert.throws(()=>brushParameters('x',{unknown:1}),RangeError);
});

test('analytic trajectories agree with independent finite differences and exact circles', () => {
  for (const family of brushFamilies) {
    const p=brushParameters('derivatives',{family});
    for(const stroke of brushStrokes('derivatives',p)) for(const t of [.07,.23,.51,.87]) {
      const h=1e-4, a=gestureAt(stroke,t-h), b=gestureAt(stroke,t), c=gestureAt(stroke,t+h);
      const d=c.point.map((v,i)=>(v-a.point[i])/(2*h));
      const dd=c.point.map((v,i)=>(v-2*b.point[i]+a.point[i])/(h*h));
      d.forEach((v,i)=>close(v,b.tangent[i],.001));
      close((d[0]*dd[1]-d[1]*dd[0])/Math.hypot(...d)**3,b.curvature,1e-8);
    }
  }
  const p=brushParameters('circle',{family:'orbit',radialWobble:0,aspect:1});
  const stroke={...brushStrokes('circle',p)[0],drift:0};
  for(let i=0;i<=20;i++) { const g=gestureAt(stroke,i/20); close(Math.hypot(g.point[0]-stroke.center[0],g.point[1]-stroke.center[1]),stroke.radius); close(g.curvature,1/stroke.radius); }
});

test('pressure release and curvature-limited brush frames stay smooth and oriented', () => {
  for (const family of brushFamilies) {
    const p=brushParameters('pressure',{family,width:220,bend:1.25,aspect:.65,radialWobble:.12,pressureVariation:.65});
    for(const stroke of brushStrokes('pressure',p)) {
      assert.equal(pressureAt(stroke,p,0),0); assert.equal(pressureAt(stroke,p,1),0);
      const {frames}=bristleGeometry('pressure',stroke,p);
      for(const [i,f] of frames.entries()) {
        close(Math.hypot(...f.normal),1); close(Math.hypot(...f.tangent),1);
        close(f.normal[0]*f.tangent[0]+f.normal[1]*f.tangent[1],0);
        assert.ok(f.pressure>=0 && f.pressure<=pressureAt(stroke,p,f.t)+1e-10);
        assert.ok(stroke.width*f.pressure*.5*Math.abs(f.curvature)<=.75000001);
        if(i) { const a=frames[i-1], ds=Math.hypot(f.point[0]-a.point[0],f.point[1]-a.point[1]); assert.ok(Math.abs(f.pressure-a.pressure)*stroke.width<=ds+1e-8); }
      }
    }
  }
});

function segmentDistance(p,a,b) { const d=[b[0]-a[0],b[1]-a[1]], l=d[0]**2+d[1]**2, u=l?Math.max(0,Math.min(1,((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/l)):0; return Math.hypot(p[0]-a[0]-u*d[0],p[1]-a[1]-u*d[1]); }
test('trace simplification respects independent geometric error and endpoints',()=>{
  for(const points of [Array.from({length:501},(_,i)=>[i/5,Math.sin(i/20)*15]),Array.from({length:20},()=>[0,0])]) {
    const simple=simplifyTrace(points,.1); assert.deepEqual(simple[0],points[0]); assert.deepEqual(simple.at(-1),points.at(-1));
    for(const p of points) assert.ok(Math.min(...simple.slice(1).map((b,i)=>segmentDistance(p,simple[i],b)))<=.1000001);
    assert.ok(simple.length<points.length);
  }
});

test('dryness removes contact while pigment changes only color, and continuous controls move geometry',()=>{
  const seed='contact', p=brushParameters(seed,{family:'orbit'}), stroke=brushStrokes(seed,p)[0];
  const samples=g=>g.bands.reduce((n,b)=>n+b.centerline.length,0);
  const wet=bristleGeometry(seed,stroke,{...p,dryness:0}), dry=bristleGeometry(seed,stroke,{...p,dryness:.85});
  assert.ok(samples(dry)<samples(wet)*.8);
  const pale=bristleGeometry(seed,{...stroke,pigment:.4,accent:1},p), normal=bristleGeometry(seed,stroke,p);
  assert.deepEqual(pale.bands.map(b=>b.points),normal.bands.map(b=>b.points)); assert.notEqual(pale.bands[0].color,normal.bands[0].color);
  const moved=gestureAt({...stroke,radialWobble:stroke.radialWobble+.0001},.37).point, original=gestureAt(stroke,.37).point;
  const displacement=Math.hypot(...moved.map((v,i)=>v-original[i])); assert.ok(displacement>0 && displacement<.1);
});

test('48 default compositions have unique geometry, valid bounded fill paths and all families',()=>{
  const hashes=new Set(), families=new Set();
  for(let i=0;i<48;i++) {
    const seed=`brushwork-review-${String(i).padStart(2,'0')}`, s=buildBrushwork(seed);
    families.add(s.parameters.family); hashes.add(digest(s.paths)); assert.ok(s.paths.length>=40);
    for(const g of s.geometry) for(const b of g.bands) for(const [x,y] of b.points) {
      const px=s.fit.x+x*s.fit.scale, py=s.fit.y+y*s.fit.scale;
      assert.ok(Number.isFinite(px)&&Number.isFinite(py)&&px>=74.999&&px<=925.001&&py>=74.999&&py<=925.001);
    }
    assert.ok(JSON.stringify(s.paths).length<1_500_000);
  }
  assert.equal(hashes.size,48); assert.deepEqual([...families].sort(),[...brushFamilies].sort());
});

import { brushworkStressCases } from '../scripts/art-review/brushwork-cases.mjs';
test('joint extremes honor controls and retain finite nonempty vector output',()=>{
  for(const [i,{name,controls}] of brushworkStressCases.entries()) {
    const art=generateBrushwork(`brushwork-stress-${String(i).padStart(2,'0')}`,controls);
    for(const key of Object.keys(controls)) assert.equal(art.parameters[key],controls[key],`${name}: ${key}`);
    assert.ok(art.svg.length>1000 && art.svg.length<4_000_000, name);
    assert.ok(!/NaN|Infinity/.test(art.svg),name); assert.ok(art.metrics.fragments>=40,name);
  }
});
