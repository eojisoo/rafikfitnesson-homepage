// 짐스테이션 운동 가이드: 3D 모션 (three.js)
// 원판식 하이로우 머신을 실제 기구 비율에 맞춰 단순화해 만들고, 마네킹이 동작을 보여 줍니다.
// 단위: 미터 · x = 사용자가 바라보는 앞쪽, y = 위, z = 좌우
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// 사람 모델: MakeHuman(CC0)으로 만든 근육형 남성 + 게임엔진용 뼈대
// 몸은 찰흙 질감, 정점마다 근육 번호(_MUSCLE)와 경계 가중치(_MW)가 들어 있어 운동별로 쓰는 근육만 색칠합니다.
const HUMAN_URL = 'assets/gymstation/guide/anatomy_male.glb';
// 근육 번호 (Blender 스크립트와 동일)
export const MUSCLE = { pec: 1, dfront: 2, dside: 3, drear: 4, biceps: 5, triceps: 6, forearm: 7, lats: 8, traps: 9, midback: 10, abs: 11, oblique: 12, erector: 13, glute: 14, quad: 15, ham: 16, calf: 17 };
// 근육 결 방향(결에 수직인 방향, 모델 좌표: x 바깥, y 위, z 앞)
const FIBER = { 8: [0.83, -0.55, 0], 10: [0.6, 0.8, 0], 4: [0.95, 0.3, 0], 5: [0.75, 0.67, 0], 1: [0, 1, 0], 6: [0.75, 0.67, 0], 9: [0.5, 0.86, 0] };

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
const DRACO_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/';

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

function mats() {
  return {
    frame: new THREE.MeshStandardMaterial({ color: 0x24282a, roughness: 0.38, metalness: 0.55 }),
    frameEdge: new THREE.MeshStandardMaterial({ color: 0x3a3f41, roughness: 0.3, metalness: 0.7 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xb9bfc2, roughness: 0.22, metalness: 1 }),
    pad: new THREE.MeshStandardMaterial({ color: 0x101111, roughness: 0.75, metalness: 0.05 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x141515, roughness: 0.85, metalness: 0.05 }),
    plate: new THREE.MeshStandardMaterial({ color: 0x161717, roughness: 0.7, metalness: 0.15 }),
    body: new THREE.MeshStandardMaterial({ color: 0xd8dcda, roughness: 0.55, metalness: 0.05 }),
    joint: new THREE.MeshStandardMaterial({ color: 0xc4c9c6, roughness: 0.5, metalness: 0.05 }),
    muscle: new THREE.MeshStandardMaterial({ color: 0xfe6201, roughness: 0.45, metalness: 0, emissive: 0xfe6201, emissiveIntensity: 0.25, transparent: true, opacity: 0.92 }),
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
function box(w, h, d, mat, r = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 1, 1, 1), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// 팔다리: 길이가 바뀌는 원통 + 관절 구
function limb(r, mat, parent) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.88, 1, 20), mat);
  m.castShadow = true; parent.add(m);
  return {
    mesh: m,
    set(a, b) { const d = b.clone().sub(a); m.position.copy(a).add(b).multiplyScalar(0.5); m.scale.set(1, d.length(), 1); m.quaternion.setFromUnitVectors(UP, d.normalize()); }
  };
}
function ball(r, mat, parent) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat); m.castShadow = true; parent.add(m); return m; }

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

export function createHighRow(container) {
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
  // 금속 반사용 실내 조명 환경
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 50);

  // 조명: 위에서 부드러운 주광 + 뒤쪽 주황 림라이트(브랜드 색)
  scene.add(new THREE.HemisphereLight(0xf4f6f5, 0x1a1c1b, 0.45));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(2.6, 4.6, 3.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -2.2, right: 2.2, top: 3, bottom: -1, near: 0.5, far: 12 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff8a3d, 0.7); rim.position.set(-3, 2.4, -2.5); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xbfd4ff, 0.35); fill.position.set(-1, 1.5, 4); scene.add(fill);

  // 바닥 (고무 매트 + 은은한 원형 조명)
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2.6, 64), M.floor);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, 'rgba(255,255,255,.10)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c); })();
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.set(-0.25, 0.002, 0); scene.add(glow);

  // ---------------- 기구: 원판식 하이로우 ----------------
  const mach = new THREE.Group(); scene.add(mach);
  const T = 0.075, Y0 = 0.04;
  const P = V(-0.9, 1.9);             // 레버 회전축 (머리 뒤 위쪽)
  const R = 1.36;                      // 회전축 → 손잡이 길이
  const A0 = -15 * Math.PI / 180; let A1 = -45 * Math.PI / 180; // 시작(팔 뻗음) / 끝(당김) 각도
  // 바닥 프레임
  for (const z of [-0.55, 0.55]) tube(V(-1.55, Y0, z), V(0.72, Y0, z * 0.62), T, M.frame, mach);
  tube(V(-1.55, Y0, -0.55), V(-1.55, Y0, 0.55), T, M.frame, mach);
  tube(V(0.72, Y0, -0.34), V(0.72, Y0, 0.34), T, M.frame, mach);
  tube(V(-0.35, Y0, -0.5), V(-0.35, Y0, 0.5), T, M.frame, mach);
  tube(V(-0.35, Y0, 0), V(0.72, Y0, 0), T, M.frame, mach);
  // 좌우 타워: 뒤쪽 곧은 다리 + 앞쪽 S자 다리 → 꼭대기 회전축
  for (const s of [-1, 1]) {
    const z = 0.5 * s;
    tube(V(-1.5, Y0, z), V(-0.93, 1.92, z), T, M.frame, mach);
    bent([V(-0.36, Y0, z), V(-0.48, 0.78, z), V(-0.78, 1.28, z), V(-0.88, 1.88, z)], T, M.frame, mach);
    tube(V(-1.27, 0.78, z), V(-0.48, 0.78, z), T * 0.9, M.frame, mach);
    // 원판 보관 봉
    const horn = cyl(0.026, 0.22, M.chrome, 'z'); horn.position.set(-0.98, 0.62, z + 0.13 * s); mach.add(horn);
    const horn2 = cyl(0.026, 0.22, M.chrome, 'z'); horn2.position.set(-1.12, 1.08, z + 0.13 * s); mach.add(horn2);
    // 회전축 허브
    const hub = cyl(0.075, 0.13, M.frameEdge, 'z'); hub.position.set(P.x, P.y, z); mach.add(hub);
    const cap = cyl(0.03, 0.15, M.chrome, 'z'); cap.position.set(P.x, P.y, z); mach.add(cap);
  }
  // 위쪽 가로대와 앞으로 뻗은 상단 빔
  tube(V(-0.93, 2.0, -0.56), V(-0.93, 2.0, 0.56), T, M.frame, mach);
  tube(V(-0.78, 1.28, -0.5), V(-0.78, 1.28, 0.5), T * 0.9, M.frame, mach);
  tube(V(-1.05, 2.06, 0), V(0.15, 2.06, 0), 0.09, M.frame, mach);
  tube(V(-0.93, 2.0, 0), V(-1.05, 2.06, 0), 0.09, M.frame, mach);
  // 좌석 (높이 조절식): 사람 체형에 맞춰 높이를 맞춥니다
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

  // 레버 (좌우 따로 움직이는 팔)
  const levers = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(P.x, P.y, 0.42 * s); scene.add(pivot);
    const arm = new THREE.Group(); pivot.add(arm);
    tube(V(-0.42, 0, 0), V(R - 0.08, 0, -0.12 * s), 0.08, M.frame, arm);
    // 손잡이: 아래로 꺾인 봉 + 고무 그립
    tube(V(R - 0.1, 0.02, -0.12 * s), V(R, -0.04, -0.12 * s), 0.06, M.frame, arm);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.17, 18), M.rubber);
    grip.position.set(R + 0.005, -0.12, -0.12 * s); grip.rotation.z = 0.25; grip.castShadow = true; arm.add(grip);
    const gripEnd = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 18), M.chrome); gripEnd.position.set(R + 0.027, -0.205, -0.12 * s); gripEnd.rotation.z = 0.25; arm.add(gripEnd);
    // 뒤쪽 원판 봉 + 원판 2장
    const horn = cyl(0.026, 0.26, M.chrome, 'z'); horn.position.set(-0.42, 0, 0.13 * s); arm.add(horn);
    for (let i = 0; i < 2; i++) {
      const pl = cyl(i ? 0.19 : 0.225, 0.04, M.plate, 'z'); pl.position.set(-0.42, 0, (0.07 + i * 0.045) * s); arm.add(pl);
      const hubp = cyl(0.045, 0.045, M.frameEdge, 'z'); hubp.position.copy(pl.position); arm.add(hubp);
    }
    levers.push({ pivot, arm, s });
  }
  // 손잡이 그립 위치 (레버 회전에 따라)
  const handWorld = (ang, s, z = 0.30) => { const lx = R + 0.005, ly = -0.12, c = Math.cos(ang), n = Math.sin(ang); return V(P.x + lx * c - ly * n, P.y + lx * n + ly * c, z * s); };

  // 손잡이가 지나가는 길 (점선 호)
  const pathPts = []; for (let i = 0; i <= 40; i++) { const a = A0 + (A1 - A0) * i / 40; pathPts.push(handWorld(a, 1, 0.43)); }
  const path = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pathPts), M.path); path.computeLineDistances(); scene.add(path);

  // ---------------- 사람 (실사형 인체) ----------------
  const human = { ready: false };
  const anat = anatomyMaterial();
  // 하이 로우에서 쓰는 근육 (1 = 주동근, 나머지 = 보조근)
  anat.uniforms.uAct.value[MUSCLE.lats] = 1; anat.uniforms.uAct.value[MUSCLE.midback] = 0.8; anat.uniforms.uAct.value[MUSCLE.drear] = 0.75; anat.uniforms.uAct.value[MUSCLE.biceps] = 0.65;
  const clayMat = new THREE.MeshStandardMaterial({ color: 0xcfbfac, roughness: 0.86, metalness: 0 });
  const draco = new DRACOLoader().setDecoderPath(DRACO_URL);
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const loadP = new Promise((resolve, reject) => loader.load(HUMAN_URL, (g) => { try { setupHuman(g.scene); resolve(); } catch (e) { reject(e); } }, undefined, reject));

  const tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), tmpV = new THREE.Vector3();
  function wpos(o) { return o.getWorldPosition(new THREE.Vector3()); }
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

  function setupHuman(root) {
    root.rotation.y = Math.PI / 2; // 모델 정면(+z) → 기구 앞쪽(+x)
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        o.material = o.geometry.attributes._muscle ? anat.material : clayMat;
      }
    });
    scene.add(root);
    const B = {};
    ['Root', 'pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r',
      'middle_01_l', 'middle_01_r', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r', 'ball_l', 'ball_r'].forEach((n) => { B[n] = root.getObjectByName(n); if (!B[n]) throw Error('bone ' + n); });
    const rest = new Map(); root.traverse((o) => { if (o.isBone) rest.set(o, o.quaternion.clone()); });
    root.updateWorldMatrix(true, true);
    const d = (a, b) => wpos(B[a]).distanceTo(wpos(B[b]));
    const len = {
      upper: d('upperarm_l', 'lowerarm_l'), fore: d('lowerarm_l', 'hand_l'), palm: d('hand_l', 'middle_01_l') * 0.9,
      thigh: d('thigh_l', 'calf_l'), shin: d('calf_l', 'foot_l'), ankleH: wpos(B.foot_l).y, foot: d('foot_l', 'ball_l')
    };
    Object.assign(human, { root, B, rest, len });
    // 좌석 높이 맞추기: 팔을 거의 다 뻗었을 때 시작 손잡이에 닿는 높이 (실제 기구에서 좌석을 맞추는 것과 같음)
    const reach = (len.upper + len.fore + len.palm) * 0.97;
    let lo = 0.5, hi = 0.8;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2; human.hipY = mid; poseBody(0);
      const S = wpos(B.upperarm_r), H = handWorld(A0, 1);
      if (S.distanceTo(H) > reach) lo = mid; else hi = mid;
    }
    human.hipY = (lo + hi) / 2;
    seatG.position.y = human.hipY - 0.085 - 0.57;
    padG.position.y = human.hipY + 0.07 + 0.065 - 0.8;
    // 당기기 끝: 손(그립)이 어깨선보다 약간 앞에서 멈추는 각도 → 팔꿈치가 몸통 뒤로 과하게 빠지지 않음
    human.hipY = (lo + hi) / 2; poseBody(1);
    const S1 = wpos(B.upperarm_r);
    let a1 = A0;
    for (let a = A0; a > -1.6; a -= 0.005) { const g = handWorld(a, 1); a1 = a; if (g.x <= S1.x + 0.05 || g.y < S1.y - 0.36) break; }
    A1 = a1;
    const pts = []; for (let i = 0; i <= 40; i++) pts.push(handWorld(A0 + (A1 - A0) * i / 40, 1, 0.43));
    path.geometry.setFromPoints(pts); path.computeLineDistances();
    human.ready = true;
  }

  // 몸통·다리 자세 (팔은 별도)
  function poseBody(p) {
    const { root, B, rest, len } = human;
    rest.forEach((q, b) => b.quaternion.copy(q));
    root.position.set(0, 0, 0); root.updateWorldMatrix(true, true);
    const pel = wpos(B.pelvis);
    root.position.set(0.02 - pel.x, human.hipY - pel.y, -pel.z);
    root.updateWorldMatrix(true, true);
    // 상체: 살짝 뒤로 기대고(6°→11°), 당길 때 가슴을 엶
    const lean = 0.07 + 0.05 * p;
    const sp = wpos(B.spine_01), nk = wpos(B.neck_01), L = nk.distanceTo(sp);
    aim(B.spine_01, B.neck_01, sp.clone().add(V(-Math.sin(lean) * L, Math.cos(lean) * L, 0)));
    // 머리는 정면 보기
    const hd = wpos(B.head);
    aim(B.neck_01, B.head, wpos(B.neck_01).add(V(0.02, hd.distanceTo(wpos(B.neck_01)), 0)));
    // 날개뼈 모으기: 당길 때 어깨를 뒤·아래로
    for (const [c, u, s] of [['clavicle_l', 'upperarm_l', -1], ['clavicle_r', 'upperarm_r', 1]]) {
      const cp = wpos(B[c]), up = wpos(B[u]);
      aim(B[c], B[u], up.clone().add(V(-0.035 * p, -0.02 * p + 0.01, 0)));
    }
    // 다리: 허벅지는 앞으로(패드 아래), 발은 바닥에
    for (const [t, c, f, b, s] of [['thigh_l', 'calf_l', 'foot_l', 'ball_l', -1], ['thigh_r', 'calf_r', 'foot_r', 'ball_r', 1]]) {
      const T = wpos(B[t]);
      const K = T.clone().add(V(len.thigh * Math.cos(-0.05), len.thigh * Math.sin(-0.05), 0.02 * s));
      aim(B[t], B[c], K);
      const ay = len.ankleH, dy = K.y - ay;
      const A = dy < len.shin ? V(K.x + Math.min(0.3, Math.sqrt(len.shin * len.shin - dy * dy)), ay, K.z + 0.01 * s) : K.clone().add(V(0.03, -len.shin, 0));
      aim(B[c], B[f], A);
      const Af = wpos(B[f]);
      aim(B[f], B[b], V(Af.x + len.foot, Math.max(0.02, Af.y - len.foot * 0.55), Af.z));
    }
  }

  // 손가락을 손바닥 쪽으로 말아 손잡이를 쥔 모양으로
  function rotWorld(bone, axis, angle) {
    bone.updateWorldMatrix(true, false);
    const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    const bw = bone.getWorldQuaternion(new THREE.Quaternion()), pw = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    bone.quaternion.copy(pw.invert().multiply(q.multiply(bw)));
    bone.updateWorldMatrix(false, true);
  }
  function curlFingers(sfx) {
    const root = human.root, g = (n) => root.getObjectByName(n + sfx);
    const hand = g('hand'), hp = wpos(hand);
    const nrm = wpos(g('index_01')).sub(hp).cross(wpos(g('pinky_01')).sub(hp)).normalize();
    if (nrm.dot(wpos(g('thumb_02')).sub(hp)) < 0) nrm.negate(); // 손바닥 쪽
    for (const fn of ['index', 'middle', 'ring', 'pinky']) {
      for (const [k, a] of [['01', 1.0], ['02', 1.25], ['03', 0.85]]) {
        const b = g(fn + '_' + k), nx = k === '03' ? null : g(fn + '_0' + (+k + 1));
        const bp = wpos(b), dir = nx ? wpos(nx).sub(bp).normalize() : wpos(b).sub(wpos(g(fn + '_02'))).normalize();
        const axis = dir.clone().cross(nrm).normalize();
        if (axis.lengthSq() > 1e-6) rotWorld(b, axis, a);
      }
    }
    const t2 = g('thumb_02'), t3 = g('thumb_03'), td = wpos(t3).sub(wpos(t2)).normalize();
    const ta = td.clone().cross(nrm).normalize(); if (ta.lengthSq() > 1e-6) { rotWorld(t2, ta, 0.5); rotWorld(t3, ta, 0.5); }
  }

  function poseHuman(p, ang) {
    const { B, len } = human;
    poseBody(p);
    for (const [u, l, h, s] of [['upperarm_l', 'lowerarm_l', 'hand_l', -1], ['upperarm_r', 'lowerarm_r', 'hand_r', 1]]) {
      const S = wpos(B[u]), G = handWorld(ang, s);
      // 팔꿈치는 아래·바깥으로 (뒤쪽 성분은 작게)
      let pole = V(-0.12, -1, 0.7 * s).normalize();
      let E = ik(S, G, len.upper, len.fore + len.palm, pole);
      // 관절 한계: 팔꿈치가 몸통 뒷면(어깨 관절보다 9cm 뒤)을 넘어가지 않게
      for (let k = 0; k < 8 && E.x < S.x - 0.09; k++) { pole = pole.add(V(0.25, 0, 0)).normalize(); E = ik(S, G, len.upper, len.fore + len.palm, pole); }
      aim(B[u], B[l], E);
      const Ew = wpos(B[l]);
      const W = Ew.clone().add(G.clone().sub(Ew).normalize().multiplyScalar(len.fore));
      aim(B[l], B[h], W);
      // 손바닥이 손잡이를 감싸도록 손을 팔뚝 방향으로
      const Wp = wpos(B[h]);
      aim(B[h], B[s < 0 ? 'middle_01_l' : 'middle_01_r'], Wp.clone().add(G.clone().sub(Ew).normalize().multiplyScalar(0.1)).add(V(0, -0.02, 0)));
      curlFingers(s < 0 ? '_l' : '_r');
    }
  }

  // ---------------- 카메라 ----------------
  const target = V(-0.25, 1.05, 0);
  const VIEWS = { side: V(-0.2, 1.3, 3.75), front: V(3.2, 1.4, 0.5), diag: V(2.1, 1.75, 2.6), back: V(-3.3, 1.65, 1.2) };
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enablePan = false; controls.enableDamping = false;
  controls.minDistance = 2.4; controls.maxDistance = 7;
  controls.minPolarAngle = 0.35; controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.addEventListener('change', () => render());
  let fitK = 1;
  function placeView(name) { const v = VIEWS[name] || VIEWS.diag; camera.position.copy(target).add(v.clone().sub(target).multiplyScalar(fitK)); controls.update(); }
  let tween = 0;
  function setView(name) {
    const v = VIEWS[name]; if (!v) return;
    const from = camera.position.clone(), to = target.clone().add(v.clone().sub(target).multiplyScalar(fitK));
    // 구면 보간으로 기구 주위를 돌아가듯 이동
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
    const nk = w / h < 1.15 ? 1.32 : 1; // 세로로 긴 화면은 조금 멀리서
    if (nk !== fitK) { camera.position.sub(target).multiplyScalar(nk / fitK).add(target); fitK = nk; controls.update(); }
    camera.updateProjectionMatrix(); render();
  }
  const ro = new ResizeObserver(resize); ro.observe(container);

  // ---------------- 동작 ----------------
  let last = { p: 0, ph: 0 };
  function pose(p, ph) {
    last = { p, ph };
    const ang = A0 + (A1 - A0) * p;
    for (const lv of levers) lv.arm.rotation.z = ang;
    if (human.ready) poseHuman(p, ang);
    const work = ph === 1 || ph === 2 ? 1 : ph === 3 ? 0.55 : 0.15;
    anat.uniforms.uWork.value = work;
    render();
  }
  function render() { renderer.render(scene, camera); }

  placeView('diag'); resize(); pose(0, 0);
  loadP.then(() => pose(last.p, last.ph)).catch((e) => console.error('human load failed', e));

  return {
    draw: pose,
    ready: loadP,
    setView,
    dispose() { cancelAnimationFrame(tween); pmrem.dispose(); draco.dispose(); ro.disconnect(); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); }
  };
}
