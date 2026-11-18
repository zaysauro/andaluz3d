// Elevato Andaluz — tour 3D do apartamento tipo (2 dorms, 34,6 m²)
// Geometria derivada da planta do book (plan.json). Unidades em metros.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
RectAreaLightUniformsLib.init();
import { renderPages } from './content.js';

const plan = await (await fetch('./plan.json')).json();
const S = plan.pxPerMeter, O = plan.origin, H = plan.ceiling;
const X = px => (px - O[0]) / S, Z = py => (py - O[1]) / S;
const W_ = X(1876), D_ = Z(1080);              // envelope externo ~7,13 × 5,04 m
const IS_MOBILE = matchMedia('(max-width: 860px)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);

renderPages(plan);

/* ------------------------------------------------------------------ renderer */
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !!window.__SHOT, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, IS_MOBILE ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);
const MAXA = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;

/* ------------------------------------------------------------------ util */
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function tex(size, draw, srgb = true, h = size) {
  const c = document.createElement('canvas'); c.width = size; c.height = h;
  const g = c.getContext('2d'); draw(g, size, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = MAXA;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function speckle(g, w, h, n, colors, rmin, rmax, a = 1) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = a * (0.4 + rnd() * 0.6);
    g.fillStyle = colors[(rnd() * colors.length) | 0];
    const r = rmin + rnd() * (rmax - rmin);
    g.beginPath(); g.arc(rnd() * w, rnd() * h, r, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
}
function clouds(g, w, h, n, color, rmin, rmax, a) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h, r = rmin + rnd() * (rmax - rmin);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color.replace('A', a * rnd())); gr.addColorStop(1, color.replace('A', 0));
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
}
// Caixa com UV em metros (texturas com escala física constante)
function boxUV(w, h, d, tm = 1) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tm, uv.getY(i) * dims[f][1] / tm);
  }
  return geo;
}
function planeUV(w, h, tm = 1) {
  const geo = new THREE.PlaneGeometry(w, h); const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tm, uv.getY(i) * h / tm);
  return geo;
}
const G = {};
for (const k of ['struct', 'ceil', 'decor', 'base', 'varAB', 'varC', 'grill', 'nicheWood', 'lamps', 'decorAB', 'decorC'])
  { G[k] = new THREE.Group(); G[k].name = k; scene.add(G[k]); }
const solids = { struct: [], varAB: [], decor: [], base: [], always: [] };
function solid(list, x0, z0, x1, z1) { solids[list].push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]); }

function mesh(geo, mat, parent, cast = true, recv = true) {
  const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; parent.add(m); return m;
}
// caixa por extremos em metros
function bx(x0, x1, y0, y1, z0, z1, mat, parent, tm = 1, cast = true) {
  const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1 - z0);
  const m = mesh(boxUV(w, h, d, tm), mat, parent, cast);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return m;
}
// caixa por retângulo da planta (px)
function pr(r, y0, y1, mat, parent, tm = 1) { return bx(X(r[0]), X(r[2]), y0, y1, Z(r[1]), Z(r[3]), mat, parent, tm); }
function rbox(w, h, d, r, mat, parent, x, y, z, cast = true) {
  const m = mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat, parent, cast); m.position.set(x, y, z); return m;
}
function cyl(rt, rb, h, mat, parent, x, y, z, seg = 32) {
  const m = mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, parent); m.position.set(x, y, z); return m;
}
// painel vertical encostado numa face de parede: eixo 'x' (paralelo a x, face em z) ou 'z'
function panel(axis, a0, a1, y0, y1, face, normalSign, mat, parent, tm = 1, off = 0.004) {
  const len = a1 - a0, h = y1 - y0, m = mesh(planeUV(len, h, tm), mat, parent, false, true);
  if (axis === 'x') { m.position.set((a0 + a1) / 2, (y0 + y1) / 2, face + normalSign * off); m.rotation.y = normalSign > 0 ? 0 : Math.PI; }
  else { m.position.set(face + normalSign * off, (y0 + y1) / 2, (a0 + a1) / 2); m.rotation.y = normalSign > 0 ? Math.PI / 2 : -Math.PI / 2; }
  return m;
}

/* ------------------------------------------------------------------ texturas */
const T = {};
T.floor = tex(1024, (g, s) => {           // porcelanato 60×60, tom areia claro (2×2 peças = 1,2 m)
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const v = 214 + ((rnd() * 8) | 0);
    g.fillStyle = `rgb(${v},${v - 4},${v - 11})`; g.fillRect(i * s / 2, j * s / 2, s / 2, s / 2);
  }
  clouds(g, s, s, 160, 'rgba(255,252,246,A)', 30, 140, 0.07);
  clouds(g, s, s, 120, 'rgba(170,160,145,A)', 20, 110, 0.03);
  speckle(g, s, s, 2500, ['#bfb6a8', '#efe9df'], 0.5, 1.4, 0.35);
  g.fillStyle = '#b9b1a5';
  for (let k = 0; k <= 2; k++) { g.fillRect(k * s / 2 - 1.5, 0, 3, s); g.fillRect(0, k * s / 2 - 1.5, s, 3); }
});
T.floorR = tex(256, (g, s) => {
  g.fillStyle = '#5a5a5a'; g.fillRect(0, 0, s, s);
  clouds(g, s, s, 60, 'rgba(120,120,120,A)', 10, 50, 0.5);
  g.fillStyle = '#d0d0d0'; for (let k = 0; k <= 2; k++) { g.fillRect(k * s / 2 - 1, 0, 2, s); g.fillRect(0, k * s / 2 - 1, s, 2); }
}, false);
T.bathFloor = tex(512, (g, s) => {
  g.fillStyle = '#cfcac2'; g.fillRect(0, 0, s, s);
  clouds(g, s, s, 80, 'rgba(240,236,228,A)', 20, 90, 0.25);
  speckle(g, s, s, 1200, ['#b5aea3', '#e6e1d8'], 0.5, 1.2, 0.4);
  g.fillStyle = '#a9a196'; for (let k = 0; k <= 2; k++) { g.fillRect(k * s / 2 - 1, 0, 2, s); g.fillRect(0, k * s / 2 - 1, s, 2); }
});
T.marble = tex(1024, (g, s) => {          // porcelanato marmorizado bege (banheiro)
  g.fillStyle = '#ddd3c4'; g.fillRect(0, 0, s, s);
  clouds(g, s, s, 120, 'rgba(245,240,232,A)', 40, 200, 0.35);
  clouds(g, s, s, 60, 'rgba(190,175,155,A)', 40, 160, 0.15);
  g.strokeStyle = 'rgba(170,155,135,0.13)'; g.lineWidth = 1.0;
  for (let i = 0; i < 9; i++) { g.beginPath(); let x = rnd() * s, y = 0; g.moveTo(x, y); while (y < s) { y += 20; x += (rnd() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
  g.fillStyle = '#c5baa9'; g.fillRect(0, s / 2 - 1, s, 2); g.fillRect(0, 0, s, 2); g.fillRect(s / 2 - 1, 0, 2, s); g.fillRect(0, 0, 2, s);
});
function woodTex(base, dark, light, sz = 512) {
  return tex(sz, (g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) {
      g.strokeStyle = rnd() > 0.5 ? dark : light; g.globalAlpha = 0.05 + rnd() * 0.12; g.lineWidth = 0.6 + rnd() * 2.4;
      let x = rnd() * s; g.beginPath(); g.moveTo(x, 0);
      for (let y = 0; y <= s; y += 16) { x += (rnd() - 0.5) * 2.2; g.lineTo(x, y); } g.stroke();
    }
    g.globalAlpha = 1;
  });
}
T.oak = woodTex('#c09066', '#7f5634', '#dcb88e');
T.walnut = woodTex('#5a3a28', '#2e1d12', '#7a5640');
T.jute = tex(256, (g, s) => {
  g.fillStyle = '#c8b28b'; g.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 4) for (let x = 0; x < s; x += 4) {
    const v = ((x / 4 + y / 4) % 2) ? 18 : -10; const n = (rnd() - 0.5) * 30;
    g.fillStyle = `rgb(${200 + v + n},${178 + v + n},${138 + v + n})`; g.fillRect(x, y, 4, 4);
  }
});
T.rugGray = tex(256, (g, s) => {
  g.fillStyle = '#b8b2aa'; g.fillRect(0, 0, s, s);
  speckle(g, s, s, 6000, ['#9e978e', '#d8d3cc', '#c9c3bb'], 0.6, 1.5, 0.6);
});
T.linen = tex(256, (g, s) => {
  g.fillStyle = '#808080'; g.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 2) { g.fillStyle = `rgba(255,255,255,${0.05 + rnd() * 0.12})`; g.fillRect(0, y, s, 1); }
  for (let x = 0; x < s; x += 2) { g.fillStyle = `rgba(0,0,0,${0.04 + rnd() * 0.1})`; g.fillRect(x, 0, 1, s); }
}, false);
T.terrazzo = tex(512, (g, s) => {
  g.fillStyle = '#efebe4'; g.fillRect(0, 0, s, s);
  speckle(g, s, s, 900, ['#c9a77c', '#8c8a84', '#d7c9b2', '#6f6a60', '#e0b48a'], 1, 4.5, 1);
});
T.greenTile = tex(512, (g, s) => {        // revestimento verde vertical 7,5×30 (cozinha) — 8 col × 2 lin
  g.fillStyle = '#e4e7de'; g.fillRect(0, 0, s, s);
  const cw = s / 8, ch = s / 2;
  for (let i = 0; i < 8; i++) for (let j = -1; j < 3; j++) {
    const v = (rnd() - 0.5) * 14, y = j * ch;
    const gr = g.createLinearGradient(i * cw, 0, (i + 1) * cw, 0);
    gr.addColorStop(0, `rgb(${190 + v},${200 + v},${164 + v})`); gr.addColorStop(0.5, `rgb(${184 + v},${196 + v},${160 + v})`); gr.addColorStop(1, `rgb(${174 + v},${186 + v},${150 + v})`);
    g.fillStyle = gr; g.fillRect(i * cw + 1.5, y + 1.5, cw - 3, ch - 3);
  }
  clouds(g, s, s, 60, 'rgba(255,255,255,A)', 8, 40, 0.15);
});
T.stone = tex(1024, (g, s) => {           // painel pedra/travertino da cabeceira (dorm. casal)
  g.fillStyle = '#d8c6a8'; g.fillRect(0, 0, s, s);
  clouds(g, s, s, 160, 'rgba(240,228,206,A)', 40, 220, 0.4);
  clouds(g, s, s, 90, 'rgba(180,155,120,A)', 30, 160, 0.22);
  speckle(g, s, s, 3000, ['#c4ae8a', '#e8dcc6'], 0.5, 1.6, 0.4);
});
T.ceil = tex(256, (g, s) => {             // teto texturizado (relevo)
  g.fillStyle = '#808080'; g.fillRect(0, 0, s, s);
  speckle(g, s, s, 5000, ['#5c5c5c', '#a8a8a8', '#959595'], 0.6, 2.2, 0.8);
}, false);
T.leaf = tex(128, (g, s) => {
  g.clearRect(0, 0, s, s);
  const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, '#5e8a3a'); gr.addColorStop(1, '#2f5a22');
  g.fillStyle = gr; g.beginPath(); g.ellipse(s / 2, s / 2, s * 0.22, s * 0.46, 0, 0, 7); g.fill();
  g.strokeStyle = 'rgba(200,230,170,.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(s / 2, s * 0.06); g.lineTo(s / 2, s * 0.94); g.stroke();
});
function artTex(c1, c2, c3) {
  return tex(256, (g, s) => {
    g.fillStyle = '#f2ece2'; g.fillRect(0, 0, s, s * 1.3);
    g.fillStyle = c1; g.beginPath(); g.ellipse(s * .45, s * .62, s * .32, s * .07, 0, 0, 7); g.fill();
    g.fillStyle = c2; g.beginPath(); g.arc(s * .62, s * .38, s * .16, 0, 7); g.fill();
    g.strokeStyle = c3; g.lineWidth = 3; g.beginPath(); g.moveTo(s * .2, s * .8); g.bezierCurveTo(s * .4, s * .7, s * .6, s * .9, s * .85, s * .75); g.stroke();
  }, true, 333);
}

/* ------------------------------------------------------------------ materiais */
const std = (o) => new THREE.MeshStandardMaterial(o);
const M = {
  wall: std({ color: 0xe8e2d8, roughness: 0.92 }),
  wallWarm: std({ color: 0xebe0cf, roughness: 0.92 }),
  ceil: std({ color: 0xf5f3ef, roughness: 0.95, bumpMap: T.ceil, bumpScale: 1.6 }),
  floor: std({ map: T.floor, roughness: 0.28, roughnessMap: T.floorR, envMapIntensity: 0.8 }),
  bathFloor: std({ map: T.bathFloor, roughness: 0.35 }),
  marble: std({ map: T.marble, roughness: 0.22 }),
  white: std({ color: 0xe8e3db, roughness: 0.42 }),
  whiteMatte: std({ color: 0xece8e1, roughness: 0.75 }),
  oak: std({ map: T.oak, roughness: 0.55 }),
  walnut: std({ map: T.walnut, roughness: 0.5 }),
  alu: std({ color: 0xf1f1ef, roughness: 0.35, metalness: 0.25 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xe8f1f4, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, envMapIntensity: 1.4, depthWrite: false, side: THREE.DoubleSide }),
  steel: std({ color: 0xbfc2c4, roughness: 0.38, metalness: 0.9 }),
  chrome: std({ color: 0xe6e6e6, roughness: 0.12, metalness: 1 }),
  black: std({ color: 0x1c1c1c, roughness: 0.45 }),
  blackGloss: std({ color: 0x0b0b0c, roughness: 0.3, metalness: 0.1, envMapIntensity: 0.2 }),
  porcelain: std({ color: 0xf8f8f6, roughness: 0.12 }),
  sage: std({ color: 0xbfc4a0, roughness: 0.48 }),
  terrazzo: std({ map: T.terrazzo, roughness: 0.3 }),
  greenTile: std({ map: T.greenTile, roughness: 0.18 }),
  stone: std({ map: T.stone, roughness: 0.75 }),
  jute: std({ map: T.jute, roughness: 1 }),
  rugGray: std({ map: T.rugGray, roughness: 1 }),
  linenBeige: std({ color: 0xd9d0c3, roughness: 1, bumpMap: T.linen, bumpScale: 0.6 }),
  linenWhite: std({ color: 0xebe6de, roughness: 1, bumpMap: T.linen, bumpScale: 0.4 }),
  rust: std({ color: 0x9a4e2c, roughness: 0.95, bumpMap: T.linen, bumpScale: 0.6 }),
  burgundy: std({ color: 0x6b2a38, roughness: 0.95, bumpMap: T.linen, bumpScale: 1.2 }),
  olive: std({ color: 0x5d6a37, roughness: 0.95, bumpMap: T.linen, bumpScale: 0.6 }),
  boucleDS: std({ color: 0xe0d9cd, roughness: 1, side: THREE.DoubleSide }),
  boucle: std({ color: 0xe0d9cd, roughness: 1, bumpMap: T.rugGray, bumpScale: 1.2 }),
  pink: std({ color: 0xe9d0cc, roughness: 0.85 }),
  rose: std({ color: 0xc98a8f, roughness: 0.95, bumpMap: T.linen, bumpScale: 0.5 }),
  sheer: std({ color: 0xe6dfd3, roughness: 1, transparent: true, opacity: 0.86, side: THREE.DoubleSide, bumpMap: T.linen, bumpScale: 0.3 }),
  leaf: std({ map: T.leaf, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 }),
  potWhite: std({ color: 0xeeeae3, roughness: 0.6 }),
  potClay: std({ color: 0xb8805a, roughness: 0.8 }),
  ledOff: std({ color: 0xf7f6f2, roughness: 0.3, emissive: 0xfff1d6, emissiveIntensity: 0.25 }),
  screen: std({ color: 0x030304, roughness: 0.22, metalness: 0, envMapIntensity: 0.08 }),
  mirror: std({ color: 0xeef2f3, roughness: 0.0, metalness: 1 }),
  water: std({ color: 0xb4c7ca, roughness: 0.05 }),
};

/* ------------------------------------------------------------------ céu e entorno */
const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x8db7e0) }, hor: { value: new THREE.Color(0xeaf1f5) }, gnd: { value: new THREE.Color(0x9aa38c) } },
  vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'uniform vec3 top,hor,gnd; varying vec3 vP; void main(){ float h=vP.y; vec3 c = h>0. ? mix(hor,top,pow(h,0.55)) : mix(hor,gnd,pow(-h,0.35)); gl_FragColor=vec4(c,1.); }'
}));
scene.add(sky);
// entorno neutro: o book não documenta a vista de cada unidade, então nada específico é inventado
const groundMat = std({ color: 0x8d987a, roughness: 1 });
const ground = mesh(new THREE.PlaneGeometry(600, 600), groundMat, scene, false, false);
ground.rotation.x = -Math.PI / 2; ground.position.y = -24;
{ // fachada simplificada ao redor do apartamento (lajes e alvenaria externas)
  const fac = std({ color: 0xd9d4cc, roughness: 0.9 });
  const tower = bx(-0.3, W_ + 0.3, -24, -0.2, -0.3, D_ + 0.3, fac, G.struct, 1, false); tower.name = 'tower';
  bx(-0.3, W_ + 0.3, H + 0.12, H + 0.4, -0.3, D_ + 0.3, fac, G.ceil, 1, false);
}

/* ------------------------------------------------------------------ estrutura */
const T_W = 18 / S;
// piso
{
  const f = mesh(planeUV(W_, D_, 1.2), M.floor, G.struct, false, true);
  f.rotation.x = -Math.PI / 2; f.position.set(W_ / 2, 0, D_ / 2); f.name = 'floor';
  bx(0, W_, -0.2, -0.001, 0, D_, M.whiteMatte, G.struct, 1, false);
  const bf = mesh(planeUV(X(1004) - X(540), Z(1015) - Z(793), 1.2), M.bathFloor, G.struct, false, true);
  bf.rotation.x = -Math.PI / 2; bf.position.set((X(540) + X(1004)) / 2, 0.003, (Z(793) + Z(1015)) / 2);
}
// teto texturizado
const ceiling = bx(0, W_, H, H + 0.12, 0, D_, M.ceil, G.ceil, 0.6);
for (const w of plan.walls) { pr(w, 0, H, M.wall, G.struct); solid('struct', X(w[0]), Z(w[1]), X(w[2]), Z(w[3])); }
pr(plan.shaftBalcony, 0, H, M.wall, G.struct); solid('struct', X(1448), Z(140), X(1530), Z(218));
// rodapés (porcelanato 7 cm) nas paredes principais do social e dorms
function skirting(axis, a0, a1, face, sign, parent = G.struct) {
  if (axis === 'x') bx(a0, a1, 0, 0.07, face, face + sign * 0.012, M.white, parent, 1, false);
  else bx(face, face + sign * 0.012, 0, 0.07, a0, a1, M.white, parent, 1, false);
}
skirting('z', Z(140), Z(775), X(540), 1); skirting('x', X(540), X(1004), Z(140), 1);
skirting('z', Z(140), Z(588), X(1022), 1); skirting('x', X(1022), X(1430), Z(140), 1);
skirting('z', Z(330), Z(1062), X(1858), -1); skirting('z', Z(330), Z(605), X(1448), 1);

// janelas (alumínio branco de correr, 2 folhas)
function slidingUnit(x0, x1, zc, y0, y1, parent, isDoor = false) {
  const fw = 0.045, w = x1 - x0;
  bx(x0, x1, y0, y0 + fw, zc - 0.04, zc + 0.04, M.alu, parent); bx(x0, x1, y1 - fw, y1, zc - 0.04, zc + 0.04, M.alu, parent);
  bx(x0, x0 + fw, y0, y1, zc - 0.04, zc + 0.04, M.alu, parent); bx(x1 - fw, x1, y0, y1, zc - 0.04, zc + 0.04, M.alu, parent);
  const half = w / 2 + 0.03;
  [[x0 + fw, x0 + half, -0.015], [x1 - half, x1 - fw, 0.015]].forEach(([a, b, dz], i) => {
    const sash = new THREE.Group(); parent.add(sash);
    const s = 0.04;
    bx(a, b, y0 + fw, y0 + fw + s, zc + dz - 0.012, zc + dz + 0.012, M.alu, sash); bx(a, b, y1 - fw - s, y1 - fw, zc + dz - 0.012, zc + dz + 0.012, M.alu, sash);
    bx(a, a + s, y0 + fw, y1 - fw, zc + dz - 0.012, zc + dz + 0.012, M.alu, sash); bx(b - s, b, y0 + fw, y1 - fw, zc + dz - 0.012, zc + dz + 0.012, M.alu, sash);
    const gl = mesh(new THREE.PlaneGeometry(b - a - 2 * s, y1 - y0 - 2 * fw - 2 * s), M.glass, sash, false, false);
    gl.position.set((a + b) / 2, (y0 + y1) / 2, zc + dz); gl.renderOrder = 2;
    if (isDoor) bx(i ? a + 0.05 : b - 0.07, i ? a + 0.07 : b - 0.05, 0.95, 1.15, zc + dz - 0.03, zc + dz + 0.03, M.black, sash);
  });
}
for (const w of plan.windows) {
  const r = w.r, zc = (Z(r[1]) + Z(r[3])) / 2;
  pr(r, 0, w.sill, M.wall, G.struct); pr(r, w.head, H, M.wall, G.struct);
  bx(X(r[0]) - 0.02, X(r[2]) + 0.02, w.sill - 0.02, w.sill, Z(r[3]) - 0.005, Z(r[3]) + 0.03, M.white, G.struct); // peitoril interno
  slidingUnit(X(r[0]), X(r[2]), zc, w.sill, w.head, G.struct);
  solid('struct', X(r[0]), Z(r[1]), X(r[2]), Z(r[3]));
}
// borda da varanda: guarda-corpo (A/B) ou janela da sala (C)
{
  const r = plan.balconyEdge, z0 = Z(r[1]), z1 = Z(r[3]), zc = (z0 + z1) / 2;
  bx(X(r[0]), X(r[2]), H - 0.25, H, z0, z1, M.wall, G.varAB);                     // viga
  bx(X(r[0]), X(r[2]), 0, 0.12, z0, z1, M.wall, G.varAB);                          // mureta/soleira
  const rail = M.white;
  { const tr = cyl(0.03, 0.03, X(r[2]) - X(r[0]) - 0.04, rail, G.varAB, (X(r[0]) + X(r[2])) / 2, 1.1, zc, 16); tr.rotation.z = Math.PI / 2; }
  bx(X(r[0]) + 0.02, X(r[2]) - 0.02, 0.16, 0.2, zc - 0.02, zc + 0.02, rail, G.varAB);
  bx(X(r[0]) + 0.02, X(r[2]) - 0.02, 0.9, 0.93, zc - 0.02, zc + 0.02, rail, G.varAB);
  for (let x = X(r[0]) + 0.08; x < X(r[2]) - 0.06; x += 0.15) bx(x, x + 0.04, 0.12, 1.08, zc - 0.02, zc + 0.02, rail, G.varAB);
  solid('varAB', X(r[0]), z0, X(r[2]), z1);
  // tipologia C: área incorporada à sala com janela
  pr([1530, 122, 1858, 140], 0, 1.0, M.wall, G.varC); pr([1530, 122, 1858, 140], 2.2, H, M.wall, G.varC);
  bx(X(1530), X(1858), 0.98, 1.0, z1 - 0.005, z1 + 0.03, M.white, G.varC);
  slidingUnit(X(1530), X(1858), zc, 1.0, 2.2, G.varC);
}
// divisória sala/varanda com porta de correr (A/B)
{
  for (const w of plan.balconyDivider) { pr(w, 0, H, M.wall, G.varAB); solid('varAB', X(w[0]), Z(w[1]), X(w[2]), Z(w[3])); }
  const r = plan.balconyDoor, zc = (Z(r[1]) + Z(r[3])) / 2;
  pr(r, 2.2, H, M.wall, G.varAB);
  slidingUnit(X(r[0]), X(r[2]), zc, 0, 2.2, G.varAB, true);
  // folha fixa à esquerda (lado da TV), passagem pela folha da direita
  solid('varAB', X(r[0]), Z(r[1]), X(r[0]) + (X(r[2]) - X(r[0])) / 2, Z(r[3]));
}
// portas internas e de entrada
for (const d of plan.doors) {
  const r = d.r, ax = d.axis;
  pr(r, 2.1, H, M.wall, G.struct);
  const len = ax === 'x' ? X(r[2]) - X(r[0]) : Z(r[3]) - Z(r[1]);
  const hx = X(d.hinge[0]), hz = Z(d.hinge[1]);
  const grp = new THREE.Group(); grp.position.set(hx, 0, hz); G.struct.add(grp);
  const leafLen = len - 0.04, mat = d.id === 'entrada' ? M.oak : M.white;
  const leaf = new THREE.Group(); grp.add(leaf);
  if (ax === 'x') {
    const dir = Math.sign((X(r[0]) + X(r[2])) / 2 - hx);
    bx(0, dir * leafLen, 0.01, 2.08, -0.018, 0.018, mat, leaf);
    bx(dir * (leafLen - 0.08), dir * (leafLen - 0.2), 1.02, 1.04, -0.05, 0.05, M.chrome, leaf);
  } else {
    const dir = Math.sign((Z(r[1]) + Z(r[3])) / 2 - hz);
    bx(-0.018, 0.018, 0.01, 2.08, 0, dir * leafLen, mat, leaf);
    bx(-0.05, 0.05, 1.02, 1.04, dir * (leafLen - 0.08), dir * (leafLen - 0.2), M.chrome, leaf);
  }
  grp.rotation.y = THREE.MathUtils.degToRad(d.openDeg);
  // batentes/alizares
  if (ax === 'x') { bx(X(r[0]), X(r[0]) + 0.03, 0, 2.1, Z(r[1]) - 0.01, Z(r[3]) + 0.01, M.white, G.struct); bx(X(r[2]) - 0.03, X(r[2]), 0, 2.1, Z(r[1]) - 0.01, Z(r[3]) + 0.01, M.white, G.struct); }
  else { bx(X(r[0]) - 0.01, X(r[2]) + 0.01, 0, 2.1, Z(r[1]), Z(r[1]) + 0.03, M.white, G.struct); bx(X(r[0]) - 0.01, X(r[2]) + 0.01, 0, 2.1, Z(r[3]) - 0.03, Z(r[3]), M.white, G.struct); }
}
solid('struct', X(1675), Z(1062), X(1832), D_ + 0.5); // porta de entrada: não sair do apartamento
const corridor = new THREE.Group(); G.struct.add(corridor);
{ // corredor do pavimento visto pela porta aberta (neutro, não documentado no book)
  const cm = std({ color: 0xdedad2, roughness: 0.9 });
  bx(X(1500), W_ + 0.6, -0.05, 0, D_, D_ + 1.4, M.floor, corridor, 1.2, false);
  bx(X(1500), W_ + 0.6, H, H + 0.1, D_, D_ + 1.4, M.ceil, corridor, 1, false);
  bx(X(1500), W_ + 0.6, 0, H, D_ + 1.4, D_ + 1.5, cm, corridor, 1, false);
  bx(W_ + 0.6, W_ + 0.7, 0, H, D_, D_ + 1.5, cm, corridor, 1, false);
  bx(X(1500) - 0.1, X(1500), 0, H, D_, D_ + 1.5, cm, corridor, 1, false);
}

/* ------------------------------------------------------------------ revestimentos */
// banheiro: porcelanato até o teto (premissa a partir da imagem ilustrativa p. 30)
{
  const p = G.struct, y1 = H;
  panel('x', X(540), X(1004), 0, y1, Z(793), 1, M.marble, p, 1.2);
  panel('z', Z(793), Z(958), 0, y1, X(540), 1, M.marble, p, 1.2);
  panel('z', Z(793), Z(805), 0, y1, X(1004), -1, M.marble, p, 1.2);
  panel('z', Z(930), Z(1015), 0, y1, X(1004), -1, M.marble, p, 1.2);
  panel('z', Z(805), Z(930), 2.1, y1, X(1004), -1, M.marble, p, 1.2);
  panel('x', X(786), X(1004), 0, y1, Z(1015), -1, M.marble, p, 1.2);
  panel('x', X(690), X(786), 0, y1, Z(1004), -1, M.marble, p, 1.2);
  panel('x', X(540), X(690), 0, y1, Z(958), -1, M.marble, p, 1.2);
  panel('z', Z(958), Z(1004), 0, y1, X(690), 1, M.marble, p, 1.2);
  panel('z', Z(1004), Z(1015), 0, y1, X(786), 1, M.marble, p, 1.2);
}
// cozinha: revestimento verde entre bancada e armários (decorado)
panel('x', X(1290), X(1615), 0.9, 1.55, Z(1062), -1, M.greenTile, G.decor, 0.6);
// área de serviço: faixa de revestimento sobre tanque (base)
panel('x', X(1022), X(1290), 0.9, 1.5, Z(1015), -1, M.marble, G.struct, 1.2);
// sala: parede de fundo em tom areia (imagem p. 24)
panel('z', Z(330), Z(1062), 0, H, X(1858), -1, M.wallWarm, G.decor, 1, 0.003);

/* ------------------------------------------------------------------ plantas */
function plant(x, y, z, size, parent, pot = M.potWhite, n = 70, spread = 1) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const pr_ = size * 0.32;
  const potM = mesh(new THREE.CylinderGeometry(pr_, pr_ * 0.8, size * 0.55, 24), pot, g); potM.position.y = size * 0.275;
  const soil = mesh(new THREE.CylinderGeometry(pr_ * 0.92, pr_ * 0.92, 0.01, 16), std({ color: 0x3a2b20 }), g, false); soil.position.y = size * 0.53;
  const leafGeo = new THREE.PlaneGeometry(size * 0.28, size * 0.5); leafGeo.translate(0, size * 0.25, 0);
  const inst = new THREE.InstancedMesh(leafGeo, M.leaf, n); inst.castShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = rnd() * pr_ * 0.6 * spread;
    p.set(Math.cos(a) * r, size * (0.55 + rnd() * 0.35), Math.sin(a) * r);
    e.set((0.35 + rnd() * 0.9) * (rnd() > 0.5 ? 1 : -1) * 0.9, a, 0, 'YXZ'); e.x = 0.3 + rnd() * 1.0;
    q.setFromEuler(new THREE.Euler(-(0.25 + rnd() * 1.0), a + Math.PI / 2 + (rnd() - 0.5), 0, 'YXZ'));
    const s = 0.6 + rnd() * 0.6; sc.set(s, s, s); m4.compose(p, q, sc); inst.setMatrixAt(i, m4);
  }
  g.add(inst); return g;
}
function hanging(x, y, z, parent) { // jiboia pendente
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const pot = mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.1, 18), M.potWhite, g); pot.position.y = 0.05;
  const leafGeo = new THREE.PlaneGeometry(0.06, 0.08); const n = 90;
  const inst = new THREE.InstancedMesh(leafGeo, M.leaf, n); inst.castShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < n; i++) {
    const vine = i % 6, t = (i / 6 | 0) / 15, a = vine / 6 * Math.PI * 2;
    p.set(Math.cos(a) * (0.09 + t * 0.06) + (rnd() - .5) * .03, 0.08 - t * (0.5 + vine * 0.08), Math.sin(a) * (0.09 + t * 0.06) + (rnd() - .5) * .03);
    q.setFromEuler(new THREE.Euler(rnd() * 1.2 - 0.6, rnd() * 6.28, rnd() * 1.2 - 0.6)); m4.compose(p, q, s); inst.setMatrixAt(i, m4);
  }
  g.add(inst); return g;
}
function book(x, y, z, w, h, d, color, parent, rotY = 0) {
  const m = bx(x - w / 2, x + w / 2, y, y + h, z - d / 2, z + d / 2, std({ color, roughness: 0.8 }), parent); m.rotation.y = rotY; return m;
}
function frame(cx, cy, face, sign, axis, w, h, art, parent) {
  const g = new THREE.Group(); parent.add(g);
  const depth = 0.025;
  if (axis === 'z') {
    bx(face, face + sign * depth, cy - h / 2, cy + h / 2, cx - w / 2, cx + w / 2, M.oak, g);
    const p = panel('z', cx - w / 2 + 0.03, cx + w / 2 - 0.03, cy - h / 2 + 0.03, cy + h / 2 - 0.03, face, sign, std({ map: art, roughness: 0.9 }), g, 10, depth + 0.002);
    p.material.map.repeat.set(1, 1);
  } else {
    bx(cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2, face, face + sign * depth, M.oak, g);
    panel('x', cx - w / 2 + 0.03, cx + w / 2 - 0.03, cy - h / 2 + 0.03, cy + h / 2 - 0.03, face, sign, std({ map: art, roughness: 0.9 }), g, 10, depth + 0.002);
  }
  return g;
}
function curtain(x0, x1, z, y0, y1, parent) {     // cortina de voil com pregas
  const w = x1 - x0, seg = Math.max(12, Math.round(w * 40));
  const geo = new THREE.PlaneGeometry(w, y1 - y0, seg, 1); const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 38) * 0.025);
  geo.computeVertexNormals();
  const m = mesh(geo, M.sheer, parent, false, true); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, z); return m;
}
function rugEllipse(cx, cz, rx, rz, mat, parent, rot = 0) {
  const geo = new THREE.CircleGeometry(1, 48); geo.scale(rx, rz, 1);
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rx * 2, uv.getY(i) * rz * 2);
  const m = mesh(geo, mat, parent, false, true); m.rotation.set(-Math.PI / 2, 0, rot); m.position.set(cx, 0.008, cz); return m;
}
function chairDining(x, z, faceTo, parent) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.atan2(faceTo[0] - x, faceTo[1] - z); parent.add(g);
  for (const [lx, lz] of [[-0.19, -0.17], [0.19, -0.17], [-0.19, 0.17], [0.19, 0.17]]) {
    const l = cyl(0.014, 0.011, 0.45, M.oak, g, lx, 0.225, lz, 10); l.rotation.set(lz > 0 ? -0.08 : 0.08, 0, lx > 0 ? 0.06 : -0.06);
  }
  rbox(0.46, 0.07, 0.44, 0.03, M.boucle, g, 0, 0.48, 0);
  // encosto curvo estofado, do lado oposto à mesa
  const back = mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.24, 32, 1, true, -Math.PI * 0.36, Math.PI * 0.72), M.boucleDS, g);
  back.position.set(0, 0.68, 0.06); back.rotation.y = Math.PI; back.scale.set(1, 1, 1);
  return g;
}
function cushion(x, y, z, w, h, mat, parent, ry = 0, rx = 0) { const c = rbox(w, h, 0.12, 0.05, mat, parent, x, y, z); c.rotation.set(rx, ry, 0); return c; }

/* ================================================================== DECORADO */
const D = G.decor;
/* ---- Dormitório 01 (casal) — p. 28 */
{
  const xw = X(540), z0 = Z(225), bz0 = 0.56, bz1 = 2.0, bzc = (bz0 + bz1) / 2;
  panel('z', Z(225), Z(510), 0, 2.0, xw, 1, M.stone, D, 1.2);
  // torres laterais (planta: nichos em madeira; imagem: armário branco)
  for (const [za, zb] of [[Z(140), Z(225)], [Z(510), Z(630)]]) {
    bx(xw, X(635), 0, 2.4, za, zb, M.white, D);
    bx(xw + 0.01, X(635) + 0.002, 0.45, 0.75, za + 0.02, zb - 0.02, M.oak, D);
    solid('decor', xw, za, X(635), zb);
  }
  bx(xw, xw + 0.38, 2.0, 2.45, Z(225), Z(510), M.white, D);          // armário ponte
  bx(xw + 0.38, xw + 0.39, 1.98, 2.0, Z(225), Z(510), M.oak, D);
  // cama casal 1,38 × 1,88
  rbox(0.08, 1.05, 1.5, 0.03, M.linenWhite, D, xw + 0.06, 0.62, bzc);  // cabeceira estofada
  bx(xw + 0.1, xw + 2.0, 0.08, 0.36, bzc - 0.71, bzc + 0.71, M.whiteMatte, D);
  rbox(1.88, 0.24, 1.40, 0.06, M.linenWhite, D, xw + 1.05, 0.48, bzc);
  rbox(1.30, 0.06, 1.46, 0.03, M.linenWhite, D, xw + 1.35, 0.62, bzc);
  rbox(0.62, 0.035, 1.5, 0.02, M.burgundy, D, xw + 1.7, 0.64, bzc);
  bx(xw + 1.98, xw + 2.02, 0.28, 0.64, bzc - 0.74, bzc + 0.74, M.burgundy, D);
  for (const dz of [-0.35, 0.35]) { cushion(xw + 0.3, 0.74, bzc + dz, 0.62, 0.32, M.linenWhite, D, Math.PI / 2, -0.25); cushion(xw + 0.42, 0.72, bzc + dz, 0.5, 0.28, M.linenWhite, D, Math.PI / 2, -0.2); }
  cushion(xw + 0.5, 0.7, bzc, 0.4, 0.22, M.burgundy, D, Math.PI / 2, -0.15);
  solid('decor', xw, bz0 - 0.1, xw + 2.05, bz1 + 0.1);
  { const rug = mesh(planeUV(X(965) - X(655), Z(605) - Z(165), 1), M.rugGray, D, false, true); rug.rotation.x = -Math.PI / 2; rug.position.set((X(655) + X(965)) / 2, 0.008, (Z(165) + Z(605)) / 2); }
  // guarda-roupa — planta p. 32
  bx(xw, X(840), 0, 2.4, Z(675), Z(775), M.white, D);
  for (let i = 1; i < 4; i++) bx(xw + i * (X(840) - xw) / 4 - 0.002, xw + i * (X(840) - xw) / 4 + 0.002, 0.02, 2.38, Z(675) - 0.002, Z(675) + 0.002, M.whiteMatte, D);
  for (let i = 0; i < 4; i++) { const x = xw + (i + 0.5) * (X(840) - xw) / 4 + (i % 2 ? -0.17 : 0.17); bx(x - 0.01, x + 0.01, 0.9, 1.4, Z(675) - 0.025, Z(675), M.oak, D); }
  solid('decor', xw, Z(675), X(840), Z(775));
  plant(xw + 0.2, 0.75, Z(185), 0.25, D);
  for (let i = 0; i < 4; i++) book(xw + 0.25, 0.75, Z(560) + i * 0.04, 0.2, 0.22 + rnd() * 0.05, 0.03, ['#a28c6d', '#efe7da', '#6d5a49', '#c9b79a'][i], D);
  curtain(X(625), X(905), Z(140) + 0.09, 0.05, 2.45, D);
  const lampG = new THREE.Group(); D.add(lampG);
  cyl(0.08, 0.1, 0.16, M.potWhite, lampG, xw + 0.22, 0.83, Z(600));
}
/* ---- Dormitório 02 — p. 29 */
{
  const xw = X(1022);
  // cabeceiras em arco (rosa) na parede lateral
  for (let i = 0; i < 3; i++) {
    const sh = new THREE.Shape(), w = 0.5, h = 1.05 + (i === 1 ? 0.12 : 0);
    sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(w / 2, h - w / 2); sh.absarc(0, h - w / 2, w / 2, 0, Math.PI, false); sh.lineTo(-w / 2, 0);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.025, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 });
    const m = mesh(geo, M.pink, D); m.rotation.y = Math.PI / 2; m.position.set(xw + 0.004, 0.25, Z(240) + i * 0.6);
  }
  panel('z', Z(140), Z(588), 2.05, H, xw, 1, M.oak, D, 1);           // faixa de madeira (imagem)
  // cama de solteiro 0,88 × 1,88 com baú estofado
  const bx0 = X(1028), bx1 = bx0 + 0.9, bz0 = Z(145), bz1 = bz0 + 1.9;
  rbox(0.9, 0.38, 1.9, 0.05, M.linenWhite, D, (bx0 + bx1) / 2, 0.19, (bz0 + bz1) / 2);
  rbox(0.86, 0.18, 1.84, 0.06, M.linenWhite, D, (bx0 + bx1) / 2, 0.46, (bz0 + bz1) / 2);
  cushion(bx0 + 0.18, 0.66, bz0 + 0.5, 0.45, 0.4, M.rose, D, Math.PI / 2 - 0.1, 0);
  cushion(bx0 + 0.16, 0.64, bz0 + 1.0, 0.45, 0.4, M.linenWhite, D, Math.PI / 2, 0);
  cushion(bx0 + 0.4, 0.62, bz0 + 0.25, 0.36, 0.26, M.burgundy, D, 0.2, -0.3);
  solid('decor', bx0, bz0, bx1, bz1);
  // criado-mudo
  bx(X(1200), X(1270), 0, 0.5, Z(145), Z(215), M.white, D); bx(X(1200) + 0.01, X(1270) - 0.01, 0.24, 0.26, Z(215) - 0.002, Z(215) + 0.002, M.oak, D);
  plant((X(1200) + X(1270)) / 2, 0.5, Z(180), 0.16, D);
  // estante e escrivaninha (planta: x 1350–1428)
  const sx0 = X(1350), sx1 = X(1428);
  bx(sx1 - 0.02, sx1, 0, 2.2, Z(145), Z(325), M.white, D);
  for (let y = 0.0; y <= 2.2; y += 0.44) bx(sx0, sx1, y, y + 0.025, Z(145), Z(325), M.white, D);
  bx(sx0, sx0 + 0.02, 0, 2.2, Z(145), Z(145) + 0.02, M.white, D);
  const toys = ['#e4c8a6', '#c98a8f', '#9fb3a6', '#f0e2c8'];
  for (let k = 0; k < 4; k++) rbox(0.12, 0.14, 0.12, 0.04, std({ color: toys[k], roughness: 0.9 }), D, (sx0 + sx1) / 2, 0.47 + k * 0.44, Z(170) + (k % 2) * 0.35);
  bx(sx0, sx1, 0.73, 0.76, Z(325), Z(445), M.oak, D);
  for (const zz of [Z(328), Z(442)]) bx(sx0 + 0.02, sx0 + 0.04, 0, 0.73, zz - 0.01, zz + 0.01, M.white, D);
  bx(sx0 + 0.02, sx1, 0.3, 0.32, Z(328), Z(442), M.white, D);
  solid('decor', sx0, Z(145), sx1, Z(445));
  // cadeira tulipa
  cyl(0.2, 0.2, 0.02, M.white, D, X(1310), 0.01, Z(375)); cyl(0.025, 0.04, 0.42, M.white, D, X(1310), 0.22, Z(375));
  rbox(0.42, 0.05, 0.42, 0.04, M.white, D, X(1310), 0.45, Z(375)); rbox(0.36, 0.04, 0.36, 0.04, M.oak, D, X(1310), 0.485, Z(375));
  const back = rbox(0.06, 0.38, 0.42, 0.03, M.white, D, X(1310) - 0.2, 0.68, Z(375)); back.rotation.z = 0.12;
  rugEllipse(X(1262), Z(372), 0.45, 0.62, M.jute, D, 0.2);
  curtain(X(1100), X(1378), Z(140) + 0.09, 0.05, 2.45, D);
}
/* ---- Sala de estar / jantar — p. 24–25 */
{
  const xe = X(1858);
  // sofá 2 lugares linho (encostado à parede leste)
  const sz0 = 1.15, sz1 = 2.65, sx0 = xe - 0.88;
  rbox(0.86, 0.42, 1.62, 0.06, M.linenBeige, D, xe - 0.44, 0.27, (sz0 + sz1) / 2);
  rbox(0.2, 0.5, 1.5, 0.06, M.linenBeige, D, xe - 0.11, 0.7, (sz0 + sz1) / 2);
  for (const z of [sz0 + 0.1, sz1 - 0.1]) rbox(0.86, 0.6, 0.2, 0.07, M.linenBeige, D, xe - 0.44, 0.3, z);
  for (const z of [1.53, 2.27]) rbox(0.6, 0.13, 0.7, 0.05, M.linenBeige, D, xe - 0.5, 0.54, z);
  for (const z of [1.55, 2.25]) cushion(xe - 0.3, 0.76, z, 0.38, 0.38, M.rust, D, Math.PI / 2 + 0.05, -0.18);
  solid('decor', sx0, sz0, xe, sz1);
  rugEllipse(X(1625), Z(470), 1.05, 1.3, M.jute, D, 0.15);
  // rack + TV + painel ripado
  const xw = X(1448);
  bx(xw, xw + 0.32, 0.18, 0.55, Z(345), Z(595), M.oak, D);
  bx(xw, xw + 0.32, 0.17, 0.18, Z(345), Z(595), M.black, D);
  for (let z = Z(345); z < Z(595) - 0.05; z += 0.012 * 8) bx(xw + 0.004, xw + 0.03, 0.62, H, z, z + 0.05, M.oak, D);
  bx(xw + 0.03, xw + 0.06, 1.0, 1.66, 1.38, 2.5, M.blackGloss, D);
  const scr = panel('z', 1.4, 2.48, 1.02, 1.64, xw + 0.06, 1, M.screen, D, 10, 0.001); scr.castShadow = false;
  plant(xw + 0.16, 0.55, Z(370), 0.2, D, M.potClay);
  for (let i = 0; i < 3; i++) book(xw + 0.17, 0.55, Z(560) + i * 0.035, 0.18, 0.04, 0.24, ['#efe7da', '#a28c6d', '#2e2a26'][i], D, 0);
  solid('decor', xw, Z(345), xw + 0.32, Z(595));
  // quadros, luminária de piso, mesa lateral
  frame(1.62, 1.6, xe, -1, 'z', 0.42, 0.56, artTex('#c9a77c', '#b5643a', '#5d6a37'), D);
  frame(2.12, 1.6, xe, -1, 'z', 0.42, 0.56, artTex('#9a8a72', '#d9c3a0', '#6d2b3a'), D);
  const lx = xe - 0.33, lz = 2.8;
  cyl(0.13, 0.13, 0.02, M.black, D, lx, 0.01, lz); cyl(0.008, 0.008, 1.6, M.black, D, lx, 0.8, lz);
  const shade = mesh(new THREE.SphereGeometry(0.11, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.black, D); shade.position.set(lx, 1.6, lz - 0.17); shade.rotation.x = -0.5;
  bx(lx - 0.005, lx + 0.005, 1.6, 1.61, lz - 0.17, lz, M.black, D);
  curtain(X(1448) + 0.05, X(1448) + 0.45, Z(330) + 0.08, 0.04, 2.45, D);
  curtain(xe - 0.42, xe - 0.02, Z(330) + 0.08, 0.04, 2.45, D);
  // mesa redonda + 3 cadeiras — planta
  const tx = X(1483), tz = Z(697);
  cyl(0.45, 0.45, 0.03, M.white, D, tx, 0.75, tz, 48);
  cyl(0.06, 0.2, 0.72, M.oak, D, tx, 0.37, tz, 32); cyl(0.22, 0.24, 0.02, M.oak, D, tx, 0.01, tz, 32);
  chairDining(tx - 0.62, tz, [tx, tz], D); chairDining(tx + 0.62, tz, [tx, tz], D); chairDining(tx, tz + 0.62, [tx, tz], D);
  plant(tx, 0.765, tz, 0.16, D, M.potWhite, 40, 1.4);
  solid('decor', tx - 0.48, tz - 0.48, tx + 0.48, tz + 0.48);
  hanging(xw + 0.25, H - 0.32, Z(332) + 0.02, D);
}
/* ---- Varanda — p. 26–27 */
{
  const ax = X(1795), az = Z(215);
  const ch = new THREE.Group(); ch.position.set(ax, 0, az); ch.rotation.y = -2.4; D.add(ch);
  rbox(0.72, 0.36, 0.7, 0.08, std({ color: 0xc8b89a, roughness: 0.85 }), ch, 0, 0.22, 0);
  rbox(0.6, 0.12, 0.56, 0.05, M.olive, ch, 0, 0.44, 0.04);
  rbox(0.72, 0.42, 0.12, 0.06, M.olive, ch, 0, 0.66, -0.3);
  cushion(0, 0.62, -0.17, 0.4, 0.28, M.olive, ch, 0, -0.2);
  solid('decor', ax - 0.38, az - 0.38, ax + 0.38, az + 0.38);
  cyl(0.18, 0.18, 0.03, M.oak, D, X(1630), 0.48, Z(190)); cyl(0.14, 0.12, 0.47, M.oak, D, X(1630), 0.235, Z(190), 20);
  plant(X(1630), 0.495, Z(190), 0.13, D);
}
/* ---- Cozinha — p. 28 (imagem) / planta */
{
  const x0 = X(1290), x1 = X(1615), zb = Z(1062), zf = Z(965);
  bx(x0, x1, 0.1, 0.87, zf + 0.04, zb, M.sage, D);
  bx(x0, x1, 0, 0.1, zf + 0.08, zb, M.black, D);
  for (let i = 1; i < 4; i++) bx(x0 + i * (x1 - x0) / 4 - 0.002, x0 + i * (x1 - x0) / 4 + 0.002, 0.1, 0.87, zf + 0.035, zf + 0.04, std({ color: 0xa9ae8b }), D);
  bx(x0, x1, 0.87, 0.9, zf, zb, M.terrazzo, D);
  // cooktop 4 bocas
  bx(x0 + 0.05, x0 + 0.6, 0.9, 0.906, zf + 0.04, zb - 0.04, M.blackGloss, D);
  for (const [dx, dz] of [[0.18, 0.13], [0.43, 0.13], [0.18, 0.35], [0.43, 0.35]]) {
    const rr = mesh(new THREE.TorusGeometry(0.055, 0.008, 6, 24), M.steel, D); rr.rotation.x = Math.PI / 2; rr.position.set(x0 + dx, 0.912, zf + dz);
  }
  // cuba inox + torneira
  const sx = X(1500);
  bx(sx - 0.25, sx + 0.25, 0.905, 0.907, zf + 0.08, zb - 0.08, M.steel, D);
  bx(sx - 0.22, sx + 0.22, 0.88, 0.902, zf + 0.1, zb - 0.1, std({ color: 0x8a8d8f, metalness: 1, roughness: 0.35 }), D);
  cyl(0.014, 0.018, 0.3, M.chrome, D, sx, 1.05, zb - 0.06); const sp = cyl(0.012, 0.012, 0.18, M.chrome, D, sx, 1.2, zb - 0.14); sp.rotation.x = Math.PI / 2;
  // armários superiores: madeira (com nicho do micro-ondas) + branco
  const uz0 = zb - 0.34;
  bx(x0, x1, 1.55, 1.95, uz0, zb, M.oak, D);
  bx(x0 + 0.62, x0 + 1.12, 1.57, 1.93, uz0 - 0.001, zb - 0.02, std({ color: 0x8a6a4a, roughness: 0.6 }), D);
  bx(x0 + 0.66, x0 + 1.08, 1.6, 1.86, uz0 + 0.02, zb - 0.04, M.steel, D); // micro-ondas inox
  bx(x0 + 0.68, x0 + 0.95, 1.63, 1.83, uz0 + 0.018, uz0 + 0.02, M.blackGloss, D);
  bx(x0, x1, 1.95, 2.42, uz0, zb, M.white, D);
  for (let i = 1; i < 4; i++) bx(x0 + i * (x1 - x0) / 4 - 0.002, x0 + i * (x1 - x0) / 4 + 0.002, 1.96, 2.41, uz0 - 0.002, uz0, M.whiteMatte, D);
  const led = bx(x0 + 0.02, x1 - 0.02, 1.535, 1.55, uz0 + 0.03, uz0 + 0.06, std({ color: 0xffffff, emissive: 0xfff0d0, emissiveIntensity: 1.2 }), D);
  led.castShadow = false;
  // coifa embutida
  bx(x0 + 0.06, x0 + 0.6, 1.5, 1.55, uz0 - 0.03, zb, M.steel, D);
  solid('decor', x0, zf, x1, zb);
  plant(x1 - 0.18, 0.9, zb - 0.15, 0.18, D, M.potClay);
  // geladeira (planta)
  bx(X(1722), X(1856), 0, 1.78, Z(683), Z(825), M.steel, D);
  bx(X(1722) - 0.01, X(1722), 1.15, 1.16, Z(690), Z(818), M.black, D);
  bx(X(1722) - 0.03, X(1722) - 0.01, 0.6, 1.1, Z(690) + 0.02, Z(690) + 0.04, M.chrome, D);
  bx(X(1722) - 0.03, X(1722) - 0.01, 1.2, 1.6, Z(690) + 0.02, Z(690) + 0.04, M.chrome, D);
  solid('decor', X(1722), Z(683), X(1856), Z(825));
}
/* ---- Banheiro — p. 30 */
{
  const vx0 = X(845) + 0.02, vx1 = X(1004), vz1 = Z(1015), vz0 = vz1 - 0.45;
  bx(vx0, vx1, 0.25, 0.83, vz0, vz1, M.walnut, D);
  bx(vx0 + 0.04, vx1 - 0.04, 0.6, 0.62, vz0 - 0.004, vz0, M.black, D);
  bx(vx0, vx1, 0.83, 0.86, vz0 - 0.01, vz1, M.white, D);
  const bowl = mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.14, 4, 1), M.porcelain, D); bowl.rotation.y = Math.PI / 4; bowl.position.set((vx0 + vx1) / 2 - 0.05, 0.93, vz0 + 0.24); bowl.scale.set(1, 1, 0.75);
  const fa = cyl(0.012, 0.016, 0.3, M.black, D, (vx0 + vx1) / 2 - 0.05, 1.01, vz1 - 0.05); // torneira (planta: "torneira em metal")
  const sp = cyl(0.01, 0.01, 0.13, M.black, D, (vx0 + vx1) / 2 - 0.05, 1.15, vz1 - 0.11); sp.rotation.x = Math.PI / 2;
  // espelho + prateleira de madeira
  const mir = panel('x', vx0 - 0.25, vx1 - 0.02, 1.0, 1.8, vz1, -1, M.mirror, D, 10, 0.006);
  bx(vx0 - 0.3, vx1, 1.9, 1.93, vz1 - 0.2, vz1, M.walnut, D);
  plant(vx0 + 0.1, 1.93, vz1 - 0.1, 0.16, D);
  cyl(0.04, 0.04, 0.1, M.potClay, D, vx1 - 0.2, 1.98, vz1 - 0.1);
  solid('decor', vx0, vz0, vx1, vz1);
  for (const dx of [0.08, 0.16]) cyl(0.025, 0.025, 0.08, std({ color: 0xf3e9da }), D, vx1 - dx, 0.9, vz1 - 0.08);
}
/* ================================================================== BASE (sempre presentes) */
{
  const B = G.base;
  // bacia sanitária com caixa acoplada
  const tx = X(793), tz1 = Z(1004);
  rbox(0.38, 0.4, 0.42, 0.12, M.porcelain, B, tx, 0.2, tz1 - 0.38);
  rbox(0.4, 0.06, 0.48, 0.04, M.porcelain, B, tx, 0.42, tz1 - 0.38);
  rbox(0.36, 0.4, 0.18, 0.05, M.porcelain, B, tx, 0.62, tz1 - 0.1);
  bx(tx - 0.02, tx + 0.02, 0.82, 0.83, tz1 - 0.12, tz1 - 0.08, M.chrome, B);
  solid('base', tx - 0.22, tz1 - 0.65, tx + 0.22, tz1);
  // box de vidro + chuveiro
  const gx = X(690);
  const g1 = mesh(new THREE.PlaneGeometry(Z(958) - Z(793), 1.95), M.glass, B, false, false);
  g1.rotation.y = Math.PI / 2; g1.position.set(gx, 1.0, (Z(793) + Z(958)) / 2); g1.renderOrder = 2;
  bx(gx - 0.01, gx + 0.01, 1.96, 1.98, Z(793), Z(958), M.black, B);
  bx(gx - 0.012, gx + 0.012, 0, 1.98, Z(958) - 0.02, Z(958), M.black, B);
  solid('base', gx - 0.02, Z(793), gx + 0.02, Z(958));
  bx(X(540) + 0.05, X(540) + 0.07, 2.0, 2.02, Z(870) - 0.01, Z(870) + 0.01, M.black, B);
  bx(X(540) + 0.06, X(540) + 0.3, 2.04, 2.06, Z(870) - 0.01, Z(870) + 0.01, M.black, B);
  bx(X(540) + 0.2, X(540) + 0.4, 2.0, 2.03, Z(870) - 0.12, Z(870) + 0.12, M.black, B);
  bx(X(540) + 0.01, X(540) + 0.03, 1.05, 1.15, Z(870) - 0.03, Z(870) + 0.03, M.black, B);
  bx(X(560), X(600), 0.004, 0.006, Z(900), Z(940), M.steel, B);
  // tanque na área de serviço
  const qx0 = X(1030), qx1 = X(1125), qz1 = Z(1015), qz0 = qz1 - 0.48;
  bx(qx0, qx1, 0.55, 0.9, qz0, qz1, M.porcelain, B);
  bx(qx0 + 0.04, qx1 - 0.04, 0.89, 0.902, qz0 + 0.04, qz1 - 0.12, std({ color: 0xd8d8d4, roughness: 0.3 }), B);
  bx(qx0 + 0.18, qx1 - 0.18, 0, 0.55, qz0 + 0.1, qz1 - 0.05, M.porcelain, B);
  cyl(0.012, 0.015, 0.18, M.chrome, B, (qx0 + qx1) / 2, 1.05, qz1 - 0.04);
  solid('base', qx0, qz0, qx1, qz1);
  // bancada da área de serviço
  bx(X(1125), X(1290), 0.87, 0.9, Z(925), Z(1015), M.white, B);
  { // lavadora frontal sob a bancada da área de serviço (decorado)
    const wx = (X(1125) + X(1290)) / 2, wz0 = Z(925) + 0.03;
    rbox(0.6, 0.84, 0.47, 0.02, M.white, G.decor, wx, 0.43, (wz0 + Z(1015)) / 2);
    const door = mesh(new THREE.TorusGeometry(0.17, 0.025, 10, 32), M.chrome, G.decor); door.position.set(wx, 0.4, wz0 - 0.005);
    const gl = mesh(new THREE.CircleGeometry(0.16, 32), std({ color: 0x223038, roughness: 0.1, metalness: 0.3 }), G.decor); gl.position.set(wx, 0.4, wz0 - 0.01); gl.rotation.y = Math.PI;
    bx(wx - 0.27, wx + 0.1, 0.74, 0.8, wz0 - 0.006, wz0, M.whiteMatte, G.decor);
  }
  plant(X(1235), 0.9, Z(975), 0.18, G.decor);
  solid('base', X(1125), Z(925), X(1290), Z(1015));
}
// nicho da varanda: churrasqueira (A) ou nicho em madeira (B/C)
{
  const r = plan.niche, x0 = X(r[0]), x1 = X(r[2]), z0 = Z(r[1]), z1 = Z(r[3]);
  const conc = std({ color: 0xd6d2cb, roughness: 0.8 });
  bx(x0, x1, 0, 0.88, z0, z1, conc, G.grill);                         // base
  bx(x0, x1 + 0.03, 0.88, 0.92, z0 - 0.01, z1 + 0.01, std({ color: 0x1c1c1c, roughness: 0.25 }), G.grill);   // tampo granito preto
  bx(x0, x1, 0.92, 1.62, z0, z0 + 0.06, conc, G.grill); bx(x0, x1, 0.92, 1.62, z1 - 0.06, z1, conc, G.grill);
  bx(x0, x0 + 0.08, 0.92, 1.62, z0, z1, std({ color: 0x2a2826, roughness: 0.95 }), G.grill);     // fundo refratário
  bx(x0 + 0.08, x1, 1.45, 1.62, z0, z1, conc, G.grill);              // coifa
  bx(x0 + 0.08, x1 - 0.02, 0.92, 0.95, z0 + 0.06, z1 - 0.06, std({ color: 0x3a3632, roughness: 1 }), G.grill);
  for (let z = z0 + 0.09; z < z1 - 0.07; z += 0.035) bx(x0 + 0.1, x1 - 0.04, 1.08, 1.088, z, z + 0.006, M.steel, G.grill);  // grelha
  bx(x0, x1, 1.62, H, z0, z1, M.wall, G.grill);
  solid('always', x0, z0, x1, z1);
  bx(x0, x0 + 0.03, 0, H, z0, z1, M.oak, G.nicheWood);
  for (const y of [0.0, 0.45, 0.9, 1.35, 1.8]) bx(x0, x1, y, y + 0.03, z0, z1, M.oak, G.nicheWood);
  plant((x0 + x1) / 2, 0.93, (z0 + z1) / 2, 0.2, G.nicheWood); plant((x0 + x1) / 2, 1.83, (z0 + z1) / 2, 0.18, G.nicheWood, M.potClay);
}
// luminárias de sobrepor (LED quadradas) e pontos de luz para noite
const lampSpots = [[1.33, 1.3], [3.72, 1.5], [6.0, 1.95], [5.05, 3.6], [3.4, 3.4], [1.65, 4.05], [6.2, 0.55]];
const lamps = [];
for (const [x, z] of lampSpots) {
  const p = bx(x - 0.12, x + 0.12, H - 0.025, H, z - 0.12, z + 0.12, M.ledOff, G.ceil, 1, false);
  const l = new THREE.PointLight(0xffd9a8, 0, 7, 2); l.position.set(x, H - 0.12, z); G.lamps.add(l); lamps.push(l);
}

/* ------------------------------------------------------------------ luz natural */
const center = new THREE.Vector3(W_ / 2, 1, D_ / 2);
const sun = new THREE.DirectionalLight(0xfff1de, 3.2);
sun.castShadow = true; sun.shadow.mapSize.set(IS_MOBILE ? 1024 : 2048, IS_MOBILE ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 40 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025; sun.shadow.radius = 4;
sun.target.position.copy(center); scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xe2ebf3, 0xb9a78d, 0.6); scene.add(hemi);
// luz de céu entrando pelas aberturas (preenchimento suave, sem sombra)
// luz difusa do céu entrando por janelas e porta da varanda (área retangular voltada para dentro)
const winLights = [];
function winLight(x0, x1, y0, y1, z, groupVisible) {
  const l = new THREE.RectAreaLight(0xe8f0f8, 1, x1 - x0, y1 - y0);
  l.position.set((x0 + x1) / 2, (y0 + y1) / 2, z); l.lookAt((x0 + x1) / 2, (y0 + y1) / 2, z + 1);
  (groupVisible || scene).add(l); winLights.push(l); return l;
}
winLight(X(635), X(898), 1.0, 2.2, Z(140) + 0.02);
winLight(X(1108), X(1370), 1.0, 2.2, Z(140) + 0.02);
winLight(X(1535), X(1835), 0.05, 2.2, Z(330) + 0.02, G.varAB);
winLight(X(1530), X(1858), 1.0, 2.2, Z(140) + 0.02, G.varC);
winLight(X(1535), X(1858), 0.2, 2.25, Z(122) + 0.02, G.varAB).userData.balcony = true;

const LIGHTS = {
  dia: { sun: [0xfff2e0, 3.1, [-3.2, 7.5, -6.5]], hemi: 0.3, env: 0.36, fill: 3.0, lamps: 0, exp: 0.86, sky: [0x8db7e0, 0xeaf1f5, 0x9aa38c], led: 0.25 },
  tarde: { sun: [0xffa860, 3.0, [-8, 1.6, -5]], hemi: 0.11, env: 0.2, fill: 1.6, lamps: 2.2, exp: 0.9, sky: [0x7d8fb5, 0xf2c79a, 0x7b7a66], led: 1.1 },
  noite: { sun: [0x9bb0d6, 0.0, [-3, 7, -6]], hemi: 0.04, env: 0.06, fill: 0, lamps: 5.5, exp: 1.15, sky: [0x0d1630, 0x2c3554, 0x14161a], led: 2.2 },
};
function setLight(k) {
  const L = LIGHTS[k];
  sun.color.set(L.sun[0]); sun.intensity = L.sun[1]; sun.position.set(center.x + L.sun[2][0], L.sun[2][1], center.z + L.sun[2][2]);
  sun.castShadow = L.sun[1] > 0;
  hemi.intensity = L.hemi; scene.environmentIntensity = L.env; winLights.forEach(l => l.intensity = L.fill * (l.userData.balcony ? 0.6 : 1));
  lamps.forEach(l => l.intensity = L.lamps); renderer.toneMappingExposure = L.exp;
  sky.material.uniforms.top.value.set(L.sky[0]); sky.material.uniforms.hor.value.set(L.sky[1]); sky.material.uniforms.gnd.value.set(L.sky[2]);
  groundMat.color.set(k === 'noite' ? 0x1a1c1f : 0x8d987a);
  M.ledOff.emissiveIntensity = L.led; state.light = k; sync(); dirty = true;
}

/* ------------------------------------------------------------------ estado / variantes */
const state = { variant: 'A', decor: true, light: 'dia', mode: 'fp', room: 'entrada' };
let activeSolids = [];
function applyVariant() {
  const v = state.variant;
  G.varAB.visible = v !== 'C'; G.varC.visible = v === 'C';
  G.grill.visible = v === 'A'; G.nicheWood.visible = v !== 'A' && state.decor;
  G.decor.visible = state.decor;
  activeSolids = [...solids.struct, ...solids.base, ...solids.always, ...(v !== 'C' ? solids.varAB : []), ...(state.decor ? solids.decor : [])];
  if (v === 'C') activeSolids.push([X(1530), Z(122), X(1858), Z(140)]);
  document.querySelector('#rooms [data-room="varanda"]').hidden = v === 'C';
  document.getElementById('decorNote').textContent = state.decor
    ? 'Decoração conforme imagens ilustrativas do book. Mobiliário e decoração não fazem parte do contrato.'
    : 'Sem mobiliário: mantém louças, tanque e bancadas como estimativa. Confirme o que é entregue no memorial descritivo.';
  sync(); updateHotspots(true); dirty = true;
}

/* ------------------------------------------------------------------ câmeras e navegação */
const cam = new THREE.PerspectiveCamera(56, 1, 0.05, 800); cam.rotation.order = 'YXZ';
const ocam = new THREE.PerspectiveCamera(42, 1, 0.1, 800);
const orbit = new OrbitControls(ocam, renderer.domElement);
orbit.target.set(W_ / 2, 0, D_ / 2); ocam.position.set(W_ / 2 + 4.2, 10.5, D_ / 2 + 8.5);
orbit.enableDamping = true; orbit.maxPolarAngle = 1.25; orbit.minDistance = 5; orbit.maxDistance = 22; orbit.enabled = false;
orbit.addEventListener('change', () => dirty = true);
const EYE = 1.55;
let yaw = 0, pitch = 0;
const pos = new THREE.Vector3(X(1760), EYE, Z(1000));

const VIEWS = { // posição e alvo em px da planta; alvo y em metros
  entrada: { p: [1755, 1005], t: [1250, 420], ty: 1.25, label: 'Entrada' },
  sala:    { p: [1525, 915], t: [1690, 170], ty: 1.2, label: 'Sala de estar / jantar' },
  varanda: { p: [1848, 205], t: [1450, 250], ty: 1.1, label: 'Varanda' },
  cozinha: { p: [1625, 600], t: [1400, 1062], ty: 1.05, label: 'Cozinha' },
  aserv:   { p: [1330, 690], t: [1075, 1000], ty: 0.95, label: 'Área de serviço' },
  dorm1:   { p: [985, 715], t: [580, 300], ty: 0.9, label: 'Dormitório 01' },
  dorm2:   { p: [1320, 565], t: [1060, 180], ty: 0.9, label: 'Dormitório 02' },
  banho:   { p: [610, 820], t: [1004, 990], ty: 1.05, label: 'Banheiro' },
};
function viewPose(id) {
  const v = VIEWS[id], p = new THREE.Vector3(X(v.p[0]), EYE, Z(v.p[1]));
  const t = new THREE.Vector3(X(v.t[0]), v.ty, Z(v.t[1]));
  const d = t.clone().sub(p);
  return { p, yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) };
}
let tween = null;
function goTo(id, instant = false) {
  if (id === 'maquete') { setMode('orbit'); return; }
  if (state.mode !== 'fp') setMode('fp', true);
  if (id === 'varanda' && state.variant === 'C') id = 'sala';
  const v = viewPose(id); state.room = id; sync();
  if (instant) { pos.copy(v.p); yaw = v.yaw; pitch = v.pitch; dirty = true; return; }
  let dy = v.yaw - yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  tween = { t: 0, dur: 1.25, p0: pos.clone(), p1: v.p, y0: yaw, y1: yaw + dy, q0: pitch, q1: v.pitch };
}
function setMode(m, silent) {
  state.mode = m; orbit.enabled = m === 'orbit';
  G.ceil.visible = m !== 'orbit';
  const o = m === 'orbit'; sky.visible = ground.visible = !o; G.struct.getObjectByName('tower').visible = !o;
  scene.background = o ? new THREE.Color(0xd3cec5) : null; corridor.visible = !o;
  if (m === 'orbit') { state.room = 'maquete'; ocam.position.set(W_ / 2 + 3.2, 8.2, D_ / 2 + 6.4); orbit.target.set(W_ / 2, 0, D_ / 2); orbit.update(); }
  if (!silent) sync(); updateHotspots(true); dirty = true;
}
function collide(nx, nz) {
  const r = 0.2;
  for (const b of activeSolids) if (nx > b[0] - r && nx < b[2] + r && nz > b[1] - r && nz < b[3] + r) return true;
  return nx < 0.1 || nz < 0.1 || nx > W_ - 0.1 || nz > D_ - 0.1;
}
function moveBy(dx, dz) {
  if (!collide(pos.x + dx, pos.z)) pos.x += dx;
  if (!collide(pos.x, pos.z + dz)) pos.z += dz;
}

/* ---- entrada de usuário */
const keys = {};
addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; keys[e.code] = true; if (e.code.startsWith('Arrow')) e.preventDefault(); });
addEventListener('keyup', e => { keys[e.code] = false; });
let dragging = null;
const el = renderer.domElement;
el.addEventListener('pointerdown', e => { if (state.mode !== 'fp') return; dragging = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: 0 }; el.setPointerCapture(e.pointerId); stage.classList.add('drag'); });
el.addEventListener('pointermove', e => {
  if (!dragging || e.pointerId !== dragging.id) return;
  const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y; dragging.x = e.clientX; dragging.y = e.clientY; dragging.moved += Math.abs(dx) + Math.abs(dy);
  const k = e.pointerType === 'touch' ? 0.006 : 0.0042;
  yaw += dx * k; pitch = THREE.MathUtils.clamp(pitch + dy * k, -1.2, 1.2); tween = null; dirty = true;
});
const endDrag = () => { dragging = null; stage.classList.remove('drag'); };
el.addEventListener('pointerup', endDrag); el.addEventListener('pointercancel', endDrag);
el.addEventListener('wheel', e => { if (state.mode !== 'fp') return; e.preventDefault(); cam.fov = THREE.MathUtils.clamp(cam.fov + e.deltaY * 0.03, 40, 78); cam.updateProjectionMatrix(); dirty = true; }, { passive: false });
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const floorMesh = G.struct.getObjectByName('floor');
el.addEventListener('dblclick', e => {
  if (state.mode !== 'fp') return;
  const r = el.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, cam);
  const hits = ray.intersectObjects([...G.struct.children, ...G.decor.children, ...G.base.children, ...G.varAB.children], true);
  if (hits.length && hits[0].object === floorMesh) {
    const p = hits[0].point;
    if (!collide(p.x, p.z)) tween = { t: 0, dur: Math.min(1.6, 0.4 + p.distanceTo(pos) * 0.35), p0: pos.clone(), p1: new THREE.Vector3(p.x, EYE, p.z), y0: yaw, y1: yaw, q0: pitch, q1: pitch };
  }
});
// joystick (touch)
const joy = document.getElementById('joy'), knob = joy.querySelector('i'); let jv = null;
joy.addEventListener('pointerdown', e => { joy.setPointerCapture(e.pointerId); jv = { x: 0, y: 0 }; joyMove(e); });
joy.addEventListener('pointermove', e => { if (jv) joyMove(e); });
const joyEnd = () => { jv = null; knob.style.transform = ''; };
joy.addEventListener('pointerup', joyEnd); joy.addEventListener('pointercancel', joyEnd);
function joyMove(e) {
  const r = joy.getBoundingClientRect(); let x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
  const m = Math.hypot(x, y), lim = r.width / 2 - 20; if (m > lim) { x *= lim / m; y *= lim / m; }
  knob.style.transform = `translate(${x}px,${y}px)`; jv = { x: x / lim, y: y / lim };
  if (state.mode !== 'fp') setMode('fp');
}

/* ------------------------------------------------------------------ hotspots */
const HOTS = [
  { room: 'social', p: [X(1640), H - 0.03, Z(820)], t: 'Teto texturizado', d: 'Acabamento do teto indicado na legenda da planta.', s: 'Book, plantas p. 30–32 · informação documentada' },
  { room: 'social', p: [X(1200), 1.45, Z(605) + 0.02], t: 'Parede com acabamento liso', d: 'Acabamento de parede indicado na legenda da planta.', s: 'Book, plantas p. 30–32 · informação documentada' },
  { room: 'banho', p: [X(925), 1.12, Z(990)], t: 'Torneira em metal', d: 'Indicada na legenda da planta, no lavatório do banheiro.', s: 'Book, plantas p. 30–32 · informação documentada' },
  { room: 'varanda', v: 'A', p: [X(1479), 1.25, Z(265)], t: 'Churrasqueira na varanda', d: 'Item da tipologia "2 dorms. com varanda, churrasqueira e vaga de carro" (56 unidades).', s: 'Book, ficha técnica p. 33 e planta p. 30' },
  { room: 'varanda', v: 'AB', p: [X(1700), 1.3, Z(140) + 0.25], t: 'Varanda', d: '392 das 414 unidades têm varanda (somatório das tipologias da ficha técnica). Guarda-corpo conforme imagem ilustrativa p. 24–25.', s: 'Book, ficha técnica p. 33' },
  { room: 'social', v: 'C', p: [X(1700), 1.6, Z(140) + 0.3], t: 'Tipologia sem varanda', d: 'Na planta "2 dorms." (22 unidades) a área da varanda é incorporada à sala, com janela.', s: 'Book, planta p. 32 e ficha técnica p. 33' },
  { room: 'social', p: [X(1450), 1.2, Z(1000)], t: 'Cozinha integrada', d: 'Cozinha aberta para a sala de estar/jantar e conectada à área de serviço, conforme a planta.', s: 'Book, plantas p. 30–32' },
  { room: 'social', p: [X(1078), 1.15, Z(975)], t: 'Área de serviço', d: 'Tanque e bancada junto à cozinha, conforme a planta.', s: 'Book, plantas p. 30–32' },
  { room: 'social', p: [X(1755), 1.75, Z(1055)], t: 'Área privativa 34,6 m²', d: '2 dormitórios. Edifício de 15 pavimentos, 2 blocos, 414 unidades.', s: 'Book, ficha técnica p. 33' },
];
const ROOMLBL = [
  { id: 'dorm1', p: [X(770), 0.2, Z(440)], t: 'Dormitório 01' }, { id: 'dorm2', p: [X(1230), 0.2, Z(400)], t: 'Dormitório 02' },
  { id: 'banho', p: [X(800), 0.2, Z(890)], t: 'Banheiro' }, { id: 'sala', p: [X(1640), 0.2, Z(560)], t: 'Sala estar/jantar' },
  { id: 'cozinha', p: [X(1450), 0.2, Z(900)], t: 'Cozinha' }, { id: 'aserv', p: [X(1160), 0.2, Z(870)], t: 'A. serviço' },
  { id: 'varanda', v: 'AB', p: [X(1690), 0.2, Z(225)], t: 'Varanda' },
];
const hsLayer = document.getElementById('hs');
const hotEls = [];
function mkHot(h, isRoom) {
  const d = document.createElement('div'); d.className = 'hot' + (isRoom ? ' room' : '');
  d.innerHTML = `<i></i><b>${h.t}</b>`; hsLayer.appendChild(d);
  d.addEventListener('click', ev => { ev.stopPropagation(); if (isRoom) goTo(h.id); else showCard(h); });
  hotEls.push({ h, d, isRoom, v3: new THREE.Vector3(...h.p), vis: true });
}
HOTS.forEach(h => mkHot(h, false)); ROOMLBL.forEach(h => mkHot(h, true));
const card = document.getElementById('card');
function showCard(h) { card.querySelector('h4').textContent = h.t; card.querySelector('p').textContent = h.d; card.querySelector('small').textContent = 'Fonte: ' + h.s; card.style.display = 'block'; }
card.querySelector('.x').onclick = () => card.style.display = 'none';
let hsTick = 0;
const occluders = () => [...G.struct.children, ...(G.ceil.visible ? [ceiling] : [])];
function updateHotspots(force) {
  const c = state.mode === 'orbit' ? ocam : cam;
  const r = el.getBoundingClientRect(), checkOcc = force || (hsTick++ % 8 === 0);
  for (const o of hotEls) {
    const ok = o.isRoom ? state.mode === 'orbit' : state.mode === 'fp';
    const vOK = !o.h.v || o.h.v.includes(state.variant);
    let show = ok && vOK;
    const v = o.v3.clone().project(c);
    if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) show = false;
    if (show && !o.isRoom && checkOcc) {
      const cp = c.position, dir = o.v3.clone().sub(cp), dist = dir.length();
      ray.set(cp, dir.normalize()); ray.far = dist - 0.08;
      o.occ = ray.intersectObjects(occluders(), false).length > 0; ray.far = Infinity;
    }
    if (show && !o.isRoom && o.occ) show = false;
    if (!o.isRoom && show && o.v3.distanceTo(c.position) > 4.2) show = false;
    o.d.style.display = show ? 'flex' : 'none';
    if (show) { o.d.style.left = ((v.x + 1) / 2 * r.width) + 'px'; o.d.style.top = ((1 - v.y) / 2 * r.height) + 'px'; }
  }
}

/* ------------------------------------------------------------------ UI */
function segs(id, key, fn) {
  const box = document.getElementById(id);
  box.querySelectorAll('button').forEach(b => b.onclick = () => fn(b.dataset.v));
  return () => box.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(state[key]) === b.dataset.v || (key === 'decor' && b.dataset.v === (state.decor ? '1' : '0'))));
}
const syncs = [
  segs('segVar', 'variant', v => { state.variant = v; applyVariant(); if (state.room === 'varanda' && v === 'C') goTo('sala'); }),
  segs('segDecor', 'decor', v => { state.decor = v === '1'; applyVariant(); }),
  segs('segLight', 'light', v => setLight(v)),
  segs('segMode', 'mode', v => v === 'fp' ? goTo(state.room === 'maquete' ? 'sala' : state.room) : setMode('orbit')),
];
function sync() {
  syncs.forEach(f => f());
  document.querySelectorAll('#rooms button').forEach(b => b.classList.toggle('on', b.dataset.room === state.room));
}
document.querySelectorAll('#rooms button').forEach(b => b.onclick = () => goTo(b.dataset.room));
document.getElementById('btnFs').onclick = async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { showCard({ t: 'Tela cheia', d: 'O navegador bloqueou a tela cheia neste contexto. Abra o link do tour diretamente para usar esta opção.', s: 'navegador' }); }
};
document.getElementById('btnHelp').onclick = () => showCard({ t: 'Como navegar', d: IS_MOBILE ? 'Arraste com um dedo para olhar ao redor e use o joystick para andar. Toque nos nomes dos ambientes para ir até eles.' : 'Arraste para olhar · W A S D ou setas para andar · Shift para andar mais rápido · duplo clique no piso para ir até o ponto · roda do mouse ajusta o zoom.', s: 'Tour 3D' });
document.getElementById('mobtoggle').onclick = () => document.getElementById('ctl').classList.toggle('open');
// área estimada nos botões
const areas = window.__areas || {};
document.querySelectorAll('#rooms button span').forEach(s => { const k = s.parentElement.dataset.room; if (areas[k]) s.textContent = areas[k]; });

/* ------------------------------------------------------------------ loop */
let dirty = true, last = performance.now();
const USE_AO = !IS_MOBILE;
let composer = null, gtao = null;
if (USE_AO) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, cam));
  gtao = new GTAOPass(scene, cam, 16, 16);
  gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 16 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  gtao.blendIntensity = 0.85;
  composer.addPass(gtao); composer.addPass(new OutputPass());
}
function draw() {
  const c = state.mode === 'orbit' ? ocam : cam;
  if (composer) { composer.passes[0].camera = c; gtao.camera = c; gtao.gtaoMaterial.uniforms && 0; composer.render(); }
  else renderer.render(scene, c);
}
function resize() {
  const w = stage.clientWidth || innerWidth, h = stage.clientHeight || innerHeight - 58;
  renderer.setSize(w, h, false); if (composer) composer.setSize(w, h); cam.aspect = ocam.aspect = w / h;
  cam.fov = w / h < 0.9 ? 72 : cam.fov; cam.updateProjectionMatrix(); ocam.updateProjectionMatrix(); dirty = true;
}
addEventListener('resize', resize); new ResizeObserver(resize).observe(stage);
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function frame_(now) {
  requestAnimationFrame(frame_);
  if (!document.getElementById('v-tour').classList.contains('on')) return;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state.mode === 'fp') {
    if (tween) {
      tween.t += dt / tween.dur; const k = ease(Math.min(1, tween.t));
      pos.lerpVectors(tween.p0, tween.p1, k); yaw = tween.y0 + (tween.y1 - tween.y0) * k; pitch = tween.q0 + (tween.q1 - tween.q0) * k;
      if (tween.t >= 1) tween = null; dirty = true;
    }
    let f = 0, s = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1; if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD) s += 1; if (keys.KeyA) s -= 1;
    if (keys.ArrowLeft) { yaw += 1.8 * dt; dirty = true; } if (keys.ArrowRight) { yaw -= 1.8 * dt; dirty = true; }
    if (jv) { f -= jv.y; s += jv.x; }
    if (f || s) {
      tween = null; const sp = (keys.ShiftLeft || keys.ShiftRight ? 2.4 : 1.3) * dt;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      moveBy((fx * f + rx * s) * sp, (fz * f + rz * s) * sp); dirty = true;
    }
    cam.position.copy(pos); cam.rotation.set(pitch, yaw, 0);
  } else orbit.update();
  if (dirty || state.mode === 'orbit') {
    draw(); updateHotspots(false); dirty = false;
  }
}
/* ------------------------------------------------------------------ rotas */
function route() {
  const v = (location.hash || '#tour').slice(1);
  const id = ['tour', 'planta', 'galeria'].includes(v) ? v : 'tour';
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + id));
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.v === id));
  if (id === 'tour') { resize(); dirty = true; }
}
addEventListener('hashchange', route);

/* ------------------------------------------------------------------ início */
applyVariant(); setLight('dia'); route(); goTo('entrada', true); resize();
{ // reflexo do espelho do banheiro: captura cúbica estática feita do próprio ambiente
  const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
  const cc = new THREE.CubeCamera(0.05, 20, rt); cc.position.set(X(800), 1.45, Z(880)); scene.add(cc);
  cc.update(renderer, scene); M.mirror.envMap = rt.texture; M.mirror.needsUpdate = true;
}
requestAnimationFrame(frame_);
renderer.compile(scene, cam);
setTimeout(() => { const l = document.getElementById('loading'); l.style.opacity = 0; setTimeout(() => l.remove(), 700); }, 250);

// API para captura automática das imagens do controle de qualidade
window.__app = {
  go: (id) => goTo(id, true),
  set: (o) => { if (o.variant) state.variant = o.variant; if ('decor' in o) state.decor = o.decor; applyVariant(); if (o.light) setLight(o.light); if (o.mode) setMode(o.mode); },
  pose: (p, y, pt) => { pos.set(p[0], EYE, p[1]); yaw = y; pitch = pt; dirty = true; },
  render: () => { cam.position.copy(pos); cam.rotation.set(pitch, yaw, 0); orbit.update(); draw(); },
  ready: true,
};
