// Numeric kernels adapted from Nonflowers (Lingdong Huang, MIT).
// f64 throughout; preserve operation order and Uint8ClampedArray rounding.
import { numberAt } from '../shared/wasm/memory';
@inline function byteClamp(value: f64): u8 {
  if (!(value > 0)) return 0;
  if (value >= 255) return 255;
  let lower = Math.floor(value);
  if (value-lower > .5 || (value-lower == .5 && (<i32>lower & 1))) lower += 1;
  return <u8>lower;
}
// Axis records contain integer coordinate and cosine weight for each octave.
// Cosines are precomputed by the host using the original JS Math.cos, so
// browser-specific transcendental rounding never changes the printed pixels.
function noise(table: usize, x: usize, y: usize, z: i32): f64 {
  let result: f64=0, amplitude: f64=.5;
  for(let octave=0;octave<4;octave++) {
    let offset=<i32>load<f64>(x)+(<i32>load<f64>(y)<<4)+(z<<8);
    const rx=load<f64>(x+8), ry=load<f64>(y+8);
    let n1=numberAt(table,offset&4095);
    n1+=rx*(numberAt(table,(offset+1)&4095)-n1);
    let n2=numberAt(table,(offset+16)&4095);
    n2+=rx*(numberAt(table,(offset+17)&4095)-n2);
    n1+=ry*(n2-n1);
    // The original filters use integer z (0 or 2), hence its weight is zero.
    result+=n1*amplitude;
    amplitude*=.5;
    x+=16; y+=16; z<<=1;
  }
  return result;
}
export function flowerFilter(pixels: usize, width: i32, height: i32, table: usize,
  axisX: usize, axisY: usize, axisX2: usize, axisY2: usize, wispy: i32): void {
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const p=pixels+(<usize>(y*width+x)<<2), alpha=load<u8>(p+3);
    if(alpha==0)continue;
    const n=noise(table,axisX+<usize>x*64,axisY+<usize>y*64,0);
    if(wispy) {
      const m=noise(table,axisX2+<usize>x*64,axisY2+<usize>y*64,2);
      store<u8>(p+1,byteClamp(<f64>load<u8>(p+1)*(.95+(1-.95)*m)));
      store<u8>(p+2,byteClamp(<f64>load<u8>(p+2)*(.9+(1-.9)*m)));
      store<u8>(p+3,byteClamp(<f64>alpha*(.5+(1-.5)*n)));
    } else store<u8>(p+3,byteClamp(<f64>alpha*Math.min(Math.max(n,0),1)));
  }
}
let randomState:f64=0;
@inline function random():f64 { randomState=(randomState*randomState)%999962000357.0;return randomState/999962000357.0; }
@inline function paperPixel(pixels:usize,x:i32,y:i32,r:u8,g:u8,b:u8):void {
  if(x>=512 || y>=512)return;
  const p=pixels+(<usize>(y*512+x)<<2);
  store<u8>(p,r);store<u8>(p+1,g);store<u8>(p+2,b);store<u8>(p+3,255);
}
// Same original texture and PRNG order, but write pixels in one batch instead
// of parsing 66,049 CSS colors and issuing 264,196 canvas calls per sheet.
export function flowerPaper(pixels:usize,table:usize,axis:usize,speckleAxis:usize,
  seed:f64,red:f64,green:f64,blue:f64,texture:f64,speckles:f64):f64 {
  randomState=seed;
  for(let x=0;x<=256;x++)for(let y=0;y<=256;y++) {
    let c=255-noise(table,axis+<usize>x*64,axis+<usize>y*64,0)*texture*.5;
    c-=random()*texture;
    let r=c*red,g=c*green,b=c*blue;
    if(noise(table,speckleAxis+<usize>x*64,speckleAxis+<usize>y*64,2)*random()*speckles>.7 || random()<.005*speckles) {
      r=c*.7;g=c*.5;b=c*.2;
    }
    const rr=byteClamp(Math.floor(r)),gg=byteClamp(Math.floor(g)),bb=byteClamp(Math.floor(b));
    paperPixel(pixels,x,y,rr,gg,bb);paperPixel(pixels,512-x,y,rr,gg,bb);
    paperPixel(pixels,x,512-y,rr,gg,bb);paperPixel(pixels,512-x,512-y,rr,gg,bb);
  }
  return randomState;
}
