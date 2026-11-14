import * as THREE from 'three';
import { DAMARU_SPEC, shellRadiusAtX } from './physics.js';

function createPolarDiscGeometry(radius, radialSegments = 64, ringSegments = 22) {
  const geo = new THREE.BufferGeometry();
  const positions = [];
  const uvs = [];
  const indices = [];

  // Center vertex (index 0)
  positions.push(0, 0, 0);
  uvs.push(0.5, 0.5);

  for (let rIdx = 1; rIdx <= ringSegments; rIdx++) {
    const rFrac = rIdx / ringSegments;
    const r = radius * rFrac;
    for (let aIdx = 0; aIdx < radialSegments; aIdx++) {
      const theta = (aIdx / radialSegments) * Math.PI * 2;
      const y = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      positions.push(0, y, z);
      uvs.push(0.5 + 0.5 * rFrac * Math.cos(theta), 0.5 + 0.5 * rFrac * Math.sin(theta));
    }
  }

  // Inner fan around center vertex
  for (let aIdx = 0; aIdx < radialSegments; aIdx++) {
    const next = (aIdx + 1) % radialSegments;
    indices.push(0, 1 + aIdx, 1 + next);
  }

  // Concentric quad rings
  for (let rIdx = 1; rIdx < ringSegments; rIdx++) {
    const ringStart = 1 + (rIdx - 1) * radialSegments;
    const nextRingStart = 1 + rIdx * radialSegments;
    for (let aIdx = 0; aIdx < radialSegments; aIdx++) {
      const next = (aIdx + 1) % radialSegments;
      const a = ringStart + aIdx;
      const b = nextRingStart + aIdx;
      const c = nextRingStart + next;
      const d = ringStart + next;
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function buildDamaruAssembly(textures) {
  const root = new THREE.Group();
  root.name = 'DamaruRoot';

  const bodyGroup = new THREE.Group();
  bodyGroup.name = 'DamaruBody';
  root.add(bodyGroup);

  // --- PBR Materials ---
  const woodMat = new THREE.MeshPhysicalMaterial({
    map: textures.woodMap,
    bumpMap: textures.woodBump,
    bumpScale: 0.018,
    roughnessMap: textures.woodRough,
    roughness: 0.44,
    metalness: 0.04,
    clearcoat: 0.58,
    clearcoatRoughness: 0.26,
    side: THREE.DoubleSide
  });

  const brassMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#d2a24c'),
    metalness: 0.88,
    roughness: 0.26,
    bumpMap: textures.woodBump,
    bumpScale: 0.004
  });

  const parchmentMat = new THREE.MeshPhysicalMaterial({
    map: textures.skinMap,
    bumpMap: textures.skinBump,
    bumpScale: 0.012,
    roughnessMap: textures.skinRough,
    roughness: 0.62,
    metalness: 0.0,
    sheen: 0.35,
    sheenRoughness: 0.72,
    sheenColor: new THREE.Color('#fff2d6'),
    clearcoat: 0.08,
    side: THREE.DoubleSide
  });

  const rimLeatherMat = new THREE.MeshPhysicalMaterial({
    map: textures.skinMap,
    color: new THREE.Color('#bfa074'),
    bumpMap: textures.ropeBump,
    bumpScale: 0.022,
    roughness: 0.68,
    metalness: 0.02
  });

  const tensionCordMat = new THREE.MeshStandardMaterial({
    map: textures.ropeMap,
    bumpMap: textures.ropeBump,
    bumpScale: 0.02,
    roughness: 0.82,
    metalness: 0.0
  });

  const strikerCordMat = new THREE.MeshStandardMaterial({
    map: textures.strikerCordMap,
    color: new THREE.Color('#ead8b8'),
    bumpMap: textures.strikerCordBump,
    bumpScale: 0.024,
    roughness: 0.78,
    metalness: 0.0
  });

  const waistClothMat = new THREE.MeshStandardMaterial({
    map: textures.clothMap,
    metalnessMap: textures.clothMetal,
    bumpMap: textures.clothBump,
    bumpScale: 0.015,
    roughness: 0.56,
    metalness: 0.55
  });

  const lacBeadMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#3b0d0b'),
    roughness: 0.22,
    metalness: 0.06,
    clearcoat: 0.82,
    clearcoatRoughness: 0.16
  });

  // --- 1. Lathe-Turned Hourglass Wooden Resonator Shell (along local X) ---
  const H = DAMARU_SPEC.halfLength;
  const lathePts = [];
  const profileSamples = 96;
  // Outer profile from -H to +H
  for (let i = 0; i <= profileSamples; i++) {
    const x = -H + (2 * H * i) / profileSamples;
    const r = shellRadiusAtX(x) * 0.992;
    lathePts.push(new THREE.Vector2(r, x));
  }
  // Inner hollow acoustic throat bevel returning from +H to -H
  const wallThick = 0.048;
  for (let i = profileSamples; i >= 0; i--) {
    const x = -H + (2 * H * i) / profileSamples;
    const r = Math.max(0.11, shellRadiusAtX(x) * 0.992 - wallThick);
    lathePts.push(new THREE.Vector2(r, x));
  }
  lathePts.push(lathePts[0].clone());

  const latheGeo = new THREE.LatheGeometry(lathePts, 96);
  // LatheGeometry revolves around Y; rotate Z by -pi/2 so revolution axis is local +X!
  latheGeo.rotateZ(-Math.PI / 2);
  const shellMesh = new THREE.Mesh(latheGeo, woodMat);
  shellMesh.name = 'shell';
  bodyGroup.add(shellMesh);

  // Turned antique brass accent collars flanking the waist cloth
  for (const bx of [-0.155, 0.155, -0.77, 0.77]) {
    const rad = shellRadiusAtX(bx) + 0.005;
    const ringGeo = new THREE.TorusGeometry(rad, Math.abs(bx) < 0.3 ? 0.014 : 0.009, 20, 72);
    ringGeo.rotateY(Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, brassMat);
    ring.position.x = bx;
    ring.name = 'shell';
    bodyGroup.add(ring);
  }

  // --- 2. Woven Crimson & Gold Zari Waist Band + Brass Striker Eyelets ---
  const bandPts = [];
  const bandHalf = 0.145;
  for (let i = 0; i <= 24; i++) {
    const x = -bandHalf + (2 * bandHalf * i) / 24;
    bandPts.push(new THREE.Vector2(shellRadiusAtX(x) + 0.008, x));
  }
  const bandGeo = new THREE.LatheGeometry(bandPts, 72);
  bandGeo.rotateZ(-Math.PI / 2);
  const bandMesh = new THREE.Mesh(bandGeo, waistClothMat);
  bandMesh.name = 'waist';
  bodyGroup.add(bandMesh);

  for (const signZ of [1, -1]) {
    const eyelet = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.009, 16, 32), brassMat);
    eyelet.position.set(0, 0, signZ * (DAMARU_SPEC.anchorRadius - 0.012));
    eyelet.rotation.y = Math.PI / 2;
    eyelet.name = 'waist';
    bodyGroup.add(eyelet);

    const knotAnchor = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 16), strikerCordMat);
    knotAnchor.position.set(0, 0, signZ * DAMARU_SPEC.anchorRadius);
    bodyGroup.add(knotAnchor);
  }

  // --- 3. Left & Right Taut Goatskin Parchment Heads + Braided Rawhide Flesh Hoops ---
  const headRadius = DAMARU_SPEC.headActiveRadius;
  const leftHeadGeo = createPolarDiscGeometry(headRadius, 64, 22);
  // Flip left head normals to face -X while preserving polar vertex coordinates
  const rightHeadGeo = createPolarDiscGeometry(headRadius, 64, 22);

  const leftHeadMesh = new THREE.Mesh(leftHeadGeo, parchmentMat);
  leftHeadMesh.position.x = -H;
  leftHeadMesh.name = 'head_left';
  bodyGroup.add(leftHeadMesh);

  const rightHeadMesh = new THREE.Mesh(rightHeadGeo, parchmentMat);
  rightHeadMesh.position.x = H;
  rightHeadMesh.name = 'head_right';
  bodyGroup.add(rightHeadMesh);

  // Store clean rest Y,Z coordinates for fast Bessel-wave vertex deformation
  const cacheHeadBase = geo => {
    const pos = geo.attributes.position;
    const baseYZ = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      baseYZ[i * 2] = pos.getY(i);
      baseYZ[i * 2 + 1] = pos.getZ(i);
    }
    return baseYZ;
  };
  const leftBaseYZ = cacheHeadBase(leftHeadGeo);
  const rightBaseYZ = cacheHeadBase(rightHeadGeo);

  // Braided rawhide flesh hoops ('gajra') + 16 perimeter lug loops on each mouth
  const lugCount = 16;
  const lugRadius = DAMARU_SPEC.mouthRadius + 0.018;
  for (const signX of [-1, 1]) {
    const hoopGeo = new THREE.TorusGeometry(DAMARU_SPEC.mouthRadius + 0.004, 0.036, 24, 84);
    hoopGeo.rotateY(Math.PI / 2);
    const hoop = new THREE.Mesh(hoopGeo, rimLeatherMat);
    hoop.position.x = signX * (H - 0.006);
    hoop.name = signX < 0 ? 'rim_left' : 'rim_right';
    bodyGroup.add(hoop);

    // Secondary tucked rawhide collar ring
    const innerCollarGeo = new THREE.TorusGeometry(DAMARU_SPEC.mouthRadius - 0.012, 0.018, 16, 72);
    innerCollarGeo.rotateY(Math.PI / 2);
    const collar = new THREE.Mesh(innerCollarGeo, rimLeatherMat);
    collar.position.x = signX * (H - 0.048);
    collar.name = 'shell';
    bodyGroup.add(collar);

    // 16 stitched leather lug loops where the V-tension cords pass through
    for (let k = 0; k < lugCount; k++) {
      const angle = ((k + (signX > 0 ? 0.5 : 0)) / lugCount) * Math.PI * 2;
      const lug = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0075, 10, 20), tensionCordMat);
      lug.position.set(
        signX * (H - 0.032),
        Math.cos(angle) * lugRadius,
        Math.sin(angle) * lugRadius
      );
      lug.lookAt(signX * (H - 0.032), 0, 0);
      bodyGroup.add(lug);
    }
  }

  // --- 4. 32 V-Laced Braided Tension Cords + Waist Squeeze Cinch Belt ---
  const vCordMeshes = [];
  const vCordCurves = [];
  const xLug = H - 0.032;

  for (let k = 0; k < lugCount; k++) {
    const aLeft = (k / lugCount) * Math.PI * 2;
    const aRightA = ((k + 0.5) / lugCount) * Math.PI * 2;
    const aRightB = (((k - 0.5 + lugCount) % lugCount) / lugCount) * Math.PI * 2;

    const pLeft = new THREE.Vector3(-xLug, Math.cos(aLeft) * lugRadius, Math.sin(aLeft) * lugRadius);

    for (const aRight of [aRightA, aRightB]) {
      const pRight = new THREE.Vector3(xLug, Math.cos(aRight) * lugRadius, Math.sin(aRight) * lugRadius);
      const midDir = new THREE.Vector3(0, pLeft.y + pRight.y, pLeft.z + pRight.z).normalize();
      const pMid = midDir.clone().multiplyScalar(0.43);

      const curve = new THREE.CatmullRomCurve3([pLeft, pMid, pRight]);
      const geo = new THREE.TubeGeometry(curve, 20, 0.0105, 8, false);
      const mesh = new THREE.Mesh(geo, tensionCordMat);
      mesh.name = 'waist';
      bodyGroup.add(mesh);
      vCordMeshes.push(mesh);
      vCordCurves.push({ pLeft, pRight, midDir });
    }
  }

  // Central waist tension belt loop ('dori') that cinches the V-cords inward into an hourglass X-lattice
  const cinchRingGeo = new THREE.TorusGeometry(0.43, 0.0135, 14, 64);
  cinchRingGeo.rotateY(Math.PI / 2);
  const cinchRing = new THREE.Mesh(cinchRingGeo, tensionCordMat);
  cinchRing.name = 'waist';
  bodyGroup.add(cinchRing);

  let lastBuiltTension = 0;
  function updateTensionLacing(tension) {
    if (Math.abs(tension - lastBuiltTension) < 0.015) return;
    lastBuiltTension = tension;
    // Squeezing the waist pulls the V-cords radially inward from r=0.43 down to r=0.28!
    const midRadius = 0.43 - tension * 0.15;
    cinchRing.scale.setScalar(midRadius / 0.43);

    for (let i = 0; i < vCordMeshes.length; i++) {
      const { pLeft, pRight, midDir } = vCordCurves[i];
      const pMid = midDir.clone().multiplyScalar(midRadius);
      const curve = new THREE.CatmullRomCurve3([pLeft, pMid, pRight]);
      const nextGeo = new THREE.TubeGeometry(curve, 18, 0.0105, 8, false);
      vCordMeshes[i].geometry.dispose();
      vCordMeshes[i].geometry = nextGeo;
    }
  }

  // --- 5. Dynamic World-Space Striker Cords & Knotted Lac/Brass 'Goli' Beads ---
  const worldStrikerGroup = new THREE.Group();
  worldStrikerGroup.name = 'WorldStrikers';
  root.add(worldStrikerGroup);

  const strikerVisuals = [0, 1].map(() => {
    const dummyPts = Array.from({ length: 10 }, (_, i) => new THREE.Vector3(0, -i * 0.14, 0));
    const curve = new THREE.CatmullRomCurve3(dummyPts);
    const cordGeo = new THREE.TubeGeometry(curve, 28, DAMARU_SPEC.cordRadius, 10, false);
    const cordMesh = new THREE.Mesh(cordGeo, strikerCordMat);
    worldStrikerGroup.add(cordMesh);

    const beadGroup = new THREE.Group();
    // Main polished crimson-ebony lac striker ball
    const beadBall = new THREE.Mesh(
      new THREE.SphereGeometry(DAMARU_SPEC.beadRadius * 0.92, 28, 24),
      lacBeadMat
    );
    beadBall.scale.set(1.0, 1.06, 1.0);
    beadGroup.add(beadBall);

    // Brass collar sleeve where cord enters the lac bead
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.032, 0.028, 20),
      brassMat
    );
    collar.position.y = DAMARU_SPEC.beadRadius * 0.85;
    beadGroup.add(collar);

    // Terminal stopper knot below the bead
    const stopperKnot = new THREE.Mesh(
      new THREE.TorusGeometry(0.017, 0.009, 10, 18),
      strikerCordMat
    );
    stopperKnot.rotation.x = Math.PI / 2;
    stopperKnot.position.y = -DAMARU_SPEC.beadRadius * 0.88;
    beadGroup.add(stopperKnot);

    worldStrikerGroup.add(beadGroup);
    return { cordMesh, beadGroup };
  });

  const upAxis = new THREE.Vector3(0, 1, 0);
  const tangentVec = new THREE.Vector3();

  function deformHeadMesh(geo, baseYZ, ripples, outwardSign) {
    const pos = geo.attributes.position;
    if (ripples.length === 0) {
      // Relax cleanly to flat taut membrane
      let dirty = false;
      for (let i = 0; i < pos.count; i++) {
        if (Math.abs(pos.getX(i)) > 1e-5) {
          pos.setX(i, 0);
          dirty = true;
        }
      }
      if (dirty) {
        pos.needsUpdate = true;
        geo.computeVertexNormals();
      }
      return;
    }

    const R = DAMARU_SPEC.headActiveRadius;
    for (let i = 0; i < pos.count; i++) {
      const y = baseYZ[i * 2];
      const z = baseYZ[i * 2 + 1];
      const r = Math.hypot(y, z);
      // Boundary condition: displacement = 0 at clamped flesh-hoop rim r = R
      const boundaryEnv = Math.max(0, 1 - Math.pow(r / R, 2.2));
      if (boundaryEnv <= 0.0001) {
        pos.setX(i, 0);
        continue;
      }

      let disp = 0;
      for (let k = 0; k < ripples.length; k++) {
        const rip = ripples[k];
        const dy = y - rip.ly;
        const dz = z - rip.lz;
        const distFromHit = Math.hypot(dy, dz);
        const decay = Math.exp(-rip.age * 11.5);
        // Coupled fundamental dome + concentric Bessel wave traveling outward from strike point
        const fundamental = Math.cos((r / R) * Math.PI * 0.5) * Math.sin(rip.age * 195);
        const localWave =
          Math.cos(distFromHit * 13.5 - rip.age * 240) * Math.exp(-distFromHit * 2.4);
        disp += -outwardSign * rip.amp * decay * (0.026 * fundamental + 0.032 * localWave);
      }
      pos.setX(i, disp * boundaryEnv);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  function syncWithPhysics(physics) {
    bodyGroup.position.copy(physics.posOffset);
    bodyGroup.quaternion.copy(physics.quat);

    updateTensionLacing(physics.tension);

    // Update dynamic 3D braided cord tubes + bead orientations
    for (let cIdx = 0; cIdx < 2; cIdx++) {
      const cord = physics.cords[cIdx];
      const vis = strikerVisuals[cIdx];

      const curve = new THREE.CatmullRomCurve3(cord.pos);
      const nextTube = new THREE.TubeGeometry(curve, 26, DAMARU_SPEC.cordRadius, 9, false);
      vis.cordMesh.geometry.dispose();
      vis.cordMesh.geometry = nextTube;

      const tip = cord.pos[cord.count - 1];
      const prevNode = cord.pos[cord.count - 2];
      vis.beadGroup.position.copy(tip);
      tangentVec.subVectors(prevNode, tip).normalize();
      if (tangentVec.lengthSq() > 0.001) {
        vis.beadGroup.quaternion.setFromUnitVectors(upAxis, tangentVec);
      }
    }

    // Update 3D Bessel membrane ripples on Left & Right drumheads
    deformHeadMesh(leftHeadGeo, leftBaseYZ, physics.ripples.left, -1);
    deformHeadMesh(rightHeadGeo, rightBaseYZ, physics.ripples.right, 1);
  }

  return {
    root,
    bodyGroup,
    leftHeadMesh,
    rightHeadMesh,
    shellMesh,
    syncWithPhysics
  };
}
