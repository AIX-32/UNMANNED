import { scene, camera } from './core.js';
import { S } from './state.js';
import { actx } from './audio.js';
import { groundHeight, resolveCollisions, MAP_SPAWNS } from './world.js';
import { showSubtitle, syncHudPositions } from './ui.js';
import { damagePlayer, heardShot, damageUgv, ugvList } from './ugv.js';
import { setFiring } from './weapons.js';

// ponytail: semi-sim engine per blueprint — RPM is output of torque vs load

const IDLE_RPM = 800, REDLINE = 5800, REV_EXTRA = 200;
const INERTIA = 0.22; // sporty
const FINAL_DRIVE = 3.72;
const GEARS = [3.82, 2.21, 1.52, 1.08, 0.82]; // 5 speed
const WHEEL_R = 0.33;
const MASS = 820;
const SHIFT_UP = 5200, SHIFT_DOWN = 1800;
const STEER_SPEED = 1.8;
const ENGINE_BRAKE = 0.12;

// torque curve: RPM -> Nm (normalized game units)
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

// load model + sound
const loader = new THREE.GLTFLoader();
loader.load('assets/models/buggy.gltf', function(gltf) {
  buggyProto = gltf.scene;
  buggyProto.traverse(function(o) {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      // ponytail: buggy OBJs have no mtl — use AO texture if present, else flat
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
  heardShot(); // ponytail: reuses existing UGV hear logic — attracts up to RUSH_RANGE
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
  // clear old meshes/cars on every map load
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
    // collect 4 cylinder wheels (under 'wheels' group)
    c.wheels = [];
    const wgrp = m.getObjectByName('wheels');
    if (wgrp) wgrp.traverse(function(o){ if (o.isMesh) c.wheels.push(o); });
    else m.traverse(function(o){ if (o.isMesh && o.name === 'cylinder') c.wheels.push(o); });
    m.position.set(c.x, c.py, c.z);
    // tag for raycast ignore?
    m.traverse(function(o){ o.userData.car = true; });
    scene.add(m);
  });
}

export function isDriving() { return drivingIdx >= 0; }
export function drivingCar() { return drivingIdx >= 0 ? cars[drivingIdx] : null; }

// audio helpers per car
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
  // high-speed bail does damage — scales 0 at 5 m/s → ~40 at 22 m/s
  if (sp > 5) {
    const dmg = Math.min(20, Math.round((sp - 5) * 2.4));
    damagePlayer(dmg, { x: c.x, y: c.py, z: c.z });
    showSubtitle('BAIL DAMAGE -' + dmg + ' HP');
  }
  // keep momentum after hop-off (coasts to stop via drag)
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
  return Math.atan2(ah - bh, 1.2); // rad
}

function updateEngine(c, dt, throttle, brake) {
  // turbo lag
  c.boost += (throttle - c.boost) * dt * 2.0;
  let maxTq = torqueAt(c.rpm);
  let engineTq = maxTq * throttle * (1 + c.boost * 0.5);

  // rev limiter fuel cut
  if (c.rpm > REDLINE + REV_EXTRA) engineTq = 0;
  else if (c.rpm > REDLINE) engineTq *= 1 - (c.rpm - REDLINE) / REV_EXTRA;

  // load from wheels: aero + rolling + hill
  const v = Math.abs(c.speed);
  const aero = 0.36 * v * v; // CdA approx
  const rolling = 14 + v * 3.2;
  const slope = hillSlope(c);
  const hill = MASS * 9.81 * Math.sin(slope) * 0.015; // scaled down for feel
  const wheelResist = aero + rolling + hill;
  let wheelLoad = wheelResist * WHEEL_R;
  // brake adds load
  if (brake > 0) wheelLoad += brake * 420;
  // if nearly stopped and throttle 0, small load so engine drops
  const gearRatio = GEARS[c.gear];
  let engineLoad = wheelLoad / (gearRatio * FINAL_DRIVE);
  // when car is slow and gear high, increase load slightly to simulate stall tendency
  if (v < 0.4 && throttle < 0.05) engineLoad *= 0.2;

  // auto clutch at very low speed in 1st: disconnect partially to avoid stall
  let clutchOpen = false;
  if (v < 1.0 && c.gear === 0 && brake < 0.1) {
    // let rpm free a bit
    engineLoad *= Math.max(0, v / 1.0);
    if (v < 0.35) clutchOpen = true;
  }

  const net = engineTq - (clutchOpen ? 0 : engineLoad);
  const angAccel = net / INERTIA;
  // convert: torque (Nm) / inertia -> rad/s^2 -> rpm
  // 1 Nm / 0.22 = 4.54 rad/s2 = 43 rpm/s per Nm — scaled for feel
  c.rpm += angAccel * dt * 19;
  // clamp and stall
  if (c.rpm < 0) c.rpm = 0;
  // idle governor
  if (throttle < 0.01 && c.rpm < IDLE_RPM) {
    c.rpm += (IDLE_RPM - c.rpm) * dt * 5;
    if (c.rpm < IDLE_RPM * 0.55 && !clutchOpen) { c.rpm = IDLE_RPM; }
  }
  c.rpm = Math.max(0, Math.min(7000, c.rpm));

  // auto shift
  if (c.rpm > SHIFT_UP && c.gear < GEARS.length - 1) {
    c.gear++; c.rpm = Math.max(IDLE_RPM, (c.speed / WHEEL_R) * (GEARS[c.gear] * FINAL_DRIVE) * 9.55);
  } else if (c.rpm < SHIFT_DOWN && c.gear > 0 && v > 1.2) {
    // don't downshift if would over-rev
    const downRpm = (c.speed / WHEEL_R) * (GEARS[c.gear - 1] * FINAL_DRIVE) * 9.55;
    if (downRpm < REDLINE) { c.gear--; c.rpm = downRpm; }
    else { c.rpm = REDLINE; }
  }
  // keep rpm linked loosely when clutch engaged and moving
  if (!clutchOpen && v > 1.0) {
    const wheelRpm = (v / WHEEL_R) * 9.55; // rad/s to rpm
    const target = wheelRpm * GEARS[c.gear] * FINAL_DRIVE;
    c.rpm += (target - c.rpm) * dt * 3.5;
  }

  // output torque to wheels
  const outTq = net * gearRatio * FINAL_DRIVE;
  return outTq;
}

export function updateCars(dt, now) {
  if (S.dead) { // ponytail: cut engine instantly on death
    for (let i = 0; i < cars.length; i++) killAudio(cars[i]);
    hidePrompt();
    return;
  }
  // prompt when on foot near car — use subtitle bar
  if (!isDriving() && !S.hub && !S.won && !S.paused) {
    const idx = nearestCar(3.2);
    if (idx >= 0) showPrompt(); else hidePrompt();
  } else hidePrompt();

  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    if (!c.mesh) continue;
    if (i !== drivingIdx) {
      // idle audio fade + keep rpm at idle
      c.rpm += (IDLE_RPM - c.rpm) * dt * 2;
      if (c.gain) {
        const want = 0;
        c.gain.gain.value += (want - c.gain.gain.value) * dt * 4;
        c.audio.playbackRate.value += (0.55 - c.audio.playbackRate.value) * dt * 3;
      }
      // coast even when empty — a bit faster bleed than before
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
        // follow terrain (no flight when empty, just stick)
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
        // spin wheels with coast speed
        const ang0 = c.speed * dt / WHEEL_R;
        if (c.wheels) for (let wi = 0; wi < c.wheels.length; wi++) c.wheels[wi].rotateY(-ang0);
        continue;
      }
      // park on ground, slight pitch/roll from terrain
      const gh = groundHeight(c.x, c.z) + c.baseY;
      c.py = gh; c.vy = 0; c.airborne = false;
      c.mesh.position.set(c.x, gh, c.z);
      c.mesh.rotation.y = c.yaw;
      continue;
    }
    // driving this car
    ensureAudio(c);
    if (S.keys['Space']) honk(); // ponytail: Space = horn in car (attracts UGVs), not brake
    const throttle = S.keys['KeyW'] ? 1 : 0;
    const brake = S.keys['KeyS'] ? 1 : 0;
    const steer = (S.keys['KeyA'] ? 1 : 0) - (S.keys['KeyD'] ? 1 : 0);

    // less arcady: weighty steering with speed-sensitive grip and yaw inertia
    const absSp = Math.abs(c.speed);
    const grip = THREE.MathUtils.clamp(1 - absSp * 0.045, 0.32, 1); // high speed = less steer
    const steerTarget = steer * STEER_SPEED * grip * (c.airborne ? 0.22 : 1) * (absSp < 0.8 ? 0.55 : 1);
    // yaw accel limited, damp like mass
    c.yawVel += (steerTarget - c.yawVel) * Math.min(1, dt * 5.5);
    c.yawVel *= Math.pow(0.35, dt); // decay when no input
    // at very low speed allow in-place pivot but slow
    let yawAdd = c.yawVel * dt;
    if (absSp < 0.6 && steer) yawAdd += steer * 0.45 * dt;
    c.yaw += yawAdd;

    const outTq = updateEngine(c, dt, throttle, brake);
    // longitudinal accel from engine torque -> force at wheels
    const driveForce = outTq / WHEEL_R; // N (scaled)
    let accel = driveForce / MASS * 3.2; // game scale
    // drag/brake
    const drag = 0.14 + Math.abs(c.speed) * 0.045;
    accel -= Math.sign(c.speed) * drag;
    if (brake > 0) accel -= Math.sign(c.speed || 1) * brake * 4.2;
    if (!throttle && Math.abs(c.speed) < 0.15) accel -= c.speed * 8; // settle

    c.speed += accel * dt;
    // cap
    c.speed = THREE.MathUtils.clamp(c.speed, -9, 22);
    if (!throttle && !brake && Math.abs(c.speed) < 0.05) c.speed = 0;

    // integrate position — use resolveCollisions like UGV
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    const vel = { x: fx * c.speed, z: fz * c.speed };
    const footY = groundHeight(c.x, c.z);
    const res = resolveCollisions(c.x + vel.x * dt, c.z + vel.z * dt, vel, footY, footY + 1.9, 1.55, true);
    const nx = res[0], nz = res[1];
    // if collided hard, scrub speed
    if (Math.hypot(nx - (c.x + vel.x * dt), nz - (c.z + vel.z * dt)) > 0.02) c.speed *= 0.55;
    c.x = nx; c.z = nz;

    // terrain pitch/roll — tighter so visuals match collision, no clip
    const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
    const hl = 1.3, hw = 0.95;
    const hF = groundHeight(c.x + fx * hl, c.z + fz * hl);
    const hB = groundHeight(c.x - fx * hl, c.z - fz * hl);
    const hR = groundHeight(c.x + rx * hw, c.z + rz * hw);
    const hL = groundHeight(c.x - rx * hw, c.z - rz * hw);
    const targetPitch = Math.atan2(hF - hB, hl * 2);
    const targetRoll = Math.atan2(hR - hL, hw * 2);
    const k = Math.min(1, dt * 9); // ponytail: was 4, too laggy → corners dipped
    c.pitch += (targetPitch - c.pitch) * k;
    c.roll += (targetRoll - c.roll) * k;

    // wheel-corner clearance — keep lowest wheel above ground so chassis doesn't clip
    const wh = [
      groundHeight(c.x + fx*hl + rx*hw, c.z + fz*hl + rz*hw),
      groundHeight(c.x + fx*hl - rx*hw, c.z + fz*hl - rz*hw),
      groundHeight(c.x - fx*hl + rx*hw, c.z - fz*hl + rz*hw),
      groundHeight(c.x - fx*hl - rx*hw, c.z - fz*hl - rz*hw)
    ];
    const wheelNeed = Math.max(...wh) + c.baseY + 0.06; // 6cm hover so smoothed pitch doesn't dig

    // vertical physics — fly off ramps/crests
    const gh2 = Math.max(groundHeight(c.x, c.z) + c.baseY, wheelNeed);
    // launch off crest: was climbing fast, now crest flattens/drops
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
      // follow ground vert, but keep upward momentum for next-frame launch check
      const needVy = (gh2 - c.py) / Math.max(dt, 0.001);
      // lerp vertical speed toward terrain slope so crest builds upward vy
      c.vy += (needVy - c.vy) * Math.min(1, dt * 12);
      c.vy = THREE.MathUtils.clamp(c.vy, -12, 12);
      c.py = gh2;
      // hard crest boost: speed up a slope stores lift
      if (c.speed > 7 && c.vy > 2.5) { /* keep vy for launch */ }
      else if (Math.abs(c.vy) < 0.05) c.vy *= 0.85;
    }
    // crash into UGVs — damages them and you (0.65s cooldown) # ponytail: now is clock seconds, not ms
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
            c.speed *= 0.42; // slam slows car
            c.crashCd = now;
            showSubtitle('CRASH -' + dmgYou + ' HP');
            break;
          }
        }
      }
    }
    c.mesh.position.set(c.x, c.py, c.z);
    c.mesh.rotation.set(c.pitch, c.yaw, c.roll);

    // camera in middle — higher for see-over-dash, rides with car
    camera.position.set(c.x, c.py + (1.55 - c.baseY), c.z);
    camera.quaternion.setFromEuler(S.euler);
    syncHudPositions(); // ponytail: no lerp, snap HUD every frame while driving so it doesn't trail

    // audio: pitch by rpm, volume by load/throttle
    if (c.gain && c.audio) {
      const pitch = 0.55 + (c.rpm / IDLE_RPM) * 0.42;
      c.audio.playbackRate.value += (pitch - c.audio.playbackRate.value) * dt * 6;
      const load = THREE.MathUtils.clamp(outTq / 260, 0, 1);
      const tgtVol = 0.08 + throttle * 0.32 + load * 0.28 + (c.rpm / REDLINE) * 0.22;
      const want = THREE.MathUtils.clamp(tgtVol, 0, 0.85);
      // quieter/slower when not pushing: throttle 0 => ~0.08
      c.gain.gain.value += (want - c.gain.gain.value) * dt * 5;
      if (actx.state === 'suspended') actx.resume();
    }

    // wheel spin — 4 cylinders, speed-matched rolling # ponytail: local Y is axle after -90Z, invert so forward drag rolls forward
    const ang = c.speed * dt / WHEEL_R; // rad = v*dt / r
    c.wheelSpin += ang;
    if (c.wheels) for (let wi = 0; wi < c.wheels.length; wi++) c.wheels[wi].rotateY(-ang);
  }
}

export function carCount(){ return cars.length; }
export function resetCars(){
  // called on map reset externally via spawnCars
}

window.__gaultCars = cars;
