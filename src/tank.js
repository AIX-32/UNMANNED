import { scene, camera } from './core.js';
import { S } from './state.js';
import { groundHeight, resolveCollisions, MAP_SPAWNS } from './world.js';
import { showSubtitle, syncHudPositions } from './ui.js';
import { damagePlayer, heardShot, damageUgv, ugvList, inUgv } from './ugv.js';
import { damageTurret, turretList, inTurret } from './turret.js';
import { damageBoss, bossList, inBoss } from './boss.js';
import { damageDrone, droneState, inDrone } from './drone.js';
import { explodeAt } from './grenades.js';
import { damageRemote, remoteGroup } from './pvp.js';
import { actx } from './audio.js';

// ponytail: tank driveable - heavy physics + turret on rotatespot pivot

const TANK_MASS = 8000;
const TANK_MAX_FWD = 9;
const TANK_MAX_REV = -4.5;
const TANK_ACCEL = 14;
const TANK_BRAKE = 36;
const TANK_FRICTION = 3.2;
const TANK_TURN_STATIONARY = 0.58;
const TANK_TURN_MOVING = 0.46;
const TANK_TURRET_SPEED = 1.9;
const TURRET_REL_LIMIT = 2.0; // ~115deg each side, can't look fully forward away from back arc limited
const TURRET_PITCH_UP = 0.28; // ~16deg up
const TURRET_PITCH_DOWN = -0.32; // ~18deg down
const TANK_YAW_ACCEL = 1.9;
const TANK_YAW_DAMP = 0.42;
const _tankEuler = new THREE.Euler(0,0,0,'YXZ');
let tankEngineBuf = null;
try{ fetch('assets/audio/buggy_engine.mp3').then(function(r){return r.arrayBuffer();}).then(function(b){ return actx.decodeAudioData(b);}).then(function(b){ tankEngineBuf=b; }); }catch(e){}
// circular crosshair pointer - where turret aims // ponytail: one canvas sprite reused
let aimSprite = null;
function ensureAim(){
  if(aimSprite) return;
  const cv=document.createElement('canvas'); cv.width=cv.height=256;
  const g=cv.getContext('2d');
  g.clearRect(0,0,256,256);
  g.strokeStyle='#eaffff'; g.lineWidth=3;
  // outer circle
  g.beginPath(); g.arc(128,128,88,0,Math.PI*2); g.stroke();
  g.lineWidth=2; g.beginPath(); g.arc(128,128,62,0,Math.PI*2); g.stroke();
  g.lineWidth=1.2; g.beginPath(); g.arc(128,128,38,0,Math.PI*2); g.stroke();
  // cross
  g.lineWidth=3; g.beginPath(); g.moveTo(128,18); g.lineTo(128,56); g.moveTo(128,200); g.lineTo(128,238); g.moveTo(18,128); g.lineTo(56,128); g.moveTo(200,128); g.lineTo(238,128); g.stroke();
  g.lineWidth=2; g.beginPath(); g.moveTo(128,78); g.lineTo(128,102); g.moveTo(128,154); g.lineTo(128,178); g.moveTo(78,128); g.lineTo(102,128); g.moveTo(154,128); g.lineTo(178,128); g.stroke();
  // diagonal ticks like detailed reticle
  g.lineWidth=2; g.beginPath();
  for(let a=0;a<4;a++){ const ang=(a*90+45)*Math.PI/180; const r1=70, r2=88; g.moveTo(128+Math.cos(ang)*r1,128+Math.sin(ang)*r1); g.lineTo(128+Math.cos(ang)*r2,128+Math.sin(ang)*r2); }
  g.stroke();
  // center dot + ring
  g.fillStyle='#eaffff'; g.beginPath(); g.arc(128,128,5,0,Math.PI*2); g.fill();
  g.strokeStyle='#111'; g.lineWidth=1.5; g.beginPath(); g.arc(128,128,5,0,Math.PI*2); g.stroke();
  g.lineWidth=1; g.strokeStyle='rgba(200,255,255,0.9)'; g.beginPath(); g.arc(128,128,10,0,Math.PI*2); g.stroke();
  const tex=new THREE.CanvasTexture(cv); tex.minFilter=THREE.LinearFilter;
  const mat=new THREE.SpriteMaterial({map:tex, transparent:true, depthTest:false, depthWrite:false, fog:false});
  aimSprite=new THREE.Sprite(mat);
  aimSprite.scale.set(1.4,1.4,1);
  aimSprite.renderOrder=999; aimSprite.visible=false;
  aimSprite.userData.aim=true;
  scene.add(aimSprite);
}
export function hideAim(){ if(aimSprite) aimSprite.visible=false; }
try{ window.__gaultHideTankAim = hideAim; }catch(e){}
// polish helpers
const _dustPool=[]; let _lastDust=0;
function spawnDust(c){
  const now=performance.now(); if(now-_lastDust<90) return; _lastDust=now;
  const m=new THREE.Mesh(new THREE.SphereGeometry(0.22,6,6), new THREE.MeshBasicMaterial({color:0x8a7a6a, transparent:true, opacity:0.32, depthWrite:false, fog:true}));
  const off=(Math.random()-0.5)*1.6; const fx=-Math.sin(c.yaw), fz=-Math.cos(c.yaw);
  m.position.set(c.x - fx*1.4 + off*0.6, groundHeight(c.x,c.z)+0.12+Math.random()*0.25, c.z - fz*1.4 + (Math.random()-0.5)*0.9);
  m.userData.vy=0.6+Math.random()*0.9; m.userData.life=0; m.userData.op=0.32;
  scene.add(m); _dustPool.push(m);
}
function tickDust(dt){
  for(let i=_dustPool.length-1;i>=0;i--){ const m=_dustPool[i]; m.userData.life+=dt; m.position.y+=m.userData.vy*dt; m.position.y+=Math.sin(m.userData.life*5)*0.02; m.material.opacity=m.userData.op*(1-m.userData.life/0.85); m.scale.multiplyScalar(1+dt*0.9); if(m.userData.life>0.85){ scene.remove(m); m.geometry.dispose(); m.material.dispose(); _dustPool.splice(i,1); } }
}
let _flashTex=null; function getFlashTex(){ if(_flashTex) return _flashTex; _flashTex=new THREE.TextureLoader().load('assets/textures/flash.png'); return _flashTex; }
function updateAim(c){
  if(!isTankDriving()){ hideAim(); return; }
  ensureAim(); if(!c || !c.turretMesh) { hideAim(); return; }
  let muzzle=new THREE.Vector3(), dir=new THREE.Vector3();
  const localTip=new THREE.Vector3(0,0.18,-1.75);
  muzzle.copy(localTip).applyMatrix4(c.turretMesh.matrixWorld);
  _tankEuler.set(c.turretPitch||0, c.turretYaw, 0, 'YXZ'); dir.set(0,0,-1).applyEuler(_tankEuler).normalize();
  const rc=new THREE.Raycaster(muzzle, dir, 0, 180); rc.camera=camera;
  const hits=rc.intersectObjects(scene.children,true).filter(function(h){ return !h.object.userData.tank && !h.object.userData.rain && !h.object.userData.ground && !h.object.userData.aim; });
  let hit=null, hitPos=null;
  for(let i=0;i<hits.length;i++){ let p=hits[i].object, self=false; while(p){ if(p===c.mesh){ self=true; break; } p=p.parent; } if(!self){ hit=hits[i]; break; } }
  if(hit) hitPos=hit.point.clone();
  else {
    let t=0; for(let i=0;i<90;i++){ const tt=t+2; const atx=muzzle.x+dir.x*tt, atz=muzzle.z+dir.z*tt, aty=muzzle.y+dir.y*tt; const gh=groundHeight(atx,atz); if(aty<=gh){ hitPos=new THREE.Vector3(atx, gh+0.25, atz); break; } t=tt; if(t>180) break; }
    if(!hitPos) hitPos=muzzle.clone().addScaledVector(dir, 60);
  }
  aimSprite.position.copy(hitPos);
  // offset slightly toward camera to avoid z-fighting
  const camDir=new THREE.Vector3().subVectors(camera.position, hitPos).normalize().multiplyScalar(0.12);
  aimSprite.position.add(camDir);
  // scale with distance so screen size stays ~constant
  const d=camera.position.distanceTo(hitPos);
  const s=THREE.MathUtils.clamp(d*0.028, 0.85, 3.2);
  aimSprite.scale.set(s,s,1);
  aimSprite.visible=true;
}

let tankProto = null, tankBox = null;
const tanks = [];
let drivingIdx = -1;

const loader = new THREE.GLTFLoader();
loader.load('assets/models/tankv2.gltf', function(gltf){
  tankProto = gltf.scene;
  tankProto.traverse(function(o){
    if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; if(o.material && o.material.map){ o.material.map.encoding = THREE.LinearEncoding; o.material.needsUpdate = true; } }
  });
  tankProto.updateMatrixWorld(true);
  tankBox = new THREE.Box3().setFromObject(tankProto);
  spawnTanks();
});
window.__gaultTankProto = tankProto;

function newTank(x,z,yaw){
  tanks.push({
    x, z, yaw,
    pitch:0, roll:0,
    speed:0, prevSpeed:0,
    turretYaw: yaw,
    turretRel:0,
    turretPitch:0,
    pitchLean:0, pitchLeanVel:0,
    yawVel:0,
    mesh: null, baseY:0,
    turret: null, turretMesh: null,
    py:0, vy:0,
    cooldown:0,
    lastShake:0,
    audio:null, gain:null,
    hp:400, maxHp:400, dead:false
  });
}
export function damageTank(dmg, srcPos){
  if(drivingIdx<0 || dmg<=0) return;
  const c=tanks[drivingIdx];
  if(!c || c.dead) return;
  c.hp -= dmg;
  S.hpFlash = 1;
  S.shakeX += (Math.random()-0.5)*0.05;
  S.shakeY += (Math.random()-0.5)*0.05;
  S.fovPunch = Math.min(S.fovPunch+5, 12);
  S.caKick = Math.min(S.caKick+4, 7);
  showSubtitle('TANK '+Math.max(0,c.hp)+'/'+c.maxHp);
  if(c.hp<=0){
    c.hp=0; c.dead=true;
    const pos=new THREE.Vector3(c.x, c.py+1.1, c.z);
    try{ explodeAt(pos, 0); }catch(e){}
    showSubtitle('TANK DESTROYED');
    // eject
    try{ killTankAudio(c); }catch(e){}
    if(c.mesh){ try{ scene.remove(c.mesh); }catch(e){} }
    // force exit
    drivingIdx=-1;
    S.carDriving=false;
    if(typeof S.tankDriving!=='undefined') S.tankDriving=false;
    hideAim();
    const off=3.5;
    const sx=c.x + Math.cos(c.yaw)*off, sz=c.z - Math.sin(c.yaw)*off;
    const gy=groundHeight(sx,sz)+1.7;
    camera.position.set(sx,gy,sz);
    // small player damage on ejection? none per spec
  }
}
try{ window.__gaultDamageTank = damageTank; }catch(e){}

let mapReady=false;
export function setTankMapReady(){ mapReady=true; spawnTanks(); }
function ensureTankAudio(c){
  if(!tankEngineBuf || !actx) return;
  if(c.audio) return;
  try{ const src=actx.createBufferSource(); src.buffer=tankEngineBuf; src.loop=true; const g=actx.createGain(); g.gain.value=0; src.connect(g).connect(actx.destination); src.start(); c.audio=src; c.gain=g; }catch(e){}
}
function killTankAudio(c){ if(!c.audio) return; try{ c.audio.stop(); }catch(e){} try{ c.gain.disconnect(); }catch(e){} c.audio=null; c.gain=null; }
export function spawnTanks(){
  if(!mapReady) return;
  tanks.forEach(function(c){ if(c.mesh) scene.remove(c.mesh); if(c.audio) killTankAudio(c); });
  tanks.length=0; drivingIdx=-1; hidePrompt();
  (MAP_SPAWNS.tanks || []).forEach(function(s){ newTank(s.x, s.z, THREE.MathUtils.degToRad(s.rotY||0)); });
  if(!tankProto) return;
  bake();
}
function bake(){
  if(!tankProto) return;
  tanks.forEach(function(c){
    if(c.mesh) return;
    const m = tankProto.clone(true);
    // fix rotatespot pivot: rotate around rotatespot locator, not turret middle
    const turret = m.getObjectByName('turret');
    let rotateSpotParent = null;
    // find rotatespot parent with children (the offset locator)
    m.traverse(function(o){
      if(o.name==='rotatespot' && o.children && o.children.length) rotateSpotParent = o;
    });
    if(!rotateSpotParent){
      // fallback first rotatespot
      rotateSpotParent = m.getObjectByName('rotatespot');
    }
    let turretMesh = null;
    if(turret){
      // collect mesh inside turret (mesh with geometry)
      turret.traverse(function(o){ if(o.isMesh && !turretMesh) turretMesh = o; });
      if(rotateSpotParent){
        const offset = rotateSpotParent.position.clone();
        // move turret origin to rotatespot point
        turret.position.add(offset);
        if(turretMesh) turretMesh.position.sub(offset);
        // hide locators
        rotateSpotParent.visible = false;
        rotateSpotParent.children.forEach(function(ch){ ch.visible=false; });
        // also hide tiny leaf if present
        m.traverse(function(o){ if(o.name==='rotatespot' && o!==rotateSpotParent) o.visible=false; });
      }
      c.turret = turret;
      c.turretMesh = turretMesh;
      // init turret yaw to hull yaw
      turret.rotation.y = 0;
    }
    m.scale.setScalar(1.5);
    m.rotation.y = c.yaw;
    m.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(m);
    c.baseY = -bb.min.y + 0.05;
    c.mesh = m;
    c.py = groundHeight(c.x, c.z) + c.baseY;
    m.position.set(c.x, c.py, c.z);
    m.traverse(function(o){ o.userData.tank = true; });
    scene.add(m);
  });
}

export function isTankDriving(){ return drivingIdx>=0; }
export function drivingTank(){ return drivingIdx>=0 ? tanks[drivingIdx] : null; }

// unified check for any vehicle driving
export function isDrivingTank(){ return isTankDriving(); }

function nearestTank(maxD){
  let best=-1,bd=maxD;
  for(let i=0;i<tanks.length;i++){ const d=Math.hypot(camera.position.x - tanks[i].x, camera.position.z - tanks[i].z); if(d<bd){ bd=d; best=i; } }
  return best;
}
let promptShown=false, lastPromptAt=0;
function showPrompt(){
  const now=performance.now();
  if(now-lastPromptAt<2500) return;
  lastPromptAt=now;
  showSubtitle('[F] DRIVE TANK');
  promptShown=true;
}
function hidePrompt(){ promptShown=false; }

export function tryEnterTank(){
  if(isTankDriving() || S.dead || S.won || S.hub) return false;
  const idx = nearestTank(3.8);
  if(idx<0) return false;
  enter(idx);
  return true;
}
function enter(idx){
  drivingIdx = idx;
  const c = tanks[idx];
  S.prone=false; S.supine=false; S.ads=false;
  hidePrompt();
  c.turretYaw = c.yaw;
  c.turretRel = 0;
  c.turretPitch = 0;
  if(typeof S.tankDriving!=='undefined') S.tankDriving=true;
  S.carDriving = true; // block infantry firing
}
export function exitTank(){
  if(!isTankDriving()) return;
  hideAim();
  const c = tanks[drivingIdx];
  const off = 3.0;
  const sx = c.x + Math.cos(c.yaw)*off;
  const sz = c.z - Math.sin(c.yaw)*off;
  const gy = groundHeight(sx,sz)+1.7;
  camera.position.set(sx,gy,sz);
  drivingIdx=-1;
  if(typeof S.tankDriving!=='undefined') S.tankDriving=false;
  S.carDriving=false;
}

export function tankShoot(){
  if(!isTankDriving()) return false;
  const c = tanks[drivingIdx];
  if(c.cooldown>0) return false;
  c.cooldown = 1.4;
  // muzzle world pos
  let muzzle = new THREE.Vector3();
  let dir = new THREE.Vector3();
  if(c.turretMesh){
    const localTip = new THREE.Vector3(0, 0.18, -1.75);
    const worldTip = localTip.clone().applyMatrix4(c.turretMesh.matrixWorld);
    muzzle.copy(worldTip);
    _tankEuler.set(c.turretPitch||0, c.turretYaw, 0, 'YXZ');
    dir.set(0,0,-1).applyEuler(_tankEuler).normalize();
  } else if(c.turret){
    const q = new THREE.Quaternion();
    c.turret.getWorldQuaternion(q);
    c.mesh.getWorldPosition(muzzle);
    muzzle.y += 1.35;
    _tankEuler.set(c.turretPitch||0, c.turretYaw, 0, 'YXZ');
    dir.set(0,0,-1).applyEuler(_tankEuler).normalize();
    muzzle.addScaledVector(dir, 0.4);
  } else {
    muzzle.set(c.x, c.py+1.35, c.z);
    _tankEuler.set(c.turretPitch||0, c.turretYaw, 0, 'YXZ');
    dir.set(0,0,-1).applyEuler(_tankEuler).normalize();
  }
  // slightly lift dir if aiming up? keep flat
  // hitscan with explodeAt at hit point or max range
  const range = 180;
  const end = muzzle.clone().addScaledVector(dir, range);
  // raycast via scene
  const rc = new THREE.Raycaster(muzzle, dir, 0, range);
  rc.camera = camera;
  const hits = rc.intersectObjects(scene.children, true).filter(function(h){ return !h.object.userData.tank && !h.object.userData.rain && !h.object.userData.ground; });
  let hitPos = end;
  let hitObj = null;
  if(hits.length){
    // filter against tank itself
    for(let i=0;i<hits.length;i++){
      let p=hits[i].object;
      let isSelf=false;
      while(p){ if(p===c.mesh){ isSelf=true; break; } p=p.parent; }
      if(!isSelf){ hitPos = hits[i].point.clone(); hitObj = hits[i].object; break; }
    }
  } else {
    // ground check
    let t=0, step=2;
    for(let i=0;i<90;i++){
      const tt=t+step;
      const atx=muzzle.x+dir.x*tt, atz=muzzle.z+dir.z*tt;
      const aty=muzzle.y+dir.y*tt;
      const gh=groundHeight(atx,atz);
      if(aty<=gh){ hitPos.set(atx, gh+0.3, atz); break; }
      t=tt;
      if(t>range) break;
    }
  }
  // visual - polished flash + tracer
  const flash = new THREE.PointLight(0xffaa44, 8, 30);
  flash.position.copy(muzzle);
  scene.add(flash);
  setTimeout(function(){ scene.remove(flash); }, 90);
  const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:getFlashTex(), blending:THREE.AdditiveBlending, depthWrite:false, transparent:true}));
  spr.position.copy(muzzle); spr.scale.set(1.2,1.2,1); // ponytail: one sprite, auto-disposed
  spr.material.opacity=1; scene.add(spr);
  (function f(){ const t=performance.now(); (function tick(){ const k=(performance.now()-t)/90; if(k>=1){ scene.remove(spr); return; } spr.material.opacity=1-k; spr.scale.set(1.2+ k*1.8,1.2+ k*1.8,1); requestAnimationFrame(tick); })(); })();
  // tracer
  const g = new THREE.BufferGeometry().setFromPoints([muzzle, hitPos]);
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({color:0xffcc66, transparent:true, opacity:0.95}));
  scene.add(line);
  setTimeout(function(){ scene.remove(line); g.dispose(); }, 120);
  // damage + explosion - direct body hit oneshots UGV
  explodeAt(hitPos, 40);
  if(hitObj){
    try{
      if(inUgv(hitObj)) damageUgv(hitObj, 1000);
      else if(inTurret(hitObj)) damageTurret(hitObj, 1000);
      else if(inBoss(hitObj)) damageBoss(hitObj, 1000);
      else if(inDrone(hitObj)) damageDrone(1000);
    }catch(e){}
  }
  // recoil kick & shake
  S.shakeX += (Math.random()-0.5)*0.06;
  S.shakeY += (Math.random()-0.5)*0.06;
  S.fovPunch = Math.min(S.fovPunch+6, 14);
  S.caKick = Math.min(S.caKick+4, 8);
  heardShot();
  // lean backward on shoot
  c.pitchLean -= 0.12;
  return true;
}

export function updateTanks(dt, now){
  if(S.dead || S.won){
    hidePrompt(); hideAim();
    // freeze tank controls on win/dead, fade engine
    for(let i=0;i<tanks.length;i++){ const c=tanks[i]; if(c.gain){ c.gain.gain.value += (0 - c.gain.gain.value)*dt*6; if(c.gain.gain.value<0.015) killTankAudio(c); } }
    tickDust(dt);
    return;
  }
  if(!isTankDriving() && !S.hub && !S.won && !S.paused){
    const idx=nearestTank(3.8);
    if(idx>=0) showPrompt(); else hidePrompt();
    hideAim();
  } else if(!isTankDriving()) { hidePrompt(); hideAim(); }

  for(let i=0;i<tanks.length;i++){
    const c=tanks[i];
    if(!c.mesh) continue;
    if(i!==drivingIdx){
      // idle - fade engine if left over
      if(c.gain){ c.gain.gain.value += (0 - c.gain.gain.value)*dt*4; if(c.gain.gain.value<0.015) killTankAudio(c); }
      const gh = groundHeight(c.x,c.z)+c.baseY;
      c.py = gh;
      c.mesh.position.set(c.x, gh, c.z);
      c.mesh.rotation.set(c.pitch, c.yaw, c.roll);
      if(c.turret) c.turret.rotation.y = 0;
      if(c.cooldown>0) c.cooldown = Math.max(0, c.cooldown - dt);
      continue;
    }
    if(c.cooldown>0) c.cooldown -= dt;
    // input
    const throttle = (S.keys['KeyW']?1:0) - (S.keys['KeyS']?1:0);
    const throttleAbs = Math.abs(throttle);
    const steer = (S.keys['KeyA']?1:0) - (S.keys['KeyD']?1:0);
    // turret yaw via mouse
    if(S.isLocked){
      const sens = 0.0022;
      // accumulate mouse dx from S.lookDX? S.lookDX reset each frame via takeLook but we can read e.movementX directly via S.euler? Simpler: use S.euler delta?
      // We will read S.aimErr? Instead consume takeLook
      // Use S.lookDX/Y which is filled by input mousemove before update
      // input.js fills S.lookDX even when driving? It early returns if isDriving() for car check, but we now need separate.
      // Workaround: read euler delta: we will update turret via mouse movement captured in tank module via event listener below
    }
    // steering: heavy U-turn - yaw inertia // ponytail: slower + mass
    const prevYaw = c.yaw;
    const absSp = Math.abs(c.speed);
    let targetYawRate = 0;
    if(absSp < 0.4 && steer!==0){
      targetYawRate = steer * TANK_TURN_STATIONARY;
      if(throttle===0) c.speed *= 0.92;
    } else if(steer!==0){
      const grip = THREE.MathUtils.clamp(1 - absSp*0.045, 0.35, 1);
      targetYawRate = steer * TANK_TURN_MOVING * grip * (c.speed>=0?1:-1) * (absSp<1?0.55:1) * Math.max(1, Math.min(1.45, absSp*0.10+0.7));
    }
    c.yawVel += (targetYawRate - c.yawVel) * Math.min(1, dt * TANK_YAW_ACCEL);
    c.yawVel *= Math.pow(TANK_YAW_DAMP, dt);
    if(Math.sign(c.yawVel) !== Math.sign(targetYawRate) && targetYawRate!==0) c.yawVel *= 0.92;
    c.yaw += c.yawVel * dt;
    // turret follows hull (so camera turns with tank)
    const dYaw = c.yaw - prevYaw;
    c.turretYaw += dYaw;
    // clamp turret relative to hull rear arc (can't look fully away from back)
    let rel = c.turretYaw - c.yaw;
    rel = THREE.MathUtils.clamp(rel, -TURRET_REL_LIMIT, TURRET_REL_LIMIT);
    c.turretYaw = c.yaw + rel;
    c.turretRel = rel;
    // brake-then-reverse: S is brake first, hold at 0 for 0.42s then reverse // ponytail: tiny state + clamp
    if(c._brakeHold==null) c._brakeHold=0;
    const isBrakingFwd = throttle<0 && c.speed>0.05;
    const isBrakingRev = throttle>0 && c.speed<-0.05;
    if(throttle===0){
      c._brakeHold=0;
      if(Math.abs(c.speed) < 0.05) c.speed = 0;
      else c.speed -= Math.sign(c.speed) * TANK_FRICTION * dt * (1 + absSp*0.08);
    } else if(isBrakingFwd){
      if(c.speed>0.22){
        c.speed += -TANK_BRAKE * dt;
        if(c.speed<0) c.speed=0;
        c._brakeHold=0;
      } else {
        c.speed = Math.max(0, c.speed - TANK_BRAKE*0.4*dt);
        if(Math.abs(c.speed)<0.04) c.speed=0;
        c._brakeHold += dt;
        if(c._brakeHold < 0.42) c.speed=0;
        else c.speed += -TANK_BRAKE*0.55 * dt; // now reverse
      }
      c.speed -= Math.sign(c.speed) * (0.04 + absSp*0.015) * dt * 3;
    } else if(isBrakingRev){
      if(c.speed<-0.22){
        c.speed += TANK_BRAKE * dt;
        if(c.speed>0) c.speed=0;
        c._brakeHold=0;
      } else {
        c.speed = Math.min(0, c.speed + TANK_BRAKE*0.4*dt);
        if(Math.abs(c.speed)<0.04) c.speed=0;
        c._brakeHold += dt;
        if(c._brakeHold < 0.42) c.speed=0;
        else c.speed += TANK_ACCEL * 0.55 * dt; // now forward
      }
      c.speed -= Math.sign(c.speed) * (0.04 + absSp*0.015) * dt * 3;
    } else {
      c._brakeHold=0;
      let accel = throttle>0 ? TANK_ACCEL : -TANK_BRAKE;
      c.speed += accel * dt;
      c.speed -= Math.sign(c.speed) * (0.04 + absSp*0.015) * dt * 6;
    }
    c.speed = THREE.MathUtils.clamp(c.speed, TANK_MAX_REV, TANK_MAX_FWD);
    if(throttle===0 && Math.abs(c.speed)<0.06) c.speed=0;

    // hill: slower uphill, blocked on super sharp // ponytail: gravity + caps, slide down if too steep
    const fxHill = -Math.sin(c.yaw), fzHill = -Math.cos(c.yaw);
    const hlH = 1.7;
    const hFhill = groundHeight(c.x + fxHill*hlH, c.z + fzHill*hlH);
    const hBhill = groundHeight(c.x - fxHill*hlH, c.z - fzHill*hlH);
    const prePitch = Math.atan2(hFhill - hBhill, hlH*2);
    const moveDir = c.speed !== 0 ? Math.sign(c.speed) : (throttle !== 0 ? Math.sign(throttle) : 1);
    const uphill = prePitch * moveDir; // >0 = facing uphill in move direction
    if (uphill > 0.12) {
      const hillDrag = Math.sin(uphill) * 9.81 * 0.32;
      c.speed -= hillDrag * dt;
      if (uphill > 0.50) { if(c.speed>0) c.speed = Math.min(c.speed, 2.2); else c.speed = Math.max(c.speed, -2.2); }
      if (uphill > 0.62) { if(c.speed>0) c.speed = Math.min(c.speed, 0.9); else c.speed = Math.max(c.speed, -0.9); }
      if (uphill > 0.74) { if(c.speed>0) c.speed = Math.min(c.speed, 0.15); else c.speed = Math.max(c.speed, -0.15); c.speed -= Math.sign(moveDir||1) * 1.2 * dt; } // steep: crawl then slide
      if (uphill > 0.86) { if(c.speed>0) c.speed = Math.min(c.speed, 0); else c.speed = Math.max(c.speed, 0); c.speed -= Math.sign(moveDir||1) * 2.8 * dt; } // wall: can't climb, slide down
    } else if (uphill < -0.22) {
      // downhill assist + heavy gravity, but tank weight controls
      c.speed -= Math.sin(uphill) * 9.81 * 0.14 * dt; // sin negative => accelerates
      c.speed = THREE.MathUtils.clamp(c.speed, TANK_MAX_REV*1.05, TANK_MAX_FWD*1.05);
    }
    // also block super sharp lateral? check pitch magnitude regardless of direction - tank shouldn't sit on cliff face
    if (Math.abs(prePitch) > 0.88) {
      c.speed *= 0.88;
    }
    c.speed = THREE.MathUtils.clamp(c.speed, TANK_MAX_REV*1.1, TANK_MAX_FWD*1.1);

    // turret follow mouse: we update via external delta, else turret lerp to yaw
    // apply spring to turret: already handled via event

    // physics move
    const fx = fxHill, fz = fzHill;
    const vel = {x: fx*c.speed, z: fz*c.speed};
    const footY = groundHeight(c.x,c.z);
    const res = resolveCollisions(c.x + vel.x*dt, c.z + vel.z*dt, vel, footY, footY+2.6, 1.9, true);
    const hit = Math.hypot(res[0]-(c.x+vel.x*dt), res[1]-(c.z+vel.z*dt))>0.02;
    if(hit){ c.speed *= 0.28; S.shakeX += (Math.random()-0.5)*0.04; S.shakeY += (Math.random()-0.5)*0.04; }
    c.x = res[0]; c.z = res[1];

    // terrain pitch/roll
    const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
    const hl=1.7, hw=1.15;
    const hF=groundHeight(c.x+fx*hl, c.z+fz*hl);
    const hB=groundHeight(c.x-fx*hl, c.z-fz*hl);
    const hR=groundHeight(c.x+rx*hw, c.z+rz*hw);
    const hL=groundHeight(c.x-rx*hw, c.z-rz*hw);
    const targetPitch = Math.atan2(hF-hB, hl*2);
    const targetRoll = Math.atan2(hR-hL, hw*2);
    c.pitch += (targetPitch - c.pitch)* Math.min(1, dt*6);
    c.roll += (targetRoll - c.roll)* Math.min(1, dt*6);

    const gh2 = groundHeight(c.x,c.z)+c.baseY;
    c.py = gh2;

    // heavy lean: accel delta - toned down (was too much on steady forward)
    const accelDelta = (c.speed - c.prevSpeed)/Math.max(dt,0.001);
    c.prevSpeed = c.speed;
    const targetLean = THREE.MathUtils.clamp(-accelDelta*0.0055, -0.10, 0.08);
    // spring softer
    c.pitchLeanVel += (targetLean - c.pitchLean)* dt*10;
    c.pitchLeanVel *= Math.pow(0.35, dt);
    c.pitchLean += c.pitchLeanVel * dt;
    // also braking lean when throttle 0 and speed dropping -> subtle forward lean
    if(throttle===0 && Math.abs(c.speed)>2){
      c.pitchLean += -Math.sign(c.speed)*0.0006;
    }

    // mesh update
    c.mesh.position.set(c.x, c.py, c.z);
    // apply lean as extra pitch
    c.mesh.rotation.set(c.pitch + c.pitchLean, c.yaw, c.roll);
    if(c.turret){
      c.turret.rotation.y = THREE.MathUtils.clamp(c.turretYaw - c.yaw, -Math.PI, Math.PI);
    }

    // 3rd person chase cam - clipped // ponytail: ray clip so cam never sinks into hill/wall
    const camDist = 9.5, camHeight = 4.2;
    const backX = c.x + Math.sin(c.yaw)*camDist;
    const backZ = c.z + Math.cos(c.yaw)*camDist;
    const camY = c.py + camHeight;
    const targetCam = new THREE.Vector3(backX, camY, backZ);
    {
      const lookTmp=new THREE.Vector3(c.x,c.py+1.2,c.z);
      const dirTmp=new THREE.Vector3().subVectors(targetCam, lookTmp).normalize();
      const rcC=new THREE.Raycaster(lookTmp, dirTmp, 0, camDist+0.5); rcC.camera=camera;
      const ch=rcC.intersectObjects(scene.children,true).filter(function(h){ return !h.object.userData.tank && h.object.visible && !h.object.userData.rain; });
      if(ch.length && ch[0].distance < camDist){ const d=Math.max(1.3, ch[0].distance-0.45); targetCam.copy(lookTmp).addScaledVector(dirTmp, d); }
      // ground clip: keep cam above terrain +0.6
      const ghCam=groundHeight(targetCam.x,targetCam.z)+0.7;
      if(targetCam.y < ghCam) targetCam.y = ghCam;
    }
    camera.position.lerp(targetCam, Math.min(1, dt*6));
    // look at tank with turret influence blended
    const lookAt = new THREE.Vector3(c.x, c.py+1.2, c.z);
    // add small turret look offset forward
    const turretFwd = new THREE.Vector3(-Math.sin(c.turretYaw),0,-Math.cos(c.turretYaw));
    lookAt.addScaledVector(turretFwd, 6);
    const m = new THREE.Matrix4().lookAt(camera.position, lookAt, new THREE.Vector3(0,1,0));
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    camera.quaternion.slerp(q, Math.min(1, dt*5));
    // update S.euler to match turret for other systems
    S.euler.y = c.turretYaw;
    S.euler.x = -0.18;
    syncHudPositions();
    updateAim(c);
    // polish: engine audio + dust // ponytail: lerp pitch/vol, spawn when thrusting
    ensureTankAudio(c);
    if(c.gain && c.audio){
      const pitchWanted = 0.62 + Math.abs(c.speed)/TANK_MAX_FWD*0.42 + Math.abs(c.yawVel)*0.10 + throttleAbs*0.22;
      c.audio.playbackRate.value += (pitchWanted - c.audio.playbackRate.value) * dt*4;
      const volWanted = 0.09 + throttleAbs*0.34 + Math.abs(c.speed)/9*0.24 + Math.abs(c.yawVel)*0.09;
      c.gain.gain.value += (THREE.MathUtils.clamp(volWanted,0,0.78) - c.gain.gain.value) * dt*5;
      if(actx.state==='suspended') try{ actx.resume(); }catch(e){}
    }
    if(Math.abs(c.speed)>1.3 && throttleAbs>0.08) spawnDust(c);
    // reticle subtle pulse when aim ready
    if(aimSprite && aimSprite.visible){ aimSprite.material.opacity=0.92+Math.sin(now*4)*0.08; if(c.cooldown>0) aimSprite.material.opacity*=0.55; }

    // camera shake: engine rumble + movement + rotation // ponytail: rolling = much less
    const isAccel = throttleAbs > 0.05;
    if(absSp>0.5){
      const throttleScale = isAccel ? 1 : 0.18;
      const shakeAmp = Math.min(0.02 + absSp*0.003, 0.05) * throttleScale;
      const n = now* (6 + absSp*1.2);
      S.shakeX += Math.sin(n)*shakeAmp*dt*8;
      S.shakeY += Math.cos(n*1.3)*shakeAmp*dt*8;
      if(isAccel && absSp>6 && Math.random()<0.04) S.fovPunch = Math.min(S.fovPunch+0.7, 8);
    }
    // engine idle rumble even when still (engine running) - subtle when rolling
    {
      const idleScale = isAccel ? 1 : 0.35;
      const idleAmp = (0.007 + absSp*0.0012) * idleScale;
      S.shakeX += Math.sin(now*13.2)*idleAmp*dt*5;
      S.shakeY += Math.cos(now*11.7)*idleAmp*dt*5;
    }
    // rotate shake - even just yawing in place rattles
    const yawAbs = Math.abs(c.yawVel||0);
    if(yawAbs > 0.08){
      const rAmp = Math.min(0.014 + yawAbs*0.022, 0.038) * (throttleAbs>0?1:0.55);
      S.shakeX += Math.sin(now*9.3)*rAmp*dt*7;
      S.shakeY += Math.cos(now*7.8)*rAmp*dt*7;
      S.shakeX += (Math.random()-0.5)*0.007 * (isAccel?1:0.5);
      if(yawAbs>0.4 && Math.random()<0.05) S.fovPunch = Math.min(S.fovPunch+0.35, 6);
    }
    // terrain bump shake
    if(Math.abs(c.pitch - targetPitch) > 0.05) { S.shakeX += (Math.random()-0.5)*0.01; }

    // firing with left click handled via separate mousedown listener; also allow Space?
    // cooldown already

    // collision ram vs UGV
    if(now - (c.lastHit||0) > 0.65){
      for(let ui=0; ui<ugvList().length; ui++){
        const u = ugvList()[ui];
        if(Math.hypot(c.x-u.x, c.z-u.z)<3.4){
          const spAbs=Math.abs(c.speed);
          if(spAbs>2){
            damageUgv(u.group, Math.min(300, Math.round(spAbs*18)));
            if(spAbs>1.5) damagePlayer(Math.min(12, Math.round(spAbs*0.5)), {x:u.x,y:1,z:u.z});
            c.speed*=0.55;
            c.lastHit=now;
            S.shakeX += (Math.random()-0.5)*0.05; S.shakeY+=(Math.random()-0.5)*0.05;
            break;
          }
        }
      }
    }
  }
  tickDust(dt);
}

// turret mouse control - yaw + slight pitch, no mesh anim // ponytail: disabled on win/hub/dead
if(typeof window!=='undefined'){
  window.addEventListener('mousemove', function(e){
    if(drivingIdx<0 || !S.isLocked || S.won || S.hub || S.dead || S.paused) return;
    const c=tanks[drivingIdx];
    if(!c) return;
    let rel = (c.turretYaw - c.yaw) - e.movementX * 0.0022;
    rel = THREE.MathUtils.clamp(rel, -TURRET_REL_LIMIT, TURRET_REL_LIMIT);
    c.turretYaw = c.yaw + rel;
    c.turretRel = rel;
    let pitch = (c.turretPitch||0) - e.movementY * 0.0016;
    pitch = THREE.MathUtils.clamp(pitch, TURRET_PITCH_DOWN, TURRET_PITCH_UP);
    c.turretPitch = pitch;
  });
}

export function tankCount(){ return tanks.length; }
window.__gaultTanks = tanks;
