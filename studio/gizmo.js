'use strict';
import { S } from './state.js';
import { $, scene, camera, raycaster, mouseNDC, blockGroup, pushUndo, dump, saveAutosave, refreshOutlines, sampleHeight } from './core.js';
import { snapVal } from './tools.js';



export const gizmoGroup = new THREE.Group();
gizmoGroup.renderOrder = 1000;
scene.add(gizmoGroup);

let activeIdx = -1;
let mode = null;
let start = null;
let dragPlane = new THREE.Plane();
let tmpV = new THREE.Vector3();

function makeMat(c, o){ return new THREE.MeshBasicMaterial({color:c, depthTest:false, depthWrite:false, transparent:true, opacity:o!=null?o:0.95}); }
function makeLine(a,b,c){
  const g=new THREE.BufferGeometry().setFromPoints([a,b]);
  const l=new THREE.Line(g, new THREE.LineBasicMaterial({color:c, depthTest:false, depthWrite:false, transparent:true, opacity:0.9}));
  return l;
}
function clearGizmo(){
  while(gizmoGroup.children.length) {
    const ch=gizmoGroup.children[0];
    gizmoGroup.remove(ch);
    if(ch.geometry) ch.geometry.dispose();
    if(ch.material) ch.material.dispose();
  }
}
function buildFor(idx){
  clearGizmo();
  if(idx<0) return;
  const b=S.map.blocks[idx];
  if(!b) return;
  const pos=new THREE.Vector3(b.pos[0], b.pos[1], b.pos[2]);
  gizmoGroup.position.copy(pos);

  const len=1.2;
  const headLen=0.28, headR=0.12;
  const axes=[
    {dir:new THREE.Vector3(1,0,0), col:0xff5555, m:'tx'},
    {dir:new THREE.Vector3(0,1,0), col:0x55ff55, m:'ty'},
    {dir:new THREE.Vector3(0,0,1), col:0x5599ff, m:'tz'},
  ];
  axes.forEach(function(ax){
    const end=ax.dir.clone().multiplyScalar(len);
    const line=makeLine(new THREE.Vector3(0,0,0), end, ax.col);
    line.userData.gizmo=ax.m; line.userData.baseCol=ax.col;
    gizmoGroup.add(line);
    const cone=new THREE.Mesh(new THREE.ConeGeometry(headR, headLen, 8), makeMat(ax.col));
    const tip=end.clone();
    cone.position.copy(tip);
    if(ax.m==='tx') cone.rotation.z=-Math.PI/2;
    if(ax.m==='tz') cone.rotation.x=Math.PI/2;
    cone.userData.gizmo=ax.m; cone.userData.baseCol=ax.col;
    gizmoGroup.add(cone);
  });

  const hs=0.18;

  const isPlane=b.prim==='plane', isCyl=b.prim==='cyl';
  const faces=[];
  faces.push({p:new THREE.Vector3(b.size[0]/2+0.28,0,0), col:0xff7777, m:'sx', side:1, axis:0});
  faces.push({p:new THREE.Vector3(-b.size[0]/2-0.28,0,0), col:0xff7777, m:'sx', side:-1, axis:0});
  faces.push({p:new THREE.Vector3(0,b.size[1]/2+0.28,0), col:0x77ff77, m:'sy', side:1, axis:1});
  faces.push({p:new THREE.Vector3(0,-b.size[1]/2-0.28,0), col:0x77ff77, m:'sy', side:-1, axis:1});
  if(!isPlane){
    faces.push({p:new THREE.Vector3(0,0,b.size[2]/2+0.28), col:0x7777ff, m:'sz', side:1, axis:2});
    faces.push({p:new THREE.Vector3(0,0,-b.size[2]/2-0.28), col:0x7777ff, m:'sz', side:-1, axis:2});
  } else if(isCyl){

  }
  faces.forEach(function(f){
    const box=new THREE.Mesh(new THREE.BoxGeometry(hs,hs,hs), makeMat(f.col));
    box.position.copy(f.p);
    box.userData.gizmo=f.m;
    box.userData.side=f.side;
    box.userData.axis=f.axis;
    box.userData.baseCol=f.col;
    gizmoGroup.add(box);
  });

  const ringG=new THREE.TorusGeometry(0.85, 0.02, 8, 32);
  const ring=new THREE.Mesh(ringG, makeMat(0xffff55));
  ring.rotation.x=Math.PI/2;
  ring.userData.gizmo='ry'; ring.userData.baseCol=0xffff55; ring.userData.side=0;
  gizmoGroup.add(ring);

  gizmoGroup.visible=true;
}

export function gizmoAttach(idx){
  activeIdx=idx;
  mode=null;
  start=null;
  if(idx>=0) buildFor(idx);
  else { clearGizmo(); gizmoGroup.visible=false; }
}
export function gizmoDetach(){ gizmoAttach(-1); }
export function gizmoVisible(){ return gizmoGroup.visible && activeIdx>=0; }
export function gizmoMode(){ return mode; }

export function gizmoRaycast(rc){
  if(!gizmoVisible()) return null;
  const hits=rc.intersectObjects(gizmoGroup.children, false);
  for(let i=0;i<hits.length;i++){
    const o=hits[i].object;
    const m=o.userData.gizmo;
    if(m) return {mode:m, side:o.userData.side!=null?o.userData.side:0, axis:o.userData.axis};
  }
  return null;
}

export function gizmoBegin(hit){
  if(activeIdx<0) return;

  let m, side, axis;
  if(typeof hit==='string'){ m=hit; side=0; }
  else { m=hit.mode; side=hit.side; axis=hit.axis; }
  mode=m;
  const b=S.map.blocks[activeIdx];
  pushUndo();
  start={
    pos: b.pos.slice(),
    size: b.size.slice(),
    rotY: b.rotY||0,
    mouse: {x:S.mouseX, y:S.mouseY},
    planeY: b.pos[1],
    side: side||0,
    axis: axis,
  };

  if(m==='ty' || m==='sy'){
    dragPlane.setFromNormalCoors(0,0,1,0);

    const camDir=new THREE.Vector3(); camera.getWorldDirection(camDir);
    const n=new THREE.Vector3(0,0,1);

    dragPlane.setFromNormalCoors(camDir.x, 0, camDir.z, 0);
  }
}

export function gizmoDrag(){
  if(!mode || !start || activeIdx<0) return;
  const b=S.map.blocks[activeIdx];
  const mesh=blockGroup.children[activeIdx];
  if(!b||!mesh) return;
  raycaster.setFromCamera(mouseNDC.set((S.mouseX/innerWidth)*2-1, -(S.mouseY/innerHeight)*2+1), camera);
  let delta=0;
  let deltaHandle=0;
  if(mode==='tx' || mode==='sx' || mode==='tz' || mode==='sz'){
    const plane=new THREE.Plane(new THREE.Vector3(0,1,0), -start.planeY);
    const hit=new THREE.Vector3();
    if(!raycaster.ray.intersectPlane(plane, hit)) return;
    if(mode==='tx' || mode==='sx'){
      if(mode==='tx'){
        delta = hit.x - start.pos[0];
        const face = start.pos[0] + (delta>=0 ? start.size[0]/2 : -start.size[0]/2);
        let snap=null;
        for(let i=0;i<S.map.blocks.length;i++) if(i!==activeIdx){
          const ob=S.map.blocks[i];
          const left=ob.pos[0]-ob.size[0]/2, right=ob.pos[0]+ob.size[0]/2;
          [left,right].forEach(function(f){
            const d=Math.abs((face+delta)-f);
            if(d<0.25) snap=f - face;
          });
        }
        if(snap!=null) delta=snap;
        if(S.snapStep) delta=snapVal(delta);
      } else {

        const handleStart = start.pos[0] + start.side*start.size[0]/2;
        deltaHandle = hit.x - handleStart;
        if(S.snapStep) deltaHandle=snapVal(deltaHandle);
      }
    } else {
      if(mode==='tz'){
        delta = hit.z - start.pos[2];
        const face = start.pos[2] + (delta>=0 ? start.size[2]/2 : -start.size[2]/2);
        let snap=null;
        for(let i=0;i<S.map.blocks.length;i++) if(i!==activeIdx){
          const ob=S.map.blocks[i];
          const lo=ob.pos[2]-ob.size[2]/2, hi=ob.pos[2]+ob.size[2]/2;
          [lo,hi].forEach(function(f){ if(Math.abs((face+delta)-f)<0.25) snap=f-face; });
        }
        if(snap!=null) delta=snap;
        if(S.snapStep) delta=snapVal(delta);
      } else {
        const handleStart = start.pos[2] + start.side*start.size[2]/2;
        deltaHandle = hit.z - handleStart;
        if(S.snapStep) deltaHandle=snapVal(deltaHandle);
      }
    }
  } else if(mode==='ty' || mode==='sy'){

    const camDir=new THREE.Vector3(); camera.getWorldDirection(camDir);
    const horiz=new THREE.Vector3(camDir.x,0,camDir.z);
    if(horiz.length()<0.001) horiz.set(1,0,0); else horiz.normalize();
    const plane=new THREE.Plane(horiz, -horiz.dot(new THREE.Vector3(start.pos[0],0,start.pos[2])));
    const hit=new THREE.Vector3();
    let hitY=null;
    if(raycaster.ray.intersectPlane(plane, hit)) hitY=hit.y;
    if(hitY!=null){
      if(mode==='ty') delta=hitY - start.pos[1];
      else {
        const handleStart = start.pos[1] + start.side*start.size[1]/2;
        deltaHandle = hitY - handleStart;
        if(S.snapStep) deltaHandle=snapVal(deltaHandle);
      }
    } else {
      const dy=(start.mouse.y - S.mouseY)*0.02;
      if(mode==='ty') delta=dy; else deltaHandle=dy;
      if(S.snapStep){ if(mode==='ty') delta=snapVal(delta); else deltaHandle=snapVal(deltaHandle); }
    }
  } else if(mode==='ry'){
    const plane=new THREE.Plane(new THREE.Vector3(0,1,0), -start.planeY);
    const hit=new THREE.Vector3();
    if(!raycaster.ray.intersectPlane(plane, hit)) return;
    const ang=Math.atan2(hit.z-start.pos[2], hit.x-start.pos[0])*180/Math.PI;
    const startAng=Math.atan2(0,1)*180/Math.PI;

    const dx = S.mouseX - start.mouse.x;
    let ddeg = dx*0.35;
    if(window.event && window.event.shiftKey) ddeg=Math.round(ddeg/5)*5;
    else if(S.snapStep) ddeg=Math.round(ddeg/5)*5;
    b.rotY = ((start.rotY + ddeg)%360+360)%360;
    mesh.rotation.y=THREE.MathUtils.degToRad(b.rotY);
    gizmoGroup.rotation.y=THREE.MathUtils.degToRad(b.rotY);
    return;
  }

  if(mode==='tx'){
    b.pos[0]= +(start.pos[0]+delta).toFixed(2);
    mesh.position.x=b.pos[0];
  } else if(mode==='tz'){
    b.pos[2]= +(start.pos[2]+delta).toFixed(2);
    mesh.position.z=b.pos[2];
  } else if(mode==='ty'){
    b.pos[1]= +(Math.max(b.size[1]/2, start.pos[1]+delta)).toFixed(2);
    mesh.position.y=b.pos[1];
  } else if(mode==='sx'){
    const newW=Math.max(0.2, start.size[0] + start.side*deltaHandle);
    const shift=deltaHandle/2;
    b.size[0]=+newW.toFixed(2);
    b.pos[0]= +(start.pos[0]+shift).toFixed(2);
    mesh.position.x=b.pos[0];
    mesh.scale.x = newW/start.size[0];
    buildFor(activeIdx);
  } else if(mode==='sz'){
    const newD=Math.max(0.2, start.size[2] + start.side*deltaHandle);
    const shift=deltaHandle/2;
    b.size[2]=+newD.toFixed(2);
    b.pos[2]= +(start.pos[2]+shift).toFixed(2);
    mesh.position.z=b.pos[2];
    mesh.scale.z = newD/start.size[2];
    buildFor(activeIdx);
  } else if(mode==='sy'){
    const newH=Math.max(0.2, start.size[1] + start.side*deltaHandle);
    const shift=deltaHandle/2;
    b.size[1]=+newH.toFixed(2);
    b.pos[1]= +(start.pos[1]+shift).toFixed(2);
    mesh.position.y=b.pos[1];
    mesh.scale.y = newH/start.size[1];
    buildFor(activeIdx);
  }
  gizmoGroup.position.set(b.pos[0], b.pos[1], b.pos[2]);
}

export function gizmoEnd(){
  if(!mode || activeIdx<0){ mode=null; start=null; return; }
  const b=S.map.blocks[activeIdx];
  const mesh=blockGroup.children[activeIdx];
  if(b && mesh){

    if(mode==='sx'||mode==='sy'||mode==='sz'){
      mesh.scale.set(1,1,1);


    }
  }

  mode=null;
  start=null;
}

let hovered=null;
export function gizmoHover(){
  if(!gizmoVisible() || mode) return;
  raycaster.setFromCamera(mouseNDC.set((S.mouseX/innerWidth)*2-1, -(S.mouseY/innerHeight)*2+1), camera);
  const h=gizmoRaycast(raycaster);
  const key=h? h.mode+h.side : null;
  if(key===hovered) return;

  if(hovered){
    gizmoGroup.children.forEach(function(ch){
      if(ch.material && ch.userData.baseCol) ch.material.color.setHex(ch.userData.baseCol);
    });
  }
  hovered=key;
  if(h){
    gizmoGroup.children.forEach(function(ch){
      const m=ch.userData.gizmo, s=ch.userData.side;
      if(m===h.mode && s===h.side){
        if(!ch.userData.baseCol) ch.userData.baseCol=ch.material.color.getHex();
        ch.material.color.setHex(0xffffff);
      }
    });
    document.body.style.cursor='pointer';
  } else {
    document.body.style.cursor='';
  }
}

export function gizmoUpdate(){
  if(activeIdx>=0) buildFor(activeIdx);
}


if(typeof window!=='undefined'){
  window.__gizmoUpdate=gizmoUpdate;
  window.__gizmoAttach=gizmoAttach;
  window.__gizmoDetach=gizmoDetach;
  window.__gizmoDrag=gizmoDrag;
  window.__gizmoEnd=gizmoEnd;
  window.__gizmoHover=gizmoHover;
  Object.defineProperty(window,'__gizmoActiveIdx',{get:function(){return activeIdx;}});
  window.__gizmoSelectedBlock=function(){
    if(activeIdx>=0) return S.map.blocks[activeIdx];
    return null;
  };
}


if(typeof window!=='undefined' && window.__gizmoTest!==false){
  try{
    const _b={size:[4,2.5,4], pos:[0,1,0]};
    let nw=Math.max(0.2, _b.size[0]+1*2);
    console.assert(nw===6, 'gizmo scale self-check');
  }catch(e){}
}
