

import { scene, camera, gunScene, postMat, renderFrame, renderer } from './core.js';
import { perf, perfMark, perfEnd, perfFrameStart, perfFrameEnd, perfSetDraws, perfSetCounts } from './perf.js';
import { S, GUN_POS, GUN_ROT, ADS_POS, ADS_ROT, recoilPivot, inGun, takeLook } from './state.js';
import { updateFiring, hudInfo, flashSync, FLASH, FLASH_DEBUG, curWeaponName, getGunModel, flash, getMuzzleFlash, reloadK, switchK, getWorldFlash, updateLandingMarker, wgsSpeedBoost, weaponSpeedMul, bashRot, bashThrust, viewPos, viewRot, updateBoxUse, cancelBox, boxDip, boxUseInfo, brainTargetPos } from './weapons.js';
import { updateAmmoUI, updateHpUI, updateCcUI, updateRadarUI, updateGrenadeUI, updatePvpHud, updateHudVisibility, setHpFlash, showDeathScreen, hideDeathBoard, flashDbg, placeUIPanels, showSubtitle, updateSubtitle, placeBossHud, placeMissionHud, updateMissionHud, updateBoxBar, hideBoxBar, requestGameLock } from './ui.js';
import { resolveCollisions, supportHeight, groundHeight, MAP_SPAWNS, updateHealthBoxes, atExtract, updateRadios, radiosPlaced, radiosLeft, updateGrassCull, updateGrassCullWorker, updateRain, updateRainWorker, pointInCollider } from './world.js';
import { hasWorkers, workerCount } from './parallel.js';
import { updateUgv, allUgvsDead, ugvCount, lowerCert as ugvLowerCert } from './ugv.js';
import { updateTurrets, allTurretsDead, turretCount, lowerCert as turretLowerCert } from './turret.js';
import { updateDrone, lowerCert as droneLowerCert } from './drone.js';
import { updateBoss, allBossesDead, bossCount, lowerCert as bossLowerCert } from './boss.js';
import { updateGrenades } from './grenades.js';
import { updateCml } from './cml.js';
import { updateIdent } from './ident.js';
import { updateRadar } from './radar.js';
import { updatePvp } from './pvp.js';
import { updateCars, isDriving, exitCar } from './car.js';
import { updateTanks, isTankDriving, exitTank, tankShoot, hideAim as hideTankAim } from './tank.js';
import { updateRc, rcActive, rcHud } from './rc.js';
import { updateMortar, isMortarActive, mortarBlocksMove, mortarHud } from './mortar.js';
import { updateBonics, bonicsRaiseK, isBonicsZoomed, isBonicsActive } from './weapons.js';
import { updateMelt } from './melt.js';
import { updateTriggerSpots } from './trigger.js';
import { updatePhoto } from './photo.js';
import './signalling.js';
import './input.js';
import { showWin, updateHubIntro, updateStoryCutscene, bootActive } from './menu.js';
import { TICK_DT, consumeTicks } from './tick.js';
import { isMissionActive, updateMission, missionHudText, getHoldInfo, getCheckpoint, respawnToCheckpoint } from './mission.js';

function getForward() {
  const f = _tFwd.set(0, 0, -1);
  f.applyQuaternion(camera.quaternion);
  f.y = 0;
  return f.normalize();
}

function getRight() {
  const r = _tRight.set(1, 0, 0);
  r.applyQuaternion(camera.quaternion);
  r.y = 0;
  return r.normalize();
}


let moveBlend = 0;
let sprintBlend = 0;
let proneBlend = 0;
let supineBlend = 0;
let strafSlideK = 0;
let inspectK = 0;
let inspectT = 0;
let playerY = 1.7, velY = 0, onGround = true;
let wasProne = false, wasSupine = false, strafWas = false, supineYaw = 0;
let eyeCur = 1.7;
let walkTime = 0;
let lastFloorEye = 0, landK = 0;
const tVel = new THREE.Vector3();
let isSprinting = false;
let sprintT = 0;
// ponytail: downhill slide after jumping — not controllable, grit path if needed
let slideT = 0, slideMax = 0, slideJumped = false, slideJumpAir = false;
const _slideDir = new THREE.Vector2();
// ponytail: coyote+buffer — cheap forgiving jump, grit if need variable windows per map
let coyoteT = 0, jumpBufT = 0;
let leanCur = 0; // ponytail: smoothed strafe roll, lerp not instant
let adsBlend = 0;
let wasDead = false;
let airFloor = 0;
const vel = new THREE.Vector3();
const wallRay = new THREE.Raycaster();
const clock = new THREE.Clock();


const _tV = new THREE.Vector3();
const _tV2 = new THREE.Vector3();
const _tUp = new THREE.Vector3();
const _tFwd = new THREE.Vector3();
const _tRight = new THREE.Vector3();
const _aimEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _swayQuat = new THREE.Quaternion();
const _bP = new THREE.Vector3(), _bQ = new THREE.Quaternion(), _bV = new THREE.Vector3();



const DEATH_ANIM = 1.8;
let deathT = 0, deathAnimating = false;
let extractHintAt = -99;
const deathStartE = new THREE.Euler(0, 0, 0, 'YXZ');
let deathStartY = 1.7;





function updateDeathCam(dt) {
  deathT += dt;
  const FALL = 0.75, ROLL = 1.05;
  const fallK = Math.min(1, deathT / FALL);
  const rollK = Math.min(1, Math.max(0, deathT - FALL) / ROLL);
  const floor = groundHeight(camera.position.x, camera.position.z) + 0.5;
  const drop = fallK * fallK;
  camera.position.y = Math.max(floor, deathStartY + (floor - deathStartY) * drop);

  const knockX = S.deathDirX || 0, knockZ = S.deathDirZ || 0;
  camera.position.x += knockX * 0.35 * rollK;
  camera.position.z += knockZ * 0.35 * rollK;

  const fwdX = -Math.sin(deathStartE.y), fwdZ = -Math.cos(deathStartE.y);
  const cross = fwdX * knockZ - fwdZ * knockX;
  const rollSign = cross ? Math.sign(cross) : 1;
  const pitch = -0.9 * fallK - 0.5 * rollK;
  const roll = rollK * rollK * 2.9 * rollSign;
  const rattle = Math.sin(deathT * 47) * 0.02 * (1 - fallK);
  camera.quaternion.setFromEuler(new THREE.Euler(
    deathStartE.x + pitch + rattle, deathStartE.y + rattle, deathStartE.z + roll, 'YXZ'));
  if (deathT >= DEATH_ANIM) {
    deathAnimating = false;
    showDeathScreen();
    if (document.pointerLockElement) document.exitPointerLock();
  }
}




const KC_FLY = 1.5;
const KC_HOLD = 3.0;
let kcPhase = 0;
let kcT = 0;
const kcStartPos = new THREE.Vector3(), kcStartQ = new THREE.Quaternion();
const kcEndPos = new THREE.Vector3(), kcEndQ = new THREE.Quaternion();
const _kcM3 = new THREE.Matrix4(), _kcUp = new THREE.Vector3(0, 1, 0), _kcLook = new THREE.Vector3();
let kcStartLocked = false;


export function startKillCam() {
  if (!S.killerPos) return false;
  hideDeathBoard();
  kcStartPos.copy(camera.position);
  kcStartQ.copy(camera.quaternion);

  const fx = -Math.sin(S.killerYaw), fz = -Math.cos(S.killerYaw);
  kcEndPos.set(
    S.killerPos[0] + fx * 3.2,
    S.killerPos[1] + 2.1,
    S.killerPos[2] + fz * 3.2);

  _kcLook.set(S.killerPos[0], S.killerPos[1] + 1.2, S.killerPos[2]);
  _kcM3.lookAt(kcEndPos, _kcLook, _kcUp);
  kcEndQ.setFromRotationMatrix(_kcM3);
  kcPhase = 1; kcT = 0;
  kcStartLocked = !!(document.pointerLockElement);
  return true;
}
S.killCam = startKillCam;


export function exitKillCam() {
  kcPhase = 0;
  showDeathScreen();
  if (kcStartLocked) requestGameLock(); else if (document.pointerLockElement) document.exitPointerLock();
}

function updateKillCam(dt) {
  kcT += dt;
  if (kcPhase === 1) {
    const k = Math.min(1, kcT / KC_FLY);
    const e = k * k * (3 - 2 * k);
    camera.position.lerpVectors(kcStartPos, kcEndPos, e);
    camera.quaternion.slerpQuaternions(kcStartQ, kcEndQ, e);
    if (k >= 1) { kcPhase = 2; kcT = 0; }
  } else {

    camera.position.copy(kcEndPos);
    camera.quaternion.copy(kcEndQ);
    if (kcT >= KC_HOLD) exitKillCam();
  }
}



const trigIn = {};
function updateTriggers() {
  if (!S.storyData || !S.storyData.triggers || !S.storyData.triggers.length) return;
  const px = camera.position.x, pz = camera.position.z;
  S.storyData.triggers.forEach(function(t, i) {
    const inside = Math.hypot(px - t.x, pz - t.z) <= (t.r || 8);
    if (inside && !trigIn[i]) { trigIn[i] = true; if (t.text) showSubtitle(t.text); }
    else if (!inside && trigIn[i]) trigIn[i] = false;
  });
}


const STRAF_CAM_SHARE = 0.3, STRAF_GUN_SHARE = 0.7;

const SUPINE_YAW_RANGE = 2.6;

const MOVE_FWD = 1.0, MOVE_STRAFE = 0.82, MOVE_BACK = 0.72;

function updatePlayer(dt) {
  if (mortarBlocksMove()) {

    vel.set(0,0,0);
    const footY = playerY - eyeCur;
    const floorEye = supportHeight(camera.position.x, camera.position.z, footY) + eyeCur;
    playerY = floorEye; velY = 0; onGround = true; S.airborne = false;
    camera.position.y = playerY;
    return false;
  }
  const forward = getForward();
  const right = getRight();



  if (S.prone && !wasProne) S.supine = S.supine || vel.dot(forward) < -0.5;
  if (!S.prone) {
    if (S.supine && !S.settings.strafLock) S.straf = strafWas;
    S.supine = false;
  } else if (S.supine && vel.dot(forward) > 0.5) {
    if (!S.settings.strafLock) S.straf = strafWas;
    S.supine = false;
  }
  if (S.supine && !wasSupine) {
    supineYaw = S.euler.y;
    if (!S.settings.strafLock) { strafWas = S.straf; S.straf = true; }
  }
  wasProne = S.prone;
  wasSupine = S.supine;
  // tactical: sprint builds fast, decays slower in air to keep momentum
  isSprinting = (S.keys['ShiftLeft'] || S.keys['ShiftRight']) && !S.ads;
  const sprintWant = (isSprinting && onGround ? 1 : 0);
  const sprintRate = (sprintWant > sprintT) ? 8 : (onGround ? 8 : 3);
  sprintT += (sprintWant - sprintT) * Math.min(1, dt * sprintRate);
  S.sprint = sprintT;
  let speed = S.prone ? 1.2 : (4 + sprintT * 4);
  if (S.ads) speed *= 0.55;
  speed *= weaponSpeedMul();
  speed *= 1 - S.wallProx * 0.3;

  // tactical: prone dip slower down, faster up; slight weight
  const targetEye = S.prone ? 0.45 : 1.7;
  const eyeRate = (targetEye < eyeCur) ? 6 : 10;
  eyeCur = THREE.MathUtils.lerp(eyeCur, targetEye, Math.min(1, dt * eyeRate));
  if (S.prone && !wasProne) landK = Math.max(landK, 0.15);

  // coyote (0.14s) + jump buffer (0.18s)
  coyoteT = onGround ? 0.14 : Math.max(0, coyoteT - dt);
  jumpBufT = S.keys['Space'] ? 0.18 : Math.max(0, jumpBufT - dt);
  const canJump = jumpBufT > 0 && coyoteT > 0.001;
  if (canJump) {
    if (S.prone) { S.prone = false; jumpBufT = 0; }
    else {
      const wasSliding = slideT > 0;
      velY = 6.5;
      slideJumped = true;
      if (wasSliding) { airFloor = Math.hypot(vel.x, vel.z); slideT = 0; slideMax = 0; slideJumpAir = true; }
      else slideJumpAir = false;
      jumpBufT = 0;
      coyoteT = 0;
    }
  }
  // tactical: variable jump — releasing Space early cuts upward velocity
  if (!S.keys['Space'] && velY > 0) velY -= 20 * dt * 0.6;
  velY -= 20 * dt;
  playerY += velY * dt;

  const footY = playerY - eyeCur;
  const floorEye = supportHeight(camera.position.x, camera.position.z, footY) + eyeCur;
  if (playerY <= floorEye) {
    if (!onGround) {
      // tactical: heavier landing — weight scales with impact
      const impact = Math.max(0, -velY);
      landK = Math.min(0.9, impact * 0.018);
      S.shakeX += (Math.random() - 0.5) * 0.02 * landK;
      S.shakeY += (Math.random() - 0.5) * 0.02 * landK;
      S.fovPunch += Math.min(4, impact * 0.35);
      S.caKick = Math.min(0.7, S.caKick + landK * 0.4);
      if (slideJumped) {
        const gx = groundHeight(camera.position.x + 0.8, camera.position.z) - groundHeight(camera.position.x - 0.8, camera.position.z);
        const gz = groundHeight(camera.position.x, camera.position.z + 0.8) - groundHeight(camera.position.x, camera.position.z - 0.8);
        const slope = Math.hypot(gx, gz) / 1.6;
        if (slope > 0.28) {
          const l = Math.hypot(gx, gz) || 1;
          _slideDir.set(-gx / l, -gz / l);
          slideT = 1.6 + slope * 3.0;
          slideMax = slideT;
        }
      }
      slideJumped = false; slideJumpAir = false;
    } else if (floorEye - lastFloorEye > 0.25) {
      landK = Math.max(landK, 0.28);
      S.fovPunch += 0.8;
    }
    lastFloorEye = floorEye;
    playerY = floorEye;
    velY = 0;
    onGround = true;
  } else if (onGround && velY <= 0 && floorEye - playerY < 0.4) {

    lastFloorEye = floorEye;
    playerY = floorEye;
    velY = 0;
  } else {
    lastFloorEye = floorEye;
    onGround = false;
    if (!onGround) { slideT = 0; slideMax = 0; }
  }
  S.airborne = !onGround;
  // keep coyote window alive while grounded
  if (onGround) coyoteT = 0.14;

  if (onGround) {
    if (slideT > 0) {
      slideT -= dt;
      const gx2 = groundHeight(camera.position.x + 0.8, camera.position.z) - groundHeight(camera.position.x - 0.8, camera.position.z);
      const gz2 = groundHeight(camera.position.x, camera.position.z + 0.8) - groundHeight(camera.position.x, camera.position.z - 0.8);
      const slope2 = Math.hypot(gx2, gz2) / 1.6;
      if (slope2 < 0.12) slideT = 0;
      if (slideT > 0) {
        const l2 = Math.hypot(gx2, gz2) || 1;
        _slideDir.set(-gx2 / l2, -gz2 / l2);
        const prog = slideMax > 0 ? (slideT / slideMax) : 0;
        const base = 4.0 + slope2 * 9;
        let spd = base * (0.35 + 0.65 * prog);
        // ponytail: push with slide dir to go faster
        let _iny = 0, _inx = 0;
        if (S.keys['KeyW']) _iny += 1;
        if (S.keys['KeyS']) _iny -= 1;
        if (S.keys['KeyD']) _inx += 1;
        if (S.keys['KeyA']) _inx -= 1;
        if (_iny !== 0 || _inx !== 0) {
          _tV.set(0, 0, 0).addScaledVector(forward, _iny > 0 ? _iny * MOVE_FWD : _iny * MOVE_BACK).addScaledVector(right, _inx * MOVE_STRAFE);
          if (_tV.length() > 0) { _tV.normalize(); const dot = _tV.x * _slideDir.x + _tV.z * _slideDir.y; if (dot > 0.2) spd *= 1 + dot * 0.75; }
        }
        // tactical: de-noised slide — readable but still gritty
        spd *= 0.88 + Math.random() * 0.24;
        if (Math.random() < 0.02) spd *= 0.55; // rock snag rarer
        const angJ = (Math.random() - 0.5) * 0.18;
        const cs = Math.cos(angJ), sn = Math.sin(angJ);
        const dx = _slideDir.x * cs - _slideDir.y * sn;
        const dy = _slideDir.x * sn + _slideDir.y * cs;
        const tx = dx * spd, tz = dy * spd;
        vel.x += (tx - vel.x) * Math.min(1, dt * 7);
        vel.z += (tz - vel.z) * Math.min(1, dt * 7);
        vel.x += (Math.random() - 0.5) * 0.45 * slope2;
        vel.z += (Math.random() - 0.5) * 0.45 * slope2;
        if (Math.random() < 0.04) landK = Math.max(landK, 0.12 + Math.random() * 0.10);
        if (Math.random() < 0.015) { vel.x *= 0.65; vel.z *= 0.65; }
        S.shakeX += (Math.random() - 0.5) * 0.018 * slope2;
        S.shakeY += (Math.random() - 0.5) * 0.014 * slope2;
        S.caKick = Math.min(0.5, S.caKick + Math.random() * 0.04 * slope2);
        S.fovPunch += Math.random() * 0.25 * slope2;
        airFloor = vel.length();
      } else { slideT = 0; slideMax = 0; }
    }
    if (slideT <= 0) {
      let iny = 0, inx = 0;
      if (S.keys['KeyW']) iny += 1;
      if (S.keys['KeyS']) iny -= 1;
      if (S.keys['KeyD']) inx += 1;
      if (S.keys['KeyA']) inx -= 1;
      tVel.set(0, 0, 0);
      tVel.addScaledVector(forward, iny > 0 ? iny * MOVE_FWD : iny * MOVE_BACK)
          .addScaledVector(right, inx * MOVE_STRAFE);
      if (tVel.length() > 0) tVel.normalize().multiplyScalar(speed);
      // tactical: split accel vs friction — quicker start, heavier stop
      const hasInput = tVel.length() > 0.001;
      if (hasInput) {
        const accel = 14 * (S.prone ? 0.6 : 1) * (1 + sprintT * 0.35);
        vel.lerp(tVel, Math.min(1, dt * accel));
      } else {
        // friction — tactical damped, not ice
        vel.lerp(tVel, Math.min(1, dt * 16));
      }
      airFloor = vel.length();
    }
  } else {
    // tactical: slightly more air control, less bleed on slide-jump momentum
    const AIR_ACCEL = 2.2;
    const MAX_AIR_SPEED = Math.max(speed * 0.65, airFloor);
    if (S.keys['KeyW']) vel.addScaledVector(forward, AIR_ACCEL * dt * MOVE_FWD);
    if (S.keys['KeyS']) vel.addScaledVector(forward, -AIR_ACCEL * dt * MOVE_BACK);
    if (S.keys['KeyD']) vel.addScaledVector(right, AIR_ACCEL * dt * MOVE_STRAFE);
    if (S.keys['KeyA']) vel.addScaledVector(right, -AIR_ACCEL * dt * MOVE_STRAFE);

    const horiz = _tV2.set(vel.x, 0, vel.z);
    if (horiz.length() > MAX_AIR_SPEED) horiz.setLength(MAX_AIR_SPEED);
    vel.x = horiz.x; vel.z = horiz.z;
    vel.multiplyScalar(Math.pow(slideJumpAir ? 0.998 : 0.992, dt * 60));
  }
  // tactical: slower land decay so dip reads
  landK *= Math.pow(0.001, dt);

  const res = resolveCollisions(camera.position.x + vel.x * dt, camera.position.z + vel.z * dt, vel,
    footY, footY + Math.max(eyeCur * 1.05, 0.7));
  camera.position.x = res[0];
  camera.position.z = res[1];
  const vScale = THREE.MathUtils.clamp(vel.length() / Math.max(1, speed), 0, 1);
  const bobAmp = 0.7 + vScale * 0.6;
  camera.position.y = playerY + Math.sin(walkTime * 0.5) * 0.04 * bobAmp * (onGround ? 1 : 0) - landK * 0.10;
  const isMoving = onGround && vel.length() > 0.1;
  if (isMoving) walkTime += dt * vel.length() * (S.prone ? 3.2 : 1.8);
  return isMoving;
}

function updateCameraRig(dt) {

  if(isBonicsActive()){
    const br = bonicsRaiseK();
    let zoomT = S.BASE_FOV - 62 * br;
    if (S.prone) zoomT -= 5 * (1-br);
    S.zoomCur += (zoomT - S.zoomCur) * Math.min(1, dt * 10);
    const sprintPunch = sprintT * 4.5 * (1-br);
    camera.fov = S.zoomCur + (S.straf ? 0 : S.fovPunch) * (1-br*0.9) + sprintPunch;
    camera.updateProjectionMatrix();

    S.recoil.x = THREE.MathUtils.lerp(S.recoil.x, S.recoilT.x, Math.min(1, dt * 18));
    S.recoil.y = THREE.MathUtils.lerp(S.recoil.y, S.recoilT.y, Math.min(1, dt * 18));
    if (S.straf) {
      S.recoilT.x += (0 - S.recoilT.x) * Math.min(1, dt * 6);
      S.recoilT.y += (0 - S.recoilT.y) * Math.min(1, dt * 6);
    }
    if (S.supine) {
      let dy = S.euler.y - supineYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      if (dy > SUPINE_YAW_RANGE) S.euler.y = supineYaw + SUPINE_YAW_RANGE;
      else if (dy < -SUPINE_YAW_RANGE) S.euler.y = supineYaw - SUPINE_YAW_RANGE;
    }
    const aimEuler2 = _aimEuler.copy(S.euler);
    const kickShare2 = S.straf ? STRAF_CAM_SHARE : 1;
    aimEuler2.x = THREE.MathUtils.clamp(aimEuler2.x + S.recoil.x * kickShare2 + (S.straf ? 0 : S.shakeX)*(1-br), -Math.PI / 2.2, S.supine ? Math.PI * 0.62 : Math.PI / 2.2);
    aimEuler2.y += S.recoil.y * kickShare2 + (S.straf ? 0 : S.shakeY)*(1-br);
    // tactical: keep leanCur alive even when zoomed, suppressed by br
    {
      const strafeIn2 = (S.keys['KeyD'] ? 1 : 0) - (S.keys['KeyA'] ? 1 : 0);
      const leanTgt2 = strafeIn2 * 0.038 * (0.5 + sprintT * 0.5) * (onGround ? 1 : 0.35);
      leanCur += (leanTgt2 - leanCur) * Math.min(1, dt * 6);
      aimEuler2.z += leanCur * (1 - br * 0.9);
    }
    camera.quaternion.setFromEuler(aimEuler2);
    S.shakeX *= Math.pow(0.0004, dt); S.shakeY *= Math.pow(0.0004, dt);
    S.fovPunch = THREE.MathUtils.lerp(S.fovPunch, 0, Math.min(1, dt * 8));
    const aimK2 = Math.min(1, dt * (S.straf ? (S.settings.strafLock ? 20 : 14) : 6));
    S.aimErr.x += (S.aimErrT.x - S.aimErr.x) * aimK2;
    S.aimErr.y += (S.aimErrT.y - S.aimErr.y) * aimK2;
    if (S.straf && !S.ads) {
      const s = Math.min(1, dt * 1.1);
      S.euler.y += S.aimErr.x * s;
      S.euler.x = THREE.MathUtils.clamp(S.euler.x + S.aimErr.y * s, -Math.PI / 2.2, S.supine ? Math.PI * 0.62 : Math.PI / 2.2);
      S.aimErrT.x -= S.aimErr.x * s;
      S.aimErrT.y -= S.aimErr.y * s;
    }
    adsBlend += ((S.ads ? 1 : 0) - adsBlend) * Math.min(1, dt * 10);
    if (S.ads) {
      S.aimErrT.set(0, 0);
      S.aimShift += (0 - S.aimShift) * Math.min(1, dt * 12);
    }
    const fwd2 = _tV.set(0, 0, -1).applyQuaternion(camera.quaternion);
    // ponytail: was intersectObjects(scene) O(meshes*tris) ~60ms on lamma — collider sample is ~0.02ms
    let nearest2 = 1.3;
    for (let d = 0.3; d <= 1.35; d += 0.3) {
      const sx = camera.position.x + fwd2.x * d, sz = camera.position.z + fwd2.z * d, sy = camera.position.y - 0.2;
      if (pointInCollider(sx, sy, sz)) { nearest2 = d; break; }
    }
    S.wallProx += (THREE.MathUtils.clamp((1.3 - nearest2) / 0.7, 0, 1) - S.wallProx) * Math.min(1, dt * 10);
    return;
  }
  S.recoil.x = THREE.MathUtils.lerp(S.recoil.x, S.recoilT.x, Math.min(1, dt * 18));
  S.recoil.y = THREE.MathUtils.lerp(S.recoil.y, S.recoilT.y, Math.min(1, dt * 18));
  if (S.straf) {

    S.recoilT.x += (0 - S.recoilT.x) * Math.min(1, dt * 6);
    S.recoilT.y += (0 - S.recoilT.y) * Math.min(1, dt * 6);
  }


  if (S.supine) {
    let dy = S.euler.y - supineYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    if (dy > SUPINE_YAW_RANGE) S.euler.y = supineYaw + SUPINE_YAW_RANGE;
    else if (dy < -SUPINE_YAW_RANGE) S.euler.y = supineYaw - SUPINE_YAW_RANGE;
  }
  const aimEuler = _aimEuler.copy(S.euler);

  const kickShare = S.straf ? STRAF_CAM_SHARE : 1;
  aimEuler.x = THREE.MathUtils.clamp(aimEuler.x + S.recoil.x * kickShare + (S.straf ? 0 : S.shakeX), -Math.PI / 2.2, S.supine ? Math.PI * 0.62 : Math.PI / 2.2);
  aimEuler.y += S.recoil.y * kickShare + (S.straf ? 0 : S.shakeY);
  // tactical: smoothed roll with strafe + sprint lean — eases in/out instead of instant
  const strafeIn = (S.keys['KeyD'] ? 1 : 0) - (S.keys['KeyA'] ? 1 : 0);
  const leanTgt = strafeIn * 0.038 * (0.5 + sprintT * 0.5) * (onGround ? 1 : 0.35);
  leanCur += (leanTgt - leanCur) * Math.min(1, dt * 6);
  aimEuler.z += leanCur;
  camera.quaternion.setFromEuler(aimEuler);
  S.shakeX *= Math.pow(0.0004, dt); S.shakeY *= Math.pow(0.0004, dt);
  S.fovPunch = THREE.MathUtils.lerp(S.fovPunch, 0, Math.min(1, dt * 8));
  let zoomT = S.BASE_FOV + (S.straf ? 10 : 0);
  if (S.prone) zoomT -= 5;
  if (S.ads) zoomT = S.BASE_FOV - 20;
  // tactical: wall tightness narrows FOV slightly
  if (S.wallProx > 0.6) zoomT -= S.wallProx * 1.5;
  S.zoomCur += (zoomT - S.zoomCur) * Math.min(1, dt * 10);
  const sprintPunch = sprintT * 4.5;
  camera.fov = S.zoomCur + (S.straf ? 0 : S.fovPunch) + sprintPunch;
  camera.updateProjectionMatrix();


  const aimK = Math.min(1, dt * (S.straf ? (S.settings.strafLock ? 20 : 14) : 6));
  S.aimErr.x += (S.aimErrT.x - S.aimErr.x) * aimK;
  S.aimErr.y += (S.aimErrT.y - S.aimErr.y) * aimK;



  if (S.straf && !S.ads) {
    const s = Math.min(1, dt * 1.1);
    S.euler.y += S.aimErr.x * s;
    S.euler.x = THREE.MathUtils.clamp(S.euler.x + S.aimErr.y * s, -Math.PI / 2.2, S.supine ? Math.PI * 0.62 : Math.PI / 2.2);
    S.aimErrT.x -= S.aimErr.x * s;
    S.aimErrT.y -= S.aimErr.y * s;
  }

  adsBlend += ((S.ads ? 1 : 0) - adsBlend) * Math.min(1, dt * 10);
  if (S.ads) {
    S.aimErrT.set(0, 0);
    S.aimShift += (0 - S.aimShift) * Math.min(1, dt * 12);
  }


  const fwd = _tV.set(0, 0, -1).applyQuaternion(camera.quaternion);
  let nearest = 1.3;
  for (let d = 0.3; d <= 1.35; d += 0.3) {
    const sx = camera.position.x + fwd.x * d, sz = camera.position.z + fwd.z * d, sy = camera.position.y - 0.2;
    if (pointInCollider(sx, sy, sz)) { nearest = d; break; }
  }
  S.wallProx += (THREE.MathUtils.clamp((1.3 - nearest) / 0.7, 0, 1) - S.wallProx) * Math.min(1, dt * 10);
}

function updateViewmodel(dt, now, isMoving) {

  flash.intensity *= Math.pow(0.0001, dt);
  const muzzleMat = getMuzzleFlash().material;
  muzzleMat.opacity *= Math.pow(0.00001, dt);
  if (muzzleMat.opacity < 0.02) getMuzzleFlash().visible = false;
  const worldFlash = getWorldFlash();
  worldFlash.position.copy(camera.position).addScaledVector(_tV.set(0, 0, -1).applyQuaternion(camera.quaternion), 1.5);
  worldFlash.intensity *= Math.pow(0.0001, dt);


  S.kickZ = THREE.MathUtils.lerp(S.kickZ, 0, Math.min(1, dt * 4.5));
  recoilPivot.rotation.x = THREE.MathUtils.lerp(recoilPivot.rotation.x, 0, Math.min(1, dt * 4.5));

  const vp = viewPos(), vr = viewRot();
  const gx = vp ? vp[0] : GUN_POS.x, gy = vp ? vp[1] : GUN_POS.y, gz = vp ? vp[2] : GUN_POS.z;
  const grx = vr ? vr[0] : GUN_ROT.x, gry = vr ? vr[1] : GUN_ROT.y, grz = vr ? vr[2] : GUN_ROT.z;
  recoilPivot.position.z = gz + S.kickZ;

  const gunModel = getGunModel();
  if (!gunModel) return;
  const strafeLean = (S.keys['KeyD'] ? 1 : 0) - (S.keys['KeyA'] ? 1 : 0);

  moveBlend = THREE.MathUtils.lerp(moveBlend, isMoving ? 1 : 0, Math.min(1, dt * 7));
  sprintBlend = THREE.MathUtils.lerp(sprintBlend, (isSprinting && isMoving) ? 1 : 0, Math.min(1, dt * 6));
  proneBlend = THREE.MathUtils.lerp(proneBlend, S.prone ? 1 : 0, Math.min(1, dt * 6));
  supineBlend = THREE.MathUtils.lerp(supineBlend, S.supine ? 1 : 0, Math.min(1, dt * 6));
  strafSlideK = THREE.MathUtils.lerp(strafSlideK, S.straf ? 1 : 0, Math.min(1, dt * 10));
  const t = now;
  const walkBobX = Math.sin(walkTime) * 0.025;
  const walkBobY = Math.abs(Math.cos(walkTime)) * 0.02;
  const walkSwayX = Math.sin(walkTime * 0.5) * 0.01;
  const walkRotX = Math.sin(walkTime * 0.5) * 0.015;
  const walkRotZ = Math.sin(walkTime) * 0.008;

  const runBobX = Math.sin(walkTime) * 0.055;
  const runBobY = Math.abs(Math.cos(walkTime)) * 0.042;
  const runSwayX = Math.sin(walkTime * 0.5) * 0.02;
  const runRotX = Math.sin(walkTime * 0.5) * 0.02;
  const runRotZ = Math.sin(walkTime) * 0.035;

  const proneBobX = Math.sin(walkTime * 1.3) * 0.64;
  const proneBobY = Math.abs(Math.cos(walkTime * 1.3)) * 0.006;
  const proneSwayX = Math.sin(walkTime * 0.7) * 0.36;
  const proneRotX = Math.sin(walkTime * 0.7) * 0.02;
  const proneRotZ = Math.sin(walkTime * 1.3) * 0.05;
  const idleBobX = Math.sin(t * 1.1) * 0.006;
  const idleBobY = Math.sin(t * 0.8) * 0.005;
  const idleSwayX = Math.sin(t * 0.5) * 0.004;
  const idleRotX = Math.sin(t * 0.9) * 0.008;
  const idleRotZ = Math.cos(t * 0.6) * 0.01;
  const L = THREE.MathUtils.lerp;

  const bobX = L(L(L(idleBobX, walkBobX, moveBlend), runBobX, sprintBlend), proneBobX, proneBlend);
  const bobY = L(L(L(idleBobY, walkBobY, moveBlend), runBobY, sprintBlend), proneBobY, proneBlend);
  const swayX = L(L(L(idleSwayX, walkSwayX, moveBlend), runSwayX, sprintBlend), proneSwayX, proneBlend);
  const rotXb = L(L(L(idleRotX, walkRotX, moveBlend), runRotX, sprintBlend), proneRotX, proneBlend);
  const rotZb = L(L(L(idleRotZ, walkRotZ, moveBlend), runRotZ, sprintBlend), proneRotZ, proneBlend);
  const runPose = sprintBlend * (1 - adsBlend);
  const sk = switchK();
  let px = THREE.MathUtils.lerp(gx + bobX + swayX + S.aimShift * strafSlideK, ADS_POS.x, adsBlend);
  const rk = reloadK();
  const reloadDip = rk * 0.18;
  const rl = rk * (1 - adsBlend);
  let py = THREE.MathUtils.lerp(gy + bobY - reloadDip - runPose * 0.07, ADS_POS.y, adsBlend) - sk * 1.7;
  let pz = THREE.MathUtils.lerp(gz + S.kickZ + S.wallProx * 0.55, ADS_POS.z, adsBlend) - sk * 0.25;



  let rx = THREE.MathUtils.lerp(grx + rotXb + S.aimErr.y + S.wallProx * 0.6, ADS_ROT.x, adsBlend) + (S.straf ? S.recoil.x * STRAF_GUN_SHARE + S.shakeX : 0) - runPose * 0.32 - rl * 0.85 - sk * 1.2;
  let ry = THREE.MathUtils.lerp(gry + S.aimErr.x, ADS_ROT.y, adsBlend) + (S.straf ? S.recoil.y * STRAF_GUN_SHARE + S.shakeY : 0);
  let rz = THREE.MathUtils.lerp(grz + rotZb, ADS_ROT.z, adsBlend) + (S.straf ? S.shakeX * 0.6 : 0) + rl * 0.25 - sk * 0.4 + strafeLean * 0.045 * moveBlend;



  if (S.inspect) inspectT += dt;
  inspectK = THREE.MathUtils.lerp(inspectK, S.inspect ? 1 : 0, Math.min(1, dt * 4));
  if (inspectK > 0) {
    const L2 = THREE.MathUtils.lerp;
    px = L2(px, Math.sin(inspectT * 0.9) * 0.014, inspectK);
    py = L2(py, 0.04 + Math.sin(inspectT * 0.7 + 2.1) * 0.011, inspectK);
    pz = L2(pz, -1.5 + Math.sin(inspectT * 0.53) * 0.02, inspectK);
    rx = L2(rx, -0.16 + Math.sin(inspectT * 0.83 + 1.7) * 0.13, inspectK);
    ry = L2(ry, inspectT * 0.7 + Math.sin(inspectT * 0.41) * 0.06, inspectK);
    rz = L2(rz, Math.sin(inspectT * 0.29 + 0.6) * 0.17, inspectK);
  }


  if (supineBlend > 0) {
    const L3 = THREE.MathUtils.lerp;
    px = L3(px, -0.65, supineBlend);
    py = L3(py, -1.1, supineBlend);
    pz = L3(pz, -4.3, supineBlend);
    rx = L3(rx, 0.35, supineBlend);
    rz = L3(rz, 0.08, supineBlend);
  }



  const bRot = bashRot(), bThr = bashThrust();
  if (bRot > 0 || bThr > 0) {
    px = THREE.MathUtils.lerp(px, 0, bRot * 0.8);
    py = THREE.MathUtils.lerp(py, -0.15, bRot * 0.4);
    ry += bRot * Math.PI * 0.5;
    rz += bRot * 0.12;
    rx += bRot * 0.2;
    pz += bRot * 0.12 * (1 - bThr);
    pz -= bThr * 1.4;
    py -= bThr * 0.35;
  }

  if(isBonicsActive()){
    const br = bonicsRaiseK();

    px = THREE.MathUtils.lerp(px, 0.02, br);
    py = THREE.MathUtils.lerp(py, -0.12, br);
    pz = THREE.MathUtils.lerp(pz, -0.32, br);
    rx = THREE.MathUtils.lerp(rx, -0.02, br);
    ry = THREE.MathUtils.lerp(ry, 0, br);
    rz = THREE.MathUtils.lerp(rz, 0, br);
  }
  if (S.settings.brain && S.straf && brainTargetPos(_bP)) {
    _bQ.copy(camera.quaternion).invert();
    _bV.copy(_bP).sub(camera.position).applyQuaternion(_bQ).normalize();
    ry = -Math.asin(THREE.MathUtils.clamp(_bV.x, -1, 1));
    rx = Math.atan2(-_bV.y, -_bV.z);
  }
  gunModel.position.set(px, py, pz);
  gunModel.rotation.set(rx, ry, rz);
  boxDip(sk);


  const k = Math.min(1, dt * 5.5);
  const look = takeLook();
  S.sway.x += (THREE.MathUtils.clamp(-look[0] * 0.0012, -0.09, 0.09) - S.sway.x) * k;
  S.sway.y += (THREE.MathUtils.clamp(-look[1] * 0.0012, -0.07, 0.07) - S.sway.y) * k;


  const gunOffset = _tV.set(gx, gy, gz).applyQuaternion(camera.quaternion);
  const rightVec = _tV2.set(1, 0, 0).applyQuaternion(camera.quaternion);
  const upVec = _tUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  recoilPivot.position.copy(camera.position).add(gunOffset).addScaledVector(rightVec, S.sway.x).addScaledVector(upVec, S.sway.y);
  _aimEuler.set(S.sway.y * 1.6, S.sway.x * 1.6, 0, 'YXZ');
  const q = _swayQuat.setFromEuler(_aimEuler);
  recoilPivot.quaternion.copy(camera.quaternion).multiply(q);
}


function playTick(dt, now) {
  perfMark('tick');
  perfMark('mortar'); updateMortar(dt); updateBonics(dt); perfEnd('mortar');
  const wasDriving = isDriving() || isTankDriving();
  const wasRc = rcActive();
  const mort = isMortarActive();
  if (wasDriving || wasRc || mort) gunScene.visible = false; else gunScene.visible = true;
  perfMark('player'); const isMoving = (wasDriving || wasRc) ? false : updatePlayer(dt); perfEnd('player');
  perfMark('triggers'); updateTriggers(); updateSubtitle(); perfEnd('triggers');

  perfMark('pickups');
  const hboxGot = updateHealthBoxes(dt);
  if (hboxGot) showSubtitle('HEALTH BOX +' + hboxGot);
  const radioGot = updateRadios(dt);
  if (radioGot) showSubtitle('RADIO COLLECTED ' + (radiosPlaced() - radiosLeft()) + '/' + radiosPlaced());
  perfEnd('pickups');

  perfMark('weapons'); updateFiring(dt, now); updateBoxUse(dt);
  const bu = boxUseInfo();
  if (bu) updateBoxBar(bu.frac, bu.secs); else hideBoxBar();
  updateAmmoUI(mortarHud() || rcHud() || hudInfo());
  updateHpUI(); updateCcUI(); updateRadarUI(); updateGrenadeUI(); updatePvpHud();
  updateRadar(dt, now);
  setHpFlash(S.hpFlash); S.hpFlash *= Math.pow(0.03, dt);
  flashSync(FLASH[curWeaponName()]);
  if (FLASH_DEBUG) {
    const FD = FLASH[curWeaponName()];
    const fnudge = 0.5 * dt;
    if (S.keys['KeyJ']) FD.pos[0] -= fnudge;
    if (S.keys['KeyL']) FD.pos[0] += fnudge;
    if (S.keys['KeyI']) FD.pos[1] += fnudge;
    if (S.keys['KeyK']) FD.pos[1] -= fnudge;
    flashDbg.textContent = curWeaponName() + '  x:' + FD.pos[0].toFixed(3) + ' y:' + FD.pos[1].toFixed(3) + ' z:' + FD.pos[2].toFixed(3);
  }
  perfEnd('weapons');

  perfMark('camera'); updateCameraRig(dt); updateViewmodel(dt, now, isMoving); perfEnd('camera');

  perfMark('ident'); updateLandingMarker(); updateIdent(dt, now); perfEnd('ident');

  perfMark('ugv'); updateUgv(dt, now); perfEnd('ugv');

  // ponytail: mission phases override legacy win
  perfMark('mission');
  let missionWon=false;
  if(isMissionActive()){
    missionWon = updateMission(dt, now);
    const hold = getHoldInfo();
    if(hold && !boxUseInfo()) updateBoxBar(hold.frac, hold.remain);
    const mh = missionHudText();
    if(mh) updateMissionHud(mh); else updateMissionHud(null);
    if(missionWon){ updateMissionHud(null); if(!S.dead && !S.won) showWin(); }
  } else {
    const foes = ugvCount() + turretCount() + bossCount();
    const cleared = foes > 0 && allUgvsDead() && allTurretsDead() && allBossesDead();
    const hasRadios = radiosPlaced();
    const allRadios = hasRadios && radiosLeft() === 0;
    let won = hasRadios
      ? allRadios && (!MAP_SPAWNS.extract || atExtract())
      : (MAP_SPAWNS.extract && atExtract()) || (!MAP_SPAWNS.extract && cleared);
    if (!S.dead && !S.won && won) showWin();
    else if (!S.dead && !S.won && cleared && MAP_SPAWNS.extract && now - extractHintAt > 8) { extractHintAt = now; showSubtitle('GET TO EXTRACTION'); }
  }
  perfEnd('mission');
  perfMark('turret'); updateTurrets(dt, now); perfEnd('turret');
  perfMark('drone'); updateDrone(dt, now); perfEnd('drone');
  perfMark('boss'); updateBoss(dt, now); perfEnd('boss');
  perfMark('gren'); updateGrenades(dt); updateCml(dt, now, curWeaponName() === 'CML-2'); perfEnd('gren');
  perfMark('pvpCars');
  perfMark('pvp'); if (S.pvp) updatePvp(dt, now); perfEnd('pvp');
  perfMark('cars'); updateCars(dt, now); perfEnd('cars');
  perfMark('tanks'); updateTanks(dt, now); perfEnd('tanks');
  perfMark('rc'); updateRc(dt, now); perfEnd('rc');
  perfMark('melt'); updateMelt(dt, now); perfEnd('melt');
  perfMark('trigger'); updateTriggerSpots(); perfEnd('trigger');
  perfEnd('pvpCars');


  perfMark('postFx'); S.caKick *= Math.pow(0.02, dt);
  const motionCA = S.caKick * 0.1 + (Math.abs(S.shakeX) + Math.abs(S.shakeY)) * 0.5 + vel.length() * 0.003;
  postMat.uniforms.uCA.value = Math.min(0.02 + motionCA, 0.5); perfEnd('postFx');
  perfEnd('tick');
}

function animate() {
  perfFrameStart();
  requestAnimationFrame(animate);
  const frameDt = Math.min(clock.getDelta(), 0.1);
  const now = clock.elapsedTime;



  // ponytail: pipeline grass/rain to workers — runs on other cores while tick runs on main
  if(hasWorkers()){ try{ updateGrassCullWorker(); updateRainWorker(frameDt); }catch(e){} }
  updateHudVisibility();
  placeBossHud();
  placeMissionHud();



  if (S.hub) {
    updateHubIntro(frameDt);
    camera.quaternion.setFromEuler(S.euler);
    perfMark('rain'); updateRain(frameDt); perfEnd('rain');
    renderFrame(now);
    perfSetDraws(renderer.info.render.calls, renderer.info.render.triangles);
    try { const _gc = renderer.info.render.calls; void _gc; } catch(e){}
    perfFrameEnd();
    return;
  }


  if (S.pvpLobby) {
    camera.quaternion.setFromEuler(S.euler);
    gunScene.visible = false;
    perfMark('rain'); updateRain(frameDt); perfEnd('rain');
    renderFrame(now);
    perfSetDraws(renderer.info.render.calls, renderer.info.render.triangles);
    perfFrameEnd();
    return;
  }


  if (S.won) {
    try{ hideTankAim(); }catch(e){}
    camera.quaternion.setFromEuler(S.euler);
    decayCA(frameDt);
    perfMark('rain'); updateRain(frameDt); perfEnd('rain');
    renderFrame(now);
    perfSetDraws(renderer.info.render.calls, renderer.info.render.triangles);
    perfFrameEnd();
    return;
  }

  // not running until first click to lock // ponytail: freeze ticks before boot
  if (!S.hub && bootActive()) {
    camera.quaternion.setFromEuler(S.euler);
    decayCA(frameDt);
    perfMark('rain'); updateRain(frameDt); perfEnd('rain');
    renderFrame(now);
    perfSetDraws(renderer.info.render.calls, renderer.info.render.triangles);
    perfFrameEnd();
    return;
  }


  if (S.dead && !S.respawnRequested) {
    cancelBox();
    if (!wasDead) {
      wasDead = true;
      S.mapDeaths = (S.mapDeaths || 0) + 1;
      try { localStorage.setItem('gault_deaths_' + S.mapName, String(S.mapDeaths)); } catch (e) {}
      deathT = 0;
      deathAnimating = true;
      deathStartE.copy(S.euler);
      deathStartY = camera.position.y;
    }
  }
  if (isDriving() && S.dead) exitCar();
  if (isTankDriving() && S.dead) exitTank();
  if (S.respawnRequested) {
    if (isDriving()) exitCar();
    if (isTankDriving()) exitTank();

    // ponytail: mission checkpoint respawn
    let usedCp=false;
    if(isMissionActive()){
      const cp=getCheckpoint();
      if(cp){
        const rec=respawnToCheckpoint();
        if(rec){
          const gh = rec.y || (groundHeight(rec.x, rec.z)+1.7);
           camera.position.set(rec.x, gh, rec.z);
          S.euler.y = rec.yaw || 0;
           playerY = gh; velY=0; vel.set(0,0,0); slideT=0; slideMax=0; slideJumped=false; slideJumpAir=false;
          coyoteT=0.14; jumpBufT=0; landK=0; leanCur=0;
          S.hp=S.maxHp; S.dead=false; S.respawnRequested=false;
          wasDead=false; deathAnimating=false; kcPhase=0;
          ugvLowerCert(); droneLowerCert(); turretLowerCert(); bossLowerCert();
          usedCp=true;
        }
      }
    }
    if(!usedCp){
      const sp = S.pvp ? (function() {
        const pv = (MAP_SPAWNS.pvp || []).find(function(s) { return s.team === S.pvpTeam; }) || (MAP_SPAWNS.pvp || [])[0];
        return pv ? [pv.x, pv.z, pv.rotY] : null;
      })() : MAP_SPAWNS.player;
      const sx = sp ? sp[0] : 0, sz = sp ? sp[1] : 0;
      camera.position.set(sx, eyeCur, sz);
      if (sp && sp[2] != null) S.euler.y = THREE.MathUtils.degToRad(sp[2]);
      playerY = eyeCur; velY = 0; vel.set(0, 0, 0); slideT=0; slideMax=0; slideJumped=false; slideJumpAir=false;
      coyoteT=0.14; jumpBufT=0; landK=0; leanCur=0;
      S.hp = S.maxHp; S.dead = false; S.respawnRequested = false;
      wasDead = false; deathAnimating = false; kcPhase = 0;
      ugvLowerCert(); droneLowerCert(); turretLowerCert(); bossLowerCert();
    }
  }

  if (S.dead || (S.paused && !S.pvp) || (!S.pvp && !S.isLocked && S.everLocked)) {
      if (S.paused) {
        if (S.photo) {
          updatePhoto(frameDt);
        } else if (!(S.story && updateStoryCutscene(frameDt))) camera.quaternion.setFromEuler(S.euler);
      } else if (S.dead && deathAnimating) {
        updateDeathCam(frameDt);
      } else if (S.dead && kcPhase > 0) {
        updateKillCam(frameDt);
      }
      updateSubtitle();
      if (!S.photo) decayCA(frameDt);
      perfMark('rain'); updateRain(frameDt); perfEnd('rain');
      placeUIPanels(); renderFrame(now);
      perfSetDraws(renderer.info.render.calls, renderer.info.render.triangles);
      perfFrameEnd(); return;
  }

  const n = consumeTicks(frameDt);
  for (let i = 0; i < n; i++) playTick(TICK_DT, now);
  if(!hasWorkers()){
    perfMark('grass'); updateGrassCull(); perfEnd('grass');
  } else { perfMark('grass'); perfEnd('grass'); }
  // track visible grass + props for perf overlay
  try {
    let vg = 0; const _gc = window.__gaultGrassChunks || null;
    // fallback: count via perfSetCounts from world counts
    vg = (renderer.info.render.calls || 0);
    perfSetCounts(vg, 0);
  } catch(e){}
  if(!hasWorkers()){ perfMark('rain'); updateRain(frameDt); perfEnd('rain'); }
  else { perfMark('rain'); perfEnd('rain'); }
  renderFrame(now);
  perfSetDraws(renderer.info.render.calls, renderer.info.render.triangles);
  perfFrameEnd();
}




function decayCA(dt) {
  S.caKick *= Math.pow(0.25, dt);
  S.shakeX *= Math.pow(0.25, dt);
  S.shakeY *= Math.pow(0.25, dt);
  const motionCA = S.caKick * 0.1 + (Math.abs(S.shakeX) + Math.abs(S.shakeY)) * 0.5;
  const v = Math.min(0.02 + motionCA, 0.5);
  postMat.uniforms.uCA.value = Math.max(v, 0.15);
}

animate();
