// Numeric kernels adapted from Fishdraw (Lingdong Huang, MIT).
// f64 throughout; preserve operation order.
import { numberAt } from '../shared/wasm/memory';
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
