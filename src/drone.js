






import { scene, camera } from './core.js';
import { groundHeight, MAP_SPAWNS, fixGun } from './world.js';
import { explodeAt } from './grenades.js';
import { actx, getDroneBuffer } from './audio.js';
import { S } from './state.js';
import { identLock, clearIdentLock } from './ident.js';
import { addCc } from './ui.js';
import { radarBonus } from './radar.js';

const DRONE_SPAN = 0.55;
const DRONE_YAW_FIX = 0;
const PATROL_SPEED = 3.2, PATROL_ACCEL = 2.2;
const DIVE_SPEED = 14, DIVE_ACCEL = 16;
const CLIMB_SPEED = 5, CLIMB_ACCEL = 6;
const SPOT_DIST = 18;
const HUNT_LOCK = 30;
const RAM_DIST = 1.2;
const DRONE_HP = 25;
const RESPAWN = 12;
const MIN_ALT = 0.8, MAX_ALT = 15;
const INV_RANGE = 50;
const INVEST_TIME = 6;


const CERT_ATTACK = 20;
const CERT_OVERDRIVE = 90;
const CERT_HIT = 70;
const CERT_DECAY = 2;
const OVER_SPEED = 1.6;
const OVER_ACCEL = 1.5;

let model = null;
let snd = null;
let d = null;
let assistMesh = null;

function rig(src) {
  src.traverse(function(c) { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  const bb = new THREE.Box3().setFromObject(src);
  const size = bb.getSize(new THREE.Vector3());
  src.scale.setScalar(DRONE_SPAN / Math.max(size.x, size.z));
  if (size.x > size.z) src.rotation.y += Math.PI / 2;
  src.rotation.y += DRONE_YAW_FIX;

  const g = new THREE.Group();
  const bb2 = new THREE.Box3().setFromObject(src);
  const c = bb2.getCenter(new THREE.Vector3());
  src.position.sub(c);
  g.add(src);


  const hit = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.copy(c);
  g.add(hit);


  const near = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  near.scale.setScalar(S.settings.aimAssist);
  near.position.copy(c);
  g.add(near);
  assistMesh = near;
  g.visible = false;
  return g;
}

new THREE.GLTFLoader().load('assets/models/drone.gltf', function(gltf) {
  fixGun(gltf.scene);
  model = rig(gltf.scene);
  scene.add(model);
  spawn();
});

let mapApplied = false;

export function setDroneMapReady() { mapApplied = true; spawn(); }

function spawn() {
  if (!mapApplied || !MAP_SPAWNS.drones.length) return;
  const s = MAP_SPAWNS.drones[Math.floor(Math.random() * MAP_SPAWNS.drones.length)];
  const x = s[0], z = s[1];
  const y = groundHeight(x, z) + 4 + Math.random() * 5;
  d = {
    pos: new THREE.Vector3(x, y, z),
    vel: new THREE.Vector3(),
    mode: 'patrol',
    wp: new THREE.Vector3(x, y, z),
    wpT: 0,
    t: 0,
    yaw: Math.random() * Math.PI * 2,
    pitch: 0,
    roll: 0,
    hp: DRONE_HP,
    dead: false,
    respawnT: 0,
    huntT: HUNT_LOCK,
    invT: 0, invX: 0, invY: 0, invZ: 0,
    spawnX: x, spawnZ: z,
    cert: 5, over: false,
  };
  clearIdentLock();
  if (!model) return;
  model.visible = true;
  model.position.copy(d.pos);
}

function boomJuice() {

  S.fovPunch = Math.min(S.fovPunch + 10, 14);
  S.shakeX += (Math.random() - 0.5) * 0.05;
  S.shakeY += (Math.random() - 0.5) * 0.05;
  S.caKick = Math.min(S.caKick + 4, 6);
}

function killDrone() {
  d.dead = true;
  d.respawnT = RESPAWN;
  d.mode = 'fall';
  d.deadT = 0;
  d.vel.set(0, 0, 0);
  clearIdentLock();
  if (snd) {
    snd.gain.gain.setTargetAtTime(0, actx.currentTime, 0.03);
    const s = snd.src;
    setTimeout(function() { try { s.stop(); } catch (e) {} }, 250);
    snd = null;
  }
}

function ensureSnd() {
  const buf = getDroneBuffer();
  if (!buf || snd || !actx.state || actx.state === 'closed') return;
  const src = actx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const gain = actx.createGain();
  gain.gain.value = 0;
  src.connect(gain).connect(actx.destination);
  src.start();
  snd = { src: src, gain: gain };
}


function updateSnd(velY, dist) {
  ensureSnd();
  if (!snd) return;
  const fade = Math.max(0, 1 - dist / 120);
  snd.gain.gain.setTargetAtTime(fade * fade * 0.35, actx.currentTime, 0.1);
  snd.src.playbackRate.value = 0.9 + Math.max(0, velY) * 0.08;
}

function pickPatrolWp() {


  const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 25;
  const x = THREE.MathUtils.clamp(d.spawnX + Math.sin(a) * r, -95, 95);
  const z = THREE.MathUtils.clamp(d.spawnZ + Math.cos(a) * r, -95, 95);
  const lo = groundHeight(x, z) + 2.5;
  d.wp.set(x, THREE.MathUtils.clamp(d.pos.y + (Math.random() - 0.5) * 6, lo, MAX_ALT), z);
  d.wpT = 6 + Math.random() * 4;
}


export function applyAimAssist() { if (assistMesh) assistMesh.scale.setScalar(S.settings.aimAssist); }

export function updateDrone(dt, now) {
  if (!model || !d) return;
  if (d.dead) {
    if (d.mode === 'fall') {
      d.deadT += dt;
      d.vel.y -= 20 * dt;
      d.pos.addScaledVector(d.vel, dt);
      const floor = groundHeight(d.pos.x, d.pos.z);
      if (d.pos.y <= floor) { d.pos.y = floor; d.vel.y = 0; }
      model.position.copy(d.pos);
      const roll = THREE.MathUtils.clamp(d.vel.y * -0.4, -1.5, 0) * d.deadT;
      model.rotation.set(d.pitch, d.yaw, roll);
    }
    d.respawnT -= dt;
    if (d.respawnT <= 0) spawn();
    if (snd) updateSnd(0, 999);
    return;
  }

  const eye = camera.position;

  if (d.mode === 'climb' || d.mode === 'attack') identLock(model);
  else clearIdentLock();
  const over = d.over ? OVER_SPEED : 1;
  const maxSpeed = d.mode === 'attack' ? DIVE_SPEED * over : (d.mode === 'climb' ? CLIMB_SPEED * over : PATROL_SPEED);
  const maxAccel = d.mode === 'attack' ? DIVE_ACCEL * (d.over ? OVER_ACCEL : 1) : (d.mode === 'climb' ? CLIMB_ACCEL : PATROL_ACCEL);
  const desired = new THREE.Vector3();

  if (d.mode === 'patrol') {
    d.wpT -= dt;
    if (!S.prone) d.huntT -= dt;


    if (d.over) d.cert = Math.max(d.cert, CERT_OVERDRIVE);
    else {
      let rate = 0;
      const pDist = eye.distanceTo(d.pos);
      if (pDist < SPOT_DIST + 10 && !S.dead) {
        rate = 16 + 22 * THREE.MathUtils.clamp(1 - pDist / (SPOT_DIST + 10), 0, 1);
        const moving = S.keys['KeyW'] || S.keys['KeyA'] || S.keys['KeyS'] || S.keys['KeyD'];
        const sprint = S.keys['ShiftLeft'] || S.keys['ShiftRight'];
        if (moving) rate += sprint ? 14 : 6;
        if (S.prone) rate *= 0.5;
      }
      d.cert += (rate - CERT_DECAY * (rate > 0 ? 0 : 1)) * dt;
      d.cert = THREE.MathUtils.clamp(d.cert, 0, 100);
      if (d.cert >= CERT_OVERDRIVE) d.over = true;
    }
    if (d.invT > 0) {

      d.invT -= dt;
      const invP = new THREE.Vector3(d.invX, d.invY, d.invZ);
      if (d.pos.distanceTo(invP) > 3) {
        desired.copy(invP).sub(d.pos).normalize().multiplyScalar(PATROL_SPEED);
      }
    } else {
      if (d.wpT <= 0 || d.pos.distanceTo(d.wp) < 1.6) pickPatrolWp();
      desired.copy(d.wp).sub(d.pos).normalize().multiplyScalar(PATROL_SPEED);
    }

    if (d.over || (d.cert >= CERT_ATTACK && eye.distanceTo(d.pos) < SPOT_DIST) || d.huntT <= 0) {
      d.mode = 'climb';
      d.t = 0;
    }
  } else if (d.mode === 'climb') {

    d.t += dt;
    const abovePlayer = new THREE.Vector3(eye.x, 0, eye.z).lerp(new THREE.Vector3(d.pos.x, 0, d.pos.z), 0.55);
    desired.set(abovePlayer.x - d.pos.x, 9, abovePlayer.z - d.pos.z).normalize().multiplyScalar(CLIMB_SPEED);
    if (d.t > 0.7 && d.pos.y > eye.y + 6) {
      d.mode = 'attack';
      d.t = 0;
    }
  } else if (d.mode === 'attack') {

    d.t += dt;
    desired.copy(eye).sub(d.pos).normalize().multiplyScalar(DIVE_SPEED);
    if (d.pos.distanceTo(eye) < RAM_DIST) {
      explodeAt(d.pos.clone(), 20);
      boomJuice();
      killDrone();
      return;
    }
    if (d.t > 6 && !d.over || d.pos.y < groundHeight(d.pos.x, d.pos.z) + MIN_ALT * 0.5) {
      d.mode = 'patrol';
    }
  }


  const acc = desired.sub(d.vel);
  if (acc.length() > maxAccel) acc.setLength(maxAccel);
  d.vel.addScaledVector(acc, dt);
  if (d.vel.length() > maxSpeed) d.vel.setLength(maxSpeed);
  d.pos.addScaledVector(d.vel, dt);


  const floor = groundHeight(d.pos.x, d.pos.z) + MIN_ALT;
  if (d.pos.y < floor) { d.pos.y = floor; d.vel.y = Math.max(d.vel.y, 0); }
  if (d.pos.y > MAX_ALT) { d.pos.y = MAX_ALT; d.vel.y = Math.min(d.vel.y, 0); }


  const speed = d.vel.length();
  if (speed > 0.4) {
    const wantYaw = Math.atan2(-d.vel.x, -d.vel.z);
    let dy = wantYaw - d.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    d.yaw += dy * Math.min(1, dt * 5);
  }
  const k = Math.min(1, dt * 4);
  const wantPitch = speed > 0.4 ? -Math.asin(THREE.MathUtils.clamp(d.vel.y / speed, -1, 1)) * 0.65 : 0;
  d.pitch += (wantPitch - d.pitch) * k;

  const fx = -Math.sin(d.yaw), fz = -Math.cos(d.yaw);
  const lat = acc.x * -fz + acc.z * fx;
  const wantRoll = THREE.MathUtils.clamp(-lat * 0.09, -0.55, 0.55);
  d.roll += (wantRoll - d.roll) * k;
  const vib = (0.25 + Math.min(1, speed / DIVE_SPEED)) * Math.sin(now * 47) * 0.004;
  model.position.copy(d.pos);
  model.position.y += vib;
  model.rotation.set(d.pitch + vib * 0.5, d.yaw, d.roll);

  updateSnd(d.vel.y, eye.distanceTo(d.pos));
}



export function heardShot() {
  if (!d || d.dead || d.mode !== 'patrol') return;
  const eye = camera.position;
  if (d.pos.distanceTo(eye) > INV_RANGE) return;
  d.cert = THREE.MathUtils.clamp(d.cert + 25, 0, 100);
  d.invT = INVEST_TIME;
  d.invX = eye.x; d.invZ = eye.z;
  d.invY = groundHeight(eye.x, eye.z) + 5;
}

export function inDrone(o) { while (o) { if (o === model) return true; o = o.parent; } return false; }


export function lowerCert() {
  if (!d || d.dead) return;
  d.cert = Math.min(d.cert, 40);
  d.over = false;
  d.huntT = HUNT_LOCK;
  d.mode = 'patrol';
}

export function droneState() {
  if (!d || d.dead || !model) return null;
  return {
    x: d.pos.x, z: d.pos.z, group: model, maxHp: DRONE_HP, ref: d,
    hpFn: function() { return d.hp; },
    pct: function() { return Math.round(d.cert); },
  };
}

export function droneIdent() {
  if (!d || d.dead || !model) return null;
  return { group: model, maxHp: DRONE_HP, hp: function() { return d.hp; } };
}

export function damageDrone(dmg) {

  if (!d || d.dead || dmg <= 0) return;
  d.hp -= dmg;
  d.cert = Math.max(d.cert, CERT_HIT);
  if (d.hp <= 0) {
    if (S.straf && !S.ads) addCc(50);
    if (radarBonus(d, performance.now() / 1000)) addCc(25);
    killDrone();
  }
}
