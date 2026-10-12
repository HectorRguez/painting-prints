// Numeric kernels adapted from Nonflowers/Fishdraw (Lingdong Huang, MIT).
// f64 throughout; preserve operation order and Uint8ClampedArray rounding.
@inline function numberAt(base: usize, index: i32): f64 { return load<f64>(base + (<usize>index << 3)); }
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
// Intersections are emitted in original edge order; host uses stable sorting.
export function polygonIntersections(x0:f64,y0:f64,x1:f64,y1:f64,polygon:usize,count:i32,output:usize,ray:i32):i32 {
  const dx=x1-x0,dy=y1-y0;
  let found=0;
  for(let i=0;i<count;i++) {
    const j=(i+1)%count;
    const qx=numberAt(polygon,i*2),qy=numberAt(polygon,i*2+1);
    const ex=numberAt(polygon,j*2)-qx,ey=numberAt(polygon,j*2+1)-qy;
    const cross=dx*ey-dy*ex;
    if(cross==0)continue;
    const factor=cross/(cross*cross),qx0=qx-x0,qy0=qy-y0;
    const t=(qx0*ey-qy0*ex)*factor,s=(qx0*dy-qy0*dx)*factor;
    if(0<=t && (ray || t<1) && 0<=s && s<1) {
      const p=output+<usize>found*40;
      store<f64>(p,t);store<f64>(p+8,s);
      const side=(x0-x1)*(qy-y1)-(y0-y1)*(qx-x1);
      store<f64>(p+16,side<0?1:-1);
      store<f64>(p+24,x1*t+x0*(1-t));store<f64>(p+32,y1*t+y0*(1-t));
      found++;
    }
  }
  return found;
}

// Projected terrain clipping. Grid iteration and intersection order mirror the
// JS Set traversal; subtraction retains exactly the same visible intervals.
export function visibleIntervals(ax:f64,ay:f64,az:f64,bx:f64,by:f64,bz:f64,
  faces:usize,grid:usize,indices:usize,marks:usize,tag:i32,
  columns:i32,rows:i32,minX:i32,minY:i32,output:usize):i32 {
  store<f64>(output,0);store<f64>(output+8,1);
  let count=1;
  const x0=max(0,<i32>Math.floor(Math.min(ax,bx)/24)-minX);
  const x1=min(columns-1,<i32>Math.floor(Math.max(ax,bx)/24)-minX);
  const y0=max(0,<i32>Math.floor(Math.min(ay,by)/24)-minY);
  const y1=min(rows-1,<i32>Math.floor(Math.max(ay,by)/24)-minY);
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) {
    const bucket=grid+<usize>(y*columns+x)*8;
    const start=load<i32>(bucket),end=load<i32>(bucket+4);
    for(let k=start;k<end;k++) {
      const id=load<i32>(indices+(<usize>k<<2)),mark=marks+(<usize>id<<2);
      if(load<i32>(mark)==tag)continue;
      store<i32>(mark,tag);
      const f=faces+<usize>id*80,den=load<f64>(f+48);
      if(Math.abs(den)<1e-9)continue;
      const dxA=ax-load<f64>(f+32),dyA=ay-load<f64>(f+40);
      const dxB=bx-load<f64>(f+32),dyB=by-load<f64>(f+40);
      const u=(load<f64>(f)*dxA+load<f64>(f+8)*dyA)/den;
      const v=(load<f64>(f+16)*dxA+load<f64>(f+24)*dyA)/den;
      const w=1-u-v;
      const u2=(load<f64>(f)*dxB+load<f64>(f+8)*dyB)/den;
      const v2=(load<f64>(f+16)*dxB+load<f64>(f+24)*dyB)/den;
      const w2=1-u2-v2;
      let lo:f64=0,hi:f64=1;
      for(let edge=0;edge<4;edge++) {
        const a=edge==0?u:edge==1?v:edge==2?w:u*load<f64>(f+56)+v*load<f64>(f+64)+w*load<f64>(f+72)-az-.015;
        const b=edge==0?u2:edge==1?v2:edge==2?w2:u2*load<f64>(f+56)+v2*load<f64>(f+64)+w2*load<f64>(f+72)-bz-.015;
        if(a<0 && b<0){hi=0;break;}
        if(a<0)lo=Math.max(lo,-a/(b-a));
        else if(b<0)hi=Math.min(hi,-a/(b-a));
        if(lo>=hi)break;
      }
      if(lo>=hi)continue;
      for(let j=0;j<count;) {
        const p=output+<usize>j*16,a=load<f64>(p),b=load<f64>(p+8);
        if(hi<=a || lo>=b){j++;continue;}
        if(lo>a && hi<b) {
          memory.copy(p+32,p+16,<usize>(count-j-1)*16);
          store<f64>(p+8,lo);store<f64>(p+16,hi);store<f64>(p+24,b);
          count++;j+=2;
        } else if(lo>a){store<f64>(p+8,lo);j++;}
        else if(hi<b){store<f64>(p,hi);j++;}
        else {memory.copy(p,p+16,<usize>(count-j-1)*16);count--;}
      }
      if(count==0)return 0;
    }
  }
  return count;
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
