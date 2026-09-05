

import { gunScene } from './core.js';

export const S = {
  keys: {},
  euler: new THREE.Euler(0, 0, 0, 'YXZ'),
  isLocked: false,
  everLocked: false,
  settings: { strafLock: false, laptop: false, aimAssist: 1.12 },


  straf: false,
  ads: false,
  prone: false,
  supine: false,
  inspect: false,
  airborne: false,


  aimErr: new THREE.Vector2(),
  aimErrT: new THREE.Vector2(),
  DEADZONE: 0.16,
  AIM_RANGE_X: 0.5, AIM_RANGE_Y: 0.4,
  aimShift: 0,


  lookDX: 0, lookDY: 0,
  sway: new THREE.Vector2(),


  recoilT: new THREE.Vector2(),
  recoil: new THREE.Vector2(),
  kickZ: 0,


  fovPunch: 0, shakeX: 0, shakeY: 0, caKick: 0,
  BASE_FOV: 70,
  zoomCur: 70,

  wallProx: 0,


  hp: 40, maxHp: 40, dead: false,
  mapCC: 0, mapDeaths: 0,
  mapBoxes: 0,
  mapGrenades: 4,
  respawnRequested: false,
  spawn: null,
  hpFlash: 0,
  deathDirX: 0, deathDirZ: 0,
  killerPos: null, killerYaw: 0,


  hub: false,
  mapName: '',

  pvp: false,
  pvpTeam: 1,
  killLimit: 10,
  kills: 0,
  pvpThem: 0,
  pvpPeerName: '',
  pvpLobby: false,
  pvpQuit: null,
  pvpBoom: null,
  won: false,
  story: false,
  storyData: null,
  paused: false,
  photo: false,


  worldReady: false,
  pendingLoads: 0,
  carDriving: false,
};

window.__gaultS = S;


export function takeLook() { const l = [S.lookDX, S.lookDY]; S.lookDX = 0; S.lookDY = 0; return l; }


export const GUN_POS = new THREE.Vector3(-0.75, -1.25, -1.5);
export const GUN_ROT = { x: 0.05, y: 0.12, z: -0.07 };
export const GUN_SCALE = 2.85;
export const STOCK_Z = -0.5 * GUN_SCALE;

export const ADS_POS = new THREE.Vector3(0, -0.45, -1.15);
export const ADS_ROT = new THREE.Vector3(0, 0, 0);


export const recoilPivot = new THREE.Group();
recoilPivot.position.copy(GUN_POS);
gunScene.add(recoilPivot);

export function inGun(o) { while (o) { if (o === recoilPivot) return true; o = o.parent; } return false; }
