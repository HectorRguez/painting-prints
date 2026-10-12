// Vector adaptation of Mapgen4's hybrid oblique projection.
// Projection reference: Red Blob Games, render.ts (Apache-2.0), pinned in THIRD_PARTY.md.
// Occlusion is computed on the projected triangles; the SVG contains only visible paths.
// Upstream defaults: tilt=0, mountain_height=50. Its oblique matrix keeps
// coasts top-down while shifting elevated land up the page.
const height = 50;
export function project([x, y, elevation]) {
  const z = Math.max(0, elevation) * height;
  return [x, y - z, z];
}
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const normalize = a => { const n = Math.hypot(...a); return a.map(v => v / (n || 1)); };
function normal(points) {
  const p = points.map(([x,y,e]) => [x,y,e*height]);
  let n = normalize(cross(sub(p[1],p[0]),sub(p[2],p[0])));
  if (n[2] < 0) n = n.map(v => -v);
  return n;
}
function landPolygon(points) {
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const a=points[i], b=points[(i+1)%points.length];
    if (a[2] >= 0) result.push(a);
    if ((a[2] < 0) !== (b[2] < 0)) result.push(mix(a,b,-a[2]/(b[2]-a[2])));
  }
  return result;
}
// Each face clips many nearby segments. Keep its constant coefficients instead
// of recalculating them and allocating depth/constraint arrays for every test.
const triangleMetrics = new WeakMap();
function metrics(triangle) {
  let result = triangleMetrics.get(triangle);
  if (result) return result;
  const [a,b,c] = triangle;
  const by = b[1]-c[1], bx = c[0]-b[0], cy = c[1]-a[1], cx = a[0]-c[0];
  result = { by, bx, cy, cx, x: c[0], y: c[1], denominator: by*(a[0]-c[0])+bx*(a[1]-c[1]) };
  triangleMetrics.set(triangle, result);
  return result;
}
function barycentric(p, triangle) {
  const { by, bx, cy, cx, x, y, denominator } = metrics(triangle);
  if (Math.abs(denominator) < 1e-9) return null;
  const u=(by*(p[0]-x)+bx*(p[1]-y))/denominator;
  const v=(cy*(p[0]-x)+cx*(p[1]-y))/denominator;
  return [u,v,1-u-v];
}
// Portion of a line hidden by one triangle, including intersections in depth.
export function hiddenInterval(a, b, triangle) {
  const u=barycentric(a,triangle), v=barycentric(b,triangle);
  if (!u || !v) return null;
  let lo=0, hi=1;
  const depth = weights => weights[0]*triangle[0][2]+weights[1]*triangle[1][2]+weights[2]*triangle[2][2];
  for (let i=0;i<4;i++) {
    const start=i<3?u[i]:depth(u)-a[2]-.015;
    const end=i<3?v[i]:depth(v)-b[2]-.015;
    if (start<0 && end<0) return null;
    if (start<0) lo=Math.max(lo,-start/(end-start));
    else if (end<0) hi=Math.min(hi,start/(start-end));
    if (lo>=hi) return null;
  }
  return [lo,hi];
}
export function visibleIntervals(a,b,triangles) {
  let intervals=[[0,1]];
  for (const triangle of triangles) {
    const hidden=hiddenInterval(a,b,triangle);
    if (!hidden) continue;
    const [lo,hi]=hidden;
    intervals=intervals.flatMap(([start,end]) => {
      if (hi<=start || lo>=end) return [[start,end]];
      const parts=[];
      if(lo>start)parts.push([start,lo]);
      if(hi<end)parts.push([hi,end]);
      return parts;
    });
    if(!intervals.length)break;
  }
  return intervals;
}

// Clip a river chord to a terrain face and interpolate its real elevation.
// Splitting at folds prevents rivers from disappearing under their own hills.
export function drapeSegment(a, b, triangle) {
  const u=barycentric(a,triangle), v=barycentric(b,triangle);
  if (!u || !v) return null;
  let lo=0,hi=1;
  for(let i=0;i<3;i++) {
    if(u[i]<0 && v[i]<0)return null;
    if(u[i]<0)lo=Math.max(lo,-u[i]/(v[i]-u[i]));
    else if(v[i]<0)hi=Math.min(hi,-u[i]/(v[i]-u[i]));
    if(lo>=hi)return null;
  }
  const point=t=>{
    const p=mix(a,b,t), weights=mix(u,v,t);
    p[2]=dot(weights,triangle.map(p=>p[2]));
    return p;
  };
  return [point(lo),point(hi)];
}

export function terrainSvg(vertices, indices, rivers) {
  const faces=[], ground=[], edges=new Map(), segments=[];
  for(let i=0;i<indices.length;i+=3) {
    const ids=Array.from(indices.slice(i,i+3));
    const points=ids.map(id=>vertices[id]);
    // Discard the external apron and submerged terrain.
    if(points.some(p=>p[0]<0 || p[0]>1000 || p[1]<0 || p[1]>1000) || points.every(p=>p[2]<=0))continue;
    const polygon=landPolygon(points);
    ground.push(points);
    const n=normal(points);
    const facing=n[1]+n[2]>0;
    const face={points,normal:n,facing};
    for(let j=1;j+1<polygon.length;j++)faces.push([polygon[0],polygon[j],polygon[j+1]].map(project));
    for(let j=0;j<3;j++) {
      const a=ids[j],b=ids[(j+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;
      if(!edges.has(key))edges.set(key,{a:vertices[a],b:vertices[b],faces:[]});
      edges.get(key).faces.push(face);
    }
    // Sea-level intersections follow the actual folded terrain surface.
    const shore=[];
    for(let j=0;j<3;j++) {
      const a=points[j], b=points[(j+1)%3];
      if((a[2]<0)!==(b[2]<0))shore.push(mix(a,b,-a[2]/(b[2]-a[2])));
    }
    if(shore.length===2)segments.push({a:shore[0],b:shore[1],kind:'coast'});
    // Sparse, slope-dependent hatching replaces the original color/lighting shader.
    // Upstream lighting uses elevation gradients, light_angle=80, overhead=30,
    // slope=2, flat=2.5, ambient=.25. Translate its shadow into fine hatching.
    const slope=normalize([-10*n[1]/n[2],-10*n[0]/n[2],30]);
    const angle=80*Math.PI/180;
    const light=.25+Math.max(0,dot(slope,normalize([Math.cos(angle),Math.sin(angle),2+.5*slope[2]])));
    if(facing && light<1.16 && Math.max(...points.map(p=>p[2]))>.07) {
      const values=points.map(p=>p[0]+p[1]*.65);
      const spacing=light<.85?1.5:light<1.05?3:6;
      for(let level=Math.ceil(Math.min(...values)/spacing)*spacing;level<Math.max(...values);level+=spacing) {
        const hits=[];
        for(let j=0;j<3;j++) {
          const k=(j+1)%3;
          if((values[j]<level)!==(values[k]<level))hits.push(mix(points[j],points[k],(level-values[j])/(values[k]-values[j])));
        }
        if(hits.length===2 && hits.every(p=>p[2]>0))segments.push({a:hits[0],b:hits[1],kind:'hatch'});
      }
    }
  }
  for(const {a,b,faces:adjacent} of edges.values()) {
    if(Math.min(a[2],b[2])<=.015)continue;
    const silhouette=adjacent.length===2 && adjacent[0].facing!==adjacent[1].facing;
    const crease=adjacent.length===2 && adjacent.some(f=>f.facing)
      && dot(adjacent[0].normal,adjacent[1].normal)<.45;
    if(silhouette || crease)segments.push({a,b,kind:silhouette?'ridge':'crease'});
  }
  // A spatial index keeps exact hidden-line clipping local to each segment.
  const cell=24,grid=new Map();
  const keys=(a,b)=>{
    const result=[];
    for(let y=Math.floor(Math.min(a[1],b[1])/cell);y<=Math.floor(Math.max(a[1],b[1])/cell);y++)
      for(let x=Math.floor(Math.min(a[0],b[0])/cell);x<=Math.floor(Math.max(a[0],b[0])/cell);x++)result.push(`${x}:${y}`);
    return result;
  };
  const groundGrid=new Map();
  for(const face of ground) {
    const min=[Math.min(...face.map(p=>p[0])),Math.min(...face.map(p=>p[1]))];
    const max=[Math.max(...face.map(p=>p[0])),Math.max(...face.map(p=>p[1]))];
    for(const key of keys(min,max)) {if(!groundGrid.has(key))groundGrid.set(key,[]);groundGrid.get(key).push(face);}
  }
  for(const river of rivers) {
    const candidates=new Set(keys(river.a,river.b).flatMap(key=>groundGrid.get(key)||[]));
    for(const face of candidates) {
      const draped=drapeSegment(river.a,river.b,face);
      if(!draped)continue;
      let [a,b]=draped;
      if(a[2]<0 && b[2]<0)continue;
      if(a[2]<0)a=mix(a,b,-a[2]/(b[2]-a[2]));
      if(b[2]<0)b=mix(a,b,-a[2]/(b[2]-a[2]));
      // Quarter-unit buckets keep SVG path count bounded while preserving
      // the visible difference between headwaters and broad river mouths.
      const width=Math.max(.25,Math.round(river.width*4)/4);
      segments.push({a,b,kind:`river-${width}`,width});
    }
  }
  for(const face of faces) {
    const min=[Math.min(...face.map(p=>p[0])),Math.min(...face.map(p=>p[1]))];
    const max=[Math.max(...face.map(p=>p[0])),Math.max(...face.map(p=>p[1]))];
    for(const key of keys(min,max)) {if(!grid.has(key))grid.set(key,[]);grid.get(key).push(face);}
  }
  const paths={hatch:'',crease:'',river:'',coast:'',ridge:''};
  const bounds=[Infinity,Infinity,-Infinity,-Infinity];
  const point=p=>`${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  for(const segment of segments) {
    const a=project(segment.a),b=project(segment.b);
    const candidates=new Set(keys(a,b).flatMap(key=>grid.get(key)||[]));
    for(const [lo,hi] of visibleIntervals(a,b,candidates)) {
      const start=mix(a,b,lo),end=mix(a,b,hi);
      if(Math.hypot(end[0]-start[0],end[1]-start[1])<.12)continue;
      paths[segment.kind]=(paths[segment.kind]||'')+`M${point(start)}L${point(end)}`;
      for(const p of [start,end]) {bounds[0]=Math.min(bounds[0],p[0]);bounds[1]=Math.min(bounds[1],p[1]);bounds[2]=Math.max(bounds[2],p[0]);bounds[3]=Math.max(bounds[3],p[1]);}
    }
  }
  if (!Number.isFinite(bounds[0])) throw new Error('Map has no visible land');
  const size=Math.max(bounds[2]-bounds[0],bounds[3]-bounds[1])+60;
  const x=(bounds[0]+bounds[2]-size)/2,y=(bounds[1]+bounds[3]-size)/2;
  const styles={hatch:[.45,.65],crease:[.5,.45],river:[1,1],coast:[.85,.85],ridge:[.95,.95]};
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000"><g transform="scale(${1000/size}) translate(${-x},${-y})" fill="none" stroke="#292722" stroke-linecap="round" stroke-linejoin="round">${Object.entries(paths).filter(([,d])=>d).map(([kind,d])=>{
    const river=kind.startsWith('river-');
    const [width,opacity]=river?[Number(kind.slice(6)),.85]:styles[kind];
    return `<path data-feature="${river?'river':kind}" stroke-width="${width}" opacity="${opacity}" d="${d}"/>`;
  }).join('')}</g></svg>`;
}
