// Terrain clipping for the vector Mapgen4 renderer.
// Use f64 and preserve the JavaScript reference operation order.
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
