import { scene, camera } from './core.js';
import { S } from './state.js';
import { groundHeight } from './world.js';
import { identLanding, setLandingVisible } from './ident.js';
import { explodeMortarAt } from './grenades.js';
import { curWeaponName, isReloading } from './weapons.js';
import { fixGun } from './world.js';
import { showSubtitle } from './ui.js';
import { ugvList } from './ugv.js';
import { turretList } from './turret.js';
import { bossList } from './boss.js';
import { droneState } from './drone.js';

let mortarProto = null;
let ballProto = null;
new THREE.GLTFLoader().load('assets/models/mortar.gltf', function(gltf){
  mortarProto = gltf.scene;
  fixGun(mortarProto);
});
new THREE.GLTFLoader().load('assets/models/ball.gltf', function(gltf){
  ballProto = gltf.scene;
  fixGun(ballProto);
  ballProto.scale.setScalar(0.6);
});

let mortarMesh = null;
let anchor = null;
let anchorYaw = 0;
let mortarBaseYaw = 0;
export const mortarTarget = new THREE.Vector3();
let activeWas = false;
let deployT = 0;
const DEPLOY_DUR = 0.55;
const shells = [];
const MOVE_SPEED = 22;
const MAX_RANGE = 250;
const GRAV = 20;

let seq = 0;
const hits = [];

function ensureMesh(){
  if (mortarMesh || !mortarProto) return;
  mortarMesh = mortarProto.clone(true);
  mortarMesh.traverse(function(c){ if(c.isMesh){ c.castShadow=true; c.receiveShadow=true; }});
  mortarMesh.rotation.y = -Math.PI / 2;
  scene.add(mortarMesh);
}
function clampTarget(){
  if(!anchor) return;
  let dx = mortarTarget.x - anchor.x;
  let dz = mortarTarget.z - anchor.z;
  let d = Math.hypot(dx, dz);
  if (d > MAX_RANGE){
    const k = MAX_RANGE / d;
    mortarTarget.x = anchor.x + dx * k;
    mortarTarget.z = anchor.z + dz * k;
    dx *= k; dz *= k;
  }
  const fx = -Math.sin(anchorYaw), fz = -Math.cos(anchorYaw);
  const rx = Math.cos(anchorYaw), rz = -Math.sin(anchorYaw);
  let f = dx*fx + dz*fz;
  let r = dx*rx + dz*rz;
  if (f < 3){
    f = 3;
    mortarTarget.x = anchor.x + fx*f + rx*r;
    mortarTarget.z = anchor.z + fz*f + rz*r;
    dx = mortarTarget.x - anchor.x; dz = mortarTarget.z - anchor.z;
    d = Math.hypot(dx, dz);
    if (d > MAX_RANGE){
      const k = MAX_RANGE / d;
      mortarTarget.x = anchor.x + dx * k;
      mortarTarget.z = anchor.z + dz * k;
    }
  }
  mortarTarget.y = groundHeight(mortarTarget.x, mortarTarget.z) + 0.05;
}
export function isMortarActive(){
  if (S.hub || S.story || S.won || S.dead) return false;
  return curWeaponName() === 'Mortar';
}
export function getMortarMesh(){ return mortarMesh; }
export function mortarHud(){
  if (!isMortarActive() || !anchor) return null;
  if (deployT < DEPLOY_DUR) return 'MORTAR  DEPLOYING';
  const d = Math.round(Math.hypot(mortarTarget.x - anchor.x, mortarTarget.z - anchor.z));
  const t = (1.35 + d * 0.018).toFixed(1);
  let s = 'MORTAR  ' + d + 'm  ' + t + 's';
  if (hits.length){
    const last = hits[hits.length-1];
    s += last.hit ? '  HIT!' : '  ' + Math.round(last.enemyDist) + 'm';
  }
  return s;
}

const HIT_R = 7;
function nearestEnemyDist(pos){
  let best = Infinity;
  const d2 = function(x,z){ const d=Math.hypot(x-pos.x, z-pos.z); if(d<best) best=d; };
  for(const u of ugvList()) d2(u.x,u.z);
  for(const t of turretList()) d2(t.x,t.z);
  for(const b of bossList()) d2(b.x,b.z);
  const dr = droneState(); if(dr) d2(dr.x,dr.z);
  return best;
}
function addHitMarker(aim, impact){
  seq++;
  const n = seq;
  const enemyDist = nearestEnemyDist(impact);
  const hit = enemyDist < HIT_R;
  hits.push({ n:n, aim: aim.clone(), impact: impact.clone(), hit: hit, enemyDist: enemyDist });
  if (hits.length>24){ hits.shift(); }
}
function clearLog(){
  hits.length=0; seq=0;
}

export function updateMortar(dt){
  const active = isMortarActive();
  if (!active){
    if (mortarMesh) mortarMesh.visible = false;
    if (activeWas){
      setLandingVisible(false);
      anchor = null; mortarBaseYaw = 0; deployT = 0;
    }
    activeWas = false;
    updateShells(dt);
    return;
  }
  if (!anchor){
    clearLog();
    const x = camera.position.x, z = camera.position.z;
    const f0 = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion); f0.y=0; if(f0.lengthSq()<1e-6) f0.set(0,0,-1); f0.normalize();
    const r0 = new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion); r0.y=0; r0.normalize();
    const ax = x + f0.x*1.1 + r0.x*0.55;
    const az = z + f0.z*1.1 + r0.z*0.55;
    const y = groundHeight(ax, az);
    anchor = new THREE.Vector3(ax, y, az);
    anchorYaw = S.euler.y;
    deployT = 0;
    mortarTarget.set(x + f0.x*22, 0, z + f0.z*22);
    mortarTarget.y = groundHeight(mortarTarget.x, mortarTarget.z) + 0.05;
    ensureMesh();
    if(mortarMesh){
      mortarMesh.position.set(ax, y, az);
      mortarMesh.lookAt(mortarTarget.x, y, mortarTarget.z);
      mortarBaseYaw = mortarMesh.rotation.y + Math.PI;
      mortarMesh.rotation.y = mortarBaseYaw;
    }
  }
  ensureMesh();
  if (mortarMesh){
    mortarMesh.visible = true;
    if(mortarBaseYaw===0 && anchor){
      mortarMesh.position.set(anchor.x, anchor.y, anchor.z);
      mortarMesh.lookAt(mortarTarget.x, anchor.y, mortarTarget.z);
      mortarBaseYaw = mortarMesh.rotation.y + Math.PI;
    }
    mortarMesh.rotation.y = mortarBaseYaw;
    if (deployT < DEPLOY_DUR){
      deployT += dt;
      const k = Math.min(1, deployT / DEPLOY_DUR);
      const e = k*k*(3 - 2*k);
      const over = k < 0.5 ? 1 + Math.sin(k*Math.PI)*0.06 : 1;
      const drop = (1 - e) * 1.1;
      mortarMesh.position.set(anchor.x, anchor.y + drop, anchor.z);
      const sc = (0.18 + 0.82*e) * over;
      mortarMesh.scale.setScalar(sc);
      if (k >= 1){
        mortarMesh.position.set(anchor.x, anchor.y, anchor.z);
        mortarMesh.scale.setScalar(1);
        S.shakeY += 0.025;
        S.shakeX += (Math.random()-0.5)*0.02;
        showSubtitle('MORTAR READY — WASD aim  250m');
      }
    } else {
      mortarMesh.position.set(anchor.x, anchor.y, anchor.z);
      mortarMesh.scale.setScalar(1);
    }
  }
  const fwd = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion); fwd.y=0; fwd.normalize();
  const right = new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion); right.y=0; right.normalize();
  let dx=0, dz=0;
  if (S.keys['KeyW']) { dx += fwd.x; dz += fwd.z; }
  if (S.keys['KeyS']) { dx -= fwd.x; dz -= fwd.z; }
  if (S.keys['KeyA']) { dx -= right.x; dz -= right.z; }
  if (S.keys['KeyD']) { dx += right.x; dz += right.z; }
  if (dx!==0 || dz!==0){
    const len = Math.hypot(dx,dz) || 1;
    const m = (S.keys['ShiftLeft']||S.keys['ShiftRight']) ? 1.7 : ((S.keys['ControlLeft']||S.keys['ControlRight']||S.keys['AltLeft'])?0.35:1);
    mortarTarget.x += (dx/len) * MOVE_SPEED * m * dt;
    mortarTarget.z += (dz/len) * MOVE_SPEED * m * dt;
    clampTarget();
  }
  setLandingVisible(true);
  identLanding(mortarTarget);
  activeWas = true;
  updateShells(dt);
}
function updateShells(dt){
  for(let i=shells.length-1;i>=0;i--){
    const s = shells[i];
    s.vel.y -= GRAV * dt;
    s.pos.addScaledVector(s.vel, dt);
    s.mesh.position.copy(s.pos);
    s.mesh.rotation.x += dt*6;
    s.mesh.rotation.z += dt*4;
    s.trail = (s.trail||0) + dt;
    if (s.trail > 0.06){
      s.trail = 0;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.14, 4, 4), new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.28 }));
      puff.position.copy(s.pos);
      scene.add(puff);
      let a = 0;
      const tick = function(){ a+=0.06; puff.material.opacity = 0.28*(1-a); puff.scale.setScalar(1+a*1.8); if(a>=1){ scene.remove(puff); puff.geometry.dispose(); } else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }
    const gh = groundHeight(s.pos.x, s.pos.z) + 0.2;
    if (s.pos.y <= gh || s.t > 12){
      const p = s.pos.clone(); p.y = groundHeight(s.pos.x, s.pos.z);
      const aim = s.aim ? s.aim.clone() : p.clone();
      addHitMarker(aim, p);
      explodeMortarAt(p, 32);
      scene.remove(s.mesh);
      shells.splice(i,1);
    } else s.t += dt;
  }
}
export function mortarFire(){
  if (!anchor || !ballProto) return false;
  if (deployT < DEPLOY_DUR || isReloading()) return false;
  ensureMesh();
  const start = new THREE.Vector3(anchor.x, anchor.y + 1.1, anchor.z);
  const dst = mortarTarget.clone();
  dst.y = groundHeight(dst.x, dst.z);
  const dx = dst.x - start.x, dz = dst.z - start.z, dist = Math.hypot(dx, dz);
  const t = 1.35 + dist * 0.018;
  const vx = dx / t;
  const vz = dz / t;
  const vy = (dst.y - start.y + 0.5*GRAV*t*t) / t;
  const mesh = ballProto.clone(true);
  mesh.position.copy(start);
  mesh.visible = true;
  scene.add(mesh);
  shells.push({ mesh: mesh, pos: start.clone(), vel: new THREE.Vector3(vx, vy, vz), t: 0, trail: 0, aim: dst.clone() });
  const flash = new THREE.PointLight(0xffcc66, 5, 14);
  flash.position.copy(start);
  scene.add(flash);
  setTimeout(function(){ scene.remove(flash); }, 120);
  const puff = new THREE.Mesh(new THREE.SphereGeometry(0.55, 6, 6), new THREE.MeshBasicMaterial({ color: 0x777777, transparent: true, opacity: 0.35 }));
  puff.position.copy(start);
  scene.add(puff);
  let k=0; (function f(){ k+=0.07; puff.scale.setScalar(1+k*2.2); puff.material.opacity=0.35*(1-k); if(k<1) requestAnimationFrame(f); else { scene.remove(puff); puff.geometry.dispose(); } })();
  S.fovPunch = Math.min(S.fovPunch + 3.5, 14);
  S.shakeX += (Math.random()-0.5)*0.018;
  S.shakeY += (Math.random()-0.5)*0.018;
  S.caKick = Math.min(S.caKick + 2.2, 6);
  if (mortarMesh){ mortarMesh.scale.setScalar(0.92); setTimeout(function(){ if(mortarMesh) mortarMesh.scale.setScalar(1); }, 90); }
  return true;
}
export function mortarBlocksMove(){ return isMortarActive(); }
export function resetMortar(){
  for (const s of shells) scene.remove(s.mesh);
  shells.length = 0;
  if (mortarMesh){ mortarMesh.visible = false; mortarMesh.scale.setScalar(1); }
  anchor = null; activeWas = false; deployT = 0; mortarBaseYaw=0;
  setLandingVisible(false);
  clearLog();
}
S.resetMortar = resetMortar;
