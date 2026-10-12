import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createArtKernels} from '../src/wasm/art-kernels.js';
import {visibleIntervals} from '../src/engines/map-svg.js';
const binary=await readFile(new URL('../public/engines/art-kernels-v1.wasm',import.meta.url));
const fish=vm.createContext({Math});
vm.runInContext(await readFile(new URL('../public/upstream/fishdraw/fishdraw.js',import.meta.url),'utf8'),fish);
const original=(...args)=>fish.seg_isect_poly(...args);
let state=12345;
const random=()=>((state=Math.imul(state,1664525)+1013904223>>>0)/4294967296);

test('WASM polygon intersections match upstream at vertices, parallel edges and rays',async()=>{
  const kernels=await createArtKernels(binary);
  const polygons=[[],[[1,1]],[[0,0],[1,0],[1,1],[0,1]],[[0,0],[2,0],[1,1],[2,2],[0,2]]];
  const lines=[[0,0,1,0],[0,0,1,1],[-1,.5,2,.5],[1,1,1,1]];
  for(let i=0;i<60;i++)lines.push(Array.from({length:4},()=>random()*6-2));
  for(const polygon of polygons)for(const line of lines)for(const ray of [true,false])
    assert.equal(JSON.stringify(kernels.polygonIntersections(...line,polygon,ray)),JSON.stringify(original(...line,polygon,ray)));
});

test('WASM terrain visibility matches JS for overlapping faces, cell boundaries and depth crossings',async()=>{
  const kernels=await createArtKernels(binary);
  const triangles=Array.from({length:100},()=>{
    const x=random()*100-50,y=random()*100-50,z=random()*10;
    return [[x,y,z],[x+random()*50,y+random()*10,z+1],[x+random()*10,y+random()*50,z+2]];
  });
  triangles.push([[0,0,0],[0,0,0],[0,0,0]]);
  assert.deepEqual(kernels.terrainClipper([])([0,0,0],[1,1,1]),[[0,1]]);
  const clip=kernels.terrainClipper(triangles);
  for(let i=0;i<250;i++) {
    const a=[random()*200-100,random()*200-100,random()*20-5];
    const b=[random()*200-100,random()*200-100,random()*20-5];
    // The union of hidden portions is order independent; arithmetic at a
    // boundary may differ by a final binary digit when subtraction reorders.
    const actual=clip(a,b),expected=visibleIntervals(a,b,triangles);
    assert.equal(actual.length,expected.length);
    for(let j=0;j<actual.length;j++)for(let k=0;k<2;k++)assert.ok(Math.abs(actual[j][k]-expected[j][k])<1e-12);
  }
});

test('large polygon buffers grow safely and remain reusable',async()=>{
  const kernels=await createArtKernels(binary);
  const poly=Array.from({length:20000},(_,i)=>[Math.cos(i/20000*Math.PI*2),Math.sin(i/20000*Math.PI*2)]);
  assert.equal(JSON.stringify(kernels.polygonIntersections(-2,.1,2,.1,poly)),JSON.stringify(original(-2,.1,2,.1,poly)));
  assert.deepEqual(kernels.polygonIntersections(0,0,1,1,[]),[]);
});

function flowerContext(source) {
  const canvas=()=>{
    const image={width:0,height:0,pixels:new Uint8ClampedArray(512*512*4)};
    const context={canvas:image,fillStyle:'',fillRect(x,y){
      if(x>=image.width||y>=image.height)return;
      const channels=this.fillStyle.slice(5,-1).split(',').map(Number);
      image.pixels.set([channels[0],channels[1],channels[2],255],(y*image.width+x)*4);
    }};
    image.getContext=()=>context;
    return image;
  };
  const sandbox={Math:Object.create(Math),console:{log(){}},btoa:s=>Buffer.from(s).toString('base64'),document:{createElement:canvas},location:{href:'http://localhost/?seed=wasm-parity'}};
  sandbox.window=sandbox;
  const context=vm.createContext(sandbox);
  vm.runInContext(source.replace('  var perlin;','  var perlin; this.perlinValues=function(){this.noise(0);return perlin;};'),context);
  return context;
}
const flowerSource=await readFile(new URL('../public/upstream/nonflowers/main.js',import.meta.url),'utf8');

test('WASM flower filters preserve every channel and alpha byte',async()=>{
  const kernels=await createArtKernels(binary),flowers=flowerContext(flowerSource);
  const table=flowers.Noise.perlinValues();
  for(const wispy of [true,false])for(const resolution of [1,3]) {
    const width=47,height=39,data=Uint8ClampedArray.from({length:width*height*4},()=>random()*255);
    const expected=data.slice(),filter=wispy?flowers.Filter.wispy:flowers.Filter.fade;
    for(let i=0;i<expected.length;i+=4){if(expected[i+3]===0)continue;const x=(i/4)%width/resolution,y=Math.floor(i/4/width)/resolution;expected.set(filter(x,y,...expected.slice(i,i+4)),i);}
    kernels.filterFlower({width,height,data},table,wispy,resolution);
    assert.deepEqual(data,expected);
  }
});

test('WASM paper preserves the original background pixels and subsequent random state',async()=>{
  const kernels=await createArtKernels(binary),flowers=flowerContext(flowerSource);
  const table=flowers.Noise.perlinValues();
  for(const options of [{col:[1,.99,.9],tex:10,spr:0},{col:[.98,.91,.74]},{tex:35,spr:2}]){
    const seed=flowers.Prng.s;
    const expected=flowers.paper(options);
    const actual=kernels.flowerPaper(table,seed,options);
    assert.equal(actual.state,flowers.Prng.s);
    assert.deepEqual(actual.pixels,expected.pixels);
  }
});
