import * as THREE from 'three';

export const DAMARU_SPEC = {
  halfLength: 0.92,      // x in [-0.92, +0.92]
  waistRadius: 0.235,
  mouthRadius: 0.785,
  rimOuterRadius: 0.815,
  headActiveRadius: 0.745,
  cordLength: 1.40,
  cordSegments: 9,       // 10 nodes (0 = waist anchor, 9 = striker bead)
  cordRadius: 0.015,
  beadRadius: 0.066,
  anchorRadius: 0.272
};

export function shellRadiusAtX(x) {
  const u = Math.min(1, Math.abs(x) / DAMARU_SPEC.halfLength);
  let r =
    DAMARU_SPEC.waistRadius +
    (DAMARU_SPEC.mouthRadius - DAMARU_SPEC.waistRadius) * Math.pow(u, 1.46);

  // Subtle lathe-turned decorative rings matching geometry.js
  r += 0.014 * Math.exp(-Math.pow((u - 0.17) / 0.026, 2));
  r += 0.011 * Math.exp(-Math.pow((u - 0.35) / 0.024, 2));
  r += 0.015 * Math.exp(-Math.pow((u - 0.84) / 0.025, 2));
  if (u > 0.93) {
    // Rawhide flesh-hoop collar bulge at the mouths
    r += 0.032 * Math.sin(((u - 0.93) / 0.07) * Math.PI * 0.85);
  }
  return r;
}

class StrikerCord {
  constructor(anchorLocal, sideSign) {
    this.anchorLocal = anchorLocal.clone();
    this.sideSign = sideSign;
    const N = DAMARU_SPEC.cordSegments + 1;
    this.count = N;
    this.segLen = DAMARU_SPEC.cordLength / DAMARU_SPEC.cordSegments;
    this.pos = [];
    this.prev = [];
    this.invMass = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      // Hang naturally downward (-Y) from waist anchor at startup
      const p = new THREE.Vector3(
        anchorLocal.x,
        anchorLocal.y - i * this.segLen,
        anchorLocal.z * (1 + i * 0.03)
      );
      this.pos.push(p.clone());
      this.prev.push(p.clone());
      if (i === 0) {
        this.invMass[i] = 0; // Pinned to waist eyelet
      } else if (i === N - 1) {
        this.invMass[i] = 0.16; // Heavy lac/brass striker bead ('goli') at tip
      } else {
        this.invMass[i] = 1.0;
      }
    }
    this.hitCooldown = 0;
  }

  resetToOrientation(quat) {
    const anchorW = this.anchorLocal.clone().applyQuaternion(quat);
    for (let i = 0; i < this.count; i++) {
      this.pos[i].set(
        anchorW.x + this.sideSign * 0.04 * i,
        anchorW.y - i * this.segLen,
        anchorW.z
      );
      this.prev[i].copy(this.pos[i]);
    }
  }
}

// Iconic 32-step (2-bar, 16th-note) Shiva Tandava Damaru rhythm at 116 BPM
const FAMOUS_DAMARU_PATTERN = [
  { side: 'left', vel: 0.92, r: 0.32, tension: 0.0 },   // 0: Dam
  null,
  { side: 'right', vel: 0.78, r: 0.36, tension: 0.0 },  // 2: Dug
  null,
  { side: 'left', vel: 0.86, r: 0.34, tension: 0.0 },   // 4: Dam
  { side: 'right', vel: 0.76, r: 0.40, tension: 0.0 },  // 5: Dug
  { side: 'left', vel: 0.94, r: 0.28, tension: 0.06 },  // 6: Dam!
  null,
  { side: 'right', vel: 0.82, r: 0.38, tension: 0.18 }, // 8: Dug (bend up)
  null,
  { side: 'left', vel: 0.78, r: 0.34, tension: 0.12 },  // 10: Dam
  null,
  { side: 'right', vel: 0.84, r: 0.36, tension: 0.28 }, // 12: Dug
  { side: 'left', vel: 0.76, r: 0.36, tension: 0.34 },  // 13: Dam
  { side: 'right', vel: 0.92, r: 0.62, tension: 0.40 }, // 14: Ta!
  null,
  { side: 'left', vel: 0.92, r: 0.30, tension: 0.08 },  // 16: Dam
  null,
  { side: 'right', vel: 0.74, r: 0.40, tension: 0.18 }, // 18: Da
  { side: 'left', vel: 0.82, r: 0.36, tension: 0.24 },  // 19: ma
  { side: 'right', vel: 0.90, r: 0.34, tension: 0.32 }, // 20: Dam
  null,
  { side: 'left', vel: 0.78, r: 0.38, tension: 0.40 },  // 22: Da
  { side: 'right', vel: 0.84, r: 0.42, tension: 0.48 }, // 23: ma
  { side: 'left', vel: 0.88, r: 0.34, tension: 0.56 },  // 24: Dam
  { side: 'right', vel: 0.82, r: 0.38, tension: 0.62 }, // 25: Dug
  { side: 'left', vel: 0.90, r: 0.32, tension: 0.66 },  // 26: Dam
  { side: 'right', vel: 0.86, r: 0.44, tension: 0.70 }, // 27: Dug
  { side: 'left', vel: 0.98, r: 0.26, tension: 0.04 },  // 28: DAM! (open release)
  null,
  null,
  null
];

export class DamaruPhysics {
  constructor({ onStrike } = {}) {
    this.onStrike = onStrike || (() => {});

    // Resting studio pose: angled slightly so wooden waist, V-lacing & parchment head all show
    this.restEuler = new THREE.Euler(0.14, 0.42, -0.08, 'YXZ');
    this.restQuat = new THREE.Quaternion().setFromEuler(this.restEuler);

    // Generalized orientation angles + angular velocities for intuitive 3D control & wrist twist
    this.yaw = 0.42;         // Primary wrist pronation/supination twist axis (whips beads!)
    this.pitch = 0.14;       // Tilt up/down
    this.roll = -0.08;       // Barrel roll / secondary twist
    this.velYaw = 0;
    this.velPitch = 0;
    this.velRoll = 0;

    // Center-of-mass spring recoil offset when shaken or tapped
    this.posOffset = new THREE.Vector3(0, 0, 0);
    this.posVel = new THREE.Vector3(0, 0, 0);

    this.quat = new THREE.Quaternion().copy(this.restQuat);
    this.invQuat = new THREE.Quaternion().copy(this.quat).invert();
    this.prevQuat = new THREE.Quaternion().copy(this.quat);
    this.omegaWorld = new THREE.Vector3();

    // Two opposing braided striker cords anchored at +Y/-Z and -Y/+Z of the narrow waist
    // so both wrist roll (pronation/supination around Z) and yaw (around Y) whip them symmetrically!
    this.cords = [
      new StrikerCord(new THREE.Vector3(0, 0.08, DAMARU_SPEC.anchorRadius), 1),
      new StrikerCord(new THREE.Vector3(0, 0.08, -DAMARU_SPEC.anchorRadius), -1)
    ];
    for (const c of this.cords) c.resetToOrientation(this.quat);

    // Active membrane wave ripples for 3D vertex deformation on Left (-X) and Right (+X) heads
    this.ripples = { left: [], right: [] };

    // Programmatic / autonomous shake oscillator (for WebMCP agent or keyboard roll)
    this.autoShake = {
      active: false,
      remainingSec: 0,
      phase: 0,
      freqHz: 7.5,
      intensity: 0.75
    };

    // Famous rhythm Auto Play sequencer (beat-locked Shiva Tandava groove)
    this.autoPlay = {
      active: false,
      elapsedSec: 0,
      lastStepIdx: -1,
      targetTension: 0
    };

    this.isDragging = false;
    this.tension = 0.0;
    this.totalStrikes = 0;
    this.lastStrikeVelocity = 0;
    this.lastStrikeSide = null;

    this._tmpVec = new THREE.Vector3();
    this._tmpPrevLocal = new THREE.Vector3();
    this._tmpVelBead = new THREE.Vector3();
    this._tmpVelSurf = new THREE.Vector3();
    this._dq = new THREE.Quaternion();
  }

  /**
   * Feed pointer drag/shake deltas (normalized by viewport min dimension) and dt.
   * Slow gentle movement orbits/inspects the Damaru; brisk drag/shake twists the waist
   * and whips both beaded cords across the two drumheads matching pointer speed!
   */
  applyPointerMove(normDx, normDy, dt) {
    const safeDt = Math.max(0.004, Math.min(0.05, dt));
    const speed = Math.hypot(normDx, normDy) / safeDt;

    // Authentic forearm pronation/supination: couples waist yaw (Y) + doorknob wrist roll (Z)
    // + forearm-pivot arc translation so gentle shakes tap softly and fast shakes roar!
    const speedGain = 1.05 + Math.min(2.1, speed * 0.44);
    this.velYaw += normDx * 64 * speedGain;
    this.velRoll -= normDx * 44 * speedGain;
    this.velPitch += normDy * 22;

    if (speed > 0.65) {
      this.velYaw += normDy * 32 * Math.sign(Math.cos(this.yaw * 1.4 + 0.3));
      this.velRoll += normDy * 26;
    }

    this.velYaw = Math.max(-44, Math.min(44, this.velYaw));
    this.velPitch = Math.max(-18, Math.min(18, this.velPitch));
    this.velRoll = Math.max(-32, Math.min(32, this.velRoll));

    // Forearm pivot below waist creates natural lateral arc impulse on the cords
    this.posVel.x += normDx * 5.6;
    this.posVel.y -= normDy * 3.8;
  }

  /**
   * Feed mobile accelerometer / gyroscope shake from DeviceMotionEvent.
   */
  applyDeviceMotion({ ax = 0, ay = 0, az = 0, rotAlpha = 0, rotBeta = 0, rotGamma = 0 }) {
    // Combine linear acceleration impulse (m/s^2) and gyroscope rotation rate (deg/s)
    const linMag = Math.hypot(ax, ay, az);
    if (linMag > 1.4 || Math.abs(rotGamma) > 25 || Math.abs(rotAlpha) > 25) {
      this.velYaw += (ax * 1.45 + rotGamma * 0.065 + rotAlpha * 0.035);
      this.velPitch += (ay * 0.45 + rotBeta * 0.02);
      this.velRoll += az * 0.35;
      this.velYaw = Math.max(-34, Math.min(34, this.velYaw));
      this.posVel.x += Math.max(-1.8, Math.min(1.8, ax * 0.08));
    }
  }

  /**
   * Apply a crisp wrist-flick impulse (keyboard arrow keys or quick swipe).
   */
  applyFlick(direction = 1, strength = 0.8) {
    const s = Math.max(0.1, Math.min(1.2, strength));
    this.velYaw += direction * (16 + 15 * s);
    this.velRoll -= direction * 4.5 * s;
    this.posVel.x += direction * 0.55 * s;
  }

  /**
   * Start a physically simulated oscillatory wrist shake (used by WebMCP agent or 'R' key).
   */
  triggerAutoShake({ frequencyHz = 7.2, intensity = 0.78, durationMs = 1400 } = {}) {
    this.autoShake.active = true;
    this.autoShake.freqHz = Math.max(2.5, Math.min(13, frequencyHz));
    this.autoShake.intensity = Math.max(0.15, Math.min(1.0, intensity));
    this.autoShake.remainingSec = Math.max(0.15, Math.min(12, durationMs / 1000));
  }

  /**
   * Toggle continuous famous Damaru rhythm Auto Play.
   */
  setAutoPlay(enabled) {
    this.autoPlay.active = Boolean(enabled);
    if (this.autoPlay.active) {
      this.autoPlay.elapsedSec = 0;
      this.autoPlay.lastStepIdx = -1;
      this.autoPlay.targetTension = 0;
      this.autoShake.active = false;
    } else {
      this.tension = 0;
    }
    return this.autoPlay.active;
  }

  /**
   * Direct tap/strike on a drumhead or shell (from raycast click/tap or agent tool).
   */
  triggerDirectTap(side, localY, localZ, velocity = 0.72, striker = 'finger') {
    const vel = Math.max(0.08, Math.min(1.0, velocity));
    const rho = Math.hypot(localY, localZ);
    const rNorm = Math.min(1.0, rho / DAMARU_SPEC.headActiveRadius);

    if (side === 'left' || side === 'right') {
      this._pushRipple(side, localY, localZ, vel * 0.95);
      const sign = side === 'right' ? 1 : -1;
      // Physical recoil from finger tap
      this.posVel.x -= sign * 0.35 * vel;
      this.velYaw += (localZ * sign) * 3.8 * vel;
      this.velPitch -= (localY * sign) * 3.2 * vel;
      this.totalStrikes++;
      this.lastStrikeVelocity = vel;
      this.lastStrikeSide = side;
      this.onStrike({
        surface: rNorm > 0.93 ? 'shell' : side,
        velocity: vel,
        radialNorm: rNorm,
        striker,
        localY,
        localZ
      });
    } else {
      this.posVel.z -= 0.25 * vel;
      this.totalStrikes++;
      this.lastStrikeVelocity = Number((vel * 0.8).toFixed(3));
      this.lastStrikeSide = 'shell';
      this.onStrike({
        surface: 'shell',
        velocity: vel * 0.8,
        radialNorm: 1.0,
        striker: 'finger',
        localY: 0,
        localZ: 0
      });
    }
  }

  _pushRipple(side, ly, lz, amp) {
    const list = this.ripples[side];
    list.push({ ly, lz, amp: Math.min(1.2, amp), age: 0 });
    if (list.length > 6) list.shift();
  }

  _applyWristOscillation(freqHz, intensity, phase, dt) {
    const freqScale = Math.max(0.75, freqHz / 5.5);
    const amp = (0.48 + 0.72 * intensity) / Math.pow(freqScale, 0.58);
    const oscSin = Math.sin(phase);
    const oscCos = Math.cos(phase);
    const omega = freqHz * Math.PI * 2;

    const targetYaw = 0.42 + oscSin * amp;
    const targetRoll = -0.08 - oscSin * (amp * 0.65);
    const desiredVelYaw = oscCos * omega * amp + (targetYaw - this.yaw) * 14.0;
    const desiredVelRoll = -oscCos * omega * amp * 0.65 + (targetRoll - this.roll) * 14.0;
    this.velYaw += (desiredVelYaw - this.velYaw) * Math.min(1, dt * 36);
    this.velRoll += (desiredVelRoll - this.velRoll) * Math.min(1, dt * 36);
    this.posVel.x += oscCos * omega * 0.09 * intensity * dt * 28;
  }

  step(frameDt) {
    const dt = Math.min(0.033, Math.max(0.001, frameDt));

    // Update ripple ages
    for (const side of ['left', 'right']) {
      const arr = this.ripples[side];
      for (let i = arr.length - 1; i >= 0; i--) {
        arr[i].age += dt;
        if (arr[i].age > 0.42) arr.splice(i, 1);
      }
    }

    // Beat-locked Shiva Tandava Damaru rhythm Auto Play (116 BPM, 16th-note grid)
    if (this.autoPlay.active && !this.isDragging) {
      const stepSec = 60 / 116 / 4; // ~0.1293s per 16th note
      const stepIdx = Math.floor(this.autoPlay.elapsedSec / stepSec);
      this.autoPlay.elapsedSec += dt;

      if (stepIdx !== this.autoPlay.lastStepIdx) {
        this.autoPlay.lastStepIdx = stepIdx;
        const note = FAMOUS_DAMARU_PATTERN[stepIdx % FAMOUS_DAMARU_PATTERN.length];
        if (note) {
          this.autoPlay.targetTension = note.tension;
          const r = note.r * DAMARU_SPEC.headActiveRadius;
          const angle = (stepIdx * 1.1) % (Math.PI * 2);
          this.triggerDirectTap(note.side, Math.cos(angle) * r, Math.sin(angle) * r, note.vel, 'bead');
          // Crisp physical wrist flick matching the struck side so cords visibly whip in sync
          const dir = note.side === 'left' ? -1 : 1;
          this.velYaw += dir * (9.5 + 8.5 * note.vel);
          this.velRoll -= dir * (4.2 + 3.5 * note.vel);
          this.posVel.x += dir * 0.42 * note.vel;
        }
      }

      this.tension += (this.autoPlay.targetTension - this.tension) * Math.min(1, dt * 10);
    } else if (this.autoShake.active) {
      this.autoShake.remainingSec -= dt;
      if (this.autoShake.remainingSec <= 0) {
        this.autoShake.active = false;
      } else {
        this.autoShake.phase += dt * this.autoShake.freqHz * Math.PI * 2;
        this._applyWristOscillation(this.autoShake.freqHz, this.autoShake.intensity, this.autoShake.phase, dt);
      }
    }

    // Sub-stepped rigid-body + XPBD cord simulation (~360 Hz)
    const substeps = 10;
    const h = dt / substeps;
    const gravityY = -13.5; // Crisp instrument-scale gravity (~11cm real drum scaled to 1.84 units)

    for (let stepIdx = 0; stepIdx < substeps; stepIdx++) {
      this.prevQuat.copy(this.quat);

      // Gentle spring return toward ergonomic viewing angle when released
      if (!this.isDragging && !this.autoShake.active && !this.autoPlay.active) {
        // Wrap yaw smoothly back toward nearest 2*pi + 0.42 so full spins settle cleanly
        const nearestRestYaw =
          0.42 + Math.round((this.yaw - 0.42) / (Math.PI * 2)) * (Math.PI * 2);
        this.velYaw += (nearestRestYaw - this.yaw) * 11.0 * h;
        this.velPitch += (0.14 - this.pitch) * 14.0 * h;
        this.velRoll += (-0.08 - this.roll) * 14.0 * h;
      }

      // Angular damping
      const angDamp = Math.exp(-(this.isDragging ? 6.5 : 4.8) * h);
      this.velYaw *= angDamp;
      this.velPitch *= angDamp;
      this.velRoll *= angDamp;

      this.yaw += this.velYaw * h;
      this.pitch = Math.max(-1.15, Math.min(1.15, this.pitch + this.velPitch * h));
      this.roll = Math.max(-0.95, Math.min(0.95, this.roll + this.velRoll * h));

      // Translational spring-damper for natural wrist hold
      this.posVel.addScaledVector(this.posOffset, -48 * h);
      this.posVel.multiplyScalar(Math.exp(-12 * h));
      this.posOffset.addScaledVector(this.posVel, h);
      this.posOffset.clampLength(0, 0.22);

      // Update world orientation quaternion
      const eul = this._tmpEuler || (this._tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ'));
      eul.set(this.pitch, this.yaw, this.roll, 'YXZ');
      this.quat.setFromEuler(eul);
      this.invQuat.copy(this.quat).invert();

      // World angular velocity vector from quaternion delta: dq = q * prevQ^-1
      this._dq.copy(this.prevQuat).invert();
      this._dq.premultiply(this.quat);
      if (this._dq.w < 0) {
        this._dq.x = -this._dq.x;
        this._dq.y = -this._dq.y;
        this._dq.z = -this._dq.z;
        this._dq.w = -this._dq.w;
      }
      this.omegaWorld.set(this._dq.x, this._dq.y, this._dq.z).multiplyScalar(2 / h);

      // Step both 10-node XPBD cords + collide with capped hourglass SDF
      for (const cord of this.cords) {
        if (cord.hitCooldown > 0) cord.hitCooldown -= h;

        // Pin node 0 to rotating waist anchor in world space
        cord.prev[0].copy(cord.pos[0]);
        cord.pos[0].copy(cord.anchorLocal).applyQuaternion(this.quat).add(this.posOffset);

        // Verlet prediction for nodes 1..N-1
        const airDamp = 0.9965;
        for (let i = 1; i < cord.count; i++) {
          const p = cord.pos[i];
          const prev = cord.prev[i];
          const vx = (p.x - prev.x) * airDamp;
          const vy = (p.y - prev.y) * airDamp;
          const vz = (p.z - prev.z) * airDamp;
          prev.copy(p);
          p.x += vx;
          p.y += vy + gravityY * h * h;
          p.z += vz;
        }

        // 7 Gauss-Seidel constraint + SDF collision projection passes
        const constraintIters = 7;
        for (let iter = 0; iter < constraintIters; iter++) {
          // 1. Inextensible braided cotton segment length constraints
          for (let i = 0; i < cord.count - 1; i++) {
            const pA = cord.pos[i];
            const pB = cord.pos[i + 1];
            const wA = cord.invMass[i];
            const wB = cord.invMass[i + 1];
            const wSum = wA + wB;
            if (wSum === 0) continue;

            const dx = pB.x - pA.x;
            const dy = pB.y - pA.y;
            const dz = pB.z - pA.z;
            const dist = Math.hypot(dx, dy, dz) || 1e-6;
            const diff = (dist - cord.segLen) / dist;
            const corrA = (wA / wSum) * diff;
            const corrB = (wB / wSum) * diff;

            pA.x += dx * corrA;
            pA.y += dy * corrA;
            pA.z += dz * corrA;
            pB.x -= dx * corrB;
            pB.y -= dy * corrB;
            pB.z -= dz * corrB;
          }

          // 2. Slight cotton cord bending resistance (skip-1 distance floor)
          const minSkipDist = cord.segLen * 1.45;
          for (let i = 0; i < cord.count - 2; i++) {
            const pA = cord.pos[i];
            const pB = cord.pos[i + 2];
            const dx = pB.x - pA.x;
            const dy = pB.y - pA.y;
            const dz = pB.z - pA.z;
            const dist = Math.hypot(dx, dy, dz) || 1e-6;
            if (dist < minSkipDist) {
              const wA = cord.invMass[i];
              const wB = cord.invMass[i + 2];
              const wSum = wA + wB;
              const push = ((minSkipDist - dist) / dist) * 0.18;
              pA.x -= dx * push * (wA / wSum);
              pA.y -= dy * push * (wA / wSum);
              pA.z -= dz * push * (wA / wSum);
              pB.x += dx * push * (wB / wSum);
              pB.y += dy * push * (wB / wSum);
              pB.z += dz * push * (wB / wSum);
            }
          }

          // 3. Exact Capped-Hourglass SDF collision in Damaru local frame
          for (let i = 1; i < cord.count; i++) {
            const isBead = i === cord.count - 1;
            const rad = isBead ? DAMARU_SPEC.beadRadius : DAMARU_SPEC.cordRadius;

            const localP = this._tmpVec.copy(cord.pos[i]).sub(this.posOffset).applyQuaternion(this.invQuat);
            const absX = Math.abs(localP.x);
            const capLimit = DAMARU_SPEC.halfLength + rad;

            if (absX < capLimit) {
              const rho = Math.hypot(localP.y, localP.z);
              const clampedX = Math.min(DAMARU_SPEC.halfLength, absX);
              const wallRad = shellRadiusAtX(clampedX) + rad;

              if (rho < wallRad) {
                const penCap = capLimit - absX;
                const penWall = wallRad - rho;

                if (penCap < penWall && rho < DAMARU_SPEC.rimOuterRadius + rad * 0.45) {
                  // Drumhead face collision at x = +/- (halfLength + rad)!
                  const signX = localP.x >= 0 ? 1 : -1;

                  if (isBead && iter === 0) {
                    this._handleBeadHeadCollision(cord, localP, signX, rho, h);
                  }

                  localP.x = signX * capLimit;
                  cord.pos[i].copy(localP).applyQuaternion(this.quat).add(this.posOffset);

                  // Apply normal restitution + slight leather tangential friction on final iter
                  if (isBead && iter === constraintIters - 1) {
                    const prevL = this._tmpPrevLocal
                      .copy(cord.prev[i])
                      .sub(this.posOffset)
                      .applyQuaternion(this.invQuat);
                    const vn = (localP.x - prevL.x) * signX;
                    if (vn < 0) {
                      prevL.x = localP.x + vn * signX * 0.44;
                    }
                    // Tangential leather friction
                    prevL.y = localP.y - (localP.y - prevL.y) * 0.88;
                    prevL.z = localP.z - (localP.z - prevL.z) * 0.88;
                    cord.prev[i].copy(prevL).applyQuaternion(this.quat).add(this.posOffset);
                  }
                } else {
                  // Curved wooden hourglass shell / rim wrap collision
                  const invRho = rho > 1e-5 ? 1 / rho : 0;
                  const ny = rho > 1e-5 ? localP.y * invRho : 0;
                  const nz = rho > 1e-5 ? localP.z * invRho : cord.sideSign;

                  if (isBead && iter === 0 && penWall > 0.012 && absX > 0.42) {
                    this._handleBeadShellCollision(cord, localP, ny, nz, h);
                  }

                  localP.y = ny * wallRad;
                  localP.z = nz * wallRad;
                  cord.pos[i].copy(localP).applyQuaternion(this.quat).add(this.posOffset);
                }
              }
            }
          }
        }
      }
    }
  }

  _handleBeadHeadCollision(cord, localP, signX, rho, h) {
    if (cord.hitCooldown > 0) return;

    const beadIdx = cord.count - 1;
    // Bead world velocity
    this._tmpVelBead.copy(cord.pos[beadIdx]).sub(cord.prev[beadIdx]).divideScalar(h);

    // Drumhead surface point world velocity: v_surf = posVel + omega x r_world
    const rWorld = cord.pos[beadIdx].clone().sub(this.posOffset);
    this._tmpVelSurf.crossVectors(this.omegaWorld, rWorld).add(this.posVel);

    // Outward normal of the struck drumhead in world space
    const headNormalW = new THREE.Vector3(signX, 0, 0).applyQuaternion(this.quat);
    // Relative impact speed along inward normal
    const impactSpeed = -this._tmpVelBead.sub(this._tmpVelSurf).dot(headNormalW);

    if (impactSpeed < 1.0) return; // Ignore soft static resting contact, preserve pp->ff dynamics

    cord.hitCooldown = 0.020;
    const rawVel = Math.max(0.0, Math.min(1.0, (impactSpeed - 1.0) / 40.0));
    const velNorm = Math.max(0.05, Math.min(1.0, Math.pow(rawVel, 0.92)));
    const rNorm = Math.min(1.0, rho / DAMARU_SPEC.headActiveRadius);
    const side = signX > 0 ? 'right' : 'left';
    const hitSkin = rho <= DAMARU_SPEC.headActiveRadius * 1.02;

    if (hitSkin) {
      this._pushRipple(side, localP.y, localP.z, velNorm);
    }

    // Subtle Newton's 3rd-law angular recoil back into the Damaru body
    this.velYaw -= signX * (localP.z > 0 ? -1 : 1) * velNorm * 1.15;

    this.totalStrikes++;
    this.lastStrikeVelocity = Number(velNorm.toFixed(3));
    this.lastStrikeSide = hitSkin ? side : 'shell';

    this.onStrike({
      surface: hitSkin ? side : 'shell',
      velocity: velNorm,
      radialNorm: rNorm,
      striker: 'bead',
      localY: localP.y,
      localZ: localP.z
    });
  }

  _handleBeadShellCollision(cord, localP, ny, nz, h) {
    if (cord.hitCooldown > 0) return;
    const beadIdx = cord.count - 1;
    this._tmpVelBead.copy(cord.pos[beadIdx]).sub(cord.prev[beadIdx]).divideScalar(h);
    const rWorld = cord.pos[beadIdx].clone().sub(this.posOffset);
    this._tmpVelSurf.crossVectors(this.omegaWorld, rWorld).add(this.posVel);
    const normalW = new THREE.Vector3(0, ny, nz).applyQuaternion(this.quat);
    const impactSpeed = -this._tmpVelBead.sub(this._tmpVelSurf).dot(normalW);

    if (impactSpeed < 5.5) return; // Only audible on crisp rim/shell knocks
    cord.hitCooldown = 0.045;
    const velNorm = Math.max(0.05, Math.min(0.65, (impactSpeed - 5.0) / 22.0));
    this.onStrike({
      surface: 'shell',
      velocity: velNorm,
      radialNorm: 1.0,
      striker: 'bead',
      localY: localP.y,
      localZ: localP.z
    });
  }
}
