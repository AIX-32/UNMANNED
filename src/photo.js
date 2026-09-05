import { camera, renderer, postMat } from './core.js';
import { S } from './state.js';
import { openPause } from './ui.js';

let savedFov = 70, savedCA = 0.02, savedVhs = 0, savedNoise = 0.03;

// UI
const wrap = document.createElement('div');
wrap.style.cssText = 'position:fixed;left:12px;top:12px;z-index:30;display:none;flex-direction:column;gap:8px;background:rgba(0,0,0,0.72);border:1px solid #fff;padding:12px;width:260px;font:600 12px Tomorrow,monospace;color:#fff;';
wrap.innerHTML = `
<div style="font:700 16px Tomorrow,monospace;text-align:center">PHOTO MODE</div>
<label>FOV <span id="pvFov">70</span><br><input id="inFov" type="range" min="20" max="110" value="70" style="width:100%"></label>
<label>CA <span id="pvCA">0.02</span><br><input id="inCA" type="range" min="0" max="0.5" step="0.01" value="0.02" style="width:100%"></label>
<label>VHS <span id="pvVhs">0.00</span><br><input id="inVhs" type="range" min="0" max="1" step="0.05" value="0" style="width:100%"></label>
<label>NOISE <span id="pvNoise">0.03</span><br><input id="inNoise" type="range" min="0" max="0.12" step="0.01" value="0.03" style="width:100%"></label>
<div style="font-size:11px;opacity:0.7;line-height:1.3">WASD fly &bull; Q/E up/down &bull; Shift fast &bull; G unlock mouse to use controls &bull; Wheel zoom</div>
<div style="display:flex;gap:8px">
<button id="btnShot" style="flex:1;padding:8px;cursor:pointer;background:#fff;color:#000;border:none;font:700 13px Tomorrow,monospace">TAKE PHOTO</button>
<button id="btnExit" style="flex:1;padding:8px;cursor:pointer;background:transparent;color:#fff;border:1px solid #fff;font:700 13px Tomorrow,monospace">EXIT</button>
</div>
<div id="photoMsg" style="font-size:11px;min-height:14px;text-align:center"></div>
`;
document.body.appendChild(wrap);
const inFov = wrap.querySelector('#inFov'), inCA = wrap.querySelector('#inCA'), inVhs = wrap.querySelector('#inVhs'), inNoise = wrap.querySelector('#inNoise');
const pvFov = wrap.querySelector('#pvFov'), pvCA = wrap.querySelector('#pvCA'), pvVhs = wrap.querySelector('#pvVhs'), pvNoise = wrap.querySelector('#pvNoise');
const msg = wrap.querySelector('#photoMsg');

function syncLabels(){
  pvFov.textContent = inFov.value;
  pvCA.textContent = (+inCA.value).toFixed(2);
  pvVhs.textContent = (+inVhs.value).toFixed(2);
  pvNoise.textContent = (+inNoise.value).toFixed(2);
}
inFov.addEventListener('input', function(){ camera.fov = +inFov.value; camera.updateProjectionMatrix(); syncLabels(); });
inCA.addEventListener('input', function(){ postMat.uniforms.uCA.value = +inCA.value; syncLabels(); });
inVhs.addEventListener('input', function(){ postMat.uniforms.uVhs.value = +inVhs.value; syncLabels(); });
inNoise.addEventListener('input', function(){ postMat.uniforms.uNoise.value = +inNoise.value; syncLabels(); });

wrap.querySelector('#btnExit').addEventListener('click', leavePhoto);
wrap.querySelector('#btnShot').addEventListener('click', takePhoto);

function leavePhoto(){ exitPhoto(); releaseLock(); openPause(); }

export function isPhoto(){ return S.photo; }

export function enterPhoto(){
  if (S.hub || S.story || S.won || S.dead) return;
  S.photo = true;
  S.paused = true;
  savedFov = camera.fov; savedCA = postMat.uniforms.uCA.value; savedVhs = postMat.uniforms.uVhs.value; savedNoise = postMat.uniforms.uNoise.value;
  inFov.value = Math.round(camera.fov); inCA.value = savedCA.toFixed(2); inVhs.value = savedVhs; inNoise.value = savedNoise;
  syncLabels();
  wrap.style.display = 'flex';
  msg.textContent = '';
  requestLock();
}

export function exitPhoto(){
  if (!S.photo) return;
  S.photo = false;
  S.paused = false;
  wrap.style.display = 'none';
  camera.fov = savedFov; camera.updateProjectionMatrix();
  postMat.uniforms.uCA.value = savedCA;
  postMat.uniforms.uVhs.value = savedVhs;
  postMat.uniforms.uNoise.value = savedNoise;
  msg.textContent = '';
}

function takePhoto(){
  // ponytail: single canvas dump, no extra libs
  try{
    const url = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url; a.download = 'gault_photo_' + Date.now() + '.png';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ a.remove(); }, 500);
    msg.textContent = 'SAVED ✓';
    msg.style.color = '#8f8';
  }catch(e){
    // fallback: try blob
    try{
      renderer.domElement.toBlob(function(blob){
        if (!blob){ msg.textContent='FAILED'; msg.style.color='#f88'; return; }
        const url = URL.createObjectURL(blob);
        const a=document.createElement('a'); a.href=url; a.download='gault_photo_'+Date.now()+'.png'; a.click();
        setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 1000);
        msg.textContent='SAVED ✓'; msg.style.color='#8f8';
      }, 'image/png');
    }catch(e2){ msg.textContent='FAILED: '+e2.message; msg.style.color='#f88'; }
  }
  setTimeout(function(){ msg.textContent=''; }, 2000);
}

// fly
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3();

export function requestLock(){
  if (S.photo && document.pointerLockElement !== renderer.domElement) {
    const p = renderer.domElement.requestPointerLock();
    if (p && p.catch) p.catch(function(){});
  }
}
export function releaseLock(){
  if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
}

// mouse look while pointer is locked
document.addEventListener('mousemove', function(e){
  if (!S.photo || !S.isLocked) return;
  const sens = 0.002;
  S.euler.y -= e.movementX * sens;
  S.euler.x = THREE.MathUtils.clamp(S.euler.x - e.movementY * sens, -1.55, 1.55);
});

export function updatePhoto(dt){
  if (!S.photo) return;
  camera.quaternion.setFromEuler(S.euler);
  const speed = (S.keys['ShiftLeft']||S.keys['ShiftRight']) ? 18 : 6;
  _fwd.set(0,0,-1).applyQuaternion(camera.quaternion);
  _right.set(1,0,0).applyQuaternion(camera.quaternion);
  let dx=0, dy=0, dz=0;
  if (S.keys['KeyW']) { dx+=_fwd.x; dy+=_fwd.y; dz+=_fwd.z; }
  if (S.keys['KeyS']) { dx-=_fwd.x; dy-=_fwd.y; dz-=_fwd.z; }
  if (S.keys['KeyA']) { dx-=_right.x; dy-=_right.y; dz-=_right.z; }
  if (S.keys['KeyD']) { dx+=_right.x; dy+=_right.y; dz+=_right.z; }
  if (S.keys['KeyQ']) dy -= 1;
  if (S.keys['KeyE']) dy += 1;
  if (S.keys['Space']) dy += 1;
  const len = Math.hypot(dx,dy,dz);
  if (len>0){
    dx/=len; dy/=len; dz/=len;
    camera.position.x += dx*speed*dt;
    camera.position.y += dy*speed*dt;
    camera.position.z += dz*speed*dt;
  }
}

// wheel zoom in photo
window.addEventListener('wheel', function(e){
  if (!S.photo) return;
  e.preventDefault();
  const v = +inFov.value - e.deltaY*0.04;
  inFov.value = Math.max(20, Math.min(110, Math.round(v)));
  camera.fov = +inFov.value; camera.updateProjectionMatrix(); syncLabels();
}, { passive:false });

document.addEventListener('keydown', function(e){
  if (!S.photo || e.repeat) return;
  if (e.code === 'KeyG') { e.preventDefault(); S.isLocked ? releaseLock() : requestLock(); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); leavePhoto(); }
});
