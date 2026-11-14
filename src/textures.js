import * as THREE from 'three';

function hash2(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x, y, octaves = 5) {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * valueNoise(x * freq, y * freq);
    freq *= 2.03;
    amp *= 0.5;
  }
  return v;
}

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

export function createDamaruTextures(maxAnisotropy = 8) {
  const configure = (tex, srgb = false, repeatX = 1, repeatY = 1) => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = maxAnisotropy;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  };

  // 1. Hand-turned Indian Rosewood / Sheesham PBR maps (1024x512)
  const woodW = 1024;
  const woodH = 512;
  const woodColorCanvas = makeCanvas(woodW, woodH);
  const woodBumpCanvas = makeCanvas(woodW, woodH);
  const woodRoughCanvas = makeCanvas(woodW, woodH);
  const wCtx = woodColorCanvas.getContext('2d');
  const wbCtx = woodBumpCanvas.getContext('2d');
  const wrCtx = woodRoughCanvas.getContext('2d');

  const wImg = wCtx.createImageData(woodW, woodH);
  const wbImg = wbCtx.createImageData(woodW, woodH);
  const wrImg = wrCtx.createImageData(woodW, woodH);

  for (let y = 0; y < woodH; y++) {
    const v = y / woodH; // along hourglass axis
    const latheGroove = Math.sin(v * Math.PI * 190) * 0.5 + 0.5;
    const fineTurn = Math.sin(v * Math.PI * 620) * 0.5 + 0.5;
    // Darker, hand-rubbed patina near narrow central waist (v ~ 0.5)
    const waistPatina = Math.exp(-Math.pow((v - 0.5) / 0.19, 2));

    for (let x = 0; x < woodW; x++) {
      // Seamless wrap around circumference u in [0, 1)
      const angle = (x / woodW) * Math.PI * 2;
      const nx = Math.cos(angle) * 2.4 + 4.2;
      const ny = Math.sin(angle) * 2.4 + 4.2;
      const warp = fbm(nx * 2.1, v * 3.4, 5);
      const fineStreaks = fbm(nx * 14.0, v * 6.5, 4);
      const rings = Math.sin((nx * 2.6 + ny * 1.9 + v * 1.8 + warp * 2.8) * Math.PI * 2.0);
      const grain = Math.pow(0.5 + 0.5 * rings, 1.35) * 0.65 + fineStreaks * 0.35;
      const pores = fbm(nx * 24, v * 58, 3);
      const poreStreak = pores > 0.66 ? (pores - 0.66) * 2.3 : 0;

      // Traditional Varanasi lac-turnery decorative ochre/vermilion hairline bands near rims
      const bandDistA = Math.min(Math.abs(v - 0.085), Math.abs(v - 0.915));
      const bandDistB = Math.min(Math.abs(v - 0.102), Math.abs(v - 0.898));
      const ochreStripe = bandDistA < 0.0055 ? 1.0 : 0.0;
      const vermilionStripe = bandDistB < 0.0065 ? 1.0 : 0.0;

      // Rich aged Sheesham rosewood
      let baseR = 54 + grain * 54 - waistPatina * 12 - poreStreak * 28;
      let baseG = 25 + grain * 27 - waistPatina * 7 - poreStreak * 16;
      let baseB = 12 + grain * 12 - waistPatina * 4 - poreStreak * 8;

      if (ochreStripe > 0) {
        baseR = baseR * 0.25 + 198 * 0.75;
        baseG = baseG * 0.25 + 142 * 0.75;
        baseB = baseB * 0.25 + 46 * 0.75;
      } else if (vermilionStripe > 0) {
        baseR = baseR * 0.25 + 154 * 0.75;
        baseG = baseG * 0.25 + 32 * 0.75;
        baseB = baseB * 0.25 + 22 * 0.75;
      }

      const idx = (y * woodW + x) * 4;
      wImg.data[idx] = Math.max(14, Math.min(255, baseR));
      wImg.data[idx + 1] = Math.max(8, Math.min(255, baseG));
      wImg.data[idx + 2] = Math.max(4, Math.min(255, baseB));
      wImg.data[idx + 3] = 255;

      const bumpVal = 128 + (grain - 0.5) * 42 + (latheGroove - 0.5) * 18 + (fineTurn - 0.5) * 9 - poreStreak * 65;
      const bClamped = Math.max(0, Math.min(255, bumpVal));
      wbImg.data[idx] = wbImg.data[idx + 1] = wbImg.data[idx + 2] = bClamped;
      wbImg.data[idx + 3] = 255;

      // Hand-polished lacquer is smoother on dense grain & waist grip, rougher in wood pores
      const roughVal = 92 + (1 - grain) * 34 + poreStreak * 80 - waistPatina * 18;
      const rClamped = Math.max(45, Math.min(225, roughVal));
      wrImg.data[idx] = wrImg.data[idx + 1] = wrImg.data[idx + 2] = rClamped;
      wrImg.data[idx + 3] = 255;
    }
  }
  wCtx.putImageData(wImg, 0, 0);
  wbCtx.putImageData(wbImg, 0, 0);
  wrCtx.putImageData(wrImg, 0, 0);

  // 2. Natural Taut Goatskin Parchment Drumhead Maps (1024x1024 polar)
  const skinSize = 1024;
  const skinColorCanvas = makeCanvas(skinSize, skinSize);
  const skinBumpCanvas = makeCanvas(skinSize, skinSize);
  const skinRoughCanvas = makeCanvas(skinSize, skinSize);
  const sCtx = skinColorCanvas.getContext('2d');
  const sbCtx = skinBumpCanvas.getContext('2d');
  const srCtx = skinRoughCanvas.getContext('2d');

  const sImg = sCtx.createImageData(skinSize, skinSize);
  const sbImg = sbCtx.createImageData(skinSize, skinSize);
  const srImg = srCtx.createImageData(skinSize, skinSize);

  const half = skinSize * 0.5;
  for (let y = 0; y < skinSize; y++) {
    for (let x = 0; x < skinSize; x++) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const r = Math.sqrt(dx * dx + dy * dy);
      const theta = Math.atan2(dy, dx);

      const mottle = fbm(dx * 3.4 + 8.1, dy * 3.4 + 5.7, 5);
      const fineFiber = fbm(dx * 22 + 2.3, dy * 22 + 9.4, 3);
      const radialStretch = fbm(Math.cos(theta) * 9 + 4, Math.sin(theta) * 9 + r * 6, 3);
      const pores = valueNoise(dx * 95, dy * 95);

      // Subtle strike wear zone where the lac beads strike (~r = 0.35..0.62)
      const beadWear = Math.exp(-Math.pow((r - 0.46) / 0.16, 2)) * 0.12;
      // Natural amber rim tension darkening near the rawhide flesh hoop (r > 0.80)
      const rimDark = Math.pow(Math.max(0, (r - 0.72) / 0.28), 1.8) * 0.34;

      const baseTone = 0.86 + (mottle - 0.5) * 0.16 + (fineFiber - 0.5) * 0.06 - beadWear * 0.08 - rimDark;
      const pr = Math.max(80, Math.min(252, 236 * baseTone + radialStretch * 10));
      const pg = Math.max(62, Math.min(238, 211 * baseTone + radialStretch * 6 - rimDark * 18));
      const pb = Math.max(38, Math.min(205, 166 * baseTone - mottle * 12 - rimDark * 28));

      const idx = (y * skinSize + x) * 4;
      sImg.data[idx] = pr;
      sImg.data[idx + 1] = pg;
      sImg.data[idx + 2] = pb;
      sImg.data[idx + 3] = 255;

      const sb = 128 + (fineFiber - 0.5) * 44 + (radialStretch - 0.5) * 26 - (pores > 0.78 ? 28 : 0);
      const sbC = Math.max(0, Math.min(255, sb));
      sbImg.data[idx] = sbImg.data[idx + 1] = sbImg.data[idx + 2] = sbC;
      sbImg.data[idx + 3] = 255;

      const sr = 148 + (fineFiber - 0.5) * 38 - beadWear * 32 + rimDark * 30;
      const srC = Math.max(80, Math.min(235, sr));
      srImg.data[idx] = srImg.data[idx + 1] = srImg.data[idx + 2] = srC;
      srImg.data[idx + 3] = 255;
    }
  }
  sCtx.putImageData(sImg, 0, 0);
  sbCtx.putImageData(sbImg, 0, 0);
  srCtx.putImageData(srImg, 0, 0);

  // 3. 3-Ply Twisted Raw Cotton Rope Texture (256x256 tileable)
  const ropeS = 256;
  const ropeColorCanvas = makeCanvas(ropeS, ropeS);
  const ropeBumpCanvas = makeCanvas(ropeS, ropeS);
  const rcCtx = ropeColorCanvas.getContext('2d');
  const rbCtx = ropeBumpCanvas.getContext('2d');
  const rcImg = rcCtx.createImageData(ropeS, ropeS);
  const rbImg = rbCtx.createImageData(ropeS, ropeS);

  for (let y = 0; y < ropeS; y++) {
    for (let x = 0; x < ropeS; x++) {
      const u = x / ropeS;
      const v = y / ropeS;
      // 3-ply diagonal helical twist
      const plyPhase = (u * 3 + v * 9) * Math.PI * 2;
      const ply = Math.abs(Math.cos(plyPhase * 0.5));
      const microThread = Math.sin((u * 26 - v * 14) * Math.PI * 2) * 0.5 + 0.5;
      const fuzz = valueNoise(x * 0.35, y * 0.35);

      const shade = 0.66 + ply * 0.28 + microThread * 0.06 + (fuzz - 0.5) * 0.08;
      const idx = (y * ropeS + x) * 4;
      rcImg.data[idx] = Math.min(248, 224 * shade);
      rcImg.data[idx + 1] = Math.min(235, 203 * shade);
      rcImg.data[idx + 2] = Math.min(205, 164 * shade);
      rcImg.data[idx + 3] = 255;

      const b = Math.max(0, Math.min(255, 65 + ply * 150 + microThread * 28));
      rbImg.data[idx] = rbImg.data[idx + 1] = rbImg.data[idx + 2] = b;
      rbImg.data[idx + 3] = 255;
    }
  }
  rcCtx.putImageData(rcImg, 0, 0);
  rbCtx.putImageData(rbImg, 0, 0);

  // 4. Crimson & Zari Gold Woven Brocade Waist Cloth (512x256)
  const clothW = 512;
  const clothH = 256;
  const clothCanvas = makeCanvas(clothW, clothH);
  const clothMetalCanvas = makeCanvas(clothW, clothH);
  const clothBumpCanvas = makeCanvas(clothW, clothH);
  const cCtx = clothCanvas.getContext('2d');
  const cmCtx = clothMetalCanvas.getContext('2d');
  const cbCtx = clothBumpCanvas.getContext('2d');
  const cImg = cCtx.createImageData(clothW, clothH);
  const cmImg = cmCtx.createImageData(clothW, clothH);
  const cbImg = cbCtx.createImageData(clothW, clothH);

  for (let y = 0; y < clothH; y++) {
    const v = y / clothH;
    const edgeBorder = v < 0.16 || v > 0.84;
    const innerDiamond = Math.abs(v - 0.5) < 0.11;
    for (let x = 0; x < clothW; x++) {
      const u = x / clothW;
      const warpWeft = ((x >> 1) ^ (y >> 1)) & 1 ? 1.0 : 0.88;
      // Temple-tooth diamond motif in gold zari along edges and center stripe
      const tooth = Math.abs(((u * 36) % 1) - 0.5) * 2;
      const zariBorder =
        (v < 0.15 && v > 0.04 && v < 0.06 + tooth * 0.08) ||
        (v > 0.85 && v < 0.96 && 1 - v < 0.06 + tooth * 0.08) ||
        (innerDiamond && Math.abs(((u * 24) % 1) - 0.5) + Math.abs(v - 0.5) * 3.8 < 0.36);

      const idx = (y * clothW + x) * 4;
      if (zariBorder) {
        cImg.data[idx] = Math.min(255, 222 * warpWeft);
        cImg.data[idx + 1] = Math.min(255, 174 * warpWeft);
        cImg.data[idx + 2] = Math.min(255, 66 * warpWeft);
        cmImg.data[idx] = cmImg.data[idx + 1] = cmImg.data[idx + 2] = 215;
      } else {
        const shade = warpWeft * (edgeBorder ? 0.84 : 1.0);
        cImg.data[idx] = Math.min(255, 162 * shade);
        cImg.data[idx + 1] = Math.min(255, 24 * shade);
        cImg.data[idx + 2] = Math.min(255, 22 * shade);
        cmImg.data[idx] = cmImg.data[idx + 1] = cmImg.data[idx + 2] = 12;
      }
      cImg.data[idx + 3] = 255;
      cmImg.data[idx + 3] = 255;

      const b = warpWeft > 0.9 ? 168 : 96;
      cbImg.data[idx] = cbImg.data[idx + 1] = cbImg.data[idx + 2] = zariBorder ? b + 35 : b;
      cbImg.data[idx + 3] = 255;
    }
  }
  cCtx.putImageData(cImg, 0, 0);
  cmCtx.putImageData(cmImg, 0, 0);
  cbCtx.putImageData(cbImg, 0, 0);

  return {
    woodMap: configure(new THREE.CanvasTexture(woodColorCanvas), true),
    woodBump: configure(new THREE.CanvasTexture(woodBumpCanvas), false),
    woodRough: configure(new THREE.CanvasTexture(woodRoughCanvas), false),
    skinMap: configure(new THREE.CanvasTexture(skinColorCanvas), true),
    skinBump: configure(new THREE.CanvasTexture(skinBumpCanvas), false),
    skinRough: configure(new THREE.CanvasTexture(skinRoughCanvas), false),
    ropeMap: configure(new THREE.CanvasTexture(ropeColorCanvas), true, 1, 16),
    ropeBump: configure(new THREE.CanvasTexture(ropeBumpCanvas), false, 1, 16),
    strikerCordMap: configure(new THREE.CanvasTexture(ropeColorCanvas), true, 1, 10),
    strikerCordBump: configure(new THREE.CanvasTexture(ropeBumpCanvas), false, 1, 10),
    clothMap: configure(new THREE.CanvasTexture(clothCanvas), true, 2, 1),
    clothMetal: configure(new THREE.CanvasTexture(clothMetalCanvas), false, 2, 1),
    clothBump: configure(new THREE.CanvasTexture(clothBumpCanvas), false, 2, 1)
  };
}
