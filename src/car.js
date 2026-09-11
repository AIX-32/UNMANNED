import { scene, camera } from './core.js';
import { S } from './state.js';
import { actx } from './audio.js';
import { groundHeight, resolveCollisions, MAP_SPAWNS } from './world.js';
import { showSubtitle, syncHudPositions } from './ui.js';
import { damagePlayer, heardShot, damageUgv, ugvList } from './ugv.js';
import { setFiring } from './weapons.js';



const IDLE_RPM = 800, REDLINE = 5800, REV_EXTRA = 200;
const INERTIA = 0.22;
const FINAL_DRIVE = 3.72;
const GEARS = [3.82, 2.21, 1.52, 1.08, 0.82];
const WHEEL_R = 0.33;
const MASS = 820;
const SHIFT_UP = 5200, SHIFT_DOWN = 1800;
const STEER_SPEED = 1.8;
const ENGINE_BRAKE = 0.12;


const CURVE = [
  [0, 0], [500, 22], [800, 58], [1500, 110], [2500, 165], [3500, 195], [4500, 185], [5500, 160], [6000, 120], [7000, 60]
];
function torqueAt(rpm) {
  if (rpm <= CURVE[0][0]) return CURVE[0][1];
  for (let i = 0; i < CURVE.length - 1; i++) {
    const a = CURVE[i], b = CURVE[i + 1];
    if (rpm >= a[0] && rpm <= b[0]) {
      const t = (rpm - a[0]) / (b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return CURVE[CURVE.length - 1][1];
}

let buggyProto = null, buggyBox = null;
const cars = [];
let engineBuf = null;
let drivingIdx = -1;
const AO_TEX = new THREE.TextureLoader().load('assets/textures/buggy_ao.png');
AO_TEX.encoding = THREE.LinearEncoding;


const loader = new THREE.GLTFLoader();
loader.load('assets/models/buggy.gltf', function(gltf) {
  buggyProto = gltf.scene;
  buggyProto.traverse(function(o) {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;

      if (!o.material.map) { o.material.map = AO_TEX; o.material.needsUpdate = true; }
      o.material.map.encoding = THREE.LinearEncoding;
    }
  });
  buggyProto.updateMatrixWorld(true);
  buggyBox = new THREE.Box3().setFromObject(buggyProto);
  spawnCars();
});
fetch('assets/audio/buggy_engine.mp3').then(r => r.arrayBuffer()).then(b => actx.decodeAudioData(b)).then(b => { engineBuf = b; });
let hornBuf = null; let lastHonk = 0;
fetch('assets/audio/car_horn.mp3').then(r => r.arrayBuffer()).then(b => actx.decodeAudioData(b)).then(b => { hornBuf = b; });
function honk() {
  const now = performance.now();
  if (now - lastHonk < 650) return;
  lastHonk = now;
  if (hornBuf && actx.state !== 'suspended') {
    const src = actx.createBufferSource(); src.buffer = hornBuf;
    const g = actx.createGain(); g.gain.value = 0.9;
    src.connect(g).connect(actx.destination); src.start();
  } else if (actx.state === 'suspended') actx.resume();
  heardShot();
  showSubtitle('HONK!');
}

function newCar(x, z, yaw) {
  cars.push({
    x, z, yaw, pitch: 0, roll: 0, vx: 0, vz: 0, speed: 0,
    rpm: IDLE_RPM, boost: 0, gear: 0, throttle: 0, brake: 0,
    mesh: null, baseY: 0, audio: null, gain: null,
    wheelSpin: 0, py: 0, vy: 0, airborne: false, wheels: null, yawVel: 0, crashCd: -10
  });
}

let mapReady = false;
export function setCarMapReady() { mapReady = true; spawnCars(); }
export function spawnCars() {
  if (!mapReady) return;

  cars.forEach(function(c) { if (c.mesh) scene.remove(c.mesh); if (c.audio) try { c.audio.stop(); } catch(e){} });
  cars.length = 0; drivingIdx = -1; hidePrompt();
  (MAP_SPAWNS.cars || []).forEach(function(s) { newCar(s.x, s.z, THREE.MathUtils.degToRad(s.rotY || 0)); });
  if (!buggyProto) return;
  bake();
}
function bake() {
  if (!buggyProto) return;
  cars.forEach(function(c) {
    if (c.mesh) return;
    const m = buggyProto.clone();
    const sc = 1.0;
    m.scale.setScalar(sc);
    m.rotation.y = c.yaw;
    m.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(m);
    c.baseY = -bb.min.y;
    c.mesh = m;
    c.py = groundHeight(c.x, c.z) + c.baseY;
    c.vy = 0; c.airborne = false;

    c.wheels = [];
    const wgrp = m.getObjectByName('wheels');
    if (wgrp) wgrp.traverse(function(o){ if (o.isMesh) c.wheels.push(o); });
    else m.traverse(function(o){ if (o.isMesh && o.name === 'cylinder') c.wheels.push(o); });
    m.position.set(c.x, c.py, c.z);

    m.traverse(function(o){ o.userData.car = true; });
    scene.add(m);
  });
}

export function isDriving() { return drivingIdx >= 0; }
export function drivingCar() { return drivingIdx >= 0 ? cars[drivingIdx] : null; }


function ensureAudio(c) {
  if (!engineBuf || !actx) return;
  if (c.audio) return;
  const src = actx.createBufferSource();
  src.buffer = engineBuf; src.loop = true;
  const g = actx.createGain(); g.gain.value = 0;
  src.connect(g).connect(actx.destination);
  src.start();
  c.audio = src; c.gain = g;
}
function killAudio(c) {
  if (!c.audio) return;
  try { c.audio.stop(); } catch(e){}
  try { c.gain.disconnect(); } catch(e){}
  c.audio = null; c.gain = null;
}

function nearestCar(maxD) {
  let best = -1, bd = maxD;
  for (let i = 0; i < cars.length; i++) {
    const d = Math.hypot(camera.position.x - cars[i].x, camera.position.z - cars[i].z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

let promptShown = false;
let lastPromptAt = 0;
function showPrompt() {
  const now = performance.now();
  if (now - lastPromptAt < 2500) return;
  lastPromptAt = now;
  showSubtitle('[F] DRIVE');
  promptShown = true;
}
function hidePrompt() { promptShown = false; }

export function tryEnterCar() {
  if (isDriving() || S.dead || S.won || S.hub) return false;
  const idx = nearestCar(3.2);
  if (idx < 0) return false;
  enter(idx);
  return true;
}
function enter(idx) {
  drivingIdx = idx;
  const c = cars[idx];
  ensureAudio(c);
  S.prone = false; S.supine = false; S.ads = false;
  hidePrompt();
  setFiring(false);
  S.euler.y = c.yaw;
  camera.position.set(c.x, groundHeight(c.x, c.z) + 1.15, c.z);
  if (typeof S.carDriving !== 'undefined') S.carDriving = true;
}

export function exitCar() {
  if (!isDriving()) return;
  const c = cars[drivingIdx];
  const sp = Math.abs(c.speed);

  if (sp > 5) {
    const dmg = Math.min(20, Math.round((sp - 5) * 2.4));
    damagePlayer(dmg, { x: c.x, y: c.py, z: c.z });
    showSubtitle('BAIL DAMAGE -' + dmg + ' HP');
  }

  const off = 1.9;
  const sx = c.x + Math.cos(c.yaw) * off;
  const sz = c.z - Math.sin(c.yaw) * off;
  const gy = groundHeight(sx, sz) + 1.7;
  camera.position.set(sx, gy, sz);
  drivingIdx = -1;
  if (typeof S.carDriving !== 'undefined') S.carDriving = false;
}

function hillSlope(c) {
  const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
  const ah = groundHeight(c.x + fx * 0.6, c.z + fz * 0.6);
  const bh = groundHeight(c.x - fx * 0.6, c.z - fz * 0.6);
  return Math.atan2(ah - bh, 1.2);
}

function updateEngine(c, dt, throttle, brake) {

  c.boost += (throttle - c.boost) * dt * 2.0;
  let maxTq = torqueAt(c.rpm);
  let engineTq = maxTq * throttle * (1 + c.boost * 0.5);


  if (c.rpm > REDLINE + REV_EXTRA) engineTq = 0;
  else if (c.rpm > REDLINE) engineTq *= 1 - (c.rpm - REDLINE) / REV_EXTRA;


  const v = Math.abs(c.speed);
  const aero = 0.36 * v * v;
  const rolling = 14 + v * 3.2;
  const slope = hillSlope(c);
  const hill = MASS * 9.81 * Math.sin(slope) * 0.015;
  const wheelResist = aero + rolling + hill;
  let wheelLoad = wheelResist * WHEEL_R;

  if (brake > 0) wheelLoad += brake * 420;

  const gearRatio = GEARS[c.gear];
  let engineLoad = wheelLoad / (gearRatio * FINAL_DRIVE);

  if (v < 0.4 && throttle < 0.05) engineLoad *= 0.2;


  let clutchOpen = false;
  if (v < 1.0 && c.gear === 0 && brake < 0.1) {

    engineLoad *= Math.max(0, v / 1.0);
    if (v < 0.35) clutchOpen = true;
  }

  const net = engineTq - (clutchOpen ? 0 : engineLoad);
  const angAccel = net / INERTIA;


  c.rpm += angAccel * dt * 19;

  if (c.rpm < 0) c.rpm = 0;

  if (throttle < 0.01 && c.rpm < IDLE_RPM) {
    c.rpm += (IDLE_RPM - c.rpm) * dt * 5;
    if (c.rpm < IDLE_RPM * 0.55 && !clutchOpen) { c.rpm = IDLE_RPM; }
  }
  c.rpm = Math.max(0, Math.min(7000, c.rpm));


  if (c.rpm > SHIFT_UP && c.gear < GEARS.length - 1) {
    c.gear++; c.rpm = Math.max(IDLE_RPM, (c.speed / WHEEL_R) * (GEARS[c.gear] * FINAL_DRIVE) * 9.55);
  } else if (c.rpm < SHIFT_DOWN && c.gear > 0 && v > 1.2) {

    const downRpm = (c.speed / WHEEL_R) * (GEARS[c.gear - 1] * FINAL_DRIVE) * 9.55;
    if (downRpm < REDLINE) { c.gear--; c.rpm = downRpm; }
    else { c.rpm = REDLINE; }
  }

  if (!clutchOpen && v > 1.0) {
    const wheelRpm = (v / WHEEL_R) * 9.55;
    const target = wheelRpm * GEARS[c.gear] * FINAL_DRIVE;
    c.rpm += (target - c.rpm) * dt * 3.5;
  }


  const outTq = net * gearRatio * FINAL_DRIVE;
  return outTq;
}

export function updateCars(dt, now) {
  if (S.dead) {
    for (let i = 0; i < cars.length; i++) killAudio(cars[i]);
    hidePrompt();
    return;
  }

  if (!isDriving() && !S.hub && !S.won && !S.paused) {
    const idx = nearestCar(3.2);
    if (idx >= 0) showPrompt(); else hidePrompt();
  } else hidePrompt();

  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    if (!c.mesh) continue;
    if (i !== drivingIdx) {

      c.rpm += (IDLE_RPM - c.rpm) * dt * 2;
      if (c.gain) {
        const want = 0;
        c.gain.gain.value += (want - c.gain.gain.value) * dt * 4;
        c.audio.playbackRate.value += (0.55 - c.audio.playbackRate.value) * dt * 3;
      }

      if (Math.abs(c.speed) > 0.12) {
        const drag = 0.52 + Math.abs(c.speed) * 0.11;
        c.speed -= Math.sign(c.speed) * drag * dt;
        if (Math.abs(c.speed) < 0.12) c.speed = 0;
        const fx0 = -Math.sin(c.yaw), fz0 = -Math.cos(c.yaw);
        const vel0 = { x: fx0 * c.speed, z: fz0 * c.speed };
        const footY0 = groundHeight(c.x, c.z);
        const res0 = resolveCollisions(c.x + vel0.x * dt, c.z + vel0.z * dt, vel0, footY0, footY0 + 1.9, 1.55, true);
        if (Math.hypot(res0[0] - (c.x + vel0.x * dt), res0[1] - (c.z + vel0.z * dt)) > 0.02) c.speed *= 0.5;
        c.x = res0[0]; c.z = res0[1];

        const rx0 = Math.cos(c.yaw), rz0 = -Math.sin(c.yaw);
        const hl0 = 1.3, hw0 = 0.95;
        const hF0 = groundHeight(c.x + fx0 * hl0, c.z + fz0 * hl0);
        const hB0 = groundHeight(c.x - fx0 * hl0, c.z - fz0 * hl0);
        const hR0 = groundHeight(c.x + rx0 * hw0, c.z + rz0 * hw0);
        const hL0 = groundHeight(c.x - rx0 * hw0, c.z - rz0 * hw0);
        c.pitch += (Math.atan2(hF0 - hB0, hl0 * 2) - c.pitch) * Math.min(1, dt * 9);
        c.roll += (Math.atan2(hR0 - hL0, hw0 * 2) - c.roll) * Math.min(1, dt * 9);
        const gh0 = groundHeight(c.x, c.z) + c.baseY;
        c.py = gh0;
        c.mesh.position.set(c.x, gh0, c.z);
        c.mesh.rotation.set(c.pitch, c.yaw, c.roll);

        const ang0 = c.speed * dt / WHEEL_R;
        if (c.wheels) for (let wi = 0; wi < c.wheels.length; wi++) c.wheels[wi].rotateY(-ang0);
        continue;
      }

      const gh = groundHeight(c.x, c.z) + c.baseY;
      c.py = gh; c.vy = 0; c.airborne = false;
      c.mesh.position.set(c.x, gh, c.z);
      c.mesh.rotation.y = c.yaw;
      continue;
    }

    ensureAudio(c);
    if (S.keys['Space']) honk();
    const throttle = S.keys['KeyW'] ? 1 : 0;
    const brake = S.keys['KeyS'] ? 1 : 0;
    const steer = (S.keys['KeyA'] ? 1 : 0) - (S.keys['KeyD'] ? 1 : 0);


    const absSp = Math.abs(c.speed);
    const grip = THREE.MathUtils.clamp(1 - absSp * 0.045, 0.32, 1);
    const steerTarget = steer * STEER_SPEED * grip * (c.airborne ? 0.22 : 1) * (absSp < 0.8 ? 0.55 : 1);

    c.yawVel += (steerTarget - c.yawVel) * Math.min(1, dt * 5.5);
    c.yawVel *= Math.pow(0.35, dt);

    let yawAdd = c.yawVel * dt;
    if (absSp < 0.6 && steer) yawAdd += steer * 0.45 * dt;
    c.yaw += yawAdd;

    const outTq = updateEngine(c, dt, throttle, brake);

    const driveForce = outTq / WHEEL_R;
    let accel = driveForce / MASS * 3.2;

    const drag = 0.14 + Math.abs(c.speed) * 0.045;
    accel -= Math.sign(c.speed) * drag;
    if (brake > 0) accel -= Math.sign(c.speed || 1) * brake * 4.2;
    if (!throttle && Math.abs(c.speed) < 0.15) accel -= c.speed * 8;

    c.speed += accel * dt;

    c.speed = THREE.MathUtils.clamp(c.speed, -9, 22);
    if (!throttle && !brake && Math.abs(c.speed) < 0.05) c.speed = 0;


    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    const vel = { x: fx * c.speed, z: fz * c.speed };
    const footY = groundHeight(c.x, c.z);
    const res = resolveCollisions(c.x + vel.x * dt, c.z + vel.z * dt, vel, footY, footY + 1.9, 1.55, true);
    const nx = res[0], nz = res[1];

    if (Math.hypot(nx - (c.x + vel.x * dt), nz - (c.z + vel.z * dt)) > 0.02) c.speed *= 0.55;
    c.x = nx; c.z = nz;


    const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
    const hl = 1.3, hw = 0.95;
    const hF = groundHeight(c.x + fx * hl, c.z + fz * hl);
    const hB = groundHeight(c.x - fx * hl, c.z - fz * hl);
    const hR = groundHeight(c.x + rx * hw, c.z + rz * hw);
    const hL = groundHeight(c.x - rx * hw, c.z - rz * hw);
    const targetPitch = Math.atan2(hF - hB, hl * 2);
    const targetRoll = Math.atan2(hR - hL, hw * 2);
    const k = Math.min(1, dt * 9);
    c.pitch += (targetPitch - c.pitch) * k;
    c.roll += (targetRoll - c.roll) * k;


    const wh = [
      groundHeight(c.x + fx*hl + rx*hw, c.z + fz*hl + rz*hw),
      groundHeight(c.x + fx*hl - rx*hw, c.z + fz*hl - rz*hw),
      groundHeight(c.x - fx*hl + rx*hw, c.z - fz*hl + rz*hw),
      groundHeight(c.x - fx*hl - rx*hw, c.z - fz*hl - rz*hw)
    ];
    const wheelNeed = Math.max(...wh) + c.baseY + 0.06;


    const gh2 = Math.max(groundHeight(c.x, c.z) + c.baseY, wheelNeed);

    if (!c.airborne && c.speed > 7 && c.vy > 0.2 && gh2 < c.py - 0.06) {
      c.airborne = true;
    }
    if (c.airborne) {
      c.vy -= 20 * dt;
      c.py += c.vy * dt;
      if (c.py <= gh2) {
        const impact = Math.abs(c.vy);
        if (impact > 4) { S.shakeX += (Math.random()-0.5)*0.02*impact; S.shakeY += (Math.random()-0.5)*0.02*impact; S.fovPunch = Math.min(S.fovPunch + impact*0.6, 14); }
        c.py = gh2; c.vy = 0; c.airborne = false;
      }
    } else {

      const needVy = (gh2 - c.py) / Math.max(dt, 0.001);

      c.vy += (needVy - c.vy) * Math.min(1, dt * 12);
      c.vy = THREE.MathUtils.clamp(c.vy, -12, 12);
      c.py = gh2;

      if (c.speed > 7 && c.vy > 2.5) {                          }
      else if (Math.abs(c.vy) < 0.05) c.vy *= 0.85;
    }

    if (now - c.crashCd > 0.65) {
      const ul = ugvList();
      for (let ui = 0; ui < ul.length; ui++) {
        const u = ul[ui];
        if (Math.hypot(c.x - u.x, c.z - u.z) < 3.1) {
          const spAbs = Math.abs(c.speed);
          if (spAbs > 2.5) {
            const dmgUgv = Math.min(250, Math.round(spAbs * 14));
            const dmgYou = Math.min(20, Math.round(spAbs * 0.9));
            damageUgv(u.group, dmgUgv);
            damagePlayer(dmgYou, { x: u.x, y: 1.5, z: u.z });
            S.shakeX += (Math.random()-0.5)*0.04*dmgYou; S.shakeY += (Math.random()-0.5)*0.04*dmgYou;
            S.fovPunch = Math.min(S.fovPunch + dmgYou*0.35, 14);
            c.speed *= 0.42;
            c.crashCd = now;
            showSubtitle('CRASH -' + dmgYou + ' HP');
            break;
          }
        }
      }
    }
    c.mesh.position.set(c.x, c.py, c.z);
    c.mesh.rotation.set(c.pitch, c.yaw, c.roll);


    camera.position.set(c.x, c.py + (1.55 - c.baseY), c.z);
    camera.quaternion.setFromEuler(S.euler);
    syncHudPositions();


    if (c.gain && c.audio) {
      const pitch = 0.55 + (c.rpm / IDLE_RPM) * 0.42;
      c.audio.playbackRate.value += (pitch - c.audio.playbackRate.value) * dt * 6;
      const load = THREE.MathUtils.clamp(outTq / 260, 0, 1);
      const tgtVol = 0.08 + throttle * 0.32 + load * 0.28 + (c.rpm / REDLINE) * 0.22;
      const want = THREE.MathUtils.clamp(tgtVol, 0, 0.85);

      c.gain.gain.value += (want - c.gain.gain.value) * dt * 5;
      if (actx.state === 'suspended') actx.resume();
    }


    const ang = c.speed * dt / WHEEL_R;
    c.wheelSpin += ang;
    if (c.wheels) for (let wi = 0; wi < c.wheels.length; wi++) c.wheels[wi].rotateY(-ang);
  }
}

export function carCount(){ return cars.length; }
export function resetCars(){

}

window.__gaultCars = cars;
