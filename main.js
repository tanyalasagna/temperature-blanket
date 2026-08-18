import * as THREE from 'three';
import {
  tempToHex, toISODate, shiftDays, THIS_YEAR,
  makeIdleColors, geocode, fetchArchive, parseDailyData, makeSampleData,
} from './data.js';

// ── Geocoding / autocomplete state ─────────────────────────────────────────
let pickedLocation = null;
let debounceTimer  = null;
let activeOptIdx   = -1;

function getOpts() {
  return Array.from(document.querySelectorAll('.place-opt'));
}

function closeDropdown() {
  const dd = document.getElementById('place-dropdown');
  activeOptIdx = -1;
  dd.style.display = 'none';
}

function pickOption(result, label) {
  pickedLocation = { latitude: result.latitude, longitude: result.longitude, label };
  document.getElementById('place-input').value = label;
  closeDropdown();
}

function populateDropdown(results) {
  const dd = document.getElementById('place-dropdown');
  activeOptIdx = -1;
  dd.innerHTML = '';
  if (!results.length) { closeDropdown(); return; }
  results.forEach(r => {
    const label = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
    const div   = document.createElement('div');
    div.className = 'place-opt';
    div.setAttribute('role', 'option');
    div.textContent = label;
    div.addEventListener('mousedown', e => { e.preventDefault(); pickOption(r, label); });
    dd.appendChild(div);
  });
  dd.style.display = 'block';
}

async function onPlaceInput() {
  pickedLocation = null;
  const query = document.getElementById('place-input').value.trim();
  clearTimeout(debounceTimer);
  if (query.length < 2) { closeDropdown(); return; }
  debounceTimer = setTimeout(async () => {
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search` +
                  `?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
      const json = await (await fetch(url)).json();
      populateDropdown(json.results || []);
    } catch { closeDropdown(); }
  }, 280);
}

function onPlaceKeydown(e) {
  const dd = document.getElementById('place-dropdown');
  if (dd.style.display !== 'block') return;
  const opts = getOpts();
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeOptIdx = Math.min(activeOptIdx + 1, opts.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeOptIdx = Math.max(activeOptIdx - 1, -1);
  } else if (e.key === 'Enter' && activeOptIdx >= 0) {
    e.preventDefault();
    opts[activeOptIdx].dispatchEvent(new MouseEvent('mousedown'));
    return;
  } else if (e.key === 'Escape') {
    closeDropdown(); return;
  }
  opts.forEach((o, i) =>
    o.setAttribute('aria-selected', i === activeOptIdx ? 'true' : 'false'));
}

// ── UI helpers ──────────────────────────────────────────────────────────────
function setStatus(msg, isError = false) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className   = isError ? 'error' : '';
}

function buildYearSelect() {
  const sel = document.getElementById('year-select');
  for (let y = THIS_YEAR; y >= 2000; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === THIS_YEAR - 1) opt.selected = true;
    sel.appendChild(opt);
  }
  refreshYearNotice();
}

function refreshYearNotice() {
  const year   = parseInt(document.getElementById('year-select').value, 10);
  const notice = document.getElementById('year-notice');
  if (year === THIS_YEAR) {
    const safeEnd  = shiftDays(new Date(), -5);
    const dayCount = Math.round((safeEnd - new Date(THIS_YEAR, 0, 1)) / 86400000) + 1;
    notice.textContent =
      `${THIS_YEAR} isn't over yet — showing ${dayCount} completed days.`;
  } else {
    notice.textContent = '';
  }
}

// ── Three.js scene ──────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled     = true;
renderer.shadowMap.type        = THREE.PCFSoftShadowMap;
renderer.toneMapping           = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure   = 1.1;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x12100e);
scene.fog = new THREE.Fog(0x12100e, 12, 22);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.01, 50);
camera.position.set(0, 0.4, 5.8);
camera.lookAt(0, 0, 0);

// ── Peripheral tilt state ───────────────────────────────────────────────────
const MAX_TILT  = 0.09;
const TILT_DAMP = 0.035;
let   tiltX     = 0.0;
let   tiltY     = 0.0;

// ── Lights ──────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xfff5e8, 1.8));

const key = new THREE.DirectionalLight(0xffe8c8, 1.0);
key.position.set(0, 6, 4);
key.castShadow              = true;
key.shadow.mapSize.width    = 2048;
key.shadow.mapSize.height   = 2048;
key.shadow.camera.left      = -3.5;
key.shadow.camera.right     =  3.5;
key.shadow.camera.top       =  3.5;
key.shadow.camera.bottom    = -3.5;
key.shadow.camera.near      = 0.5;
key.shadow.camera.far       = 25;
key.shadow.bias             = -0.0005;
scene.add(key);

const fillLight = new THREE.DirectionalLight(0xc8d8ff, 0.45);
fillLight.position.set(-3, -2, 2);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xfff5e8, 1.2);
rimLight.position.set(0, -4, -4);
scene.add(rimLight);

// ── Blanket geometry ────────────────────────────────────────────────────────
const W = 2.20, H = 3.4, D = 0.45;
const geo = new THREE.BoxGeometry(W, H, D, 180, 365, 1);
const pos = geo.attributes.position;
const CORNER_RADIUS = 0.08;

const vertType = new Uint8Array(pos.count);

for (let i = 0; i < pos.count; i++) {
  const _vx = pos.getX(i), _vy = pos.getY(i), _vz = pos.getZ(i);
  const isRim = Math.abs(_vx) >= (W * 0.5) - 0.001 || Math.abs(_vy) >= (H * 0.5) - 0.001;
  vertType[i] = isRim ? 2 : (_vz > 0 ? 1 : 0);

  let vx = pos.getX(i);
  let vy = pos.getY(i);

  // 0. Rounded corners
  const cx = Math.abs(vx) - (W * 0.5 - CORNER_RADIUS);
  const cy = Math.abs(vy) - (H * 0.5 - CORNER_RADIUS);
  if (cx > 0 && cy > 0) {
    const cd = Math.sqrt(cx * cx + cy * cy);
    if (cd > CORNER_RADIUS) {
      vx = Math.sign(vx) * ((W * 0.5 - CORNER_RADIUS) + CORNER_RADIUS * cx / cd);
      vy = Math.sign(vy) * ((H * 0.5 - CORNER_RADIUS) + CORNER_RADIUS * cy / cd);
      pos.setX(i, vx);
      pos.setY(i, vy);
    }
  }

  // 1. Micro-tension edge
  const edgeDist = Math.abs(vx / (W * 0.5));
  if (edgeDist > 0.85) {
    const edgeWeight = edgeDist - 0.85;
    const microWarp  = (edgeWeight * edgeWeight) * 0.002 * Math.sin(vy * 0.4);
    pos.setX(i, vx + (vx > 0 ? microWarp : -microWarp));
  }

  // 2. Micro-fuzz
  const fuzz = Math.sin(vx * 140.0) * Math.cos(vy * 140.0) * 0.008;
  pos.setZ(i, pos.getZ(i) + fuzz);

  // 3. Stitch grooves + vertical ribs
  const stitchGroove = Math.cos(vy * 280.0) * 0.012;
  const verticalRibs = Math.sin(vx * 180.0) * 0.005;
  pos.setZ(i, pos.getZ(i) + stitchGroove + verticalRibs);

  // 4. Frayed yarn halo — skip corner zones
  const edgeDistX = Math.abs(vx / (W * 0.5));
  const edgeDistY = Math.abs(vy / (H * 0.5));
  const cx_fray = Math.abs(pos.getX(i)) - (W * 0.5 - CORNER_RADIUS);
  const cy_fray = Math.abs(pos.getY(i)) - (H * 0.5 - CORNER_RADIUS);
  const isCorner = cx_fray > 0 && cy_fray > 0;
  if ((edgeDistX > 0.88 || edgeDistY > 0.88) && !isCorner) {
    const frayNoise = Math.sin(vx * 400.0) * Math.cos(vy * 400.0);
    if (edgeDistX > edgeDistY) {
      pos.setX(i, pos.getX(i) + Math.sign(vx) * Math.abs(frayNoise) * 0.012);
    } else {
      pos.setY(i, pos.getY(i) + Math.sign(vy) * Math.abs(frayNoise) * 0.012);
    }
    pos.setZ(i, pos.getZ(i) + frayNoise * 0.008);
  }
}
geo.computeVertexNormals();
geo.userData.originalPositions = new Float32Array(geo.attributes.position.array);

const numVerts = pos.count;
const posArr   = pos.array;
const baseX    = new Float32Array(numVerts);
const baseY    = new Float32Array(numVerts);
const baseZ    = new Float32Array(numVerts);
const currentZ = new Float32Array(numVerts);
const flipZ    = new Float32Array(numVerts);
const flipX    = new Float32Array(numVerts);
const flipY    = new Float32Array(numVerts);
for (let i = 0; i < numVerts; i++) {
  baseX[i] = posArr[i * 3];
  baseY[i] = posArr[i * 3 + 1];
  baseZ[i] = currentZ[i] = posArr[i * 3 + 2];
  flipZ[i] = flipX[i] = flipY[i] = 0;
}

// ── Vertex colours ──────────────────────────────────────────────────────────
const colorArrCurrent  = new Float32Array(numVerts * 3);
const colorArrNext     = new Float32Array(numVerts * 3);
const colorAttrCurrent = new THREE.BufferAttribute(colorArrCurrent, 3);
const colorAttrNext    = new THREE.BufferAttribute(colorArrNext, 3);
geo.setAttribute('color',      colorAttrCurrent);
geo.setAttribute('aColorNext', colorAttrNext);

function applyVertexColors(hexColors, targetArr = colorArrCurrent, targetAttr = colorAttrCurrent) {
  const n = hexColors.length;
  const parsed = hexColors.map(h => [
    parseInt(h.slice(1, 3), 16) / 255,
    parseInt(h.slice(3, 5), 16) / 255,
    parseInt(h.slice(5, 7), 16) / 255,
  ]);
  for (let i = 0; i < numVerts; i++) {
    const t      = 0.5 - baseY[i] / H;
    const dayIdx = Math.max(0, Math.min(n - 1, Math.round(t * (n - 1))));
    let [r, g, b] = parsed[dayIdx];
    if (vertType[i] === 2) {
      r *= 0.30; g *= 0.30; b *= 0.30;
    } else if (vertType[i] === 0) {
      r *= 0.45; g *= 0.45; b *= 0.45;
    } else {
      const edgeFactor = Math.abs(baseX[i] / (W * 0.5));
      if (edgeFactor > 0.7) {
        const darken = 1.0 - ((edgeFactor - 0.7) / 0.3) * 0.35;
        r *= darken; g *= darken; b *= darken;
      }
    }
    targetArr[i * 3]     = r;
    targetArr[i * 3 + 1] = g;
    targetArr[i * 3 + 2] = b;
  }
  targetAttr.needsUpdate = true;
}

applyVertexColors(makeIdleColors());
colorArrNext.set(colorArrCurrent);
colorAttrNext.needsUpdate = true;

// ── Blanket uniforms & transition ───────────────────────────────────────────
const blanketUniforms = {
  uBloomProgress: { value: 0.0 }
};

function updateBlanketTexture(hexColors) {
  applyVertexColors(hexColors, colorArrNext, colorAttrNext);
  blanketUniforms.uBloomProgress.value = 0;
  gsap.to(blanketUniforms.uBloomProgress, {
    value: 1,
    duration: 3.5,
    ease: 'power1.inOut',
    onComplete() {
      colorArrCurrent.set(colorArrNext);
      colorAttrCurrent.needsUpdate = true;
      blanketUniforms.uBloomProgress.value = 0;
    }
  });
}

// ── Material ────────────────────────────────────────────────────────────────
function createYarnBumpMap() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    for (let x = 0; x < 256; x += 32) {
      const xOffset = (y % 64 === 0) ? 0 : 16;
      const cx = x + xOffset + 16, cy = y + 16;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(1, '#808080');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 140);
  return tex;
}

const mat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness:    0.9,
  metalness:    0.0,
  flatShading:  false,
  bumpMap:      createYarnBumpMap(),
  bumpScale:    0.045,
  side:         THREE.DoubleSide,
});

mat.onBeforeCompile = (shader) => {
  shader.uniforms.uBloomProgress = blanketUniforms.uBloomProgress;

  shader.vertexShader = `
    uniform float uBloomProgress;
    varying float vDisplacedY;
    attribute vec3 aColorNext;
    varying vec3 vColorNext;
  ` + shader.vertexShader;

  shader.vertexShader = shader.vertexShader.replace(
    `#include <begin_vertex>`,
    `#include <begin_vertex>
    vColorNext = aColorNext;

    float normYv    = clamp((position.y + ${(H * 0.5).toFixed(2)}) / ${H.toFixed(2)}, 0.0, 1.0);
    float progressV = 1.2 - (uBloomProgress * 1.4);
    float distV     = normYv - progressV;
    float ripple    = pow(smoothstep(0.08, 0.0, abs(distV)), 1.5);
    transformed.z  += ripple * 0.10;
    transformed.y  -= ripple * sign(distV) * 0.015;
    vDisplacedY = (modelMatrix * vec4(transformed, 1.0)).y;`
  );

  shader.fragmentShader = `
    uniform float uBloomProgress;
    varying float vDisplacedY;
    varying vec3  vColorNext;
  ` + shader.fragmentShader;

  shader.fragmentShader = shader.fragmentShader.replace(
    `#include <color_fragment>`,
    `#ifdef USE_COLOR
      float normY    = clamp((vDisplacedY + ${(H * 0.5).toFixed(2)}) / ${H.toFixed(2)}, 0.0, 1.0);
      float progress = 1.2 - (uBloomProgress * 1.4);
      float wipe     = smoothstep(progress - 0.005, progress + 0.005, normY);
      diffuseColor.rgb *= mix(vColor, vColorNext, wipe);
    #endif`
  );
};

const blanket = new THREE.Mesh(geo, mat);
blanket.castShadow    = true;
blanket.receiveShadow = true;
scene.add(blanket);

// ── Hover ───────────────────────────────────────────────────────────────────
const HOVER_RADIUS   = 0.40;
const HOVER_LIFT     = 0.55;
const HOVER_DAMP     = 0.025;
const HOVER_FRICTION = 0.04;
const FRICTION_GRID  = 0.06;

const raycaster      = new THREE.Raycaster();
const pointer        = new THREE.Vector2(Infinity, Infinity);
let   isHovering     = false;
let   hoverActive    = false;
const targetHoverPt  = new THREE.Vector3();
const currentHoverPt = new THREE.Vector3();

renderer.domElement.addEventListener('pointermove', e => {
  if (isRolling) { isHovering = false; return; }
  pointer.x =  (e.clientX / window.innerWidth)  * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  if (!isHovering) { isHovering = true; hoverActive = true; }
});
renderer.domElement.addEventListener('pointerleave', () => { isHovering = false; });

// ── Roll interaction ────────────────────────────────────────────────────────
geo.computeBoundingBox();

let activeTween = null;
const rollTarget = { progress: 0 };
let isRolling = false;

function applyRollMath() {
  const rawP = rollTarget.progress;
  const p    = Math.max(0, Math.min(1, rawP));
  const ROLL_RADIUS    = 0.18;
  const drapeIntensity = 1 - p;
  const flatLength     = H * (1 - p);

  for (let i = 0; i < numVerts; i++) {
    const vx = baseX[i];
    const vy = baseY[i];
    const nx = vx / (W * 0.5);
    const ny = vy / (H * 0.5);
    const hangFactor  = Math.max(0, (1 - ny) / 2);
    const drapeFolds  = Math.sin(nx * Math.PI * 3.0) * 0.22 * hangFactor;
    const sag         = -0.14 * (1 - ny * ny);
    const edgePinch   = (1 - nx * nx) * 0.06 * Math.sign(vx) * hangFactor;
    const bottomDroop = (1 - nx * nx) * 0.12 * hangFactor;
    const topDroop    = (1 - nx * nx) * 0.04;

    const dX = -edgePinch * drapeIntensity;
    const dY = -(bottomDroop + topDroop) * drapeIntensity;
    const dZ = (sag + drapeFolds) * drapeIntensity;

    const distFromTop = (H * 0.5) - vy;
    if (distFromTop > flatLength) {
      const rolledDist = distFromTop - flatLength;
      const theta = rolledDist / ROLL_RADIUS;
      flipZ[i] = dZ + ROLL_RADIUS * (1 - Math.cos(theta));
      flipY[i] = dY + (distFromTop - flatLength) + ROLL_RADIUS * Math.sin(theta);
      flipX[i] = dX;
    } else {
      flipX[i] = dX; flipY[i] = dY; flipZ[i] = dZ;
    }
  }
}
applyRollMath();

renderer.domElement.addEventListener('pointerdown', e => {
  raycaster.setFromCamera(new THREE.Vector2(
     (e.clientX / window.innerWidth)  * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  ), camera);
  if (!raycaster.intersectObject(blanket).length) return;

  if (activeTween) { activeTween.kill(); }
  rollTarget.progress = 0;
  isRolling = true;

  activeTween = gsap.timeline({
    onUpdate: applyRollMath,
    onComplete() { isRolling = false; activeTween = null; applyRollMath(); }
  });
  activeTween
    .to(rollTarget, { progress: 0.5, duration: 0.6, ease: 'power2.inOut' })
    .to(rollTarget, { progress: 0,   duration: 1.0, ease: 'back.out(1.2)' });
});

// ── Render loop ─────────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  if (isFinite(pointer.x)) {
    tiltX = THREE.MathUtils.lerp(tiltX, pointer.y * 0.35, TILT_DAMP);
    tiltY = THREE.MathUtils.lerp(tiltY, pointer.x * 0.35, TILT_DAMP);
    key.position.x      =  pointer.x * 1.5;
    key.position.y      =  6.0 + pointer.y * 0.8;
    rimLight.position.x = -pointer.x * 1.2;
    rimLight.position.y = -4.0 - pointer.y * 0.5;
  }

  let hitPt = null;
  if (isHovering) {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(blanket);
    if (hits.length) {
      const snappedX = Math.round(hits[0].point.x / FRICTION_GRID) * FRICTION_GRID;
      const snappedY = Math.round(hits[0].point.y / FRICTION_GRID) * FRICTION_GRID;
      targetHoverPt.set(snappedX, snappedY, hits[0].point.z);
      currentHoverPt.lerp(targetHoverPt, HOVER_FRICTION);
      hitPt = currentHoverPt;
    }
  }

  const time = performance.now() * 0.0012;
  let maxDelta = 0;

  for (let i = 0; i < numVerts; i++) {
    let target = baseZ[i];
    let hoverPullY = 0;
    if (hitPt) {
      const dx = baseX[i] - hitPt.x;
      const dy = baseY[i] - hitPt.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const fabricFalloff = Math.max(0, 1 - (dist / HOVER_RADIUS));
      target += HOVER_LIFT * (fabricFalloff * fabricFalloff * (3 - 2 * fabricFalloff));
      hoverPullY = 0.15 * fabricFalloff * Math.max(0, baseY[i] - hitPt.y + 0.5);
    }

    const prev = currentZ[i];
    currentZ[i] = prev + (target - prev) * HOVER_DAMP;

    const hangWeight  = Math.max(0, (H * 0.5 - baseY[i]) / H);
    const breathZ     = Math.sin(time + baseY[i] * 1.5 + baseX[i] * 0.8) * 0.08 * hangWeight;
    const breathX     = Math.cos(time * 0.7 - baseY[i] * 0.6) * 0.03 * hangWeight;
    const fabricBendZ = (tiltX * hangWeight * hangWeight) * (1.0 - Math.abs(baseX[i]) / W);
    const fabricBendX = (tiltY * hangWeight) * (baseY[i] * 0.1);

    posArr[i * 3]     = baseX[i] + flipX[i] + breathX + fabricBendX;
    posArr[i * 3 + 1] = baseY[i] + flipY[i] + hoverPullY;
    posArr[i * 3 + 2] = currentZ[i] + flipZ[i] + breathZ + fabricBendZ;

    const delta = Math.abs(currentZ[i] - baseZ[i]);
    if (delta > maxDelta) maxDelta = delta;
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();

  if (!isHovering && maxDelta < 0.0002 && !activeTween) {
    for (let i = 0; i < numVerts; i++) currentZ[i] = baseZ[i];
    hoverActive = false;
  }

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Generate ─────────────────────────────────────────────────────────────────
async function generate() {
  const placeText = document.getElementById('place-input').value.trim();
  const year      = parseInt(document.getElementById('year-select').value, 10);
  const btn       = document.getElementById('generate-btn');

  if (!placeText) { setStatus('Enter a location first.', true); return; }
  btn.disabled = true;
  setStatus('');

  const startDate = `${year}-01-01`;
  const endDate   = year === THIS_YEAR
    ? toISODate(shiftDays(new Date(), -5))
    : `${year}-12-31`;

  let days;
  try {
    let loc;
    if (pickedLocation) {
      loc = pickedLocation;
    } else {
      setStatus('Looking up location…');
      loc = await geocode(placeText);
    }
    setStatus(`Fetching ${year} temperatures for ${loc.label}…`);
    const daily = await fetchArchive(loc.latitude, loc.longitude, startDate, endDate);
    days = parseDailyData(daily);
    setStatus(`${loc.label} · ${days.length} days · ${startDate} → ${endDate}`);
  } catch (err) {
    console.warn('Falling back to sample data:', err);
    days = makeSampleData(startDate, endDate);
    setStatus(`Couldn't fetch live data — showing sample instead.`, true);
  }

  updateBlanketTexture(days.map(d => tempToHex(d.avg)));
  btn.disabled = false;
}

// ── Wire up ──────────────────────────────────────────────────────────────────
buildYearSelect();
document.getElementById('generate-btn').addEventListener('click', generate);
document.getElementById('year-select').addEventListener('change', refreshYearNotice);

const placeEl = document.getElementById('place-input');
placeEl.addEventListener('input',   onPlaceInput);
placeEl.addEventListener('keydown', onPlaceKeydown);
placeEl.addEventListener('blur',    () => setTimeout(closeDropdown, 160));
