
export const actx = new (window.AudioContext || window.webkitAudioContext)();

function decode(url, store) {
  fetch(url).then(r => r.arrayBuffer()).then(b => actx.decodeAudioData(b)).then(store);
}

export const SHOT_DURATION = 0.13;
let stenBuffer = null;
let shotgunBuffer = null;
let reloadBuffer = null;
let shotgunReloadBuffer = null;
let sniperShotBuffer = null;
let sniperReloadBuffer = null;
let droneBuffer = null;
let explosionBuffer = null;
let mortarShotBuffer = null;
let mortarExplosionBuffer = null;
let ugvShotBuffer = null;
let sonarBuffer = null;
decode('assets/audio/sten.m4a', b => stenBuffer = b);
decode('assets/audio/shotgun_shot.mp3', b => shotgunBuffer = b);
decode('assets/audio/reload.mp3', b => reloadBuffer = b);
decode('assets/audio/shotgun_reload.mp3', b => shotgunReloadBuffer = b);
decode('assets/audio/sniper_shot.mp3', b => sniperShotBuffer = b);
decode('assets/audio/sniper_reload.mp3', b => sniperReloadBuffer = b);
decode('assets/audio/drone_flight.mp3', b => droneBuffer = b);
decode('assets/audio/explosion.mp3', b => explosionBuffer = b);
decode('assets/audio/mortar_shot.mp3', b => mortarShotBuffer = b);
decode('assets/audio/mortar_explosion.mp3', b => mortarExplosionBuffer = b);
decode('assets/audio/ugv_shot.mp3', b => ugvShotBuffer = b);
decode('assets/audio/sonar.mp3', b => sonarBuffer = b);
export function getDroneBuffer() { return droneBuffer; }




export const SONAR_DUR = 49.776;
let sonarGain = null;
let sonarStart = 0;
export function sonarPlay() {
  if (!sonarBuffer || sonarGain) return;
  const src = actx.createBufferSource();
  src.buffer = sonarBuffer;
  src.loop = true;
  sonarGain = actx.createGain();
  sonarGain.gain.value = 0.45;
  src.connect(sonarGain).connect(actx.destination);
  src.start();
  sonarStart = actx.currentTime;
}
export function sonarStop() {
  if (!sonarGain) return;
  const g = sonarGain;
  sonarGain = null;
  g.disconnect();
}
export function sonarPos() {
  return sonarGain ? (actx.currentTime - sonarStart) % SONAR_DUR : -1;
}

function play(buf, vol, dur) {
  if (!buf) return;
  const src = actx.createBufferSource();
  src.buffer = buf;
  const g = actx.createGain(); g.gain.value = vol;
  src.connect(g).connect(actx.destination);
  if (dur !== undefined) src.start(0, 0, dur); else src.start();
}

function playRate(buf, vol, dur, rate) {
  if (!buf) return;
  const src = actx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = actx.createGain(); g.gain.value = vol;
  src.connect(g).connect(actx.destination);
  if (dur !== undefined) src.start(0, 0, dur); else src.start();
}

export function stenShot() { play(stenBuffer, 0.5, SHOT_DURATION); }
export function shutShot() { play(shotgunBuffer, 0.8); }
export function stenTail() { play(stenBuffer, 0.5); }
export function sniperShot() { play(sniperShotBuffer, 1.0); }
export function eagleShot() { playRate(stenBuffer, 0.6, SHOT_DURATION / 0.6, 0.6); }
export function explosion() { play(explosionBuffer, 1.0); }
export function mortarShot() { play(mortarShotBuffer, 0.9); }
export function mortarExplosion() { play(mortarExplosionBuffer, 1.0); }
export function ugvShot() { play(ugvShotBuffer, 1.0); }
export function turretShot() { play(stenBuffer, 0.2, 0.08); }
export function rocketShot() { playRate(ugvShotBuffer, 1.0, 0.9, 0.6); }


export function bashThud(hit) {
  if (!actx || actx.state !== 'running') return;
  const t = actx.currentTime;
  const len = Math.floor(actx.sampleRate * 0.16);
  const buf = actx.createBuffer(1, len, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const src = actx.createBufferSource();
  src.buffer = buf;
  const lp = actx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(hit ? 650 : 220, t);
  const g = actx.createGain();
  g.gain.setValueAtTime(hit ? 0.7 : 0.3, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  src.connect(lp).connect(g).connect(actx.destination);
  src.start(t, 0, 0.16);
}


export function reloadSound(i) {
  if (i === 8) return; // mortar has no reload sound
  if (i === 1 && shotgunReloadBuffer) play(shotgunReloadBuffer, 1);
  else if (i === 2 && sniperReloadBuffer) play(sniperReloadBuffer, 1);
  else play(reloadBuffer, 1);
}

document.addEventListener('click', function() { if (actx.state === 'suspended') actx.resume(); }, true);
