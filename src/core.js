
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1512);
scene.fog = new THREE.FogExp2(0x1a1512, 0.012);

export const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 2, 5);
camera.lookAt(0, 1, 0);

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setClearColor(0x1a1512);
document.body.appendChild(renderer.domElement);


const PIXEL_SCALE = 4;
const rt = new THREE.WebGLRenderTarget(Math.floor(window.innerWidth / PIXEL_SCALE), Math.floor(window.innerHeight / PIXEL_SCALE));
rt.texture.minFilter = THREE.NearestFilter;
rt.texture.magFilter = THREE.NearestFilter;
rt.texture.generateMipmaps = false;
const postScene = new THREE.Scene();
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);




export const shockwaves = [];
const _proj = new THREE.Vector3();
export let frameNow = 0;
export const postMat = new THREE.ShaderMaterial({
  uniforms: {
    tDiffuse: { value: rt.texture }, uTime: { value: 0 }, uCA: { value: 0.02 },
    uShock: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: [
    'varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uTime; uniform float uCA; uniform vec4 uShock[4];',
    'void main(){',

    '  vec2 suv = vUv;',
    '  for (int i = 0; i < 4; i++) {',
    '    vec2 sp = uShock[i].xy;',
    '    float r = uShock[i].z;',
    '    float w = uShock[i].w;',
    '    float d = distance(vUv, sp);',
    '    vec2 dirv = (vUv - sp) / max(d, 0.001);',
    '    float ring = sin((d - r) * 44.0) * exp(-(d - r) * (d - r) * 260.0);',
    '    suv += dirv * ring * 0.035 * w;',
    '  }',

    '  float d = distance(suv, vec2(0.5));',
    '  float ca = d * d * uCA;',
    '  vec3 c;',
    '  c.r = texture2D(tDiffuse, suv + vec2(ca, 0.0)).r;',
    '  c.g = texture2D(tDiffuse, suv).g;',
    '  c.b = texture2D(tDiffuse, suv - vec2(ca, 0.0)).b;',

    '  float l = dot(c, vec3(0.299,0.587,0.114));',
    '  c = mix(vec3(l), c, 1.05);',
    '  c = floor(c * 32.0 + 0.5) / 32.0;',

    '  c += (fract(sin(dot(suv * 400.0, vec2(12.9898,78.233)) + uTime * 60.0)) - 0.5) * 0.03;',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'
  ].join('\n')
});
const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
postQuad.frustumCulled = false;
postScene.add(postQuad);

window.addEventListener('resize', function() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  rt.setSize(Math.floor(window.innerWidth / PIXEL_SCALE), Math.floor(window.innerHeight / PIXEL_SCALE));
});


export function renderFrame(now) {
  frameNow = now;
  postMat.uniforms.uTime.value = now;

  const arr = postMat.uniforms.uShock.value;
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    if (now - s.t0 >= s.dur) { shockwaves.splice(i, 1); continue; }
  }
  for (let i = 0; i < 4; i++) {
    const v = arr[i];
    if (i < shockwaves.length) {
      const s = shockwaves[i];
      const t = (now - s.t0) / s.dur;
      _proj.copy(s.pos).project(camera);
      if (_proj.z > 1) { v.set(0, 0, 0, 0); continue; }
      const dist = camera.position.distanceTo(s.pos);
      v.set(_proj.x * 0.5 + 0.5, _proj.y * 0.5 + 0.5, t * THREE.MathUtils.clamp(12.0 / Math.max(dist, 1), 0.05, 0.9), 1 - t);
    } else v.set(0, 0, 0, 0);
  }
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(gunScene, camera);
  renderer.autoClear = true;
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
}


export const gunScene = new THREE.Scene();
export const gunAmbient = new THREE.AmbientLight(0x403030, 0.5);
gunScene.add(gunAmbient);
export const gunKey = new THREE.DirectionalLight(0xff6a2a, 1.1);
gunKey.position.set(20, 40, 10);
gunScene.add(gunKey);
export const gunHemi = new THREE.HemisphereLight(0x2a3545, 0x1a1410, 0.5);
gunScene.add(gunHemi);

window.__gaultCamera = camera;
window.__gaultScene = scene;
