import { scene, camera, shockwaves, frameNow, postMat } from './core.js';
import { S, recoilPivot } from './state.js';
import { groundHeight, resolveCollisions, fixGun } from './world.js';
import { showSubtitle } from './ui.js';
import { explosion, actx } from './audio.js';
import * as idb from '../idb.js';
import { ugvList, damageUgv } from './ugv.js';
import { turretList, damageTurret } from './turret.js';
import { bossList, damageBoss } from './boss.js';
import { droneState, damageDrone } from './drone.js';

// ponytail: RC car — buy-once unlock, USES_PER_MAP deployments per map. Remote drone-vehicle:
// press 6 to arm, RMB places it with a look-down anim, WASD drives (chase cam), Space detonates.

const RC_KEY = 'gault_rc';
const USES_PER_MAP = 2;
const DEPLOY_TIME = 0.62;
const DEPLOY_DIST = 2.1;
const TOP_SPEED = 30, REVERSE = 10, ACCEL = 26, DRAG = 2.4, STEER = 3.6;

let proto = null, protoMinY = 0;
let usesLeft = USES_PER_MAP;
let rcHand = null;
const RC_HAND_POS = [0, -0.88, -1.25];
const RC_HAND_ROT = [0.18, 0, 0];
const RC_HAND_SCALE = 1.9;

function mountHand() {
  if (rcHand || !proto) return;
  rcHand = proto.clone();
  fixGun(rcHand);
  rcHand.position.set(RC_HAND_POS[0], RC_HAND_POS[1], RC_HAND_POS[2]);
  rcHand.rotation.set(RC_HAND_ROT[0], RC_HAND_ROT[1], RC_HAND_ROT[2]);
  rcHand.scale.setScalar(RC_HAND_SCALE);
  rcHand.visible = true;
  recoilPivot.add(rcHand);
  // hide current gun model(s)
  recoilPivot.children.forEach(function(c) {
    if (c !== rcHand && (c.isGroup || c.isMesh || c.type === 'Group')) {
      if (c.visible !== undefined) c._rcHidden = c.visible;
      c.visible = false;
    }
  });
}
function unmountHand() {
  if (!rcHand) return;
  recoilPivot.remove(rcHand);
  rcHand = null;
  // restore gun visibility
  recoilPivot.children.forEach(function(c) {
    if (c._rcHidden !== undefined) { c.visible = c._rcHidden; delete c._rcHidden; }
    else if (c.isGroup || c.isMesh) c.visible = true;
  });
}

const rc = {
  phase: 'idle', // idle | armed | deploying | driving
  mesh: null,
  x: 0, z: 0, y: 0, yaw: 0, speed: 0,
  t: 0, camX: 0, camY: 0, camZ: 0,
  startEye: null, startEul: null,
  engine: null, gain: null,
};

const loader = new THREE.GLTFLoader();
loader.load('assets/models/rc.gltf', function(gltf) {
  proto = gltf.scene;
  proto.traverse(function(o) {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  const bb = new THREE.Box3().setFromObject(proto);
  protoMinY = bb.min.y;
  proto.position.y = -protoMinY; // seat on ground at y=0
  // if player already armed before model loaded, show it now
  if (rc.phase === 'armed' && !rcHand) mountHand();
});

let engineBuf = null;
fetch('assets/audio/buggy_engine.mp3').then(r => r.arrayBuffer()).then(b => actx.decodeAudioData(b)).then(b => { engineBuf = b; });

function ownedCount() { const v = idb.get(RC_KEY); if (v == null) return 0; const n = parseInt(v, 10); return Number.isFinite(n) ? n : (v === '1' ? 1 : 0); }
export function rcOwned() { return ownedCount() > 0; }
export function rcOwnedCount() { return ownedCount(); }
export function rcMaxUses() { return ownedCount() * USES_PER_MAP; }
export function buyRc() { const c = ownedCount(); idb.set(RC_KEY, String(c + 1)); }
export function getRcProto() { return proto; }
export function rcUses() { return usesLeft; }
export function rcActive() { return rc.phase === 'deploying' || rc.phase === 'driving'; }
export function rcArmed() { return rc.phase === 'armed'; }
function canUse() { return rcOwned() && usesLeft > 0 && !S.hub && !S.won && !S.dead && !S.paused && !S.pvpLobby; }

export function setRcMapReady() {
  usesLeft = ownedCount() * USES_PER_MAP;
  abort();
}

export function armRc() {
  if (rc.phase === 'armed') { unarm(); return; }
  if (rcActive()) return;
  if (!canUse()) return;
  rc.phase = 'armed';
  mountHand();
  showSubtitle('LMB / RMB TO PLACE  —  6 TO CANCEL');
}
export function unarm() {
  if (rc.phase === 'armed') {
    unmountHand();
    rc.phase = 'idle';
  }
}

export function deployRc() {
  if (!rcOwned()) { unarm(); return; }
  if (usesLeft <= 0) { showSubtitle('NO RC CHARGES'); unarm(); return; }
  if (rcActive() || rc.phase !== 'armed') return;
  if (!S.isLocked) return;
  if (!proto) return;
  if (S.dead || S.won || S.hub || S.paused || S.pvpLobby) { unarm(); return; }

  unmountHand();
  usesLeft--;
  rc.startEye = camera.position.clone();
  rc.startEul = S.euler.clone();

  const fx = -Math.sin(S.euler.y), fz = -Math.cos(S.euler.y);
  rc.x = rc.startEye.x + fx * DEPLOY_DIST;
  rc.z = rc.startEye.z + fz * DEPLOY_DIST;
  rc.yaw = S.euler.y;
  rc.speed = 0;
  rc.t = 0;

  rc.mesh = proto.clone();
  rc.mesh.rotation.y = rc.yaw;
  rc.mesh.position.set(rc.startEye.x + fx * 0.55, rc.startEye.y - 0.2, rc.startEye.z + fz * 0.55);
  scene.add(rc.mesh);

  ensureAudio();
  rc.phase = 'deploying';
}

export function detonateRc() {
  if (rc.phase !== 'driving') return;
  postMat.uniforms.uNoise.value = 0.03;
  postMat.uniforms.uVhs.value = 0.0;
  const pos = new THREE.Vector3(rc.x, rc.y + 0.4, rc.z);
  // ponytail: big RC blast — 18m radius, 900→0 falloff hits everything
  const R = 18, MAX = 900;
  const falloff = function(d) { return d < R ? Math.round(MAX * (1 - d / R)) : 0; };
  ugvList().forEach(function(e) {
    const f = falloff(Math.hypot(e.x - pos.x, e.z - pos.z)); if (f > 0) damageUgv(e.group, f);
  });
  turretList().forEach(function(e) {
    const f = falloff(Math.hypot(e.x - pos.x, e.z - pos.z)); if (f > 0) damageTurret(e.group, f);
  });
  bossList().forEach(function(e) {
    const f = falloff(Math.hypot(e.x - pos.x, e.z - pos.z)); if (f > 0) damageBoss(e.group, Math.round(f * 0.2)); // 80% debuff vs TAT-10 (900→180 max, ~4 hits)
  });
  const dr = droneState();
  if (dr) {
    const f = falloff(Math.hypot(dr.x - pos.x, dr.z - pos.z)); if (f > 0) damageDrone(f);
  }
  // big visual — 2.5× grenade
  explosion();
  const boom = new THREE.PointLight(0xffaa44, 12, 90);
  boom.position.copy(pos);
  scene.add(boom);
  const smoke = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 12), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.5 }));
  smoke.position.copy(pos);
  scene.add(smoke);
  // drive smoke/boom decay (re-use grenades' explosions list via direct timeout)
  let t = 0;
  const tick = function(dt) {
    t += dt;
    const k = t / 1.6;
    smoke.scale.setScalar(1 + k * 5);
    smoke.material.opacity = 0.5 * (1 - k);
    boom.intensity = 12 * (1 - k);
    if (k < 1) requestAnimationFrame(function() { tick(1/60); });
    else { scene.remove(smoke); scene.remove(boom); }
  };
  requestAnimationFrame(function() { tick(1/60); });
  shockwaves.push({ pos: pos.clone(), t0: frameNow, dur: 0.55 });
  // also push a second wider ring for scale
  setTimeout(function() { shockwaves.push({ pos: pos.clone(), t0: frameNow + 0.08, dur: 0.5 }); }, 80);
  killAudio();
  restoreCam();
  removeMesh();
  rc.phase = 'idle';
}

export function rcHud() {
  if (!rcOwned()) return null;
  if (rc.phase === 'armed' || rc.phase === 'deploying' || rc.phase === 'driving') return 'RC CAR';
  return null;
}

function abort() {
  unmountHand();
  if (rc.mesh) removeMesh();
  if (rcActive()) restoreCam();
  killAudio();
  postMat.uniforms.uNoise.value = 0.03;
  postMat.uniforms.uVhs.value = 0.0;
  rc.phase = 'idle';
}

function removeMesh() {
  if (rc.mesh) scene.remove(rc.mesh);
  rc.mesh = null;
}
function restoreCam() {
  if (!rc.startEye || !rc.startEul) return;
  camera.position.copy(rc.startEye);
  S.euler.copy(rc.startEul);
  camera.quaternion.setFromEuler(S.euler);
  rc.startEye = null; rc.startEul = null;
}

function ensureAudio() {
  if (!engineBuf) return;
  if (rc.engine) return;
  const src = actx.createBufferSource();
  src.buffer = engineBuf; src.loop = true;
  const g = actx.createGain(); g.gain.value = 0;
  src.connect(g).connect(actx.destination);
  src.start();
  rc.engine = src; rc.gain = g;
}
function killAudio() {
  if (rc.engine) { try { rc.engine.stop(); } catch(e){} }
  if (rc.gain) { try { rc.gain.disconnect(); } catch(e){} }
  rc.engine = null; rc.gain = null;
}

function easeOut(k) { return 1 - Math.pow(1 - k, 3); }

function updateChase(dt) {
  const fx = -Math.sin(rc.yaw), fz = -Math.cos(rc.yaw);
  const gx = groundHeight(rc.x, rc.z);
  rc.y = gx;
  const targetYaw = rc.yaw;
  // camera behind + above, looking at the RC
  const behindX = rc.x - fx * 3.1;
  const behindZ = rc.z - fz * 3.1;
  const behindY = rc.y + 2.1;
  if (rc.phase !== 'driving') { rc.camX = behindX; rc.camY = behindY; rc.camZ = behindZ; }
  else {
    const k = Math.min(1, dt * 7);
    rc.camX += (behindX - rc.camX) * k;
    rc.camY += (behindY - rc.camY) * k;
    rc.camZ += (behindZ - rc.camZ) * k;
  }
  const cg = groundHeight(rc.camX, rc.camZ) + 0.6;
  if (rc.camY < cg) rc.camY = cg;
  camera.position.set(rc.camX, rc.camY, rc.camZ);

  const dx = rc.x - rc.camX, dy = rc.y + 0.3 - rc.camY, dz = rc.z - rc.camZ;
  const h = Math.hypot(dx, dz);
  S.euler.y = Math.atan2(-dx, -dz);
  S.euler.x = Math.atan2(dy, Math.max(h, 0.001));
  S.euler.z = 0;
  camera.quaternion.setFromEuler(S.euler);
  rc.yaw = targetYaw;
}

export function updateRc(dt, now) {
  if (rc.phase === 'idle' || rc.phase === 'armed') { postMat.uniforms.uNoise.value = 0.03; postMat.uniforms.uVhs.value = 0.0; return; }
  if (S.dead) { abort(); return; }

  if (rc.phase === 'deploying') {
    rc.t += dt;
    const k = easeOut(Math.min(1, rc.t / DEPLOY_TIME));
    const fx = -Math.sin(rc.startEul.y), fz = -Math.cos(rc.startEul.y);
    const heldX = rc.startEye.x + fx * 0.55, heldY = rc.startEye.y - 0.2, heldZ = rc.startEye.z + fz * 0.55;
    const gx = groundHeight(rc.x, rc.z);
    rc.mesh.position.set(
      heldX + (rc.x - heldX) * k,
      heldY + (gx - heldY) * k,
      heldZ + (rc.z - heldZ) * k
    );
    // camera looks down as the car is set on the ground
    const downPitch = -1.0;
    S.euler.y = rc.startEul.y;
    S.euler.x = rc.startEul.x + (downPitch - rc.startEul.x) * k;
    S.euler.z = 0;
    camera.quaternion.setFromEuler(S.euler);
    camera.position.copy(rc.startEye);
    // light VHS while placing (close range)
    {
      const dist = Math.hypot(rc.x - rc.startEye.x, rc.z - rc.startEye.z);
      const k = Math.min(dist / 140, 1);
      postMat.uniforms.uNoise.value = 0.03 + k * 0.22;
      postMat.uniforms.uVhs.value = k * 0.35;
    }
    if (rc.t >= DEPLOY_TIME) {
      rc.mesh.position.set(rc.x, gx, rc.z);
      rc.phase = 'driving';
      rc.camX = camera.position.x; rc.camY = camera.position.y; rc.camZ = camera.position.z;
      showSubtitle('SPACE TO DETONATE');
    }
    return;
  }

  // driving
  const throttle = S.keys['KeyW'] ? 1 : 0;
  const brake = S.keys['KeyS'] ? 1 : 0;
  const steer = (S.keys['KeyD'] ? 1 : 0) - (S.keys['KeyA'] ? 1 : 0);

  if (S.keys['Space']) { detonateRc(); return; }

  rc.yaw += steer * STEER * dt * (Math.abs(rc.speed) > 1 ? 1 : 0.7);
  if (throttle) rc.speed = Math.min(TOP_SPEED, rc.speed + ACCEL * dt);
  else if (brake) rc.speed = Math.max(-REVERSE, rc.speed - ACCEL * 1.3 * dt);
  else rc.speed += (0 - rc.speed) * Math.min(1, DRAG * dt);

  const fx = -Math.sin(rc.yaw), fz = -Math.cos(rc.yaw);
  const vel = { x: fx * rc.speed, z: fz * rc.speed };
  const footY = groundHeight(rc.x, rc.z);
  const res = resolveCollisions(rc.x + vel.x * dt, rc.z + vel.z * dt, vel, footY, footY + 1, 0.45, true);
  if (Math.hypot(res[0] - (rc.x + vel.x * dt), res[1] - (rc.z + vel.z * dt)) > 0.02) rc.speed *= 0.4;
  rc.x = res[0]; rc.z = res[1];

  rc.y = groundHeight(rc.x, rc.z);
  rc.mesh.position.set(rc.x, rc.y, rc.z);
  rc.mesh.rotation.y = rc.yaw;
  rc.mesh.rotation.x = 0; rc.mesh.rotation.z = 0;

  // speed feel: mild fov punch + shake
  const spdK = Math.min(1, Math.abs(rc.speed) / TOP_SPEED);
  S.fovPunch = Math.min(S.fovPunch + spdK * 3.5, 14);

  updateChase(dt);
  // ponytail: fancy VHS (glitch-core vhs+scanlines+grain) — strength = distance, from samplemaple/glitch-core (MIT)
  {
    const dist = Math.hypot(rc.x - rc.startEye.x, rc.z - rc.startEye.z);
    const k = Math.min(dist / 140, 1);
    postMat.uniforms.uNoise.value = 0.03 + k * 0.28 + (Math.random() * 0.015 * k);
    postMat.uniforms.uVhs.value = k * 0.95;
  }

  if (rc.gain && rc.engine) {
    const p = 1.45 + spdK * 0.75;
    rc.engine.playbackRate.value += (p - rc.engine.playbackRate.value) * dt * 6;
    const want = 0.12 + spdK * 0.5 + (throttle ? 0.2 : 0);
    rc.gain.gain.value += (want - rc.gain.gain.value) * dt * 5;
    if (actx.state === 'suspended') actx.resume();
  }
}
