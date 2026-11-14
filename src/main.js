import './style.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { createDamaruTextures } from './textures.js';
import { buildDamaruAssembly } from './geometry.js';
import { DamaruPhysics } from './physics.js';
import { DamaruAudioEngine } from './audio.js';
import { registerDamaruAgentAPI } from './agent.js';

const canvas = document.getElementById('damaru-canvas');
const autoplayTrigger = document.getElementById('autoplay-trigger');
const infoTrigger = document.getElementById('info-trigger');
const infoDialog = document.getElementById('info-dialog');
const infoClose = document.getElementById('info-close');
const btnDemoRoll = document.getElementById('btn-demo-roll');
const btnMotion = document.getElementById('btn-enable-motion');

function syncAutoPlayUI(active) {
  if (autoplayTrigger) {
    autoplayTrigger.setAttribute('aria-pressed', active ? 'true' : 'false');
    autoplayTrigger.title = active ? 'Stop Auto Play (A)' : 'Auto Play (A)';
  }
  if (btnDemoRoll) {
    btnDemoRoll.textContent = active ? 'Stop Auto Play' : 'Start Auto Play';
  }
}

function toggleAutoPlay(forceState) {
  const next = typeof forceState === 'boolean' ? forceState : !physics.autoPlay.active;
  if (next) audio.ensureContext();
  const active = physics.setAutoPlay(next);
  if (!active) audio.setTension(0);
  syncAutoPlayUI(active);
  return active;
}

// --- 1. Audio & Physics Initialization ---
const audio = new DamaruAudioEngine();
const physics = new DamaruPhysics({
  onStrike({ surface, velocity, radialNorm, striker }) {
    audio.triggerStrike(surface, velocity, radialNorm, striker);
    if (
      striker === 'bead' &&
      velocity > 0.35 &&
      typeof navigator !== 'undefined' &&
      typeof navigator.vibrate === 'function'
    ) {
      try {
        navigator.vibrate(Math.round(4 + velocity * 10));
      } catch {}
    }
  }
});

// --- 2. Three.js PBR Studio Scene + Postprocessing ---
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  alpha: false
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();

// Studio radial backdrop rendered inside WebGL so canvas captures/screenshots match identically
const bgCanvas = document.createElement('canvas');
bgCanvas.width = 512;
bgCanvas.height = 512;
const bgCtx = bgCanvas.getContext('2d');
const bgGrad = bgCtx.createRadialGradient(256, 225, 18, 256, 256, 360);
bgGrad.addColorStop(0, '#1c1713');
bgGrad.addColorStop(0.75, '#0b0a09');
bgGrad.addColorStop(1, '#0b0a09');
bgCtx.fillStyle = bgGrad;
bgCtx.fillRect(0, 0, 512, 512);
const bgTex = new THREE.CanvasTexture(bgCanvas);
bgTex.colorSpace = THREE.SRGBColorSpace;
scene.background = bgTex;

const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.045).texture;
scene.environment = envTex;
scene.environmentIntensity = 0.68;

const camera = new THREE.PerspectiveCamera(
  36,
  window.innerWidth / window.innerHeight,
  0.1,
  50
);

function updateCameraFraming() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const aspect = w / Math.max(1, h);
  camera.aspect = aspect;
  // Optical vertical centering + generous horizontal margin on narrow mobile portrait screens
  const baseDist = aspect < 1 ? 5.25 / Math.max(0.42, Math.pow(aspect, 0.72)) : 5.15;
  camera.position.set(0, -0.26, Math.min(11.2, baseDist));
  camera.lookAt(0, -0.30, 0);
  camera.updateProjectionMatrix();
}
updateCameraFraming();

// Sculptural 3-point warm museum lighting
const keyLight = new THREE.DirectionalLight('#fff1dc', 2.45);
keyLight.position.set(3.4, 4.2, 4.6);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight('#ffd6a6', 1.35);
rimLight.position.set(-4.2, 2.2, -3.5);
scene.add(rimLight);

const underFill = new THREE.DirectionalLight('#c99d72', 0.55);
underFill.position.set(0, -3.5, 2.0);
scene.add(underFill);

// Soft radial grounded shadow beneath the floating Damaru + cords
const shadowCanvas = document.createElement('canvas');
shadowCanvas.width = 256;
shadowCanvas.height = 256;
const shCtx = shadowCanvas.getContext('2d');
const grad = shCtx.createRadialGradient(128, 128, 8, 128, 128, 124);
grad.addColorStop(0, 'rgba(0, 0, 0, 0.62)');
grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.22)');
grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
shCtx.fillStyle = grad;
shCtx.fillRect(0, 0, 256, 256);

const shadowPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(3.8, 2.1),
  new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(shadowCanvas),
    transparent: true,
    depthWrite: false,
    opacity: 0.72
  })
);
shadowPlane.rotation.x = -Math.PI / 2;
shadowPlane.position.set(0, -1.72, 0);
scene.add(shadowPlane);

// Build procedural PBR textures & anatomically accurate 3D Damaru
const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
const textures = createDamaruTextures(maxAniso);
const damaru = buildDamaruAssembly(textures);
scene.add(damaru.root);

// Subtle specular bloom post-processing for brass glints & lacquered rosewood sheen
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.16,
  0.45,
  0.88
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// --- 3. Interactive Controls: Click/Tap, Drag/Shake, Two-Finger Squeeze, Gyro & Keyboard ---
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
const activePointers = new Map();

let primaryPointerId = null;
let lastMoveX = 0;
let lastMoveY = 0;
let lastMoveTime = 0;
let downX = 0;
let downY = 0;
let downTime = 0;
let totalTravelPx = 0;
let initialPinchDist = null;

function setWaistTension(t) {
  const clamped = Math.max(0, Math.min(1, t));
  physics.tension = clamped;
  audio.setTension(clamped);
}

function tryRaycastTap(clientX, clientY, downDurationMs) {
  const rect = canvas.getBoundingClientRect();
  pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNDC, camera);

  const hits = raycaster.intersectObjects(damaru.bodyGroup.children, true);
  if (!hits.length) {
    // Quick tap in open air gives a gentle wrist flick so any tap feels alive
    const sideDir = pointerNDC.x >= 0 ? 1 : -1;
    physics.applyFlick(sideDir, 0.58);
    return;
  }

  const hit = hits[0];
  const name = hit.object.name || 'shell';
  const tapVel = Math.max(0.38, Math.min(0.95, 1.0 - Math.min(220, downDurationMs) / 360));

  if (name === 'head_left' || name === 'head_right') {
    const localPt = damaru.bodyGroup.worldToLocal(hit.point.clone());
    physics.triggerDirectTap(
      name === 'head_left' ? 'left' : 'right',
      localPt.y,
      localPt.z,
      tapVel
    );
  } else if (name === 'rim_left' || name === 'rim_right') {
    const localPt = damaru.bodyGroup.worldToLocal(hit.point.clone());
    physics.triggerDirectTap(
      name === 'rim_left' ? 'left' : 'right',
      localPt.y * 0.96,
      localPt.z * 0.96,
      tapVel * 0.85
    );
  } else {
    physics.triggerDirectTap('shell', 0, 0, tapVel * 0.78);
  }
}

canvas.addEventListener('pointerdown', e => {
  if (infoDialog.open) return;
  audio.ensureContext();
  maybeEnableMotionImplicitly();
  if (physics.autoPlay.active) {
    toggleAutoPlay(false);
  }

  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {}
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activePointers.size === 1) {
    primaryPointerId = e.pointerId;
    physics.isDragging = true;
    canvas.classList.add('is-dragging');
    downX = lastMoveX = e.clientX;
    downY = lastMoveY = e.clientY;
    downTime = lastMoveTime = performance.now();
    totalTravelPx = 0;
  } else if (activePointers.size === 2) {
    // Two-finger touch squeezes the waist cords (or pinch distance modulates pitch bend!)
    const pts = [...activePointers.values()];
    initialPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 80;
    setWaistTension(0.55);
  }
});

window.addEventListener('pointermove', e => {
  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activePointers.size === 2 && initialPinchDist) {
    const pts = [...activePointers.values()];
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    // Squeezing fingers closer increases tension; spreading releases
    const squeeze = 0.55 + (initialPinchDist - dist) / 160;
    setWaistTension(squeeze);
  }

  if (e.pointerId !== primaryPointerId) return;

  const now = performance.now();
  const dx = e.clientX - lastMoveX;
  const dy = e.clientY - lastMoveY;
  const dt = (now - lastMoveTime) / 1000;

  totalTravelPx += Math.hypot(dx, dy);
  const minViewport = Math.max(280, Math.min(window.innerWidth, window.innerHeight));
  physics.applyPointerMove(dx / minViewport, dy / minViewport, dt);

  lastMoveX = e.clientX;
  lastMoveY = e.clientY;
  lastMoveTime = now;
});

function handlePointerEnd(e) {
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) {
    initialPinchDist = null;
    if (!spaceHeld) setWaistTension(0);
  }

  if (e.pointerId === primaryPointerId) {
    const elapsed = performance.now() - downTime;
    if (totalTravelPx < 10 && elapsed < 340) {
      tryRaycastTap(downX, downY, elapsed);
    }
    primaryPointerId = activePointers.size ? activePointers.keys().next().value : null;
    if (!primaryPointerId) {
      physics.isDragging = false;
      canvas.classList.remove('is-dragging');
    } else {
      const remaining = activePointers.get(primaryPointerId);
      lastMoveX = remaining.x;
      lastMoveY = remaining.y;
      lastMoveTime = performance.now();
    }
  }
}

window.addEventListener('pointerup', handlePointerEnd);
window.addEventListener('pointercancel', handlePointerEnd);

// Trackpad two-finger horizontal/vertical scroll wheel also twists the Damaru smoothly
canvas.addEventListener(
  'wheel',
  e => {
    e.preventDefault();
    audio.ensureContext();
    const minViewport = Math.max(280, Math.min(window.innerWidth, window.innerHeight));
    physics.applyPointerMove(-e.deltaX / minViewport, -e.deltaY / minViewport, 0.016);
  },
  { passive: false }
);

// --- 4. Physical Mobile Shake (DeviceMotionEvent) ---
let motionAttached = false;

function attachDeviceMotionListener() {
  if (motionAttached || typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return;
  window.addEventListener('devicemotion', event => {
    const acc = event.acceleration || event.accelerationIncludingGravity;
    const rot = event.rotationRate;
    if (!acc && !rot) return;
    audio.ensureContext();
    physics.applyDeviceMotion({
      ax: acc?.x || 0,
      ay: acc?.y || 0,
      az: acc?.z || 0,
      rotAlpha: rot?.alpha || 0,
      rotBeta: rot?.beta || 0,
      rotGamma: rot?.gamma || 0
    });
  });
  motionAttached = true;
  if (btnMotion) {
    btnMotion.textContent = 'Motion Active';
    btnMotion.disabled = true;
  }
}

function maybeEnableMotionImplicitly() {
  if (motionAttached || typeof DeviceMotionEvent === 'undefined') return;
  if (typeof DeviceMotionEvent.requestPermission !== 'function') {
    // Android / Desktop browsers that don't require explicit permission prompt
    attachDeviceMotionListener();
  }
}

if (btnMotion) {
  if (typeof DeviceMotionEvent === 'undefined') {
    btnMotion.hidden = true;
  } else {
    btnMotion.addEventListener('click', async () => {
      audio.ensureContext();
      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
          const state = await DeviceMotionEvent.requestPermission();
          if (state === 'granted') attachDeviceMotionListener();
        } catch {}
      } else {
        attachDeviceMotionListener();
      }
    });
  }
}

// --- 5. Keyboard Accessibility ---
let spaceHeld = false;
window.addEventListener('keydown', e => {
  if (e.key === '?' || (e.key.toLowerCase() === 'i' && !e.metaKey && !e.ctrlKey)) {
    if (infoDialog.open) infoDialog.close();
    else infoDialog.showModal();
    return;
  }
  if (infoDialog.open) return;

  if (e.code === 'Space') {
    e.preventDefault();
    if (!spaceHeld) {
      spaceHeld = true;
      audio.ensureContext();
      setWaistTension(0.85);
    }
  } else if (e.key === 'f' || e.key === 'F') {
    audio.ensureContext();
    physics.triggerDirectTap('left', 0.08, 0.22, 0.82);
  } else if (e.key === 'j' || e.key === 'J') {
    audio.ensureContext();
    physics.triggerDirectTap('right', -0.06, 0.24, 0.85);
  } else if (e.key === 'ArrowLeft') {
    audio.ensureContext();
    physics.applyFlick(-1, 0.88);
  } else if (e.key === 'ArrowRight') {
    audio.ensureContext();
    physics.applyFlick(1, 0.88);
  } else if (e.key === 'r' || e.key === 'R') {
    audio.ensureContext();
    physics.triggerAutoShake({ frequencyHz: 8.0, intensity: 0.84, durationMs: 1300 });
  } else if (e.key === 'a' || e.key === 'A') {
    toggleAutoPlay();
  }
});

window.addEventListener('keyup', e => {
  if (e.code === 'Space') {
    spaceHeld = false;
    setWaistTension(0);
  }
});

// --- 6. Discreet Info Modal Wiring ---
infoTrigger.addEventListener('click', () => {
  infoDialog.showModal();
});

infoClose.addEventListener('click', () => {
  infoDialog.close();
});

infoDialog.addEventListener('click', e => {
  const rect = infoDialog.getBoundingClientRect();
  const inside =
    e.clientX >= rect.left &&
    e.clientX <= rect.right &&
    e.clientY >= rect.top &&
    e.clientY <= rect.bottom;
  if (!inside) infoDialog.close();
});

if (autoplayTrigger) {
  autoplayTrigger.addEventListener('click', () => {
    toggleAutoPlay();
  });
}

btnDemoRoll.addEventListener('click', () => {
  infoDialog.close();
  toggleAutoPlay();
});

// --- 7. Resize & Main Render Loop ---
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.resolution.set(w, h);
  updateCameraFraming();
});

let prevFrameTime = performance.now();
let firstFrameRendered = false;
function animate(now) {
  requestAnimationFrame(animate);
  const dt = (now - prevFrameTime) / 1000;
  prevFrameTime = now;

  physics.step(dt);
  if (physics.autoPlay.active) {
    audio.setTension(physics.tension);
  }
  damaru.syncWithPhysics(physics);

  // Subtle shadow response to Damaru recoil
  shadowPlane.position.x = physics.posOffset.x * 0.7;
  shadowPlane.material.opacity = 0.68 - Math.min(0.18, Math.abs(physics.posOffset.y) * 0.5);

  composer.render();
  if (!firstFrameRendered) {
    firstFrameRendered = true;
    canvas.classList.add('is-ready');
  }
}
requestAnimationFrame(animate);

// --- 8. Register Level 5 Agent-Ready Runtime (WebMCP + window.damaruAgent) ---
registerDamaruAgentAPI({ physics, audio, onAutoPlayChange: syncAutoPlayUI });
