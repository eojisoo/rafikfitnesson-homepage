// 짐스테이션 운동 가이드: 3D 모션 (three.js)
// 원판식 하이로우 머신을 실제 기구 비율에 맞춰 단순화해 만들고, 마네킹이 동작을 보여 줍니다.
// 단위: 미터 · x = 사용자가 바라보는 앞쪽, y = 위, z = 좌우
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

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
  const A0 = -6.3 * Math.PI / 180, A1 = -41.4 * Math.PI / 180; // 시작(팔 뻗음) / 끝(당김) 각도
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
  // 좌석
  tube(V(-0.02, Y0, 0), V(-0.02, 0.48, 0), 0.07, M.frame, mach);
  const seatPost = box(0.05, 0.3, 0.05, M.chrome); seatPost.position.set(-0.02, 0.36, 0.045); mach.add(seatPost);
  const seat = box(0.44, 0.08, 0.36, M.pad); seat.position.set(0.02, 0.53, 0); mach.add(seat);
  const seatBase = box(0.38, 0.03, 0.3, M.frame); seatBase.position.set(0.02, 0.48, 0); mach.add(seatBase);
  // 허벅지 고정 패드
  bent([V(0.6, Y0, 0), V(0.6, 0.66, 0), V(0.42, 0.82, 0)], 0.065, M.frame, mach);
  for (const s of [-1, 1]) { const roll = cyl(0.062, 0.2, M.pad, 'z'); roll.position.set(0.4, 0.8, 0.13 * s); mach.add(roll); }
  const rollAxle = cyl(0.02, 0.06, M.chrome, 'z'); rollAxle.position.set(0.4, 0.8, 0); mach.add(rollAxle);

  // 레버 (좌우 따로 움직이는 팔)
  const levers = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(P.x, P.y, 0.42 * s); scene.add(pivot);
    const arm = new THREE.Group(); pivot.add(arm);
    tube(V(-0.42, 0, 0), V(R - 0.08, 0, -0.06 * s), 0.08, M.frame, arm);
    // 손잡이: 아래로 꺾인 봉 + 고무 그립
    tube(V(R - 0.1, 0.02, -0.06 * s), V(R, -0.04, -0.06 * s), 0.06, M.frame, arm);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.17, 18), M.rubber);
    grip.position.set(R + 0.005, -0.12, -0.06 * s); grip.rotation.z = 0.25; grip.castShadow = true; arm.add(grip);
    const gripEnd = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 18), M.chrome); gripEnd.position.set(R + 0.027, -0.205, -0.06 * s); gripEnd.rotation.z = 0.25; arm.add(gripEnd);
    // 뒤쪽 원판 봉 + 원판 2장
    const horn = cyl(0.026, 0.26, M.chrome, 'z'); horn.position.set(-0.42, 0, 0.13 * s); arm.add(horn);
    for (let i = 0; i < 2; i++) {
      const pl = cyl(i ? 0.19 : 0.225, 0.04, M.plate, 'z'); pl.position.set(-0.42, 0, (0.07 + i * 0.045) * s); arm.add(pl);
      const hubp = cyl(0.045, 0.045, M.frameEdge, 'z'); hubp.position.copy(pl.position); arm.add(hubp);
    }
    levers.push({ pivot, arm, s });
  }
  // 손잡이 그립 위치 (레버 회전에 따라)
  const handWorld = (ang, s, z = 0.36) => { const lx = R + 0.005, ly = -0.12, c = Math.cos(ang), n = Math.sin(ang); return V(P.x + lx * c - ly * n, P.y + lx * n + ly * c, z * s); };

  // 손잡이가 지나가는 길 (점선 호)
  const pathPts = []; for (let i = 0; i <= 40; i++) { const a = A0 + (A1 - A0) * i / 40; pathPts.push(handWorld(a, 1, 0.43)); }
  const path = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pathPts), M.path); path.computeLineDistances(); scene.add(path);

  // ---------------- 마네킹 ----------------
  const man = new THREE.Group(); scene.add(man);
  const hip = V(0.02, 0.66, 0);
  const pelvis = ball(0.13, M.body, man); pelvis.scale.set(1.0, 0.8, 1.35); pelvis.position.copy(hip);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.135, 0.36, 8, 20), M.body); torso.castShadow = true; man.add(torso);
  const chest = ball(0.15, M.body, man);
  const neck = limb(0.045, M.body, man);
  const head = ball(0.1, M.body, man); head.scale.set(0.95, 1.12, 0.9);
  const face = ball(0.02, M.joint, man); // 얼굴 방향 표시 (코)
  const lats = [-1, 1].map(() => { const m = ball(0.1, M.muscle, man); m.scale.set(0.55, 1.55, 0.6); m.castShadow = false; return m; });
  const bis = [-1, 1].map(() => { const m = ball(0.05, M.muscle, man); m.scale.set(0.85, 1.9, 0.85); m.castShadow = false; return m; });
  const L = {};
  for (const s of [-1, 1]) {
    L[s] = {
      thigh: limb(0.072, M.body, man), shin: limb(0.052, M.body, man),
      upper: limb(0.048, M.body, man), fore: limb(0.04, M.body, man),
      knee: ball(0.058, M.joint, man), ankle: ball(0.045, M.joint, man), shoulder: ball(0.062, M.joint, man), elbow: ball(0.045, M.joint, man), hand: ball(0.046, M.body, man),
      hip: ball(0.075, M.body, man), foot: box(0.2, 0.06, 0.09, M.body)
    };
    man.add(L[s].foot);
  }

  // 다리는 고정 (허벅지 패드 아래)
  for (const s of [-1, 1]) {
    const h = V(hip.x, hip.y, 0.1 * s), k = V(0.44, 0.66, 0.12 * s), a = V(0.47, 0.13, 0.13 * s);
    L[s].hip.position.copy(h); L[s].thigh.set(h, k); L[s].shin.set(k, a);
    L[s].knee.position.copy(k); L[s].ankle.position.copy(a);
    L[s].foot.position.set(0.55, 0.075, 0.13 * s);
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
    // 상체: 당길 때 가슴을 살짝 열고(뒤로 3°) 날개뼈를 모음
    const lean = 0.06 + 0.05 * p;
    const shC = V(hip.x - Math.sin(lean) * 0.6 - 0.02 * p, hip.y + Math.cos(lean) * 0.6 - 0.02 * p, 0);
    const mid = hip.clone().add(shC).multiplyScalar(0.5);
    torso.position.copy(mid); torso.quaternion.setFromUnitVectors(UP, shC.clone().sub(hip).normalize()); torso.scale.set(1, 1, 1.32);
    chest.position.copy(shC).add(V(0.03, -0.12, 0)); chest.scale.set(0.95, 0.85, 1.45);
    const nb = shC.clone().add(V(0, 0.04, 0)), hd = shC.clone().add(V(-0.01, 0.2, 0));
    neck.set(nb, hd.clone().add(V(0, -0.06, 0))); head.position.copy(hd); face.position.copy(hd).add(V(0.095, -0.005, 0));
    for (const s of [-1, 1]) {
      const S = shC.clone().add(V(-0.015 * p, 0, (0.19 - 0.025 * p) * s));
      const H = handWorld(ang, s);
      const pole = V(-0.55, -1, 0.9 * s).normalize();
      const E = ik(S, H, 0.3, 0.29, pole);
      L[s].shoulder.position.copy(S); L[s].upper.set(S, E); L[s].fore.set(E, H); L[s].elbow.position.copy(E); L[s].hand.position.copy(H);
      // 강조 근육: 광배근(등 옆) + 이두
      lats[s === -1 ? 0 : 1].position.copy(shC).add(V(-0.06, -0.2, 0.135 * s));
      const bi = bis[s === -1 ? 0 : 1]; bi.position.copy(S.clone().lerp(E, 0.5)).add(V(0.02, 0, 0)); bi.quaternion.setFromUnitVectors(UP, E.clone().sub(S).normalize());
    }
    const work = ph === 1 || ph === 2 ? 1 : ph === 3 ? 0.55 : 0.2;
    M.muscle.emissiveIntensity = 0.15 + 0.85 * work;
    M.muscle.opacity = 0.55 + 0.4 * work;
    render();
  }
  function render() { renderer.render(scene, camera); }

  placeView('diag'); resize(); pose(0, 0);

  return {
    draw: pose,
    setView,
    dispose() { cancelAnimationFrame(tween); pmrem.dispose(); ro.disconnect(); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); }
  };
}
