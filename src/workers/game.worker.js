'use strict';
// ponytail: pure-math worker — no THREE, no DOM. Handles rain/grassCull/buildGrid/plan. Ceiling: add more types as needed.

function clamp(v, lo, hi){ return v < lo ? lo : v > hi ? hi : v; }

// ---- terrain sample (same as studio worker) ----
function mkSample(terrain){
  if(!terrain || !terrain.heights) return (x,z)=> Math.sin(x*0.15)*Math.cos(z*0.11)*0.35 + Math.sin(x*0.6+z*0.4)*0.12;
  const segs = terrain.segs, size = terrain.size, W = segs+1, H = terrain.heights;
  const step = size/segs, half = size/2;
  return (x,z)=>{
    const fx = clamp((x+half)/step, 0, segs-1e-4), fz = clamp((z+half)/step, 0, segs-1e-4);
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx-ix, tz = fz-iz;
    const h00 = H[iz*W+ix], h10 = H[iz*W+ix+1], h01 = H[(iz+1)*W+ix], h11 = H[(iz+1)*W+ix+1];
    return (h00*(1-tx)+h10*tx)*(1-tz) + (h01*(1-tx)+h11*tx)*tz;
  };
}

// ---- rain ----
function doRain(p){
  // p: {pos:Float32Array(n*6), vel, len, dx, dz, cx,cz,cy, dt, t, R, TOP, terrain?}
  const n = p.n, dt = p.dt, t = p.t, cx=p.cx, cz=p.cz, cy=p.cy;
  const R = p.R||65, TOP = p.TOP||30;
  const windX = Math.sin(t)*0.85 + Math.sin(t*1.7)*0.22, windZ = Math.cos(t*0.9)*0.6 + Math.cos(t*1.3)*0.18;
  const pos = p.pos, vel=p.vel, len=p.len, rdx=p.dx, rdz=p.dz;
  const sample = mkSample(p.terrain);
  for(let i=0;i<n;i++){
    const j=i*6;
    let x=pos[j], y=pos[j+1], z=pos[j+2];
    const v=vel[i], L=len[i], dx=rdx[i], dz=rdz[i];
    y -= v*dt; x += (windX+dx)*dt; z += (windZ+dz)*dt;
    const gh = sample(x,z);
    const far = (x-cx)*(x-cx)+(z-cz)*(z-cz) > R*R;
    const below = y < gh + 0.15;
    if(below || far || y < cy-6){
      const ang=Math.random()*Math.PI*2, r=Math.sqrt(Math.random())*R;
      x = cx + Math.cos(ang)*r; z = cz + Math.sin(ang)*r;
      y = Math.max(cy+TOP, gh+TOP*0.6) + Math.random()*6;
    }
    pos[j]=x; pos[j+1]=y; pos[j+2]=z;
    pos[j+3]=x - (windX+dx)*0.09 - 0.16; pos[j+4]=y - L; pos[j+5]=z - (windZ+dz)*0.09 - 0.11;
  }
  return pos;
}

// ---- grass cull ----
function doGrassCull(p){
  // p: {chunks:[{x,z}], cx,cz, fogR2}
  const fogR2 = p.fogR2, grassLim = Math.min(19600, fogR2);
  const out = new Uint8Array(p.chunks.length);
  for(let i=0;i<p.chunks.length;i++){
    const c=p.chunks[i]; const d2=(c.x-p.cx)*(c.x-p.cx)+(c.z-p.cz)*(c.z-p.cz);
    out[i]= d2 < grassLim ? 1 : 0;
  }
  return out;
}

// ---- buildUgvGrid ----
function doBuildGrid(p){
  // p: {colliders:[{type,...}], sectors:[[x,z]...], N, CELL, terrain}
  const N=p.N||100, CELL=p.CELL||2;
  const colliders=p.colliders||[], sectors=p.sectors||[];
  const sample = mkSample(p.terrain);
  // ponytail: simplified queryNear — brute check per cell (N=100 -> 10k * colliders). Colliders small, fine on worker.
  function pointInPoly(x,z,poly){
    let inside=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const xi=poly[i][0],zi=poly[i][1],xj=poly[j][0],zj=poly[j][1]; if((zi>z)!==(zj>z) && x < (xj-xi)*(z-zi)/(zj-zi)+xi) inside=!inside; } return inside;
  }
  function segClosest(px,pz,x1,z1,x2,z2){ const dx=x2-x1,dz=z2-z1,L2=dx*dx+dz*dz; const t=L2?Math.max(0,Math.min(1,((px-x1)*dx+(pz-z1)*dz)/L2)):0; return [x1+dx*t,z1+dz*t]; }
  const UGV_RAD=1.35;
  const blocked = new Uint8Array(N*N);
  for(let r=0;r<N;r++) for(let c=0;c<N;c++){
    const x=-100+c*CELL+1, z=-100+r*CELL+1;
    const cy=sample(x,z); let b=0;
    for(let k=0;k<colliders.length;k++){
      const o=colliders[k];
      if(o.type!=='seg' && (o.y1 <= cy+0.4 || o.y0 >= cy+2)) continue;
      if(o.type==='box'){ if(x>o.minX-UGV_RAD && x<o.maxX+UGV_RAD && z>o.minZ-UGV_RAD && z<o.maxZ+UGV_RAD) b=1; }
      else if(o.type==='cyl'){ const dx=x-o.x,dz=z-o.z,rr=o.r+UGV_RAD; if(dx*dx+dz*dz<rr*rr) b=1; }
      else { const q=segClosest(x,z,o.x1,o.z1,o.x2,o.z2),rr=o.r+UGV_RAD; if((x-q[0])*(x-q[0])+(z-q[1])*(z-q[1])<rr*rr) b=1; }
      if(b) break;
    }
    blocked[r*N+c]=b;
  }
  const masks = [];
  sectors.forEach(poly=>{
    const m=new Uint8Array(N*N);
    for(let r=0;r<N;r++) for(let c=0;c<N;c++){ const x=-100+c*CELL+1,z=-100+r*CELL+1; m[r*N+c]=pointInPoly(x,z,poly)?0:1; }
    masks.push(m);
  });
  return {blocked, masks};
}

// ---- A* plan ----
function doPlan(p){
  const N=p.N||100, blocked=p.blocked, start=p.start, goal=p.goal;
  const heights=p.heights; // terrain heights for uphill penalty (optional Float32Array)
  const terrain=p.terrain;
  const sample = mkSample(terrain);
  const CELL=p.CELL||2;
  const UPHILL=8;
  if(start<0||goal<0||blocked[goal]) return null;
  if(start===goal) return [[p.tx, p.tz]];
  const gS=new Float32Array(N*N).fill(Infinity), from=new Int32Array(N*N).fill(-1), closed=new Uint8Array(N*N);
  const gr=(goal/N)|0, gc=goal%N;
  const H=i=>Math.hypot(((i/N)|0)-gr, (i%N)-gc);
  const heap=[];
  function push(n){ const k=gS[n]+H(n); heap.push([k,n]); for(let i=heap.length-1;i>0;){ const pp=(i-1)>>1; if(heap[pp][0]<=k) break; heap[i]=heap[pp]; heap[pp]=[k,n]; i=pp; } }
  function pop(){ const top=heap[0], last=heap.pop(); if(heap.length){ heap[0]=last; for(let i=0;;){ const l=i*2+1,r=l+1; let s=i; if(l<heap.length&&heap[l][0]<heap[s][0]) s=l; if(r<heap.length&&heap[r][0]<heap[s][0]) s=r; if(s===i) break; const t=heap[s]; heap[s]=heap[i]; heap[i]=t; i=s; } } return top[1]; }
  gS[start]=0; push(start);
  let found=false, iter=0;
  while(heap.length && iter++<6000){
    const cur=pop(); if(closed[cur]) continue; if(cur===goal){ found=true; break; }
    closed[cur]=1; const cr=(cur/N)|0, cc=cur%N;
    for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++){
      if(!dr&&!dc) continue;
      const nr=cr+dr, nc=cc+dc; if(nr<0||nc<0||nr>=N||nc>=N) continue;
      const ni=nr*N+nc; if(blocked[ni]||closed[ni]) continue;
      if(dr&&dc && (blocked[cr*N+nc+dc] || blocked[(cr+dr)*N+cc])) continue;
      const ng=gS[cur]+((dr&&dc)?1.414:1) + Math.max(0, sample(-100+nc*CELL+1,-100+nr*CELL+1)-sample(-100+cc*CELL+1,-100+cr*CELL+1))*UPHILL;
      if(ng<gS[ni]){ gS[ni]=ng; from[ni]=cur; push(ni); }
    }
  }
  if(!found) return null;
  const cells=[]; for(let i=goal;i>=0;i=from[i]) cells.push(i); cells.reverse();
  const pts=[[p.sx,p.sz]];
  for(let i=1;i<cells.length;i++) pts.push([-100+(cells[i]%N)*CELL+1,-100+((cells[i]/N)|0)*CELL+1]);
  pts.push([p.tx,p.tz]);
  function los(ax,az,bx,bz){
    const d=Math.hypot(bx-ax,bz-az), steps=Math.ceil(d/0.8);
    for(let i=1;i<steps;i++){
      const x=ax+(bx-ax)*i/steps, z=az+(bz-az)*i/steps;
      const cc=Math.floor((x+100)/CELL), rr=Math.floor((z+100)/CELL);
      if(cc<0||rr<0||cc>=N||rr>=N) continue;
      if(blocked[rr*N+cc]) return false;
    } return true;
  }
  const out=[]; let a=0;
  while(a<pts.length-1){ let b=pts.length-1; while(b>a+1 && !los(pts[a][0],pts[a][1],pts[b][0],pts[b][1])) b--; out.push(pts[b]); a=b; }
  return out;
}

self.onmessage = function(e){
  const {id,type,payload}=e.data;
  try{
    if(type==='rain'){
      const out = doRain(payload);
      self.postMessage({id, result: out}, [out.buffer]);
      // need to return new buffer for next call — main will re-send
      return;
    }
    if(type==='grassCull'){
      const out = doGrassCull(payload);
      self.postMessage({id, result: out}, [out.buffer]);
      return;
    }
    if(type==='buildGrid'){
      const r = doBuildGrid(payload);
      // transfer blocked + masks
      const tfs=[r.blocked.buffer]; r.masks.forEach(m=>tfs.push(m.buffer));
      self.postMessage({id, blocked:r.blocked, masks:r.masks}, tfs);
      return;
    }
    if(type==='plan'){
      const out = doPlan(payload);
      self.postMessage({id, result: out});
      return;
    }
    self.postMessage({id, error:'unknown type '+type});
  }catch(err){ self.postMessage({id, error: String(err && err.stack || err)}); }
};
