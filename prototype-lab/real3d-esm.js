import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/+esm";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js/+esm";
import { Sky } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/objects/Sky.js/+esm";
import { EffectComposer } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js/+esm";
import { RenderPass } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/RenderPass.js/+esm";
import { UnrealBloomPass } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js/+esm";
import { OutputPass } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/OutputPass.js/+esm";
import { RoomEnvironment } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/environments/RoomEnvironment.js/+esm";
import { BokehPass } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/BokehPass.js/+esm";
const T = THREE;

/* ---------- core ---------- */
let renderer, scene, camera, controls, sky, sun, hemi, sunDir, hostEl = null, pmremG = null, outdoorEnv = null, roomEnv = null, fogObj = null;
let clouds = null, skybox = null, realTex = null, realEnv = null, realKey = "", realBusy = false, envMode = "outdoor", studio = null, catcher = null, photoTex = null, photoEnv = null, photoIs360 = false;
let cur = null, curKey = "", curModel = null, ground = null, groundKind = "";
const V = new T.Vector3(), V2 = new T.Vector3();

let QUAL = (() => { try { return localStorage.getItem("ss-quality"); } catch (e) { return null; } })() || (matchMedia("(pointer:coarse)").matches ? "balanced" : "sharp");
const prFor = q => { const d = devicePixelRatio || 1; return q === "smooth" ? 1 : q === "balanced" ? Math.min(d, 1.5) : Math.min(d, 2); };
const shadowSz = () => QUAL === "sharp" ? 2048 : 1024;
function setQuality(q) { QUAL = q; try { localStorage.setItem("ss-quality", q); } catch (e) {} if (!renderer) return; renderer.setPixelRatio(prFor(q)); sun.shadow.mapSize.set(shadowSz(), shadowSz()); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
function init(host) {
  renderer = new T.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(prFor(QUAL));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.62;
  host.appendChild(renderer.domElement);
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(40, 1, 0.3, 6000); /* larger near plane = better depth precision, less flicker */
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.07; controls.rotateSpeed = 0.7; controls.zoomSpeed = 0.8;
  controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 2; controls.maxDistance = 600;
  controls.enablePan = false;
  renderer.domElement.style.touchAction = "pan-y";

  sky = new Sky(); sky.scale.setScalar(5000);
  const u = sky.material.uniforms;
  u.turbidity.value = 5.5; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
  sunDir = new T.Vector3().setFromSphericalCoords(1, T.MathUtils.degToRad(90 - 32), T.MathUtils.degToRad(140));
  u.sunPosition.value.copy(sunDir);
  const pmrem = new T.PMREMGenerator(renderer); pmremG = pmrem;
  const envScene = new T.Scene(); envScene.add(sky);
  scene.environment = outdoorEnv = pmrem.fromScene(envScene).texture;
  scene.add(sky);
  clouds = cloudDome(); scene.add(clouds);

  sun = new T.DirectionalLight(0xfff0dc, 3.4);
  sun.castShadow = true; sun.shadow.mapSize.set(shadowSz(), shadowSz());
  const sc = sun.shadow.camera; sc.left = -32; sc.right = 32; sc.top = 32; sc.bottom = -32; sc.near = 1; sc.far = 220;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  hemi = new T.HemisphereLight(0xd6e8ff, 0x4d4030, 0.7); scene.add(hemi);
  scene.fog = fogObj = new T.Fog(0xc6d8ea, 120, 1400);
  hostEl = host;
}

/* ---------- noise, clouds ---------- */
function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function fbm(x, y, o = 5) { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= .5; } return s; }
function cloudAt(dx, dy, dz) { if (dy <= .01) return 0; const k = 1 / (dy + .08), px = dx * k * 1.3, pz = dz * k * 1.3, n = fbm(px + 3.1, pz + 7.7, 5); return Math.max(0, Math.min(1, (n - .47) / .2)) * Math.min(1, dy * 6); }
function cloudDome() {
  const W = 768, H = 384, cv = document.createElement("canvas"); cv.width = W; cv.height = H; const x = cv.getContext("2d"), img = x.createImageData(W, H), d = img.data;
  for (let j = 0; j < H / 2; j++) { const th = j / H * Math.PI, st = Math.sin(th), ct = Math.cos(th);
    for (let i = 0; i < W; i++) { const ph = i / W * Math.PI * 2, dx = -Math.cos(ph) * st, dz = Math.sin(ph) * st, a = cloudAt(dx, ct, dz); if (a <= 0) continue;
      const sh = .78 + .22 * fbm(dx / (ct + .08) * 3, dz / (ct + .08) * 3, 3), k = (j * W + i) * 4; d[k] = 255 * sh; d[k + 1] = 255 * sh; d[k + 2] = 255 * Math.min(1, sh * 1.03); d[k + 3] = 255 * a; } }
  x.putImageData(img, 0, 0); const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace;
  const m = new T.Mesh(new T.SphereGeometry(3000, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false, side: T.BackSide, toneMapped: false, color: 0xeeeeee }));
  m.renderOrder = 1; return m; }
function skyColorAt(dx, dy, dz, desert, out) {
  if (dy < 0) { const k = .55 + .2 * Math.min(1, -dy * 3); if (desert === "snow") return out.setRGB(.85 * k + .2, .88 * k + .2, .92 * k + .2); return desert ? out.setRGB(.48 * k, .35 * k, .24 * k) : out.setRGB(.2 * k, .27 * k, .14 * k); }
  const h = Math.pow(dy, .45); let r = .82 + (.2 - .82) * h, g = .88 + (.42 - .88) * h, b = .96 + (.82 - .96) * h; if (desert) { r += .05 * (1 - h); g += .02 * (1 - h); }
  const dot = Math.max(0, dx * sunDir.x + dy * sunDir.y + dz * sunDir.z), glow = Math.pow(dot, 24) * .6 + Math.pow(dot, 400) * 6; r += glow; g += glow * .92; b += glow * .8;
  const c = cloudAt(dx, dy, dz); if (c > 0) { const lit = .95 + .5 * Math.pow(dot, 4); r = r + (lit - r) * c; g = g + (lit - g) * c; b = b + (lit * 1.02 - b) * c; }
  return out.setRGB(r * 1.15, g * 1.15, b * 1.15); }

/* ---------- procedural textures ---------- */
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const TC = {}; const TILE = new Set(["grass", "sand", "concrete", "leaves", "bark", "snow", "caustics"]);
function ctex(key, w, h, draw, rep, srgb = true) {
  if (!TC[key]) {
    const c = document.createElement("canvas"); c.width = w; c.height = h; const cx = c.getContext("2d");
    if (TILE.has(key)) { const s0 = seed; for (const ox of [0, -w, w]) for (const oy of [0, -h, h]) { seed = s0; cx.save(); cx.translate(ox, oy); draw(cx, w, h); cx.restore(); } } else draw(cx, w, h);
    const t = new T.CanvasTexture(c); if (srgb) t.colorSpace = T.SRGBColorSpace;
    t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); TC[key] = t;
  }
  const t = TC[key].clone(); t.needsUpdate = true; if (rep) t.repeat.set(rep[0], rep[1]); return t;
}
function noise(x, w, h, cols, n, sz) { for (let i = 0; i < n; i++) { x.fillStyle = cols[(rnd() * cols.length) | 0]; x.globalAlpha = 0.25 + rnd() * 0.6; const s = sz * (0.4 + rnd()); x.fillRect(rnd() * w, rnd() * h, s, s); } x.globalAlpha = 1; }
const TEX = {
  grass: r => ctex("grass", 512, 512, (x, w, h) => {
    x.fillStyle = "#56783a"; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { const g = x.createRadialGradient(rnd() * w, rnd() * h, 0, rnd() * w, rnd() * h, 60 + rnd() * 90); g.addColorStop(0, rnd() > .5 ? "rgba(90,120,50,.12)" : "rgba(60,85,35,.12)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(-w, -h, 3 * w, 3 * h); }
    const cols = ["#4b6e2e", "#618a3d", "#6e9846", "#43652a", "#7fa653", "#5a7f36", "#8aa05a"];
    for (let i = 0; i < 9000; i++) { x.strokeStyle = cols[(rnd() * cols.length) | 0]; x.globalAlpha = .5 + rnd() * .5; x.lineWidth = .8 + rnd(); const px = rnd() * w, py = rnd() * h, a = -Math.PI / 2 + (rnd() - .5) * .8, l = 3 + rnd() * 6; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
    x.globalAlpha = 1;
  }, r),
  asphalt: r => ctex("asphalt", 1024, 128, (x, w, h) => {
    x.fillStyle = "#3a3d42"; x.fillRect(0, 0, w, h); noise(x, w, h, ["#2b2e32", "#4a4d52", "#55585c", "#33363a"], 26000, 2.2);
    x.fillStyle = "rgba(235,235,225,.9)"; for (let i = 0; i < w; i += 128) x.fillRect(i, h / 2 - 2, 64, 4);
    x.fillStyle = "rgba(240,240,232,.85)"; x.fillRect(0, 6, w, 3); x.fillRect(0, h - 9, w, 3);
  }, r),
  concrete: r => ctex("concrete", 512, 512, (x, w, h) => {
    x.fillStyle = "#aeaca6"; x.fillRect(0, 0, w, h); noise(x, w, h, ["#9d9b95", "#bdbbb4", "#a5a39d", "#8f8d88"], 22000, 2.5);
    for (let i = 0; i < 14; i++) { const g = x.createRadialGradient(rnd() * w, rnd() * h, 0, rnd() * w, rnd() * h, 40 + rnd() * 80); g.addColorStop(0, "rgba(80,75,65,.18)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(-w, -h, 3 * w, 3 * h); }
    x.strokeStyle = "rgba(70,70,70,.35)"; for (let i = 0; i <= w; i += 128) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
  }, r),
  facade: r => ctex("facade", 512, 512, (x, w, h) => {
    x.fillStyle = "#d4cdbf"; x.fillRect(0, 0, w, h); noise(x, w, h, ["#c9c1b2", "#ddd6ca"], 6000, 2);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const gx = 20 + i * 124, gy = 24 + j * 124; const g = x.createLinearGradient(gx, gy, gx + 84, gy + 80); g.addColorStop(0, "#5f7d99"); g.addColorStop(.5, "#22364a"); g.addColorStop(1, "#4d6a86"); x.fillStyle = "#6f6a60"; x.fillRect(gx - 4, gy - 4, 92, 88); x.fillStyle = g; x.fillRect(gx, gy, 84, 80); x.fillStyle = "#6f6a60"; x.fillRect(gx + 40, gy, 4, 80); }
  }, r),
  wicker: r => ctex("wicker", 256, 256, (x, w, h) => {
    x.fillStyle = "#7a5228"; x.fillRect(0, 0, w, h);
    for (let j = 0; j < h; j += 8) for (let i = 0; i < w; i += 16) { x.fillStyle = (i / 16 + j / 8) % 2 ? "#a06d38" : "#8b5c2c"; x.beginPath(); x.ellipse(i + 8, j + 4, 8, 3.4, 0, 0, 7); x.fill(); }
  }, r),
  stripes: r => ctex("stripes", 1024, 256, (x, w, h) => {
    const cols = ["#d7263d", "#f6f1e7", "#1b4f9c", "#f4b41a", "#d7263d", "#f6f1e7", "#1b998b", "#f4b41a"]; const n = 16;
    for (let i = 0; i < n; i++) { x.fillStyle = cols[i % cols.length]; x.fillRect(i * w / n, 0, w / n + 1, h); }
    noise(x, w, h, ["rgba(0,0,0,.25)", "rgba(255,255,255,.25)"], 3000, 2);
  }, r),
  solar: r => ctex("solar", 512, 512, (x, w, h) => {
    x.fillStyle = "#0f2347"; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 10; j++) { const g = x.createLinearGradient(0, j * 51, w, j * 51 + 51); g.addColorStop(0, "#16346b"); g.addColorStop(1, "#0c1d3d"); x.fillStyle = g; x.fillRect(i * 85 + 2, j * 51 + 2, 81, 47); }
    x.strokeStyle = "rgba(200,210,230,.5)"; x.lineWidth = 1; for (let i = 0; i < 6; i++) for (let k = 1; k < 4; k++) { x.beginPath(); x.moveTo(i * 85 + k * 21, 0); x.lineTo(i * 85 + k * 21, h); x.stroke(); }
  }, r),
  sprite: () => ctex("sprite", 64, 64, (x, w, h) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.4, "rgba(255,255,255,.5)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(-w, -h, 3 * w, 3 * h); }),
  blur: () => ctex("blur", 256, 256, (x, w, h) => {
    const c = w / 2;
    for (let r = 10; r < c; r += 2) { x.strokeStyle = `rgba(20,22,26,${0.15 + 0.35 * (r / c)})`; x.lineWidth = 2; x.beginPath(); x.arc(c, c, r, 0, 7); x.stroke(); }
    for (let k = 0; k < 2; k++) { x.save(); x.translate(c, c); x.rotate(k * Math.PI); const g = x.createLinearGradient(0, 0, 0, -c); g.addColorStop(0, "rgba(0,0,0,.6)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, c - 2, -Math.PI / 2 - .5, -Math.PI / 2); x.fill(); x.restore(); }
  }),
  check: () => ctex("check", 256, 64, (x, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? "#111" : "#f4f4f4"; x.fillRect(i * 16, j * 16, 16, 16); } }),
  bark: r => ctex("bark", 128, 256, (x, w, h) => { x.fillStyle = "#4a3726"; x.fillRect(0, 0, w, h); for (let i = 0; i < 60; i++) { x.strokeStyle = rnd() > .5 ? "#3a2a1c" : "#5c4632"; x.lineWidth = 1 + rnd() * 3; const px = rnd() * w; x.beginPath(); x.moveTo(px, 0); x.bezierCurveTo(px + 6, h / 3, px - 6, h * 2 / 3, px, h); x.stroke(); } }, r),
  leaves: r => ctex("leaves", 256, 256, (x, w, h) => { x.fillStyle = "#2f5a26"; x.fillRect(0, 0, w, h); noise(x, w, h, ["#3d7230", "#24481d", "#4f8a3a", "#2a5222"], 5000, 5); }, r),
  sand: r => ctex("sand", 512, 512, (x, w, h) => {
    x.fillStyle = "#b98d60"; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) { const g = x.createRadialGradient(rnd() * w, rnd() * h, 0, rnd() * w, rnd() * h, 50 + rnd() * 100); g.addColorStop(0, rnd() > .5 ? "rgba(214,170,120,.12)" : "rgba(150,110,72,.1)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(-w, -h, 3 * w, 3 * h); }
    for (let j = 0; j < h; j += 7) { x.strokeStyle = (j / 7) % 2 ? "rgba(120,86,55,.22)" : "rgba(235,200,150,.22)"; x.lineWidth = 2; x.beginPath(); for (let i = 0; i <= w; i += 8) x.lineTo(i, j + Math.sin(i * .05 + j * .3) * 3 + Math.sin(i * .013) * 2); x.stroke(); }
    noise(x, w, h, ["#a87d52", "#cfa676", "#94693f", "#e0bb8a", "#7d5a38"], 30000, 1.6);
  }, r),
  snow: r => ctex("snow", 512, 512, (x, w, h) => { x.fillStyle = "#e9eef4"; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) { const g = x.createRadialGradient(rnd() * w, rnd() * h, 0, rnd() * w, rnd() * h, 50 + rnd() * 100); g.addColorStop(0, rnd() > .5 ? "rgba(190,205,225,.15)" : "rgba(255,255,255,.2)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(-w, -h, 3 * w, 3 * h); }
    noise(x, w, h, ["#ffffff", "#dfe7f1", "#cfdbe8", "#f7fbff"], 26000, 1.4); }, r),
  caustics: () => ctex("caustics", 256, 256, (x, w, h) => { x.fillStyle = "#000"; x.fillRect(0, 0, w, h); x.strokeStyle = "rgba(255,255,255,.9)"; x.lineCap = "round";
    for (let i = 0; i < 70; i++) { x.lineWidth = 1 + rnd() * 2.5; x.globalAlpha = .3 + rnd() * .6; x.beginPath(); let px = rnd() * w, py = rnd() * h; x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (rnd() - .5) * 60; py += (rnd() - .5) * 60; x.quadraticCurveTo(px + (rnd() - .5) * 30, py + (rnd() - .5) * 30, px, py); } x.stroke(); } x.globalAlpha = 1; }),
  tread: r => ctex("tread", 256, 64, (x, w, h) => { x.fillStyle = "#1a1a1a"; x.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 16) { x.fillStyle = "#5a5a5a"; x.beginPath(); x.moveTo(i, 14); x.lineTo(i + 9, 14); x.lineTo(i + 13, 32); x.lineTo(i + 9, 50); x.lineTo(i, 50); x.lineTo(i + 4, 32); x.closePath(); x.fill(); x.fillRect(i + 2, 2, 6, 8); x.fillRect(i + 2, 54, 6, 8); } }, r, false),
  wood: r => ctex("wood", 512, 128, (x, w, h) => { x.fillStyle = "#a77b4f"; x.fillRect(0, 0, w, h); for (let j = 0; j < h; j += 16) { x.fillStyle = "rgba(60,35,15,.4)"; x.fillRect(0, j, w, 1.5); } for (let i = 0; i < 300; i++) { x.strokeStyle = "rgba(90,55,25,.25)"; x.beginPath(); const y = rnd() * h; x.moveTo(0, y); x.bezierCurveTo(w / 3, y + 4, w * 2 / 3, y - 4, w, y); x.stroke(); } }, r),
};

/* ---------- materials ---------- */
const MAT = {
  paint: c => new T.MeshPhysicalMaterial({ color: c, metalness: 0.45, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 }),
  metal: () => new T.MeshStandardMaterial({ color: 0xc8cdd4, metalness: 1, roughness: 0.25 }),
  dark: () => new T.MeshStandardMaterial({ color: 0x24272c, metalness: 0.8, roughness: 0.42 }),
  rubber: () => new T.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 }),
  carbon: () => new T.MeshStandardMaterial({ color: 0x18191b, metalness: 0.35, roughness: 0.3 }),
  glass: () => new T.MeshPhysicalMaterial({ color: 0x0c1824, metalness: 0.1, roughness: 0.03, transparent: true, opacity: 0.55, clearcoat: 1, envMapIntensity: 2.2 }),
  copper: () => new T.MeshStandardMaterial({ color: 0xc07b45, metalness: 1, roughness: 0.28 }),
  white: () => new T.MeshPhysicalMaterial({ color: 0xf3f4f6, metalness: 0.1, roughness: 0.35, clearcoat: 0.6 }),
  concrete: r => new T.MeshStandardMaterial({ map: TEX.concrete(r || [1, 1]), roughness: 0.95 }),
  glow: (c, op = 1) => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: op, depthWrite: false, blending: T.AdditiveBlending }),
  flat: (c, op = .95) => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: op, depthTest: false, depthWrite: false }),
};

/* ---------- helpers ---------- */
function M(geo, mat, cast = true, recv = false) { const m = new T.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; return m; }
const UP = new T.Vector3(0, 1, 0);
function rod(a, b, r, mat) { const m = M(new T.CylinderGeometry(r, r, 1, 12), mat); setRod(m, a, b); return m; }
function setRod(m, a, b) { V.subVectors(b, a); const L = V.length() || 1e-4; m.position.copy(a).addScaledVector(V, .5); m.scale.set(1, L, 1); m.quaternion.setFromUnitVectors(UP, V.normalize()); }
function marker(parent, x, y, z) { const o = new T.Object3D(); o.position.set(x, y, z); parent.add(o); return o; }
function arrow3(color, thick = 1) {
  const g = new T.Group(), m = MAT.flat(color, .95);
  const shaft = new T.Mesh(new T.CylinderGeometry(.06 * thick, .06 * thick, 1, 12), m); const head = new T.Mesh(new T.ConeGeometry(.2 * thick, .45 * thick, 16), m);
  shaft.renderOrder = head.renderOrder = 20; g.add(shaft, head); const tip = new T.Object3D(); g.add(tip);
  g.userData.set = (o, d, len) => { len = Math.max(.05, len); const n = V2.copy(d).normalize(); g.position.copy(o); g.quaternion.setFromUnitVectors(UP, n); shaft.scale.y = Math.max(.01, len - .45 * thick); shaft.position.y = shaft.scale.y / 2; head.position.y = len - .225 * thick; tip.position.y = len + .3; };
  g.userData.tip = tip; g.userData.isOverlay = true; return g;
}
function particles(n, color, size, opts = {}) {
  const g = new T.BufferGeometry(), pos = new Float32Array(n * 3); g.setAttribute("position", new T.BufferAttribute(pos, 3));
  const m = new T.PointsMaterial({ color, size, map: TEX.sprite(), transparent: true, opacity: opts.opacity ?? .7, depthWrite: false, blending: opts.add ? T.AdditiveBlending : T.NormalBlending, sizeAttenuation: true });
  const p = new T.Points(g, m); p.frustumCulled = false; p.userData = { pos, vel: new Float32Array(n * 3), life: new Float32Array(n).fill(-1), n }; return p;
}
function trees(count, rMin, rMax, avoidRoad) {
  const g = new T.Group();
  const trunk = new T.InstancedMesh(new T.CylinderGeometry(.18, .26, 2.4, 8), new T.MeshStandardMaterial({ map: TEX.bark([1, 2]), roughness: 1 }), count);
  const crown = new T.InstancedMesh(new T.IcosahedronGeometry(1.7, 1), new T.MeshStandardMaterial({ map: TEX.leaves([2, 2]), roughness: .95, flatShading: true }), count);
  trunk.castShadow = crown.castShadow = true; trunk.frustumCulled = crown.frustumCulled = false; const mx = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(), p = new T.Vector3(); const pts = [];
  for (let i = 0; i < count; i++) {
    let x, z; do { const a = rnd() * Math.PI * 2, r = rMin + rnd() * (rMax - rMin); x = Math.cos(a) * r; z = Math.sin(a) * r; } while (avoidRoad && Math.abs(z) < 9);
    const k = .7 + rnd() * .9; pts.push({ x, z, k });
  }
  g.userData.pts = pts; g.userData.set = (off) => {
    pts.forEach((t, i) => { let x = t.x - off; x = ((x + rMax) % (2 * rMax) + 2 * rMax) % (2 * rMax) - rMax;
      s.set(t.k, t.k, t.k); p.set(x, 1.2 * t.k, t.z); mx.compose(p, q, s); trunk.setMatrixAt(i, mx); s.set(t.k, t.k * 1.25, t.k); p.set(x, 3.4 * t.k, t.z); mx.compose(p, q, s); crown.setMatrixAt(i, mx); });
    trunk.instanceMatrix.needsUpdate = crown.instanceMatrix.needsUpdate = true; };
  g.userData.set(0); g.add(trunk, crown); return g;
}
function waveH(x, z, t) { return .32 * Math.sin(.28 * x + 1.1 * t) + .18 * Math.sin(.41 * z + .7 * t + 1.3) + .09 * Math.sin(.9 * (x + z) + 1.9 * t) + .05 * Math.sin(1.7 * x - 1.3 * z + 2.6 * t); }

/* ---------- grounds ---------- */
function macroColors(geo, warm) { const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), n = fbm(x * .012 + 40, z * .012 + 9, 4), m = fbm(x * .0025, z * .0025, 3), k = .72 + .5 * n + .18 * (m - .5);
    col[i * 3] = k * (warm ? 1.02 : (.95 + .1 * m)); col[i * 3 + 1] = k; col[i * 3 + 2] = k * (warm ? .95 : .9); }
  geo.setAttribute("color", new T.BufferAttribute(col, 3)); }
function terrainH(x, z) { const r = Math.hypot(x, z), f = Math.max(0, Math.min(1, (r - 28) / 70)); return f * (fbm(x * .006 + 11, z * .006 + 5, 4) * 46 - 15 + Math.sin(x * .011 + z * .004) * 6); }
function makeGround(kind, base) {
  if (kind === "none") return new T.Group();
  const g = new T.Group(), desert = base === "desert" || base === "snow", snow = base === "snow";
  if (desert && kind !== "water") {
    const geo = new T.PlaneGeometry(1800, 1800, 220, 220).rotateX(-Math.PI / 2), p = geo.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, terrainH(p.getX(i), p.getZ(i))); geo.computeVertexNormals(); macroColors(geo, true);
    const tr = M(geo, snow ? new T.MeshStandardMaterial({ map: TEX.snow([260, 260]), bumpMap: TEX.snow([260, 260]), bumpScale: 1.2, roughness: .85, color: 0xffffff }) : new T.MeshStandardMaterial({ map: TEX.sand([260, 260]), bumpMap: TEX.sand([260, 260]), bumpScale: 2.2, roughness: 1, vertexColors: true }), false, true); g.add(tr); g.userData.grass = tr;
    const rockM = new T.MeshStandardMaterial({ color: snow ? 0x4a4f57 : 0x7a5b40, roughness: .95, flatShading: true });
    for (let i = 0; i < 45; i++) { const a = rnd() * 6.28, r = 10 + rnd() * 70, s = .2 + rnd() * 1.1, rk = M(new T.IcosahedronGeometry(s, 1), rockM, true, true); rk.position.set(Math.cos(a) * r, terrainH(Math.cos(a) * r, Math.sin(a) * r) + s * .3, Math.sin(a) * r); rk.scale.set(1, .55 + rnd() * .4, 1 + rnd() * .5); rk.rotation.y = rnd() * 6; g.add(rk); }
    if (kind === "road") { const rd = M(new T.PlaneGeometry(4000, 9).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ map: TEX.asphalt([500, 1]), roughness: .9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), false, true); rd.position.y = .06; g.add(rd); g.userData.road = rd; }
    if (kind === "pad") { const pd = M(new T.CylinderGeometry(22, 22, .3, 64), MAT.concrete([6, 6]), false, true); pd.position.y = .15; g.add(pd); }
    return g; }
  if (kind === "water") {
    const geo = new T.PlaneGeometry(260, 260, 110, 110); geo.rotateX(-Math.PI / 2);
    const w = M(geo, new T.MeshPhysicalMaterial({ color: 0x0b3a57, roughness: .07, metalness: 0, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1.3 }), false, true);
    const far = M(new T.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: 0x0d3a55, roughness: .15, metalness: 0, envMapIntensity: 1.2 }), false, false); far.position.y = -.4;
    g.add(far, w); g.userData.water = w;
  } else {
    const gg = new T.PlaneGeometry(4000, 4000, 240, 240).rotateX(-Math.PI / 2); macroColors(gg, false); const gr = M(gg, new T.MeshStandardMaterial({ map: TEX.grass([500, 500]), bumpMap: TEX.grass([500, 500]), bumpScale: 1.2, roughness: 1, vertexColors: true }), false, true); g.add(gr); g.userData.grass = gr;
    if (kind === "road") { const rd = M(new T.PlaneGeometry(4000, 9).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ map: TEX.asphalt([500, 1]), roughness: .9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), false, true); rd.position.y = .06; g.add(rd); g.userData.road = rd; }
    if (kind === "pad") { const pd = M(new T.CylinderGeometry(22, 22, .3, 64), MAT.concrete([6, 6]), false, true); pd.position.y = .15; g.add(pd); }
    const tr = trees(kind === "road" ? 160 : 110, kind === "pad" ? 60 : kind === "open" ? 95 : 26, kind === "open" ? 320 : 260, kind === "road"); g.add(tr); g.userData.trees = tr;
  }
  return g;
}

/* ---------- sculpting helpers: loft (CAD-style cross-section surfaces) + airfoils ---------- */
function crv(p0, p1, p2, p3, t) { const t2 = t * t, t3 = t2 * t; return .5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); }
function sampleStations(st, S) { const N = st.length, keys = Object.keys(st[0]), out = [];
  for (let i = 0; i <= S; i++) { const s = i / S * (N - 1), k = Math.min(N - 2, Math.floor(s)), f = s - k, o = {};
    keys.forEach(key => { const g = j => st[Math.max(0, Math.min(N - 1, j))][key]; o[key] = crv(g(k - 1), g(k), g(k + 1), g(k + 2), f); }); out.push(o); }
  return out; }
const ST = a => a.map(([x, w, t, b, yc, n]) => ({ x, w, t, b, yc, n: n || 2 }));
function loft(st, o = {}) {
  const S = o.S || 64, Rn = o.R || 48, a0 = o.a0 ?? -Math.PI / 2, a1 = o.a1 ?? (a0 + Math.PI * 2), sc = o.scale || 1, closed = Math.abs(a1 - a0 - Math.PI * 2) < 1e-6;
  const rows = sampleStations(st, S), pos = [], uv = [], col = [], idx = [], c = new T.Color();
  rows.forEach((r, i) => { for (let j = 0; j <= Rn; j++) { const th = a0 + (a1 - a0) * j / Rn, cs = Math.cos(th), sn = Math.sin(th), e = 2 / Math.max(1.2, r.n);
    const z = Math.sign(cs) * Math.pow(Math.abs(cs), e) * r.w * sc, yy = Math.sign(sn) * Math.pow(Math.abs(sn), e) * (sn >= 0 ? r.t : r.b) * sc;
    pos.push(r.x, r.yc + yy, z); uv.push(i / S, j / Rn); if (o.color) { o.color(c, r.x, yy, z, r); col.push(c.r, c.g, c.b); } } });
  const flip = rows[S].x > rows[0].x;
  for (let i = 0; i < S; i++) for (let j = 0; j < Rn; j++) { const a = i * (Rn + 1) + j, b = a + Rn + 1; if (flip) idx.push(a, b, a + 1, b, b + 1, a + 1); else idx.push(a, a + 1, b, b, a + 1, b + 1); }
  if (closed && o.caps !== false) [0, S].forEach(i => { const r = rows[i], ci = pos.length / 3; pos.push(r.x, r.yc, 0); uv.push(.5, .5); if (o.color) { o.color(c, r.x, 0, 0, r); col.push(c.r, c.g, c.b); }
    for (let j = 0; j < Rn; j++) { const a = i * (Rn + 1) + j; idx.push(ci, a, a + 1); } });
  const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  if (o.color) g.setAttribute("color", new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
/* NACA-style airfoil surface: chord along X (leading edge toward +X), span along +Z (or -Z with dir=-1) */
function airfoil(o) {
  const { span, root, tip, th = .12, cam = .02, sweep = 0, dih = 0, twist = 0, S = 14, C = 14, dir = 1, color } = o;
  const pos = [], idx = [], col = [], cc = new T.Color(), nC = 2 * C + 1;
  for (let i = 0; i <= S; i++) { const u = i / S, ch = root + (tip - root) * u, zz = u * span, tw = T.MathUtils.degToRad(twist * u), le = -sweep * u, cs = Math.cos(tw), sn = Math.sin(tw);
    for (let j = 0; j < nC; j++) { const k = j <= C ? 1 - j / C : (j - C) / C, xc = (1 - Math.cos(Math.PI * k)) / 2;
      const yt = 5 * th * (.2969 * Math.sqrt(xc) - .126 * xc - .3516 * xc * xc + .2843 * xc ** 3 - .1036 * xc ** 4), ycam = cam * 4 * xc * (1 - xc), up = j <= C;
      const px = -(xc - .25) * ch, py = (ycam + (up ? yt : -yt)) * ch * (u > .985 ? .4 : 1);
      pos.push(px * cs - py * sn + le, px * sn + py * cs + zz * Math.tan(dih), zz * dir); if (color) { color(cc, u, xc); col.push(cc.r, cc.g, cc.b); } } }
  for (let i = 0; i < S; i++) for (let j = 0; j < nC - 1; j++) { const a = i * nC + j, b = a + nC; if (dir > 0) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); if (color) g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
function tube(pts, r, mat, seg = 48) { return M(new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(p => new T.Vector3(...p))), seg, r, 12, false), mat); }
const DS = m => { m.side = T.DoubleSide; return m; };
const VC = m => { m.vertexColors = true; return m; };
function lathe(profile, seg, mat) { return M(new T.LatheGeometry(profile.map(([r, y]) => new T.Vector2(r, y)), seg || 48), mat); }
function bladeGeo(len, root, tip, twist, tipColor) { const g = airfoil({ span: len, root, tip, th: .11, cam: .02, twist, S: 18, C: 10, color: (c, u) => c.set(u > .93 ? tipColor : 0x2b2e33) }); g.rotateY(Math.PI / 2); return g; }

/* ---------- builders (each returns {root, update, anchors, labels, cam, follow}) ---------- */
const Q = (v, n = 12) => Math.round(v * n);
const B = {};

B.rotorcraft = (R, st) => {
  const L = Math.max(1, Math.min(5, Math.round(R.role("levels", 1)))), n = Math.max(1, Math.min(6, Math.round(R.role("rotors", 1))));
  const size = R.tr("size", .5), load = R.tr("load", .5), Rr = 1.6 + size * 4.6, bs = .8 + load * .8;
  const root = new T.Group(), craft = new T.Group(); root.add(craft);
  const main = 0x17407e, accent = 0xd6282f;
  const livery = DS(VC(new T.MeshPhysicalMaterial({ color: 0xffffff, metalness: .35, roughness: .28, clearcoat: 1, clearcoatRoughness: .05 })));
  const liv = (c, x, yy) => c.set(yy < -.22 ? 0xf2f3f5 : yy < -.12 ? accent : main);
  const glass = DS(new T.MeshPhysicalMaterial({ color: 0x0a141e, metalness: .2, roughness: .04, clearcoat: 1, clearcoatRoughness: .02, envMapIntensity: 2.4 }));
  const metal = MAT.metal(), dark = MAT.dark(), rubber = MAT.rubber();
  const body = new T.Group(); body.scale.setScalar(bs); craft.add(body);
  // fuselage: sculpted from cross-sections (nose -> tail cone)
  const fus = ST([[2.58, .03, .03, .03, 1.02, 2], [2.46, .36, .40, .34, 1.04, 2.1], [2.2, .6, .66, .5, 1.08, 2.3], [1.75, .73, .8, .56, 1.12, 2.5], [1.05, .78, .86, .58, 1.14, 2.7],
    [.25, .76, .85, .58, 1.15, 2.7], [-.45, .66, .76, .5, 1.17, 2.5], [-1.05, .46, .58, .36, 1.22, 2.2], [-1.55, .26, .36, .22, 1.3, 2], [-1.95, .16, .2, .14, 1.36, 2]]);
  body.add(M(loft(fus, { S: 80, R: 56, color: liv }), livery));
  // tinted bubble canopy over the front cabin
  const can = ST([[2.56, .04, .04, .04, 1.03, 2], [2.44, .38, .42, .36, 1.05, 2.1], [2.18, .62, .68, .52, 1.09, 2.3], [1.72, .75, .82, .57, 1.13, 2.5], [1.0, .79, .87, .58, 1.14, 2.7], [.62, .78, .86, .58, 1.15, 2.7]]);
  body.add(M(loft(can, { S: 48, R: 48, a0: -.62, a1: Math.PI + .62, scale: 1.012 }), glass));
  // door frames (painted pillars)
  [1.0, .3].forEach(x => { const ring = M(loft(ST([[x + .035, .8, .88, .6, 1.15, 2.7], [x - .035, .8, .88, .6, 1.15, 2.7]]), { S: 2, R: 48, a0: -.2, a1: Math.PI + .2, scale: 1.02 }), DS(MAT.paint(main))); body.add(ring); });
  // engine cowling + exhaust
  body.add(M(loft(ST([[.6, .05, .05, .02, 1.95, 2], [.35, .3, .2, .05, 1.97, 2.6], [-.4, .34, .3, .05, 1.95, 2.8], [-1.0, .22, .16, .05, 1.85, 2.4], [-1.25, .05, .05, .03, 1.78, 2]]), { S: 40, R: 32 }), DS(MAT.paint(main))));
  const ex = M(new T.CylinderGeometry(.08, .1, .35, 16).rotateZ(Math.PI / 2), dark); ex.position.set(-1.25, 1.83, .12); body.add(ex);
  // tail boom
  body.add(M(loft(ST([[-1.9, .16, .17, .15, 1.36, 2], [-3.5, .12, .12, .11, 1.42, 2], [-5.4, .075, .075, .07, 1.48, 2], [-6.0, .06, .06, .06, 1.5, 2]]), { S: 30, R: 24 }), DS(MAT.paint(main))));
  // vertical fin (swept airfoil) + ventral fin + tail skid
  const vf = M(airfoil({ span: 1.05, root: .75, tip: .42, th: .1, cam: 0, sweep: .5, S: 10, C: 12 }), DS(MAT.paint(main))); vf.rotation.x = -Math.PI / 2; vf.position.set(-5.7, 1.5, 0); body.add(vf);
  const vv = M(airfoil({ span: .55, root: .55, tip: .35, th: .1, cam: 0, sweep: .25, S: 6, C: 10 }), DS(MAT.paint(main))); vv.rotation.x = Math.PI / 2; vv.position.set(-5.7, 1.46, 0); body.add(vv);
  body.add(tube([[-5.55, .95, 0], [-5.9, .9, 0], [-6.1, .98, 0]], .02, metal, 8));
  // horizontal stabilizer
  [1, -1].forEach(sd => { const hs = M(airfoil({ span: .75, root: .42, tip: .3, th: .1, cam: -.02, sweep: .12, S: 8, C: 10, dir: sd }), DS(MAT.paint(main))); hs.position.set(-5.05, 1.47, 0); body.add(hs);
    const nl = M(new T.SphereGeometry(.04, 10, 8), MAT.glow(sd > 0 ? 0x22ff66 : 0xff2233), false); nl.position.set(-5.1, 1.47, sd * .76); body.add(nl); });
  const beacon = M(new T.SphereGeometry(.06, 12, 8), MAT.glow(0xff2a2a), false); beacon.position.set(-.6, 2.22, 0); body.add(beacon);
  // landing skids: curved tubes + arched cross tubes
  const skidM = new T.MeshStandardMaterial({ color: 0x2a2d31, metalness: .7, roughness: .35 });
  [-1, 1].forEach(sd => body.add(tube([[-1.45, .08, sd * .98], [.2, .08, sd * .98], [1.45, .08, sd * .98], [1.78, .16, sd * .98], [1.9, .36, sd * .98]], .045, skidM, 40)));
  [.95, -.8].forEach(x => body.add(tube([[x, .08, -.98], [x, .42, -.86], [x, .64, -.45], [x, .66, 0], [x, .64, .45], [x, .42, .86], [x, .08, .98]], .04, skidM, 40)));
  // tail rotor (only for single-level; stacked counter-rotating levels cancel torque)
  let tailRot = null; if (L === 1 && n === 1) { tailRot = new T.Group(); tailRot.position.set(-5.85, 1.62, .16); body.add(tailRot);
    tailRot.add(M(new T.CylinderGeometry(.06, .06, .12, 12).rotateX(Math.PI / 2), dark)); [0, 1].forEach(b => { const bl = M(bladeGeo(.52, .11, .08, -4, 0xffc21a), DS(VC(new T.MeshStandardMaterial({ color: 0xffffff, metalness: .4, roughness: .4 })))); bl.rotation.z = b * Math.PI + Math.PI / 2; bl.rotation.y = -Math.PI / 2; bl.position.z = .05; tailRot.add(bl); }); }
  // rotor masts & heads
  const mastBase = 2.12 * bs, gap = .55, stackTop = mastBase + .5 + (L - 1) * gap, span = 2 * Rr * 1.06, xs = [...Array(n)].map((_, i) => (i - (n - 1) / 2) * span);
  const bladeM = DS(VC(new T.MeshStandardMaterial({ color: 0xffffff, metalness: .35, roughness: .38 }))), stacks = [];
  xs.forEach((z, i) => {
    const mast = M(new T.CylinderGeometry(.07, .1, stackTop - mastBase + .2, 16), metal); mast.position.set(0, (stackTop + mastBase) / 2, z); craft.add(mast);
    if (n > 1) { craft.add(tube([[0, mastBase - .05, 0], [0, mastBase + .05, z * .5], [0, mastBase, z]], .07, dark, 16)); const pod = M(new T.CylinderGeometry(.16, .2, .35, 20), MAT.paint(main)); pod.position.set(0, mastBase + .1, z); craft.add(pod); }
    const levels = [];
    for (let l = 0; l < L; l++) {
      const y = mastBase + .5 + l * gap, g = new T.Group(); g.position.set(0, y, z); craft.add(g);
      const sw = M(new T.CylinderGeometry(.2, .2, .04, 24), metal); sw.position.y = -.16; g.add(sw);
      const hub = M(new T.CylinderGeometry(.13, .16, .14, 20), dark); g.add(hub);
      const blades = new T.Group(); g.add(blades);
      const nb = L > 1 ? 3 : 2;
      for (let b = 0; b < nb; b++) { const arm = new T.Group(); arm.rotation.y = b * Math.PI * 2 / nb; blades.add(arm);
        const grip = M(new T.BoxGeometry(.32, .07, .12), metal); grip.position.x = .26; arm.add(grip);
        const pl = rod(new T.Vector3(.2, -.15, .08), new T.Vector3(.22, 0, .08), .012, metal); arm.add(pl);
        const bl = M(bladeGeo(Rr - .4, .3, .22, -9, l % 2 ? 0xffc21a : 0xf3f4f6), bladeM); bl.position.x = .4; bl.rotation.x = .05 * (l % 2 ? -1 : 1); arm.add(bl); }
      const disc = M(new T.CircleGeometry(Rr, 72).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: TEX.blur(), transparent: true, opacity: 0, depthWrite: false }), false); disc.position.y = .02; g.add(disc);
      levels.push({ g, blades, disc, dir: l % 2 ? -1 : 1, y });
    }
    const cap = M(new T.SphereGeometry(.1, 16, 10), dark); cap.position.set(0, stackTop + .12, z); craft.add(cap);
    stacks.push({ z, levels });
  });
  const dust = particles(420, 0xcbb894, .55, { opacity: .55 }); root.add(dust);
  const wash = particles(160, 0xe8f6ff, .35, { opacity: .25 }); root.add(wash);
  const aT = arrow3(0x22d3ee, 1.4), aW = arrow3(0xfb7185, 1.4); root.add(aT, aW);
  const mk = { battery: marker(body, -.4, 1.0, 0), motor: marker(body, -.2, 2.05, 0), levels: marker(craft, 0, (mastBase + stackTop) / 2, xs[0]), fans: marker(craft, Rr * .9, stackTop, xs[0]), body: marker(body, 1.6, 1.3, .7), load: marker(body, .5, 1.2, .8) };
  const gm = marker(root, 0, .2, 0); mk.downwash = gm; mk.thrust = aT.userData.tip; mk.weight = aW.userData.tip;
  const share = [...Array(L)].map((_, l) => 1 / (1 + .35 * l)), ssum = share.reduce((a, b) => a + b, 0);
  const labels = [{ obj: aT.userData.tip, text: () => "Thrust " + (R.tw >= 10 ? R.tw.toFixed(0) : R.tw.toFixed(2)) + "× weight", col: "#22d3ee" }, { obj: aW.userData.tip, text: () => "Weight", col: "#fb7185" }];
  if (L > 1) stacks[n - 1].levels.forEach((lv, l) => { const m = marker(craft, 0, lv.y, stacks[n - 1].z + Rr + .5); labels.push({ obj: m, text: () => `L${l + 1} ${Math.round(share[l] / ssum * 100)}%`, col: "#67e8f9" }); });
  return {
    root, anchors: mk, labels, follow: craft, cam: { pos: new T.Vector3(6 + Rr * 1.6, 3 + Rr * .45, 8.5 + Rr * 1.9 + (n - 1) * Rr), target: new T.Vector3(0, 1.9, 0) },
    update(R, dt, t) {
      const lm = Math.log10(R.margin), tgt = R.ok ? Math.min(1, .35 + .45 * Math.min(1, lm / .4)) : 0;
      st.alt = st.alt == null ? tgt : st.alt + (tgt - st.alt) * Math.min(1, dt * 1.2);
      const strain = !R.ok && R.margin > .3;
      craft.position.y = st.alt * 14 + (R.ok ? Math.sin(t * 1.7) * .12 : 0);
      craft.rotation.z = strain ? Math.sin(t * 31) * .01 : (R.ok ? -.04 * st.alt + Math.sin(t * .9) * .015 * st.alt : 0);
      craft.rotation.x = strain ? Math.cos(t * 27) * .008 : 0;
      const spin = (8 + 26 * Math.min(1, R.margin)) * dt;
      stacks.forEach(s => s.levels.forEach(lv => { lv.blades.rotation.y += lv.dir * spin; lv.disc.rotation.y -= lv.dir * spin * .3; lv.disc.material.opacity = .14 + .36 * Math.min(1, R.margin); }));
      if (tailRot) tailRot.rotation.z += spin * 4.5;
      const p = dust.userData, h = craft.position.y, power = Math.min(1, R.margin) * Math.max(0, 1 - h / 16);
      for (let i = 0; i < p.n; i++) {
        if (p.life[i] <= 0 && Math.random() < power * .3) { const a = Math.random() * 6.283, r0 = Rr * (.3 + Math.random() * .4); p.pos[i * 3] = Math.cos(a) * r0; p.pos[i * 3 + 1] = .1; p.pos[i * 3 + 2] = Math.sin(a) * r0; const v = 3 + Math.random() * 5; p.vel[i * 3] = Math.cos(a) * v; p.vel[i * 3 + 1] = .6 + Math.random() * 1.4; p.vel[i * 3 + 2] = Math.sin(a) * v; p.life[i] = 1.2 + Math.random(); }
        if (p.life[i] > 0) { p.life[i] -= dt; for (let k = 0; k < 3; k++) p.pos[i * 3 + k] += p.vel[i * 3 + k] * dt; p.vel[i * 3 + 1] -= .8 * dt; if (p.pos[i * 3 + 1] < .05) p.pos[i * 3 + 1] = .05; } else p.pos[i * 3 + 1] = -50;
      }
      dust.geometry.attributes.position.needsUpdate = true; dust.material.opacity = .5 * Math.max(.15, power);
      const q = wash.userData; for (let i = 0; i < q.n; i++) {
        if (q.life[i] <= 0 && Math.random() < .25 * Math.min(1, R.margin)) { const s = stacks[(Math.random() * n) | 0], a = Math.random() * 6.283, r0 = Math.random() * Rr * .8; q.pos[i * 3] = Math.cos(a) * r0; q.pos[i * 3 + 1] = h + mastBase; q.pos[i * 3 + 2] = s.z + Math.sin(a) * r0; q.vel[i * 3 + 1] = -(6 + Math.random() * 6); q.life[i] = 1; }
        if (q.life[i] > 0) { q.life[i] -= dt; q.pos[i * 3 + 1] += q.vel[i * 3 + 1] * dt; q.pos[i * 3] *= 1 - dt * .3; if (q.pos[i * 3 + 1] < .1) q.life[i] = 0; } else q.pos[i * 3 + 1] = -50;
      }
      wash.geometry.attributes.position.needsUpdate = true;
      V.set(.2, craft.position.y + 1.2 * bs, -1.3 * bs); aT.userData.set(V, UP, 2.4 * Math.min(2, R.tw));
      V.set(.2, craft.position.y + .3, 0); aW.userData.set(V, V2.set(0, -1, 0), Math.min(2.4, Math.max(.6, craft.position.y + .2)));
    }
  };
};

B.aircraft = (R, st) => {
  const spanM = 9 + R.tr("span", .5) * 26, flap = R.role("flap", 0) > .5;
  const root = new T.Group(), craft = new T.Group(); root.add(craft);
  const skin = DS(new T.MeshPhysicalMaterial({ color: 0xf6f7f9, metalness: .1, roughness: .25, clearcoat: 1, clearcoatRoughness: .05 })), glass = DS(new T.MeshPhysicalMaterial({ color: 0x0a141e, metalness: .2, roughness: .04, clearcoat: 1, envMapIntensity: 2.4 }));
  const stripe = DS(MAT.paint(0x6d4dff));
  // pod-and-boom glider fuselage
  const pod = ST([[2.25, .03, .03, .03, 0, 2], [2.05, .26, .3, .26, .02, 2], [1.4, .36, .46, .36, .06, 2.2], [.5, .38, .48, .38, .08, 2.2], [-.3, .3, .36, .3, .1, 2.1], [-1.2, .14, .16, .14, .16, 2], [-3.2, .085, .09, .08, .24, 2], [-5.4, .06, .06, .055, .3, 2]]);
  craft.add(M(loft(pod, { S: 90, R: 40 }), skin));
  craft.add(M(loft(ST([[2.2, .04, .04, .04, .01, 2], [1.95, .27, .32, .27, .03, 2], [1.35, .34, .45, .3, .07, 2.2], [.6, .3, .42, .25, .08, 2.2]]), { S: 40, R: 40, a0: -.15, a1: Math.PI + .15, scale: 1.015 }), glass));
  craft.add(M(loft(ST([[-1.1, .145, .165, .145, .16, 2], [-1.5, .13, .15, .13, .18, 2]]), { S: 2, R: 32, scale: 1.02 }), stripe));
  // wings: tapered airfoil with dihedral and washout
  const wings = [];
  [1, -1].forEach(sd => { const piv = new T.Group(); piv.position.set(.35, .42, sd * .3); craft.add(piv);
    const w = M(airfoil({ span: spanM / 2, root: 1.25, tip: .5, th: .15, cam: .045, sweep: .35, dih: T.MathUtils.degToRad(3), twist: -3, S: 22, C: 16, dir: sd }), skin); piv.add(w);
    const wl = M(airfoil({ span: .45, root: .5, tip: .25, th: .1, cam: 0, sweep: .25, S: 4, C: 8 }), skin); wl.rotation.x = -Math.PI / 2 + sd * .0; wl.position.set(-.35, spanM / 2 * Math.tan(T.MathUtils.degToRad(3)), sd * spanM / 2); piv.add(wl);
    const tipS = M(new T.BoxGeometry(.3, .02, .05), stripe); tipS.position.set(-.3, spanM / 2 * .052 + .02, sd * spanM / 2 * .97); piv.add(tipS);
    wings.push({ piv, sd }); });
  // T-tail
  const vt = M(airfoil({ span: 1.15, root: .95, tip: .55, th: .1, cam: 0, sweep: .5, S: 10, C: 12 }), skin); vt.rotation.x = -Math.PI / 2; vt.position.set(-5.0, .3, 0); craft.add(vt);
  [1, -1].forEach(sd => { const ht = M(airfoil({ span: 1.25, root: .55, tip: .35, th: .1, cam: 0, sweep: .1, S: 10, C: 10, dir: sd }), skin); ht.position.set(-5.45, 1.42, 0); craft.add(ht); });
  let prop = null; if (!flap) { prop = new T.Group(); prop.position.set(2.32, .0, 0); craft.add(prop); const sp = lathe([[0, 0], [.12, .02], [.1, .14], [.02, .24], [0, .25]], 24, MAT.paint(0x6d4dff)); sp.rotation.z = -Math.PI / 2; prop.add(sp);
    [0, 1].forEach(b => { const bl = M(bladeGeo(.9, .14, .07, -18, 0xf3f4f6), DS(VC(new T.MeshStandardMaterial({ color: 0xffffff, roughness: .35, metalness: .3 })))); bl.rotation.z = Math.PI / 2; bl.rotation.x = b * Math.PI; bl.position.x = .05; prop.add(bl); }); }
  const gear = M(new T.CylinderGeometry(.16, .16, .1, 24).rotateX(Math.PI / 2), MAT.rubber()); gear.position.set(.4, -.42, 0); craft.add(gear);
  const aL = arrow3(0x22d3ee, 1.2), aW = arrow3(0xfb7185, 1.2), aT = arrow3(0x22d3ee, 1.2), aD = arrow3(0xfb7185, 1.2); root.add(aL, aW, aT, aD);
  const mk = { body: marker(craft, 1.2, .3, .4), wing: marker(wings[0].piv, -.2, spanM / 2 * .05, spanM / 2 * .95), airfoil: marker(wings[0].piv, 0, .12, spanM / 5), lift: aL.userData.tip, weight: aW.userData.tip, thrust: aT.userData.tip, drag: aD.userData.tip };
  const labels = [{ obj: aL.userData.tip, text: () => "Lift", col: "#22d3ee" }, { obj: aW.userData.tip, text: () => "Weight", col: "#fb7185" }, { obj: aT.userData.tip, text: () => "Thrust", col: "#22d3ee" }, { obj: aD.userData.tip, text: () => "Drag", col: "#fb7185" }];
  return {
    root, anchors: mk, labels, follow: craft, ground: "grass", moving: true, cam: { pos: new T.Vector3(-3, 3.5, 14 + spanM * .5), target: new T.Vector3(0, 1.2, 0) },
    update(R, dt, t) {
      const tgt = R.ok ? .6 : 0; st.alt = st.alt == null ? tgt : st.alt + (tgt - st.alt) * Math.min(1, dt * .8);
      craft.position.y = .62 + st.alt * 22 + (R.ok ? Math.sin(t * 1.3) * .3 : 0);
      st.speed = R.ok ? 14 : Math.max(0, (st.speed ?? 6) - dt * 2);
      const f = flap ? Math.sin(t * (R.ok ? 4.5 : 2.5)) * .45 : 0;
      wings.forEach(w => w.piv.rotation.x = -w.sd * f);
      craft.rotation.z = R.ok ? .05 + Math.sin(t * .7) * .02 : .02; craft.rotation.x = R.ok ? Math.sin(t * .5) * .02 : 0;
      if (prop) prop.rotation.x += dt * (10 + 30 * Math.min(1, R.margin));
      const c = craft.position, fl = 2.6, lift = fl * (R.ok ? 1 : Math.min(1, .35 + .6 * R.frac));
      aL.userData.set(V.set(c.x, c.y + .7, c.z), UP, lift); aW.userData.set(V.set(c.x, c.y - .45, c.z), V2.set(0, -1, 0), Math.max(.4, Math.min(fl, c.y - .1)));
      aT.userData.set(V.set(c.x + 2.8, c.y, c.z), V2.set(1, 0, 0), 2 * Math.min(1.5, R.frac + .05)); aD.userData.set(V.set(c.x - 1.2, c.y + .3, c.z + 1.2), V2.set(-1, 0, 0), 2);
      return st.speed;
    }
  };
};

function wheelM() { const g = new T.Group(); const tire = lathe([[.2, -.12], [.3, -.125], [.335, -.1], [.345, 0], [.335, .1], [.3, .125], [.2, .12]], 72, new T.MeshStandardMaterial({ color: 0x161616, roughness: .9, bumpMap: TEX.tread([14, 1]), bumpScale: 3 })); tire.rotation.x = Math.PI / 2; g.add(tire);
  const rimM = new T.MeshStandardMaterial({ color: 0xc9ced6, metalness: 1, roughness: .2 }); const barrel = M(new T.CylinderGeometry(.21, .21, .2, 36, 1, true).rotateX(Math.PI / 2), DS(rimM)); g.add(barrel);
  const face = new T.Group(); face.position.z = .1; g.add(face); face.add(M(new T.CylinderGeometry(.06, .06, .04, 20).rotateX(Math.PI / 2), rimM));
  for (let k = 0; k < 5; k++) { const sp = M(new T.BoxGeometry(.05, .17, .025), rimM); sp.position.y = .1; const a = new T.Group(); a.rotation.z = k * Math.PI * 2 / 5; a.add(sp); face.add(a); }
  const disc = M(new T.CylinderGeometry(.17, .17, .02, 32).rotateX(Math.PI / 2), new T.MeshStandardMaterial({ color: 0x8d9198, metalness: .9, roughness: .5 })); disc.position.z = .02; g.add(disc);
  const cal = M(new T.BoxGeometry(.1, .14, .05), MAT.paint(0xd6282f)); cal.position.set(.12, .08, .06); cal.rotation.z = -.6; g.add(cal); g.userData.spin = face; return g; }
function buildCar(paintC) {
  const g = new T.Group(); const paint = DS(MAT.paint(paintC)), glass = DS(new T.MeshPhysicalMaterial({ color: 0x0b131c, metalness: .2, roughness: .04, clearcoat: 1, envMapIntensity: 2.2 })), trim = DS(MAT.dark());
  // body shell lofted front->rear; bottom rises at the axles to form wheel arches
  const body = ST([[2.34, .62, .12, .16, .55, 3], [2.22, .84, .2, .3, .6, 4], [1.8, .9, .24, .36, .62, 5], [1.42, .92, .27, .17, .66, 5], [1.02, .92, .3, .36, .62, 5], [.55, .92, .33, .4, .62, 5],
    [-.55, .92, .34, .4, .62, 5], [-1.02, .92, .33, .36, .62, 5], [-1.42, .91, .3, .17, .66, 5], [-1.85, .88, .3, .34, .62, 4.5], [-2.22, .8, .27, .28, .62, 3.5], [-2.34, .6, .17, .2, .6, 3]]);
  g.add(M(loft(body, { S: 110, R: 56 }), paint));
  const gh = ST([[.98, .8, .015, .02, .94, 4], [.45, .78, .37, .04, .96, 4], [-.15, .76, .48, .04, .97, 4], [-.85, .74, .47, .04, .97, 4], [-1.45, .72, .3, .04, .96, 4], [-1.78, .7, .02, .04, .95, 4]]);
  g.add(M(loft(gh, { S: 60, R: 48 }), glass));
  g.add(M(loft(gh, { S: 60, R: 24, a0: Math.PI / 2 - .62, a1: Math.PI / 2 + .62, scale: 1.012 }), paint));
  [-.3, -1.2].forEach(x => g.add(M(loft(ST([[x + .05, .77, .46, .04, .97, 4], [x - .05, .77, .46, .04, .97, 4]]), { S: 2, R: 48, a0: -.1, a1: Math.PI + .1, scale: 1.01 }), trim)));
  const wheels = []; [[1.42, .9], [1.42, -.9], [-1.42, .9], [-1.42, -.9]].forEach(([x, z]) => { const w = wheelM(); w.position.set(x, .345, z); if (z < 0) w.rotation.y = Math.PI; g.add(w); wheels.push(w); });
  [-1, 1].forEach(sd => { const hl = M(loft(ST([[2.3, .03, .03, .03, .7, 2], [2.22, .22, .05, .05, .72, 3], [2.0, .2, .035, .035, .76, 3]]), { S: 10, R: 16 }), MAT.glow(0xfff4dc, 1), false); hl.position.z = sd * .55; g.add(hl);
    const tl = M(new T.BoxGeometry(.04, .07, .5), MAT.glow(0xff1a2e, 1), false); tl.position.set(-2.33, .82, sd * .45); g.add(tl);
    const mir = M(loft(ST([[.75, .02, .02, .02, .98, 2], [.68, .08, .06, .05, .98, 2.5], [.55, .07, .05, .04, .98, 2]]), { S: 8, R: 16 }), paint); mir.position.z = sd * .98; g.add(mir); });
  const grille = M(new T.BoxGeometry(.04, .12, 1.0), trim); grille.position.set(2.33, .5, 0); g.add(grille);
  const plate = M(new T.BoxGeometry(.02, .11, .4), new T.MeshStandardMaterial({ color: 0xf0f0f0, roughness: .5 })); plate.position.set(2.36, .36, 0); g.add(plate);
  g.userData.wheels = wheels; return g;
}

function buildBike(withRider = true) {
  const g = new T.Group(), frameM = MAT.paint(0xe23b3b), metal = MAT.metal(), rubber = MAT.rubber(), skin = new T.MeshStandardMaterial({ color: 0xe0b18f, roughness: .7 }), shirt = new T.MeshStandardMaterial({ color: 0x2563eb, roughness: .8 }), pants = new T.MeshStandardMaterial({ color: 0x222831, roughness: .9 });
  const wheels = []; [-.55, .55].forEach(x => { const w = new T.Group(); w.position.set(x, .35, 0); w.add(M(new T.TorusGeometry(.33, .032, 14, 96), new T.MeshStandardMaterial({ color: 0x1a1a1a, roughness: .88, bumpMap: TEX.tread([40, 1]), bumpScale: 3 }))); w.add(M(new T.TorusGeometry(.3, .012, 8, 64), new T.MeshStandardMaterial({ color: 0x2a2d32, metalness: .9, roughness: .3 }))); for (let k = 0; k < 12; k++) { const sp = M(new T.CylinderGeometry(.004, .004, .64, 4), metal, false); sp.rotation.z = k * Math.PI / 12; w.add(sp); } g.add(w); wheels.push(w); });
  const P = (x, y) => new T.Vector3(x, y, 0); const bb = P(0, .35);
  [[P(-.55, .35), bb], [bb, P(-.1, .95)], [P(-.55, .35), P(-.1, .95)], [P(-.1, .95), P(.42, .98)], [bb, P(.42, .98)], [P(.42, .98), P(.55, .35)], [P(.42, .98), P(.38, 1.12)]].forEach(([a, b]) => g.add(rod(a, b, .025, frameM)));
  g.add(rod(P(.38, 1.12).setZ(-.25), P(.38, 1.12).setZ(.25), .018, metal)); const seat = M(new T.BoxGeometry(.24, .05, .12), MAT.rubber()); seat.position.set(-.12, .99, 0); g.add(seat);
  const crank = new T.Group(); crank.position.copy(bb); g.add(crank); const ch = M(new T.TorusGeometry(.1, .012, 6, 24), metal); ch.position.z = .05; crank.add(ch);
  const rider = { parts: [] }; if (withRider) {
    const torso = M(new T.CapsuleGeometry(.16, .42, 6, 12), shirt); torso.position.set(-.02, 1.33, 0); torso.rotation.z = -.55; g.add(torso);
    const head = M(new T.SphereGeometry(.12, 20, 14), skin); head.position.set(.2, 1.68, 0); g.add(head);
    const helm = M(new T.SphereGeometry(.135, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.paint(0xf5f5f5)); helm.position.copy(head.position); g.add(helm);
    [P(.08, 1.45), P(.38, 1.12)].forEach((a, i) => g.add(rod(i ? P(.2, 1.3) : a, i ? P(.38, 1.12) : P(.2, 1.3), .045, shirt)));
    rider.legs = [0, 1].map(s => { const th = M(new T.CylinderGeometry(.06, .06, 1, 10), pants), sh = M(new T.CylinderGeometry(.05, .05, 1, 10), skin); g.add(th, sh); return { th, sh, s }; });
  }
  g.userData = { wheels, crank, rider, bb }; return g;
}
function pedal(bike, a) { const { crank, rider, bb } = bike.userData; crank.rotation.z = -a; if (!rider.legs) return;
  rider.legs.forEach(l => { const aa = a + l.s * Math.PI, z = l.s ? -.1 : .1; const foot = new T.Vector3(bb.x + Math.cos(aa) * .17, bb.y + Math.sin(aa) * .17, z), hip = new T.Vector3(-.12, 1.02, z);
    const d = foot.distanceTo(hip), L1 = .44, L2 = .44, mid = hip.clone().lerp(foot, .5); const off = Math.sqrt(Math.max(0, L1 * L1 - (d / 2) ** 2)); const dir = new T.Vector3().subVectors(foot, hip).normalize(); const perp = new T.Vector3(dir.y, -dir.x, 0); const knee = mid.addScaledVector(perp, -off);
    setRod(l.th, hip, knee); setRod(l.sh, knee, foot); }); }

B.vehicle = (R, st) => {
  const kind = (R.sc.kind || "car").toLowerCase(), root = new T.Group(); let veh, wheels, bike = null, len = 4.6;
  if (kind.includes("bike")) { bike = buildBike(true); veh = bike; wheels = bike.userData.wheels; len = 1.8; }
  else if (kind.includes("train")) { veh = new T.Group(); wheels = [];
    const liv = DS(VC(new T.MeshPhysicalMaterial({ color: 0xffffff, metalness: .3, roughness: .25, clearcoat: 1 })));
    const paintFn = (c, x, yy) => c.set(yy > .3 && yy < .62 ? 0x0c1520 : yy < -.55 ? 0x5a6068 : (yy > -.25 && yy < -.1) ? 0x1d5fbf : 0xf4f5f7);
    const noseFn = (c, x, yy) => c.set(x > 4.4 && yy > .25 ? 0x0c1520 : paintFn(c, x, yy) || c);
    for (let cI = 0; cI < 2; cI++) { const car = new T.Group(); car.position.x = -cI * 14; veh.add(car);
      const st0 = cI === 0 ? ST([[7.1, .04, .04, .04, 1.9, 2], [6.3, .85, .75, .55, 1.85, 2.4], [4.9, 1.42, 1.22, .95, 2.05, 3.2], [3.3, 1.5, 1.35, 1.0, 2.15, 4], [-6.4, 1.5, 1.35, 1.0, 2.15, 4], [-6.65, 1.42, 1.28, .95, 2.15, 4]])
        : ST([[6.65, 1.42, 1.28, .95, 2.15, 4], [6.4, 1.5, 1.35, 1.0, 2.15, 4], [-6.4, 1.5, 1.35, 1.0, 2.15, 4], [-6.65, 1.42, 1.28, .95, 2.15, 4]]);
      car.add(M(loft(st0, { S: cI === 0 ? 90 : 30, R: 48, color: cI === 0 ? noseFn : paintFn }), liv));
      [-4.5, 4.5].forEach(x => { const bog = M(new T.BoxGeometry(2.6, .35, 2.2), MAT.dark()); bog.position.set(x, .75, 0); car.add(bog);
        [-.8, .8].forEach(dx => [-1, 1].forEach(z => { const w = M(new T.CylinderGeometry(.43, .43, .14, 28).rotateX(Math.PI / 2), MAT.metal()); w.position.set(x + dx, .45, z * 1.0); car.add(w); wheels.push(w); })); });
      if (cI === 0) { const pm = MAT.dark(); car.add(rod(new T.Vector3(-2, 3.5, 0), new T.Vector3(-1.2, 4.3, 0), .04, pm)); car.add(rod(new T.Vector3(-1.2, 4.3, 0), new T.Vector3(-.4, 3.5, 0), .04, pm)); const bar = M(new T.BoxGeometry(.1, .05, 1.4), pm); bar.position.set(-1.2, 4.33, 0); car.add(bar); } }
    [-.75, .75].forEach(z => { const rail = M(new T.BoxGeometry(4000, .12, .08), MAT.metal(), false, true); rail.position.set(0, .06, z); root.add(rail); });
    len = 14; }
  else { veh = buildCar(0xc8102e); wheels = veh.userData.wheels; }
  root.add(veh);
  const arch = new T.Group(); const postM = MAT.white(); [-5.5, 5.5].forEach(z => { const p = M(new T.CylinderGeometry(.14, .14, 5, 12), postM); p.position.set(0, 2.5, z); arch.add(p); }); const ban = M(new T.BoxGeometry(.1, 1, 11.2), new T.MeshStandardMaterial({ map: TEX.check(), roughness: .6 })); ban.position.y = 4.6; arch.add(ban); root.add(arch);
  const aF = arrow3(0x22d3ee, 1), aD = arrow3(0xfb7185, 1); root.add(aF, aD);
  const mk = { body: marker(veh, 0, 1.2, 0), battery: marker(veh, 0, .4, 0), motor: marker(veh, -len * .3, .4, 0), wheels: marker(veh, len * .3, .35, .9), speed: marker(veh, 0, bike ? 2 : 2.2, 0), goal: marker(arch, 0, 5.2, 0), drive: aF.userData.tip, drag: aD.userData.tip };
  const labels = [{ obj: aF.userData.tip, text: () => "Drive force", col: "#22d3ee" }, { obj: aD.userData.tip, text: () => "Air drag", col: "#fb7185" }];
  return {
    root, anchors: mk, labels, follow: null, ground: "road", moving: true, cam: { pos: new T.Vector3(len * .4, 2.4 + len * .1, 7 + len * .9), target: new T.Vector3(0, 1, 0) },
    update(R, dt, t) {
      const stop = R.ok ? 1 : .06 + .88 * R.frac, sp = .07 + .08 * R.tr("speed", .5);
      st.p = st.p ?? 0; let moving = false;
      if (st.p < stop) { st.p = Math.min(stop, st.p + dt * sp); moving = true; } else { st.hold = (st.hold || 0) + dt; if (st.hold > 2.5) { st.p = 0; st.hold = 0; } }
      const v = moving ? 10 + 14 * R.tr("speed", .5) : 0; st.v = st.v == null ? v : st.v + (v - st.v) * Math.min(1, dt * 2);
      arch.position.x = 6 + (1 - st.p) * 90 + (st.p >= 1 ? -(st.hold || 0) * 20 : 0);
      wheels.forEach(w => { if (bike) w.rotation.z -= st.v * dt / .33; else w.rotation.z -= st.v * dt / .36; });
      if (bike) pedal(bike, (st.pa = (st.pa || 0) + st.v * dt / .9));
      veh.position.y = moving ? Math.sin(t * 18) * .006 : 0;
      aF.userData.set(V.set(-len * .3, bike ? .4 : .3, 1.3), V2.set(1, 0, 0), 1.6 * (moving ? 1 : .2)); aD.userData.set(V.set(len * .55, bike ? 1.2 : 1, 0), V2.set(1, 0, 0), .1); aD.userData.set(V.set(len * .5 + 1.8, bike ? 1.2 : 1, 0), V2.set(-1, 0, 0), 1.6 * (st.v / 24 + .2));
      return st.v;
    }
  };
};

B.boat = (R, st) => {
  const sail = (R.sc.kind || "").toLowerCase().includes("sail"), Lh = 7 + R.tr("size", .5) * 12, Bw = Lh * .3, D = Lh * .12, fb = Lh * .06;
  const root = new T.Group(), boat = new T.Group(); root.add(boat);
  const NU = 40, NV = 16, pos = [], idx = [], wd = u => u < .3 ? Bw / 2 * (.8 + .2 * u / .3) : Bw / 2 * Math.sqrt(Math.max(0, 1 - Math.pow((u - .3) / .7, 2)));
  for (let i = 0; i <= NU; i++) { const u = i / NU, x = (u - .45) * Lh, w = wd(u), dep = D * (.55 + .45 * Math.sin(Math.PI * Math.min(1, u * 1.2))); for (let j = 0; j <= NV; j++) { const v = j / NV * 2 - 1; pos.push(x, fb - dep * (1 - Math.pow(Math.abs(v), 2.4)) - (1 - Math.abs(v)) * .0, w * v); } }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const a = i * (NV + 1) + j, b = a + NV + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const hg = new T.BufferGeometry(); hg.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); hg.setIndex(idx); hg.computeVertexNormals();
  boat.add(M(hg, new T.MeshPhysicalMaterial({ color: sail ? 0xf2f2f0 : 0x1f3a68, roughness: .3, clearcoat: 1, side: T.DoubleSide })));
  const ds = new T.Shape(); for (let i = 0; i <= 30; i++) { const u = i / 30; ds[i ? "lineTo" : "moveTo"]((u - .45) * Lh, wd(u)); } for (let i = 30; i >= 0; i--) { const u = i / 30; ds.lineTo((u - .45) * Lh, -wd(u)); }
  const deck = M(new T.ShapeGeometry(ds).rotateX(Math.PI / 2), new T.MeshStandardMaterial({ map: TEX.wood([Lh / 3, 1]), roughness: .7, side: T.DoubleSide })); deck.position.y = fb; boat.add(deck);
  const stripe = M(new T.BoxGeometry(Lh * .6, .12, Bw * 1.01), MAT.paint(0xc8102e)); stripe.position.set(-Lh * .05, fb - .25, 0); stripe.scale.z = .98; boat.add(stripe);
  let sailMesh = null, prop = null;
  if (sail) { const mh = Lh * 1.2; const mast = M(new T.CylinderGeometry(.08, .12, mh, 12), MAT.metal()); mast.position.set(Lh * .1, fb + mh / 2, 0); boat.add(mast);
    const sg = new T.PlaneGeometry(Lh * .5, mh * .92, 14, 24); const sp = sg.attributes.position; for (let i = 0; i < sp.count; i++) { const y = sp.getY(i) / (mh * .92) + .5, x = sp.getX(i) / (Lh * .5) + .5; sp.setX(i, -x * Lh * .5 * (1 - y * .92)); sp.setZ(i, Math.sin(Math.PI * x) * (1 - y) * Lh * .07); } sg.computeVertexNormals();
    sailMesh = M(sg, new T.MeshStandardMaterial({ color: 0xfafaf7, roughness: .85, side: T.DoubleSide })); sailMesh.position.set(Lh * .1, fb + mh * .52, 0); boat.add(sailMesh);
    const boomm = M(new T.CylinderGeometry(.06, .06, Lh * .5, 8), MAT.metal()); boomm.rotation.z = Math.PI / 2; boomm.position.set(Lh * .1 - Lh * .25, fb + .8, 0); boat.add(boomm); }
  else { const cab = M(new T.BoxGeometry(Lh * .28, 1.1, Bw * .7), MAT.white()); cab.position.set(Lh * .02, fb + .55, 0); boat.add(cab); const wsh = M(new T.BoxGeometry(.05, .7, Bw * .66), MAT.glass(), false); wsh.position.set(Lh * .17, fb + 1, 0); wsh.rotation.z = -.5; boat.add(wsh);
    const eng = M(new T.BoxGeometry(.5, .9, .4), MAT.dark()); eng.position.set(-Lh * .45 - .2, fb, 0); boat.add(eng); prop = new T.Group(); prop.position.set(-Lh * .45 - .25, fb - 1.1, 0); boat.add(prop); [0, 1, 2].forEach(k => { const bl = M(new T.BoxGeometry(.04, .42, .14), MAT.metal()); bl.rotation.x = k * 2.094; prop.add(bl); }); }
  if ((R.sc.kind || "").toLowerCase().includes("solar")) { const rf = new T.Group(); rf.position.y = fb + 2; boat.add(rf); const pT = solarTex(); pT.wrapS = pT.wrapT = T.RepeatWrapping; pT.repeat.set(4, 2);
    const roof = M(new T.BoxGeometry(Lh * .62, .06, Bw * 1.05), new T.MeshPhysicalMaterial({ map: pT, roughness: .15, metalness: .4, clearcoat: 1 })); roof.position.x = -Lh * .02; rf.add(roof); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => rf.add(rod(new T.Vector3(-Lh * .02 + a * Lh * .28, -2 + .05, b * Bw * .42), new T.Vector3(-Lh * .02 + a * Lh * .28, 0, b * Bw * .42), .05, MAT.metal()))); }
  const wake = particles(300, 0xffffff, .6, { opacity: .75 }); root.add(wake);
  const aB = arrow3(0x22d3ee, 1.3), aT = arrow3(0x22d3ee, 1.3), aD = arrow3(0xfb7185, 1.3); root.add(aB, aT, aD);
  const mk = { hull: marker(boat, 0, fb - D * .4, Bw / 2), sail: marker(boat, 0, fb + Lh * .55, 0), prop: prop || marker(boat, -Lh * .45, 0, 0), buoyancy: aB.userData.tip, drag: aD.userData.tip, wake: marker(root, -Lh * .9, 0, 0) };
  const labels = [{ obj: aB.userData.tip, text: () => "Buoyancy", col: "#22d3ee" }, { obj: aT.userData.tip, text: () => "Thrust", col: "#22d3ee" }, { obj: aD.userData.tip, text: () => "Water drag", col: "#fb7185" }];
  return {
    root, anchors: mk, labels, follow: null, ground: "water", cam: { pos: new T.Vector3(Lh * .9, Lh * .45 + 2, Lh * 1.25 + 4), target: new T.Vector3(0, Lh * .25, 0) },
    update(R, dt, t) {
      st.v = R.ok ? 7 : 1.5 * R.frac; st.x = (st.x || 0) + st.v * dt;
      const sink = R.ok ? 0 : Math.min(D * .9, (1 - R.frac) * D); boat.position.y = waveH(0, 0, t + st.x * .1) - sink * .8;
      boat.rotation.z = (waveH(2, 0, t) - waveH(-2, 0, t)) * .12; boat.rotation.x = (waveH(0, 1, t) - waveH(0, -1, t)) * .15;
      if (prop) prop.rotation.x += dt * (6 + 30 * Math.min(1, R.margin)); if (sailMesh) sailMesh.rotation.y = Math.sin(t * .6) * .05;
      const p = wake.userData; for (let i = 0; i < p.n; i++) { if (p.life[i] <= 0 && Math.random() < .3 * st.v / 7) { p.pos[i * 3] = -Lh * .5; p.pos[i * 3 + 1] = .2; p.pos[i * 3 + 2] = (Math.random() - .5) * Bw * .8; p.vel[i * 3] = -st.v; p.vel[i * 3 + 2] = Math.sign(p.pos[i * 3 + 2] || 1) * (1 + Math.random() * 2); p.life[i] = 2.5; }
        if (p.life[i] > 0) { p.life[i] -= dt; p.pos[i * 3] += p.vel[i * 3] * dt; p.pos[i * 3 + 2] += p.vel[i * 3 + 2] * dt; p.pos[i * 3 + 1] = waveH(p.pos[i * 3], p.pos[i * 3 + 2], t) + .1; } else p.pos[i * 3 + 1] = -50; }
      wake.geometry.attributes.position.needsUpdate = true;
      aB.userData.set(V.set(0, boat.position.y - D - 2.4, 0), UP, 2.2); aT.userData.set(V.set(Lh * .1, boat.position.y + fb + 1.2, Bw / 2 + .6), V2.set(1, 0, 0), 2.4 * Math.min(1.4, R.frac + .1)); aD.userData.set(V.set(Lh * .58 + 2.4, boat.position.y + .2, 0), V2.set(-1, 0, 0), 2.2);
      return st.v;
    },
    water: true
  };
};

B.balloon = (R, st) => {
  const Rb = 4 + R.tr("size", .5) * 7, ld = R.tr("load", .5); const root = new T.Group(), b = new T.Group(); root.add(b);
  const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40; let r = Rb * Math.sin(Math.PI * Math.pow(t, .72)); if (t < .12) r = Math.max(r, Rb * .2 * (1 - t * 2)); pts.push(new T.Vector2(Math.max(.01, r), t * Rb * 2.35)); }
  const env = M(new T.LatheGeometry(pts, 64), new T.MeshStandardMaterial({ map: TEX.stripes([1, 1]), roughness: .7, side: T.DoubleSide })); env.position.y = 3.6; b.add(env);
  const bw = 1.1 + ld * .6, bask = M(new T.BoxGeometry(bw, 1.05, bw), new T.MeshStandardMaterial({ map: TEX.wicker([2, 1.5]), roughness: .9 })); bask.position.y = .52; b.add(bask);
  const rim = M(new T.BoxGeometry(bw + .08, .1, bw + .08), new T.MeshStandardMaterial({ color: 0x3d2716, roughness: .6 })); rim.position.y = 1.07; b.add(rim);
  const lineM = new T.LineBasicMaterial({ color: 0x2a2a2a }), lp = [];
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([x, z]) => { lp.push(x * bw / 2, 1.1, z * bw / 2, x * Rb * .17, 3.75, z * Rb * .17); }); const lg = new T.BufferGeometry(); lg.setAttribute("position", new T.Float32BufferAttribute(lp, 3)); b.add(new T.LineSegments(lg, lineM));
  const burner = M(new T.CylinderGeometry(.22, .28, .35, 16), MAT.metal()); burner.position.y = 2.2; b.add(burner);
  const flame = new T.Group(); flame.position.y = 2.45; b.add(flame); const f1 = M(new T.ConeGeometry(.22, 1.4, 16, 1, true), MAT.glow(0xff8a1e, .85), false); f1.position.y = .7; const f2 = M(new T.ConeGeometry(.11, .9, 12, 1, true), MAT.glow(0xbfe0ff, .9), false); f2.position.y = .45; flame.add(f1, f2);
  const fl = new T.PointLight(0xffa04a, 40, 18, 2); fl.position.y = 3.2; b.add(fl);
  const tether = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]), new T.LineBasicMaterial({ color: 0xdddddd })); root.add(tether);
  const aB = arrow3(0x22d3ee, 1.5), aW = arrow3(0xfb7185, 1.5); root.add(aB, aW);
  const mk = { envelope: marker(env, Rb * .9, Rb * 1.3, 0), hotair: marker(env, 0, Rb * 1.1, 0), burner: marker(b, 0, 2.6, 0), basket: marker(b, 0, .5, 0), buoyancy: aB.userData.tip, weight: aW.userData.tip };
  const labels = [{ obj: aB.userData.tip, text: () => "Buoyancy", col: "#22d3ee" }, { obj: aW.userData.tip, text: () => "Weight", col: "#fb7185" }];
  return {
    root, anchors: mk, labels, follow: b, cam: { pos: new T.Vector3(Rb * 3.2 + 6, Rb * 1.4 + 3, Rb * 3.2 + 6), target: new T.Vector3(0, Rb * 1.4 + 2, 0) },
    update(R, dt, t) {
      const tgt = R.ok ? .5 : 0; st.alt = st.alt == null ? tgt : st.alt + (tgt - st.alt) * Math.min(1, dt * .5);
      b.position.y = st.alt * 40 + (R.ok ? Math.sin(t * .5) * .4 : Math.abs(Math.sin(t * 2.2)) * .08); b.position.x = R.ok ? Math.sin(t * .2) * 2 : 0;
      const fk = .8 + Math.random() * .4; flame.scale.set(fk, fk * (.8 + .6 * Math.min(1, R.margin)), fk); fl.intensity = 25 + 30 * Math.random();
      tether.visible = !R.ok; if (!R.ok) { const p = tether.geometry.attributes.position; p.setXYZ(0, b.position.x, b.position.y + .5, 0); p.setXYZ(1, 6, 0, 0); p.needsUpdate = true; }
      aB.userData.set(V.set(-Rb - 1.4, b.position.y + 3.6 + Rb, 0), UP, 3 * Math.min(1.8, R.margin)); aW.userData.set(V.set(bw + 1, b.position.y + .4, 0), V2.set(0, -1, 0), 3);
    }
  };
};

function buildHouse(R) { const g = new T.Group(); const wall = new T.MeshStandardMaterial({ color: 0xe9e2d3, roughness: .9 }), roof = new T.MeshStandardMaterial({ color: 0x5b2c22, roughness: .8 });
  const w = M(new T.BoxGeometry(6, 3.2, 5), wall, true, true); w.position.y = 1.6; g.add(w); const rs = new T.Shape(); rs.moveTo(-3.3, 0); rs.lineTo(0, 2.1); rs.lineTo(3.3, 0); rs.closePath(); const rg = new T.ExtrudeGeometry(rs, { depth: 5.6, bevelEnabled: false }); rg.translate(0, 0, -2.8); const r = M(rg, roof); r.rotation.y = Math.PI / 2; r.position.y = 3.2; g.add(r);
  const win = new T.MeshStandardMaterial({ color: 0x1b2433, emissive: 0xffc46b, emissiveIntensity: 0, roughness: .2 }); [[-1.6, 1.8], [1.6, 1.8]].forEach(([x, y]) => { const m = M(new T.BoxGeometry(1.1, .9, .06), win, false); m.position.set(x, y, 2.53); g.add(m); });
  const door = M(new T.BoxGeometry(.9, 1.9, .06), new T.MeshStandardMaterial({ color: 0x3a2a1e, roughness: .6 })); door.position.set(0, .95, 2.53); g.add(door);
  const pl = new T.PointLight(0xffc46b, 0, 10, 2); pl.position.set(0, 2, 3); g.add(pl); g.userData.set = f => { win.emissiveIntensity = 2.2 * f; pl.intensity = 30 * f; }; return g; }
function buildBulb() { const g = new T.Group(); const stand = M(new T.CylinderGeometry(.06, .06, 2.4, 10), MAT.dark()); stand.position.y = 1.2; g.add(stand); const base = M(new T.CylinderGeometry(.24, .28, .45, 20), MAT.metal()); base.position.y = 2.55; g.add(base);
  const glassM = new T.MeshPhysicalMaterial({ color: 0xffffff, roughness: .05, transmission: .9, thickness: .1, transparent: true, opacity: .55, emissive: 0xffd28a, emissiveIntensity: 0 }); const gl = M(new T.SphereGeometry(.55, 32, 24), glassM, false); gl.position.y = 3.2; g.add(gl);
  const fil = M(new T.TorusGeometry(.12, .015, 6, 20), MAT.glow(0xffb347, 0), false); fil.position.y = 3.15; g.add(fil); const pl = new T.PointLight(0xffd28a, 0, 14, 2); pl.position.y = 3.2; g.add(pl);
  g.userData.set = f => { glassM.emissiveIntensity = 1.6 * f; fil.material.opacity = f; pl.intensity = 50 * f; }; return g; }
function buildDevice(kind) { const g = new T.Group(); const table = M(new T.BoxGeometry(2.4, .08, 1.4), new T.MeshStandardMaterial({ map: TEX.wood([1, 1]), roughness: .6 })); table.position.y = 1; g.add(table); [[-1.1, -.6], [1.1, -.6], [-1.1, .6], [1.1, .6]].forEach(([x, z]) => { const l = M(new T.BoxGeometry(.07, 1, .07), MAT.dark()); l.position.set(x, .5, z); g.add(l); });
  const c = document.createElement("canvas"); c.width = 256; c.height = 160; const tx = new T.CanvasTexture(c); tx.colorSpace = T.SRGBColorSpace; const scrM = new T.MeshBasicMaterial({ map: tx });
  const phone = kind === "phone"; const baseW = phone ? .38 : 1.3, baseD = phone ? .75 : .9;
  const base = M(new T.BoxGeometry(baseW, .05, baseD), new T.MeshStandardMaterial({ color: 0x9aa0a8, metalness: .8, roughness: .35 })); base.position.y = 1.07; g.add(base);
  const scr = M(new T.PlaneGeometry(phone ? .34 : 1.2, phone ? .68 : .75), scrM, false);
  if (phone) { scr.rotation.x = -Math.PI / 2; scr.position.y = 1.1; } else { const lid = M(new T.BoxGeometry(1.3, .85, .04), new T.MeshStandardMaterial({ color: 0x9aa0a8, metalness: .8, roughness: .35 })); lid.position.set(0, 1.5, -.45); lid.rotation.x = -.25; g.add(lid); scr.position.set(0, 1.5, -.425); scr.rotation.x = -.25; }
  g.add(scr); let last = -1; g.userData.set = f => { const k = Math.round(f * 100); if (k === last) return; last = k; const x = c.getContext("2d"); x.fillStyle = "#0b1220"; x.fillRect(0, 0, 256, 160); x.strokeStyle = "#e5e7eb"; x.lineWidth = 6; x.strokeRect(60, 50, 120, 60); x.fillStyle = "#e5e7eb"; x.fillRect(180, 68, 10, 24); x.fillStyle = f >= 1 ? "#34d399" : "#fbbf24"; x.fillRect(66, 56, 108 * f, 48); x.fillStyle = "#fff"; x.font = "bold 22px sans-serif"; x.textAlign = "center"; x.fillText(k + "%", 128, 140); tx.needsUpdate = true; }; return g; }

B.energy = (R, st) => {
  const src = (R.sc.source || "generic").toLowerCase(), ldk = (R.sc.load || "generic").toLowerCase(); const root = new T.Group();
  const S = new T.Group(); S.position.set(-9, 0, 0); root.add(S); let srcAnim = () => {}; let bike = null;
  if (src.includes("sun")) { const pm = [new T.MeshStandardMaterial({ color: 0xaab0b8, metalness: .9, roughness: .3 }), new T.MeshStandardMaterial({ color: 0xaab0b8, metalness: .9, roughness: .3 }), new T.MeshPhysicalMaterial({ map: TEX.solar(), metalness: .3, roughness: .12, clearcoat: 1 }), MAT.dark(), MAT.dark(), MAT.dark()];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const p = M(new T.BoxGeometry(1.7, .05, 1.05), pm); p.position.set((i - 1) * 1.8, 1.1 + j * .55, j * -.9); p.rotation.x = -.5; S.add(p); S.add(rod(new T.Vector3((i - 1) * 1.8, 0, j * -.9 + .3), new T.Vector3((i - 1) * 1.8, 1.05 + j * .55, j * -.9), .04, MAT.metal())); } }
  else if (src.includes("wind")) { const tower = M(new T.CylinderGeometry(.25, .45, 14, 24), MAT.white()); tower.position.y = 7; S.add(tower); const nac = M(loft(ST([[1.0, .05, .05, .05, 14.2, 2], [.8, .42, .45, .4, 14.2, 2.4], [-1.2, .45, .5, .42, 14.2, 3], [-1.6, .3, .32, .3, 14.2, 2.5]]), { S: 30, R: 32 }), DS(MAT.white())); S.add(nac);
    const rot = new T.Group(); rot.position.set(1, 14.2, 0); S.add(rot); rot.add(M(new T.SphereGeometry(.35, 20, 16), MAT.white())); for (let k = 0; k < 3; k++) { const bg = airfoil({ span: 6.2, root: .75, tip: .18, th: .16, cam: .03, twist: -14, S: 18, C: 12 }); bg.rotateX(-Math.PI / 2); bg.rotateY(Math.PI / 2); const bl = M(bg, DS(MAT.white())); bl.rotation.x = k * 2.094; rot.add(bl); } srcAnim = (dt, f) => rot.rotation.x += dt * (.6 + 2.2 * f); }
  else if (src.includes("person")) { bike = buildBike(true); bike.scale.setScalar(1.5); S.add(bike); const stand = M(new T.BoxGeometry(.3, .5, .9), MAT.dark()); stand.position.set(-.82, .25, 0); S.add(stand); srcAnim = (dt, f) => { st.pa = (st.pa || 0) + dt * 5; pedal(bike, st.pa); bike.userData.wheels[0].rotation.z -= dt * 8; }; }
  else if (src.includes("coil")) { [0].forEach(() => { const cg = new T.Group(); cg.position.y = 1.6; for (let k = 0; k < 8; k++) { const tor = M(new T.TorusGeometry(1.1, .05, 10, 48), MAT.copper()); tor.rotation.y = Math.PI / 2; tor.position.x = k * .1; cg.add(tor); } S.add(cg); S.position.set(-3.5, 0, 0); }); }
  else if (src.includes("water")) { const wheel = new T.Group(); wheel.position.y = 2.2; S.add(wheel); wheel.add(M(new T.CylinderGeometry(2, 2, .2, 32).rotateX(Math.PI / 2), new T.MeshStandardMaterial({ map: TEX.wood([2, 1]) }))); for (let k = 0; k < 12; k++) { const pd = M(new T.BoxGeometry(.7, .1, 1), new T.MeshStandardMaterial({ map: TEX.wood([1, 1]) })); const a = k * Math.PI / 6; pd.position.set(Math.cos(a) * 2.1, Math.sin(a) * 2.1, 0); pd.rotation.z = a; wheel.add(pd); } srcAnim = (dt, f) => wheel.rotation.z -= dt * (.4 + 1.5 * f); }
  else { const bat = M(new T.BoxGeometry(2, 1.4, 1.2), MAT.paint(0x1b9e5a)); bat.position.y = .7; S.add(bat); [-.5, .5].forEach(x => { const tm = M(new T.CylinderGeometry(.12, .12, .2, 16), MAT.metal()); tm.position.set(x, 1.5, 0); S.add(tm); }); }
  const C = new T.Group(); root.add(C); const box = M(new T.BoxGeometry(1.4, 1.8, .9), new T.MeshStandardMaterial({ color: 0xd9dde2, metalness: .6, roughness: .35 })); box.position.y = .9; C.add(box); for (let k = 0; k < 7; k++) { const fin = M(new T.BoxGeometry(1.2, .04, .95), MAT.dark()); fin.position.y = .4 + k * .2; fin.position.z = .02; C.add(fin); }
  const led = M(new T.SphereGeometry(.06, 10, 8), MAT.glow(0x34d399), false); led.position.set(.5, 1.6, .46); C.add(led);
  const L = new T.Group(); L.position.set(9, 0, 0); root.add(L); let load;
  if (ldk.includes("house")) load = buildHouse(); else if (ldk.includes("bulb")) load = buildBulb(); else if (ldk.includes("tv")) load = buildTV(); else if (ldk.includes("laptop")) load = buildDevice("laptop"); else if (ldk.includes("phone")) load = buildDevice("phone"); else if (ldk.includes("car")) { load = buildCar(0x2b6cb0); load.userData.set = () => {}; } else load = buildDevice("laptop");
  L.add(load);
  const curve = new T.CatmullRomCurve3([new T.Vector3(-8, .12, .8), new T.Vector3(-4, .12, 1.4), new T.Vector3(-.4, .9, .5), new T.Vector3(.4, .9, .5), new T.Vector3(4, .12, 1.4), new T.Vector3(8, .12, .8)]);
  root.add(M(new T.TubeGeometry(curve, 120, .07, 10), MAT.rubber()));
  /* close the cable: a plug box at each end, then a short lead into the machine (no open wire ends) */
  [[-1, S], [1, L]].forEach(([sd, dev]) => {
    const box = new T.Group(); box.position.set(sd * 8.15, 0, .8); root.add(box);
    const body = M(new T.BoxGeometry(.5, .42, .38), new T.MeshStandardMaterial({ color: 0x2b3038, roughness: .5, metalness: .3 })); body.position.y = .21; box.add(body);
    const lid = M(new T.BoxGeometry(.52, .05, .4), MAT.metal()); lid.position.y = .44; box.add(lid);
    const gl = M(new T.SphereGeometry(.04, 10, 8), MAT.glow(0x34d399), false); gl.position.set(0, .3, .2); box.add(gl);
    [[0, .12, 0], [sd * -.22, .12, 0]].forEach(p => { const cap = M(new T.SphereGeometry(.08, 14, 10), MAT.rubber()); cap.position.set(sd * 8.15 + p[0], p[1], .8); root.add(cap); });
    const end = new T.Vector3(sd * 8.15, .12, .8), into = new T.Vector3(sd * 9, .2, 0);
    const lead = new T.CatmullRomCurve3([end.clone(), new T.Vector3(sd * 8.5, .1, .55), new T.Vector3(sd * 8.85, .12, .2), into]);
    root.add(M(new T.TubeGeometry(lead, 24, .06, 8), MAT.rubber()));
    const plug = M(new T.CylinderGeometry(.11, .11, .22, 14), MAT.dark()); plug.position.copy(into); plug.rotation.z = Math.PI / 2; root.add(plug);
  });
  const flow = particles(140, 0xffd23f, .32, { add: true, opacity: .95 }); root.add(flow); const heat = particles(90, 0xff5a3c, .4, { add: true, opacity: .8 }); root.add(heat);
  const mk = { source: marker(S, 0, 2, 0), converter: marker(C, 0, 1.9, 0), losses: marker(C, 0, 3.4, 0), load: marker(L, 0, 2.2, 0) };
  return {
    root, anchors: mk, labels: [{ obj: marker(C, 0, 2.6, 0), text: () => "Losses → heat", col: "#fb7185" }], follow: null, cam: { pos: new T.Vector3(2, 7, 21), target: new T.Vector3(0, 1.8, 0), fitW: 10.5 },
    update(R, dt, t) {
      let eff = R.tr("eff", null); if (eff == null) eff = Math.max(.15, Math.min(.95, R.frac));
      srcAnim(dt, Math.min(1, R.margin)); load.userData.set && load.userData.set(R.frac);
      const p = flow.userData; for (let i = 0; i < p.n; i++) { const ph = (t * .18 + i / p.n) % 1, lost = (i * 0.61803) % 1 > eff; const u = lost ? Math.min(ph, .5) : ph; curve.getPointAt(u, V); p.pos[i * 3] = V.x; p.pos[i * 3 + 1] = V.y + .12; p.pos[i * 3 + 2] = V.z; if (lost && ph > .5) p.pos[i * 3 + 1] = -50; }
      flow.geometry.attributes.position.needsUpdate = true;
      const h = heat.userData; for (let i = 0; i < h.n; i++) { if (h.life[i] <= 0 && Math.random() < .2 * (1 - eff)) { h.pos[i * 3] = (Math.random() - .5) * .8; h.pos[i * 3 + 1] = 1.9; h.pos[i * 3 + 2] = (Math.random() - .5) * .6; h.life[i] = 1.6; }
        if (h.life[i] > 0) { h.life[i] -= dt; h.pos[i * 3 + 1] += dt * 1.6; h.pos[i * 3] += Math.sin(t * 3 + i) * dt * .4; } else h.pos[i * 3 + 1] = -50; }
      heat.geometry.attributes.position.needsUpdate = true; led.material.color.set(R.ok ? 0x34d399 : 0xfbbf24);
    }
  };
};

B.structure = (R, st) => {
  const kind = (R.sc.kind || "tower").toLowerCase(), root = new T.Group(); const conc = MAT.concrete([2, 6]);
  const aL = arrow3(0xfb7185, 1.6), aR = arrow3(0x22d3ee, 1.6); root.add(aL, aR); const mk = {}; let upd;
  if (kind.includes("bridge")) {
    const span = 40; [-span / 2, span / 2].forEach(x => { const p = M(new T.BoxGeometry(3, 8, 6), conc, true, true); p.position.set(x, 4, 0); root.add(p); });
    const dg = new T.BoxGeometry(span, .6, 5, 60, 1, 1), base = dg.attributes.position.array.slice(); const deck = M(dg, MAT.concrete([8, 1])); deck.position.y = 8.3; root.add(deck);
    const truck = buildCar(0xf59e0b); truck.scale.setScalar(.9); root.add(truck);
    mk.load = marker(truck, 0, 2, 0); mk.top = marker(deck, 0, .5, 0); mk.stress = marker(deck, 0, -.4, 2.6); mk.base = marker(root, -span / 2, 2, 3);
    upd = (R, dt, t) => { const sag = R.ok ? .15 : .4 + (1 - R.frac) * 3.5 + Math.sin(t * 3) * .08; const p = dg.attributes.position; for (let i = 0; i < p.count; i++) { const x = base[i * 3]; p.setY(i, base[i * 3 + 1] - sag * Math.cos(Math.PI * x / span)); } p.needsUpdate = true; dg.computeVertexNormals();
      st.tx = ((st.tx ?? -span / 2) + dt * 4); if (st.tx > span / 2) st.tx = -span / 2; truck.position.set(st.tx, 8.6 - sag * Math.cos(Math.PI * st.tx / span), 0);
      aL.userData.set(V.set(0, 14, 0), V2.set(0, -1, 0), 4.5 - sag); aR.userData.set(V.set(-span / 2, -1, 3.5), UP, 4); };
    return { root, anchors: Object.assign(mk, { load: mk.load, base: aR.userData.tip }), labels: [{ obj: aL.userData.tip, text: () => "Load", col: "#fb7185" }, { obj: aR.userData.tip, text: () => "Support", col: "#22d3ee" }], follow: null, cam: { pos: new T.Vector3(18, 12, 42), target: new T.Vector3(0, 6, 0) }, update: upd };
  }
  const cable = kind.includes("cable"), Ht = cable ? 220 : 12 + R.tr("height", .5) * 40, taper = R.tr("taper", 0);
  const piv = new T.Group(); root.add(piv);
  let col;
  if (cable) { const topR = .15 + taper * 6; col = M(new T.CylinderGeometry(topR, .15, Ht, 24, 1, true), new T.MeshStandardMaterial({ color: 0x2b2f36, metalness: .7, roughness: .4 })); col.position.y = Ht / 2; piv.add(col);
    const pad = M(new T.CylinderGeometry(6, 7, 1.4, 48), conc, true, true); pad.position.y = .7; root.add(pad); const cl = M(new T.BoxGeometry(1.4, 2, 1.4), MAT.paint(0xf59e0b)); cl.position.y = 4; piv.add(cl); mk.load = marker(cl, 0, 1.5, 0); st.cl = cl; }
  else { col = M(new T.CylinderGeometry(1.1, 3.2, Ht, 4, 20), conc, true, true); col.rotation.y = Math.PI / 4; col.position.y = Ht / 2; piv.add(col);
    const crate = M(new T.BoxGeometry(3, 2, 3), new T.MeshStandardMaterial({ color: 0x55606e, metalness: .8, roughness: .45 })); crate.position.y = Ht + 1; piv.add(crate); mk.load = marker(crate, 0, 1.5, 0); }
  const cracks = new T.Group(); piv.add(cracks); for (let k = 0; k < 6; k++) { const c = M(new T.BoxGeometry(.05, 1.4, .05), MAT.glow(0xff4d6d, 1), false); c.position.set((Math.random() - .5) * 2.2, Ht * (.05 + k * .05), cable ? .4 : 2.4 - k * .1); c.rotation.z = (Math.random() - .5) * 1.2; cracks.add(c); }
  mk.top = marker(piv, 0, cable ? 60 : Ht, 0); mk.stress = marker(piv, cable ? 1 : 2.2, Ht * (cable ? .02 : .12), 1); mk.base = aR.userData.tip; mk.cable = marker(piv, 0, 40, 0);
  return { root, anchors: mk, labels: [{ obj: aL.userData.tip, text: () => cable ? "Cable's own weight" : "Load", col: "#fb7185" }, { obj: aR.userData.tip, text: () => "Ground pushes back", col: "#22d3ee" }], follow: null,
    cam: cable ? { pos: new T.Vector3(26, 6, 34), target: new T.Vector3(0, 30, 0) } : { pos: new T.Vector3(Ht * .7 + 8, Ht * .45, Ht + 10), target: new T.Vector3(0, Ht * .45, 0) },
    update(R, dt, t) { const sw = R.ok ? Math.sin(t * 1.1) * .004 : Math.sin(t * 2) * Math.min(.06, (1 - R.frac) * .07 + .01); piv.rotation.z = sw; cracks.visible = !R.ok; cracks.children.forEach(c => c.material.opacity = .5 + .5 * Math.sin(t * 6));
      if (cable && st.cl) { st.cy = ((st.cy || 4) + dt * 6); if (st.cy > (R.ok ? 120 : 25)) st.cy = 4; st.cl.position.y = st.cy; }
      const topY = cable ? Math.min(st.cy || 4, 60) + 6 : Ht + 6; aL.userData.set(V.set(0, topY + 4, 0), V2.set(0, -1, 0), 4); aR.userData.set(V.set(cable ? 8 : 5, -1, 3), UP, 4); }
  };
};

B.flow = (R, st) => {
  const root = new T.Group(); const Hc = 3 + R.tr("height", .5) * 30;
  const bld = new T.Group(); root.add(bld); const fac = new T.MeshStandardMaterial({ map: TEX.facade([3, 2]), roughness: .8 });
  const body = M(new T.BoxGeometry(16, 9, 11), [fac, fac, MAT.concrete([2, 2]), MAT.concrete(), fac, fac], true, true); body.position.y = 4.5; bld.add(body);
  const ch = M(new T.BoxGeometry(2.4, Hc, 2.4), MAT.concrete([1, Hc / 6]), true, true); ch.position.set(0, 9 + Hc / 2, 0); bld.add(ch);
  const cap = M(new T.BoxGeometry(3, .4, 3), MAT.dark()); cap.position.set(0, 9 + Hc + .2, 0); bld.add(cap);
  [-1, 1].forEach(sd => { const v = M(new T.BoxGeometry(.2, 1, 3), MAT.dark()); v.position.set(sd * 8.05, .8, 0); bld.add(v); });
  const out = particles(160, 0xf3ead8, 1.4, { opacity: .35 }), inn = particles(140, 0x9fd8ff, .5, { opacity: .6, add: true }); root.add(out, inn);
  const aI = arrow3(0x7dd3fc, 1.3), aO = arrow3(0xfb923c, 1.3); root.add(aI, aO);
  const mk = { inlet: aI.userData.tip, outlet: aO.userData.tip, chimney: marker(ch, 1.3, 0, 0), inside: marker(bld, 0, 4.5, 5.6), pressure: marker(bld, 8, 4.5, 5.6) };
  return { root, anchors: mk, labels: [{ obj: aI.userData.tip, text: () => "Cool air pulled in", col: "#7dd3fc" }, { obj: aO.userData.tip, text: () => "Warm air out", col: "#fb923c" }], follow: null,
    cam: { pos: new T.Vector3(26, 12 + Hc * .3, 30), target: new T.Vector3(0, 6 + Hc * .3, 0) },
    update(R, dt, t) { const rate = R.tr("rate", R.frac), sp = 1 + rate * 6, top = 9 + Hc + .5;
      const p = out.userData; for (let i = 0; i < p.n; i++) { if (p.life[i] <= 0 && Math.random() < .15 * (.2 + rate)) { p.pos[i * 3] = (Math.random() - .5) * 1.2; p.pos[i * 3 + 1] = top; p.pos[i * 3 + 2] = (Math.random() - .5) * 1.2; p.life[i] = 3; }
        if (p.life[i] > 0) { p.life[i] -= dt; p.pos[i * 3 + 1] += sp * dt; p.pos[i * 3] += (1.2 + Math.sin(t + i)) * dt * .6; p.pos[i * 3 + 2] += Math.cos(t * .7 + i) * dt * .3; } else p.pos[i * 3 + 1] = -50; }
      out.geometry.attributes.position.needsUpdate = true; out.material.opacity = .15 + .3 * rate;
      const q = inn.userData; for (let i = 0; i < q.n; i++) { const ph = (t * (.1 + rate * .35) + i / q.n) % 1, sd = i % 2 ? 1 : -1; q.pos[i * 3] = sd * (20 - ph * 12); q.pos[i * 3 + 1] = .8 + Math.sin(i) * .3; q.pos[i * 3 + 2] = (((i * .37) % 1) - .5) * 2.6; }
      inn.geometry.attributes.position.needsUpdate = true; inn.material.opacity = .25 + .6 * rate;
      aI.userData.set(V.set(-13, .9, 2.5), V2.set(1, 0, 0), 3.5); aO.userData.set(V.set(0, top + .6, 0), UP, 3 + rate * 2); }
  };
};

B.launch = (R, st) => {
  const root = new T.Group(), rk = new T.Group(); root.add(rk); const white = MAT.white(), black = MAT.paint(0x111111);
  const prof = [[0, 0], [.9, 0], [.9, 9], [.82, 10.3], [.55, 11.4], [.2, 12.2], [0, 12.5]].map(([r, y]) => new T.Vector2(r, y));
  const body = M(new T.LatheGeometry(prof, 48), white); body.position.y = 1.2; rk.add(body);
  const band = M(new T.CylinderGeometry(.915, .915, .7, 48, 1, true), black); band.position.y = 8.2; rk.add(band);
  for (let k = 0; k < 4; k++) { const fs = new T.Shape(); fs.moveTo(0, 0); fs.lineTo(1.3, -.4); fs.lineTo(1.3, .3); fs.lineTo(0, 2.4); fs.closePath(); const fg = new T.ExtrudeGeometry(fs, { depth: .08, bevelEnabled: false }); fg.translate(.8, 1.4, -.04); const f = M(fg, black); f.rotation.y = k * Math.PI / 2; rk.add(f); }
  const bellM = new T.MeshStandardMaterial({ color: 0x3a3c40, metalness: 1, roughness: .3, side: T.DoubleSide }); const ow = M(new T.CylinderGeometry(.88, .88, .25, 32), MAT.dark()); ow.position.y = 1.15; rk.add(ow);
  [[0, 0], ...[...Array(8)].map((_, k) => [Math.cos(k * Math.PI / 4) * .55, Math.sin(k * Math.PI / 4) * .55])].forEach(([x, z]) => { const b = lathe([[.07, 0], [.12, -.15], [.2, -.45]], 20, bellM); b.position.set(x, 1.05, z); rk.add(b); });
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4, leg = new T.Group(); leg.rotation.y = -a; rk.add(leg); const lm = MAT.dark();
    leg.add(rod(new T.Vector3(.9, 4.2, 0), new T.Vector3(.98, 1.4, 0), .07, lm)); leg.add(rod(new T.Vector3(.98, 1.4, 0), new T.Vector3(1.0, .9, 0), .05, lm));
    const gf = M(new T.BoxGeometry(.05, .45, .55), new T.MeshStandardMaterial({ color: 0x55595f, metalness: .9, roughness: .4, wireframe: false })); gf.position.set(1.05, 11.1, 0); leg.add(gf);
    for (let q = -2; q <= 2; q++) { const bar = M(new T.BoxGeometry(.06, .45, .015), MAT.dark(), false); bar.position.set(1.05, 11.1, q * .1); leg.add(bar); } }
  const flame = new T.Group(); flame.position.y = .1; rk.add(flame); const fa = M(new T.ConeGeometry(.6, 5, 24, 1, true), MAT.glow(0xff8a1e, .8), false); fa.rotation.x = Math.PI; fa.position.y = -2.5; const fb = M(new T.ConeGeometry(.32, 3, 16, 1, true), MAT.glow(0xdbeafe, .95), false); fb.rotation.x = Math.PI; fb.position.y = -1.5; flame.add(fa, fb);
  const fl = new T.PointLight(0xffa04a, 200, 60, 2); fl.position.y = -2; rk.add(fl);
  const tower = new T.Group(); tower.position.set(-4, 0, 0); root.add(tower); const tm = MAT.paint(0xc0392b); for (let y = 0; y < 16; y += 2) { [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => tower.add(rod(new T.Vector3(a * .7, y, b * .7), new T.Vector3(a * .7, y + 2, b * .7), .06, tm))); tower.add(rod(new T.Vector3(-.7, y, -.7), new T.Vector3(.7, y + 2, -.7), .03, tm)); }
  const smoke = particles(260, 0xd8d8d8, 3.2, { opacity: .45 }); root.add(smoke);
  const goalY = 160, ring = M(new T.TorusGeometry(10, .25, 12, 80).rotateX(Math.PI / 2), MAT.glow(0x34d399, .8), false); ring.position.y = goalY; root.add(ring);
  const aT = arrow3(0x22d3ee, 1.6), aG = arrow3(0xfb7185, 1.6); root.add(aT, aG);
  const mk = { body: marker(rk, 0, 10, 0), tank: marker(rk, .9, 6, 0), engine: marker(rk, 0, .5, 0), thrust: aT.userData.tip, gravity: aG.userData.tip, goal: marker(ring, 10, 0, 0), drag: marker(rk, 0, 14, 0) };
  return { root, anchors: mk, labels: [{ obj: aT.userData.tip, text: () => "Thrust", col: "#22d3ee" }, { obj: aG.userData.tip, text: () => "Gravity", col: "#fb7185" }, { obj: mk.goal, text: () => "GOAL", col: "#34d399" }], follow: rk, ground: "pad",
    cam: { pos: new T.Vector3(22, 9, 30), target: new T.Vector3(0, 7, 0) },
    update(R, dt, t) { st.ph = (st.ph || 0) + dt * .12; if (st.ph > 1.45) st.ph = 0; const peak = R.ok ? 1.05 : R.frac * .88, burn = st.ph < 1;
      const p = burn ? Math.sin(st.ph * Math.PI / 2) * peak : (R.ok ? peak : Math.max(0, peak * (1 - (st.ph - 1) * 2.2))); rk.position.y = p * goalY; flame.visible = burn && st.ph > .02; fl.intensity = burn ? 150 + Math.random() * 100 : 0;
      flame.scale.set(1, .8 + Math.random() * .4 * Math.min(1.5, R.margin), 1); rk.rotation.z = burn ? 0 : (R.ok ? 0 : Math.min(.5, (st.ph - 1) * 1.5));
      const s = smoke.userData; for (let i = 0; i < s.n; i++) { if (s.life[i] <= 0 && burn && Math.random() < .35) { s.pos[i * 3] = (Math.random() - .5); s.pos[i * 3 + 1] = rk.position.y - 2; s.pos[i * 3 + 2] = (Math.random() - .5); const a = Math.random() * 6.28; const near = rk.position.y < 6; s.vel[i * 3] = Math.cos(a) * (near ? 7 : 1); s.vel[i * 3 + 1] = near ? .5 : -2; s.vel[i * 3 + 2] = Math.sin(a) * (near ? 7 : 1); s.life[i] = 4; }
        if (s.life[i] > 0) { s.life[i] -= dt; for (let k = 0; k < 3; k++) s.pos[i * 3 + k] += s.vel[i * 3 + k] * dt; s.vel[i * 3] *= 1 - dt * .5; s.vel[i * 3 + 2] *= 1 - dt * .5; if (s.pos[i * 3 + 1] < .5) s.pos[i * 3 + 1] = .5; } else s.pos[i * 3 + 1] = -500; }
      smoke.geometry.attributes.position.needsUpdate = true;
      aT.userData.set(V.set(2.2, rk.position.y + 1, 0), UP, burn ? 4 * Math.min(1.6, R.margin) : .05); aG.userData.set(V.set(-2.2, rk.position.y + 8, 0), V2.set(0, -1, 0), 4); }
  };
};

/* ---------- your own 3D model (glb / stl / obj) ---------- */
let userModel = null, userId = 0, userName = "";
function readBuf(file, text) { return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; text ? fr.readAsText(file) : fr.readAsArrayBuffer(file); }); }
function normalize(obj) {
  obj.updateMatrixWorld(true); let box = new T.Box3().setFromObject(obj), size = box.getSize(new T.Vector3()), mx = Math.max(size.x, size.y, size.z) || 1;
  let k = 1; if (mx > 120) k = .001; if (mx * k > 60 || mx * k < .15) k = 4 / mx; obj.scale.multiplyScalar(k); obj.updateMatrixWorld(true);
  box = new T.Box3().setFromObject(obj); const c = box.getCenter(new T.Vector3()); obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= box.min.y;
  obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { if (m && !m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial) o.material = new T.MeshPhysicalMaterial({ color: m.color || 0xbfc4cc, metalness: .5, roughness: .3, clearcoat: .6 }); }); } });
  const wrap = new T.Group(); wrap.add(obj); wrap.userData.keep = true; return wrap; }
async function loadModel(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase(); let obj;
  if (ext === "glb" || ext === "gltf") { const { GLTFLoader } = await import("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js/+esm"); const buf = ext === "glb" ? await readBuf(file) : await readBuf(file, true);
    const cib = window.createImageBitmap; try { window.createImageBitmap = undefined; } catch (e) {}
    obj = await new Promise((res, rej) => { try { new GLTFLoader().parse(buf, "", g => res(g.scene), rej); } catch (e) { rej(e); } finally { try { window.createImageBitmap = cib; } catch (e) {} } }); }
  else if (ext === "stl") { const { STLLoader } = await import("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/STLLoader.js/+esm"); const geo = new STLLoader().parse(await readBuf(file)); geo.computeVertexNormals();
    obj = new T.Mesh(geo, new T.MeshPhysicalMaterial({ color: geo.hasColors ? 0xffffff : 0xb9bec6, vertexColors: !!geo.hasColors, metalness: .55, roughness: .28, clearcoat: .8 })); }
  else if (ext === "obj") { const { OBJLoader } = await import("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/OBJLoader.js/+esm"); obj = new OBJLoader().parse(await readBuf(file, true)); }
  else throw new Error("Use a .glb, .gltf, .stl or .obj file");
  userModel = normalize(obj); userId++; userName = file.name; return userName; }
async function loadModelZip(buf, name) {
  const { unzipSync } = await import("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/fflate.module.js/+esm"); const { GLTFLoader } = await import("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js/+esm");
  const files = unzipSync(new Uint8Array(buf)); let main = Object.keys(files).find(p => /\.gltf$/i.test(p)) || Object.keys(files).find(p => /\.glb$/i.test(p));
  if (!main) throw new Error("No glTF in archive");
  if (/\.glb$/i.test(main)) { return loadModel(new File([files[main]], name || "model.glb")); }
  const base = main.includes("/") ? main.slice(0, main.lastIndexOf("/") + 1) : "", json = JSON.parse(new TextDecoder().decode(files[main]));
  const toURL = uri => { if (!uri || /^data:/.test(uri)) return uri; const key = base + decodeURIComponent(uri); const d = files[key] || files[decodeURIComponent(uri)]; return d ? URL.createObjectURL(new Blob([d])) : uri; };
  (json.buffers || []).forEach(b => b.uri = toURL(b.uri)); (json.images || []).forEach(im => { if (im.uri) im.uri = toURL(im.uri); });
  const obj = await new Promise((res, rej) => { try { new GLTFLoader().parse(JSON.stringify(json), "", g => res(g.scene), rej); } catch (e) { rej(e); } });
  userModel = normalize(obj); userId++; userName = name || "model"; return userName; }
function clearModel() { userModel = null; userId++; userName = ""; }
B.userModel = (R, st) => {
  const root = new T.Group(), holder = new T.Group(); root.add(holder); holder.add(userModel);
  const box = new T.Box3().setFromObject(userModel), size = box.getSize(new T.Vector3()), h = Math.max(.3, size.y), L = Math.max(size.x, size.z, .5), type = R.sc.type;
  const flies = ["rotorcraft", "aircraft", "balloon", "launch"].includes(type), moves = type === "vehicle" || type === "boat", sc = Math.max(.6, L / 4);
  const aU = arrow3(0x22d3ee, sc), aD = arrow3(0xfb7185, sc); root.add(aU, aD);
  const body = marker(holder, 0, h * .5, 0), top = marker(holder, 0, h, 0), base = marker(holder, 0, 0, 0), mk = { body, top, base, load: top };
  ["battery", "motor", "fans", "levels", "downwash", "wing", "airfoil", "lift", "engine", "tank", "hull", "sail", "prop", "envelope", "hotair", "burner", "basket", "source", "converter", "losses", "inlet", "outlet", "chimney", "inside", "pressure", "speed", "wheels", "goal", "stress", "cable", "wake"].forEach(n => mk[n] = body);
  Object.assign(mk, { thrust: aU.userData.tip, buoyancy: aU.userData.tip, weight: aD.userData.tip, gravity: aD.userData.tip, drag: aD.userData.tip });
  let lr = R;
  return { root, anchors: mk, follow: flies ? holder : null, ground: type === "vehicle" ? "road" : type === "launch" ? "pad" : "grass", water: type === "boat", moving: moves && type !== "boat",
    labels: [{ obj: aU.userData.tip, text: () => "Have " + lr.H.haveL, col: "#22d3ee" }, { obj: aD.userData.tip, text: () => "Need " + lr.H.needL, col: "#fb7185" }],
    cam: { pos: new T.Vector3(L * 1.25 + 2, h * .75 + 1.2, L * 1.55 + 3), target: new T.Vector3(0, h * .45, 0) },
    update(R, dt, t) { lr = R;
      if (flies) { const tgt = R.ok ? .5 : 0; st.alt = st.alt == null ? tgt : st.alt + (tgt - st.alt) * Math.min(1, dt); holder.position.y = st.alt * Math.max(8, h * 4) + (R.ok ? Math.sin(t * 1.5) * .1 * sc : 0); holder.rotation.z = !R.ok && R.margin > .3 ? Math.sin(t * 30) * .006 : 0; }
      if (type === "boat") { holder.position.y = waveH(0, 0, t) - (R.ok ? .1 : (1 - R.frac) * h * .4); holder.rotation.z = (waveH(2, 0, t) - waveH(-2, 0, t)) * .08; }
      const y0 = holder.position.y; aU.userData.set(V.set(-L * .6 - .3, y0 + h * .5, 0), UP, 1.8 * sc * Math.min(2, R.margin)); aD.userData.set(V.set(L * .6 + .3, y0 + h * .5, 0), V2.set(0, -1, 0), 1.8 * sc);
      return moves ? (R.ok ? 12 : 3 * R.frac) : 0; } };
};

/* ---------- AI-designed object built from parts (scene.type "custom") ---------- */
function partMat(m, c) { const col = new T.Color(); try { col.set(c || "#9aa3ad"); } catch (e) { col.set(0x9aa3ad); }
  switch (m) { case "metal": return new T.MeshStandardMaterial({ color: col, metalness: 1, roughness: .28 });
    case "glass": return new T.MeshPhysicalMaterial({ color: col, metalness: .1, roughness: .04, transparent: true, opacity: .45, clearcoat: 1, envMapIntensity: 2 });
    case "rubber": return new T.MeshStandardMaterial({ color: col, roughness: .92 });
    case "wood": return new T.MeshStandardMaterial({ map: TEX.wood([1, 1]), color: col, roughness: .7 });
    case "concrete": return new T.MeshStandardMaterial({ map: TEX.concrete([1, 1]), color: col, roughness: .95 });
    case "fabric": return new T.MeshStandardMaterial({ color: col, roughness: .95, side: T.DoubleSide });
    case "emissive": return new T.MeshStandardMaterial({ color: 0x111111, emissive: col, emissiveIntensity: 2.2 });
    case "plastic": return new T.MeshPhysicalMaterial({ color: col, roughness: .42, clearcoat: .3 });
    default: return new T.MeshPhysicalMaterial({ color: col, metalness: .4, roughness: .3, clearcoat: 1, clearcoatRoughness: .06 }); } }
function partGeo(p) { const s = (p.size || [1, 1, 1]).map(v => Math.max(.005, Math.min(300, +v || 1))), a = s[0], b = s[1] ?? a, c = s[2] ?? a;
  switch (p.shape) {
    case "cylinder": return new T.CylinderGeometry(a, c, b, 40);
    case "cone": return new T.ConeGeometry(a, b, 40);
    case "sphere": return new T.SphereGeometry(a, 40, 24);
    case "capsule": return new T.CapsuleGeometry(a, b, 10, 28);
    case "torus": return new T.TorusGeometry(a, b, 18, 64);
    case "disc": return new T.CylinderGeometry(a, a, b, 48);
    case "wedge": { const sh = new T.Shape(); sh.moveTo(-a / 2, 0); sh.lineTo(a / 2, 0); sh.lineTo(-a / 2, b); sh.closePath(); const g = new T.ExtrudeGeometry(sh, { depth: c, bevelEnabled: false }); g.translate(0, 0, -c / 2); return g; }
    case "hull": { const Lh = a, W = b / 2, Hh = c / 2, st = []; for (let i = 0; i <= 12; i++) { const u = i / 12, k = u < .2 ? Math.pow(u / .2, .55) : u > .75 ? Math.sqrt(Math.max(.003, 1 - Math.pow((u - .75) / .25, 2))) : 1; st.push([(.5 - u) * Lh, Math.max(.002, W * k), Math.max(.002, Hh * k), Math.max(.002, Hh * k), 0, 2.2]); } return loft(ST(st), { S: 60, R: 40 }); }
    case "wing": return airfoilWing(a, b);
    case "blade": { const g = airfoil({ span: a, root: b, tip: c, th: .12, cam: .03, twist: -8, S: 12, C: 10 }); g.rotateY(Math.PI / 2); return g; }
    default: { const g = new T.BoxGeometry(a, b, c, 2, 2, 2); const p2 = g.attributes.position, r = Math.min(a, b, c) * .08;
      for (let i = 0; i < p2.count; i++) { const x = p2.getX(i), y = p2.getY(i), z = p2.getZ(i), sx = Math.sign(x) * Math.max(0, Math.abs(x) - (a / 2 - r)), sy = Math.sign(y) * Math.max(0, Math.abs(y) - (b / 2 - r)), sz = Math.sign(z) * Math.max(0, Math.abs(z) - (c / 2 - r)); const l = Math.hypot(sx, sy, sz); if (l > 0) { const k = r / l; p2.setXYZ(i, x - sx + sx * k, y - sy + sy * k, z - sz + sz * k); } }
      g.computeVertexNormals(); return g; } } }

B.submarine = (R, st) => {
  const kind = (R.sc.kind || "").toLowerCase(), mini = !/military|attack|navy|ballistic|large/.test(kind), L = (mini ? 4.5 : 14) + R.tr("size", .5) * (mini ? 6 : 40), Rr = L * (mini ? .14 : .065);
  const root = new T.Group(), sub = new T.Group(); root.add(sub);
  const hullC = mini ? 0xf2b705 : 0x2b3036, paint = new T.MeshPhysicalMaterial({ color: hullC, roughness: mini ? .32 : .55, metalness: .25, clearcoat: mini ? 1 : .2, clearcoatRoughness: .08 });
  const stn = []; for (let i = 0; i <= 14; i++) { const u = i / 14, x = (u - .5) * L, r = u > .8 ? Rr * Math.sqrt(Math.max(.002, 1 - Math.pow((u - .8) / .2, 2))) * 1 : u < .18 ? Rr * (.05 + .95 * Math.pow(u / .18, .55)) : Rr; stn.push([x, r, r, r, 0, 2]); }
  stn.reverse(); const hull = M(loft(ST(stn), { S: 90, R: 56 }), paint); sub.add(hull);
  const ring = new T.MeshStandardMaterial({ color: 0x1b1f24, roughness: .6, metalness: .5 });
  if (mini) { const dome = M(new T.SphereGeometry(Rr * .98, 48, 32, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshPhysicalMaterial({ color: 0xdff3ff, roughness: .02, transmission: .0, transparent: true, opacity: .35, clearcoat: 1, envMapIntensity: 2.5, side: T.DoubleSide }), false);
      dome.rotation.z = -Math.PI / 2; dome.position.x = L * .32; dome.scale.set(1, 1, 1); sub.add(dome);
      const seal = M(new T.TorusGeometry(Rr * .99, Rr * .05, 12, 64), ring); seal.rotation.y = Math.PI / 2; seal.position.x = L * .32; sub.add(seal);
      const camB = M(new T.BoxGeometry(Rr * .5, Rr * .4, Rr * .5), MAT.dark()); camB.position.set(L * .24, -Rr * .1, 0); sub.add(camB);
      const lensC = M(new T.CylinderGeometry(Rr * .14, Rr * .17, Rr * .25, 24), MAT.metal()); lensC.rotation.z = Math.PI / 2; lensC.position.set(L * .24 + Rr * .35, -Rr * .1, 0); sub.add(lensC);
      const glassC = M(new T.CircleGeometry(Rr * .12, 24), MAT.glass()); glassC.rotation.y = Math.PI / 2; glassC.position.set(L * .24 + Rr * .48, -Rr * .1, 0); sub.add(glassC);
      [-1, 1].forEach(sd => { const lt = M(new T.SphereGeometry(Rr * .08, 12, 8), MAT.glow(0xfff4c2, 1), false); lt.position.set(L * .3, Rr * .3, sd * Rr * .35); sub.add(lt); }); }
  else { const bowS = M(new T.SphereGeometry(Rr * .25, 20, 14), MAT.dark()); bowS.position.x = L * .49; sub.add(bowS); }
  for (let k = 0; k < (mini ? 5 : 9); k++) { const rg = M(new T.TorusGeometry(Rr * 1.003, Rr * .012, 6, 64), ring); rg.rotation.y = Math.PI / 2; rg.position.x = -L * .25 + k * L * .5 / (mini ? 5 : 9); sub.add(rg); }
  const sailH = mini ? Rr * .55 : Rr * 1.5, sailL = mini ? L * .16 : L * .13, sst = [[sailL * .5, .02, sailH, 0, 0, 2.5], [sailL * .35, Rr * .26, sailH, 0, 0, 2.5], [-sailL * .2, Rr * .22, sailH, 0, 0, 2.5], [-sailL * .5, .02, sailH * .9, 0, 0, 2.5]];
  const sailG = new T.Group(); const sm = M(loft(ST(sst.map(r => [r[0], r[1], r[2], .01, 0, 3])), { S: 30, R: 32 }), paint); sailG.add(sm); sailG.position.set(mini ? -L * .05 : L * .18, Rr * .85, 0); sub.add(sailG);
  if (!mini) { const pl = M(airfoilWing(Rr * 1.2, sailL * .4), paint); pl.position.set(sailL * .05, sailH * .55, 0); sailG.add(pl); [0, 1].forEach(k => { const mast = M(new T.CylinderGeometry(.06, .06, sailH * .5, 8), MAT.dark()); mast.position.set(-k * sailL * .2, sailH * 1.2, 0); sailG.add(mast); }); }
  else { const hatch = M(new T.CylinderGeometry(Rr * .2, Rr * .2, .06, 32), MAT.metal()); hatch.position.y = sailH * .98; sailG.add(hatch); }
  const finM = paint, finsG = new T.Group(); finsG.position.x = -L * .4; sub.add(finsG);
  [0, 1, 2, 3].forEach(k => { const f = M(airfoilWing(Rr * (mini ? .9 : 1.1), L * .09), finM); f.rotation.x = k * Math.PI / 2 + Math.PI / 4 * (mini ? 0 : 0); f.position.y = 0; finsG.add(f); });
  const shroud = M(new T.CylinderGeometry(Rr * .5, Rr * .44, L * .06, 48, 1, true), new T.MeshPhysicalMaterial({ color: mini ? 0x2b2f35 : 0x24282d, roughness: .5, metalness: .6, side: T.DoubleSide })); shroud.rotation.z = Math.PI / 2; shroud.position.x = -L * .505; sub.add(shroud);
  const prop = new T.Group(); prop.position.x = -L * .5; sub.add(prop); const brass = new T.MeshStandardMaterial({ color: 0xc8a24a, metalness: 1, roughness: .25 });
  for (let k = 0; k < 7; k++) { const bl = M(airfoilWing(Rr * .42, Rr * .2), brass); bl.rotation.x = k * Math.PI * 2 / 7; bl.rotation.y = .5; prop.add(bl); } const hub = M(new T.ConeGeometry(Rr * .1, Rr * .3, 24), brass); hub.rotation.z = Math.PI / 2; hub.position.x = -Rr * .1; prop.add(hub);
  const lights = []; const lampM = new T.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff4d6, emissiveIntensity: 3 });
  [-1, 1].forEach(sd => { const lamp = M(new T.CylinderGeometry(Rr * .09, Rr * .11, Rr * .12, 20), lampM); lamp.rotation.z = Math.PI / 2; lamp.position.set(L * .38, -Rr * .5, sd * Rr * .72); sub.add(lamp);
    const sl = new T.SpotLight(0xfff1d0, 30, L * 6, .45, .6, 1.4); sl.position.copy(lamp.position); sl.target.position.set(L * 2, -Rr * 3, sd * Rr * 2); sub.add(sl, sl.target); lights.push(sl);
    const th = M(new T.CylinderGeometry(Rr * .16, Rr * .16, Rr * .4, 24, 1, true), new T.MeshStandardMaterial({ color: 0x2a2e33, metalness: .6, roughness: .4, side: T.DoubleSide })); th.position.set(-L * .1, Rr * .1, sd * Rr * 1.15); sub.add(th);
    const th2 = new T.Group(); th2.position.copy(th.position); sub.add(th2); [0, 1, 2].forEach(k => { const b = M(new T.BoxGeometry(Rr * .02, Rr * .28, Rr * .06), MAT.metal()); b.rotation.y = k * 2.09; th2.add(b); }); lights.push(th2);
    if (mini) { const sk = M(new T.CapsuleGeometry(Rr * .05, L * .55, 6, 12), MAT.dark()); sk.rotation.z = Math.PI / 2; sk.position.set(0, -Rr * 1.15, sd * Rr * .6); sub.add(sk);
      [-1, 1].forEach(e => { const st2 = M(new T.CylinderGeometry(Rr * .03, Rr * .03, Rr * .35, 8), MAT.dark()); st2.position.set(e * L * .18, -Rr * .95, sd * Rr * .55); sub.add(st2); });
      const tank = M(new T.CapsuleGeometry(Rr * .16, L * .3, 8, 20), new T.MeshStandardMaterial({ color: 0xe8e8e8, metalness: .3, roughness: .35 })); tank.rotation.z = Math.PI / 2; tank.position.set(-L * .05, -Rr * .7, sd * Rr * .9); sub.add(tank); } });
  let arm = null; if (mini) { arm = new T.Group(); arm.position.set(L * .4, -Rr * .75, Rr * .35); sub.add(arm); const a1 = M(new T.CylinderGeometry(Rr * .05, Rr * .05, Rr * .7, 12), MAT.metal()); a1.rotation.z = -1.1; a1.position.set(Rr * .3, -Rr * .15, 0); arm.add(a1); const cl = M(new T.TorusGeometry(Rr * .08, Rr * .02, 8, 16, Math.PI), MAT.dark()); cl.position.set(Rr * .62, -Rr * .32, 0); arm.add(cl); }
  const bub = particles(160, 0xe6f7ff, .09, { opacity: .8 }); root.add(bub);
  const aU = arrow3(0x22d3ee, 1.2), aD = arrow3(0xfb7185, 1.2), aT = arrow3(0x22d3ee, 1.2); root.add(aU, aD, aT);
  const mk = { hull: marker(sub, 0, Rr, 0), pressure: marker(sub, L * .1, Rr * .9, Rr * .5), sail: marker(sailG, 0, sailH, 0), prop, inside: marker(sub, L * .2, 0, 0), tank: marker(sub, -L * .05, -Rr * .7, Rr), battery: marker(sub, -L * .05, -Rr * .7, Rr), motor: marker(sub, -L * .42, 0, 0), wake: marker(root, -L, 0, 0), body: marker(sub, 0, 0, 0), top: marker(sub, 0, Rr * 1.2, 0),
    buoyancy: aU.userData.tip, weight: aD.userData.tip, gravity: aD.userData.tip, thrust: aT.userData.tip, drag: aT.userData.tip };
  const labels = [{ obj: aU.userData.tip, text: () => "Buoyancy", col: "#22d3ee" }, { obj: aD.userData.tip, text: () => "Weight", col: "#fb7185" }];
  return { root, anchors: mk, labels, follow: sub, ground: "grass", cam: { pos: new T.Vector3(L * .9, Rr * 2 + 2.5, L * 1.1 + 3), target: new T.Vector3(0, 3, 0) },
    update(R, dt, t) { sub.position.y = 3 + Math.sin(t * .6) * .2 - (R.ok ? 0 : (1 - R.frac) * 2); sub.rotation.z = Math.sin(t * .4) * .02 - (R.ok ? 0 : (1 - R.frac) * .15); sub.rotation.x = Math.sin(t * .3) * .015;
      const w = R.ok ? 18 : 4 * R.frac; prop.rotation.x += w * dt; lights.forEach(l => { if (l.isGroup) l.rotation.x += w * .6 * dt; }); if (arm) arm.rotation.z = Math.sin(t * .5) * .15;
      const q = bub.userData; for (let i = 0; i < q.n; i++) { if (q.life[i] <= 0 && Math.random() < .2) { q.pos[i * 3] = -L * .52 + sub.position.x; q.pos[i * 3 + 1] = sub.position.y + (Math.random() - .5) * Rr * .6; q.pos[i * 3 + 2] = (Math.random() - .5) * Rr * .6; q.vel[i * 3] = -1.5 - Math.random(); q.vel[i * 3 + 1] = .5 + Math.random() * .6; q.life[i] = 3; }
        if (q.life[i] > 0) { q.life[i] -= dt; q.pos[i * 3] += q.vel[i * 3] * dt; q.pos[i * 3 + 1] += q.vel[i * 3 + 1] * dt; } else q.pos[i * 3 + 1] = -99; } bub.geometry.attributes.position.needsUpdate = true;
      const y0 = sub.position.y; aU.userData.set(V.set(0, y0 + Rr * 1.3 + (mini ? sailH : sailH * 1.4), 0), UP, 1.6 * Math.min(2, R.margin) + .4); aD.userData.set(V.set(0, y0 - Rr * 1.3, 0), V2.set(0, -1, 0), 2); aT.userData.set(V.set(L * .55, y0, 0), V2.set(1, 0, 0), 1.4);
      return 0; } };
};
function airfoilWing(span, chord) { const g = airfoil({ span, root: chord, tip: chord * .6, th: .12, cam: 0, twist: 0, S: 8, C: 10 }); g.rotateY(Math.PI / 2); return g; }
function partsLayer(parts, obj) { const byName = {}, list = []; (parts || []).forEach((p, i) => { const g = new T.Group(), m = M(partGeo(p), partMat(p.material, p.color)); g.add(m); const pos = p.pos || [0, 0, 0], rot = p.rot || [0, 0, 0];
    g.position.set(+pos[0] || 0, +pos[1] || 0, +pos[2] || 0); g.rotation.set(T.MathUtils.degToRad(+rot[0] || 0), T.MathUtils.degToRad(+rot[1] || 0), T.MathUtils.degToRad(+rot[2] || 0));
    const par = p.parent && byName[p.parent] ? byName[p.parent] : obj; par.add(g); byName[p.name || ("part" + i)] = g; list.push({ g, p }); }); return { byName, list }; }
function partsTick(list, e, dt) { list.forEach(({ g, p }) => {
  if (p._spin) { let w = 0; try { w = p._spin(e); } catch (err) {} if (!isFinite(w)) w = 0; w = Math.max(-60, Math.min(60, w)); g.rotation[p.spin.axis || "y"] += w * dt; }
  if (p._scale) { let k = 1; try { k = p._scale(e); } catch (err) {} if (!isFinite(k)) k = 1; k = Math.max(.05, Math.min(20, k)); const ax = p.scaleWith.axis; if (ax === "x" || ax === "y" || ax === "z") { g.scale.set(1, 1, 1); g.scale[ax] = k; } else g.scale.setScalar(k); }
  if (p._glow && g.children[0].material.emissive) { let k = 1; try { k = p._glow(e); } catch (err) {} g.children[0].material.emissiveIntensity = Math.max(0, Math.min(6, 2.2 * (isFinite(k) ? k : 1))); } }); }

/* Maglev on an elevated guideway, or a hyperloop pod inside a low-pressure tube */
B.guideway = (R, st) => {
  const hyper = /hyper|tube|pod/.test((R.sc.kind || "").toLowerCase()), root = new T.Group(), Y = 5;
  const L = hyper ? 14 : 34, Wd = hyper ? 1.25 : 1.75, Ht = hyper ? 1.25 : 1.9;
  const paint = new T.MeshPhysicalMaterial({ color: hyper ? 0xe8ecf2 : 0xf5f6f8, roughness: .25, metalness: .3, clearcoat: 1, clearcoatRoughness: .06 });
  const stn = []; for (let i = 0; i <= 18; i++) { const u = i / 18, x = (u - .5) * L, nose = u > .62 ? Math.pow(Math.max(.002, 1 - Math.pow((u - .62) / .38, 1.6)), .6) : u < .1 ? Math.pow(u / .1, .5) * .95 + .05 : 1;
    const hgt = Ht * (u > .62 ? .25 + .75 * nose : 1); stn.push([x, Math.max(.02, Wd * nose), Math.max(.02, hgt), Math.max(.02, Ht * .35 * (u > .62 ? nose : 1)), 0, 3]); }
  stn.reverse(); const car = new T.Group(); root.add(car);
  const body = M(loft(ST(stn), { S: 110, R: 48 }), paint); car.add(body);
  const stripe = M(loft(ST(stn.map(r => [r[0], r[1] * 1.004, r[2] * .32, r[3] * .2, 0, 3])), { S: 110, R: 48 }), new T.MeshStandardMaterial({ color: hyper ? 0x7c3aed : 0x1d4ed8, roughness: .4, metalness: .3 })); stripe.position.y = Ht * .05; car.add(stripe);
  const win = M(loft(ST(stn.filter(r => r[0] > -L * .45 && r[0] < L * .2).map(r => [r[0], r[1] * 1.01, r[2] * .82, -r[2] * .55, 0, 3])), { S: 60, R: 40 }), new T.MeshPhysicalMaterial({ color: 0x0b1626, roughness: .08, metalness: .5, clearcoat: 1 })); car.add(win);
  const glowM = MAT.glow(hyper ? 0xa78bfa : 0x38bdf8, .85); const strip = M(new T.BoxGeometry(L * .8, .06, Wd * 1.4), glowM, false); strip.position.set(-L * .05, -Ht * .36, 0); car.add(strip);
  car.position.y = Y + Ht * .36 + .12;
  const conc = new T.MeshStandardMaterial({ map: TEX.concrete([20, 1]), color: 0xd6d8dc, roughness: .9 }), track = new T.Group(); root.add(track);
  const SPAN = 14, N = 14, pil = [];
  if (!hyper) { const beam = M(new T.BoxGeometry(SPAN * N, .9, 2.6), conc, true, true); beam.position.y = Y - .45; track.add(beam);
      [-1, 1].forEach(sd => { const rail = M(new T.BoxGeometry(SPAN * N, .35, .3), MAT.metal(), true, true); rail.position.set(0, Y + .05, sd * 1.15); track.add(rail); }); }
  else { const tubeM = new T.MeshPhysicalMaterial({ color: 0xdfe8f2, roughness: .06, metalness: 0, transparent: true, opacity: .22, side: T.DoubleSide, clearcoat: 1, depthWrite: false });
    const tubeR = 2.3, steel = new T.MeshStandardMaterial({ color: 0xc9d1db, metalness: .85, roughness: .32, side: T.DoubleSide });
    const tube = M(new T.CylinderGeometry(tubeR, tubeR, SPAN * N, 72, 1, true, Math.PI * .05, Math.PI * 1.5).rotateZ(Math.PI / 2), steel, true, true); tube.position.y = car.position.y; track.add(tube);
    const inner = M(new T.CylinderGeometry(tubeR * .98, tubeR * .98, SPAN * N, 72, 1, true, Math.PI * .05, Math.PI * 1.5).rotateZ(Math.PI / 2), new T.MeshStandardMaterial({ color: 0x3b4352, roughness: .7, side: T.BackSide }), false, true); inner.position.y = tube.position.y; track.add(inner);
    const glass = new T.Mesh(new T.CylinderGeometry(tubeR, tubeR, SPAN * N, 48, 1, true, Math.PI * 1.55, Math.PI * .5).rotateZ(Math.PI / 2), tubeM); glass.position.y = tube.position.y; glass.renderOrder = 2; track.add(glass);
    const floor = M(new T.BoxGeometry(SPAN * N, .25, 1.6), MAT.metal(), true, true); floor.position.y = car.position.y - tubeR * .78; track.add(floor);
    car.position.y = floor.position.y + .25 + Ht * .36 + .1; strip.position.y = -Ht * .36; }
  for (let i = 0; i < N; i++) { const g = new T.Group(); g.position.x = (i - N / 2) * SPAN; track.add(g); pil.push(g);
    const col = M(new T.CylinderGeometry(.55, .7, Y - (hyper ? 1.9 : .9), 20), conc, true, true); col.position.y = (Y - (hyper ? 1.9 : .9)) / 2; g.add(col);
    if (hyper) { const ring = M(new T.TorusGeometry(2.36, .1, 10, 48, Math.PI * 1.5).rotateX(Math.PI * .05).rotateY(Math.PI / 2), MAT.metal(), true, true); ring.position.y = Y + .57; g.add(ring); const cr = M(new T.BoxGeometry(.6, .4, 3.4), conc, true, true); cr.position.y = Y - 1.95; g.add(cr); }
    else { const cap = M(new T.BoxGeometry(1.6, .5, 3.2), conc, true, true); cap.position.y = Y - 1.1; g.add(cap); } }
  const streak = particles(120, 0xdbeafe, .18, { opacity: .7 }); root.add(streak);
  const aT = arrow3(0x22d3ee, 1.4), aD = arrow3(0xfb7185, 1.4); root.add(aT, aD);
  const mk = { body: marker(car, 0, Ht, 0), motor: marker(car, -L * .2, -Ht * .3, 0), drag: aD.userData.tip, thrust: aT.userData.tip, speed: marker(car, 0, Ht * 1.2, 0), goal: aT.userData.tip, wheels: marker(car, 0, -Ht * .35, 0), pressure: marker(car, L * .2, Ht * 1.4, 0), battery: marker(car, -L * .2, -Ht * .3, 0) };
  return { root, anchors: mk, follow: null, ground: "grass", moving: false, cam: { pos: new T.Vector3(L * .35, Y + 6, L * .9 + 8), target: new T.Vector3(L * .1, Y + 1, 0), fitW: L * .62 },
    labels: [{ obj: aT.userData.tip, text: () => hyper ? "Linear motor push" : "Magnetic push", col: "#22d3ee" }, { obj: aD.userData.tip, text: () => "Air drag", col: "#fb7185" }],
    update(R, dt, t) { const sp = (R.ok ? 1 : .35 + .5 * R.frac) * 40; st.x = ((st.x || 0) - sp * dt) % SPAN;
      pil.forEach((g, i) => g.position.x = (i - N / 2) * SPAN + st.x);
      car.position.y += (Math.sin(t * 2.2) * .02 - (car.position.y - (car.userData.y0 ??= car.position.y))) * .5;
      glowM.opacity = .5 + .35 * (Math.sin(t * 6) * .5 + .5);
      const q = streak.userData; for (let i = 0; i < q.n; i++) { if (q.life[i] <= 0) { q.pos[i * 3] = L * .6 + Math.random() * 20; q.pos[i * 3 + 1] = car.position.y + (Math.random() - .3) * Ht * 2.2; q.pos[i * 3 + 2] = (Math.random() - .5) * Wd * 3.5; q.life[i] = 2; }
        q.life[i] -= dt; q.pos[i * 3] -= sp * 1.6 * dt * (hyper ? .4 : 1); if (q.pos[i * 3] < -L) q.life[i] = 0; } streak.geometry.attributes.position.needsUpdate = true;
      const yc = car.position.y; aT.userData.set(V.set(-L * .55, yc, 0), V2.set(1, 0, 0), 1.6 * Math.min(2, R.margin)); aD.userData.set(V.set(L * .56, yc + Ht * .2, 0), V2.set(-1, 0, 0), 1.6);
      return 0; } };
};

/* Leonardo's aerial screw (1 rotor), a human-powered Atlas-style quad (several big rotors), or a delivery drone */
B.multirotor = (R, st) => {
  const n = Math.max(1, Math.min(8, Math.round(R.role("rotors", 1)))), Dm = Math.max(.15, R.role("size", 1)), drone = /drone|package|delivery/.test((R.sc.kind || "") + " " + (R.sc.label || "").toLowerCase()) || R.sc.type === "multirotor";
  const root = new T.Group(), craft = new T.Group(); root.add(craft); const rotors = [];
  const wood = new T.MeshStandardMaterial({ map: TEX.bark ? TEX.bark([2, 2]) : null, color: 0xa47548, roughness: .8 });
  const linen = new T.MeshStandardMaterial({ color: 0xeadcc0, roughness: .95, side: T.DoubleSide });
  let size, H0;
  if (n === 1 && !drone) { // Leonardo's screw
    const Rr = Dm / 2, Hs = Rr * 1.0, g = new T.BufferGeometry(), NI = 6, NJ = 90, pos = [], idx = [];
    for (let j = 0; j <= NJ; j++) for (let i = 0; i <= NI; i++) { const u = j / NJ, a = u * Math.PI * 2 * 1.15, r = Rr * (.12 + .88 * i / NI); pos.push(Math.cos(a) * r, u * Hs, Math.sin(a) * r); }
    for (let j = 0; j < NJ; j++) for (let i = 0; i < NI; i++) { const a = j * (NI + 1) + i, b = a + NI + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const screw = new T.Group(); screw.add(M(g, linen));
    const rim = []; for (let j = 0; j <= 60; j++) { const u = j / 60, a = u * Math.PI * 2 * 1.15; rim.push(new T.Vector3(Math.cos(a) * Rr, u * Hs, Math.sin(a) * Rr)); }
    screw.add(M(new T.TubeGeometry(new T.CatmullRomCurve3(rim), 120, Math.max(.03, Rr * .025), 8), wood));
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 * 1.15, y = k / 6 * Hs, sp = M(new T.CylinderGeometry(Rr * .012 + .01, Rr * .012 + .01, Rr, 6), wood); sp.rotation.z = Math.PI / 2; sp.rotation.y = -a; sp.position.set(Math.cos(a) * Rr / 2, y, Math.sin(a) * Rr / 2); screw.add(sp); }
    const mast = M(new T.CylinderGeometry(Rr * .04 + .02, Rr * .05 + .02, Hs + Rr * .5, 12), wood); mast.position.y = (Hs + Rr * .5) / 2 - Rr * .25; screw.add(mast);
    H0 = .4; const lift0 = 2.1; screw.position.y = H0 + lift0; craft.add(screw); rotors.push({ g: screw, w: 1 });
    const post = M(new T.CylinderGeometry(Rr * .05 + .03, Rr * .06 + .04, lift0 + .1, 14), wood); post.position.y = H0 + lift0 / 2; craft.add(post);
    const deck = M(new T.CylinderGeometry(Rr * .5, Rr * .5, Rr * .06 + .05, 40), wood); deck.position.y = H0 - Rr * .05; craft.add(deck);
    const crew = new T.Group(); craft.add(crew); const bars = []; rotors.push({ g: crew, w: 1 });
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2, bar = M(new T.CylinderGeometry(.04, .04, Rr * .45, 8), wood); bar.rotation.z = Math.PI / 2; bar.rotation.y = -a; bar.position.set(Math.cos(a) * Rr * .22, H0 + 1.05, Math.sin(a) * Rr * .22); crew.add(bar);
      const man = new T.Group(); man.position.set(Math.cos(a + .35) * Rr * .36, 0, Math.sin(a + .35) * Rr * .36); man.rotation.y = -a - Math.PI / 2;
      const bdy = M(new T.CapsuleGeometry(.17, .55, 6, 12), new T.MeshStandardMaterial({ color: [0x7f1d1d, 0x1e3a8a, 0x365314, 0x713f12][k], roughness: .9 })); bdy.position.y = .6; bdy.rotation.x = .35; man.add(bdy);
      const hd = M(new T.SphereGeometry(.13, 14, 10), new T.MeshStandardMaterial({ color: 0xd9a37e })); hd.position.set(0, 1.08, .18); man.add(hd); crew.add(man); man.position.y = H0; }
    size = Rr * 2.2; H0 = H0 + lift0 * .6;
    crew.userData.bars = bars;
  } else { // multirotor
    const Rr = Dm / 2, arm = Rr * (n <= 2 ? 1.15 : 1.12 / Math.sin(Math.PI / n)), human = !drone;
    H0 = human ? Rr * .12 + 1.4 : .35 + Rr * .3;
    const tubeM = human ? new T.MeshStandardMaterial({ color: 0x111827, roughness: .4, metalness: .3 }) : MAT.dark();
    const hub = new T.Group(); hub.position.y = H0; craft.add(hub);
    if (human) { const seat = M(new T.BoxGeometry(.5, .1, .4), MAT.dark()); seat.position.y = -.7; hub.add(seat); const pil = M(new T.CapsuleGeometry(.2, .55, 6, 12), new T.MeshStandardMaterial({ color: 0xf97316, roughness: .8 })); pil.position.y = -.25; pil.rotation.x = -.2; hub.add(pil); const hd = M(new T.SphereGeometry(.15, 14, 10), MAT.white()); hd.position.set(0, .22, .08); hub.add(hd); }
    else { const body = M(new T.BoxGeometry(Rr * .9 + .25, Rr * .25 + .08, Rr * .9 + .25), new T.MeshPhysicalMaterial({ color: 0xf1f5f9, roughness: .3, clearcoat: 1 })); hub.add(body);
      const pkg = M(new T.BoxGeometry(.32, .24, .32), new T.MeshStandardMaterial({ color: 0xc08a4b, roughness: .9 })); pkg.position.y = -(Rr * .25 + .08) / 2 - .2; hub.add(pkg);
      const tape = M(new T.BoxGeometry(.33, .05, .08), new T.MeshStandardMaterial({ color: 0x7c5a2e })); tape.position.copy(pkg.position); tape.position.y += .1; hub.add(tape);
      [-1, 1].forEach(sd => { const leg = M(new T.BoxGeometry(.03, H0 - .05, .03), MAT.dark()); leg.position.set(sd * (Rr * .3 + .12), -H0 / 2, 0); hub.add(leg); const sk = M(new T.CylinderGeometry(.02, .02, Rr * .9 + .4, 8), MAT.dark()); sk.rotation.x = Math.PI / 2; sk.position.set(sd * (Rr * .3 + .12), -H0 + .02, 0); hub.add(sk); }); }
    for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2 + (n === 4 ? Math.PI / 4 : 0), x = Math.cos(a) * arm, z = Math.sin(a) * arm;
      const rodL = Math.hypot(x, z), rod = M(new T.CylinderGeometry(human ? .05 + Rr * .004 : .02 + Rr * .03, human ? .05 + Rr * .004 : .02 + Rr * .03, rodL, 10), tubeM); rod.rotation.z = Math.PI / 2; rod.rotation.y = -a; rod.position.set(x / 2, 0, z / 2); hub.add(rod);
      if (human) { const strut = M(new T.CylinderGeometry(.03, .03, Math.hypot(rodL, Rr * .25), 8), tubeM); strut.position.set(x / 2, Rr * .12, z / 2); strut.lookAt(hub.localToWorld(new T.Vector3(x, 0, z))); strut.rotateX(Math.PI / 2); hub.add(strut); }
      const rg = new T.Group(); rg.position.set(x, human ? .1 : .06, z); hub.add(rg);
      const mot = M(new T.CylinderGeometry(human ? .12 : .05 + Rr * .05, human ? .12 : .05 + Rr * .05, human ? .2 : .08 + Rr * .06, 16), human ? tubeM : MAT.metal()); rg.add(mot);
      const blades = new T.Group(); blades.position.y = human ? .15 : .06 + Rr * .04; rg.add(blades);
      const nb = 2; for (let bI = 0; bI < nb; bI++) { const bl = M(airfoilWing(Rr * .98, Rr * (human ? .13 : .14)), human ? new T.MeshStandardMaterial({ color: 0xe2e8f0, roughness: .35 }) : MAT.dark(), !human); bl.rotation.y = bI * Math.PI; bl.position.set(0, 0, 0); const holder = new T.Group(); holder.rotation.y = bI * Math.PI; bl.rotation.y = 0; bl.position.x = Rr * .49; holder.add(bl); blades.add(holder); }
      const disc = M(new T.CircleGeometry(Rr, 48).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }), false); disc.position.y = blades.position.y; rg.add(disc);
      rotors.push({ g: blades, w: k % 2 ? -1 : 1, disc }); }
    size = arm * 2 + Rr * 2;
  }
  const th = Math.max(.25, Math.min(3, size * .06)), aU = arrow3(0x22d3ee, th), aD = arrow3(0xfb7185, th); root.add(aU, aD);
  const mk = { body: marker(craft, 0, H0, 0), fans: rotors[0] ? rotors[0].g : marker(craft, 0, H0, 0), levels: marker(craft, 0, H0 + .3, 0), downwash: marker(craft, 0, .1, 0), battery: marker(craft, 0, H0, 0), motor: rotors[0] ? rotors[0].g : marker(craft, 0, H0, 0), thrust: aU.userData.tip, weight: aD.userData.tip, lift: aU.userData.tip, top: marker(craft, 0, H0 + size * .25, 0) };
  const labels = [{ obj: aU.userData.tip, text: () => "Lift", col: "#22d3ee" }, { obj: aD.userData.tip, text: () => "Weight", col: "#fb7185" }];
  const dist = Math.max(4, size * 1.25);
  return { root, anchors: mk, labels, follow: null, ground: "grass", cam: { pos: new T.Vector3(dist * .45, dist * (n > 1 && !drone ? .7 : .45) + H0, dist), target: new T.Vector3(0, H0 * .8 + (drone ? 1 : 0), 0), fitW: size * (n > 1 && !drone ? .3 : .36) },
    update(R, dt, t) { const w = R.ok ? 1 : Math.max(.25, Math.min(.9, R.frac)); rotors.forEach(r => { r.g.rotation.y += (n === 1 && !drone ? 1.6 : drone ? 40 : 5) * w * r.w * dt; if (r.disc) r.disc.material.opacity = drone ? .12 * w : 0; });
      const tgt = R.ok ? (drone ? 1.2 : size * .03 + .4) : 0; st.alt = st.alt == null ? 0 : st.alt + (tgt - st.alt) * Math.min(1, dt * 1.5); craft.position.y = st.alt + (R.ok ? Math.sin(t * 1.4) * .03 * Math.max(1, size * .05) : 0);
      const y = craft.position.y + H0, s2 = Math.max(.6, size * .22); aU.userData.set(V.set(-size * .35, y + size * .05, 0), UP, s2 * Math.min(2, R.margin)); aD.userData.set(V.set(size * .35, y, 0), V2.set(0, -1, 0), s2);
      return 0; } };
};
B.screw = B.multirotor;

/* ---------- purpose-built scenes for machines the generic builders drew wrongly ---------- */
function arrowsKit(root, th) { const a = arrow3(0x22d3ee, th), b = arrow3(0xfb7185, th), c = arrow3(0xfb7185, th); root.add(a, b, c); return [a, b, c]; }
function solarTex() { return ctex("solarcells", 256, 256, (x, w, h) => { x.fillStyle = "#0b1d3a"; x.fillRect(0, 0, w, h); const n = 8, s = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const g = x.createLinearGradient(i * s, j * s, i * s + s, j * s + s); g.addColorStop(0, "#1e3a8a"); g.addColorStop(1, "#102a5c"); x.fillStyle = g; x.fillRect(i * s + 2, j * s + 2, s - 4, s - 4); x.fillStyle = "rgba(200,220,255,.35)"; x.fillRect(i * s + 2, j * s + s / 2, s - 4, 1); } }, [1, 1]); }

/* sailplane: long thin wings, no engine */
B.glider = (R, st) => {
  const root = new T.Group(), pl = new T.Group(); root.add(pl); const span = Math.max(8, Math.min(22, 5 + R.role("span", 15) * .45));
  const white = new T.MeshPhysicalMaterial({ color: 0xffffff, roughness: .2, clearcoat: 1, clearcoatRoughness: .05 });
  const fus = M(new T.CapsuleGeometry(.38, 4.2, 10, 24), white); fus.rotation.z = Math.PI / 2; pl.add(fus);
  const boom = M(new T.ConeGeometry(.3, 3.6, 20), white); boom.rotation.z = Math.PI / 2; boom.position.x = -3.6; pl.add(boom);
  const can = M(new T.SphereGeometry(.5, 24, 16), new T.MeshPhysicalMaterial({ color: 0x1b2a3a, roughness: .05, metalness: .4, clearcoat: 1 })); can.scale.set(1.6, .7, .75); can.position.set(1.3, .3, 0); pl.add(can);
  [-1, 1].forEach(sd => { const w = M(new T.BoxGeometry(1.05, .09, span / 2), white); w.position.set(.4, .25, sd * span / 4); w.rotation.x = sd * -.05; pl.add(w);
    const tip = M(new T.BoxGeometry(.5, .35, .05), white); tip.position.set(.25, .4, sd * (span / 2 - .02)); pl.add(tip); });
  const fin = M(new T.BoxGeometry(.9, 1.4, .07), white); fin.position.set(-5.1, .7, 0); pl.add(fin);
  const stab = M(new T.BoxGeometry(.6, .06, 3), white); stab.position.set(-5.2, 1.4, 0); pl.add(stab);
  const stripe = M(new T.BoxGeometry(4.5, .08, .79), new T.MeshStandardMaterial({ color: 0xdc2626 })); stripe.position.set(-.2, -.05, 0); pl.add(stripe);
  const air = particles(90, 0xffffff, .12, { opacity: .6 }); root.add(air);
  const [aL, aD, aW] = arrowsKit(root, 1);
  const mk = { wing: marker(pl, .4, .3, span / 4), airfoil: marker(pl, .4, .3, -span / 4), body: marker(pl, 0, .4, 0), lift: aL.userData.tip, drag: aD.userData.tip, weight: aW.userData.tip, thrust: aD.userData.tip };
  return { root, anchors: mk, follow: null, ground: "grass", labels: [{ obj: aL.userData.tip, text: () => "Lift", col: "#22d3ee" }, { obj: aD.userData.tip, text: () => "Drag", col: "#fb7185" }, { obj: aW.userData.tip, text: () => "Weight", col: "#fb7185" }],
    cam: { pos: new T.Vector3(span * .45, 14, span * .85 + 6), target: new T.Vector3(-.5, 10, 0), fitW: span * .58 },
    update(R, dt, t) { pl.position.y = 10 + Math.sin(t * .7) * .15 - (R.ok ? 0 : (1 - R.frac) * 1.2); pl.rotation.x = Math.sin(t * .5) * .03; pl.rotation.z = -.05;
      const q = air.userData; for (let i = 0; i < q.n; i++) { if (q.life[i] <= 0) { q.pos[i * 3] = 8 + Math.random() * 6; q.pos[i * 3 + 1] = pl.position.y + (Math.random() - .5) * 3; q.pos[i * 3 + 2] = (Math.random() - .5) * span; q.life[i] = 2; } q.life[i] -= dt; q.pos[i * 3] -= 14 * dt; } air.geometry.attributes.position.needsUpdate = true;
      const y = pl.position.y; aL.userData.set(V.set(.4, y + .5, 0), UP, 2.2); aD.userData.set(V.set(2.6, y + .1, 0), V2.set(1, 0, 0).negate(), 1.2); aW.userData.set(V.set(-.3, y - .4, 0), V2.set(0, -1, 0), 2.2); return 0; } };
};

/* kite surfer: rider on a board, pulled by a curved traction kite */
B.kite = (R, st) => {
  const root = new T.Group(), rider = new T.Group(); root.add(rider); const A = Math.max(2, R.role("span", 9)), Rk = 2.2 + Math.sqrt(A) * .9;
  const board = M(new T.BoxGeometry(1.5, .06, .45), new T.MeshStandardMaterial({ color: 0xf97316, roughness: .4 })); board.position.y = .05; rider.add(board);
  const suit = new T.MeshStandardMaterial({ color: 0x111827, roughness: .8 }), skin = new T.MeshStandardMaterial({ color: 0xd9a37e });
  [-1, 1].forEach(sd => { const leg = M(new T.CapsuleGeometry(.08, .7, 6, 10), suit); leg.position.set(sd * .28, .5, 0); leg.rotation.z = sd * .25; rider.add(leg); });
  const torso = M(new T.CapsuleGeometry(.17, .55, 6, 12), new T.MeshStandardMaterial({ color: 0x0ea5e9, roughness: .7 })); torso.position.set(-.12, 1.25, 0); torso.rotation.z = .35; rider.add(torso);
  const head = M(new T.SphereGeometry(.13, 16, 12), skin); head.position.set(-.35, 1.75, 0); rider.add(head);
  const hands = new T.Vector3(.35, 1.35, 0); const bar = M(new T.CylinderGeometry(.02, .02, .6, 8), MAT.dark()); bar.rotation.x = Math.PI / 2; bar.position.copy(hands); rider.add(bar);
  const kite = new T.Group(); kite.position.set(10, 10, -4); root.add(kite);
  const NI = 4, NJ = 30, pos = [], idx = [], ch = Rk * .45; for (let j = 0; j <= NJ; j++) for (let i = 0; i <= NI; i++) { const a = (-65 + 130 * j / NJ) * Math.PI / 180, x = (i / NI - .5) * ch * (1 - Math.abs(j / NJ - .5) * .7); pos.push(x, Math.cos(a) * Rk - Rk, Math.sin(a) * Rk); }
  for (let j = 0; j < NJ; j++) for (let i = 0; i < NI; i++) { const a = j * (NI + 1) + i, b = a + NI + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const kg = new T.BufferGeometry(); kg.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); kg.setIndex(idx); kg.computeVertexNormals();
  kite.add(M(kg, new T.MeshStandardMaterial({ color: 0xe11d48, roughness: .5, side: T.DoubleSide })));
  const le = []; for (let j = 0; j <= NJ; j++) { const a = (-65 + 130 * j / NJ) * Math.PI / 180; le.push(new T.Vector3(ch * .5 * (1 - Math.abs(j / NJ - .5) * .7), Math.cos(a) * Rk - Rk, Math.sin(a) * Rk)); }
  kite.add(M(new T.TubeGeometry(new T.CatmullRomCurve3(le), 60, .09, 8), MAT.white())); kite.rotation.z = .5;
  const lineM = new T.LineBasicMaterial({ color: 0x1f2937 }), lines = [-1, 1].map(sd => { const g = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]); const l = new T.Line(g, lineM); root.add(l); return { l, sd }; });
  const spray = particles(120, 0xffffff, .14, { opacity: .8 }); root.add(spray);
  const [aP, aD] = arrowsKit(root, .7);
  const mk = { wing: kite, airfoil: kite, body: marker(rider, 0, 1.2, 0), lift: aP.userData.tip, drag: aD.userData.tip, weight: aD.userData.tip, thrust: aP.userData.tip };
  return { root, anchors: mk, follow: null, ground: "water", water: true, labels: [{ obj: aP.userData.tip, text: () => "Kite pull", col: "#22d3ee" }, { obj: aD.userData.tip, text: () => "Water drag", col: "#fb7185" }],
    cam: { pos: new T.Vector3(-4, 5, 19), target: new T.Vector3(5, 5.5, -2), fitW: 9 },
    update(R, dt, t) { const ok = R.ok; rider.position.y = waveH(0, 0, t) * .5 + .05; rider.rotation.z = ok ? .1 : 0; kite.position.y = 10 + Math.sin(t * .8) * .5; kite.position.z = -4 + Math.sin(t * .5) * 1.2; kite.rotation.x = Math.sin(t * .5) * .1;
      lines.forEach(({ l, sd }) => { const p = l.geometry.attributes.position; const h = rider.localToWorld(hands.clone().add(new T.Vector3(0, 0, sd * .28))); const k = kite.localToWorld(new T.Vector3(0, -Rk * .15, sd * Rk * .8)); p.setXYZ(0, h.x, h.y, h.z); p.setXYZ(1, k.x, k.y, k.z); p.needsUpdate = true; });
      const q = spray.userData; for (let i = 0; i < q.n; i++) { if (q.life[i] <= 0 && ok) { q.pos[i * 3] = -.7; q.pos[i * 3 + 1] = .1; q.pos[i * 3 + 2] = (Math.random() - .5) * .4; q.vel[i * 3] = -2 - Math.random() * 2; q.vel[i * 3 + 1] = 1 + Math.random() * 1.5; q.life[i] = .8; }
        if (q.life[i] > 0) { q.life[i] -= dt; q.vel[i * 3 + 1] -= 9.8 * dt; q.pos[i * 3] += q.vel[i * 3] * dt; q.pos[i * 3 + 1] = Math.max(0, q.pos[i * 3 + 1] + q.vel[i * 3 + 1] * dt); } else q.pos[i * 3 + 1] = -50; } spray.geometry.attributes.position.needsUpdate = true;
      const dir = V2.set(10, 8.5, -4).normalize(); aP.userData.set(V.set(.6, 1.5, 0), dir, 2.6 * Math.min(2, R.margin)); aD.userData.set(new T.Vector3(-.9, .2, 0), new T.Vector3(-1, 0, 0), 1.6); return 0; } };
};

/* rain harvesting: roof, gutter, downpipe, tank filling up */
B.rain = (R, st) => {
  const root = new T.Group(), wall = new T.MeshStandardMaterial({ color: 0xe9e2d3, roughness: .9 }), roofM = new T.MeshStandardMaterial({ color: 0x9a3f2b, roughness: .7 });
  const W = 8, D = 6, Hh = 3.2, rise = 2; const body = M(new T.BoxGeometry(W, Hh, D), wall, true, true); body.position.y = Hh / 2; root.add(body);
  [-1, 1].forEach(sd => { const sl = Math.hypot(D / 2, rise) + .3, pane = M(new T.BoxGeometry(W + .6, .12, sl), roofM, true, true); pane.position.set(0, Hh + rise / 2, sd * D / 4); pane.rotation.x = sd * Math.atan2(rise, D / 2); root.add(pane); });
  const gab = new T.Shape(); gab.moveTo(-D / 2, 0); gab.lineTo(D / 2, 0); gab.lineTo(0, rise); gab.closePath(); [-1, 1].forEach(sd => { const g = M(new T.ShapeGeometry(gab), wall); g.rotation.y = Math.PI / 2; g.position.set(sd * W / 2, Hh, 0); root.add(g); });
  const door = M(new T.BoxGeometry(1, 2, .05), new T.MeshStandardMaterial({ color: 0x6b4226 })); door.position.set(-1.5, 1, D / 2 + .01); root.add(door);
  [1.2, 3].forEach(x => { const w = M(new T.BoxGeometry(1, .9, .05), new T.MeshPhysicalMaterial({ color: 0x9cc8e8, roughness: .05 })); w.position.set(x - 2, 2, D / 2 + .01); root.add(w); });
  const gutM = new T.MeshStandardMaterial({ color: 0xd1d5db, metalness: .6, roughness: .35 });
  const gut = M(new T.CylinderGeometry(.14, .14, W + .6, 16, 1, true, 0, Math.PI), gutM); gut.rotation.z = Math.PI / 2; gut.rotation.x = Math.PI; gut.position.set(0, Hh + .05, D / 2 + .25); root.add(gut);
  const pipe = M(new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(W / 2 + .2, Hh, D / 2 + .25), new T.Vector3(W / 2 + .5, Hh - .3, D / 2 + .25), new T.Vector3(W / 2 + 1.2, 2.6, D / 2 - .4), new T.Vector3(W / 2 + 1.6, 2.4, D / 2 - .6)]), 30, .08, 10), gutM); root.add(pipe);
  const tank = new T.Group(); tank.position.set(W / 2 + 1.6, 0, D / 2 - 1.6); root.add(tank);
  const shell = new T.Mesh(new T.CylinderGeometry(1.1, 1.1, 2.3, 40, 1, true), new T.MeshPhysicalMaterial({ color: 0x2f6f4f, roughness: .4, transparent: true, opacity: .55, side: T.DoubleSide, depthWrite: false })); shell.position.y = 1.15; tank.add(shell);
  const lid = M(new T.CylinderGeometry(1.12, 1.12, .08, 40), new T.MeshStandardMaterial({ color: 0x1f4d36 })); lid.position.y = 2.32; tank.add(lid);
  const water = M(new T.CylinderGeometry(1.05, 1.05, 1, 40), new T.MeshPhysicalMaterial({ color: 0x2a86c8, roughness: .08, transparent: true, opacity: .85 }), false); tank.add(water);
  const rain = particles(500, 0xbfdbfe, .08, { opacity: .75 }); root.add(rain); const drip = particles(40, 0x93c5fd, .1, { opacity: .9 }); root.add(drip);
  const mk = { inlet: marker(root, 0, Hh + rise + .2, 0), outlet: marker(tank, 0, 2.4, 0), inside: marker(tank, 0, 1, 0), chimney: marker(root, W / 2 + .4, Hh - .3, D / 2 + .25), body: marker(root, 0, Hh, 0) };
  return { root, anchors: mk, follow: null, ground: "grass", labels: [], cam: { pos: new T.Vector3(9, 7.5, 17), target: new T.Vector3(2, 2.6, 0), fitW: 8.5 },
    update(R, dt, t) { const fill = Math.max(.06, Math.min(1, R.margin * .7)); st.f = st.f == null ? fill : st.f + (fill - st.f) * Math.min(1, dt * 2); water.scale.y = st.f * 2.2; water.position.y = st.f * 1.1 + .02;
      const q = rain.userData; for (let i = 0; i < q.n; i++) { if (q.life[i] <= 0) { q.pos[i * 3] = (Math.random() - .5) * 26; q.pos[i * 3 + 1] = 14 + Math.random() * 6; q.pos[i * 3 + 2] = (Math.random() - .5) * 18; q.life[i] = 4; } q.life[i] -= dt; q.pos[i * 3 + 1] -= 11 * dt; if (q.pos[i * 3 + 1] < 0) q.life[i] = 0; } rain.geometry.attributes.position.needsUpdate = true;
      const d = drip.userData; for (let i = 0; i < d.n; i++) { if (d.life[i] <= 0) { d.pos[i * 3] = W / 2 + 1.6; d.pos[i * 3 + 1] = 2.35; d.pos[i * 3 + 2] = D / 2 - .6; d.life[i] = .35 + Math.random() * .2; } d.life[i] -= dt; d.pos[i * 3 + 1] -= 4 * dt; } drip.geometry.attributes.position.needsUpdate = true; return 0; } };
};

/* e-scooter climbing a slope */
B.scooter = (R, st) => {
  const root = new T.Group(), slope = Math.atan(Math.min(.35, (R.env && R.env.s ? R.env.s : 15) / 100 * 1.4)), tilt = new T.Group(); tilt.rotation.z = slope; root.add(tilt);
  const roadTex = TEX.asphalt([8, 1]); const road = M(new T.PlaneGeometry(60, 6).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ map: roadTex, roughness: .9 }), false, true); tilt.add(road);
  const line = M(new T.PlaneGeometry(60, .12).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xf8fafc }), false); line.position.set(0, .01, 2.4); tilt.add(line);
  const sc = new T.Group(); tilt.add(sc); const dark = MAT.dark(), paint = new T.MeshPhysicalMaterial({ color: 0x0f766e, roughness: .3, clearcoat: 1 });
  const skate = (R.sc.kind || "").includes("skate"); let wheels;
  if (skate) { const deck = M(loft(ST([[.48, .02, .015, .015, .13, 2], [.42, .12, .02, .02, .12, 3], [-.42, .12, .02, .02, .12, 3], [-.48, .02, .015, .015, .13, 2]]), { S: 24, R: 20 }), MAT.paint(0x111827)); sc.add(deck);
    wheels = []; [-.3, .3].forEach(x => { [-1, 1].forEach(sd => { const w = M(new T.CylinderGeometry(.045, .045, .04, 20).rotateX(Math.PI / 2), MAT.paint(0x22d3ee)); w.position.set(x, .045, sd * .09); sc.add(w); wheels.push(w); }); const tr = M(new T.BoxGeometry(.05, .04, .2), MAT.metal()); tr.position.set(x, .08, 0); sc.add(tr); });
    const mot = M(new T.CylinderGeometry(.05, .05, .05, 16).rotateX(Math.PI / 2), MAT.dark()); mot.position.set(-.3, .045, -.15); sc.add(mot); const bat = M(new T.BoxGeometry(.5, .04, .12), MAT.dark()); bat.position.set(0, .09, 0); sc.add(bat);
    const pp = figure(0xf97316, 0x1e3a8a); pp.position.set(0, .14, 0); pp.rotation.y = -Math.PI / 2 + .2; pp.userData.legs.forEach((l, i) => { l.position.z = (i ? 1 : -1) * .2; l.rotation.x = (i ? -1 : 1) * .2; }); pp.userData.arms.forEach((a, i) => a.rotation.x = (i ? -1 : 1) * .45); sc.add(pp);
    var motor = mot, deckM = bat; }
  else {

  const deck = M(new T.BoxGeometry(1.0, .07, .2), paint); deck.position.set(0, .2, 0); sc.add(deck);
  wheels = [-.5, .55].map(x => { const w = M(new T.CylinderGeometry(.12, .12, .07, 24).rotateX(Math.PI / 2), MAT.rubber()); w.position.set(x, .12, 0); sc.add(w); return w; });
  const stem = M(new T.CylinderGeometry(.025, .025, 1.05, 10), dark); stem.position.set(.62, .7, 0); stem.rotation.z = .12; sc.add(stem);
  const hb = M(new T.CylinderGeometry(.02, .02, .55, 10), dark); hb.rotation.x = Math.PI / 2; hb.position.set(.56, 1.2, 0); sc.add(hb);
  var motor = M(new T.CylinderGeometry(.13, .13, .09, 24).rotateX(Math.PI / 2), MAT.metal()); motor.position.copy(wheels[0].position); sc.add(motor);
  const suit = new T.MeshStandardMaterial({ color: 0x1e40af, roughness: .8 }), pants = new T.MeshStandardMaterial({ color: 0x1f2937, roughness: .9 });
  [-.08, .08].forEach((z, i) => { const leg = M(new T.CapsuleGeometry(.06, .7, 6, 10), pants); leg.position.set(-.05 + i * .2, .65, z); sc.add(leg); });
  const torso = M(new T.CapsuleGeometry(.15, .5, 6, 12), suit); torso.position.set(.1, 1.3, 0); torso.rotation.z = -.2; sc.add(torso);
  const head = M(new T.SphereGeometry(.12, 16, 12), new T.MeshStandardMaterial({ color: 0xd9a37e })); head.position.set(.18, 1.75, 0); sc.add(head);
  const helmet = M(new T.SphereGeometry(.135, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshStandardMaterial({ color: 0xfacc15 })); helmet.position.copy(head.position); sc.add(helmet);
  [-.12, .12].forEach(z => { const arm = M(new T.CapsuleGeometry(.04, .45, 6, 8), suit); arm.position.set(.36, 1.3, z); arm.rotation.z = -1.0; sc.add(arm); });
  var deckM = deck; }
  const [aF, aG] = arrowsKit(root, .45);
  const mk = { motor, battery: deckM, wheels: wheels[1], body: marker(sc, 0, 1.2, 0), goal: aF.userData.tip, speed: marker(sc, .3, 1.9, 0), drag: aG.userData.tip };
  return { root, anchors: mk, follow: null, ground: "grass", labels: [{ obj: aF.userData.tip, text: () => "Motor push", col: "#22d3ee" }, { obj: aG.userData.tip, text: () => "Gravity down the hill", col: "#fb7185" }],
    cam: { pos: new T.Vector3(1.5, 2.2, 5.2), target: new T.Vector3(.3, 1, 0), fitW: 2.2 },
    update(R, dt, t) { const v = R.ok ? 1 : Math.max(.08, R.frac * .5); roadTex.offset.x += v * dt * .25; wheels.forEach(w => w.rotation.z -= v * 25 * dt); sc.position.y = Math.sin(t * 9) * .004;
      const up = new T.Vector3(Math.cos(slope), Math.sin(slope), 0), base = new T.Vector3(.9 * Math.cos(slope), .35 + .9 * Math.sin(slope), .4); aF.userData.set(base, up, .9 * Math.min(2, R.margin)); aG.userData.set(new T.Vector3(-.7 * Math.cos(slope), .3 - .7 * Math.sin(slope), .4), up.clone().negate(), .9); return 0; } };
};

/* solar race car: flat body covered in cells, bubble canopy */
B.solarcar = (R, st) => {
  const root = new T.Group(), car = new T.Group(); root.add(car); const white = new T.MeshPhysicalMaterial({ color: 0xf8fafc, roughness: .25, clearcoat: 1 });
  const stn = []; for (let i = 0; i <= 14; i++) { const u = i / 14, k = u < .15 ? Math.pow(u / .15, .6) : u > .8 ? Math.sqrt(Math.max(.01, 1 - Math.pow((u - .8) / .2, 2))) : 1; stn.push([(.5 - u) * 4.6, Math.max(.05, .85 * k), Math.max(.03, .16 * k + .02), Math.max(.03, .22 * k), 0, 4]); }
  const body = M(loft(ST(stn), { S: 60, R: 40 }), white); body.position.y = .42; car.add(body);
  const deckT = solarTex(); deckT.wrapS = deckT.wrapT = T.RepeatWrapping; deckT.repeat.set(4, 2);
  const deck = M(new T.BoxGeometry(3.6, .04, 1.5), new T.MeshPhysicalMaterial({ map: deckT, roughness: .15, metalness: .4, clearcoat: 1 })); deck.position.set(-.1, .62, 0); car.add(deck);
  const can = M(new T.SphereGeometry(.42, 24, 16), new T.MeshPhysicalMaterial({ color: 0x0b1626, roughness: .05, metalness: .5, clearcoat: 1 })); can.scale.set(1.5, .6, .9); can.position.set(.9, .7, 0); car.add(can);
  const wheels = []; [[1.3, .62], [1.3, -.62], [-1.5, .55], [-1.5, -.55]].forEach(([x, z]) => { const w = M(new T.CylinderGeometry(.27, .27, .07, 28).rotateX(Math.PI / 2), MAT.rubber()); w.position.set(x, .27, z); car.add(w); wheels.push(w);
    const f = M(new T.SphereGeometry(.34, 16, 10), white); f.scale.set(1.3, .9, .25); f.position.set(x, .35, z); car.add(f); });
  const [aF, aD] = arrowsKit(root, .55);
  const mk = { source: deck, battery: marker(car, -.5, .6, 0), motor: wheels[2], wheels: wheels[0], body: marker(car, 0, .8, 0), drag: aD.userData.tip, goal: aF.userData.tip, speed: marker(car, 0, 1.1, 0) };
  return { root, anchors: mk, follow: null, ground: "road", moving: true, labels: [{ obj: aF.userData.tip, text: () => "Sun-powered push", col: "#22d3ee" }, { obj: aD.userData.tip, text: () => "Air drag", col: "#fb7185" }],
    cam: { pos: new T.Vector3(4, 2.8, 6.5), target: new T.Vector3(0, .5, 0), fitW: 3.2 },
    update(R, dt, t) { const v = R.ok ? 14 : 4 * R.frac; wheels.forEach(w => w.rotation.z -= v / .27 * dt); car.position.y = Math.sin(t * 13) * .004;
      aF.userData.set(new T.Vector3(-1.5, .3, .9), new T.Vector3(1, 0, 0), 1.1 * Math.min(2, R.margin)); aD.userData.set(new T.Vector3(3, .6, 0), new T.Vector3(-1, 0, 0), 1.1); return v; } };
};

/* solar water heater: glazed collector, tank, outdoor shower */
B.solarheater = (R, st) => {
  const root = new T.Group(), A = Math.max(.5, R.role("area", 3)), pw = Math.sqrt(A) * 1.25, ph = A / pw;
  const frameM = new T.MeshStandardMaterial({ color: 0x9ca3af, metalness: .6, roughness: .35 });
  const col = new T.Group(); col.position.set(0, .7, 0); col.rotation.z = .6; root.add(col);
  const box = M(new T.BoxGeometry(ph, .12, pw), new T.MeshStandardMaterial({ color: 0x1f2937, roughness: .6 })); col.add(box);
  for (let i = 0; i < 8; i++) { const tb = M(new T.CylinderGeometry(.025, .025, ph * .92, 8), new T.MeshStandardMaterial({ color: 0xb87333, metalness: .9, roughness: .3 })); tb.rotation.z = Math.PI / 2; tb.position.set(0, .07, (i / 7 - .5) * pw * .85); col.add(tb); }
  const glass = M(new T.BoxGeometry(ph, .02, pw), new T.MeshPhysicalMaterial({ color: 0x9ccbea, roughness: .02, transparent: true, opacity: .35, clearcoat: 1 }), false); glass.position.y = .09; col.add(glass);
  [-1, 1].forEach(sd => { const leg = M(new T.BoxGeometry(.06, 1.4, .06), frameM); leg.position.set(ph * .3, .55, sd * pw * .45); root.add(leg); });
  const topY = .7 + Math.sin(.6) * ph / 2 + .5, tank = M(new T.CapsuleGeometry(.32, pw * .8, 8, 20), MAT.white()); tank.rotation.x = Math.PI / 2; tank.position.set(-Math.cos(.6) * ph / 2 - .1, topY, 0); root.add(tank);
  const pipe = M(new T.TubeGeometry(new T.CatmullRomCurve3([tank.position.clone().add(new T.Vector3(-.2, -.2, pw * .3)), new T.Vector3(tank.position.x - .6, .25, pw * .4), new T.Vector3(-2.2, .25, pw * .4), new T.Vector3(-2.4, 2.1, pw * .4)]), 40, .04, 8), frameM); root.add(pipe);
  const pole = M(new T.CylinderGeometry(.04, .04, 2.2, 10), frameM); pole.position.set(-2.45, 1.1, pw * .4); root.add(pole);
  const head = M(new T.CylinderGeometry(.18, .12, .08, 24), MAT.metal()); head.position.set(-2.25, 2.12, pw * .4); root.add(head);
  const drops = particles(120, 0xbfe3ff, .06, { opacity: .85 }); root.add(drops); const steam = particles(40, 0xffffff, .2, { opacity: .25 }); root.add(steam);
  const mk = { source: col, converter: tank, load: head, losses: marker(col, 0, .4, 0), body: marker(root, 0, 1.2, 0) };
  return { root, anchors: mk, follow: null, ground: "grass", labels: [{ obj: marker(col, 0, .5, 0), text: () => "Sun heats the water", col: "#fbbf24" }, { obj: marker(head, 0, -.4, 0), text: () => "Warm shower", col: "#22d3ee" }],
    cam: { pos: new T.Vector3(1.6, 3.2, 6.8), target: new T.Vector3(-.8, 1.2, 0), fitW: 3.2 },
    update(R, dt, t) { const on = R.ok; const q = drops.userData; for (let i = 0; i < q.n; i++) { if (q.life[i] <= 0 && on) { const a = Math.random() * 6.28, r = Math.random() * .14; q.pos[i * 3] = -2.25 + Math.cos(a) * r; q.pos[i * 3 + 1] = 2.05; q.pos[i * 3 + 2] = pw * .4 + Math.sin(a) * r; q.life[i] = .55; }
        if (q.life[i] > 0) { q.life[i] -= dt; q.pos[i * 3 + 1] -= 3.6 * dt; } else q.pos[i * 3 + 1] = -50; } drops.geometry.attributes.position.needsUpdate = true;
      const s = steam.userData; for (let i = 0; i < s.n; i++) { if (s.life[i] <= 0 && on) { s.pos[i * 3] = -2.25 + (Math.random() - .5) * .4; s.pos[i * 3 + 1] = .3; s.pos[i * 3 + 2] = pw * .4 + (Math.random() - .5) * .4; s.life[i] = 1.5; } if (s.life[i] > 0) { s.life[i] -= dt; s.pos[i * 3 + 1] += .6 * dt; } else s.pos[i * 3 + 1] = -50; } steam.geometry.attributes.position.needsUpdate = true; return 0; } };
};

/* weather balloon: latex sphere, parachute, camera box */
B.wxballoon = (R, st) => {
  const root = new T.Group(), rig = new T.Group(); root.add(rig); const Rb = Math.max(.4, R.role("size", 9) / 10);
  const latex = new T.MeshPhysicalMaterial({ color: 0xf8fafc, roughness: .35, transmission: 0, transparent: true, opacity: .92, clearcoat: .6 });
  const ball = M(new T.SphereGeometry(Rb, 48, 32), latex); ball.scale.y = 1.08; ball.position.y = 4 + Rb; rig.add(ball);
  const neck = M(new T.ConeGeometry(.08, .3, 12), latex); neck.rotation.x = Math.PI; neck.position.y = 4 - .1; rig.add(neck);
  const cord = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(0, 3.85, 0), new T.Vector3(0, 1.35, 0)]), new T.LineBasicMaterial({ color: 0x334155 })); rig.add(cord);
  const chute = M(new T.SphereGeometry(.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.2), new T.MeshStandardMaterial({ color: 0xf97316, roughness: .7, side: T.DoubleSide })); chute.position.y = 1.9; chute.scale.y = .6; rig.add(chute);
  const box = M(new T.BoxGeometry(.32, .26, .32), new T.MeshStandardMaterial({ color: 0xfafafa, roughness: .9 })); box.position.y = 1.2; rig.add(box);
  const lens = M(new T.CylinderGeometry(.05, .05, .06, 16), MAT.dark()); lens.rotation.x = Math.PI / 2; lens.position.set(0, 1.2, .17); rig.add(lens);
  const [aU, aD] = arrowsKit(root, .4);
  const mk = { envelope: ball, hotair: ball, basket: box, body: marker(rig, 0, 3, 0), buoyancy: aU.userData.tip, weight: aD.userData.tip, burner: chute };
  return { root, anchors: mk, follow: null, ground: "grass", labels: [{ obj: aU.userData.tip, text: () => "Helium lift", col: "#22d3ee" }, { obj: aD.userData.tip, text: () => "Weight", col: "#fb7185" }],
    cam: { pos: new T.Vector3(3, 4.5, 8.5), target: new T.Vector3(0, 3.2, 0), fitW: 2.6 },
    update(R, dt, t) { const tgt = R.ok ? 1.2 : 0; st.alt = st.alt == null ? 0 : st.alt + (tgt - st.alt) * Math.min(1, dt); rig.position.y = st.alt + Math.sin(t * .8) * .06; rig.rotation.z = Math.sin(t * .6) * .03;
      const y = rig.position.y; aU.userData.set(new T.Vector3(Rb + .4, y + 4 + Rb, 0), UP, 1.2 * Math.min(2, R.margin)); aD.userData.set(new T.Vector3(.5, y + 1.2, 0), new T.Vector3(0, -1, 0), 1.1); return 0; } };
};

/* footbridge: a beam across a stream, people on it */
B.footbridge = (R, st) => {
  const root = new T.Group(), L = Math.max(3, R.role("span", 10)), h = Math.max(.08, R.role("height", .3)), bw = 1.4;
  const bankM = new T.MeshStandardMaterial({ color: 0x4d7c34, roughness: 1 }), soil = new T.MeshStandardMaterial({ color: 0x6b4f35, roughness: 1 });
  [-1, 1].forEach(sd => { const bank = M(new T.BoxGeometry(14, 1.6, 12), soil, true, true); bank.position.set(sd * (L / 2 + 7 - .4), .8, 0); root.add(bank); const top = M(new T.BoxGeometry(14, .06, 12), bankM, false, true); top.position.set(sd * (L / 2 + 7 - .4), 1.63, 0); root.add(top); });
  const water = M(new T.PlaneGeometry(L + 2, 40).rotateX(-Math.PI / 2), new T.MeshPhysicalMaterial({ color: 0x2f7fb5, roughness: .08, metalness: .1, clearcoat: 1, transparent: true, opacity: .92 }), false, true); water.position.y = .35; root.add(water);
  const foam = particles(80, 0xe0f2fe, .1, { opacity: .7 }); root.add(foam);
  const woodM = new T.MeshStandardMaterial({ map: TEX.wood([3, 1]), color: 0xc8a27a, roughness: .8 });
  const NS = 12, segs = []; for (let i = 0; i < NS; i++) { const s = M(new T.BoxGeometry(L / NS + .02, h, .3), woodM, true, true); root.add(s); segs.push(s); const s2 = M(new T.BoxGeometry(L / NS + .02, h, .3), woodM, true, true); root.add(s2); segs.push(s2); }
  const planks = []; for (let i = 0; i < Math.round(L / .3); i++) { const p = M(new T.BoxGeometry(.24, .05, bw), woodM, true, true); root.add(p); planks.push(p); }
  const people = []; [[-.25, 0x2563eb], [.15, 0xdb2777]].forEach(([fx, c]) => { const g = new T.Group(); const b = M(new T.CapsuleGeometry(.17, .75, 6, 12), new T.MeshStandardMaterial({ color: c, roughness: .8 })); b.position.y = .62; g.add(b); const hd = M(new T.SphereGeometry(.13, 14, 10), new T.MeshStandardMaterial({ color: 0xd9a37e })); hd.position.y = 1.3; g.add(hd); root.add(g); people.push({ g, fx }); });
  const top0 = 1.66, yAt = (x, sag) => top0 + h - sag * (1 - Math.pow(2 * x / L, 2));
  const [aL, aS1, aS2] = arrowsKit(root, .45); aS1.material && 0; const aS = arrow3(0x22d3ee, .45); root.add(aS);
  const mk = { load: aL.userData.tip, stress: segs[NS], top: marker(root, 0, top0 + h, 0), base: marker(root, -L / 2, top0, 0), cable: segs[0], body: marker(root, 0, top0 + h + .5, 0) };
  return { root, anchors: mk, follow: null, ground: "grass", labels: [{ obj: aL.userData.tip, text: () => "People's weight", col: "#fb7185" }, { obj: aS.userData.tip, text: () => "Bank pushes up", col: "#22d3ee" }],
    cam: { pos: new T.Vector3(L * .35, 4.5, L * .9 + 4), target: new T.Vector3(0, 1.8, 0), fitW: L * .62 + 1.5 },
    update(R, dt, t) { const sag = R.ok ? Math.min(.04, .02 / Math.max(.3, R.margin)) : Math.min(.9, .15 + (1 - R.frac) * .6); st.sg = st.sg == null ? sag : st.sg + (sag - st.sg) * Math.min(1, dt * 3);
      for (let i = 0; i < NS; i++) { const x = (i + .5) / NS * L - L / 2, y = yAt(x, st.sg) - h / 2, sl = -st.sg * 8 * x / (L * L); [segs[2 * i], segs[2 * i + 1]].forEach((s, k) => { s.position.set(x, y, (k ? 1 : -1) * (bw / 2 - .15)); s.rotation.z = Math.atan(sl); }); }
      planks.forEach((p, i) => { const x = (i + .5) * .3 - L / 2; p.position.set(x, yAt(x, st.sg) + .025, 0); });
      people.forEach(({ g, fx }) => { const x = fx * L + Math.sin(t * .4 + fx * 5) * .3; g.position.set(x, yAt(x, st.sg) + .05, fx < 0 ? -.2 : .25); });
      const q = foam.userData; for (let i = 0; i < q.n; i++) { if (q.life[i] <= 0) { q.pos[i * 3] = (Math.random() - .5) * L; q.pos[i * 3 + 1] = .37; q.pos[i * 3 + 2] = -18; q.life[i] = 8; } q.life[i] -= dt; q.pos[i * 3 + 2] += 4.5 * dt; } foam.geometry.attributes.position.needsUpdate = true;
      aL.userData.set(new T.Vector3(0, yAt(0, st.sg) + 2.2, .8), new T.Vector3(0, -1, 0), 1.2); aS.userData.set(new T.Vector3(-L / 2 + .3, top0 - 1.3, .9), UP, 1.1); aS1.visible = aS2.visible = false; return 0; } };
};

/* ===================== more machines (v54) ===================== */
/* a simple person: stands with feet at y=0, about 1.75 m tall */
function figure(shirt = 0x2563eb, pants = 0x1f2937) {
  const g = new T.Group(), sm = new T.MeshStandardMaterial({ color: shirt, roughness: .8 }), pm = new T.MeshStandardMaterial({ color: pants, roughness: .9 }), skin = new T.MeshStandardMaterial({ color: 0xd9a37e, roughness: .7 });
  const legs = [-1, 1].map(sd => { const l = new T.Group(); l.position.set(0, .92, sd * .1); const m = M(new T.CapsuleGeometry(.07, .74, 6, 10), pm); m.position.y = -.45; l.add(m); g.add(l); return l; });
  const torso = M(new T.CapsuleGeometry(.17, .48, 6, 12), sm); torso.position.y = 1.2; g.add(torso);
  const head = M(new T.SphereGeometry(.12, 18, 14), skin); head.position.y = 1.62; g.add(head);
  const arms = [-1, 1].map(sd => { const a = new T.Group(); a.position.set(0, 1.42, sd * .22); const m = M(new T.CapsuleGeometry(.05, .5, 6, 8), sm); m.position.y = -.3; a.add(m); g.add(a); return a; });
  g.userData = { legs, arms, head, torso }; return g;
}
function spinPts(p, dt, spawn, step) { const q = p.userData; for (let i = 0; i < q.n; i++) { if (q.life[i] <= 0) spawn(q, i); if (q.life[i] > 0) { q.life[i] -= dt; step(q, i, dt); } else q.pos[i * 3 + 1] = -500; } p.geometry.attributes.position.needsUpdate = true; }
function kit(root, th, n) { const a = arrowsKit(root, th); a.forEach((x, i) => { if (i >= n) { x.visible = false; x.userData.set = () => {}; } }); return a; }
const hide = (q, i) => { q.pos[i * 3 + 1] = -500; };

/* jetpack: a pilot with two small jet engines on the back */
B.jetpack = (R, st) => {
  const root = new T.Group(), rig = new T.Group(); root.add(rig); const p = figure(0x0f172a, 0x111827); rig.add(p);
  p.userData.arms.forEach(a => a.rotation.x = 0); p.userData.arms.forEach((a, i) => { a.rotation.z = .9; });
  const helm = M(new T.SphereGeometry(.14, 18, 12), MAT.paint(0xf8fafc)); helm.position.y = 1.64; rig.add(helm);
  const visor = M(new T.SphereGeometry(.142, 18, 12, -.9, 1.8, 1.1, .7), new T.MeshPhysicalMaterial({ color: 0x0b1626, roughness: .05, metalness: .6 })); visor.position.y = 1.64; rig.add(visor);
  const pack = M(new T.BoxGeometry(.24, .5, .5), MAT.dark()); pack.position.set(-.27, 1.25, 0); rig.add(pack);
  const n = Math.max(1, Math.min(4, Math.round(R.role("engines", 2)))), eng = [], flames = [];
  for (let i = 0; i < n; i++) { const z = (i - (n - 1) / 2) * .26; const e = lathe([[.0, .55], [.09, .55], [.11, .45], [.11, .05], [.08, 0], [0, 0]], 28, MAT.metal()); e.position.set(-.45, .78, z); rig.add(e); eng.push(e);
    const f = M(new T.ConeGeometry(.08, .9, 18, 1, true), MAT.glow(0xff9a3c, .85), false); f.rotation.x = Math.PI; f.position.set(-.45, .3, z); rig.add(f); const f2 = M(new T.ConeGeometry(.045, .5, 14, 1, true), MAT.glow(0xbfe6ff, .9), false); f2.rotation.x = Math.PI; f2.position.set(-.45, .52, z); rig.add(f2); flames.push(f, f2); }
  const light = new T.PointLight(0xffa04a, 6, 8, 2); light.position.set(-.45, .2, 0); rig.add(light);
  const pad = M(new T.CylinderGeometry(2.2, 2.2, .08, 48), MAT.concrete([2, 2]), false, true); pad.position.y = .04; root.add(pad);
  const ringM = M(new T.TorusGeometry(1.6, .04, 8, 64).rotateX(Math.PI / 2), new T.MeshBasicMaterial({ color: 0xfacc15 }), false); ringM.position.y = .09; root.add(ringM);
  const smoke = particles(160, 0xd6d3d1, .5, { opacity: .35 }); root.add(smoke);
  const [aU, aD] = kit(root, .45, 2);
  const mk = { thrust: aU.userData.tip, weight: aD.userData.tip, engine: eng[0], body: marker(rig, 0, 1.3, 0), fuel: pack };
  return { root, anchors: mk, follow: null, ground: "grass", labels: [{ obj: aU.userData.tip, text: () => "Jet thrust", col: "#22d3ee" }, { obj: aD.userData.tip, text: () => "Weight", col: "#fb7185" }],
    cam: { pos: new T.Vector3(3.2, 2.6, 6.2), target: new T.Vector3(0, 1.9, 0), fitW: 2.8 },
    update(R, dt, t) { const ok = R.ok, tgt = ok ? 1.6 : Math.min(.25, Math.max(0, (R.frac - .7))) * .4; st.alt = st.alt == null ? 0 : st.alt + (tgt - st.alt) * Math.min(1, dt * 1.2);
      rig.position.y = st.alt + (ok ? Math.sin(t * 2.1) * .05 : 0); rig.rotation.z = ok ? Math.sin(t * 1.3) * .03 : Math.sin(t * 40) * .004;
      const k = .6 + .4 * Math.min(1.3, R.frac); flames.forEach((f, i) => { f.scale.set(1, k * (.85 + Math.random() * .3), 1); });
      p.userData.legs.forEach((l, i) => l.rotation.z = ok ? .12 * (i ? 1 : -1) * 0 + .15 : 0);
      spinPts(smoke, dt, (q, i) => { if (Math.random() < .3) { q.pos[i * 3] = -.45 + (Math.random() - .5) * .3; q.pos[i * 3 + 1] = rig.position.y + .2; q.pos[i * 3 + 2] = (Math.random() - .5) * .4; q.vel[i * 3] = (Math.random() - .5) * 1.4; q.vel[i * 3 + 2] = (Math.random() - .5) * 1.4; q.vel[i * 3 + 1] = -1.5; q.life[i] = 1.4; } else hide(q, i); },
        (q, i, dt) => { q.pos[i * 3] += q.vel[i * 3] * dt; q.pos[i * 3 + 2] += q.vel[i * 3 + 2] * dt; q.pos[i * 3 + 1] = Math.max(.1, q.pos[i * 3 + 1] + q.vel[i * 3 + 1] * dt); if (q.pos[i * 3 + 1] <= .1) { q.vel[i * 3] *= 1.04; q.vel[i * 3 + 2] *= 1.04; } });
      const y = rig.position.y; aU.userData.set(new T.Vector3(.5, y + 1.1, .5), UP, 1.1 * Math.min(2, R.margin)); aD.userData.set(new T.Vector3(.5, y + .9, -.5), new T.Vector3(0, -1, 0), 1.1); return 0; } };
};

/* airship: helium envelope, fins, gondola with propellers */
B.airship = (R, st) => {
  const root = new T.Group(), ship = new T.Group(); root.add(ship); const V = Math.max(500, R.role("size", 6000)), D = Math.cbrt(1.5 * V / Math.PI), L = 4 * D;
  const stn = []; for (let i = 0; i <= 20; i++) { const u = i / 20, r = Math.max(.02, Math.pow(Math.sin(Math.PI * Math.pow(u, .85)), .75)) * D / 2; stn.push([(.5 - u) * L, r, r, r, 0, 2]); }
  const env = M(loft(ST(stn), { S: 80, R: 48 }), new T.MeshPhysicalMaterial({ color: 0xe5e7eb, roughness: .45, clearcoat: .4 })); ship.add(env);
  const band = M(loft(ST(stn.map(s => [s[0], s[1] * 1.004, s[2] * 1.004, s[3] * 1.004, 0, 2])), { S: 80, R: 48, a0: -.25, a1: .25 }), new T.MeshStandardMaterial({ color: 0x2563eb, roughness: .5, side: T.DoubleSide })); ship.add(band);
  for (let k = 0; k < 4; k++) { const fs = new T.Shape(); fs.moveTo(0, 0); fs.lineTo(L * .14, 0); fs.lineTo(L * .05, D * .42); fs.lineTo(-L * .02, D * .42); fs.closePath(); const f = M(new T.ExtrudeGeometry(fs, { depth: D * .02, bevelEnabled: false }), MAT.paint(k % 2 ? 0x1d4ed8 : 0xdc2626));
    const holder = new T.Group(); holder.rotation.x = k * Math.PI / 2 + Math.PI / 4; holder.position.x = -L * .4; f.position.set(-L * .06, D * .18, -D * .01); holder.add(f); ship.add(holder); }
  const gon = M(new T.CapsuleGeometry(D * .09, L * .14, 8, 16), MAT.white()); gon.rotation.z = Math.PI / 2; gon.position.set(L * .05, -D / 2 - D * .06, 0); ship.add(gon);
  const win = M(new T.CapsuleGeometry(D * .092, L * .1, 8, 16, ), MAT.glass()); win.rotation.z = Math.PI / 2; win.position.copy(gon.position).add(new T.Vector3(L * .02, D * .02, 0)); win.scale.set(1, 1, 1.01); ship.add(win);
  const props = [-1, 1].map(sd => { const pr = new T.Group(); pr.position.set(L * .02, -D / 2 - D * .02, sd * D * .32); ship.add(pr); const hub = M(new T.CylinderGeometry(D * .03, D * .03, D * .12, 16), MAT.dark()); hub.rotation.z = Math.PI / 2; pr.add(hub);
    for (let b = 0; b < 3; b++) { const bl = M(new T.BoxGeometry(D * .01, D * .22, D * .03), MAT.dark()); bl.position.y = D * .11; const h = new T.Group(); h.rotation.x = b * Math.PI * 2 / 3; h.add(bl); h.position.x = -D * .07; pr.add(h); } ship.add(rod(new T.Vector3(L * .02, -D / 2 - D * .02, 0), new T.Vector3(L * .02, -D / 2 - D * .02, sd * D * .32), D * .012, MAT.metal())); return pr; });
  const mast = new T.Group(); mast.position.set(L / 2 + D * .4, 0, 0); root.add(mast); const mh = D * .9; const mm = MAT.paint(0xef4444);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => mast.add(rod(new T.Vector3(a * D * .12, 0, b * D * .12), new T.Vector3(0, mh, 0), D * .012, mm)));
  const [aU, aD] = kit(root, D * .09, 2);
  const mk = { envelope: env, hotair: env, buoyancy: aU.userData.tip, weight: aD.userData.tip, basket: gon, body: marker(ship, 0, 0, 0) };
  const lowY = D / 2 + D * .25, hiY = D * 2.2;
  return { root, anchors: mk, follow: null, ground: "grass", labels: [{ obj: aU.userData.tip, text: () => "Helium lift", col: "#22d3ee" }, { obj: aD.userData.tip, text: () => "Airship + cargo", col: "#fb7185" }],
    cam: { pos: new T.Vector3(L * .35, D * 1.6, L * 1.05), target: new T.Vector3(0, D * 1.3, 0), fitW: L * .72 },
    update(R, dt, t) { const ok = R.ok, tgt = ok ? hiY : lowY; st.y = st.y == null ? lowY : st.y + (tgt - st.y) * Math.min(1, dt * .5);
      ship.position.y = st.y + (ok ? Math.sin(t * .5) * D * .03 : 0); ship.rotation.z = ok ? Math.sin(t * .35) * .015 : -.03; props.forEach((pr, i) => pr.rotation.x += (ok ? 14 : 3) * dt * (i ? 1 : -1));
      const y = ship.position.y; aU.userData.set(new T.Vector3(-L * .15, y + D * .55, D * .55), UP, D * .5 * Math.min(2, R.margin)); aD.userData.set(new T.Vector3(L * .05, y - D * .7, D * .55), new T.Vector3(0, -1, 0), D * .5); return 0; } };
};

/* Mars helicopter: small body, four legs, two counter-rotating rotors, solar panel */
B.marsheli = (R, st) => {
  const root = new T.Group(), heli = new T.Group(); root.add(heli); const Dm = Math.max(.3, Math.min(1.6, R.role("size", 1.2))), r = Dm / 2;
  const body = M(new T.BoxGeometry(.2, .14, .16), new T.MeshStandardMaterial({ color: 0xd4af37, metalness: .9, roughness: .35 })); body.position.y = .32; heli.add(body);
  const blk = M(new T.BoxGeometry(.205, .02, .165), MAT.dark()); blk.position.y = .4; heli.add(blk);
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) => { heli.add(rod(new T.Vector3(a * .07, .28, b * .06), new T.Vector3(a * .22, .0, b * .2), .008, MAT.carbon())); const ft = M(new T.SphereGeometry(.018, 10, 8), MAT.dark()); ft.position.set(a * .22, .01, b * .2); heli.add(ft); });
  const mastH = .62; heli.add(rod(new T.Vector3(0, .39, 0), new T.Vector3(0, mastH + .14, 0), .012, MAT.metal()));
  const rotors = [.5, .6].map((y, i) => { const g = new T.Group(); g.position.y = y; heli.add(g); const hub = M(new T.CylinderGeometry(.025, .025, .03, 16), MAT.dark()); g.add(hub);
    [0, 1].forEach(k => { const bl = M(bladeGeo(r - .03, .09, .05, -8, 0x2b2e33), new T.MeshStandardMaterial({ color: 0x1f2125, roughness: .5, side: T.DoubleSide })); bl.position.y = 0; const h = new T.Group(); h.rotation.y = k * Math.PI; h.add(bl); g.add(h); }); return g; });
  const sp = M(new T.BoxGeometry(.18, .008, .1), new T.MeshPhysicalMaterial({ map: solarTex(), roughness: .2, metalness: .4 })); sp.position.y = mastH + .15; heli.add(sp);
  const disc = rotors.map((g, i) => { const d = M(new T.CircleGeometry(r, 48).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: TEX.blur(), transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide }), false); d.position.y = g.position.y; heli.add(d); return d; });
  const dust = particles(200, 0xc0734a, .06, { opacity: .55 }); root.add(dust);
  const rocks = new T.MeshStandardMaterial({ color: 0x8a4b2a, roughness: 1, flatShading: true }); for (let i = 0; i < 14; i++) { const a = i * 2.3, rr = .8 + (i % 5) * .35, s = .04 + (i % 3) * .05, k = M(new T.IcosahedronGeometry(s, 0), rocks, true, true); k.position.set(Math.cos(a) * rr, s * .3, Math.sin(a) * rr); root.add(k); }
  const [aU, aD] = kit(root, .12, 2);
  const mk = { rotor: rotors[1], rotors: rotors[1], body, thrust: aU.userData.tip, lift: aU.userData.tip, weight: aD.userData.tip, battery: body, motor: marker(heli, 0, .45, 0) };
  return { root, anchors: mk, follow: null, ground: "grass", labels: [{ obj: aU.userData.tip, text: () => "Rotor lift", col: "#22d3ee" }, { obj: aD.userData.tip, text: () => "Weight on Mars", col: "#fb7185" }],
    cam: { pos: new T.Vector3(1.4, 1.1, 2.4), target: new T.Vector3(0, .55, 0), fitW: Math.max(1.3, Dm * 1.3) },
    update(R, dt, t) { const ok = R.ok, spin = ok ? 1 : Math.max(.15, R.frac); const tgt = ok ? .9 : 0; st.alt = st.alt == null ? 0 : st.alt + (tgt - st.alt) * Math.min(1, dt * .9); heli.position.y = st.alt + (ok ? Math.sin(t * 2) * .02 : 0);
      rotors[0].rotation.y += 50 * spin * dt; rotors[1].rotation.y -= 50 * spin * dt; disc.forEach(d => d.material.opacity = .35 * spin);
      spinPts(dust, dt, (q, i) => { if (ok && st.alt < .7 && Math.random() < .4) { const a = Math.random() * 6.28; q.pos[i * 3] = Math.cos(a) * .2; q.pos[i * 3 + 1] = .03; q.pos[i * 3 + 2] = Math.sin(a) * .2; q.vel[i * 3] = Math.cos(a) * 1.2; q.vel[i * 3 + 2] = Math.sin(a) * 1.2; q.life[i] = 1; } else hide(q, i); },
        (q, i, dt) => { q.pos[i * 3] += q.vel[i * 3] * dt; q.pos[i * 3 + 2] += q.vel[i * 3 + 2] * dt; q.pos[i * 3 + 1] += .15 * dt; });
      const y = heli.position.y; aU.userData.set(new T.Vector3(r + .15, y + .55, 0), UP, .35 * Math.min(2, R.margin)); aD.userData.set(new T.Vector3(-r - .15, y + .4, 0), new T.Vector3(0, -1, 0), .35); return 0; } };
};

/* paper airplane: folded dart thrown from a hand, glides to a target line */
B.paperplane = (R, st) => {
  const root = new T.Group(), plane = new T.Group(); root.add(plane);
  const pts = [[.45, 0, 0], [-.3, .02, .32], [-.3, .02, .02], [-.3, -.09, 0], [-.3, .02, -.02], [-.3, .02, -.32]];
  const v = pts.map(p => new T.Vector3(...p)), tri = [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 5]], pos = []; tri.forEach(f => f.forEach(k => pos.push(v[k].x, v[k].y, v[k].z)));
  const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  plane.add(M(g, new T.MeshStandardMaterial({ color: 0xf8fafc, roughness: .9, side: T.DoubleSide }))); plane.scale.setScalar(2.6);
  const ink = M(new T.PlaneGeometry(.14, .06), new T.MeshBasicMaterial({ color: 0xef4444, side: T.DoubleSide }), false); ink.rotation.x = -Math.PI / 2; ink.position.set(-.12, .025, .15); plane.add(ink);
  const kid = figure(0x16a34a, 0x1e3a8a); kid.position.set(-1, 0, .6); root.add(kid); kid.userData.arms[1].rotation.z = 2.3;
  const tgtD = Math.max(5, R.role("target", 20)); const flag = new T.Group(); flag.position.set(tgtD, 0, 0); root.add(flag);
  flag.add(rod(new T.Vector3(0, 0, -2), new T.Vector3(0, 0, 2), .03, new T.MeshBasicMaterial({ color: 0xffffff }))); const pole = M(new T.CylinderGeometry(.03, .03, 1.6, 8), MAT.metal()); pole.position.set(0, .8, -2); flag.add(pole);
  const cloth = M(new T.PlaneGeometry(.6, .4), new T.MeshStandardMaterial({ color: 0xf43f5e, side: T.DoubleSide })); cloth.position.set(.3, 1.4, -2); flag.add(cloth);
  for (let m = 5; m < tgtD; m += 5) { const tick = M(new T.PlaneGeometry(.08, 1.2).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .6 }), false, false); tick.position.set(m, .02, 0); root.add(tick); }
  const trail = particles(60, 0xffffff, .05, { opacity: .5 }); root.add(trail);
  const pathG = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]), path = new T.Line(pathG, new T.LineDashedMaterial({ color: 0xffffff, dashSize: .4, gapSize: .3, transparent: true, opacity: .8 })); root.add(path);
  const landM = M(new T.RingGeometry(.25, .4, 32).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0x22d3ee, side: T.DoubleSide }), false); root.add(landM);
  const [aL, aW] = kit(root, .25, 2);
  const mk = { wing: plane, airfoil: plane, body: plane, lift: aL.userData.tip, weight: aW.userData.tip, goal: marker(flag, 0, 1.8, -2), drag: aW.userData.tip };
  return { root, anchors: mk, follow: null, ground: "open", labels: [{ obj: marker(flag, 0, 2, -2), text: () => "Goal " + Math.round(tgtD) + " m", col: "#fbbf24" }],
    cam: { pos: new T.Vector3(tgtD * .35, 2.6, tgtD * .5 + 3), target: new T.Vector3(tgtD * .4, 1.2, 0), fitW: tgtD * .5 + 1.5 },
    update(R, dt, t) { const e = R.env || {}, h = Math.max(1, +e.h || 2), LD = Math.max(1, +e.LD || 5), dist = h * LD; st.x = (st.x == null ? 0 : st.x + dt * 6);
      const total = dist + 3; if (st.x > total) st.x = 0; const x = Math.min(st.x, dist), y = Math.max(.05, h - x / LD), climb = Math.min(1, st.x / 1.2);
      plane.position.set(x - .4, st.x < 1.2 ? 1.5 + (h - 1.5) * climb : y, .6 - x * .01); plane.rotation.z = st.x < 1.2 ? .3 : -Math.atan(1 / LD) * (x < dist ? 1 : 0); plane.rotation.x = Math.sin(t * 3) * .05;
      kid.userData.arms[1].rotation.z = st.x < .6 ? 2.6 - st.x * 2 : 1.4;
      const pp = pathG.attributes.position; pp.setXYZ(0, -.4, h, .6); pp.setXYZ(1, dist - .4, .05, .6 - dist * .01); pp.needsUpdate = true; path.computeLineDistances(); landM.position.set(dist - .4, .03, .6 - dist * .01);
      aL.userData.set(plane.position.clone().add(new T.Vector3(0, .25, 0)), UP, .6); aW.userData.set(plane.position.clone().add(new T.Vector3(0, -.25, 0)), new T.Vector3(0, -1, 0), .5); aL.visible = aW.visible = x < dist;
      spinPts(trail, dt, (q, i) => { if (x < dist && Math.random() < .25) { q.pos[i * 3] = plane.position.x - .4; q.pos[i * 3 + 1] = plane.position.y; q.pos[i * 3 + 2] = plane.position.z; q.life[i] = .7; } else hide(q, i); }, () => {}); return 0; } };
};

/* water rocket: plastic bottle with fins on a launch tube, pump hose, water jet */
B.waterrocket = (R, st) => {
  const root = new T.Group(), rk = new T.Group(); root.add(rk);
  const plast = new T.MeshPhysicalMaterial({ color: 0xdbeafe, roughness: .05, transmission: 0, transparent: true, opacity: .45, clearcoat: 1, side: T.DoubleSide, depthWrite: false });
  const prof = [[.02, 0], [.04, .02], [.05, .08], [.11, .2], [.11, .5], [.11, .62], [.1, .7]].map(([r, y]) => new T.Vector2(r, y)); const bottle = new T.Mesh(new T.LatheGeometry(prof, 40), plast); rk.add(bottle);
  const nose = lathe([[.1, .7], [.09, .8], [.05, .9], [0, .95]], 32, MAT.paint(0xef4444)); rk.add(nose);
  const fill = Math.max(.15, Math.min(.9, R.role("water", .33))); const water = M(new T.CylinderGeometry(.104, .104, .46 * fill, 32), new T.MeshPhysicalMaterial({ color: 0x38bdf8, roughness: .05, transparent: true, opacity: .8 }), false); water.position.y = .1 + .23 * fill; rk.add(water);
  for (let k = 0; k < 3; k++) { const fs = new T.Shape(); fs.moveTo(0, 0); fs.lineTo(.13, -.05); fs.lineTo(.13, .05); fs.lineTo(0, .22); fs.closePath(); const f = M(new T.ExtrudeGeometry(fs, { depth: .006, bevelEnabled: false }), MAT.paint(0xf59e0b)); const h = new T.Group(); h.rotation.y = k * Math.PI * 2 / 3; f.position.set(.1, .02, -.003); h.add(f); rk.add(h); }
  rk.scale.setScalar(2.2); rk.position.y = .35;
  const base = M(new T.BoxGeometry(.9, .06, .9), new T.MeshStandardMaterial({ map: TEX.wood([1, 1]), roughness: .7 })); base.position.y = .03; root.add(base);
  const tubeL = M(new T.CylinderGeometry(.03, .03, .45, 12), MAT.white()); tubeL.position.y = .25; root.add(tubeL);
  [[1, 0], [-.5, .87], [-.5, -.87]].forEach(([a, b]) => root.add(rod(new T.Vector3(a * .38, .05, b * .38), new T.Vector3(a * .12, .45, b * .12), .012, MAT.metal())));
  root.add(tube([[0, .1, 0], [.6, .05, .4], [1.4, .03, .5], [1.9, .05, .2]], .02, MAT.rubber()));
  const pump = new T.Group(); pump.position.set(2, 0, .2); root.add(pump); const bar = M(new T.CylinderGeometry(.05, .05, .7, 16), MAT.paint(0x2563eb)); bar.position.y = .4; pump.add(bar); const hd = M(new T.BoxGeometry(.06, .04, .4), MAT.dark()); hd.position.y = .8; pump.add(hd);
  const gauge = M(new T.CylinderGeometry(.07, .07, .02, 24), MAT.white()); gauge.rotation.x = Math.PI / 2; gauge.position.set(0, .55, .06); pump.add(gauge);
  const jet = particles(260, 0x7dd3fc, .07, { opacity: .85 }); root.add(jet);
  const Hm = Math.max(1, R.role("height", 20));
  const [aT, aG] = kit(root, .25, 2);
  const mk = { tank: rk, body: marker(rk, 0, .5, 0), engine: marker(rk, 0, 0, 0), thrust: aT.userData.tip, gravity: aG.userData.tip, goal: marker(root, 0, 6, 0), drag: aG.userData.tip };
  return { root, anchors: mk, follow: null, ground: "grass", labels: [{ obj: aT.userData.tip, text: () => "Water jet push", col: "#22d3ee" }, { obj: aG.userData.tip, text: () => "Gravity", col: "#fb7185" }],
    cam: { pos: new T.Vector3(4.2, 3.2, 8.5), target: new T.Vector3(.4, 3.6, 0), fitW: 4.6 },
    update(R, dt, t) { const per = 6; st.c = ((st.c == null ? 0 : st.c) + dt) % per; const c = st.c, boost = .35, top = Math.min(8, 1 + Hm * .14), vUp = Math.sqrt(2 * 9.81 * top);
      let y = .35, firing = false; if (c > 1.5) { const tt = c - 1.5; if (tt < boost) { y = .35 + .5 * (vUp / boost) * tt * tt; firing = true; } else { const t2 = tt - boost; y = .35 + .5 * vUp * boost + vUp * t2 - 4.9 * t2 * t2; } if (y < .35) y = .35; }
      rk.position.y = y; rk.rotation.z = y > 2 && c > 1.5 + boost + vUp / 9.81 ? Math.PI * Math.min(1, (c - 1.5 - boost - vUp / 9.81) * 2) : 0;
      bar.position.y = c < 1.5 ? .4 + Math.abs(Math.sin(c * 6)) * .15 : .4; hd.position.y = bar.position.y + .4;
      spinPts(jet, dt, (q, i) => { if (firing && Math.random() < .9) { q.pos[i * 3] = (Math.random() - .5) * .05; q.pos[i * 3 + 1] = y; q.pos[i * 3 + 2] = (Math.random() - .5) * .05; q.vel[i * 3] = (Math.random() - .5) * 1.5; q.vel[i * 3 + 1] = -6 - Math.random() * 3; q.vel[i * 3 + 2] = (Math.random() - .5) * 1.5; q.life[i] = .6; } else hide(q, i); },
        (q, i, dt) => { q.vel[i * 3 + 1] -= 9.8 * dt; q.pos[i * 3] += q.vel[i * 3] * dt; q.pos[i * 3 + 1] = Math.max(.02, q.pos[i * 3 + 1] + q.vel[i * 3 + 1] * dt); q.pos[i * 3 + 2] += q.vel[i * 3 + 2] * dt; });
      aT.userData.set(new T.Vector3(.7, Math.min(y, 6) + .8, 0), UP, .8 * Math.min(2, R.margin)); aG.userData.set(new T.Vector3(-.7, Math.min(y, 6) + 1.2, 0), new T.Vector3(0, -1, 0), .7); return 0; } };
};

/* canopy: a paraglider soaring on a ridge, or a round parachute coming down */
B.canopy = (R, st) => {
  const root = new T.Group(), kind = (R.sc.kind || "").includes("chute") ? "chute" : "para", rig = new T.Group(); root.add(rig);
  const pilot = figure(0xf97316, 0x1f2937); pilot.position.y = -1.75; rig.add(pilot); const helm = M(new T.SphereGeometry(.135, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.paint(0xfacc15)); helm.position.y = -1.75 + 1.63; rig.add(helm);
  const lineM = new T.LineBasicMaterial({ color: 0x374151, transparent: true, opacity: .7 }), lines = new T.Group(); rig.add(lines); let canopy, sz;
  if (kind === "chute") { const Dm = Math.max(2, Math.min(12, R.role("size", 7))); sz = Dm; const g = new T.SphereGeometry(Dm / 2, 48, 18, 0, Math.PI * 2, 0, Math.PI / 2.4); const col = []; const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); const k = Math.floor((a + Math.PI) / (Math.PI / 6)) % 2; col.push(...(k ? [.95, .3, .2] : [.97, .97, .95])); } g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
    canopy = M(g, VC(new T.MeshStandardMaterial({ roughness: .7, side: T.DoubleSide }))); canopy.scale.y = .55; canopy.position.y = Dm * .55 + 1; rig.add(canopy);
    const pts = []; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; pts.push(new T.Vector3(0, -.3, 0), new T.Vector3(Math.cos(a) * Dm / 2 * .97, canopy.position.y + Dm * .12, Math.sin(a) * Dm / 2 * .97)); } lines.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(pts), lineM)); }
  else { const S = Math.max(15, Math.min(35, R.role("size", 25))); const span = Math.sqrt(S * 5.2), ch = S / span; sz = span; const NI = 6, NJ = 36, pos = [], idx = [], Rr = span * .62;
    for (let j = 0; j <= NJ; j++) for (let i = 0; i <= NI; i++) { const a = (-55 + 110 * j / NJ) * Math.PI / 180, x = (i / NI - .4) * ch * (1 - Math.pow(Math.abs(j / NJ - .5) * 2, 3) * .5); pos.push(x, Math.cos(a) * Rr - Rr * .55 + 5.5, Math.sin(a) * Rr); }
    for (let j = 0; j < NJ; j++) for (let i = 0; i < NI; i++) { const a = j * (NI + 1) + i, b = a + NI + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); const col = []; for (let j = 0; j <= NJ; j++) for (let i = 0; i <= NI; i++) { const k = Math.floor(j / 6) % 3; col.push(...[[.13, .55, .95], [.98, .8, .2], [.95, .3, .45]][k]); } g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
    canopy = M(g, VC(new T.MeshStandardMaterial({ roughness: .6, side: T.DoubleSide }))); rig.add(canopy);
    const pts = []; for (let j = 0; j <= NJ; j += 3) { const a = (-55 + 110 * j / NJ) * Math.PI / 180; pts.push(new T.Vector3(0, -.4, 0), new T.Vector3(0, Math.cos(a) * Rr - Rr * .55 + 5.5, Math.sin(a) * Rr)); } lines.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(pts), lineM));
    const hill = new T.Mesh(new T.CylinderGeometry(18, 46, 26, 48, 1).translate(0, 13, 0), new T.MeshStandardMaterial({ map: TEX.grass([8, 4]), roughness: 1 })); hill.receiveShadow = true; hill.position.set(-44, -2, -10); root.add(hill); }
  const air = particles(140, 0xffffff, .12, { opacity: .45 }); root.add(air);
  const [aU, aD] = kit(root, .4, 2);
  const mk = { wing: canopy, airfoil: canopy, envelope: canopy, body: marker(rig, 0, -1, 0), lift: aU.userData.tip, drag: aU.userData.tip, weight: aD.userData.tip, buoyancy: aU.userData.tip };
  const chute = kind === "chute";
  return { root, anchors: mk, follow: null, ground: "grass", labels: [{ obj: aU.userData.tip, text: () => chute ? "Air drag" : "Rising air", col: "#22d3ee" }, { obj: aD.userData.tip, text: () => "Weight", col: "#fb7185" }],
    cam: chute ? { pos: new T.Vector3(sz * 1.2 + 4, sz * .9 + 6, sz * 1.6 + 8), target: new T.Vector3(0, sz * .5 + 4, 0), fitW: sz * 1.1 + 4 } : { pos: new T.Vector3(6, 22, 26), target: new T.Vector3(0, 18, 0), fitW: sz * 1.1 },
    update(R, dt, t) { const ok = R.ok; if (chute) { const e = R.env || {}, vd = Math.max(1, Math.min(25, R.role("speed", 6))), top = sz * .5 + 16; st.y = st.y == null ? top : st.y - vd * .35 * dt; if (st.y < 1.75) { st.land = (st.land || 0) + dt; st.y = 1.75; if (st.land > 1.6) { st.y = top; st.land = 0; } }
        rig.position.y = st.y; rig.rotation.z = Math.sin(t * .8) * .03; pilot.rotation.z = st.land && !ok ? -Math.min(1.4, st.land * 2.5) : 0; pilot.position.x = st.land && !ok ? Math.min(.8, st.land) : 0; canopy.scale.y = .55 + Math.sin(t * 2.2) * .02; }
      else { const tgt = ok ? 18 : 4; st.y = st.y == null ? 18 : st.y + (tgt - st.y) * Math.min(1, dt * .25); rig.position.set(Math.sin(t * .18) * 6, st.y + Math.sin(t * .6) * .3, 0); rig.rotation.y = Math.PI / 2 + Math.cos(t * .18) * .25; rig.rotation.z = Math.sin(t * .18) * .12; }
      spinPts(air, dt, (q, i) => { if (Math.random() < .2) { q.pos[i * 3] = (Math.random() - .5) * 26; q.pos[i * 3 + 1] = chute ? rig.position.y - 6 : 2 + Math.random() * 6; q.pos[i * 3 + 2] = (Math.random() - .5) * 20; q.life[i] = 3; } else hide(q, i); }, (q, i, dt) => { q.pos[i * 3 + 1] += (chute ? 4 : 2.5) * dt; });
      const y = rig.position.y; aU.userData.set(new T.Vector3(rig.position.x + 1.2, y + (chute ? sz * .55 + 1.6 : 3), 0), UP, 1.6 * Math.min(2, R.margin)); aD.userData.set(new T.Vector3(rig.position.x + .8, y - 1.2, 0), new T.Vector3(0, -1, 0), 1.6); return 0; } };
};

/* solar sail: square mirror sail on diagonal booms, sunlight pushing it, in space */
B.solarsail = (R, st) => {
  const root = new T.Group(), craft = new T.Group(); root.add(craft); const Ls = Math.max(3, Math.min(40, R.role("size", 10))), s = Math.min(16, 4 + Ls * .35), h = s / 2;
  const sailM = new T.MeshStandardMaterial({ color: 0xdfe7f2, metalness: .75, roughness: .22, side: T.DoubleSide, emissive: 0x1c2838, envMapIntensity: 2 });
  for (let k = 0; k < 4; k++) { const sh = new T.Shape(); sh.moveTo(0, 0); sh.lineTo(h * 1.414, 0); sh.quadraticCurveTo(h * .8, h * .8 * .9, 0, h * 1.414); sh.closePath(); const q = M(new T.ShapeGeometry(sh, 12), sailM, false, false); q.rotation.z = k * Math.PI / 2 + Math.PI / 4; q.rotation.z -= Math.PI / 4; const holder = new T.Group(); holder.rotation.z = Math.PI / 4; holder.add(q); craft.add(holder); }
  [0, 1].forEach(k => { const b = M(new T.CylinderGeometry(.04, .04, s * 1.414 * .98, 8), MAT.metal()); b.rotation.z = Math.PI / 4 + k * Math.PI / 2; craft.add(b); });
  const hub = M(new T.BoxGeometry(.7, .7, .9), MAT.paint(0xd4af37)); hub.position.z = .45; craft.add(hub); const ant = M(new T.CylinderGeometry(.2, .02, .2, 20), MAT.white()); ant.rotation.x = Math.PI / 2; ant.position.z = 1; craft.add(ant);
  craft.rotation.y = -.35; craft.rotation.x = -.1;
  const ray = particles(220, 0xfff1b8, .14, { add: true, opacity: .8 }); root.add(ray);
  const sunDirV = new T.Vector3(-1, .25, .6).normalize(); const sunG = M(new T.SphereGeometry(5, 24, 16), new T.MeshBasicMaterial({ color: 0xfff4c2, fog: false }), false); sunG.position.copy(sunDirV.clone().multiplyScalar(200)); root.add(sunG);
  const halo = M(new T.SphereGeometry(9, 24, 16), MAT.glow(0xffd27a, .25), false); halo.position.copy(sunG.position); root.add(halo);
  const [aP] = kit(root, .6, 1);
  const mk = { wing: craft, source: sunG, thrust: aP.userData.tip, body: hub, load: hub, goal: aP.userData.tip, envelope: craft };
  return { root, anchors: mk, follow: null, ground: "none", labels: [{ obj: aP.userData.tip, text: () => "Light push", col: "#22d3ee" }],
    cam: { pos: new T.Vector3(s * .45, s * .3, s * 1.5), target: new T.Vector3(0, 0, 0), fitW: s * 1.05 },
    update(R, dt, t) { craft.rotation.z = t * .05; craft.position.x = Math.sin(t * .2) * .2;
      spinPts(ray, dt, (q, i) => { if (Math.random() < .5) { const u = (Math.random() - .5) * s, w = (Math.random() - .5) * s; q.pos[i * 3] = sunDirV.x * 40 + u * .7; q.pos[i * 3 + 1] = sunDirV.y * 40 + w * .7; q.pos[i * 3 + 2] = sunDirV.z * 40 + u * .4; q.life[i] = 1.6; } else hide(q, i); },
        (q, i, dt) => { q.pos[i * 3] -= sunDirV.x * 26 * dt; q.pos[i * 3 + 1] -= sunDirV.y * 26 * dt; q.pos[i * 3 + 2] -= sunDirV.z * 26 * dt; if (Math.hypot(q.pos[i * 3], q.pos[i * 3 + 1], q.pos[i * 3 + 2]) < s * .25) q.life[i] = 0; });
      aP.userData.set(new T.Vector3(0, 0, -.5), new T.Vector3(.4, -.1, -1).normalize(), s * .25 * Math.min(2, R.margin)); return 0; } };
};

/* Moon rover: six wheels, solar deck, mast camera, on grey regolith with craters */
B.rover = (R, st) => {
  const root = new T.Group(), rv = new T.Group(); root.add(rv); const A = Math.max(.2, Math.min(4, R.role("area", 1)));
  const regT = ctex("regolith", 512, 512, (x, w, h) => { x.fillStyle = "#8d8c88"; x.fillRect(0, 0, w, h); noise(x, w, h, ["#7a7975", "#a3a29d", "#6b6a66", "#b5b4af"], 30000, 1.8); for (let i = 0; i < 40; i++) { const cx = rnd() * w, cy = rnd() * h, r = 4 + rnd() * 26; const g = x.createRadialGradient(cx, cy, r * .5, cx, cy, r); g.addColorStop(0, "rgba(60,60,58,.35)"); g.addColorStop(.85, "rgba(190,190,185,.3)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); } }, [60, 60]);
  const gGeo = new T.PlaneGeometry(400, 400, 160, 160).rotateX(-Math.PI / 2), gp = gGeo.attributes.position; for (let i = 0; i < gp.count; i++) { const x = gp.getX(i), z = gp.getZ(i); let y = fbm(x * .05, z * .05, 4) * .8 - .4; [[12, -14, 5], [-18, -8, 7], [25, 10, 9], [-9, 18, 4]].forEach(([cx, cz, r]) => { const d = Math.hypot(x - cx, z - cz) / r; if (d < 1) y -= (1 - d * d) * r * .25; else if (d < 1.4) y += (1.4 - d) * r * .12; }); if (Math.abs(z) < 3) y *= .2; gp.setY(i, y); } gGeo.computeVertexNormals();
  const moon = M(gGeo, new T.MeshStandardMaterial({ map: regT, bumpMap: regT, bumpScale: 1.5, roughness: 1 }), false, true); root.add(moon);
  const body = M(new T.BoxGeometry(1.6, .35, 1), new T.MeshStandardMaterial({ color: 0xd1d5db, metalness: .6, roughness: .4 })); body.position.y = .75; rv.add(body);
  const foil = M(new T.BoxGeometry(1.4, .3, .9), new T.MeshStandardMaterial({ color: 0xd4af37, metalness: .9, roughness: .3 })); foil.position.y = .55; rv.add(foil);
  const pw = Math.sqrt(A * 1.6), pd = A / pw; const deck = M(new T.BoxGeometry(pw, .03, pd), new T.MeshPhysicalMaterial({ map: solarTex(), roughness: .2, metalness: .4, clearcoat: 1 })); deck.position.y = 1.0; rv.add(deck);
  const wheels = []; [-.7, 0, .7].forEach(x => [-1, 1].forEach(sd => { const w = M(new T.CylinderGeometry(.24, .24, .16, 24).rotateX(Math.PI / 2), new T.MeshStandardMaterial({ color: 0x9ca3af, metalness: .7, roughness: .5, wireframe: false })); w.position.set(x, .24, sd * .62); rv.add(w); wheels.push(w);
    const grouser = M(new T.TorusGeometry(.24, .02, 6, 24), MAT.dark()); grouser.position.copy(w.position); grouser.position.z += sd * .08; rv.add(grouser); wheels.push(grouser); rv.add(rod(new T.Vector3(x, .5, sd * .45), new T.Vector3(x, .26, sd * .55), .03, MAT.metal())); }));
  rv.add(rod(new T.Vector3(.6, .9, .3), new T.Vector3(.6, 1.7, .3), .03, MAT.metal())); const camH = M(new T.BoxGeometry(.22, .14, .3), MAT.white()); camH.position.set(.6, 1.75, .3); rv.add(camH);
  [-1, 1].forEach(sd => { const l = M(new T.CylinderGeometry(.04, .04, .04, 16), MAT.glass()); l.rotation.z = Math.PI / 2; l.position.set(.72, 1.76, .3 + sd * .07); rv.add(l); });
  const dish = M(new T.SphereGeometry(.28, 20, 10, 0, Math.PI * 2, 0, Math.PI / 3), MAT.white()); dish.position.set(-.55, 1.35, -.25); dish.rotation.z = .6; rv.add(dish); rv.add(rod(new T.Vector3(-.55, .92, -.25), new T.Vector3(-.55, 1.3, -.25), .025, MAT.metal()));
  const dust = particles(120, 0xb8b7b2, .08, { opacity: .5 }); root.add(dust);
  const [aP, aR] = kit(root, .3, 2);
  const mk = { source: deck, battery: foil, motor: wheels[0], wheels: wheels[4], body: marker(rv, 0, 1.2, 0), drag: aR.userData.tip, goal: aP.userData.tip, speed: marker(rv, 0, 1.8, 0) };
  return { root, anchors: mk, follow: null, ground: "none", labels: [{ obj: marker(deck, 0, .15, 0), text: () => "Sunlight → power", col: "#fbbf24" }, { obj: aR.userData.tip, text: () => "Soft dust holds it back", col: "#fb7185" }],
    cam: { pos: new T.Vector3(3.6, 2.6, 5), target: new T.Vector3(0, .8, 0), fitW: 3.4 },
    update(R, dt, t) { const v = R.ok ? 1 : Math.max(.1, R.frac * .5); st.o = (st.o || 0) + v * dt * .02; regT.offset.x = st.o * 60 / 400 * 60; moon.position.x = 0; wheels.forEach(w => w.rotation.z -= v * 2.2 * dt); rv.position.y = Math.sin(t * 5) * .006;
      regT.offset.x = (st.o * 6) % 1; spinPts(dust, dt, (q, i) => { if (Math.random() < .25 * v) { q.pos[i * 3] = -.8 + (Math.random() - .5) * .3; q.pos[i * 3 + 1] = .08; q.pos[i * 3 + 2] = (Math.random() > .5 ? 1 : -1) * .62; q.vel[i * 3] = -.6; q.vel[i * 3 + 1] = .6 + Math.random() * .5; q.life[i] = 1.2; } else hide(q, i); }, (q, i, dt) => { q.vel[i * 3 + 1] -= 1.62 * dt; q.pos[i * 3] += q.vel[i * 3] * dt; q.pos[i * 3 + 1] = Math.max(.02, q.pos[i * 3 + 1] + q.vel[i * 3 + 1] * dt); });
      aP.userData.set(new T.Vector3(1, .5, .9), new T.Vector3(1, 0, 0), .7 * Math.min(2, R.margin)); aR.userData.set(new T.Vector3(-1.1, .4, .9), new T.Vector3(-1, 0, 0), .7); return 0; } };
};

/* electric bike: rider on a bike with a frame battery and hub motor, riding along a road */
B.ebike = (R, st) => {
  const root = new T.Group(), bike = buildBike(true); bike.scale.setScalar(1.5); root.add(bike);
  const bat = M(new T.BoxGeometry(.42, .1, .09), MAT.dark()); bat.position.set(-.05, .66, 0); bat.rotation.z = -.95; bike.add(bat); const stripe = M(new T.BoxGeometry(.3, .02, .092), new T.MeshBasicMaterial({ color: 0x22c55e })); stripe.position.copy(bat.position); stripe.rotation.z = -.95; bike.add(stripe);
  const hub = M(new T.CylinderGeometry(.08, .08, .09, 24).rotateX(Math.PI / 2), MAT.metal()); hub.position.set(-.55, .35, 0); bike.add(hub);
  const [aF, aD] = kit(root, .4, 2);
  const mk = { battery: bat, motor: hub, wheels: marker(bike, .55, .35, 0), body: marker(bike, 0, 1.3, 0), drag: aD.userData.tip, goal: aF.userData.tip, speed: marker(bike, 0, 1.9, 0) };
  return { root, anchors: mk, follow: null, ground: "road", moving: true, labels: [{ obj: aF.userData.tip, text: () => "Motor + legs", col: "#22d3ee" }, { obj: aD.userData.tip, text: () => "Air + rolling drag", col: "#fb7185" }],
    cam: { pos: new T.Vector3(2.4, 2, 4.6), target: new T.Vector3(0, 1.1, 0), fitW: 2.4 },
    update(R, dt, t) { const v = R.ok ? 7 : 3 * R.frac + 1; st.a = (st.a || 0) + v * dt * .9; pedal(bike, st.a); bike.userData.wheels.forEach(w => w.rotation.z -= v / .5 * dt); bike.position.y = Math.sin(t * 9) * .003;
      aF.userData.set(new T.Vector3(1.1, .55, .55), new T.Vector3(1, 0, 0), .8 * Math.min(2, R.margin)); aD.userData.set(new T.Vector3(1.9, 1.2, .55), new T.Vector3(-1, 0, 0), .7); return v; } };
};

/* hydrofoil board: rider on a board lifted above the water by an underwater wing */
B.hydrofoil = (R, st) => {
  const root = new T.Group(), rig = new T.Group(); root.add(rig);
  const board = M(loft(ST([[.75, .02, .02, .02, 0, 2], [.55, .28, .05, .04, 0, 3], [-.4, .3, .05, .04, 0, 4], [-.7, .26, .05, .04, 0, 4]]), { S: 30, R: 24 }), MAT.paint(0x0ea5e9)); rig.add(board);
  const mast = M(new T.BoxGeometry(.12, .85, .02), MAT.carbon()); mast.position.set(-.15, -.45, 0); rig.add(mast);
  const fus = M(new T.CylinderGeometry(.02, .02, .7, 10), MAT.carbon()); fus.rotation.z = Math.PI / 2; fus.position.set(-.1, -.88, 0); rig.add(fus);
  const A = Math.max(.05, R.role("area", .15)), span = Math.sqrt(A * 6); const fw = M(airfoil({ span: span / 2, root: A / span * 1.3, tip: A / span * .5, th: .12, cam: .04, S: 10, C: 10 }), MAT.carbon()); fw.position.set(.15, -.88, 0); rig.add(fw); const fw2 = M(airfoil({ span: span / 2, root: A / span * 1.3, tip: A / span * .5, th: .12, cam: .04, S: 10, C: 10, dir: -1 }), MAT.carbon()); fw2.position.copy(fw.position); rig.add(fw2);
  const tail = M(new T.BoxGeometry(.1, .01, .32), MAT.carbon()); tail.position.set(-.42, -.88, 0); rig.add(tail);
  const pod = M(new T.CapsuleGeometry(.04, .14, 6, 12), MAT.dark()); pod.rotation.z = Math.PI / 2; pod.position.set(-.1, -.88, 0); rig.add(pod); const prop = M(new T.TorusGeometry(.05, .012, 6, 16), MAT.metal()); prop.rotation.y = Math.PI / 2; prop.position.set(-.22, -.88, 0); rig.add(prop);
  const p = figure(0xf43f5e, 0x111827); p.position.set(0, .05, 0); p.rotation.y = Math.PI / 2; p.userData.legs.forEach((l, i) => { l.rotation.x = (i ? -1 : 1) * .35; }); p.userData.arms.forEach((a, i) => a.rotation.x = (i ? -1 : 1) * .7); rig.add(p);
  const spray = particles(160, 0xffffff, .09, { opacity: .8 }); root.add(spray);
  const [aL, aW] = kit(root, .35, 2);
  const mk = { wing: fw, airfoil: fw, hull: board, lift: aL.userData.tip, weight: aW.userData.tip, body: marker(rig, 0, 1, 0), motor: pod, drag: aW.userData.tip };
  return { root, anchors: mk, follow: null, ground: "water", water: true, labels: [{ obj: aL.userData.tip, text: () => "Foil lift", col: "#22d3ee" }, { obj: aW.userData.tip, text: () => "Rider + board", col: "#fb7185" }],
    cam: { pos: new T.Vector3(2.4, 1.6, 4.2), target: new T.Vector3(0, .5, 0), fitW: 2.4 },
    update(R, dt, t) { const ok = R.ok, tgt = ok ? .75 : -.05; st.y = st.y == null ? tgt : st.y + (tgt - st.y) * Math.min(1, dt * 1.5); rig.position.y = st.y + (ok ? Math.sin(t * 1.7) * .03 : waveH(0, 0, t) * .4); rig.rotation.z = ok ? .04 : (waveH(1, 0, t) - waveH(-1, 0, t)) * .1; prop.rotation.x += 30 * dt;
      spinPts(spray, dt, (q, i) => { if (Math.random() < .5) { const x = ok ? -.15 : .6; q.pos[i * 3] = x; q.pos[i * 3 + 1] = .05; q.pos[i * 3 + 2] = (Math.random() - .5) * .2; q.vel[i * 3] = -1.5 - Math.random(); q.vel[i * 3 + 1] = .6 + Math.random() * 1.2; q.vel[i * 3 + 2] = (Math.random() - .5) * 1.5; q.life[i] = .6; } else hide(q, i); },
        (q, i, dt) => { q.vel[i * 3 + 1] -= 9.8 * dt; q.pos[i * 3] += q.vel[i * 3] * dt; q.pos[i * 3 + 1] = Math.max(0, q.pos[i * 3 + 1] + q.vel[i * 3 + 1] * dt); q.pos[i * 3 + 2] += q.vel[i * 3 + 2] * dt; });
      const y = rig.position.y; aL.userData.set(new T.Vector3(.15, y - .85, .45), UP, .6 * Math.min(2, R.margin)); aW.userData.set(new T.Vector3(.4, y + 1.2, .45), new T.Vector3(0, -1, 0), .6); return ok ? 5 : 2; } };
};

/* hovercraft: round deck on a rubber skirt, leaf blower blowing air underneath, rider sitting */
B.hovercraft = (R, st) => {
  const root = new T.Group(), hc = new T.Group(); root.add(hc); const D = Math.max(.6, Math.min(3, R.role("size", 1.5))), r = D / 2;
  const skirt = M(new T.TorusGeometry(r * .93, .09, 12, 64).rotateX(Math.PI / 2), new T.MeshStandardMaterial({ color: 0x111827, roughness: .7 })); skirt.position.y = .09; hc.add(skirt);
  const deck = M(new T.CylinderGeometry(r, r, .03, 64), new T.MeshStandardMaterial({ map: TEX.wood([2, 2]), roughness: .7 })); deck.position.y = .19; hc.add(deck);
  const blower = new T.Group(); blower.position.set(-r * .55, .21, 0); hc.add(blower); const bb = M(new T.BoxGeometry(.38, .24, .2), MAT.paint(0xf97316)); bb.position.y = .12; blower.add(bb); const nz = M(new T.CylinderGeometry(.06, .06, .2, 16), MAT.dark()); nz.position.set(.1, -.02, 0); blower.add(nz);
  const p = figure(0x7c3aed, 0x1f2937); p.position.set(r * .15, .02, 0); p.userData.legs.forEach(l => { l.rotation.z = 1.45; }); p.position.y = -.58; p.userData.arms.forEach(a => a.rotation.z = .9); hc.add(p);
  const chair = M(new T.BoxGeometry(.4, .06, .45), MAT.dark()); chair.position.set(r * .1, .32, 0); hc.add(chair);
  const air = particles(220, 0xe2e8f0, .07, { opacity: .55 }); root.add(air);
  const [aU, aD] = kit(root, .3, 2);
  const mk = { hull: deck, motor: blower, body: marker(hc, 0, .8, 0), buoyancy: aU.userData.tip, lift: aU.userData.tip, weight: aD.userData.tip, load: marker(hc, 0, 1, 0) };
  return { root, anchors: mk, follow: null, ground: "grass", labels: [{ obj: aU.userData.tip, text: () => "Air cushion", col: "#22d3ee" }, { obj: aD.userData.tip, text: () => "Weight", col: "#fb7185" }],
    cam: { pos: new T.Vector3(D * .9 + 1.2, 1.6, D * 1.2 + 2), target: new T.Vector3(0, .45, 0), fitW: D * .75 + .9 },
    update(R, dt, t) { const ok = R.ok, tgt = ok ? .06 : 0; st.y = st.y == null ? 0 : st.y + (tgt - st.y) * Math.min(1, dt * 3); hc.position.y = st.y + (ok ? Math.sin(t * 6) * .004 : 0); hc.rotation.y = ok ? t * .25 : 0; hc.position.x = ok ? Math.sin(t * .4) * .3 : 0;
      spinPts(air, dt, (q, i) => { if (Math.random() < (ok ? .6 : .2)) { const a = Math.random() * 6.28; q.pos[i * 3] = hc.position.x + Math.cos(a) * r; q.pos[i * 3 + 1] = .03; q.pos[i * 3 + 2] = Math.sin(a) * r; q.vel[i * 3] = Math.cos(a) * (ok ? 1.5 : .4); q.vel[i * 3 + 2] = Math.sin(a) * (ok ? 1.5 : .4); q.life[i] = .6; } else hide(q, i); },
        (q, i, dt) => { q.pos[i * 3] += q.vel[i * 3] * dt; q.pos[i * 3 + 2] += q.vel[i * 3 + 2] * dt; q.pos[i * 3 + 1] += .1 * dt; });
      aU.userData.set(new T.Vector3(hc.position.x - r - .25, .05, 0), UP, .5 * Math.min(2, R.margin)); aD.userData.set(new T.Vector3(hc.position.x + r + .25, 1.1, 0), new T.Vector3(0, -1, 0), .5); return 0; } };
};

/* underwater drone (ROV): open frame, yellow float, thrusters, lights, tether */
B.rov = (R, st) => {
  const root = new T.Group(), rv = new T.Group(); root.add(rv); rv.position.y = 3;
  const frame = MAT.paint(0x111827); [[-.22, -.15], [.22, -.15], [-.22, .15], [.22, .15]].forEach(([x, z]) => { rv.add(rod(new T.Vector3(x, -.12, z), new T.Vector3(x, .12, z), .012, frame)); });
  [[-.12], [.12]].forEach(([y]) => { [-.15, .15].forEach(z => rv.add(rod(new T.Vector3(-.22, y, z), new T.Vector3(.22, y, z), .012, frame))); [-.22, .22].forEach(x => rv.add(rod(new T.Vector3(x, y, -.15), new T.Vector3(x, y, .15), .012, frame))); });
  const foam = M(new T.BoxGeometry(.46, .08, .34), MAT.paint(0xfacc15)); foam.position.y = .17; rv.add(foam);
  const tubeE = M(new T.CylinderGeometry(.06, .06, .3, 24), new T.MeshPhysicalMaterial({ color: 0xa5b4fc, roughness: .05, transparent: true, opacity: .5 })); tubeE.rotation.z = Math.PI / 2; rv.add(tubeE);
  const dome = M(new T.SphereGeometry(.062, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), MAT.glass()); dome.rotation.z = -Math.PI / 2; dome.position.x = .15; rv.add(dome);
  const n = Math.max(2, Math.min(4, Math.round(R.role("thrusters", 4)))), props = [];
  [[.18, .19, .6], [.18, -.19, -.6], [-.18, .19, -.6], [-.18, -.19, .6]].slice(0, n).forEach(([x, z, a]) => { const th = new T.Group(); th.position.set(x, -.02, z); th.rotation.y = a; rv.add(th); const sh = M(new T.CylinderGeometry(.045, .045, .07, 20, 1, true), new T.MeshStandardMaterial({ color: 0x1f2937, side: T.DoubleSide })); sh.rotation.z = Math.PI / 2; th.add(sh); const pr = M(new T.BoxGeometry(.005, .07, .015), MAT.metal()); th.add(pr); props.push(pr); });
  [-.1, .1].forEach(z => { const lt = M(new T.CylinderGeometry(.022, .022, .03, 14), MAT.glow(0xfff7d6, 1), false); lt.rotation.z = Math.PI / 2; lt.position.set(.23, .05, z); rv.add(lt); });
  const spot = new T.SpotLight(0xfff3c4, 8, 10, .5, .6, 1); spot.position.set(.25, .05, 0); spot.target.position.set(3, -1, 0); rv.add(spot, spot.target);
  const tg = new T.BufferGeometry().setFromPoints([...Array(20)].map(() => new T.Vector3())), tether = new T.Line(tg, new T.LineBasicMaterial({ color: 0xf97316 })); root.add(tether);
  const flow = particles(220, 0xdff6ff, .05, { opacity: .6 }); root.add(flow);
  const [aT, aD] = kit(root, .2, 2);
  const mk = { hull: tubeE, body: foam, motor: props[0] || foam, thrust: aT.userData.tip, drag: aD.userData.tip, window: dome, propeller: props[0] || foam };
  return { root, anchors: mk, follow: null, ground: "none", labels: [{ obj: aT.userData.tip, text: () => "Thrusters", col: "#22d3ee" }, { obj: aD.userData.tip, text: () => "Current pushes back", col: "#fb7185" }],
    cam: { pos: new T.Vector3(.9, 3.5, 1.6), target: new T.Vector3(0, 3, 0), fitW: 1 },
    update(R, dt, t) { const ok = R.ok, drift = ok ? 0 : (1 - R.frac) * 1.2; st.x = st.x == null ? 0 : st.x + (-drift - st.x) * Math.min(1, dt * .6); rv.position.x = st.x + Math.sin(t * .7) * .02; rv.position.y = 3 + Math.sin(t * .9) * .03; rv.rotation.y = Math.sin(t * .5) * .05; props.forEach(pr => pr.rotation.x += 40 * dt);
      const tp = tg.attributes.position; for (let i = 0; i < 20; i++) { const u = i / 19; tp.setXYZ(i, rv.position.x - .2 - u * 2.5 + Math.sin(u * 3 + t) * .05, rv.position.y + .1 + u * u * 4, Math.sin(u * 2 + t * .5) * .1); } tp.needsUpdate = true;
      spinPts(flow, dt, (q, i) => { if (Math.random() < .3) { q.pos[i * 3] = 2.5; q.pos[i * 3 + 1] = 2 + Math.random() * 2; q.pos[i * 3 + 2] = (Math.random() - .5) * 2; q.life[i] = 3; } else hide(q, i); }, (q, i, dt) => { q.pos[i * 3] -= 1.6 * dt; });
      aT.userData.set(new T.Vector3(rv.position.x + .3, rv.position.y + .35, .3), new T.Vector3(1, 0, 0), .35 * Math.min(2, R.margin)); aD.userData.set(new T.Vector3(rv.position.x + .9, rv.position.y - .3, .3), new T.Vector3(-1, 0, 0), .35); return 0; } };
};

/* tidal turbine: three-blade rotor on a tripod on the sea floor */
B.tidal = (R, st) => {
  const root = new T.Group(), Dr = Math.max(4, Math.min(26, R.role("size", 18))), r = Dr / 2, hub = r + 3;
  const base = new T.Group(); root.add(base); const steel = new T.MeshStandardMaterial({ color: 0x7a8a8f, metalness: .6, roughness: .6 });
  [0, 1, 2].forEach(k => { const a = k * Math.PI * 2 / 3; base.add(rod(new T.Vector3(Math.cos(a) * r * .7, 0, Math.sin(a) * r * .7), new T.Vector3(0, hub * .45, 0), .35, steel)); const foot = M(new T.CylinderGeometry(.9, 1.1, .6, 16), steel); foot.position.set(Math.cos(a) * r * .7, .3, Math.sin(a) * r * .7); base.add(foot); });
  const tw = M(new T.CylinderGeometry(.8, 1, hub, 24), steel); tw.position.y = hub / 2; base.add(tw);
  const nac = M(new T.CapsuleGeometry(1.1, 4, 8, 20), MAT.paint(0xf59e0b)); nac.rotation.z = Math.PI / 2; nac.position.set(-.5, hub, 0); base.add(nac);
  const rot = new T.Group(); rot.position.set(2.2, hub, 0); base.add(rot); rot.add(M(new T.SphereGeometry(1.2, 20, 16), MAT.paint(0xf59e0b)));
  for (let k = 0; k < 3; k++) { const bg = airfoil({ span: r - 1, root: 1.6, tip: .5, th: .18, cam: .03, twist: -12, S: 16, C: 10 }); bg.rotateX(-Math.PI / 2); const b = M(bg, new T.MeshStandardMaterial({ color: 0xe5e7eb, roughness: .4 })); b.position.y = 1; const h = new T.Group(); h.rotation.x = k * Math.PI * 2 / 3; h.add(b); rot.add(h); }
  const fish = particles(60, 0xffd27a, .35, { opacity: .9 }); root.add(fish); const flow = particles(300, 0xdff6ff, .2, { opacity: .5 }); root.add(flow);
  const [aF] = kit(root, 1.2, 1);
  const mk = { source: rot, converter: nac, load: nac, losses: marker(base, 0, hub + 2, 0), body: nac, wheels: rot, rotor: rot, drag: aF.userData.tip };
  return { root, anchors: mk, follow: null, ground: "none", labels: [{ obj: aF.userData.tip, text: () => "Tidal current", col: "#22d3ee" }],
    cam: { pos: new T.Vector3(Dr * 1.2 + 8, hub + 3, Dr * 1.3 + 10), target: new T.Vector3(0, hub * .8, 0), fitW: Dr * .8 + 5 },
    update(R, dt, t) { const sp = Math.max(.15, Math.min(1.5, R.role("current", 2) / 2)); rot.rotation.x += sp * 1.2 * dt * (R.ok ? 1 : .6);
      spinPts(flow, dt, (q, i) => { if (Math.random() < .3) { q.pos[i * 3] = -Dr - 8; q.pos[i * 3 + 1] = 1 + Math.random() * (hub + r); q.pos[i * 3 + 2] = (Math.random() - .5) * Dr * 1.5; q.life[i] = 6; } else hide(q, i); }, (q, i, dt) => { q.pos[i * 3] += sp * 6 * dt; });
      spinPts(fish, dt, (q, i) => { q.pos[i * 3] = -Dr - 4 - Math.random() * 6; q.pos[i * 3 + 1] = 2 + Math.random() * 4; q.pos[i * 3 + 2] = Dr * .9 + Math.random() * 3; q.life[i] = 10; }, (q, i, dt) => { q.pos[i * 3] += 2 * dt; q.pos[i * 3 + 1] += Math.sin(t * 2 + i) * dt * .3; });
      aF.userData.set(new T.Vector3(-r - 6, hub + r * .6, 0), new T.Vector3(1, 0, 0), 4 * Math.min(1.6, sp)); return 0; } };
};

/* floating solar: rows of panels on floats on a lake, cable to the shore */
B.floatsolar = (R, st) => {
  const root = new T.Group(), A = Math.max(.5, R.role("area", 5)), rows = Math.round(Math.min(16, 5 + A * .9)), cols = Math.round(Math.min(20, 7 + A)), farm = new T.Group(); root.add(farm);
  const pT = solarTex(); const pm = new T.MeshPhysicalMaterial({ map: pT, roughness: .15, metalness: .4, clearcoat: 1 }), fl = new T.MeshStandardMaterial({ color: 0xe5e7eb, roughness: .8 });
  const gp = new T.BoxGeometry(1.7, .05, 1), gf = new T.BoxGeometry(1.9, .25, 1.4); const NP = rows * cols, pans = new T.InstancedMesh(gp, pm, NP), flts = new T.InstancedMesh(gf, fl, NP); pans.castShadow = flts.receiveShadow = true;
  const mx = new T.Matrix4(), q = new T.Quaternion().setFromEuler(new T.Euler(-.2, 0, 0)), q0 = new T.Quaternion(), s1 = new T.Vector3(1, 1, 1); let k = 0;
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) { const x = (j - cols / 2) * 2.05, z = (i - rows / 2) * 1.6; mx.compose(new T.Vector3(x, .42, z), q, s1); pans.setMatrixAt(k, mx); mx.compose(new T.Vector3(x, .1, z), q0, s1); flts.setMatrixAt(k, mx); k++; }
  farm.add(pans, flts); const W = cols * 2.05, Dd = rows * 1.6;
  const shore = M(new T.BoxGeometry(80, 1.2, 30), new T.MeshStandardMaterial({ map: TEX.grass([10, 4]), roughness: 1 }), false, true); shore.position.set(0, .2, -Dd / 2 - 22); root.add(shore);
  const inv = M(new T.BoxGeometry(2.4, 2, 1.6), new T.MeshStandardMaterial({ color: 0xd1d5db, metalness: .5, roughness: .4 })); inv.position.set(W * .3, 1.8, -Dd / 2 - 9); root.add(inv);
  root.add(tube([[W / 2 - 1, .3, -Dd / 2 + .5], [W * .4, .2, -Dd / 2 - 3], [W * .32, .9, -Dd / 2 - 8.2]], .12, MAT.rubber()));
  [-1, 1].forEach(sd => { const pole = M(new T.CylinderGeometry(.15, .2, 9, 10), MAT.paint(0x8b5e34)); pole.position.set(W * .3 + sd * 4 + 6, 4.5, -Dd / 2 - 12); root.add(pole); });
  const sparkle = particles(80, 0xfff7c2, .25, { add: true, opacity: .9 }); root.add(sparkle);
  const [aS] = kit(root, .9, 1);
  const mk = { source: farm, converter: inv, load: inv, losses: marker(inv, 0, 1.5, 0), body: farm, goal: inv };
  return { root, anchors: mk, follow: null, ground: "water", water: true, labels: [{ obj: aS.userData.tip, text: () => "Sunlight", col: "#fbbf24" }, { obj: marker(inv, 0, 1.4, 0), text: () => "To the town", col: "#22d3ee" }],
    cam: { pos: new T.Vector3(W * .7, Math.max(W, Dd) * .55 + 4, W * .8 + 6), target: new T.Vector3(0, 0, -Dd * .15), fitW: W * .62 + 3 },
    update(R, dt, t) { farm.position.y = waveH(0, 0, t) * .15; farm.rotation.z = (waveH(3, 0, t) - waveH(-3, 0, t)) * .01;
      spinPts(sparkle, dt, (q, i) => { if (Math.random() < .05) { q.pos[i * 3] = (Math.random() - .5) * W; q.pos[i * 3 + 1] = .6; q.pos[i * 3 + 2] = (Math.random() - .5) * Dd; q.life[i] = .3; } else hide(q, i); }, () => {});
      aS.userData.set(new T.Vector3(-W * .2, 9, 0), new T.Vector3(.3, -1, .2).normalize(), 5); return 0; } };
};

/* land yacht: three wheels, a long frame, a tall sail, pilot lying down, racing on sand */
B.landyacht = (R, st) => {
  const root = new T.Group(), ly = new T.Group(); root.add(ly); const A = Math.max(2, Math.min(12, R.role("area", 6))), mh = Math.sqrt(A * 3.2), fw = A * 2 / mh;
  const fr = MAT.paint(0x1d4ed8); ly.add(rod(new T.Vector3(-1.6, .45, 0), new T.Vector3(1.8, .45, 0), .06, fr)); ly.add(rod(new T.Vector3(-1.3, .4, -1.3), new T.Vector3(-1.3, .4, 1.3), .06, fr));
  const wheels = []; [[1.85, 0], [-1.3, -1.35], [-1.3, 1.35]].forEach(([x, z]) => { const w = M(new T.CylinderGeometry(.33, .33, .14, 24).rotateX(Math.PI / 2), MAT.rubber()); w.position.set(x, .33, z); ly.add(w); wheels.push(w); });
  const seat = M(new T.CapsuleGeometry(.25, 1.2, 6, 12), MAT.paint(0x111827)); seat.rotation.z = Math.PI / 2; seat.position.set(-.3, .55, 0); ly.add(seat);
  const p = figure(0xef4444, 0x1f2937); p.rotation.z = -Math.PI / 2 + .25; p.position.set(-1.1, .75, 0); ly.add(p);
  const mast = M(new T.CylinderGeometry(.04, .06, mh, 12), MAT.metal()); mast.position.set(.6, .45 + mh / 2, 0); ly.add(mast);
  const ss = new T.Shape(); ss.moveTo(0, 0); ss.lineTo(-fw, 0); ss.quadraticCurveTo(-fw * .3, mh * .4, 0, mh); ss.closePath(); const sail = M(new T.ShapeGeometry(ss, 20), new T.MeshStandardMaterial({ color: 0xfacc15, roughness: .7, side: T.DoubleSide })); sail.position.set(.6, .7, 0); ly.add(sail);
  const boom = M(new T.CylinderGeometry(.03, .03, fw, 8), MAT.metal()); boom.rotation.z = Math.PI / 2; boom.position.set(.6 - fw / 2, .7, 0); ly.add(boom);
  const sand = particles(160, 0xd6b38a, .1, { opacity: .6 }); root.add(sand); const wind = particles(120, 0xffffff, .08, { opacity: .5 }); root.add(wind);
  const [aF, aD] = kit(root, .45, 2);
  const mk = { sail: sail, wing: sail, wheels: wheels[0], body: marker(ly, 0, 1.2, 0), drag: aD.userData.tip, goal: aF.userData.tip, speed: marker(ly, 0, mh + 1, 0), motor: sail };
  return { root, anchors: mk, follow: null, ground: "grass", moving: true, labels: [{ obj: aF.userData.tip, text: () => "Sail drive", col: "#22d3ee" }, { obj: aD.userData.tip, text: () => "Sand + air drag", col: "#fb7185" }],
    cam: { pos: new T.Vector3(3, mh * .55 + 2, mh + 6), target: new T.Vector3(0, mh * .45, 0), fitW: Math.max(4.2, mh * .75) },
    update(R, dt, t) { const v = R.ok ? 13 : 3 * R.frac; wheels.forEach(w => w.rotation.z -= v / .33 * dt); ly.rotation.x = R.ok ? -.04 - Math.sin(t * 1.3) * .015 : 0; sail.rotation.y = .35; boom.rotation.y = .35; boom.position.set(.6 - Math.cos(.35) * fw / 2, .7, Math.sin(.35) * fw / 2);
      spinPts(sand, dt, (q, i) => { if (Math.random() < .3 * v / 13) { const w = wheels[1 + (i % 2)]; q.pos[i * 3] = w.position.x; q.pos[i * 3 + 1] = .05; q.pos[i * 3 + 2] = w.position.z; q.vel[i * 3] = -2 - Math.random() * 2; q.vel[i * 3 + 1] = .6 + Math.random(); q.life[i] = .7; } else hide(q, i); }, (q, i, dt) => { q.vel[i * 3 + 1] -= 9.8 * dt; q.pos[i * 3] += q.vel[i * 3] * dt; q.pos[i * 3 + 1] = Math.max(.02, q.pos[i * 3 + 1] + q.vel[i * 3 + 1] * dt); });
      spinPts(wind, dt, (q, i) => { if (Math.random() < .2) { q.pos[i * 3] = (Math.random() - .5) * 8; q.pos[i * 3 + 1] = .5 + Math.random() * mh; q.pos[i * 3 + 2] = -6; q.life[i] = 1.5; } else hide(q, i); }, (q, i, dt) => { q.pos[i * 3 + 2] += 7 * dt; q.pos[i * 3] -= v * .3 * dt; });
      aF.userData.set(new T.Vector3(1.2, mh * .5, .8), new T.Vector3(1, 0, 0), 1.2 * Math.min(2, R.margin)); aD.userData.set(new T.Vector3(3.2, .6, .8), new T.Vector3(-1, 0, 0), 1.1); return v; } };
};

/* zipline: high platform, cable, low platform, rider in a harness rolling down */
B.zipline = (R, st) => {
  const root = new T.Group(), H = Math.max(3, Math.min(60, R.role("height", 25))), Lz = Math.max(20, Math.min(500, R.role("span", 300))), Lv = Math.min(70, 18 + Lz * .12), Hv = Math.min(26, 4 + H * .55);
  const wood = new T.MeshStandardMaterial({ map: TEX.wood([1, 4]), color: 0xb08860, roughness: .8 });
  const tower = (x, h) => { const g = new T.Group(); g.position.set(x, 1.6, 0); root.add(g); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => g.add(rod(new T.Vector3(a * 1.3, 0, b * 1.3), new T.Vector3(a * .9, h, b * .9), .26, wood))); const pf = M(new T.BoxGeometry(2.8, .25, 2.8), wood, true, true); pf.position.y = h; g.add(pf); for (let y = 2; y < h - 1; y += 3) [-1, 1].forEach(b => g.add(rod(new T.Vector3(-1.2, y, b * 1.2), new T.Vector3(1.2, y + 2.4, b * 1.2), .07, wood))); return g; };
  const ks = Math.min(1, 34 / Lv); root.scale.setScalar(ks);
  const rockM = new T.MeshStandardMaterial({ color: 0x6b7280, roughness: 1, flatShading: true }), topM = new T.MeshStandardMaterial({ map: TEX.grass([3, 3]), roughness: 1 });
  [[-Lv / 2, 1], [Lv / 2, -1]].forEach(([x, sd]) => { const cl = M(new T.CylinderGeometry(7, 9, 6, 9), rockM, true, true); cl.position.set(x + sd * -2, -1.5, 0); root.add(cl); const tp = M(new T.CylinderGeometry(7, 7, .3, 9), topM, false, true); tp.position.set(x + sd * -2, 1.5, 0); root.add(tp); });
  tower(-Lv / 2, Hv + 1); tower(Lv / 2, 3);
  const A0 = new T.Vector3(-Lv / 2, Hv + 4.6, 0), B0 = new T.Vector3(Lv / 2, 6.6, 0); const sag = Lv * .025, cab = u => new T.Vector3(A0.x + (B0.x - A0.x) * u, A0.y + (B0.y - A0.y) * u - sag * 4 * u * (1 - u), 0);
  root.add(M(new T.TubeGeometry(new T.CatmullRomCurve3([...Array(30)].map((_, i) => cab(i / 29))), 60, .07, 6), MAT.metal()));
  [A0, B0].forEach(P => { const post = M(new T.CylinderGeometry(.12, .12, 2.2, 10), MAT.metal()); post.position.set(P.x, P.y - 1, 0); root.add(post); });
  const rider = new T.Group(); root.add(rider); rider.scale.setScalar(3.2); const trol = M(new T.BoxGeometry(.3, .16, .12), MAT.paint(0xef4444)); rider.add(trol); rider.add(rod(new T.Vector3(0, 0, 0), new T.Vector3(0, -.9, 0), .015, MAT.dark()));
  const p = figure(0x22c55e, 0x1f2937); p.position.y = -2.4; p.userData.arms.forEach(a => a.rotation.z = 2.9); p.userData.legs.forEach(l => l.rotation.z = -.9); rider.add(p);
  const [aV, aG] = kit(root, .5, 2);
  const mk = { cable: trol, body: marker(rider, 0, -1.4, 0), top: marker(root, A0.x, A0.y + 1, 0), base: marker(root, B0.x, 3, 0), speed: aV.userData.tip, goal: marker(root, B0.x, B0.y + 2, 0), load: aG.userData.tip, drag: aG.userData.tip };
  return { root, anchors: mk, follow: null, ground: "water", water: true, labels: [{ obj: marker(root, B0.x, B0.y + 1.5, 0), text: () => "Finish", col: "#34d399" }, { obj: aG.userData.tip, text: () => "Gravity pulls you down", col: "#fb7185" }],
    cam: { pos: new T.Vector3(-Lv * .05 * ks, (Hv * .7 + 2) * ks, (Lv * .8 + 4) * ks), target: new T.Vector3(0, Hv * .48 * ks, 0), fitW: (Lv * .56 + 2) * ks },
    update(R, dt, t) { const stopAt = R.ok ? 1 : Math.max(.15, Math.min(.85, R.frac)); st.u = st.u == null ? 0 : st.u + dt * (st.u < stopAt ? .12 : 0); if (st.u >= stopAt) { st.w = (st.w || 0) + dt; if (st.w > 2) { st.u = 0; st.w = 0; } } const u = Math.min(st.u, stopAt);
      const P = cab(u); rider.position.copy(P); rider.rotation.z = Math.atan2(B0.y - A0.y, B0.x - A0.x) * .3 + (st.u >= stopAt && !R.ok ? Math.sin(t * 3) * .1 : 0);
      aV.userData.set(P.clone().add(new T.Vector3(.4, .5, .8)), new T.Vector3(1, (B0.y - A0.y) / (B0.x - A0.x), 0).normalize(), 2.4 * (st.u >= stopAt ? .1 : 1)); aG.userData.set(P.clone().add(new T.Vector3(0, 5.5, .8)), new T.Vector3(0, -1, 0), 3); return 0; } };
};

/* TV on a stand: screen shows a picture when there is enough power */
function buildTV() { const g = new T.Group(); const stand = M(new T.BoxGeometry(2.2, .7, .7), new T.MeshStandardMaterial({ map: TEX.wood([1, 1]), roughness: .6 })); stand.position.y = .35; g.add(stand);
  const frame = M(new T.BoxGeometry(2.4, 1.4, .08), MAT.dark()); frame.position.y = 1.55; g.add(frame); const neck = M(new T.BoxGeometry(.2, .3, .1), MAT.dark()); neck.position.y = .82; g.add(neck);
  const c = document.createElement("canvas"); c.width = 320; c.height = 180; const tx = new T.CanvasTexture(c); tx.colorSpace = T.SRGBColorSpace; const scr = M(new T.PlaneGeometry(2.28, 1.28), new T.MeshBasicMaterial({ map: tx }), false); scr.position.set(0, 1.55, .045); g.add(scr);
  let last = -1; g.userData.set = f => { const k = f >= 1 ? 1 : 0; if (k === last) return; last = k; const x = c.getContext("2d"); if (k) { const gr = x.createLinearGradient(0, 0, 0, 180); gr.addColorStop(0, "#38bdf8"); gr.addColorStop(.6, "#bae6fd"); gr.addColorStop(.61, "#4ade80"); gr.addColorStop(1, "#15803d"); x.fillStyle = gr; x.fillRect(0, 0, 320, 180); x.fillStyle = "#fde047"; x.beginPath(); x.arc(250, 45, 22, 0, 7); x.fill(); x.fillStyle = "#fff"; x.font = "bold 20px sans-serif"; x.fillText("▶ ON", 14, 30); }
    else { x.fillStyle = "#0b1220"; x.fillRect(0, 0, 320, 180); x.fillStyle = "#fbbf24"; x.font = "bold 22px sans-serif"; x.textAlign = "center"; x.fillText("Not enough power", 160, 98); x.textAlign = "left"; } tx.needsUpdate = true; }; return g; }

/* overshot water wheel: wooden flume pours onto buckets, mill house behind */
B.waterwheel = (R, st) => {
  const root = new T.Group(), H = Math.max(1, Math.min(8, R.role("height", 3))), Rw = H / 2, cx = 0, cy = Rw + .3;
  const wood = new T.MeshStandardMaterial({ map: TEX.wood([2, 1]), color: 0xa47148, roughness: .8 }), dark = new T.MeshStandardMaterial({ map: TEX.wood([2, 1]), color: 0x6b4a2b, roughness: .9 });
  const wheel = new T.Group(); wheel.position.set(cx, cy, 0); root.add(wheel); const Wd = Math.max(.6, Rw * .5);
  [-1, 1].forEach(sd => { const rim = M(new T.TorusGeometry(Rw, .07, 8, 48), dark); rim.position.z = sd * Wd / 2; wheel.add(rim); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; wheel.add(rod(new T.Vector3(0, 0, sd * Wd / 2), new T.Vector3(Math.cos(a) * Rw, Math.sin(a) * Rw, sd * Wd / 2), .05, dark)); } });
  const NB = 16; for (let k = 0; k < NB; k++) { const a = k / NB * Math.PI * 2, b = M(new T.BoxGeometry(Rw * .32, .05, Wd), wood); b.position.set(Math.cos(a) * Rw * .9, Math.sin(a) * Rw * .9, 0); b.rotation.z = a + .5; wheel.add(b); }
  const axle = M(new T.CylinderGeometry(.12, .12, Wd + 1.4, 16).rotateX(Math.PI / 2), MAT.dark()); wheel.add(axle);
  const fl = M(new T.BoxGeometry(5, .35, Wd * .9), wood); fl.position.set(-2.4, cy + Rw + .45, 0); root.add(fl); [-1, 1].forEach(sd => root.add(rod(new T.Vector3(-3.8, 0, sd * Wd * .4), new T.Vector3(-3.8, cy + Rw + .3, sd * Wd * .4), .07, dark)));
  const fw = M(new T.BoxGeometry(5, .06, Wd * .7), new T.MeshPhysicalMaterial({ color: 0x3b82f6, roughness: .05, transparent: true, opacity: .8 }), false); fw.position.set(-2.4, cy + Rw + .64, 0); root.add(fw);
  const mill = new T.Group(); mill.position.set(Rw + 2.4, 0, -Wd - 1.6); root.add(mill); const wall = M(new T.BoxGeometry(4, 3.2, 4), new T.MeshStandardMaterial({ color: 0xd6cfc2, roughness: .95 }), true, true); wall.position.y = 1.6; mill.add(wall);
  const roofG = new T.ConeGeometry(3.3, 1.8, 4); roofG.rotateY(Math.PI / 4); const roof = M(roofG, new T.MeshStandardMaterial({ color: 0x7c2d12, roughness: .8 })); roof.position.y = 4.1; mill.add(roof);
  const stream = M(new T.PlaneGeometry(30, Wd + 1.6).rotateX(-Math.PI / 2), new T.MeshPhysicalMaterial({ color: 0x2f7fb5, roughness: .08, clearcoat: 1, transparent: true, opacity: .9 }), false, true); stream.position.set(4, .08, 0); root.add(stream);
  const pour = particles(260, 0x93c5fd, .09, { opacity: .85 }); root.add(pour);
  const mk = { source: fl, converter: wheel, load: mill, losses: marker(wheel, 0, Rw + .6, 0), body: wheel, wheels: wheel, rotor: wheel };
  return { root, anchors: mk, follow: null, ground: "grass", labels: [{ obj: marker(fl, -1.5, .6, 0), text: () => "Falling water", col: "#22d3ee" }, { obj: marker(mill, 0, 3.6, 0), text: () => "Mill", col: "#fbbf24" }],
    cam: { pos: new T.Vector3(3.5, cy + 2.5, Rw * 2.2 + 8), target: new T.Vector3(0, cy, 0), fitW: Rw * 1.7 + 3.2 },
    update(R, dt, t) { const sp = R.ok ? 1 : Math.max(.15, R.frac); wheel.rotation.z -= sp * .8 * dt;
      spinPts(pour, dt, (q, i) => { if (Math.random() < .6) { q.pos[i * 3] = .1 + Math.random() * .2 - Rw * .15; q.pos[i * 3 + 1] = cy + Rw + .55; q.pos[i * 3 + 2] = (Math.random() - .5) * Wd * .6; q.vel[i * 3] = .6; q.vel[i * 3 + 1] = 0; q.life[i] = 1.2; } else hide(q, i); },
        (q, i, dt) => { q.vel[i * 3 + 1] -= 9.8 * dt * .5; q.pos[i * 3] += q.vel[i * 3] * dt; q.pos[i * 3 + 1] = Math.max(.1, q.pos[i * 3 + 1] + q.vel[i * 3 + 1] * dt); if (q.pos[i * 3 + 1] < cy + Rw * .2 && q.pos[i * 3] < Rw * 1.1) q.vel[i * 3] = 1.5; });
      return 0; } };
};

/* solar still: black basin of salty water under a sloped glass roof; drops run into a jug */
B.still = (R, st) => {
  const root = new T.Group(), A = Math.max(.3, Math.min(5, R.role("area", 2))), w = Math.sqrt(A * 2), d = A / w;
  const box = new T.Group(); root.add(box); const wood = new T.MeshStandardMaterial({ map: TEX.wood([1, 1]), roughness: .8 });
  const base = M(new T.BoxGeometry(w + .2, .25, d + .2), wood, true, true); base.position.y = .125; box.add(base);
  const basin = M(new T.BoxGeometry(w, .06, d), new T.MeshStandardMaterial({ color: 0x0b0b0b, roughness: .6 })); basin.position.y = .28; box.add(basin);
  const sea = M(new T.BoxGeometry(w * .98, .03, d * .98), new T.MeshPhysicalMaterial({ color: 0x14532d, roughness: .05, transparent: true, opacity: .7, clearcoat: 1 }), false); sea.position.y = .32; box.add(sea);
  const hb = .9, hf = .35; [-1, 1].forEach(sd => { const sh = new T.Shape(); sh.moveTo(-d / 2, 0); sh.lineTo(d / 2, 0); sh.lineTo(d / 2, hf); sh.lineTo(-d / 2, hb); sh.closePath(); const s = M(new T.ShapeGeometry(sh), wood); s.rotation.y = Math.PI / 2; s.position.set(sd * w / 2, .25, 0); box.add(s); });
  const back = M(new T.BoxGeometry(w, hb, .04), wood); back.position.set(0, .25 + hb / 2, -d / 2); box.add(back);
  const glassL = Math.hypot(d, hb - hf), glass = M(new T.BoxGeometry(w, .02, glassL), new T.MeshPhysicalMaterial({ color: 0xdbeafe, roughness: .02, transparent: true, opacity: .25, clearcoat: 1, depthWrite: false }), false); glass.position.set(0, .25 + (hb + hf) / 2, 0); glass.rotation.x = Math.atan2(hb - hf, d); box.add(glass);
  const gut = M(new T.CylinderGeometry(.04, .04, w, 10, 1, true, 0, Math.PI), MAT.metal()); gut.rotation.z = Math.PI / 2; gut.rotation.x = Math.PI; gut.position.set(0, .25 + hf - .04, d / 2 - .03); box.add(gut);
  const jug = M(new T.CylinderGeometry(.16, .18, .45, 24), new T.MeshPhysicalMaterial({ color: 0xbfdbfe, transparent: true, opacity: .5, roughness: .05 })); jug.position.set(w / 2 + .35, .23, d / 2 + .1); root.add(jug);
  const fresh = M(new T.CylinderGeometry(.15, .17, 1, 24), new T.MeshPhysicalMaterial({ color: 0x60a5fa, roughness: .05, transparent: true, opacity: .85 }), false); fresh.position.copy(jug.position); root.add(fresh);
  root.add(tube([[w / 2, .25 + hf - .05, d / 2 - .03], [w / 2 + .2, .5, d / 2 + .05], [w / 2 + .35, .48, d / 2 + .1]], .025, MAT.rubber()));
  const vap = particles(120, 0xffffff, .05, { opacity: .5 }); root.add(vap); const drops = particles(80, 0x93c5fd, .04, { opacity: .9 }); root.add(drops);
  const [aS] = kit(root, .3, 1);
  const mk = { source: glass, converter: basin, load: jug, losses: marker(box, 0, hb + .5, 0), body: box, inside: sea, outlet: jug };
  return { root, anchors: mk, follow: null, ground: "grass", labels: [{ obj: aS.userData.tip, text: () => "Sun heats the salty water", col: "#fbbf24" }, { obj: marker(jug, 0, .4, 0), text: () => "Fresh water", col: "#22d3ee" }],
    cam: { pos: new T.Vector3(w * .7 + 1, 1.8, d + 2.6), target: new T.Vector3(.2, .45, 0), fitW: w * .7 + .9 },
    update(R, dt, t) { const f = Math.max(.08, Math.min(1, R.frac)); st.f = st.f == null ? .05 : (st.f + dt * .06 * f) % 1; fresh.scale.y = Math.max(.02, st.f * .42); fresh.position.y = .02 + st.f * .21;
      spinPts(vap, dt, (q, i) => { if (Math.random() < .25) { q.pos[i * 3] = (Math.random() - .5) * w * .9; q.pos[i * 3 + 1] = .34; q.pos[i * 3 + 2] = (Math.random() - .5) * d * .8; q.life[i] = 1.2; } else hide(q, i); }, (q, i, dt) => { q.pos[i * 3 + 1] += .35 * dt; });
      spinPts(drops, dt, (q, i) => { if (Math.random() < .15 * f) { q.pos[i * 3] = (Math.random() - .5) * w * .9; q.pos[i * 3 + 2] = -d / 2 + Math.random() * d * .2; q.pos[i * 3 + 1] = .25 + hb - .05; q.life[i] = 1.6; } else hide(q, i); }, (q, i, dt) => { q.pos[i * 3 + 2] += d * .6 * dt; q.pos[i * 3 + 1] = .25 + hb - .05 - (q.pos[i * 3 + 2] + d / 2) / d * (hb - hf); });
      aS.userData.set(new T.Vector3(-w * .3, hb + 1.6, 0), new T.Vector3(.2, -1, .1).normalize(), .9); return 0; } };
};

/* earthquake: a 6-storey building on rubber isolators; the ground shakes */
B.quake = (R, st) => {
  const root = new T.Group(), gnd = new T.Group(); root.add(gnd); const iso = Math.max(1, R.role("iso", 1)), floors = 6, fh = 1.1, bw = 3.2;
  const slab = M(new T.BoxGeometry(6, .5, 6), MAT.concrete([2, 2]), true, true); slab.position.y = -.25; gnd.add(slab);
  const pads = []; if (iso > 1.3) [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]].forEach(([a, b]) => { const p = M(new T.CylinderGeometry(.35, .35, .3, 20), new T.MeshStandardMaterial({ color: 0x1f2937, roughness: .8 })); p.position.set(a * 1.2, .15, b * 1.2); gnd.add(p); pads.push(p); });
  const base0 = iso > 1.3 ? .3 : 0; const bld = new T.Group(); bld.position.y = base0; root.add(bld); const fl = [];
  for (let i = 0; i < floors; i++) { const f = new T.Group(); f.position.y = i * fh; bld.add(f); fl.push(f); const s = M(new T.BoxGeometry(bw, .14, bw), MAT.concrete([1, 1]), true, true); s.position.y = .07; f.add(s);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { const c = M(new T.BoxGeometry(.22, fh, .22), MAT.concrete([1, 1])); c.position.set(a * (bw / 2 - .15), fh / 2, b * (bw / 2 - .15)); f.add(c); });
    const gl = M(new T.BoxGeometry(bw - .3, fh - .2, bw - .3), new T.MeshPhysicalMaterial({ color: 0x7dd3fc, roughness: .05, transparent: true, opacity: .45 })); gl.position.y = fh / 2 + .05; f.add(gl); }
  const roof = M(new T.BoxGeometry(bw + .1, .2, bw + .1), MAT.concrete([1, 1])); roof.position.y = floors * fh + .1; bld.add(roof);
  const dust = particles(120, 0xb8a58c, .25, { opacity: .5 }); root.add(dust);
  const [aE, aS] = kit(root, .4, 2);
  const mk = { base: marker(gnd, 0, 0, 0), top: marker(bld, 0, floors * fh, 0), stress: fl[0], load: aE.userData.tip, body: marker(bld, 0, floors * fh / 2, 0), cable: fl[1] };
  return { root, anchors: mk, follow: null, ground: "grass", labels: [{ obj: aE.userData.tip, text: () => "Ground shaking", col: "#fb7185" }, { obj: marker(bld, 0, floors * fh + .6, 0), text: () => iso > 1.3 ? "On rubber isolators" : "Fixed to the ground", col: "#22d3ee" }],
    cam: { pos: new T.Vector3(6, floors * fh * .7 + 2, 10), target: new T.Vector3(0, floors * fh * .45, 0), fitW: 5.6 },
    update(R, dt, t) { const ok = R.ok, sh = Math.sin(t * 9) * .12 + Math.sin(t * 13.7) * .06; gnd.position.x = sh; const k = ok ? .25 : 1.2; bld.position.x = sh * (iso > 1.3 ? .25 : 1);
      fl.forEach((f, i) => { const u = (i + 1) / floors; f.position.x = Math.sin(t * 9 - .6) * .1 * k * u * (iso > 1.3 ? .6 : 1.6); f.rotation.z = -Math.cos(t * 9 - .6) * .02 * k * (iso > 1.3 ? .6 : 1.6); }); roof.position.x = fl[floors - 1].position.x;
      spinPts(dust, dt, (q, i) => { if (!ok && Math.random() < .2) { q.pos[i * 3] = (Math.random() - .5) * 5; q.pos[i * 3 + 1] = .1; q.pos[i * 3 + 2] = (Math.random() - .5) * 5; q.life[i] = 1.5; } else hide(q, i); }, (q, i, dt) => { q.pos[i * 3 + 1] += .5 * dt; });
      aE.userData.set(new T.Vector3(-3.6, .4, 2), new T.Vector3(1, 0, 0), 1.2 + Math.abs(sh) * 3); aS.userData.set(new T.Vector3(0, -5, 0), UP, .1); return 0; } };
};

/* trebuchet: A-frame, swinging arm with counterweight, sling throws a pumpkin to a target */
B.trebuchet = (R, st) => {
  const root = new T.Group(), Rg = Math.max(10, R.role("range", 200)), tgt = Math.max(30, R.role("goal", 200));
  const sc = .35, k = 22 / Math.max(Rg, tgt) ; const wood = new T.MeshStandardMaterial({ map: TEX.wood([1, 3]), color: 0xa47148, roughness: .8 });
  const tre = new T.Group(); root.add(tre); const piv = new T.Vector3(0, 3.2, 0);
  [-1, 1].forEach(sd => { tre.add(rod(new T.Vector3(-1.6, 0, sd * .9), piv.clone().setZ(sd * .9), .12, wood)); tre.add(rod(new T.Vector3(1.6, 0, sd * .9), piv.clone().setZ(sd * .9), .12, wood)); tre.add(rod(new T.Vector3(-2.2, .1, sd * .9), new T.Vector3(2.2, .1, sd * .9), .12, wood)); });
  const arm = new T.Group(); arm.position.copy(piv); tre.add(arm); const beam = M(new T.BoxGeometry(5.4, .18, .18), wood); beam.position.x = .95; arm.add(beam); const ax = M(new T.CylinderGeometry(.08, .08, 2, 12).rotateX(Math.PI / 2), MAT.dark()); arm.add(ax);
  const cw = M(new T.BoxGeometry(.9, .9, .9), new T.MeshStandardMaterial({ map: TEX.wood([1, 1]), color: 0x5b4636 })); cw.position.set(-1.6, 0, 0); arm.add(cw);
  const pump = M(new T.SphereGeometry(.22, 20, 14), new T.MeshStandardMaterial({ color: 0xf97316, roughness: .6 })); pump.scale.y = .85; root.add(pump); const stem = M(new T.CylinderGeometry(.03, .03, .1, 8), new T.MeshStandardMaterial({ color: 0x166534 })); stem.position.y = .2; pump.add(stem);
  const slingL = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]), new T.LineBasicMaterial({ color: 0x3f2a1a })); root.add(slingL);
  root.position.x = -(Math.max(Rg, tgt) * k + 3) * .45;
  const tx = tgt * k + 3; const flag = new T.Group(); flag.position.set(tx, 0, 0); root.add(flag); const pole = M(new T.CylinderGeometry(.05, .05, 2.2, 8), MAT.metal()); pole.position.y = 1.1; flag.add(pole); const cl = M(new T.PlaneGeometry(.8, .5), new T.MeshStandardMaterial({ color: 0xef4444, side: T.DoubleSide })); cl.position.set(.4, 1.95, 0); flag.add(cl);
  const ring = M(new T.RingGeometry(.8, 1, 40).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide }), false); ring.position.set(tx, .03, 0); root.add(ring);
  const splat = particles(60, 0xf97316, .15, { opacity: .9 }); root.add(splat);
  const mk = { tank: cw, body: marker(tre, 0, 2, 0), engine: cw, thrust: pump, gravity: marker(arm, -1.6, -1.4, 0), goal: marker(flag, 0, 2.4, 0), drag: pump };
  return { root, anchors: mk, follow: null, ground: "open", labels: [{ obj: marker(arm, -1.6, .2, 0), text: () => "Falling counterweight", col: "#fb7185" }, { obj: marker(flag, 0, 2.6, 0), text: () => Math.round(tgt) + " m target", col: "#fbbf24" }],
    cam: { pos: new T.Vector3(0, 5.5, Math.min(20, tx * .55 + 9)), target: new T.Vector3(0, 2.4, 0), fitW: tx * .55 + 3 },
    update(R, dt, t) { const per = 6.5; st.c = ((st.c == null ? 0 : st.c) + dt) % per; const c = st.c, land = Rg * k + 3, cock = Math.PI + .75, rel = 1.45; let th;
      if (c < 1) th = cock; else if (c < 1.5) { const f = (c - 1) / .5; th = cock - (cock - rel) * f * f; } else if (c < 4.5) th = Math.PI / 2 + (rel - Math.PI / 2) * Math.cos((c - 1.5) * 3) * Math.exp(-(c - 1.5) * 1.5); else th = Math.PI / 2 + (cock - Math.PI / 2) * (c - 4.5) / 2;
      arm.rotation.z = th; const tip = new T.Vector3(Math.cos(th) * 3.5, Math.sin(th) * 3.5, 0).add(piv);
      if (c < 1.5) pump.position.set(tip.x - .6, Math.max(.22, tip.y - .9), 0);
      else { const ft = Math.min(1, (c - 1.5) / 1.8); const x0 = tip.x, apex = Math.max(4, land * .22); pump.position.set(.6 + (land - .6) * ft, Math.max(.22, 6.6 * (1 - ft) + 4 * apex * ft * (1 - ft)), 0); }
      if (c > 4.5 && c < 6.4) pump.position.set(land, .22, 0);
      const sp = slingL.geometry.attributes.position; sp.setXYZ(0, tip.x, tip.y, tip.z); const sl = c < 1.5 ? pump.position : new T.Vector3(tip.x - .2, tip.y - 1, 0); sp.setXYZ(1, sl.x, sl.y, sl.z); sp.needsUpdate = true;
      spinPts(splat, dt, (q, i) => { if (c > 3.3 && c < 3.5 && Math.random() < .8) { q.pos[i * 3] = land; q.pos[i * 3 + 1] = .2; q.pos[i * 3 + 2] = 0; q.vel[i * 3] = (Math.random() - .5) * 4; q.vel[i * 3 + 1] = 1 + Math.random() * 2; q.vel[i * 3 + 2] = (Math.random() - .5) * 4; q.life[i] = .8; } else hide(q, i); }, (q, i, dt) => { q.vel[i * 3 + 1] -= 9.8 * dt; q.pos[i * 3] += q.vel[i * 3] * dt; q.pos[i * 3 + 1] = Math.max(.03, q.pos[i * 3 + 1] + q.vel[i * 3 + 1] * dt); q.pos[i * 3 + 2] += q.vel[i * 3 + 2] * dt; });
      return 0; } };
};

/* bungee: a bridge high over a river canyon; the jumper falls, stretches the cord and bounces */
B.bungee = (R, st) => {
  const root = new T.Group(), H = Math.max(20, R.role("height", 50)), drop = Math.max(5, R.role("drop", 40)), Lc = Math.max(5, R.role("cord", 15)), k = 22 / H;
  const scn = new T.Group(); scn.scale.setScalar(k); root.add(scn);
  const rock = new T.MeshStandardMaterial({ color: 0x8b6b4a, roughness: 1, flatShading: true }); [-1, 1].forEach(sd => { const c = M(new T.BoxGeometry(30, H + 4, 40), rock, true, true); c.position.set(sd * 24, (H + 4) / 2 - 4, 0); scn.add(c); const top = M(new T.BoxGeometry(30, .4, 40), new T.MeshStandardMaterial({ map: TEX.grass([6, 8]) }), false, true); top.position.set(sd * 24, H, 0); scn.add(top); });
  const river = M(new T.PlaneGeometry(18, 40).rotateX(-Math.PI / 2), new T.MeshPhysicalMaterial({ color: 0x2f7fb5, roughness: .08, clearcoat: 1 }), false, true); river.position.y = .1; scn.add(river);
  const deck = M(new T.BoxGeometry(20, .8, 3), MAT.concrete([4, 1]), true, true); deck.position.y = H + .4; scn.add(deck); [-1, 1].forEach(sd => { const rl = M(new T.BoxGeometry(20, .1, .1), MAT.metal()); rl.position.set(0, H + 1.8, sd * 1.4); scn.add(rl); });
  const safe = M(new T.PlaneGeometry(18, .3), new T.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: .8, side: T.DoubleSide }), false); safe.position.set(0, 5, 1.6); scn.add(safe);
  const jp = new T.Group(); scn.add(jp); const fig = figure(0xec4899, 0x111827); fig.rotation.z = Math.PI; fig.position.y = 1.75; jp.add(fig); jp.scale.setScalar(2.6); const jumpPf = M(new T.BoxGeometry(2, .3, 1.4), MAT.paint(0xf97316)); jumpPf.position.set(1.5, H + .5, 2.2); scn.add(jumpPf);
  const cg = new T.BufferGeometry().setFromPoints([...Array(24)].map(() => new T.Vector3())), cord = new T.Line(cg, new T.LineBasicMaterial({ color: 0x22c55e })); scn.add(cord);
  const [aG, aC] = kit(scn, 1.2, 2);
  const mk = { top: marker(scn, 0, H + 1, 0), base: marker(scn, 0, 0, 0), cable: cord, load: aG.userData.tip, stress: aC.userData.tip, body: jp };
  return { root, anchors: mk, follow: null, ground: "none", labels: [{ obj: aC.userData.tip, text: () => "Cord pulls back", col: "#22d3ee" }, { obj: marker(safe, 9, .6, 0), text: () => "Safety line", col: "#fbbf24" }],
    cam: { pos: new T.Vector3(3, H * k * .62 + 2, 24), target: new T.Vector3(0, H * k * .5, 0), fitW: 9 },
    update(R, dt, t) { const top = H + 1, low = top - drop, kM = 2 * 9.81 * drop / Math.max(1, Math.pow(drop - Lc, 2)); if (st.y == null || st.reset) { st.y = 0; st.v = 0; st.c = 0; st.reset = 0; }
      st.c += dt; if (st.c > .8) { const n = 4; for (let i = 0; i < n; i++) { const h2 = dt / n, ext = st.y - Lc, a = 9.81 - (ext > 0 ? kM * ext : 0) - .25 * st.v * (ext > 0 ? 1 : 0); st.v += a * h2; st.y += st.v * h2; } } if (st.c > 10) st.reset = 1;
      const feet = top - Math.max(0, st.y); jp.position.set(1.5, feet - 4.55, 2.2); const cp = cg.attributes.position, slack = Math.max(0, Lc - st.y); for (let i = 0; i < 24; i++) { const u = i / 23; cp.setXYZ(i, 1.5 * u, top + (feet - top) * u - Math.sin(u * Math.PI) * slack * .5, 1.5 + .7 * u); } cp.needsUpdate = true;
      safe.material.color.set(low < 5 ? 0xef4444 : 0xfbbf24); aG.userData.set(new T.Vector3(5, feet - 1, 2.2), new T.Vector3(0, -1, 0), 4); aC.userData.set(new T.Vector3(-2, feet - 3, 2.2), UP, st.y > Lc ? Math.min(8, 1 + (st.y - Lc) * .3) : .1); return 0; } };
};

/* rope bridge: two posts each side, sagging main ropes, hanging planks, handrails */
B.ropebridge = (R, st) => {
  const root = new T.Group(), L = Math.max(8, Math.min(70, R.role("span", 40))), sagR = Math.max(.3, R.role("sag", 3)), k = Math.min(1, 34 / L); const scn = new T.Group(); scn.scale.setScalar(k); root.add(scn);
  const rock = new T.MeshStandardMaterial({ color: 0x78716c, roughness: 1, flatShading: true }); [-1, 1].forEach(sd => { const c = M(new T.BoxGeometry(20, 16, 24), rock, true, true); c.position.set(sd * (L / 2 + 10), 2, 0); scn.add(c); const tp = M(new T.BoxGeometry(20, .3, 24), new T.MeshStandardMaterial({ map: TEX.grass([5, 6]) }), false, true); tp.position.set(sd * (L / 2 + 10), 10.15, 0); scn.add(tp); });
  const river = M(new T.PlaneGeometry(L + 4, 60).rotateX(-Math.PI / 2), new T.MeshPhysicalMaterial({ color: 0x1f6f9a, roughness: .08, clearcoat: 1 }), false, true); river.position.y = -5; scn.add(river);
  const wood = new T.MeshStandardMaterial({ map: TEX.wood([1, 1]), color: 0xb08860, roughness: .8 }), rope = new T.MeshStandardMaterial({ color: 0xc8a96e, roughness: .9 });
  const y0 = 10.3, yAt = x => y0 - sagR * (1 - Math.pow(2 * x / L, 2)); [-1, 1].forEach(sx => [-1, 1].forEach(sz => { const p = M(new T.CylinderGeometry(.18, .22, 2.4, 10), wood); p.position.set(sx * L / 2, y0 + 1.2, sz * .8); scn.add(p); }));
  const ropePts = (dy, z) => [...Array(32)].map((_, i) => { const x = -L / 2 + L * i / 31; return [x, yAt(x) + dy, z]; });
  [-.8, .8].forEach(z => { scn.add(tube(ropePts(0, z), .05, rope, 80)); scn.add(tube(ropePts(1.1, z).map(([x, y, zz]) => [x, y + (1 - Math.pow(2 * x / L, 2)) * sagR * .15, zz]), .04, rope, 80)); });
  for (let i = 0; i < Math.round(L / .5); i++) { const x = -L / 2 + .25 + i * .5; const pl = M(new T.BoxGeometry(.3, .06, 1.7), wood, true, true); pl.position.set(x, yAt(x) - .02, 0); scn.add(pl); if (i % 3 === 0) [-.8, .8].forEach(z => scn.add(rod(new T.Vector3(x, yAt(x), z), new T.Vector3(x, yAt(x) + 1.1 + (1 - Math.pow(2 * x / L, 2)) * sagR * .15, z), .015, rope))); }
  const walker = figure(0x0ea5e9, 0x1f2937); scn.add(walker); walker.scale.setScalar(1.2);
  const [aT, aW] = kit(scn, .6, 2);
  const mk = { cable: marker(scn, -L / 2 + 1, y0, .8), stress: aT.userData.tip, load: aW.userData.tip, top: marker(scn, -L / 2, y0 + 2.4, .8), base: marker(scn, L / 2, y0, 0), body: marker(scn, 0, yAt(0) + 1, 0) };
  return { root, anchors: mk, follow: null, ground: "none", labels: [{ obj: aT.userData.tip, text: () => "Rope tension", col: "#22d3ee" }, { obj: aW.userData.tip, text: () => "People + planks", col: "#fb7185" }],
    cam: { pos: new T.Vector3(L * .2 * k, (y0 + 4) * k, (L * .7 + 10) * k), target: new T.Vector3(0, (y0 - sagR * .6) * k, 0), fitW: (L * .55 + 6) * k },
    update(R, dt, t) { const ok = R.ok; const x = Math.sin(t * .25) * L * .35; walker.position.set(x, yAt(x) + .03 + (ok ? 0 : Math.abs(Math.sin(t * 6)) * .05), .2); walker.rotation.y = Math.cos(t * .25) > 0 ? 0 : Math.PI; walker.userData.legs.forEach((l, i) => l.rotation.z = Math.sin(t * 6 + i * Math.PI) * .35);
      aT.userData.set(new T.Vector3(-L / 2 + 2, yAt(-L / 2 + 2) + .2, 1.2), new T.Vector3(-1, .25, 0).normalize(), 3 * Math.min(1.5, 1 / Math.max(.4, R.margin)) + .5); aW.userData.set(new T.Vector3(x + 1.2, yAt(x) + 3.2, .6), new T.Vector3(0, -1, 0), 2.4); return 0; } };
};

/* Ferris wheel: rim, spokes, A-frame legs, cabins that stay upright */
B.ferris = (R, st) => {
  const root = new T.Group(), D = Math.max(15, Math.min(140, R.role("size", 60))), k = 26 / D, scn = new T.Group(); scn.scale.setScalar(k); root.add(scn); const r = D / 2, hub = r + D * .08;
  const steel = new T.MeshStandardMaterial({ color: 0xf1f5f9, metalness: .6, roughness: .35 });
  [-1, 1].forEach(sd => { [-1, 1].forEach(fx => scn.add(rod(new T.Vector3(fx * r * .55, 0, sd * D * .1), new T.Vector3(0, hub, sd * D * .03), D * .012, steel))); });
  const wheel = new T.Group(); wheel.position.y = hub; scn.add(wheel); [-1, 1].forEach(sd => { const rim = M(new T.TorusGeometry(r, D * .006, 8, 96), steel); rim.position.z = sd * D * .03; wheel.add(rim); for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2; wheel.add(rod(new T.Vector3(0, 0, sd * D * .03), new T.Vector3(Math.cos(a) * r, Math.sin(a) * r, sd * D * .03), D * .0025, steel)); } });
  const hubM = M(new T.CylinderGeometry(D * .03, D * .03, D * .08, 24).rotateX(Math.PI / 2), MAT.metal()); wheel.add(hubM);
  const N = 16, cabs = []; const cols = [0xef4444, 0xf59e0b, 0x22c55e, 0x3b82f6, 0xa855f7, 0xec4899]; for (let i = 0; i < N; i++) { const c = new T.Group(); const body = M(new T.CapsuleGeometry(D * .022, D * .02, 6, 12), new T.MeshPhysicalMaterial({ color: 0xdbeafe, roughness: .05, transparent: true, opacity: .55 })); body.rotation.z = Math.PI / 2; c.add(body); const bs = M(new T.BoxGeometry(D * .06, D * .008, D * .04), MAT.paint(cols[i % cols.length])); bs.position.y = -D * .02; c.add(bs); scn.add(c); cabs.push({ c, a: i / N * Math.PI * 2 }); }
  const lights = particles(64, 0xfff3b0, .5, { add: true, opacity: .9 }); wheel.add(lights); { const q = lights.userData; for (let i = 0; i < q.n; i++) { const a = i / q.n * Math.PI * 2; q.pos[i * 3] = Math.cos(a) * r; q.pos[i * 3 + 1] = Math.sin(a) * r; q.pos[i * 3 + 2] = D * .035; q.life[i] = 1; } lights.geometry.attributes.position.needsUpdate = true; }
  const motor = M(new T.BoxGeometry(D * .05, D * .04, D * .05), MAT.paint(0x334155)); motor.position.set(0, hub - D * .05, -D * .05); scn.add(motor);
  const [aT] = kit(scn, D * .02, 1);
  const mk = { motor, body: hubM, wheels: wheel, rotor: wheel, load: cabs[4].c, top: marker(scn, 0, hub + r, 0), base: marker(scn, 0, 0, 0), speed: aT.userData.tip, goal: aT.userData.tip };
  return { root, anchors: mk, follow: null, ground: "open", labels: [{ obj: aT.userData.tip, text: () => "Motor turns the wheel", col: "#22d3ee" }],
    cam: { pos: new T.Vector3(10, 14, 34), target: new T.Vector3(0, hub * k * .9, 0), fitW: 17 },
    update(R, dt, t) { const sp = R.ok ? .12 : .02 * R.frac; st.a = (st.a || 0) + sp * dt; wheel.rotation.z = st.a; cabs.forEach(o => { const a = o.a + st.a; o.c.position.set(Math.cos(a) * r, hub + Math.sin(a) * r - D * .03, 0); o.c.rotation.z = Math.sin(t * .8 + o.a) * .03; });
      aT.userData.set(new T.Vector3(r * .3, hub + r * .2, D * .05), new T.Vector3(-.5, 1, 0).normalize(), D * .12 * (R.ok ? 1 : .3)); return 0; } };
};

/* roller coaster loop: lift hill, drop, vertical loop; the car follows the track */
B.coaster = (R, st) => {
  const root = new T.Group(), h = Math.max(6, R.role("height", 40)), rl = Math.max(3, R.role("radius", 10)), kk = 16 / Math.max(h, 2.6 * rl), H = h * kk, r = rl * kk;
  const X0 = -r * 1.5 - H * 1.2 - 4, pts = [[X0 - 5, .8, 0], [X0 - 1, H * .55, 0], [X0 + 1, H, 0], [X0 + 2.5, H * .9, 0], [X0 + 2.5 + H * .7, H * .2, 0], [-r * 1.6, .8, 0], [-r * .4, .8, 0]];
  const LS = pts.length; for (let i = 1; i < 24; i++) { const a = -Math.PI / 2 + i / 24 * Math.PI * 2; pts.push([Math.cos(a) * r, .8 + r + Math.sin(a) * r, i / 24 * 2.4]); } const LE = pts.length; pts.push([r * .4, .8, 2.4], [r * 1.8, .8, 2.4], [r * 3.5 + 6, .8, 2.4]);
  const curve = new T.CatmullRomCurve3(pts.map(p => new T.Vector3(...p)), false, "centripetal", .5), N = 900, P = curve.getSpacedPoints(N), up0 = new T.Vector3(0, 1, 0), lc = new T.Vector3(0, .8 + r, 0);
  const nearest = q => { let b = 0, bd = 1e9; P.forEach((p, i) => { const d = p.distanceToSquared(q); if (d < bd) { bd = d; b = i; } }); return b / N; }, uLs = nearest(new T.Vector3(...pts[LS])), uLe = nearest(new T.Vector3(...pts[LE - 1])), uTop = nearest(new T.Vector3(...pts[2]));
  const inLoop = u => u > uLs - .01 && u < uLe + .01, upAt = (u, p) => inLoop(u) ? new T.Vector3(lc.x - p.x, lc.y - p.y, 0).normalize() : up0.clone();
  const railM = new T.MeshStandardMaterial({ color: 0xdc2626, metalness: .5, roughness: .35 }), supM = new T.MeshStandardMaterial({ color: 0x94a3b8, metalness: .6, roughness: .4 });
  [-.4, .4].forEach(off => { const Q = P.map((p, i) => { const u = i / N, tn = curve.getTangentAt(Math.min(1, u)), upv = upAt(u, p), side = new T.Vector3().crossVectors(tn, upv).normalize(); return p.clone().addScaledVector(side, off); }); root.add(M(new T.TubeGeometry(new T.CatmullRomCurve3(Q), 1200, .08, 8), railM)); });
  for (let i = 0; i <= N; i += 30) { const p = P[i], u = i / N; if (p.y > 1.2 && !inLoop(u)) root.add(rod(new T.Vector3(p.x, 0, p.z), new T.Vector3(p.x, p.y - .1, p.z), .08, supM)); }
  [-1, 1].forEach(sd => root.add(rod(new T.Vector3(sd * r * .7, 0, 1.2), new T.Vector3(sd * r * .2, .8 + r * .6, 1.2), .12, supM)));
  const car = new T.Group(); root.add(car); const cb = M(new T.BoxGeometry(1.6, .5, 1.1), MAT.paint(0xfacc15)); cb.position.y = .45; car.add(cb); const nose = M(new T.SphereGeometry(.4, 16, 10, 0, Math.PI), MAT.paint(0xfacc15)); nose.rotation.y = -Math.PI / 2; nose.position.set(.8, .45, 0); nose.scale.set(1, .6, 1.3); car.add(nose);
  [[-.5, .5], [.5, .5], [-.5, -.5], [.5, -.5]].forEach(([x, z]) => { const wh = M(new T.CylinderGeometry(.16, .16, .1, 16).rotateX(Math.PI / 2), MAT.rubber()); wh.position.set(x, .2, z * 1.1); car.add(wh); });
  const spoiler = M(new T.BoxGeometry(.1, .25, 1.1), MAT.paint(0x111827)); spoiler.position.set(-.75, .8, 0); car.add(spoiler); const stripeC = M(new T.BoxGeometry(1.62, .08, .3), MAT.paint(0xef4444)); stripeC.position.set(0, .71, 0); car.add(stripeC);
  const [aV, aG] = kit(root, .5, 2);
  const mk = { top: marker(root, X0 + 1, H + .8, 0), base: marker(root, 0, .8, 0), cable: marker(root, 0, .8 + 2 * r, 1.2), body: car, speed: aV.userData.tip, load: aG.userData.tip, goal: marker(root, 0, .8 + 2 * r + .6, 1.2), stress: marker(root, 0, .8 + 2 * r, 1.2) };
  const yMax = H;
  return { root, anchors: mk, follow: null, ground: "open", labels: [{ obj: marker(root, 0, .8 + 2 * r + 1.2, 1.2), text: () => "Top of the loop", col: "#fbbf24" }],
    cam: { pos: new T.Vector3((X0 + r * 2) / 2, H * .7 + 3, (r * 2 - X0) * .75 + 6), target: new T.Vector3((X0 + r * 2) / 2, H * .45, 0), fitW: (r * 2 - X0) * .52 + 2 },
    update(R, dt, t) { const ok = R.ok; if (st.u == null) { st.u = uTop; st.dir = 1; st.wait = 0; }
      const p0 = curve.getPointAt(st.u); let v = st.u < uTop ? 3 : Math.sqrt(Math.max(.25, 2 * 9.81 * (yMax - p0.y) * .85)) * .7;
      if (!ok && inLoop(st.u) && st.dir > 0 && (st.u - uLs) / (uLe - uLs) > .62) st.dir = -1; if (st.dir < 0 && st.u < uLs - .04) { st.wait += dt; v = 0; if (st.wait > 1) { st.u = uTop; st.dir = 1; st.wait = 0; } }
      st.u += st.dir * v * dt / curve.getLength(); if (st.u >= .995) st.u = 0; if (st.u < 0) st.u = 0;
      const p = curve.getPointAt(st.u), tn = curve.getTangentAt(st.u), upv = upAt(st.u, p), side = new T.Vector3().crossVectors(tn, upv).normalize(), upn = new T.Vector3().crossVectors(side, tn).normalize();
      car.position.copy(p); car.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(tn, upn, side.clone().negate()));
      aV.userData.set(p.clone().add(upn.clone().multiplyScalar(1.6)), tn.clone().multiplyScalar(st.dir), Math.min(3, .4 + v * .25)); aG.userData.set(p.clone().add(new T.Vector3(0, 0, 1.4)), new T.Vector3(0, -1, 0), 1.3); return 0; } };
};

/* ===================== safe, build-at-home machines (v55) ===================== */
function benchTop(root, w = 3.2, d = 1.6, h = .9) { const top = M(new T.BoxGeometry(w, .08, d), new T.MeshStandardMaterial({ map: TEX.wood([2, 1]), roughness: .6 }), true, true); top.position.y = h; root.add(top); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { const l = M(new T.BoxGeometry(.07, h, .07), MAT.dark()); l.position.set(a * (w / 2 - .08), h / 2, b * (d / 2 - .08)); root.add(l); }); return h + .04; }
function tapeLine(root, x0, len, y, z, step) { const g = new T.Group(); root.add(g); const tape = M(new T.PlaneGeometry(len, .06).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xfacc15 }), false); tape.position.set(x0 + len / 2, y + .003, z); g.add(tape); for (let x = 0; x <= len + 1e-6; x += step) { const t = M(new T.PlaneGeometry(.012, .1).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0x111827 }), false); t.position.set(x0 + x, y + .004, z); g.add(t); } return g; }
function flagAt(root, x, y, z, s = 1) { const g = new T.Group(); g.position.set(x, y, z); g.scale.setScalar(s); root.add(g); const p = M(new T.CylinderGeometry(.01, .01, .5, 8), MAT.metal()); p.position.y = .25; g.add(p); const f = M(new T.PlaneGeometry(.18, .12), new T.MeshStandardMaterial({ color: 0xef4444, side: T.DoubleSide })); f.position.set(.09, .44, 0); g.add(f); return g; }

/* balloon car: bottle body, cap wheels, balloon pushing air backwards */
B.ballooncar = (R, st) => {
  const root = new T.Group(), car = new T.Group(); root.add(car); car.scale.setScalar(2.2); const goal = Math.max(1, R.role("goal", 5)), k = 2.6 / goal;
  const body = M(new T.CapsuleGeometry(.05, .2, 8, 16), new T.MeshPhysicalMaterial({ color: 0xbfe3ff, roughness: .05, transparent: true, opacity: .6 })); body.rotation.z = Math.PI / 2; body.position.y = .085; car.add(body);
  const wheels = []; [[-.1, 1], [-.1, -1], [.1, 1], [.1, -1]].forEach(([x, sd]) => { const w = M(new T.CylinderGeometry(.035, .035, .015, 20).rotateX(Math.PI / 2), MAT.paint([0xef4444, 0x22c55e, 0x3b82f6, 0xf59e0b][wheels.length])); w.position.set(x, .035, sd * .07); car.add(w); wheels.push(w); });
  [-.1, .1].forEach(x => car.add(rod(new T.Vector3(x, .035, -.08), new T.Vector3(x, .035, .08), .005, MAT.white())));
  const straw = M(new T.CylinderGeometry(.006, .006, .14, 8), MAT.paint(0xf472b6)); straw.rotation.z = Math.PI / 2; straw.position.set(-.13, .14, 0); car.add(straw);
  const bal = M(new T.SphereGeometry(.1, 24, 16), new T.MeshPhysicalMaterial({ color: 0xef4444, roughness: .25, clearcoat: .8 })); bal.position.set(-.02, .2, 0); car.add(bal);
  const puff = particles(80, 0xffffff, .03, { opacity: .5 }); root.add(puff);
  tapeLine(root, 0, goal * k * 1.25, 0, -.18, .2 * Math.max(1, Math.round(goal / 4))); const fl = flagAt(root, goal * k, 0, -.18, .6);
  const [aT, aF] = kit(root, .06, 2);
  const mk = { motor: bal, battery: bal, wheels: wheels[0], body, goal: marker(fl, 0, .3, 0), drag: aF.userData.tip, speed: aT.userData.tip };
  return { root, anchors: mk, follow: null, ground: "none", labels: [{ obj: aT.userData.tip, text: () => "Air rushing out pushes it", col: "#22d3ee" }, { obj: marker(fl, 0, .36, 0), text: () => Math.round(goal) + " m goal", col: "#fbbf24" }],
    cam: { pos: new T.Vector3(goal * k * .55, .8, 2.1), target: new T.Vector3(goal * k * .55, .15, 0), fitW: goal * k * .7 + .3 },
    update(R, dt, t) { const dist = Math.min(goal * k * 1.15, Math.max(.05, R.role("dist", 1)) * k), per = 5; st.c = ((st.c == null ? 0 : st.c) + dt) % per; const f = Math.min(1, st.c / 3), x = dist * (1 - Math.pow(1 - f, 2)); car.position.x = x; wheels.forEach(w => w.rotation.z = -x / .077);
      const s = Math.max(.25, 1 - f * .9); bal.scale.setScalar(s); bal.position.x = -.02 - (1 - s) * .04;
      spinPts(puff, dt, (q, i) => { if (f < 1 && Math.random() < .4) { q.pos[i * 3] = x - .44; q.pos[i * 3 + 1] = .31; q.pos[i * 3 + 2] = (Math.random() - .5) * .02; q.vel[i * 3] = -.6 - Math.random() * .4; q.life[i] = .4; } else hide(q, i); }, (q, i, dt) => { q.pos[i * 3] += q.vel[i * 3] * dt; q.pos[i * 3 + 2] += (Math.random() - .5) * .1 * dt; });
      aT.userData.set(new T.Vector3(x + .1, .7, .1), new T.Vector3(1, 0, 0), f < 1 ? .35 : .03); aF.userData.set(new T.Vector3(x + .6, .1, .2), new T.Vector3(-1, 0, 0), .25); return 0; } };
};

/* rubber-band plane: stick fuselage, paper wing, propeller turned by a twisted rubber band, flying in circles */
B.rubberplane = (R, st) => {
  const root = new T.Group(), pl = new T.Group(); root.add(pl); const wood = new T.MeshStandardMaterial({ map: TEX.wood([1, 1]), color: 0xd6b48a, roughness: .7 }), paper = new T.MeshStandardMaterial({ color: 0xfacc15, roughness: .8, side: T.DoubleSide });
  pl.add(rod(new T.Vector3(-.3, 0, 0), new T.Vector3(.25, 0, 0), .006, wood)); const wing = M(new T.BoxGeometry(.09, .003, .5), paper); wing.position.set(.05, .04, 0); pl.add(wing); pl.add(rod(new T.Vector3(.02, 0, 0), new T.Vector3(.04, .04, 0), .003, wood)); pl.add(rod(new T.Vector3(.08, 0, 0), new T.Vector3(.07, .04, 0), .003, wood));
  const tail = M(new T.BoxGeometry(.06, .003, .18), paper); tail.position.set(-.27, .01, 0); pl.add(tail); const fin = M(new T.BoxGeometry(.06, .07, .003), paper); fin.position.set(-.27, .045, 0); pl.add(fin);
  const band = tube([[-.28, -.01, 0], [-.1, -.03, 0], [.1, -.03, 0], [.25, -.01, 0]], .006, MAT.paint(0x92400e), 20); pl.add(band);
  const prop = new T.Group(); prop.position.set(.27, 0, 0); pl.add(prop); [0, 1].forEach(i => { const b = M(new T.BoxGeometry(.004, .16, .03), MAT.paint(0x2563eb)); b.rotation.y = .4; b.position.y = (i ? -1 : 1) * .08; prop.add(b); });
  pl.scale.setScalar(3.2);
  const [aL] = kit(root, .12, 1);
  const mk = { wing, airfoil: wing, body: pl, motor: band, battery: band, lift: aL.userData.tip, goal: aL.userData.tip, thrust: prop };
  return { root, anchors: mk, follow: null, ground: "open", labels: [{ obj: marker(pl, -.05, -.05, 0), text: () => "Twisted rubber band", col: "#fbbf24" }],
    cam: { pos: new T.Vector3(0, 4.6, 5.6), target: new T.Vector3(0, 1.6, 0), fitW: 4.4 },
    update(R, dt, t) { const ft = Math.max(1, R.role("time", 20)), cyc = Math.min(30, ft) + 3; st.c = ((st.c == null ? 0 : st.c) + dt * (ft > 30 ? ft / 30 : 1)) % cyc; const c = st.c, flying = c < Math.min(30, ft), a = c * .6;
      const y = flying ? Math.min(2.4, .4 + c * .6) : Math.max(0, 2.4 - (c - Math.min(30, ft)) * 1.2); pl.position.set(Math.cos(a) * 2, y, Math.sin(a) * 1.2); pl.rotation.order = "YXZ"; pl.rotation.y = -a - Math.PI / 2; pl.rotation.x = flying ? -.45 : -.2; pl.rotation.z = flying ? .05 : -.25;
      prop.rotation.x += (flying ? 40 : 0) * dt; aL.userData.set(pl.position.clone().add(new T.Vector3(0, .25, 0)), UP, .4); return 0; } };
};

/* egg drop: a padded box falls from a stand; the padding squashes and the egg survives (or cracks) */
B.eggdrop = (R, st) => {
  const root = new T.Group(), H = 2, s = Math.max(.005, Math.min(.15, R.role("pad", .08)));
  const stand = new T.Group(); root.add(stand); stand.add(rod(new T.Vector3(-.5, 0, -.3), new T.Vector3(-.5, H + .3, -.3), .025, MAT.metal())); stand.add(rod(new T.Vector3(-.5, H + .3, -.3), new T.Vector3(0, H + .3, -.3), .02, MAT.metal())); const clamp = M(new T.BoxGeometry(.08, .06, .08), MAT.paint(0xef4444)); clamp.position.set(0, H + .27, -.3); stand.add(clamp);
  [[-.8, 0], [-.2, 0]].forEach(([x]) => stand.add(rod(new T.Vector3(-.5, .01, -.3), new T.Vector3(x - .2, .01, .2), .015, MAT.metal())));
  const box = new T.Group(); root.add(box); const bw = .22 + s * 1.6; const card = new T.MeshStandardMaterial({ color: 0xc8a06a, roughness: .9, transparent: true, opacity: .75, side: T.DoubleSide, depthWrite: false }); const shell = new T.Mesh(new T.BoxGeometry(bw, bw, bw), card); box.add(shell);
  const pad = M(new T.BoxGeometry(bw * .92, bw * .92, bw * .92), new T.MeshStandardMaterial({ color: 0xfde68a, roughness: 1, transparent: true, opacity: .35, depthWrite: false }), false); box.add(pad);
  const egg = M(new T.SphereGeometry(.028, 20, 14), new T.MeshStandardMaterial({ color: 0xfaf3e0, roughness: .5 })); egg.scale.y = 1.3; box.add(egg);
  const yolk = M(new T.CircleGeometry(.06, 20).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xfacc15 }), false); yolk.visible = false; root.add(yolk);
  const mat = M(new T.BoxGeometry(1, .02, 1), MAT.paint(0x334155), false, true); mat.position.y = .01; root.add(mat);
  const [aG] = kit(root, .08, 1);
  const mk = { load: egg, body: box, base: mat, top: clamp, stress: pad, cable: pad, goal: marker(root, .5, .3, 0) };
  return { root, anchors: mk, follow: null, ground: "none", labels: [{ obj: marker(pad, 0, bw * .6, 0), text: () => "Padding squashes slowly", col: "#22d3ee" }, { obj: marker(root, 0, H + .55, -.3), text: () => "Dropped from 2 m", col: "#fbbf24" }],
    cam: { pos: new T.Vector3(1.4, 1.3, 2.9), target: new T.Vector3(0, 1.1, -.2), fitW: 1.3 },
    update(R, dt, t) { const ok = R.ok, per = 4; st.c = ((st.c == null ? 0 : st.c) + dt) % per; const c = st.c, fall = Math.sqrt(2 * H / 9.81); let y, sq = 1;
      if (c < .8) y = H; else if (c < .8 + fall) { const tt = c - .8; y = H - .5 * 9.81 * tt * tt; } else { y = 0; const tt = c - .8 - fall; sq = Math.max(.82, 1 - Math.min(1, tt * 8) * .18); }
      box.position.set(0, Math.max(0, y) + bw / 2 * sq + .02, -.3); box.scale.set(1, sq, 1); const landed = c > .8 + fall; yolk.visible = landed && !ok; yolk.position.set(0, .025, -.3 + bw * .6); egg.material.color.set(landed && !ok ? 0xe5e7eb : 0xfaf3e0);
      aG.userData.set(new T.Vector3(.3, box.position.y + .1, 0), new T.Vector3(0, -1, 0), .3); return 0; } };
};

/* popsicle-stick bridge: two benches, a stick truss, a bucket of weights hanging in the middle */
B.popsicle = (R, st) => {
  const root = new T.Group(), L = Math.max(.3, R.role("span", .5)), h = Math.max(.04, R.role("height", .12)), stick = new T.MeshStandardMaterial({ map: TEX.wood([1, 1]), color: 0xe8c99b, roughness: .7 });
  [-1, 1].forEach(sd => { const b = M(new T.BoxGeometry(.4, .5, .4), MAT.paint(0x475569), true, true); b.position.set(sd * (L / 2 + .17), .25, 0); root.add(b); });
  const tr = new T.Group(); tr.position.y = .5; root.add(tr); const N = 6, dx = L / N;
  [-.04, .04].forEach(z => { tr.add(rod(new T.Vector3(-L / 2 - .02, 0, z), new T.Vector3(L / 2 + .02, 0, z), .006, stick)); tr.add(rod(new T.Vector3(-L / 2 + dx / 2, h, z), new T.Vector3(L / 2 - dx / 2, h, z), .006, stick));
    for (let i = 0; i < N; i++) { const x = -L / 2 + i * dx; tr.add(rod(new T.Vector3(x, 0, z), new T.Vector3(x + dx / 2, h, z), .005, stick)); tr.add(rod(new T.Vector3(x + dx / 2, h, z), new T.Vector3(x + dx, 0, z), .005, stick)); } });
  for (let i = 0; i <= N; i++) tr.add(rod(new T.Vector3(-L / 2 + i * dx, 0, -.04), new T.Vector3(-L / 2 + i * dx, 0, .04), .004, stick));
  const bucket = new T.Group(); root.add(bucket); bucket.add(lathe([[.05, 0], [.06, .1], [.065, .11]], 24, MAT.paint(0x2563eb))); bucket.add(rod(new T.Vector3(0, .11, 0), new T.Vector3(0, .3, 0), .002, MAT.dark()));
  [0, 1, 2].forEach(i => { const wgt = M(new T.CylinderGeometry(.03, .03, .025, 16), MAT.metal()); wgt.position.y = .02 + i * .027; bucket.add(wgt); });
  const [aW] = kit(root, .03, 1);
  const mk = { load: aW.userData.tip, stress: tr, top: marker(tr, 0, h, 0), base: marker(root, -L / 2, .5, 0), cable: tr, body: tr };
  return { root, anchors: mk, follow: null, ground: "none", labels: [{ obj: marker(tr, -L * .3, h + .03, .05), text: () => "Triangles share the load", col: "#22d3ee" }, { obj: aW.userData.tip, text: () => "Weights", col: "#fb7185" }],
    cam: { pos: new T.Vector3(.3, .85, L * 1.4 + .5), target: new T.Vector3(0, .45, 0), fitW: L * .75 + .35 },
    update(R, dt, t) { const ok = R.ok, sag = ok ? .003 : .02 + Math.sin(t * 7) * .002; tr.position.y = .5 - sag; tr.children.forEach(ch => { ch.rotation.x = ch.rotation.x; }); bucket.position.set(0, .5 - sag - .3 - (ok ? 0 : .01), 0); bucket.rotation.z = Math.sin(t * 1.2) * .03;
      aW.userData.set(new T.Vector3(.12, .4 - sag, .05), new T.Vector3(0, -1, 0), .12); return 0; } };
};

/* pizza-box solar oven: foil flap, plastic window, black floor, s'more inside, sunlight pouring in */
B.solaroven = (R, st) => {
  const root = new T.Group(), A = Math.max(.04, R.role("area", .12)), w = Math.sqrt(A * 1.3), d = A / w, bw = w + .12, bd = d + .12;
  const card = new T.MeshStandardMaterial({ color: 0xc8a06a, roughness: .95 }); const box = M(new T.BoxGeometry(bw, .06, bd), card, true, true); box.position.y = .03; root.add(box);
  const floor = M(new T.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: 0x0b0b0b, roughness: .9 }), false, true); floor.position.y = .061; root.add(floor);
  const win = M(new T.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new T.MeshPhysicalMaterial({ color: 0xffffff, roughness: .02, transparent: true, opacity: .2, depthWrite: false }), false); win.position.y = .07; root.add(win);
  const flap = new T.Group(); flap.position.set(0, .06, -bd / 2); root.add(flap); const fl = M(new T.BoxGeometry(bw, .006, bd), card); fl.position.z = -bd / 2; flap.add(fl); const foil = M(new T.PlaneGeometry(bw * .9, bd * .9), new T.MeshStandardMaterial({ color: 0xe5e7eb, metalness: 1, roughness: .15, side: T.DoubleSide })); foil.rotation.x = -Math.PI / 2; foil.position.set(0, .004, -bd / 2); flap.add(foil); flap.rotation.x = -1.05;
  const prop = rod(new T.Vector3(bw / 2 - .02, .06, -bd / 2), new T.Vector3(bw / 2 - .02, .3, -bd / 2 - .12), .004, MAT.dark()); root.add(prop);
  const smore = new T.Group(); smore.position.set(0, .07, 0); root.add(smore); [0, .03].forEach((y, i) => { const cr = M(new T.BoxGeometry(.07, .008, .07), new T.MeshStandardMaterial({ color: 0xc08a4a })); cr.position.y = y + .004; smore.add(cr); }); const choc = M(new T.BoxGeometry(.05, .006, .05), new T.MeshStandardMaterial({ color: 0x3f2314 })); choc.position.y = .012; smore.add(choc);
  const marsh = M(new T.CylinderGeometry(.025, .025, .02, 16), MAT.white()); marsh.position.y = .022; smore.add(marsh);
  const therm = new T.Group(); therm.position.set(bw / 2 + .08, 0, .05); root.add(therm); const tube0 = M(new T.CylinderGeometry(.008, .008, .2, 10), new T.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: .5 })); tube0.position.y = .12; therm.add(tube0); const red = M(new T.CylinderGeometry(.005, .005, 1, 10), MAT.paint(0xef4444)); therm.add(red); const bulb = M(new T.SphereGeometry(.012, 12, 8), MAT.paint(0xef4444)); bulb.position.y = .02; therm.add(bulb);
  const rays = particles(120, 0xffe28a, .02, { add: true, opacity: .9 }); root.add(rays);
  const [aS] = kit(root, .03, 1);
  const mk = { source: foil, converter: floor, load: smore, losses: marker(root, 0, .2, 0), body: box, inside: smore };
  return { root, anchors: mk, follow: null, ground: "grass", labels: [{ obj: aS.userData.tip, text: () => "Sunlight", col: "#fbbf24" }, { obj: marker(therm, 0, .26, 0), text: () => "Inside temperature", col: "#22d3ee" }],
    cam: { pos: new T.Vector3(.5, .7, .9), target: new T.Vector3(0, .1, -.05), fitW: bw * .9 + .15 },
    update(R, dt, t) { const T1 = Math.max(20, Math.min(120, R.role("temp", 60))), f = (T1 - 20) / 100; st.f = st.f == null ? 0 : Math.min(f, st.f + dt * .05); red.scale.y = .03 + st.f * .17; red.position.y = .02 + red.scale.y / 2; marsh.scale.set(1 + st.f * .5, 1 - st.f * .25, 1 + st.f * .5); choc.scale.set(1 + (R.ok ? st.f * .3 : 0), 1, 1 + (R.ok ? st.f * .3 : 0));
      spinPts(rays, dt, (q, i) => { if (Math.random() < .3) { q.pos[i * 3] = (Math.random() - .5) * w; q.pos[i * 3 + 1] = .8; q.pos[i * 3 + 2] = (Math.random() - .5) * d + .1; q.life[i] = .9; } else hide(q, i); }, (q, i, dt) => { q.pos[i * 3 + 1] -= .9 * dt; q.pos[i * 3 + 2] -= .12 * dt; if (q.pos[i * 3 + 1] < .07) q.life[i] = 0; });
      aS.userData.set(new T.Vector3(-bw * .3, .55, .1), new T.Vector3(.1, -1, -.1).normalize(), .25); return 0; } };
};

/* wind-up toy car: key turns, car rolls along the floor to the flag */
B.windupcar = (R, st) => {
  const root = new T.Group(), car = new T.Group(); root.add(car); car.scale.setScalar(2.4); const goal = Math.max(1, R.role("goal", 3)), k = 2.4 / goal;
  const body = M(new T.CapsuleGeometry(.05, .1, 8, 16), MAT.paint(0xf43f5e)); body.rotation.z = Math.PI / 2; body.position.y = .07; body.scale.set(1, 1, .8); car.add(body);
  const cab = M(new T.SphereGeometry(.04, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.glass()); cab.position.set(.01, .1, 0); car.add(cab);
  const wheels = []; [[-.06, 1], [-.06, -1], [.06, 1], [.06, -1]].forEach(([x, sd]) => { const wl = M(new T.CylinderGeometry(.025, .025, .015, 18).rotateX(Math.PI / 2), MAT.rubber()); wl.position.set(x, .025, sd * .045); car.add(wl); wheels.push(wl); });
  const key = new T.Group(); key.position.set(-.04, .11, -.05); car.add(key); key.add(rod(new T.Vector3(0, 0, 0), new T.Vector3(0, 0, -.03), .004, MAT.metal())); [-1, 1].forEach(sd => { const e = M(new T.TorusGeometry(.012, .003, 6, 16), MAT.metal()); e.position.set(sd * .014, 0, -.035); key.add(e); });
  tapeLine(root, 0, goal * k * 1.25, 0, -.1, .25 * Math.max(1, Math.round(goal / 3))); const fl = flagAt(root, goal * k, 0, -.1, .5);
  const [aF] = kit(root, .05, 1);
  const mk = { motor: key, battery: key, wheels: wheels[0], body, goal: marker(fl, 0, .25, 0), speed: aF.userData.tip, drag: aF.userData.tip };
  return { root, anchors: mk, follow: null, ground: "none", labels: [{ obj: marker(key, 0, .05, 0), text: () => "Wound-up spring", col: "#fbbf24" }, { obj: marker(fl, 0, .3, 0), text: () => Math.round(goal) + " m goal", col: "#fbbf24" }],
    cam: { pos: new T.Vector3(goal * k * .45, .55, 1.5), target: new T.Vector3(goal * k * .45, .05, 0), fitW: goal * k * .6 + .25 },
    update(R, dt, t) { const dist = Math.min(goal * k * 1.15, Math.max(.05, R.role("dist", 1)) * k), per = 5; st.c = ((st.c == null ? 0 : st.c) + dt) % per; const c = st.c; let x;
      if (c < 1) { x = 0; key.rotation.z = c * 12; } else { const f = Math.min(1, (c - 1) / 3); x = dist * (1 - Math.pow(1 - f, 2)); key.rotation.z = 12 - f * 12; }
      car.position.x = x; wheels.forEach(w => w.rotation.z = -x / .06); aF.userData.set(new T.Vector3(x + .3, .2, .15), new T.Vector3(1, 0, 0), c > 1 && c < 4 ? .12 : .02); return 0; } };
};

/* straw rocket: a paper rocket slides off a straw and flies to a hoop */
B.strawrocket = (R, st) => {
  const root = new T.Group(), Rg = Math.max(.3, R.role("range", 5)), goal = Math.max(1, R.role("goal", 5)), k = 3 / Math.max(goal, Rg);
  const kid = figure(0x0ea5e9, 0x1f2937); kid.position.set(-.5, 0, 0); kid.scale.setScalar(.8); root.add(kid); kid.userData.arms[1].rotation.z = 1.5;
  const straw = M(new T.CylinderGeometry(.006, .006, .25, 8), MAT.paint(0xf472b6)); straw.rotation.z = Math.PI / 2 - .78; straw.position.set(-.3, 1.22, .1); root.add(straw);
  const rk = new T.Group(); root.add(rk); const tb = M(new T.CylinderGeometry(.012, .012, .14, 12), new T.MeshStandardMaterial({ color: 0xfde047, roughness: .8 })); tb.rotation.z = -Math.PI / 2; rk.add(tb); const nose = M(new T.ConeGeometry(.012, .04, 12), MAT.paint(0xef4444)); nose.rotation.z = -Math.PI / 2; nose.position.x = .09; rk.add(nose);
  [0, 1, 2].forEach(i => { const f = M(new T.BoxGeometry(.03, .002, .025), MAT.paint(0x2563eb)); f.position.x = -.06; const h = new T.Group(); h.rotation.x = i * 2.09; f.position.y = .018; h.add(f); rk.add(h); });
  rk.scale.setScalar(2);
  const hoop = M(new T.TorusGeometry(.25, .015, 8, 40), MAT.paint(0x22c55e)); hoop.position.set(goal * k, .9, 0); hoop.rotation.y = Math.PI / 2; root.add(hoop); root.add(rod(new T.Vector3(goal * k, 0, 0), new T.Vector3(goal * k, .65, 0), .01, MAT.metal()));
  const pathG = new T.BufferGeometry().setFromPoints([...Array(30)].map(() => new T.Vector3())), path = new T.Line(pathG, new T.LineDashedMaterial({ color: 0xffffff, dashSize: .05, gapSize: .05 })); root.add(path);
  const mk = { tank: rk, body: rk, engine: straw, thrust: straw, goal: marker(hoop, 0, .35, 0), gravity: marker(root, goal * k * .5, .2, 0), drag: rk };
  return { root, anchors: mk, follow: null, ground: "none", labels: [{ obj: marker(hoop, 0, .4, 0), text: () => Math.round(goal) + " m hoop", col: "#22c55e" }, { obj: marker(straw, 0, .15, 0), text: () => "Blow!", col: "#fbbf24" }],
    cam: { pos: new T.Vector3(goal * k * .4, 1.3, 3.4), target: new T.Vector3(goal * k * .4, .8, 0), fitW: goal * k * .58 + .6 },
    update(R, dt, t) { const land = Rg * k - .2, per = 4; st.c = ((st.c == null ? 0 : st.c) + dt) % per; const c = st.c, x0 = -.2, y0 = 1.32, apex = Math.max(.3, land * .25); let x, y;
      if (c < .6) { x = x0; y = y0; } else { const f = Math.min(1, (c - .6) / 1.6); x = x0 + (land - x0) * f; y = Math.max(.02, y0 * (1 - f) + 4 * apex * f * (1 - f)); }
      rk.position.set(x, y, .1); const f2 = Math.min(1, Math.max(0, (c - .6) / 1.6)), dy = (-y0 + 4 * apex * (1 - 2 * f2)) / (land - x0); rk.rotation.z = c < .6 ? .78 : Math.atan(dy);
      const pp = pathG.attributes.position; for (let i = 0; i < 30; i++) { const f = i / 29; pp.setXYZ(i, x0 + (land - x0) * f, Math.max(.02, y0 * (1 - f) + 4 * apex * f * (1 - f)), .1); } pp.needsUpdate = true; path.computeLineDistances(); return 0; } };
};

/* marble run: a curved wooden ramp ends at a table edge; the marble jumps the gap into a cup */
B.marblerun = (R, st) => {
  const root = new T.Group(), hm = Math.max(.03, R.role("height", .2)), H = .2, gap = .25, top = benchTop(root, 1.3, .6, .7), kx = -.25;
  const wood = new T.MeshStandardMaterial({ map: TEX.wood([1, 1]), color: 0xd6b48a, roughness: .7 }); const pts = []; for (let i = 0; i <= 40; i++) { const u = i / 40, x = kx - .4 + u * .4, y = top + H + hm * Math.pow(1 - u, 2); pts.push(new T.Vector3(x, y, 0)); }
  const crv = new T.CatmullRomCurve3(pts); [-.012, .012].forEach(z => root.add(M(new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(p => p.clone().setZ(z))), 60, .004, 6), wood)));
  root.add(rod(new T.Vector3(kx - .4, top, 0), new T.Vector3(kx - .4, top + H + hm, 0), .008, MAT.dark())); const blk = M(new T.BoxGeometry(.4, H, .1), wood, true, true); blk.position.set(kx - .2, top + H / 2, 0); root.add(blk);
  const moat = M(new T.PlaneGeometry(gap, .3).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: 0x38bdf8, roughness: .2 }), false); moat.position.set(kx + gap / 2, top + .002, 0); root.add(moat);
  const pad = M(new T.PlaneGeometry(.3, .3).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: 0x22c55e, roughness: .6 }), false); pad.position.set(kx + gap + .15, top + .002, 0); root.add(pad);
  const marble = M(new T.SphereGeometry(.012, 20, 14), new T.MeshPhysicalMaterial({ color: 0x2563eb, roughness: .05, clearcoat: 1 })); root.add(marble);
  const splash = particles(40, 0x7dd3fc, .015, { opacity: .9 }); root.add(splash);
  const mk = { top: marker(root, kx - .4, top + H + hm + .03, 0), base: marker(root, kx, top + H, 0), goal: marker(pad, 0, .05, 0), speed: marble, body: marble, load: marble, cable: marble, stress: marble };
  return { root, anchors: mk, follow: null, ground: "none", labels: [{ obj: marker(moat, 0, .06, 0), text: () => "25 cm gap", col: "#fbbf24" }, { obj: marker(pad, 0, .08, 0), text: () => "Landing pad", col: "#4ade80" }],
    cam: { pos: new T.Vector3(-.05, top + .4, 1.15), target: new T.Vector3(-.05, top + .13, 0), fitW: .75 },
    update(R, dt, t) { const d = Math.max(.01, R.role("dist", .25)), per = 4; st.c = ((st.c == null ? 0 : st.c) + dt) % per; const c = st.c, y0 = top + H + .012, tf = Math.sqrt(2 * H / 9.81), lands = d >= gap; let splashing = false;
      if (c < 1.2) { crv.getPointAt(Math.min(1, Math.pow(c / 1.2, 1.6)), V); marble.position.set(V.x, V.y + .012, 0); }
      else { const tt = (c - 1.2) * .35, f = Math.min(1, tt / tf); if (f < 1) marble.position.set(kx + d * f, y0 - H * f * f, 0); else { const roll = lands ? Math.min(.08, (tt - tf) * .3) : 0; marble.position.set(kx + d + roll, lands ? top + .012 : top - .005, 0); splashing = !lands && tt - tf < .1; } }
      spinPts(splash, dt, (q, i) => { if (splashing && Math.random() < .8) { q.pos[i * 3] = kx + d; q.pos[i * 3 + 1] = top + .01; q.pos[i * 3 + 2] = 0; q.vel[i * 3] = (Math.random() - .5) * .4; q.vel[i * 3 + 1] = .4 + Math.random() * .4; q.vel[i * 3 + 2] = (Math.random() - .5) * .4; q.life[i] = .4; } else if (q.life[i] <= 0) hide(q, i); }, (q, i, dt) => { q.vel[i * 3 + 1] -= 9.8 * dt; q.pos[i * 3] += q.vel[i * 3] * dt; q.pos[i * 3 + 1] += q.vel[i * 3 + 1] * dt; q.pos[i * 3 + 2] += q.vel[i * 3 + 2] * dt; });
      return 0; } };
};

B.paperheli = (R, st) => {
  const root = new T.Group(), heli = new T.Group(); root.add(heli); const r = Math.max(.03, Math.min(.14, R.role("size", .08))), paper = new T.MeshStandardMaterial({ color: 0xfef08a, roughness: .9, side: T.DoubleSide });
  const stem = M(new T.BoxGeometry(.03, .1, .002), paper); stem.position.y = -.05; heli.add(stem); const clip = M(new T.TorusGeometry(.008, .0015, 6, 14), MAT.metal()); clip.position.y = -.1; heli.add(clip);
  [-1, 1].forEach(sd => { const b = M(new T.BoxGeometry(r, .002, .03), paper); b.position.set(sd * r / 2, .002, 0); b.rotation.x = sd * .25; heli.add(b); });
  heli.scale.setScalar(3);
  const [aD, aW] = kit(root, .05, 2);
  const mk = { wing: heli, rotor: heli, rotors: heli, body: stem, drag: aD.userData.tip, lift: aD.userData.tip, weight: aW.userData.tip, envelope: heli };
  return { root, anchors: mk, follow: null, ground: "none", labels: [{ obj: aD.userData.tip, text: () => "Air pushes up", col: "#22d3ee" }, { obj: aW.userData.tip, text: () => "Weight", col: "#fb7185" }],
    cam: { pos: new T.Vector3(.5, 1.1, 2.3), target: new T.Vector3(0, 1, 0), fitW: .9 },
    update(R, dt, t) { const v = Math.max(.2, Math.min(4, R.role("speed", 1))); st.y = st.y == null ? 2 : st.y - v * .6 * dt; if (st.y < .1) st.y = 2; heli.position.set(Math.sin(t * .7) * .05, st.y, 0); heli.rotation.y += (R.ok ? 9 : 4) * dt;
      aD.userData.set(heli.position.clone().add(new T.Vector3(.3, .05, 0)), UP, .25); aW.userData.set(heli.position.clone().add(new T.Vector3(-.3, 0, 0)), new T.Vector3(0, -1, 0), .2); return 0; } };
};

/* lemon battery: lemons with a copper coin and a zinc nail each, wired in a row to an LED */
B.lemon = (R, st) => {
  const root = new T.Group(), top = benchTop(root, 1.6, .7, .7), n = Math.max(1, Math.min(6, Math.round(R.role("cells", 3)))), sp = .16, x0 = -(n - 1) * sp / 2 - .15;
  const lm = new T.MeshStandardMaterial({ color: 0xfacc15, roughness: .55 }), cu = new T.MeshStandardMaterial({ color: 0xb87333, metalness: 1, roughness: .3 }), zn = new T.MeshStandardMaterial({ color: 0x9ca3af, metalness: 1, roughness: .35 });
  const ends = []; for (let i = 0; i < n; i++) { const x = x0 + i * sp, l = M(new T.SphereGeometry(.055, 24, 16), lm); l.scale.set(1.3, .9, 1); l.position.set(x, top + .05, 0); root.add(l);
    const coin = M(new T.CylinderGeometry(.015, .015, .003, 18), cu); coin.rotation.x = Math.PI / 2; coin.position.set(x - .03, top + .1, 0); root.add(coin); const nail = M(new T.CylinderGeometry(.003, .003, .06, 8), zn); nail.position.set(x + .03, top + .11, 0); root.add(nail); ends.push([new T.Vector3(x - .03, top + .115, 0), new T.Vector3(x + .03, top + .14, 0)]); }
  const wire = (a, b, col) => root.add(tube([[a.x, a.y, a.z], [(a.x + b.x) / 2, Math.max(a.y, b.y) + .05, .02], [b.x, b.y, b.z]], .002, MAT.paint(col), 16));
  for (let i = 0; i < n - 1; i++) wire(ends[i][1], ends[i + 1][0], 0x22c55e);
  const ledX = x0 + (n - 1) * sp + .22, ledP = new T.Vector3(ledX, top + .06, 0); const led = M(new T.SphereGeometry(.012, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0, transparent: true, opacity: .9 })); led.position.copy(ledP); root.add(led);
  const ledB = M(new T.CylinderGeometry(.012, .012, .015, 16), new T.MeshStandardMaterial({ color: 0xef4444, transparent: true, opacity: .8 })); ledB.position.set(ledX, top + .052, 0); root.add(ledB); const glow = M(new T.SphereGeometry(.05, 16, 10), MAT.glow(0xff4d4d, 0), false); glow.position.copy(ledP); root.add(glow);
  wire(ends[n - 1][1], new T.Vector3(ledX + .008, top + .045, 0), 0xef4444); wire(ends[0][0], new T.Vector3(ledX - .008, top + .045, 0), 0x111827);
  const mk = { source: marker(root, x0, top + .2, 0), converter: marker(root, 0, top + .2, 0), load: led, losses: marker(root, x0, top + .25, 0), body: led, battery: marker(root, x0, top + .1, 0) };
  return { root, anchors: mk, follow: null, ground: "none", labels: [{ obj: marker(root, x0, top + .18, 0), text: () => "Copper + zinc in lemon juice", col: "#fbbf24" }, { obj: marker(led, 0, .04, 0), text: () => "LED", col: "#fb7185" }],
    cam: { pos: new T.Vector3(.1, top + .55, .95), target: new T.Vector3(.05, top + .07, 0), fitW: (n - 1) * sp * .7 + .5 },
    update(R, dt, t) { const on = R.ok ? Math.min(1, .5 + (R.margin - 1) * 2) : Math.max(0, (R.frac - .7) * .6); led.material.emissiveIntensity = on * 3; glow.material.opacity = on * .45 * (1 + Math.sin(t * 3) * .05); return 0; } };
};

/* hand-crank flashlight: turn the handle, the beam lights the wall */
B.crankflash = (R, st) => {
  const root = new T.Group(), top = benchTop(root, 1.4, .7, .7), fl = new T.Group(); fl.position.set(-.2, top + .05, 0); root.add(fl);
  const body = M(new T.CylinderGeometry(.04, .04, .22, 24), MAT.paint(0xf97316)); body.rotation.z = Math.PI / 2; fl.add(body); const head = M(new T.CylinderGeometry(.06, .045, .06, 24), MAT.dark()); head.rotation.z = Math.PI / 2; head.position.x = .13; fl.add(head);
  const lens = M(new T.CircleGeometry(.055, 24), new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3c4, emissiveIntensity: 0 })); lens.rotation.y = Math.PI / 2; lens.position.x = .161; fl.add(lens);
  const crank = new T.Group(); crank.position.set(-.02, 0, .045); fl.add(crank); const rr = Math.max(.02, Math.min(.07, R.role("size", .04))); const arm = M(new T.BoxGeometry(.012, rr, .008), MAT.dark()); arm.position.y = rr / 2; crank.add(arm); const knob = M(new T.CylinderGeometry(.008, .008, .03, 12).rotateX(Math.PI / 2), MAT.paint(0x111827)); knob.position.set(0, rr, .02); crank.add(knob);
  const beam = M(new T.ConeGeometry(.22, 1.1, 32, 1, true), new T.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending }), false); beam.rotation.z = Math.PI / 2; beam.position.set(.16 + .55, 0, 0); fl.add(beam);
  const wall = M(new T.PlaneGeometry(1.2, 1), new T.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 1 }), false, true); wall.rotation.y = -Math.PI / 2; wall.position.set(.9, top + .4, 0); root.add(wall);
  const spot = M(new T.CircleGeometry(.2, 32), MAT.glow(0xfff3c4, 0), false); spot.rotation.y = -Math.PI / 2; spot.position.set(.895, top + .05, 0); root.add(spot);
  const mk = { source: crank, converter: body, load: lens, losses: marker(fl, 0, .1, 0), body, motor: crank };
  return { root, anchors: mk, follow: null, ground: "none", labels: [{ obj: marker(crank, 0, rr + .04, 0), text: () => "Crank by hand", col: "#fbbf24" }, { obj: marker(spot, 0, .32, 0), text: () => "Light on the wall", col: "#22d3ee" }],
    cam: { pos: new T.Vector3(.1, top + .45, 1.3), target: new T.Vector3(.3, top + .12, 0), fitW: .85 },
    update(R, dt, t) { const rpm = Math.max(10, R.role("rpm", 60)); crank.rotation.z -= rpm / 60 * 6.283 * dt; const b = R.ok ? Math.min(1, .6 + (R.margin - 1) * .4) : R.frac * .35; lens.material.emissiveIntensity = b * 3; beam.material.opacity = b * .05; spot.material.opacity = b * .55; return 0; } };
};

/* toy sailboat in a tub, pushed by a desk fan */
B.toysail = (R, st) => {
  const root = new T.Group(), A = Math.max(.004, R.role("area", .03)), tubL = 1.4, tubW = .6;
  const tubM = new T.MeshStandardMaterial({ color: 0xf8fafc, roughness: .3 }); const tub = M(new T.BoxGeometry(tubL + .1, .4, tubW + .1), tubM, true, true); tub.position.y = .2; root.add(tub);
  const water = M(new T.PlaneGeometry(tubL, tubW).rotateX(-Math.PI / 2), new T.MeshPhysicalMaterial({ color: 0x7dd3fc, roughness: .05, transparent: true, opacity: .85, clearcoat: 1 }), false, true); water.position.y = .405; root.add(water);
  const boat = new T.Group(); root.add(boat); const hull = M(new T.CapsuleGeometry(.03, .1, 6, 12), MAT.paint(0xef4444)); hull.rotation.z = Math.PI / 2; hull.scale.set(1, 1, .6); boat.add(hull);
  const hs = Math.sqrt(A) * 1.6, mast = M(new T.CylinderGeometry(.003, .003, hs + .02, 8), MAT.dark()); mast.position.y = (hs + .02) / 2; boat.add(mast); const sail = M(new T.PlaneGeometry(hs * .8, hs), new T.MeshStandardMaterial({ color: 0xffffff, side: T.DoubleSide })); sail.rotation.y = Math.PI / 2; sail.position.set(-.005, hs / 2 + .02, 0); boat.add(sail);
  const fan = new T.Group(); fan.position.set(-tubL / 2 - .3, .55, 0); root.add(fan); const cage = M(new T.TorusGeometry(.14, .008, 8, 32), MAT.metal()); cage.rotation.y = Math.PI / 2; fan.add(cage); const blades = new T.Group(); fan.add(blades); [0, 1, 2].forEach(i => { const b = M(new T.BoxGeometry(.004, .11, .05), MAT.paint(0x3b82f6)); b.position.y = .06; const h = new T.Group(); h.rotation.x = i * 2.09; b.rotation.y = .5; h.add(b); blades.add(h); }); fan.add(rod(new T.Vector3(0, -.14, 0), new T.Vector3(0, -.55, 0), .015, MAT.dark()));
  const wind = particles(120, 0xffffff, .015, { opacity: .5 }); root.add(wind);
  const [aW] = kit(root, .03, 1);
  const mk = { sail, hull, prop: blades, buoyancy: aW.userData.tip, drag: marker(boat, .12, 0, 0), wake: marker(boat, -.1, 0, 0), body: boat };
  return { root, anchors: mk, follow: null, ground: "none", labels: [{ obj: aW.userData.tip, text: () => "Fan wind", col: "#22d3ee" }],
    cam: { pos: new T.Vector3(0, 1.1, 1.5), target: new T.Vector3(0, .45, 0), fitW: 1.1 },
    update(R, dt, t) { const u = Math.max(.02, R.role("speed", .3)); st.x = st.x == null ? -tubL / 2 + .1 : st.x + u * .8 * dt; if (st.x > tubL / 2 - .1) st.x = -tubL / 2 + .1; boat.position.set(st.x, .41 + Math.sin(t * 3) * .003, 0); boat.rotation.z = Math.sin(t * 2) * .03; blades.rotation.x += 30 * dt;
      spinPts(wind, dt, (q, i) => { if (Math.random() < .3) { q.pos[i * 3] = -tubL / 2 - .2; q.pos[i * 3 + 1] = .45 + Math.random() * .25; q.pos[i * 3 + 2] = (Math.random() - .5) * .25; q.life[i] = .8; } else hide(q, i); }, (q, i, dt) => { q.pos[i * 3] += 1.6 * dt; });
      aW.userData.set(new T.Vector3(-tubL / 2 - .1, .8, 0), new T.Vector3(1, 0, 0), .3); return 0; } };
};

/* spinning top on a table */
B.spintop = (R, st) => {
  const root = new T.Group(), top0 = benchTop(root, 1, .7, .7), r = Math.max(.01, Math.min(.06, R.role("size", .03))), tp = new T.Group(); tp.position.y = top0; tp.scale.setScalar(2.5); root.add(tp);
  const spin = new T.Group(); tp.add(spin); const body = lathe([[0, 0], [r * .15, r * .3], [r, r * .9], [r * 1.02, r * 1.1], [r * .6, r * 1.4], [r * .12, r * 1.45], [r * .12, r * 2.6], [0, r * 2.6]], 40, MAT.paint(0xdc2626)); spin.add(body);
  const stripe = M(new T.TorusGeometry(r * .99, r * .06, 8, 40), MAT.paint(0xfacc15)); stripe.rotation.x = Math.PI / 2; stripe.position.y = r * 1.0; spin.add(stripe); for (let i = 0; i < 6; i++) { const d = M(new T.SphereGeometry(r * .12, 10, 8), MAT.paint(0x2563eb)); const a = i * 1.047; d.position.set(Math.cos(a) * r * .75, r * 1.25, Math.sin(a) * r * .75); spin.add(d); }
  const [aS] = kit(root, .02, 1);
  const mk = { body, wheels: spin, rotor: spin, motor: spin, speed: aS.userData.tip, goal: aS.userData.tip, load: spin };
  return { root, anchors: mk, follow: null, ground: "none", labels: [{ obj: marker(tp, 0, r * 3.4, 0), text: () => "Spinning", col: "#22d3ee" }],
    cam: { pos: new T.Vector3(r * 10, top0 + r * 9, r * 22 + .2), target: new T.Vector3(0, top0 + r * 3, 0), fitW: r * 14 + .08 },
    update(R, dt, t) { const ft = Math.max(1, R.role("time", 30)), cyc = Math.min(12, ft * .4) + 2.5; st.c = ((st.c == null ? 0 : st.c) + dt) % cyc; const c = st.c, alive = c < cyc - 2.5, f = alive ? c / (cyc - 2.5) : 1;
      spin.rotation.y += (alive ? 40 * (1 - f * .7) : 0) * dt; const tilt = alive ? .03 + f * f * .25 : Math.min(1.2, .3 + (c - (cyc - 2.5)) * 1.5); tp.rotation.z = tilt; tp.rotation.y += (alive ? 2 + f * 4 : 0) * dt;
      aS.userData.set(new T.Vector3(r * 5, top0 + r * 7, 0), new T.Vector3(0, 0, 1), r * 5); return 0; } };
};

/* bike gears on a hill: chainring and cog sizes show the gear */
B.bikegears = (R, st) => {
  const root = new T.Group(), slope = Math.atan(.1 * 1.4), tilt = new T.Group(); tilt.rotation.z = slope; root.add(tilt);
  const road = M(new T.PlaneGeometry(40, 5).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ map: TEX.asphalt([6, 1]), roughness: .9 }), false, true); tilt.add(road); const roadTex = road.material.map;
  const bike = buildBike(true); bike.scale.setScalar(1.5); tilt.add(bike); const nf = Math.max(20, R.role("front", 34)), nr = Math.max(10, R.role("rear", 28));
  const ringM = new T.MeshStandardMaterial({ color: 0xd1d5db, metalness: .9, roughness: .3 }); const ring = M(new T.TorusGeometry(nf / 52 * .14, .008, 8, 40), ringM); ring.position.set(0, .35, .06); bike.add(ring); const cog = M(new T.TorusGeometry(nr / 34 * .09, .008, 8, 32), ringM); cog.position.set(-.55, .35, .06); bike.add(cog);
  bike.add(tube([[0, .35 + nf / 52 * .14, .06], [-.55, .35 + nr / 34 * .09, .06]], .004, MAT.dark(), 4)); bike.add(tube([[0, .35 - nf / 52 * .14, .06], [-.55, .35 - nr / 34 * .09, .06]], .004, MAT.dark(), 4));
  const [aP, aG] = kit(root, .4, 2);
  const mk = { motor: ring, wheels: cog, body: marker(bike, 0, 1.3, 0), goal: aP.userData.tip, speed: marker(bike, .2, 1.9, 0), drag: aG.userData.tip, battery: ring };
  return { root, anchors: mk, follow: null, ground: "grass", labels: [{ obj: marker(ring, 0, .25, 0), text: () => "Front gear", col: "#fbbf24" }, { obj: aG.userData.tip, text: () => "Hill pulls back", col: "#fb7185" }],
    cam: { pos: new T.Vector3(1.4, 1.8, 4.2), target: new T.Vector3(0, 1, 0), fitW: 2.3 },
    update(R, dt, t) { const v = R.ok ? 1 : .35; st.a = (st.a || 0) + dt * (R.ok ? 1.2 * nr / nf * 1.5 : .3); pedal(bike, st.a); ring.rotation.z = -st.a; cog.rotation.z = -st.a * nf / nr; bike.userData.wheels.forEach(w => w.rotation.z = -st.a * nf / nr); roadTex.offset.x += v * dt * .05;
      const up = new T.Vector3(Math.cos(slope), Math.sin(slope), 0); aP.userData.set(new T.Vector3(.9 * Math.cos(slope), .4 + .9 * Math.sin(slope), .6), up, .8 * (R.ok ? 1 : .4)); aG.userData.set(new T.Vector3(-.9 * Math.cos(slope), .3 - .9 * Math.sin(slope), .6), up.clone().negate(), .7); return 0; } };
};

/* pinwheel turbine: a pinwheel spins a tiny motor that lights an LED */
B.pinwheel = (R, st) => {
  const root = new T.Group(), Dm = Math.max(.1, Math.min(.45, R.role("size", .3))), r = Dm / 2, pw = new T.Group(); pw.position.set(0, 1.1, 0); root.add(pw);
  root.add(rod(new T.Vector3(0, 0, -.03), new T.Vector3(0, 1.1, -.03), .01, MAT.paint(0x8b5e34)));
  const cols = [0xef4444, 0x3b82f6, 0x22c55e, 0xfacc15]; const blades = new T.Group(); pw.add(blades); for (let i = 0; i < 4; i++) { const sh = new T.Shape(); sh.moveTo(0, 0); sh.lineTo(r, 0); sh.quadraticCurveTo(r * .8, r * .5, r * .15, r * .85); sh.closePath(); const b = M(new T.ShapeGeometry(sh, 10), new T.MeshStandardMaterial({ color: cols[i], side: T.DoubleSide, roughness: .6 })); b.rotation.z = i * Math.PI / 2; b.rotation.y = .25; blades.add(b); }
  const hub = M(new T.CylinderGeometry(.015, .015, .02, 12).rotateX(Math.PI / 2), MAT.paint(0x111827)); pw.add(hub);
  const mot = M(new T.CylinderGeometry(.018, .018, .04, 16).rotateX(Math.PI / 2), MAT.metal()); mot.position.set(0, 0, -.04); pw.add(mot);
  const led = M(new T.SphereGeometry(.012, 14, 10), new T.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 0 })); led.position.set(.2, .7, -.03); root.add(led); const glow = M(new T.SphereGeometry(.05, 14, 10), MAT.glow(0x4ade80, 0), false); glow.position.copy(led.position); root.add(glow);
  root.add(tube([[0, 1.08, -.06], [.05, .9, -.05], [.2, .72, -.03]], .002, MAT.paint(0xef4444), 12));
  const air = particles(140, 0xffffff, .02, { opacity: .5 }); root.add(air);
  const [aW] = kit(root, .05, 1);
  const mk = { source: blades, converter: mot, load: led, losses: marker(pw, 0, r + .05, 0), body: pw, rotor: blades };
  return { root, anchors: mk, follow: null, ground: "grass", labels: [{ obj: aW.userData.tip, text: () => "Wind", col: "#22d3ee" }, { obj: marker(led, 0, .05, 0), text: () => "LED", col: "#4ade80" }],
    cam: { pos: new T.Vector3(.7, 1.15, 1.1), target: new T.Vector3(.05, .95, 0), fitW: .7 },
    update(R, dt, t) { const w = Math.max(1, R.role("wind", 4)); blades.rotation.z -= w * 2.2 * dt; const on = R.ok ? Math.min(1, .6 + (R.margin - 1) * .3) : Math.max(0, R.frac - .6); led.material.emissiveIntensity = on * 3; glow.material.opacity = on * .4;
      spinPts(air, dt, (q, i) => { if (Math.random() < .3) { q.pos[i * 3] = (Math.random() - .5) * .5; q.pos[i * 3 + 1] = 1.1 + (Math.random() - .5) * .4; q.pos[i * 3 + 2] = .6; q.life[i] = .8; } else hide(q, i); }, (q, i, dt) => { q.pos[i * 3 + 2] -= w * .25 * dt; });
      aW.userData.set(new T.Vector3(-.25, 1.35, .5), new T.Vector3(0, 0, -1), .3); return 0; } };
};

B.custom = (R, st) => {
  const sc = R.sc, parts = sc.parts || [], root = new T.Group(), obj = new T.Group(); root.add(obj); const byName = {}, list = [];
  parts.forEach((p, i) => { const g = new T.Group(), m = M(partGeo(p), partMat(p.material, p.color)); g.add(m); const pos = p.pos || [0, 0, 0], rot = p.rot || [0, 0, 0];
    g.position.set(+pos[0] || 0, +pos[1] || 0, +pos[2] || 0); g.rotation.set(T.MathUtils.degToRad(+rot[0] || 0), T.MathUtils.degToRad(+rot[1] || 0), T.MathUtils.degToRad(+rot[2] || 0));
    const par = p.parent && byName[p.parent] ? byName[p.parent] : obj; par.add(g); byName[p.name || ("part" + i)] = g; list.push({ g, p }); });
  obj.updateMatrixWorld(true); const box = new T.Box3().setFromObject(obj), size = box.getSize(new T.Vector3()), h = Math.max(.2, size.y), L = Math.max(size.x, size.z, .4), sc2 = Math.max(.5, Math.max(L, h) / 4);
  const motion = sc.motion || "none", flies = motion === "lift", drives = motion === "drive", floats = motion === "float", dives = motion === "dive";
  const aU = arrow3(0x22d3ee, sc2 * .8), aD = arrow3(0xfb7185, sc2 * .8); root.add(aU, aD);
  const mk = { body: marker(obj, 0, h * .5, 0), top: marker(obj, 0, h, 0), base: marker(obj, 0, 0, 0) };
  Object.keys(byName).forEach(n => mk[n] = byName[n]);
  ["load", "source", "converter", "losses", "engine", "motor", "battery", "fans", "levels", "wing", "hull", "envelope", "inside", "outlet", "inlet", "chimney", "pressure", "speed", "wheels", "goal", "stress", "cable", "airfoil", "basket", "tank", "sail", "prop", "wake", "burner", "hotair", "downwash"].forEach(n => { if (!mk[n]) mk[n] = mk.body; });
  Object.assign(mk, { thrust: aU.userData.tip, buoyancy: aU.userData.tip, lift: aU.userData.tip, weight: aD.userData.tip, gravity: aD.userData.tip, drag: aD.userData.tip });
  let lr = R; const env = () => Object.assign({ margin: lr.margin, ok: lr.ok ? 1 : 0, t: lr.t }, lr.env);
  return { root, anchors: mk, follow: flies || dives ? obj : null, ground: drives ? "road" : "grass", water: floats, moving: drives,
    labels: [{ obj: aU.userData.tip, text: () => "Have: " + lr.H.haveL, col: "#22d3ee" }, { obj: aD.userData.tip, text: () => "Need: " + lr.H.needL, col: "#fb7185" }],
    cam: { pos: new T.Vector3(L * 1.3 + h * .4 + 2, h * .8 + 1, L * 1.6 + h * .6 + 3), target: new T.Vector3(0, h * .45, 0) },
    update(R, dt, t) { lr = R; const e = env();
      list.forEach(({ g, p }) => {
        if (p._spin) { let w = 0; try { w = p._spin(e); } catch (err) {} if (!isFinite(w)) w = 0; w = Math.max(-60, Math.min(60, w)); const ax = p.spin.axis || "y"; g.rotation[ax] += w * dt; }
        if (p._scale) { let k = 1; try { k = p._scale(e); } catch (err) {} if (!isFinite(k)) k = 1; k = Math.max(.05, Math.min(20, k)); const ax = p.scaleWith.axis; if (ax === "x" || ax === "y" || ax === "z") { g.scale.set(1, 1, 1); g.scale[ax] = k; } else g.scale.setScalar(k); }
        if (p._glow && g.children[0].material.emissive) { let k = 1; try { k = p._glow(e); } catch (err) {} g.children[0].material.emissiveIntensity = Math.max(0, Math.min(6, 2.2 * (isFinite(k) ? k : 1))); } });
      if (flies) { const tgt = R.ok ? .5 : 0; st.alt = st.alt == null ? tgt : st.alt + (tgt - st.alt) * Math.min(1, dt); obj.position.y = st.alt * Math.max(6, h * 4) + (R.ok ? Math.sin(t * 1.5) * .08 * sc2 : 0); obj.rotation.z = !R.ok && R.margin > .3 ? Math.sin(t * 30) * .005 : 0; }
      if (dives) { obj.position.y = 3 + Math.sin(t * .6) * .25 - (R.ok ? 0 : (1 - R.frac) * 2.5); obj.rotation.z = Math.sin(t * .4) * .02; obj.rotation.y = Math.sin(t * .15) * .1; }
      if (floats) { obj.position.y = waveH(0, 0, t) * .6 - (R.ok ? 0 : (1 - R.frac) * h * .35); obj.rotation.z = (waveH(2, 0, t) - waveH(-2, 0, t)) * .06; }
      const y0 = obj.position.y; aU.userData.set(V.set(-L * .6 - .3, y0 + h * .5, 0), UP, 1.6 * sc2 * Math.min(2, R.margin)); aD.userData.set(V.set(L * .6 + .3, y0 + h * .5, 0), V2.set(0, -1, 0), 1.6 * sc2);
      return drives ? (R.ok ? 12 : 3 * R.frac) : 0; } };
};

/* ---------- frame driver ---------- */
function disposeTree(o) { if (o.userData && o.userData.keep) return; const keep = []; o.traverse(c => { if (c !== o && c.userData && c.userData.keep) keep.push(c); }); keep.forEach(k => k.parent && k.parent.remove(k)); o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => { m.map && m.map.dispose && m.map.dispose(); m.dispose(); }); }); }
function keyFor(R) {
  const sc = R.sc, k = [sc.type, sc.kind, sc.source, sc.load, userModel ? "u" + userId : ""];
  if (["glider", "kite", "solarheater", "wxballoon", "footbridge"].includes(sc.type)) k.push(Q(R.tr("span", .5)), Q(R.tr("size", .5)), Q(R.tr("height", .5)), Q(R.tr("area", .5)));
  if (sc.type === "scooter") k.push(Math.round((R.env && R.env.s) || 0));
  if (sc.type === "boat") k.push(sc.kind);
  const RB = { jetpack: ["engines"], airship: ["size"], marsheli: ["size"], paperplane: ["target"], waterrocket: ["water"], canopy: ["size"], solarsail: ["size"], rover: ["area"], hydrofoil: ["area"], hovercraft: ["size"], rov: ["thrusters"], tidal: ["size"], floatsolar: ["area"], landyacht: ["area"], zipline: ["height", "span"], waterwheel: ["height"], still: ["area"], quake: ["iso"], trebuchet: ["range"], bungee: ["drop", "cord"], ropebridge: ["span", "sag"], ferris: ["size"], coaster: ["height", "radius"], ballooncar: ["goal"], eggdrop: ["pad"], popsicle: ["span", "height"], solaroven: ["area"], windupcar: ["goal"], strawrocket: ["goal"], marblerun: ["height"], paperheli: ["size"], lemon: ["cells"], crankflash: ["size"], toysail: ["area"], spintop: ["size"], bikegears: ["front", "rear"], pinwheel: ["size"] };
  if (RB[sc.type]) RB[sc.type].forEach(n => k.push(Q(R.tr(n, .5)), Math.round(R.role(n, 0) * 100) / 100));
  if (sc.type === "screw" || sc.type === "multirotor") k.push(Math.round(R.role("rotors", 1)), Q(R.tr("size", .5)));
  if (sc.type === "rotorcraft") k.push(Math.round(R.role("levels", 1)), Math.round(R.role("rotors", 1)), Q(R.tr("size", .5)), Q(R.tr("load", .5)));
  if (sc.type === "aircraft") k.push(Q(R.tr("span", .5)), R.role("flap", 0) > .5);
  if (sc.type === "boat" || sc.type === "balloon") k.push(Q(R.tr("size", .5)), Q(R.tr("load", .5)));
  if (sc.type === "structure") k.push(Q(R.tr("height", .5)), Q(R.tr("taper", 0)));
  if (sc.type === "flow") k.push(Q(R.tr("height", .5)));
  k.push((sc.parts || []).length, sc.motion || ""); if (sc.type === "submarine") k.push(Q(R.tr("size", .5)));
  return k.join("|");
}
const stShared = new WeakMap();
let camOff = new T.Vector3(), lastTarget = new T.Vector3(), treeOff = 0, texOff = 0;
function frame(host, R, dt, t, w, h) {
  if (!renderer) init(host);
  if (renderer.domElement.parentNode !== host) host.appendChild(renderer.domElement);
  const sz = renderer.getSize(new T.Vector2()); if (Math.abs(sz.x - w) > 1 || Math.abs(sz.y - h) > 1) { renderer.setSize(w, h, false); renderer.domElement.style.width = "100%"; renderer.domElement.style.height = h + "px"; camera.aspect = w / h; camera.updateProjectionMatrix(); }
  const model = R.model; if (!stShared.has(model)) stShared.set(model, {}); const st = stShared.get(model);
  const key = keyFor(R), fresh = model !== curModel;
  if (fresh || key !== curKey) {
    if (cur) { scene.remove(cur.root); disposeTree(cur.root); }
    if (cur && cur.root && userModel && userModel.parent) userModel.parent.remove(userModel);
    cur = userModel ? B.userModel(R, st) : (B[R.sc.type] || B.energy)(R, st);
    if (!userModel && R.sc.type !== "custom" && R.sc.parts && R.sc.parts.length) { const host = cur.follow || cur.root, L = partsLayer(R.sc.parts, host), up = cur.update.bind(cur); Object.keys(L.byName).forEach(n => { if (!cur.anchors[n]) cur.anchors[n] = L.byName[n]; });
      cur.update = (R2, dt2, t2) => { partsTick(L.list, Object.assign({ margin: R2.margin, ok: R2.ok ? 1 : 0, t: R2.t }, R2.env), dt2); return up(R2, dt2, t2); }; }
    scene.add(cur.root); studioLook(); cur.gk = cur.ground || (cur.water ? "water" : "grass");
    const gk = cur.ground || (cur.water ? "water" : "grass");
    const gb = groundBase() || "grass"; if (gk + gb !== groundKind) { if (ground) { scene.remove(ground); disposeTree(ground); } ground = makeGround(gk, gb); scene.add(ground); groundKind = gk + gb; ground.visible = !!groundBase() || (envMode === "real" && !!cur.water); cur.gk = gk; }
    if (!fresh && cur.cam.fitW && camera.position.distanceTo(controls.target) < camPos(cur.cam).distanceTo(cur.cam.target) * .45) { camera.position.copy(camPos(cur.cam)); controls.target.copy(cur.cam.target); lastTarget.copy(cur.cam.target); }
    if (fresh || st.uid !== userId) { st.uid = userId; camera.position.copy(camPos(cur.cam)); controls.target.copy(cur.cam.target); lastTarget.copy(cur.cam.target); controls.autoRotate = false; }
    curKey = key; curModel = model;
  }
  if (cur.gk && groundBase() && groundKind !== cur.gk + groundBase()) { if (ground) { scene.remove(ground); disposeTree(ground); } ground = makeGround(cur.gk, groundBase()); scene.add(ground); groundKind = cur.gk + groundBase(); }
  for (const k in envGroups) if (envGroups[k].visible && envGroups[k].userData.update) envGroups[k].userData.update(dt, t);
  if (cur.__envSynced !== cur) { cur.__envSynced = cur; applyEnv(); }
  const speed = cur.update(R, dt, t) || 0;
  if (cur.moving) { treeOff += speed * dt; if (ground.userData.trees) ground.userData.trees.userData.set(treeOff); if (ground.userData.grass) { ground.userData.grass.material.map.offset.x = treeOff / 4000 * 500; ground.userData.grass.material.bumpMap.offset.x = treeOff / 4000 * 500; } if (ground.userData.road) ground.userData.road.material.map.offset.x = treeOff / 4000 * 500; }
  if (ground.userData.water) { const wm = ground.userData.water, p = wm.geometry.attributes.position; texOff += speed * dt; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, waveH(x + texOff, z, t)); } p.needsUpdate = true; wm.geometry.computeVertexNormals(); }
  if (cur.follow) { cur.follow.getWorldPosition(V); const tgt = V2.set(cur.cam.target.x, Math.max(cur.cam.target.y, V.y + cur.cam.target.y * .6), cur.cam.target.z); const d = new T.Vector3().subVectors(tgt, lastTarget).multiplyScalar(Math.min(1, dt * 3)); controls.target.add(d); camera.position.add(d); lastTarget.add(d); }
  fitBackplate(w / h);
  controls.update();
  const ft = V2.copy(controls.target), sq = .6; ft.set(Math.round(ft.x / sq) * sq, Math.round(ft.y / sq) * sq, Math.round(ft.z / sq) * sq); sun.position.copy(sunDir).multiplyScalar(90).add(ft); sun.target.position.copy(ft); /* snapped so shadows don't shimmer as the camera moves */
  renderer.render(scene, camera);
  const A = {}, proj = o => { o.getWorldPosition(V); V.project(camera); if (V.z > 1 || V.z < -1) return null; return [(V.x + 1) / 2 * w, (1 - V.y) / 2 * h]; };
  for (const k in cur.anchors) { const p = proj(cur.anchors[k]); if (p) A[k] = p; }
  const labels = []; (cur.labels || []).forEach(l => { const p = proj(l.obj); if (p) labels.push({ x: p[0], y: p[1], text: l.text(), col: l.col }); });
  return { anchors: A, labels };
}
/* ---------- environments ---------- */
const groundBase = () => envMode === "outdoor" ? "grass" : envMode === "desert" ? "desert" : envMode === "snow" ? "snow" : null;
let envGroups = {}, uwEnv = null, spEnv = null;
function makeUnderwater() {
  const g = new T.Group(), geo = new T.PlaneGeometry(700, 700, 140, 140).rotateX(-Math.PI / 2), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z); p.setY(i, fbm(x * .04, z * .04, 3) * 1.6 - .8 + Math.max(0, (r - 25) / 50) * fbm(x * .01 + 7, z * .01, 3) * 14); }
  geo.computeVertexNormals(); macroColors(geo, true);
  g.add(M(geo, new T.MeshStandardMaterial({ map: TEX.sand([140, 140]), bumpMap: TEX.sand([140, 140]), bumpScale: 1.4, color: 0xa9c2b8, roughness: 1, vertexColors: true }), false, true));
  const rockM = new T.MeshStandardMaterial({ color: 0x3f4d4a, roughness: .95, flatShading: true });
  for (let i = 0; i < 50; i++) { const a = rnd() * 6.28, r = 7 + rnd() * 60, s = .3 + rnd() * 1.6, rk = M(new T.IcosahedronGeometry(s, 1), rockM, true, true); rk.position.set(Math.cos(a) * r, -.2, Math.sin(a) * r); rk.scale.set(1, .5 + rnd() * .5, 1 + rnd() * .4); g.add(rk); }
  const kelp = [], kM = new T.MeshStandardMaterial({ color: 0x3e7a2c, roughness: .8, side: T.DoubleSide });
  for (let i = 0; i < 70; i++) { const a = rnd() * 6.28, r = 6 + rnd() * 45, hgt = 2 + rnd() * 7, k = new T.Group(); k.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    const geo2 = new T.PlaneGeometry(.35, hgt, 1, 10); geo2.translate(0, hgt / 2, 0); const pp = geo2.attributes.position; for (let j = 0; j < pp.count; j++) { const y = pp.getY(j); pp.setX(j, pp.getX(j) * (1 - y / hgt * .6) + Math.sin(y * 1.3) * .12); } geo2.computeVertexNormals();
    const m = M(geo2, kM, true, false); m.rotation.y = rnd() * 3; k.add(m); g.add(k); kelp.push({ k, ph: rnd() * 6, hgt }); }
  const surf = new T.Mesh(new T.PlaneGeometry(900, 900).rotateX(Math.PI / 2), new T.MeshBasicMaterial({ color: 0x9fe3ff, transparent: true, opacity: .45, side: T.DoubleSide, fog: false })); surf.position.y = 32; g.add(surf);
  const rays = []; for (let i = 0; i < 7; i++) { const c = new T.Mesh(new T.ConeGeometry(5 + rnd() * 4, 45, 24, 1, true), new T.MeshBasicMaterial({ color: 0xd8f4ff, transparent: true, opacity: .045, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false }));
    c.position.set((rnd() - .5) * 40, 10, (rnd() - .5) * 40 - 5); c.rotation.z = (rnd() - .5) * .35; c.rotation.x = (rnd() - .5) * .25; g.add(c); rays.push({ c, ph: rnd() * 6 }); }
  const bub = particles(260, 0xdff6ff, .14, { opacity: .7 }); g.add(bub);
  const caust = TEX.caustics(); caust.repeat.set(1, 1); const spot = new T.SpotLight(0xbfefff, 3, 0, .95, 1, 0); spot.position.set(0, 45, 0); spot.map = caust; spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); g.add(spot, spot.target);
  g.userData.update = (dt, t) => { caust.offset.x = t * .015; caust.offset.y = Math.sin(t * .2) * .05; caust.rotation = t * .01;
    kelp.forEach(o => { o.k.rotation.z = Math.sin(t * .8 + o.ph) * .08; o.k.rotation.x = Math.cos(t * .6 + o.ph) * .06; });
    rays.forEach(o => o.c.material.opacity = .03 + .025 * (Math.sin(t * .7 + o.ph) * .5 + .5));
    const q = bub.userData; for (let i = 0; i < q.n; i++) { if (q.life[i] <= 0) { q.pos[i * 3] = (Math.random() - .5) * 30; q.pos[i * 3 + 1] = Math.random() * 2; q.pos[i * 3 + 2] = (Math.random() - .5) * 30; q.life[i] = 6 + Math.random() * 6; q.vel[i * 3 + 1] = .8 + Math.random() * 1.2; }
      q.life[i] -= dt; q.pos[i * 3 + 1] += q.vel[i * 3 + 1] * dt; q.pos[i * 3] += Math.sin(t * 2 + i) * dt * .2; if (q.pos[i * 3 + 1] > 30) q.life[i] = 0; } bub.geometry.attributes.position.needsUpdate = true; };
  return g; }
function makeSpace() {
  const g = new T.Group(), n = 2500, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const u = rnd() * 2 - 1, a = rnd() * 6.283, r = 2400, q = Math.sqrt(1 - u * u); pos[i * 3] = Math.cos(a) * q * r; pos[i * 3 + 1] = u * r; pos[i * 3 + 2] = Math.sin(a) * q * r; }
  const sg = new T.BufferGeometry(); sg.setAttribute("position", new T.BufferAttribute(pos, 3)); const stars = new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false })); g.add(stars);
  const et = ctex("earth", 1024, 512, (x, w, h) => { x.fillStyle = "#0b3d7a"; x.fillRect(0, 0, w, h); for (let j = 0; j < h; j += 2) for (let i = 0; i < w; i += 2) { const v = fbm(i * .012, j * .02, 5); if (v > .55) { x.fillStyle = v > .7 ? "#8a7a55" : "#3f6b34"; x.fillRect(i, j, 2, 2); } }
    for (let i = 0; i < 900; i++) { x.fillStyle = "rgba(255,255,255," + (.25 + rnd() * .5) + ")"; x.beginPath(); x.ellipse(rnd() * w, rnd() * h, 6 + rnd() * 30, 2 + rnd() * 6, 0, 0, 7); x.fill(); } });
  const earth = new T.Mesh(new T.SphereGeometry(500, 96, 64), new T.MeshStandardMaterial({ map: et, roughness: .9 })); earth.position.set(0, -540, -260); g.add(earth);
  const atm = new T.Mesh(new T.SphereGeometry(512, 96, 64), new T.MeshBasicMaterial({ color: 0x5fb4ff, transparent: true, opacity: .18, side: T.BackSide, blending: T.AdditiveBlending, fog: false })); atm.position.copy(earth.position); g.add(atm);
  g.userData.update = (dt, t) => { earth.rotation.y += dt * .004; }; return g; }
function makeLab() {
  const g = new T.Group(), W = 60, H = 24, D = 60;
  const floor = M(new T.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new T.MeshPhysicalMaterial({ color: 0x8c939c, roughness: .28, metalness: .1, clearcoat: .5 }), false, true); g.add(floor);
  const wallM = new T.MeshStandardMaterial({ color: 0xd9dde2, roughness: .9, side: T.BackSide }); const room = new T.Mesh(new T.BoxGeometry(W, H, D), wallM); room.position.y = H / 2 - .25; /* box bottom sits below the floor: same height caused z-fighting flicker */ room.receiveShadow = true; g.add(room);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const pnl = new T.Mesh(new T.PlaneGeometry(6, 2).rotateX(Math.PI / 2), new T.MeshBasicMaterial({ color: 0xffffff })); pnl.position.set(i * 16, H - .45, j * 16); g.add(pnl); }
  const stripe = M(new T.PlaneGeometry(W * .8, .25).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: 0xf5c518, roughness: .6 }), false, true); stripe.position.set(0, .04, D * .3); g.add(stripe);
  const bench = M(new T.BoxGeometry(6, 1, 1.6), new T.MeshStandardMaterial({ color: 0x3b4250, roughness: .6, metalness: .4 })); bench.position.set(-W / 2 + 4, .5, -D / 2 + 2); g.add(bench);
  return g; }
function makeCloudFloor() { const g = new T.Group(); const t = ctex("cloudfloor", 512, 512, (x, w, h) => { const img = x.createImageData(w, h); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const v = fbm(i / 64, j / 64, 5), a = Math.max(0, Math.min(1, (v - .35) / .3)), k = (j * w + i) * 4, sh = 200 + 55 * fbm(i / 32 + 9, j / 32, 3); img.data[k] = sh; img.data[k + 1] = sh; img.data[k + 2] = Math.min(255, sh + 8); img.data[k + 3] = 255 * a; } x.putImageData(img, 0, 0); }, [6, 6]);
  [-60, -75].forEach((y, i) => { const m = new T.Mesh(new T.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, color: i ? 0xcfd8e3 : 0xffffff })); m.position.y = y; g.add(m); });
  g.userData.update = (dt, tt) => { t.offset.x = tt * .003; }; return g; }
function envGroup(name) { if (!envGroups[name]) { envGroups[name] = name === "underwater" ? makeUnderwater() : name === "space" ? makeSpace() : name === "lab" ? makeLab() : makeCloudFloor(); scene.add(envGroups[name]); } return envGroups[name]; }
function fitBackplate(aspect) { if (envMode !== "photo" || !photoTex || photoIs360) return; const ia = photoTex.image.width / photoTex.image.height;
  if (ia > aspect) { photoTex.repeat.set(aspect / ia, 1); photoTex.offset.set((1 - aspect / ia) / 2, 0); } else { photoTex.repeat.set(1, ia / aspect); photoTex.offset.set(0, (1 - ia / aspect) / 2); } }
function applyEnv() { applyEnv0(); studioLook(); }
function applyEnv0() {
  if (!renderer) return; const desert = envMode === "desert" || envMode === "snow", outdoor = envMode === "outdoor" || desert || envMode === "sky", real = envMode === "real";
  Object.keys(envGroups).forEach(k => envGroups[k].visible = false); ["underwater", "space", "lab", "sky"].forEach(k => { if (envMode === k) envGroup(k).visible = true; });
  const waterScene = !!(cur && cur.water);
  if (skybox) skybox.visible = real && !waterScene;
  sky.visible = outdoor; clouds.visible = outdoor && envMode !== "sky"; if (ground) ground.visible = !!groundBase() || (real && !!(cur && cur.water)); scene.fog = outdoor ? fogObj : null;
  fogObj.color.set(envMode === "snow" ? 0xe3e9f0 : desert ? 0xd8c7ad : 0xc6d8ea); fogObj.near = desert ? 150 : 120; fogObj.far = envMode === "sky" ? 3000 : desert ? 1700 : 1400;
  const u = sky.material.uniforms; u.turbidity.value = desert ? 9 : 5.5; u.rayleigh.value = desert ? 1.1 : 1.4; sun.color.set(desert ? 0xffe6c4 : 0xfff0dc);
  if (!studio) { studio = new T.Group(); const fl = M(new T.CircleGeometry(600, 96).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: 0xd7d9dd, roughness: .5, metalness: 0 }), false, true); studio.add(fl); scene.add(studio); }
  if (!catcher) { catcher = M(new T.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), new T.ShadowMaterial({ opacity: .5 }), false, true); catcher.position.y = .01; scene.add(catcher); }
  studio.visible = envMode === "studio"; catcher.visible = envMode === "photo" || (real && !waterScene);
  if (real && ground) ground.visible = waterScene;
  if (!roomEnv && !outdoor && envMode !== "underwater" && envMode !== "space") roomEnv = pmremG.fromScene(new RoomEnvironment(), .04).texture;
  if (envMode === "underwater") { if (!uwEnv) { const es = new T.Scene(); es.background = new T.Color(0x2a86a8); uwEnv = pmremG.fromScene(es).texture; }
    scene.background = new T.Color(0x0b4f6c); scene.fog = new T.FogExp2(0x0d5875, .016); scene.environment = uwEnv; sun.intensity = 1.1; sun.color.set(0xbfe8ff); hemi.intensity = .9; hemi.color.set(0x8fdcff); hemi.groundColor.set(0x16303a); renderer.toneMappingExposure = 1; return; }
  hemi.color.set(0xd6e8ff); hemi.groundColor.set(0x4d4030);
  if (envMode === "space") { if (!spEnv) { const es = new T.Scene(); es.background = new T.Color(0x1a2230); spEnv = pmremG.fromScene(es).texture; }
    scene.background = new T.Color(0x000000); scene.environment = spEnv; sun.intensity = 4; sun.color.set(0xffffff); hemi.intensity = .05; renderer.toneMappingExposure = .85; return; }
  if (envMode === "lab") { if (!roomEnv) roomEnv = pmremG.fromScene(new RoomEnvironment(), .04).texture; scene.background = new T.Color(0xd9dde2); scene.environment = roomEnv; sun.intensity = 1.8; sun.color.set(0xffffff); hemi.intensity = .4; renderer.toneMappingExposure = .9; return; }
  if (envMode === "studio") { scene.background = new T.Color(0xe3e6ea); scene.environment = roomEnv; sun.intensity = 2.2; hemi.intensity = .35; renderer.toneMappingExposure = .9; }
  else if (envMode === "photo" && photoTex) { scene.background = photoTex; scene.environment = photoIs360 ? photoEnv : roomEnv; sun.intensity = 2.4; hemi.intensity = .4; renderer.toneMappingExposure = .9; }
  else if (real && realTex) { scene.background = waterScene ? realTex : null; scene.environment = realEnv; hemi.intensity = .15; renderer.toneMappingExposure = .9; sun.color.set(0xffffff); }
  else { scene.background = null; scene.environment = outdoorEnv; sun.intensity = envMode === "snow" ? 2.6 : 3.4; hemi.intensity = .7; renderer.toneMappingExposure = envMode === "snow" ? .55 : .62; sunDir.setFromSphericalCoords(1, T.MathUtils.degToRad(90 - 32), T.MathUtils.degToRad(140)); }
}
function setEnv(mode) { envMode = mode; applyEnv(); }
/* the machine keeps its studio (SolidWorks-style) lighting and reflections in every scene; only the background changes */
function studioLook() { if (!cur || !cur.root || !renderer) return; if (!roomEnv) roomEnv = pmremG.fromScene(new RoomEnvironment(), .04).texture;
  const studio = envMode === "studio", k = .9 / Math.max(.3, renderer.toneMappingExposure);
  cur.root.traverse(c => { if (!(c.isMesh || c.isInstancedMesh) || c.userData.noStudio) return; (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => {
    if (!m || m.isMeshBasicMaterial || !("envMap" in m)) return; if (m.userData.eI == null) m.userData.eI = m.envMapIntensity ?? 1;
    const want = studio ? null : roomEnv; if (m.envMap !== want) { m.envMap = want; m.needsUpdate = true; } m.envMapIntensity = m.userData.eI * (studio ? 1 : k * 1.15); }); }); }
/* ---------- real photo environments (Poly Haven HDRIs, CC0) projected onto the ground ---------- */
const HDRI = { field: "belfast_open_field", desert: "aarfontein_pan", road: "abandoned_parking", park: "autumn_park", sky: "kloofendal_48d_partly_cloudy_puresky" };
function autoRealKey(type, kind) { return type === "vehicle" ? "road" : type === "boat" ? "sky" : type === "launch" ? "desert" : "field"; }
function sunFromHDR(d, w, h) { let best = 0, bi = 0; for (let y = 0; y < h / 2; y += 2) for (let x = 0; x < w; x += 2) { const i = (y * w + x) * 4, l = d[i] * .2126 + d[i + 1] * .7152 + d[i + 2] * .0722; if (l > best) { best = l; bi = y * w + x; } }
  const x = bi % w, y = (bi / w) | 0, u = (x + .5) / w, v = 1 - (y + .5) / h, lat = (v - .5) * Math.PI, a = (u - .5) * 2 * Math.PI;
  return { dir: new T.Vector3(Math.cos(a) * Math.cos(lat), Math.sin(lat), Math.sin(a) * Math.cos(lat)), lum: best }; }
async function hdrFromBuffer(buf) { const { RGBELoader } = await import("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/RGBELoader.js/+esm"); const l = new RGBELoader(); l.setDataType(T.FloatType); const d = l.parse(buf);
  const tex = new T.DataTexture(d.data, d.width, d.height, d.format || T.RGBAFormat, T.FloatType); tex.colorSpace = T.LinearSRGBColorSpace; tex.minFilter = tex.magFilter = T.LinearFilter; tex.generateMipmaps = false; tex.flipY = true; tex.mapping = T.EquirectangularReflectionMapping; tex.needsUpdate = true;
  return { tex, sun: sunFromHDR(d.data, d.width, d.height) }; }
async function useRealTexture(tex, sunInfo, key) {
  const { GroundedSkybox } = await import("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/objects/GroundedSkybox.js/+esm");
  if (skybox) { scene.remove(skybox); skybox.geometry.dispose(); skybox.material.dispose(); }
  skybox = new GroundedSkybox(tex, 7, 320); skybox.position.y = 7; scene.add(skybox);
  if (realTex && realTex !== tex) realTex.dispose(); if (realEnv) realEnv.dispose();
  realTex = tex; realEnv = pmremG.fromEquirectangular(tex).texture; realKey = key;
  if (sunInfo && sunInfo.dir.y > .05) { sunDir.copy(sunInfo.dir); sun.intensity = Math.max(.8, Math.min(3.6, sunInfo.lum / 40)); } else sun.intensity = .9;
  envMode = "real"; applyEnv(); }
async function setReal(key, type, kind) {
  if (!renderer) throw new Error("3D not ready");
  if (key === "auto") key = autoRealKey(type, kind); if (key === realKey && realTex) { envMode = "real"; applyEnv(); return key; }
  if (realBusy) return key; realBusy = true;
  try { const res = innerWidth < 700 ? "1k" : "2k", r = await fetch(`https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/${res}/${HDRI[key] || key}_${res}.hdr`);
    if (!r.ok) throw new Error("download " + r.status); const { tex, sun: si } = await hdrFromBuffer(await r.arrayBuffer()); await useRealTexture(tex, si, key); return key; }
  finally { realBusy = false; } }
async function loadHDR(file) { const ext = file.name.split(".").pop().toLowerCase(), buf = await readBuf(file);
  let d; if (ext === "hdr") { const { RGBELoader } = await import("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/RGBELoader.js/+esm"); const l = new RGBELoader(); l.setDataType(T.FloatType); d = l.parse(buf); }
  else { const { EXRLoader } = await import("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/EXRLoader.js/+esm"); const l = new EXRLoader(); l.setDataType(T.FloatType); d = l.parse(buf); }
  const tex = new T.DataTexture(d.data, d.width, d.height, d.format || T.RGBAFormat, d.type || T.FloatType); tex.colorSpace = T.LinearSRGBColorSpace; tex.minFilter = tex.magFilter = T.LinearFilter; tex.generateMipmaps = false; tex.flipY = true; tex.mapping = T.EquirectangularReflectionMapping; tex.needsUpdate = true;
  await useRealTexture(tex, sunFromHDR(d.data, d.width, d.height), "upload"); return true; }
function loadPhoto(file) { if (/\.(hdr|exr)$/i.test(file.name)) return loadHDR(file); return new Promise((res, rej) => { const url = URL.createObjectURL(file);
  new T.TextureLoader().load(url, tex => { tex.colorSpace = T.SRGBColorSpace; const ia = tex.image.width / tex.image.height; photoIs360 = Math.abs(ia - 2) < .12;
    if (photoTex) photoTex.dispose(); if (photoEnv) photoEnv.dispose(); photoEnv = null;
    if (photoIs360) { tex.mapping = T.EquirectangularReflectionMapping; useRealTexture(tex, null, "upload").then(() => { sun.intensity = 2.2; res(true); }, rej); return; }
    photoTex = tex; envMode = "photo"; applyEnv(); res(photoIs360); }, undefined, e => rej(e)); }); }

/* ---------- ray-traced photoreal render (three-gpu-pathtracer) ---------- */
function sanitize(root) { const rm = [];
  root.traverse(o => { if (o.userData && o.userData.isOverlay) rm.push(o); else if (o.isPoints || o.isLine || o.isSprite || o.isInstancedMesh || o.isLight) rm.push(o);
    else if (o.isMesh) { const fix = m => { if (!m || !m.isMeshBasicMaterial) return m; if (m.map) return null; return new T.MeshStandardMaterial({ color: 0x000000, emissive: m.color.clone(), emissiveIntensity: 3 * (m.opacity ?? 1) }); };
      if (Array.isArray(o.material)) o.material = o.material.map(m => fix(m) || m); else { const f = fix(o.material); if (f === null) rm.push(o); else o.material = f; } } });
  rm.forEach(o => o.parent && o.parent.remove(o)); return root; }
function viewCam(view, W, H) { const cam = camera.clone(), tg = controls.target.clone(), off = camera.position.clone().sub(tg), dist = off.length(), d = off.clone(); d.y = 0; if (d.lengthSq() < 1e-6) d.set(1, 0, 0); d.normalize();
  if (view === "side") cam.position.set(tg.x + d.z * dist * .2, tg.y + dist * .1, tg.z + dist * .98);
  else if (view === "top") cam.position.set(tg.x + d.x * dist * .55, tg.y + dist * .8, tg.z + d.z * dist * .55);
  else if (view === "low") cam.position.set(tg.x + d.x * dist * .75, Math.max(.8, tg.y * .25), tg.z + d.z * dist * .75);
  cam.lookAt(tg); cam.aspect = W / H; cam.updateProjectionMatrix(); return cam; }
async function photoreal(view, W, H, host, target, onProgress) {
  if (!cur) throw new Error("no model");
  const PT = await import("https://cdn.jsdelivr.net/npm/three-gpu-pathtracer@0.0.23/+esm");
  const r2 = new T.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true }); r2.setPixelRatio(1); r2.setSize(W, H, false);
  r2.toneMapping = T.ACESFilmicToneMapping; r2.toneMappingExposure = (envMode === "outdoor" || envMode === "desert") ? .8 : envMode === "real" ? .95 : 1; r2.domElement.style.width = "100%"; r2.domElement.style.height = "auto"; r2.domElement.style.display = "block"; host.appendChild(r2.domElement);
  const s2 = new T.Scene(); let bg; const outdoor = envMode === "outdoor" || envMode === "desert" || envMode === "snow" || envMode === "sky", desert = envMode === "desert";
  if (envMode === "real" && realTex) bg = realTex;
  else if (envMode === "photo" && photoIs360 && photoTex) bg = photoTex;
  else if (outdoor) { bg = new PT.ProceduralEquirectTexture(1024, 512); const cc = new T.Color(); bg.generationCallback = (polar, uv, coord, color) => { const sp = Math.sin(polar.phi); skyColorAt(sp * Math.sin(polar.theta), Math.cos(polar.phi), sp * Math.cos(polar.theta), envMode === "snow" ? "snow" : desert, cc); color.copy(cc); }; bg.update(); }
  else { bg = new PT.GradientEquirectTexture(); const uw = envMode === "underwater", spc = envMode === "space";
    bg.topColor.set(uw ? 0x6fd0f0 : spc ? 0x05070c : 0xffffff); bg.bottomColor.set(uw ? 0x031a26 : spc ? 0x000000 : 0xa4a8ae); bg.exponent = uw ? 1.2 : 2.2; bg.update(); }
  ["underwater", "lab"].forEach(k => { if (envMode === k && envGroups[k]) envGroups[k].traverse(c => { if (c.isMesh && !c.isInstancedMesh && c.material && !c.material.isMeshBasicMaterial) { const cl = c.clone(); c.updateMatrixWorld(); c.matrixWorld.decompose(cl.position, cl.quaternion, cl.scale); s2.add(cl); } }); });
  s2.background = bg; s2.environment = bg;
  if (((outdoor && envMode !== "sky") || (envMode === "real" && cur.water)) && ground) { ground.children.forEach(c => { if (c.isMesh && !c.isInstancedMesh) s2.add(c.clone()); }); }
  else if (envMode === "real") { const fl = new T.Mesh(new T.CircleGeometry(400, 64).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: 0x808080, roughness: 1 })); fl.material.matte = true; s2.add(fl); }
  else if (envMode !== "underwater" && envMode !== "lab" && envMode !== "space") { const floor = new T.Mesh(new T.CircleGeometry(400, 64).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: 0xd8dadd, roughness: .45 })); if (envMode === "photo") floor.material.matte = true; s2.add(floor); }
  const key = new T.DirectionalLight(0xfff2e0, envMode === "studio" ? 2 : envMode === "real" ? sun.intensity * .8 : 2.6); key.position.copy(sunDir).multiplyScalar(80).add(controls.target); key.target.position.copy(controls.target); s2.add(key, key.target);
  if (envMode !== "outdoor") { const box = new T.RectAreaLight(0xffffff, 6, 10, 6); box.position.set(controls.target.x + 8, controls.target.y + 12, controls.target.z + 10); box.lookAt(controls.target); s2.add(box); }
  s2.add(sanitize(cur.root.clone(true))); s2.updateMatrixWorld(true);
  const vc = viewCam(view, W, H), cam = new PT.PhysicalCamera(vc.fov, W / H, vc.near, vc.far); cam.position.copy(vc.position); cam.quaternion.copy(vc.quaternion); cam.updateMatrixWorld();
  cam.focusDistance = vc.position.distanceTo(controls.target); cam.fStop = outdoor ? 3.2 : 5.6; cam.apertureBlades = 7;
  const pt = new PT.WebGLPathTracer(r2); pt.bounces = 6; pt.renderDelay = 0; pt.minSamples = 1; pt.fadeDuration = 0; pt.rasterizeScene = false; pt.filterGlossyFactor = .5; pt.tiles.set(2, 2);
  pt.setScene(s2, cam);
  let stopped = false, raf = 0;
  const done = new Promise(res => { const step = () => { if (stopped) return finish(); pt.renderSample(); onProgress && onProgress(pt.samples, target); if (pt.samples >= target) return finish(); raf = requestAnimationFrame(step); };
    const finish = () => { cancelAnimationFrame(raf); let url = null; try { url = r2.domElement.toDataURL("image/jpeg", .94); } catch (e) {} try { pt.dispose(); } catch (e) {} try { r2.dispose(); r2.forceContextLoss(); } catch (e) {} res(url); };
    raf = requestAnimationFrame(step); });
  return { stop() { stopped = true; }, done, canvas: r2.domElement };
}
let composer = null, bloom = null, bokeh = null;
function snapshot(view, W, H) {
  if (!cur || !renderer) return null;
  const sp = camera.position.clone(), stg = controls.target.clone(), sa = camera.aspect, spr = renderer.getPixelRatio(), sz = renderer.getSize(new T.Vector2());
  const hidden = []; cur.root.traverse(o => { if (o.userData && o.userData.isOverlay && o.visible) { o.visible = false; hidden.push(o); } });
  const off = sp.clone().sub(stg), dist = off.length(), d = off.clone(); d.y = 0; if (d.lengthSq() < 1e-6) d.set(1, 0, 0); d.normalize();
  if (view === "side") camera.position.set(stg.x + d.z * dist * .2, stg.y + dist * .1, stg.z + dist * .98);
  else if (view === "top") camera.position.set(stg.x + d.x * dist * .55, stg.y + dist * .8, stg.z + d.z * dist * .55);
  else if (view === "low") camera.position.set(stg.x + d.x * dist * .75, Math.max(.8, stg.y * .25), stg.z + d.z * dist * .75);
  camera.lookAt(stg); camera.aspect = W / H; camera.updateProjectionMatrix();
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  fitBackplate(W / H);
  sun.shadow.mapSize.set(4096, 4096); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  if (!composer) { composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera)); bokeh = new BokehPass(scene, camera, { focus: 15, aperture: .00022, maxblur: .007 }); composer.addPass(bokeh); bloom = new UnrealBloomPass(new T.Vector2(W, H), .32, .55, .88); composer.addPass(bloom); composer.addPass(new OutputPass()); }
  bokeh.uniforms.focus.value = camera.position.distanceTo(stg); bokeh.uniforms.aspect.value = W / H; bokeh.enabled = envMode !== "studio";
  composer.setPixelRatio(1); composer.setSize(W, H); composer.render();
  const url = renderer.domElement.toDataURL("image/jpeg", .93);
  hidden.forEach(o => o.visible = true);
  sun.shadow.mapSize.set(shadowSz(), shadowSz()); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  renderer.setPixelRatio(spr); renderer.setSize(sz.x, sz.y, false); renderer.domElement.style.width = "100%"; renderer.domElement.style.height = sz.y + "px";
  camera.position.copy(sp); camera.aspect = sa; camera.updateProjectionMatrix(); controls.target.copy(stg); controls.update();
  return url;
}
function hdSize() { const m = renderer ? renderer.capabilities.maxTextureSize : 4096; return m >= 8192 ? [2400, 1500] : [1920, 1200]; }
/* pull the camera back on narrow (phone) screens so wide scenes fit side to side */
function camPos(c) { const p = c.pos.clone(); if (!c.fitW) return p; const off = p.clone().sub(c.target), d = off.length(), need = c.fitW / (Math.tan(T.MathUtils.degToRad(camera.fov / 2)) * Math.max(.3, camera.aspect)); return need > d ? c.target.clone().add(off.multiplyScalar(Math.min(3.2, need / d))) : p; }
function resetView() { if (cur) { camera.position.copy(camPos(cur.cam)); controls.target.copy(cur.cam.target); lastTarget.copy(cur.cam.target); } }
window.REAL3D = { ok: true, failed: false, setQuality, get quality() { return QUAL; }, setReal, get realKey() { return realKey; }, frame, resetView, snapshot, hdSize, photoreal, setEnv, loadPhoto, loadModel, loadModelZip, clearModel, get modelName() { return userName; }, get env() { return envMode; }, get is360() { return photoIs360; } };
window.dispatchEvent(new Event("real3d-ready"));
