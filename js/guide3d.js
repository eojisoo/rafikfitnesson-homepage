// 짐스테이션 운동 가이드: 3D 모션 (three.js)
// 공통 무대(조명·카메라·사람 모델·관절 계산) + 기구별 "리그"(기구 모양·자세 계산)로 나뉩니다.
// 단위: 미터 · x = 사용자가 바라보는 앞쪽, y = 위, z = 좌우
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// 사람 모델: MakeHuman(CC0)으로 만든 근육형 남성 + 게임엔진용 뼈대
// 몸은 찰흙 질감, 정점마다 근육 번호(_MUSCLE)와 경계 가중치(_MW)가 들어 있어 운동별로 쓰는 근육만 색칠합니다.
const HUMAN_URL = 'assets/gymstation/guide/anatomy_male.glb';
const DRACO_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/';
// 근육 번호 (Blender 스크립트와 동일)
export const MUSCLE = { pec: 1, dfront: 2, dside: 3, drear: 4, biceps: 5, triceps: 6, forearm: 7, lats: 8, traps: 9, midback: 10, abs: 11, oblique: 12, erector: 13, glute: 14, quad: 15, ham: 16, calf: 17 };
// 근육 결 방향(결에 수직인 방향, 모델 좌표: x 바깥, y 위, z 앞)
const FIBER = { 8: [0.83, -0.55, 0], 10: [0.6, 0.8, 0], 4: [0.95, 0.3, 0], 5: [0.75, 0.67, 0], 1: [0, 1, 0], 6: [0.75, 0.67, 0], 9: [0.5, 0.86, 0] };

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);

// 찰흙 몸 + 근육 결이 보이는 근육 강조 재질
function anatomyMaterial() {
  const act = new Float32Array(18), fib = [];
  for (let i = 0; i < 18; i++) fib.push(new THREE.Vector3(...(FIBER[i] || [0, 1, 0])));
  const uniforms = { uAct: { value: act }, uFib: { value: fib }, uWork: { value: 0 } };
  const m = new THREE.MeshStandardMaterial({ color: 0xcfbfac, roughness: 0.86, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'attribute float _muscle;\nattribute float _mw;\nuniform float uAct[18];\nuniform vec3 uFib[18];\nvarying float vAct;\nvarying float vFib;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      int mid = int(_muscle + 0.5);
      vAct = uAct[mid] * _mw;
      vFib = dot(vec3(abs(position.x), position.y, position.z), uFib[mid]);`);
    sh.fragmentShader = 'uniform float uWork;\nvarying float vAct;\nvarying float vFib;\n' +
      sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float a = smoothstep(0.03, 0.55, vAct);
      float f1 = 0.5 + 0.5 * sin(vFib * 430.0);
      float f2 = 0.5 + 0.5 * sin(vFib * 1250.0 + sin(vFib * 70.0) * 3.0);
      vec3 deep = vec3(0.50, 0.09, 0.06), lite = vec3(0.86, 0.25, 0.15);
      vec3 mus = mix(deep, lite, f1 * 0.65 + f2 * 0.35);
      mus = mix(mus, vec3(1.0, 0.45, 0.16), uWork * 0.4 * smoothstep(0.7, 1.0, vAct));
      diffuseColor.rgb = mix(diffuseColor.rgb, mus, a);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(0.9, 0.28, 0.06) * uWork * 0.28 * smoothstep(0.35, 1.0, vAct);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.5, smoothstep(0.03, 0.55, vAct));`);
  };
  m.customProgramCacheKey = () => 'anatomy-v1';
  return { material: m, uniforms };
}

function mats() {
  return {
    frame: new THREE.MeshStandardMaterial({ color: 0x24282a, roughness: 0.38, metalness: 0.55 }),
    frameEdge: new THREE.MeshStandardMaterial({ color: 0x3a3f41, roughness: 0.3, metalness: 0.7 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xb9bfc2, roughness: 0.22, metalness: 1 }),
    pad: new THREE.MeshStandardMaterial({ color: 0x101111, roughness: 0.75, metalness: 0.05 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x141515, roughness: 0.85, metalness: 0.05 }),
    plate: new THREE.MeshStandardMaterial({ color: 0x161717, roughness: 0.7, metalness: 0.15 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x2a2e2d, roughness: 0.92, metalness: 0 }),
    path: new THREE.LineDashedMaterial({ color: 0xfe6201, dashSize: 0.035, gapSize: 0.035, transparent: true, opacity: 0.7 })
  };
}

// 사각 파이프 (두 점 사이)
function tube(a, b, s, mat, parent) {
  const d = b.clone().sub(a), len = d.length();
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, s, s), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(V(1, 0, 0), d.normalize());
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
// 여러 점을 잇는 꺾인 파이프 (이음매는 정육면체로 메움)
function bent(pts, s, mat, parent) {
  for (let i = 0; i < pts.length - 1; i++) tube(pts[i], pts[i + 1], s, mat, parent);
  for (let i = 1; i < pts.length - 1; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), mat); c.position.copy(pts[i]); c.castShadow = true; parent.add(c); }
}
function cyl(r, h, mat, axis = 'z') {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 28), mat);
  if (axis === 'z') m.rotation.x = Math.PI / 2; else if (axis === 'x') m.rotation.z = Math.PI / 2;
  m.castShadow = m.receiveShadow = true;
  return m;
}
function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}
// 원판 (z축 방향)
function plates(parent, M, pos, s, count = 2) {
  for (let i = 0; i < count; i++) {
    const pl = cyl(i ? 0.19 : 0.225, 0.04, M.plate, 'z'); pl.position.copy(pos).add(V(0, 0, (0.07 + i * 0.045) * s)); parent.add(pl);
    const hub = cyl(0.045, 0.045, M.frameEdge, 'z'); hub.position.copy(pl.position); parent.add(hub);
  }
}

// 두 관절 계산: 어깨 S, 손 H, 팔꿈치가 향할 방향 pole
function ik(S, H, a, b, pole) {
  const d = H.clone().sub(S); let len = d.length();
  len = Math.min(len, a + b - 0.001);
  const dir = d.normalize();
  const x = (a * a - b * b + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  const perp = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  return S.clone().add(dir.multiplyScalar(x)).add(perp.multiplyScalar(h));
}

// ============================================================
// 공통 무대
// ============================================================
function createStage(container, makeRig) {
  const M = mats();
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 50);

  scene.add(new THREE.HemisphereLight(0xf4f6f5, 0x1a1c1b, 0.45));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(2.6, 4.6, 3.2); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -2.2, right: 2.2, top: 3, bottom: -1, near: 0.5, far: 12 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; scene.add(key);
  const rim = new THREE.DirectionalLight(0xff8a3d, 0.7); rim.position.set(-3, 2.4, -2.5); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xbfd4ff, 0.35); fill.position.set(-1, 1.5, 4); scene.add(fill);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2.6, 64), M.floor);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, 'rgba(255,255,255,.10)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c); })();
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.set(-0.25, 0.002, 0); scene.add(glow);

  // 손잡이가 지나가는 길 (점선)
  const path = new THREE.Line(new THREE.BufferGeometry(), M.path); scene.add(path);
  const setPath = (pts) => { path.geometry.setFromPoints(pts); path.computeLineDistances(); };

  // ---------------- 사람 ----------------
  const human = { ready: false };
  const anat = anatomyMaterial();
  const clayMat = new THREE.MeshStandardMaterial({ color: 0xcfbfac, roughness: 0.86, metalness: 0 });
  const wpos = (o) => o.getWorldPosition(new THREE.Vector3());
  const tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion();
  // 뼈를 돌려서 자식 뼈(child)가 목표 지점을 향하게 함
  function aim(bone, child, target) {
    bone.updateWorldMatrix(true, true);
    const b = wpos(bone), c = wpos(child);
    const cur = c.sub(b).normalize(), des = target.clone().sub(b).normalize();
    if (cur.lengthSq() < 1e-8 || des.lengthSq() < 1e-8) return;
    const dq = tmpQ.setFromUnitVectors(cur, des);
    const bw = bone.getWorldQuaternion(new THREE.Quaternion());
    const pw = bone.parent.getWorldQuaternion(tmpQ2);
    bone.quaternion.copy(pw.invert().multiply(dq.multiply(bw)));
    bone.updateWorldMatrix(false, true);
  }
  // 기본 자세로 되돌리고 골반을 지정 위치에
  function resetBody(pelvisAt) {
    const { root, B, rest } = human;
    rest.forEach((q, b) => b.quaternion.copy(q));
    root.position.set(0, 0, 0); root.updateWorldMatrix(true, true);
    const pel = wpos(B.pelvis);
    root.position.set(pelvisAt.x - pel.x, pelvisAt.y - pel.y, -pel.z);
    root.updateWorldMatrix(true, true);
  }
  function moveBody(t) { human.root.position.add(t); human.root.updateWorldMatrix(true, true); }
  // 다리: 엉덩이 → 무릎 → 발목 (무릎은 pole 방향으로), 발은 바닥과 평행
  function leg(side, ankleTarget, pole, footDir = V(1, 0, 0)) {
    const { B, len } = human, x = side < 0 ? '_l' : '_r';
    const T = wpos(B['thigh' + x]);
    const K = ik(T, ankleTarget, len.thigh, len.shin, pole);
    aim(B['thigh' + x], B['calf' + x], K);
    aim(B['calf' + x], B['foot' + x], ankleTarget);
    const Af = wpos(B['foot' + x]);
    aim(B['foot' + x], B['ball' + x], Af.clone().add(footDir.clone().multiplyScalar(len.foot)).setY(Math.max(Af.y - len.foot * 0.55, ankleTarget.y - len.ankleH + 0.02)));
  }
  // 팔: 어깨 → 팔꿈치 → 손(주먹이 G를 쥠). 팔꿈치가 몸통 안으로 들어가지 않게 바깥쪽 유지
  function arm(side, G, pole) {
    const { B, len } = human, x = side < 0 ? '_l' : '_r';
    const S = wpos(B['upperarm' + x]);
    let E = ik(S, G, len.upper, len.fore + len.palm, pole);
    for (let k = 0; k < 6 && Math.abs(E.z) < Math.abs(S.z) + 0.03; k++) { pole = pole.clone().add(V(0, 0, 0.3 * side)).normalize(); E = ik(S, G, len.upper, len.fore + len.palm, pole); }
    aim(B['upperarm' + x], B['lowerarm' + x], E);
    const Ew = wpos(B['lowerarm' + x]);
    const dir = G.clone().sub(Ew).normalize();
    aim(B['lowerarm' + x], B['hand' + x], Ew.clone().add(dir.clone().multiplyScalar(len.fore)));
    const Wp = wpos(B['hand' + x]);
    aim(B['hand' + x], B['middle_01' + x], Wp.clone().add(dir.multiplyScalar(0.1)));
    return E;
  }
  // 손은 모든 운동에서 주먹: 기본 자세에서 손가락마다 손바닥 쪽으로 접히는 축을 찾아 두고 그 축으로 접음
  function setupFist() {
    const { root, rest } = human; const g = (n) => root.getObjectByName(n);
    const axes = [V(1, 0, 0), V(-1, 0, 0), V(0, 1, 0), V(0, -1, 0), V(0, 0, 1), V(0, 0, -1)];
    const plan = [];
    for (const sfx of ['_l', '_r']) {
      rest.forEach((q, b) => b.quaternion.copy(q)); root.updateWorldMatrix(true, true);
      const hp = wpos(g('hand' + sfx));
      const inward = V(0, 0, -Math.sign(hp.z));
      const pick = (bone, child, toward) => {
        let best = null, bestScore = -1e9; const r = bone.quaternion.clone(), c0 = wpos(child);
        for (const ax of axes) {
          bone.quaternion.copy(r).multiply(new THREE.Quaternion().setFromAxisAngle(ax, 0.7)); bone.updateWorldMatrix(false, true);
          const sc = wpos(child).sub(c0).dot(toward); if (sc > bestScore) { bestScore = sc; best = ax; }
        }
        bone.quaternion.copy(r); bone.updateWorldMatrix(false, true); return best;
      };
      for (const fn of ['index', 'middle', 'ring', 'pinky']) {
        const b1 = g(fn + '_01' + sfx), b2 = g(fn + '_02' + sfx), b3 = g(fn + '_03' + sfx);
        const a2 = pick(b2, b3, inward);
        plan.push([b1, pick(b1, b2, inward), 1.5], [b2, a2, 1.7], [b3, a2, 1.3]);
      }
      const t2 = g('thumb_02' + sfx), t3 = g('thumb_03' + sfx);
      const across = wpos(g('middle_02' + sfx)).sub(wpos(t2)).normalize();
      const ta = pick(t2, t3, across);
      plan.push([t2, ta, 0.7], [t3, ta, 0.6]);
    }
    rest.forEach((q, b) => b.quaternion.copy(q)); root.updateWorldMatrix(true, true);
    human.fist = plan;
  }
  function applyFist() { for (const [b, ax, a] of human.fist) b.quaternion.copy(human.rest.get(b)).multiply(new THREE.Quaternion().setFromAxisAngle(ax, a)); }

  const ctx = { THREE, V, M, scene, human, anat, wpos, aim, resetBody, moveBody, leg, arm, applyFist, setPath, tube, bent, cyl, box, plates, ik };
  const rig = makeRig(ctx);
  for (const [k, v] of Object.entries(rig.muscles || {})) anat.uniforms.uAct.value[MUSCLE[k]] = v;

  const draco = new DRACOLoader().setDecoderPath(DRACO_URL);
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const loadP = new Promise((resolve, reject) => loader.load(HUMAN_URL, (g) => { try { setupHuman(g.scene); resolve(); } catch (e) { reject(e); } }, undefined, reject));
  function setupHuman(root) {
    root.rotation.y = Math.PI / 2; // 모델 정면(+z) → 기구 앞쪽(+x)
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.material = o.geometry.attributes._muscle ? anat.material : clayMat; } });
    scene.add(root);
    const B = {};
    ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r',
      'middle_01_l', 'middle_01_r', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r', 'ball_l', 'ball_r'].forEach((n) => { B[n] = root.getObjectByName(n); if (!B[n]) throw Error('bone ' + n); });
    const rest = new Map(); root.traverse((o) => { if (o.isBone) rest.set(o, o.quaternion.clone()); });
    root.updateWorldMatrix(true, true);
    const d = (a, b) => wpos(B[a]).distanceTo(wpos(B[b]));
    const len = {
      upper: d('upperarm_l', 'lowerarm_l'), fore: d('lowerarm_l', 'hand_l'), palm: d('hand_l', 'middle_01_l') * 0.9,
      thigh: d('thigh_l', 'calf_l'), shin: d('calf_l', 'foot_l'), ankleH: wpos(B.foot_l).y, foot: d('foot_l', 'ball_l')
    };
    Object.assign(human, { root, B, rest, len });
    setupFist();
    rig.fit();
    human.ready = true;
  }

  // ---------------- 카메라 ----------------
  const target = rig.target;
  const VIEWS = rig.views;
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enablePan = false; controls.enableDamping = false;
  controls.minDistance = 2.2; controls.maxDistance = 7;
  controls.minPolarAngle = 0.35; controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.addEventListener('change', () => render());
  let fitK = 1;
  function placeView(name) { const v = VIEWS[name] || VIEWS.diag; camera.position.copy(target).add(v.clone().sub(target).multiplyScalar(fitK)); controls.update(); }
  let tween = 0;
  function setView(name) {
    const v = VIEWS[name]; if (!v) return;
    const from = camera.position.clone(), to = target.clone().add(v.clone().sub(target).multiplyScalar(fitK));
    const a = from.clone().sub(target), b = to.clone().sub(target), t0 = performance.now(), dur = 700;
    const sa = new THREE.Spherical().setFromVector3(a), sb = new THREE.Spherical().setFromVector3(b);
    let dTheta = sb.theta - sa.theta; if (dTheta > Math.PI) dTheta -= 2 * Math.PI; if (dTheta < -Math.PI) dTheta += 2 * Math.PI;
    cancelAnimationFrame(tween);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const sp = new THREE.Spherical(sa.radius + (sb.radius - sa.radius) * e, sa.phi + (sb.phi - sa.phi) * e, sa.theta + dTheta * e);
      camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(sp)); controls.update(); render();
      if (k < 1) tween = requestAnimationFrame(step);
    };
    tween = requestAnimationFrame(step);
  }
  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    const nk = w / h < 1.15 ? 1.32 : 1;
    if (nk !== fitK) { camera.position.sub(target).multiplyScalar(nk / fitK).add(target); fitK = nk; controls.update(); }
    camera.updateProjectionMatrix(); render();
  }
  const ro = new ResizeObserver(resize); ro.observe(container);

  // ---------------- 동작 ----------------
  let last = { p: 0, ph: 0 };
  function pose(p, ph) {
    last = { p, ph };
    rig.poseMachine(p);
    if (human.ready) { rig.poseHuman(p); }
    anat.uniforms.uWork.value = ph === 1 || ph === 2 ? 1 : ph === 3 ? 0.55 : 0.15;
    render();
  }
  function render() { renderer.render(scene, camera); }
  placeView('diag'); resize(); pose(0, 0);
  loadP.then(() => pose(last.p, last.ph)).catch((e) => console.error('human load failed', e));
  return {
    draw: pose, ready: loadP, setView,
    dispose() { cancelAnimationFrame(tween); pmrem.dispose(); draco.dispose(); ro.disconnect(); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); }
  };
}

// ============================================================
// 기구 1: 원판식 하이 로우 (LEXCO MasterPro)
// ============================================================
function highRowRig(ctx) {
  const { scene, M, human, wpos, aim, resetBody, leg, arm, applyFist, setPath } = ctx;
  const mach = new THREE.Group(); scene.add(mach);
  const T = 0.075, Y0 = 0.04;
  const P = V(-0.9, 1.9);   // 레버 회전축 (머리 뒤 위쪽)
  let R = 1.36;             // 회전축 → 손잡이 길이 (체형에 맞춰 다시 계산)
  let A0 = -15 * Math.PI / 180, A1 = -45 * Math.PI / 180;
  for (const z of [-0.55, 0.55]) tube(V(-1.55, Y0, z), V(0.72, Y0, z * 0.62), T, M.frame, mach);
  tube(V(-1.55, Y0, -0.55), V(-1.55, Y0, 0.55), T, M.frame, mach);
  tube(V(0.72, Y0, -0.34), V(0.72, Y0, 0.34), T, M.frame, mach);
  tube(V(-0.35, Y0, -0.5), V(-0.35, Y0, 0.5), T, M.frame, mach);
  tube(V(-0.35, Y0, 0), V(0.72, Y0, 0), T, M.frame, mach);
  for (const s of [-1, 1]) {
    const z = 0.5 * s;
    tube(V(-1.5, Y0, z), V(-0.93, 1.92, z), T, M.frame, mach);
    bent([V(-0.36, Y0, z), V(-0.48, 0.78, z), V(-0.78, 1.28, z), V(-0.88, 1.88, z)], T, M.frame, mach);
    tube(V(-1.27, 0.78, z), V(-0.48, 0.78, z), T * 0.9, M.frame, mach);
    const horn = cyl(0.026, 0.22, M.chrome, 'z'); horn.position.set(-0.98, 0.62, z + 0.13 * s); mach.add(horn);
    const horn2 = cyl(0.026, 0.22, M.chrome, 'z'); horn2.position.set(-1.12, 1.08, z + 0.13 * s); mach.add(horn2);
    const hub = cyl(0.075, 0.13, M.frameEdge, 'z'); hub.position.set(P.x, P.y, z); mach.add(hub);
    const cap = cyl(0.03, 0.15, M.chrome, 'z'); cap.position.set(P.x, P.y, z); mach.add(cap);
  }
  tube(V(-0.93, 2.0, -0.56), V(-0.93, 2.0, 0.56), T, M.frame, mach);
  tube(V(-0.78, 1.28, -0.5), V(-0.78, 1.28, 0.5), T * 0.9, M.frame, mach);
  tube(V(-1.05, 2.06, 0), V(0.15, 2.06, 0), 0.09, M.frame, mach);
  tube(V(-0.93, 2.0, 0), V(-1.05, 2.06, 0), 0.09, M.frame, mach);
  // 좌석 (높이 조절식)
  tube(V(-0.02, Y0, 0), V(-0.02, 0.36, 0), 0.07, M.frame, mach);
  const seatG = new THREE.Group(); mach.add(seatG);
  const seatPost = box(0.05, 0.42, 0.05, M.chrome); seatPost.position.set(-0.02, 0.3, 0); seatG.add(seatPost);
  const seat = box(0.44, 0.08, 0.36, M.pad); seat.position.set(0.02, 0.53, 0); seatG.add(seat);
  const seatBase = box(0.38, 0.03, 0.3, M.frame); seatBase.position.set(0.02, 0.48, 0); seatG.add(seatBase);
  // 허벅지 고정 패드 (높이 조절식)
  tube(V(0.6, Y0, 0), V(0.6, 0.5, 0), 0.065, M.frame, mach);
  const padG = new THREE.Group(); mach.add(padG);
  const padPost = box(0.045, 0.4, 0.045, M.chrome); padPost.position.set(0.6, 0.5, 0); padG.add(padPost);
  bent([V(0.6, 0.66, 0), V(0.42, 0.82, 0)], 0.06, M.frame, padG);
  for (const s of [-1, 1]) { const roll = cyl(0.062, 0.2, M.pad, 'z'); roll.position.set(0.4, 0.8, 0.13 * s); padG.add(roll); }
  const rollAxle = cyl(0.02, 0.06, M.chrome, 'z'); rollAxle.position.set(0.4, 0.8, 0); padG.add(rollAxle);

  // 레버 (좌우 따로) — 길이 R이 바뀌면 다시 만듦
  const GZ = 0.27;
  let levers = [];
  function buildLevers() {
    for (const lv of levers) { scene.remove(lv.pivot); lv.pivot.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    levers = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(P.x, P.y, 0.42 * s); scene.add(pivot);
      const armG = new THREE.Group(); pivot.add(armG);
      const dz = (GZ - 0.42) * s;
      tube(V(-0.42, 0, 0), V(R - 0.08, 0, dz), 0.08, M.frame, armG);
      tube(V(R - 0.1, 0.02, dz), V(R, -0.04, dz), 0.06, M.frame, armG);
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.17, 18), M.rubber);
      grip.position.set(R + 0.005, -0.12, dz); grip.rotation.z = 0.25; grip.castShadow = true; armG.add(grip);
      const gripEnd = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 18), M.chrome); gripEnd.position.set(R + 0.027, -0.205, dz); gripEnd.rotation.z = 0.25; armG.add(gripEnd);
      const horn = cyl(0.026, 0.26, M.chrome, 'z'); horn.position.set(-0.42, 0, 0.13 * s); armG.add(horn);
      plates(armG, M, V(-0.42, 0, 0), s);
      levers.push({ pivot, armG, s });
    }
  }
  buildLevers();
  const handWorld = (ang, s, z = GZ) => { const lx = R + 0.005, ly = -0.12, c = Math.cos(ang), n = Math.sin(ang); return V(P.x + lx * c - ly * n, P.y + lx * n + ly * c, z * s); };
  const pathPts = () => { const pts = []; for (let i = 0; i <= 40; i++) pts.push(handWorld(A0 + (A1 - A0) * i / 40, 1, GZ + 0.12)); return pts; };
  setPath(pathPts());

  // 앉은 자세: 상체 살짝 뒤로, 허벅지는 패드 아래, 발은 바닥
  function poseBody(p) {
    const { B, len } = human;
    resetBody(V(0.02, human.hipY, 0));
    const lean = 0.07 + 0.05 * p;
    const sp = wpos(B.spine_01), L = wpos(B.neck_01).distanceTo(sp);
    aim(B.spine_01, B.neck_01, sp.clone().add(V(-Math.sin(lean) * L, Math.cos(lean) * L, 0)));
    const nk = wpos(B.neck_01);
    aim(B.neck_01, B.head, nk.clone().add(V(0.02, wpos(B.head).distanceTo(nk), 0)));
    for (const [c, u] of [['clavicle_l', 'upperarm_l'], ['clavicle_r', 'upperarm_r']]) aim(B[c], B[u], wpos(B[u]).add(V(-0.035 * p, -0.02 * p + 0.01, 0)));
    for (const s of [-1, 1]) {
      const Tp = wpos(B[s < 0 ? 'thigh_l' : 'thigh_r']);
      const K = Tp.clone().add(V(len.thigh * Math.cos(-0.05), len.thigh * Math.sin(-0.05), 0.02 * s));
      const dy = K.y - len.ankleH;
      const A = dy < len.shin ? V(K.x + Math.min(0.3, Math.sqrt(len.shin * len.shin - dy * dy)), len.ankleH, K.z + 0.01 * s) : K.clone().add(V(0.03, -len.shin, 0));
      leg(s, A, V(1, 0.2, 0.15 * s).normalize());
    }
  }

  return {
    muscles: { lats: 1, midback: 0.8, drear: 0.75, biceps: 0.65 },
    target: V(-0.25, 1.05, 0),
    views: { side: V(-0.2, 1.3, 3.75), front: V(3.2, 1.4, 0.5), diag: V(2.1, 1.75, 2.6), back: V(-3.3, 1.65, 1.2) },
    // 실제 하이 로우 궤적에 맞춰 좌석 높이·레버 길이·각도를 계산
    //  시작: 팔을 위·앞으로 거의 다 뻗음(어깨에서 약 42° 위) / 끝: 손은 윗가슴 앞, 팔꿈치는 옆구리 뒤·바깥
    fit() {
      const { B, len } = human;
      human.hipY = 0.65; poseBody(0);
      const S0 = wpos(B.upperarm_r), shH = S0.y - human.hipY;
      const dz = GZ - Math.abs(S0.z);
      const reach = Math.sqrt(Math.pow((len.upper + len.fore + len.palm) * 0.96, 2) - dz * dz);
      const th = 42 * Math.PI / 180;
      const a = { x: reach * Math.cos(th), y: reach * Math.sin(th) }, b = { x: 0.14, y: -0.13 };
      const c = (b.x * b.x + b.y * b.y - a.x * a.x - a.y * a.y) / 2;
      let Sy = P.y - (c - (b.x - a.x) * (P.x - S0.x)) / (b.y - a.y);
      human.hipY = Math.min(0.85, Math.max(0.5, Sy - shH)); Sy = human.hipY + shH;
      const G0 = { x: S0.x + a.x, y: Sy + a.y }, G1 = { x: S0.x + b.x, y: Sy + b.y };
      const dist = Math.hypot(G0.x - P.x, G0.y - P.y);
      R = Math.sqrt(Math.max(0.01, dist * dist - 0.0144)) - 0.005;
      const off = Math.atan2(-0.12, R + 0.005);
      A0 = Math.atan2(G0.y - P.y, G0.x - P.x) - off;
      A1 = Math.atan2(G1.y - P.y, G1.x - P.x) - off;
      buildLevers();
      seatG.position.y = human.hipY - 0.085 - 0.57;
      padG.position.y = human.hipY + 0.07 + 0.065 - 0.8;
      setPath(pathPts());
    },
    poseMachine(p) { const ang = A0 + (A1 - A0) * p; for (const lv of levers) lv.armG.rotation.z = ang; },
    poseHuman(p) {
      const ang = A0 + (A1 - A0) * p;
      poseBody(p); applyFist();
      for (const s of [-1, 1]) arm(s, handWorld(ang, s), V(-0.55, -0.8, 0.32 * s).normalize());
    }
  };
}

// ============================================================
// 기구 2: 체스트 서포트 티바 로우 (원판식)
// ============================================================
function tBarRowRig(ctx) {
  // 체스트 서포트 티바 로우 (원판식)
  //  - 허리 높이의 거의 평평한 패드(약 20°)에 가슴을 대고, 다리는 뒤쪽 발판으로 길게 뻗어 몸이 거의 수평
  //  - 레버는 뒤쪽 발판 옆 기둥 아래 회전축에서 앞으로 길게 뻗고, 끝에 Y자 손잡이와 원판 봉
  //  - 손잡이는 무릎 높이에서 시작해 패드 아래 가슴까지 길게 끌어올림 (패러럴 그립, 팔꿈치는 몸 가까이)
  const { scene, M, human, wpos, aim, resetBody, moveBody, leg, arm, applyFist, setPath } = ctx;
  const mach = new THREE.Group(); scene.add(mach);
  const T = 0.08, Y0 = 0.04;
  // 가슴 패드: 허리 높이, 앞쪽이 살짝 높게 20°
  const PA = 20 * Math.PI / 180, u = V(Math.cos(PA), Math.sin(PA)), n = V(-Math.sin(PA), Math.cos(PA));
  const PADL = 0.56, PADT = 0.09;
  const padLow = V(-0.3, 0.9);
  const padCenter = padLow.clone().add(u.clone().multiplyScalar(PADL / 2));
  const padTop = padLow.clone().add(u.clone().multiplyScalar(PADL));
  const pad = box(PADL, PADT, 0.34, M.pad); pad.position.copy(padCenter); pad.rotation.z = PA; mach.add(pad);
  const padBase = box(PADL * 0.7, 0.04, 0.2, M.frameEdge); padBase.position.copy(padCenter).add(n.clone().multiplyScalar(-PADT / 2 - 0.02)); padBase.rotation.z = PA; mach.add(padBase);
  const under = padCenter.clone().add(n.clone().multiplyScalar(-PADT / 2 - 0.05));
  // 뒤쪽 기둥: 발판 앞에서 패드 뒤쪽 아래까지 (사진처럼 약간 기울어짐)
  const postBase = V(-0.55, Y0), postTop = padLow.clone().add(u.clone().multiplyScalar(0.08)).add(n.clone().multiplyScalar(-0.08));
  tube(postBase, postTop, T, M.frame, mach);
  // 앞쪽 A자 다리: 패드 앞쪽 아래 → 바닥 앞 좌우
  const J = padLow.clone().add(u.clone().multiplyScalar(PADL * 0.78)).add(n.clone().multiplyScalar(-0.09));
  for (const s of [-1, 1]) bent([V(0.55, Y0, 0.34 * s), V(0.4, 0.42, 0.2 * s), J.clone().setZ(0.05 * s)], T, M.frame, mach);
  tube(J.clone().setZ(-0.07), J.clone().setZ(0.07), T, M.frame, mach);
  tube(postTop, J, T * 0.9, M.frame, mach); // 패드 아래 받침 빔
  for (const s of [-1, 1]) { const ft = box(0.14, 0.02, 0.1, M.rubber); ft.position.set(0.56, 0.01, 0.34 * s); mach.add(ft); }
  tube(V(0.42, 0.38, -0.24), V(0.42, 0.38, 0.24), 0.05, M.frame, mach); // 손잡이 받침대
  // 발판 (2단, 위치는 체형에 맞춰)
  const stepG = new THREE.Group(); mach.add(stepG);
  const stepLo = box(0.42, 0.04, 0.6, M.rubber); stepLo.position.set(-0.12, 0, 0); stepG.add(stepLo);
  const stepHi = box(0.26, 0.035, 0.5, M.rubber); stepHi.position.set(0.18, 0.13, 0); stepG.add(stepHi);
  const stepArm = box(0.06, 0.13, 0.06, M.frame); stepArm.position.set(0.28, 0.06, 0); stepG.add(stepArm);
  // 레버 회전축 (기둥 아래, 노란 핀)
  const P = V(-0.48, 0.2);
  const hub = cyl(0.05, 0.18, M.frameEdge, 'z'); hub.position.copy(P); mach.add(hub);
  const pin = cyl(0.03, 0.22, new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.4 }), 'z'); pin.position.copy(P); mach.add(pin);
  let R = 0.95, A0 = 0.2, A1 = 0.7;
  const GZ = 0.2;   // 패러럴 손잡이 좌우 위치
  const GL = 0.16;  // 손잡이 길이 (앞뒤 방향)
  let lever = null;
  function buildLever() {
    if (lever) { scene.remove(lever); lever.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    lever = new THREE.Group(); lever.position.copy(P); scene.add(lever);
    tube(V(0, 0), V(R - 0.1, 0), 0.055, M.frame, lever);
    // Y자 받침: 레버 끝에서 좌우로 벌어져 위로 올라온 패러럴 손잡이
    for (const s of [-1, 1]) {
      tube(V(R - 0.14, 0), V(R - 0.02, 0.1, 0.12 * s), 0.05, M.frame, lever);
      tube(V(R - 0.02, 0.1, 0.12 * s), V(R - 0.02, 0.1, GZ * s), 0.045, M.frame, lever);
      const g = cyl(0.019, GL, M.rubber, 'x'); g.position.set(R + 0.06, 0.1, GZ * s); lever.add(g);
      const e = cyl(0.022, 0.015, M.chrome, 'x'); e.position.set(R + 0.06 + GL / 2 + 0.005, 0.1, GZ * s); lever.add(e);
      // 와이드 손잡이(바깥쪽, 사용 안 함)
      const w = cyl(0.019, 0.16, M.rubber, 'z'); w.position.set(R - 0.16, 0.02, 0.2 * s); lever.add(w);
    }
    tube(V(R - 0.16, 0.02, -0.12), V(R - 0.16, 0.02, 0.12), 0.05, M.frame, lever);
    // 앞으로 뻗은 원판 봉 + 원판
    const horn = cyl(0.026, 0.4, M.chrome, 'x'); horn.position.set(R + 0.2, -0.02, 0); lever.add(horn);
    for (let i = 0; i < 2; i++) { const pl = cyl(i ? 0.19 : 0.225, 0.04, M.plate, 'x'); pl.position.set(R + 0.1 + i * 0.045, -0.02, 0); lever.add(pl); }
  }
  buildLever();
  // 손(주먹 중심) 위치: 패러럴 손잡이 가운데
  const handWorld = (ang, s) => { const c = Math.cos(ang), sn = Math.sin(ang), lx = R + 0.06, ly = 0.1; return V(P.x + lx * c - ly * sn, P.y + lx * sn + ly * c, GZ * s); };
  const pathPts = () => { const pts = []; for (let i = 0; i <= 40; i++) pts.push(handWorld(A0 + (A1 - A0) * i / 40, 1).setZ(GZ + 0.12)); return pts; };

  // 기댄 자세: 몸통을 패드 기울기에 맞추고 가슴을 패드에 올림, 다리는 뒤 발판으로
  function poseBody(p) {
    const { B } = human;
    resetBody(V(0, 1.0, 0));
    const tilt = PA + 0.04 + 0.03 * p;       // 당길 때 가슴을 살짝 듦
    const dirT = V(Math.cos(tilt), Math.sin(tilt));
    aim(B.pelvis, B.spine_01, wpos(B.pelvis).add(dirT));
    aim(B.spine_01, B.neck_01, wpos(B.spine_01).add(dirT));
    const nk = wpos(B.neck_01), hl = wpos(B.head).distanceTo(nk);
    aim(B.neck_01, B.head, nk.clone().add(V(Math.cos(tilt + 0.55), Math.sin(tilt + 0.55)).multiplyScalar(hl))); // 시선은 앞쪽 아래
    for (const [c, uu] of [['clavicle_l', 'upperarm_l'], ['clavicle_r', 'upperarm_r']]) aim(B[c], B[uu], wpos(B[uu]).add(n.clone().multiplyScalar(0.035 * p)).add(dirT.clone().multiplyScalar(-0.02 * p)));
    // 가슴 앞면이 패드 윗면에, 어깨는 패드 앞쪽 끝보다 조금 앞으로
    const chest = wpos(B.spine_03).add(n.clone().multiplyScalar(-0.12));
    const S = wpos(B.upperarm_r);
    const surf = padCenter.clone().add(n.clone().multiplyScalar(PADT / 2));
    const a = surf.clone().sub(chest).dot(n);
    const b = padTop.clone().add(u.clone().multiplyScalar(0.06)).sub(S).dot(u);
    moveBody(n.clone().multiplyScalar(a).add(u.clone().multiplyScalar(b)).setZ(0));
    for (const s of [-1, 1]) leg(s, V(human.footX, human.footY + human.len.ankleH, 0.12 * s), V(1, 0.05, 0.08 * s).normalize());
  }

  return {
    muscles: { midback: 1, lats: 0.9, drear: 0.8, biceps: 0.6, traps: 0.45 },
    target: V(-0.15, 0.72, 0),
    views: { side: V(-0.1, 0.95, 3.7), front: V(3.2, 1.15, 0.7), diag: V(2.2, 1.45, 2.7), back: V(-3.2, 1.4, 1.3) },
    fit() {
      const { B, len } = human;
      human.footX = -0.8; human.footY = 0.06;
      poseBody(0);
      // 발판: 다리가 거의 펴진 채 뒤로 비스듬히 (수직에서 약 18° 뒤)
      const hip = wpos(B.thigh_r), L = (len.thigh + len.shin) * 0.97, lean = 18 * Math.PI / 180;
      human.footX = hip.x - Math.sin(lean) * L;
      human.footY = Math.max(0.06, hip.y - Math.cos(lean) * L - len.ankleH);
      const hiStep = human.footY > 0.12;
      stepG.position.set(human.footX + (hiStep ? -0.18 : 0.12), human.footY - (hiStep ? 0.15 : 0.02), 0);
      poseBody(0);
      // 시작: 팔을 아래로 다 뻗어 손잡이를 잡음 (손이 어깨보다 약간 앞)
      const S0 = wpos(B.upperarm_r);
      const dz = GZ - Math.abs(S0.z);
      const reach = Math.sqrt(Math.pow((len.upper + len.fore + len.palm) * 0.96, 2) - dz * dz);
      const fw = 0.08;
      const G0 = V(S0.x + fw, S0.y - Math.sqrt(reach * reach - fw * fw));
      // 레버 길이·시작 각도: 회전축 → (손잡이 위치에서 손잡이 높이 오프셋 보정)
      const ly = 0.1;
      const dist = Math.hypot(G0.x - P.x, G0.y - P.y);
      const lx = Math.sqrt(Math.max(0.01, dist * dist - ly * ly));
      R = lx - 0.06;
      A0 = Math.atan2(G0.y - P.y, G0.x - P.x) - Math.atan2(ly, lx);
      buildLever();
      // 끝: 손잡이가 패드 아래 가슴 높이까지 (패드 아랫면 5cm 아래) 또는 팔꿈치가 충분히 굽혀질 때까지
      poseBody(1);
      const S1 = wpos(B.upperarm_r);
      A1 = A0;
      for (let ang = A0; ang < A0 + 1.4; ang += 0.004) {
        const G = handWorld(ang, 1); A1 = ang;
        const toPad = G.clone().sub(padCenter).dot(n);              // 패드 중심면 기준 높이 (음수 = 패드 아래)
        if (toPad > -(PADT / 2 + 0.11) || G.distanceTo(S1) < 0.24) break;
      }
      setPath(pathPts());
    },
    poseMachine(p) { if (lever) lever.rotation.z = A0 + (A1 - A0) * p; },
    poseHuman(p) {
      const ang = A0 + (A1 - A0) * p;
      poseBody(p); applyFist();
      // 패러럴 그립: 팔꿈치는 몸 가까이 붙여 뒤·위로 (엉덩이 쪽)
      for (const s of [-1, 1]) arm(s, handWorld(ang, s), V(-0.85, 0.45, 0.18 * s).normalize());
    }
  };
}

export function createHighRow(container) { return createStage(container, highRowRig); }
export function createTBarRow(container) { return createStage(container, tBarRowRig); }
