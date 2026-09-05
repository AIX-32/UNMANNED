
import { S } from './state.js';
import { camera } from './core.js';
import { setFiring, switchWeapon, startReload, curWeaponName, FLASH, FLASH_DEBUG, toggleTrace, tryBash, usingBox } from './weapons.js';
import { throwGrenade } from './grenades.js';
import { toggleRadar } from './radar.js';
import { flashDbg, menuActive, inSettingsView, requestGameLock, openPause, resumeGame } from './ui.js';
import { bootActive, cheatUnlockAll } from './menu.js';
import { tryEnterCar, isDriving, exitCar } from './car.js';
import { rcActive, rcArmed, armRc, unarm, deployRc, detonateRc } from './rc.js';

const IS_HUDEDIT = new URLSearchParams(location.search).get('hudedit') !== null;
document.addEventListener('mousedown', function(e) {
  if (S.photo || S.dead || S.won || S.hub || S.story || S.pvpLobby || isDriving()) return;
  if (rcActive()) return;
  if (rcArmed()) { deployRc(); return; }
  if (S.settings.laptop) return;
  if (e.button === 2) S.straf = true;
  if (e.button === 0 && S.isLocked) setFiring(true);
});
document.addEventListener('mouseup', function(e) {
  if (S.dead || S.won || S.hub || S.story || S.pvpLobby) return;
  if (rcActive()) return;
  if (S.settings.laptop) return;
  if (e.button === 2 && !S.settings.strafLock && !S.supine) S.straf = false;
  if (e.button === 0) setFiring(false);
});
document.addEventListener('contextmenu', function(e) { e.preventDefault(); });


document.addEventListener('wheel', function(e) {
  if (S.photo) return;
  if (!S.straf || !S.isLocked) return;
  S.aimShift = THREE.MathUtils.clamp(S.aimShift + e.deltaY * 0.001, -1, 1);
  e.preventDefault();
}, { passive: false });

document.addEventListener('click', function(e) {
  if (S.photo || S.dead || S.won || S.hub || S.story || S.pvpLobby) return;
  if (menuActive()) return;
  if (bootActive()) return;
  requestGameLock();
});

document.addEventListener('mousemove', function(e) {
  if (S.photo || !S.isLocked) return;
  if (rcActive()) return;


  const menuState = menuActive() || S.won || S.hub || S.pvpLobby;
  const sens = menuState ? 0.002 : (S.ads ? 0.0013 : (S.prone ? 0.0016 : 0.002));
  let dY = e.movementY * sens;

  if (dY > 0 && S.recoilT.x > 0) {
    const ate = Math.min(S.recoilT.x, dY);
    S.recoilT.x -= ate;
    dY -= ate;
  }
  if (S.straf && !menuState) {


    const sens = S.settings.strafLock ? 0.007 : 0.0035;
    S.aimErrT.x = THREE.MathUtils.clamp(S.aimErrT.x + e.movementX * sens, -S.AIM_RANGE_X, S.AIM_RANGE_X);
    S.aimErrT.y = THREE.MathUtils.clamp(S.aimErrT.y + e.movementY * sens, -S.AIM_RANGE_Y, S.AIM_RANGE_Y);
    return;
  }
  S.euler.y -= e.movementX * sens;
  S.euler.x = Math.max(-Math.PI / 2.2, Math.min(S.supine ? Math.PI * 0.62 : Math.PI / 2.2, S.euler.x - dY));
  S.lookDX += e.movementX;
  S.lookDY += e.movementY;

  S.aimErrT.x = THREE.MathUtils.clamp(S.aimErrT.x + e.movementX * 0.0006, -S.DEADZONE, S.DEADZONE);
  S.aimErrT.y = THREE.MathUtils.clamp(S.aimErrT.y + e.movementY * 0.0006, -S.DEADZONE, S.DEADZONE);
});

document.addEventListener('keydown', function(e) {
  if (S.story) return;
  S.keys[e.code] = true;
  if (S.photo) return;
  if (rcActive()) {
    if (e.code === 'Space' && !e.repeat) detonateRc();
    return;
  }
  if (e.code === 'KeyF' && !e.repeat) { unarm(); if (isDriving()) exitCar(); else tryEnterCar(); }
  if (e.code === 'KeyC' && !e.repeat && !isDriving()) S.prone = !S.prone;
  if (e.code === 'KeyT' && !e.repeat) tryBash();
  if (e.code === 'KeyG' && !e.repeat && !usingBox && !isDriving()) throwGrenade();  if (e.code === 'KeyR' && !e.repeat) startReload();
  if (e.code === 'KeyX' && !e.repeat) S.ads = !S.ads;
  if (e.code === 'KeyI' && !e.repeat) S.inspect = !S.inspect;
  if (S.settings.laptop && e.code === 'KeyQ' && !e.repeat && !isDriving() && !rcArmed()) S.straf = true;
  if (S.settings.laptop && e.code === 'KeyE' && !e.repeat && S.isLocked && !isDriving() && !rcArmed()) setFiring(true);
  if (e.code === 'KeyY' && !e.repeat) toggleTrace();
  if (e.code === 'KeyV' && !e.repeat) toggleRadar();
  if (e.code === 'KeyY' && !e.repeat && FLASH_DEBUG) {
    const F = FLASH[curWeaponName()];
    const json = JSON.stringify({ [curWeaponName()]: { pos: F.pos.map(function(v) { return +v.toFixed(3); }), size: F.size } }, null, 1);
    console.log(json);
    navigator.clipboard.writeText(json).then(function() {
      flashDbg.textContent = 'COPIED!';
      setTimeout(function() { flashDbg.textContent = ''; }, 1000);
    });
  }


  if (e.code === 'KeyJ' && !e.repeat && window.__gaultTurrets) {
    const ts = window.__gaultTurrets.map(function(t) {
      return { x: +t.x.toFixed(2), z: +t.z.toFixed(2), yaw: +(THREE.MathUtils.radToDeg(t.yaw)).toFixed(1), hp: t.hp, dead: t.dead, cert: Math.round(t.cert) };
    });
    const out = JSON.stringify({ player: [camera.position.x, camera.position.z, +camera.position.y.toFixed(2)], turrets: ts });
    console.log(out);
    navigator.clipboard.writeText(out).then(function() {
      flashDbg.textContent = 'TURRETS COPIED!';
      setTimeout(function() { flashDbg.textContent = ''; }, 1200);
    });
  }
  if (!e.repeat && e.code === 'Digit6') { const wasArmed = rcArmed(); armRc(); if (!wasArmed && rcArmed()) setFiring(false); return; }
  if (!e.repeat && (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4' || e.code === 'Digit5')) {
    if (rcArmed()) unarm();
    switchWeapon(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(e.code));
  }


  if (e.code === 'Escape' && !e.repeat && !S.isLocked && !IS_HUDEDIT) openPause();


  if (e.code === 'KeyP' && !e.repeat) {
    if (IS_HUDEDIT) return;
    if (menuActive()) resumeGame();
    else openPause();
  }

  // ponytail: dev cheat — H in the settings unlocks campaign + grants 9k CC
  if (e.code === 'KeyH' && !e.repeat && inSettingsView()) cheatUnlockAll();
});
document.addEventListener('keyup', function(e) {
  if (S.settings.laptop && e.code === 'KeyQ' && !S.settings.strafLock) S.straf = false;
  if (S.settings.laptop && e.code === 'KeyE') setFiring(false);
  S.keys[e.code] = false;
});
