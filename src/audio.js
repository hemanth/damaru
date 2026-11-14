// Physical-Modeling Damaru Acoustic Synthesizer (WebAudio API)
// Calibrated against real acoustic Damaru spectral measurements:
// - Fundamentals: 234 Hz (left) / 258 Hz (right) with crisp 18ms tension-drop scoop
// - Dominant 469 Hz hollow hourglass cavity + 2nd-harmonic woody resonance ('duk-duk')
// - Tight 516 / 610 / 820 / 945 Hz goatskin & wooden shell partials with dry 50-90ms decay
// - Punchy, high-headroom mastering limiter reaching full acoustic presence

const DAMARU_MODES = [
  { ratio: 1.0, order: 0, decay: 0.092, baseGain: 0.78 },
  { ratio: 1.94, order: 1, decay: 0.072, baseGain: 1.08 }, // ~469 Hz signature woody/skin formant
  { ratio: 2.22, order: 2, decay: 0.052, baseGain: 0.48 }, // ~516-562 Hz
  { ratio: 2.58, order: 0, decay: 0.040, baseGain: 0.36 }, // ~609-656 Hz
  { ratio: 3.42, order: 3, decay: 0.028, baseGain: 0.30 }, // ~820 Hz
  { ratio: 3.92, order: 1, decay: 0.022, baseGain: 0.25 }, // ~938-961 Hz
  { ratio: 4.85, order: 4, decay: 0.016, baseGain: 0.16 }
];

function approxBessel(order, x) {
  if (order === 0) {
    return Math.cos(x * 0.92) * Math.exp(-0.12 * x * x);
  }
  if (order === 1) {
    return Math.sin(x * 0.85) * Math.exp(-0.08 * x * x);
  }
  return Math.sin(Math.max(0, x - 0.65) * 0.9) * (1 - Math.exp(-0.4 * x * x)) * 0.85;
}

function createMembraneCurve() {
  const n = 512;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.55 + 0.08 * x * x);
  }
  return curve;
}

export class DamaruAudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.reverbConvolver = null;
    this.noiseBuffer = null;
    this.membraneCurve = createMembraneCurve();
    this.tension = 0.0; // [0, 1] waist cord squeeze
    this.activeVoices = [];
    this.lastStrikeAt = { left: 0, right: 0 };
    this.muted = false;
  }

  ensureContext() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    const ctx = new AudioCtx({ latencyHint: 'interactive' });
    this.ctx = ctx;

    // Clean sub-cut < 95 Hz + strong woody ~470 Hz & crisp ~940 Hz presence
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 95;
    hpf.Q.value = 0.7;

    const woodResonance = ctx.createBiquadFilter();
    woodResonance.type = 'peaking';
    woodResonance.frequency.value = 470;
    woodResonance.Q.value = 1.6;
    woodResonance.gain.value = 4.2;

    const crispSnap = ctx.createBiquadFilter();
    crispSnap.type = 'peaking';
    crispSnap.frequency.value = 1850;
    crispSnap.Q.value = 0.9;
    crispSnap.gain.value = 2.4;

    // Fast brickwall-style limiter so strikes hit loud (~0 dBFS) without clipping on fast rolls
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -2.0;
    comp.knee.value = 4;
    comp.ratio.value = 14;
    comp.attack.value = 0.0005;
    comp.release.value = 0.055;
    this.compressor = comp;

    const master = ctx.createGain();
    master.gain.value = 2.45;
    this.masterGain = master;

    // Very short, dry natural room reflection (0.12s) so the drum stays crisp and immediate
    const irLen = Math.floor(ctx.sampleRate * 0.12);
    const irBuf = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = irBuf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < irLen; i++) {
        const t = i / ctx.sampleRate;
        const env = Math.exp(-t * 34.0);
        const white = (Math.random() * 2 - 1) * env;
        lp = lp * 0.55 + white * 0.45;
        data[i] = lp * 0.38;
      }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = irBuf;
    this.reverbConvolver = convolver;

    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.08;

    const dryGain = ctx.createGain();
    dryGain.gain.value = 1.0;

    master.connect(hpf);
    hpf.connect(woodResonance);
    woodResonance.connect(crispSnap);

    crispSnap.connect(dryGain);
    crispSnap.connect(convolver);
    convolver.connect(wetGain);
    dryGain.connect(comp);
    wetGain.connect(comp);
    comp.connect(ctx.destination);

    // Pre-generate 1.0s organic parchment micro-texture noise buffer
    const nLen = ctx.sampleRate;
    const nBuf = ctx.createBuffer(1, nLen, ctx.sampleRate);
    const nData = nBuf.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < nLen; i++) {
      const w = Math.random() * 2 - 1;
      prev = 0.28 * prev + 0.72 * w;
      nData[i] = prev;
    }
    this.noiseBuffer = nBuf;

    return ctx;
  }

  setTension(value) {
    const clamped = Math.max(0, Math.min(1, value));
    this.tension = clamped;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const pitchMult = 1 + clamped * 0.42;

    this.activeVoices = this.activeVoices.filter(v => v.endTime > now);
    for (const v of this.activeVoices) {
      for (const oscItem of v.oscs) {
        const targetHz = oscItem.baseFreq * pitchMult;
        try {
          oscItem.osc.frequency.setTargetAtTime(targetHz, now, 0.012);
        } catch {}
      }
    }
  }

  /**
   * Trigger a physical strike on the Damaru.
   * @param {'left'|'right'|'shell'} surface - Which drumhead or wooden shell was hit
   * @param {number} velocity - Normalized impact velocity in [0.02, 1.0]
   * @param {number} radialNorm - Normalized radial hit location r/R in [0, 1] (0 = center, 1 = rim)
   * @param {'bead'|'finger'} striker - Lac bead ('goli') vs soft finger tap
   */
  triggerStrike(surface = 'right', velocity = 0.7, radialNorm = 0.48, striker = 'bead') {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const key = surface === 'left' ? 'left' : 'right';
    if (surface !== 'shell' && now - this.lastStrikeAt[key] < 0.008) return;
    if (surface !== 'shell') this.lastStrikeAt[key] = now;

    const vel = Math.max(0.06, Math.min(1.0, velocity));
    const rNorm = Math.max(0.0, Math.min(1.0, radialNorm));

    if (surface === 'shell' || rNorm > 0.93) {
      this._playWoodRimKnock(ctx, now, vel);
      return;
    }

    // Calibrated Damaru fundamentals: 234 Hz (left) / 258 Hz (right)
    const headBaseHz = surface === 'left' ? 234 : 258;
    const microDetune = 1 + (Math.random() - 0.5) * 0.018;
    const baseF0 = headBaseHz * microDetune;
    const pitchMult = 1 + this.tension * 0.42;

    // Fast crisp membrane tension-drop scoop (+18%..+34% over 16ms)
    const nonlinearGlide = 1 + (0.14 + 0.22 * Math.pow(vel, 0.9));
    const ampScale = Math.pow(vel, 0.58) * 0.85;
    const isBead = striker === 'bead';

    const voiceBus = ctx.createGain();
    voiceBus.gain.setValueAtTime(1.0, now);

    const shaper = ctx.createWaveShaper();
    shaper.curve = this.membraneCurve;
    shaper.oversample = '2x';

    // Focused hollow hourglass cavity resonance around 469 Hz
    const cavityFilter = ctx.createBiquadFilter();
    cavityFilter.type = 'peaking';
    cavityFilter.frequency.setValueAtTime(469, now);
    cavityFilter.Q.setValueAtTime(3.2, now);
    cavityFilter.gain.setValueAtTime(6.0, now);

    voiceBus.connect(shaper);
    shaper.connect(cavityFilter);

    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(surface === 'left' ? -0.22 : 0.22, now);
      cavityFilter.connect(panner);
      panner.connect(this.masterGain);
    } else {
      cavityFilter.connect(this.masterGain);
    }

    const voiceRecord = { endTime: now + 0.14, oscs: [] };

    // 1. Goatskin + Hourglass Modal Bank
    const alpha01 = 2.4048;
    for (let i = 0; i < DAMARU_MODES.length; i++) {
      const m = DAMARU_MODES[i];
      const kR = alpha01 * m.ratio * rNorm;
      const spatialExcite = Math.abs(approxBessel(m.order, kR));

      const brightnessWeight = Math.pow(vel, 0.25 + i * 0.18) * (isBead ? 1.0 : Math.exp(-i * 0.2));
      const modeAmp = ampScale * m.baseGain * (0.32 + 0.78 * spatialExcite) * brightnessWeight;
      if (modeAmp < 0.002) continue;

      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = i <= 1 ? 'triangle' : 'sine';

      const steadyHz = baseF0 * m.ratio * pitchMult;
      const attackHz = steadyHz * (i === 0 ? nonlinearGlide : 1 + (nonlinearGlide - 1) * 0.45);

      osc.frequency.setValueAtTime(attackHz, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, steadyHz), now + 0.016);

      const dampingFactor = (1 - 0.22 * Math.pow(rNorm, 2)) * (1 - this.tension * 0.14);
      const decaySec = Math.max(0.014, m.decay * dampingFactor);

      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(modeAmp, now + (isBead ? 0.0007 : 0.0018));
      g.gain.exponentialRampToValueAtTime(0.0001, now + decaySec);

      osc.connect(g);
      g.connect(voiceBus);
      osc.start(now);
      osc.stop(now + decaySec + 0.01);

      voiceRecord.oscs.push({ osc, baseFreq: baseF0 * m.ratio });
      if (now + decaySec > voiceRecord.endTime) {
        voiceRecord.endTime = now + decaySec;
      }
    }

    // 2. Dedicated 469 Hz Hollow Wood Body Impulse + Sympathetic Opposite Head
    const cavityOsc = ctx.createOscillator();
    const cavityGain = ctx.createGain();
    cavityOsc.type = 'sine';
    cavityOsc.frequency.setValueAtTime(495, now);
    cavityOsc.frequency.exponentialRampToValueAtTime(469, now + 0.014);
    cavityGain.gain.setValueAtTime(0.0001, now);
    cavityGain.gain.linearRampToValueAtTime(ampScale * 0.55 * vel, now + 0.001);
    cavityGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.048);
    cavityOsc.connect(cavityGain);
    cavityGain.connect(voiceBus);
    cavityOsc.start(now);
    cavityOsc.stop(now + 0.055);

    // 3. Dry Crisp Goatskin + Hard Bead ('Goli') Impact Transients
    if (this.noiseBuffer) {
      const offset = Math.random() * 0.65;
      const contactDur = (isBead ? 0.012 : 0.018) * Math.pow(vel, -0.14);

      // Layer A: Woody mid punch (~470 Hz)
      const midSrc = ctx.createBufferSource();
      midSrc.buffer = this.noiseBuffer;
      const midBand = ctx.createBiquadFilter();
      midBand.type = 'bandpass';
      midBand.frequency.setValueAtTime(469 + vel * 90, now);
      midBand.Q.setValueAtTime(3.0, now);
      const midGain = ctx.createGain();
      midGain.gain.setValueAtTime(0.0001, now);
      midGain.gain.linearRampToValueAtTime(0.95 * Math.pow(vel, 0.72), now + 0.0008);
      midGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);
      midSrc.connect(midBand);
      midBand.connect(midGain);
      midGain.connect(voiceBus);
      midSrc.start(now, offset, 0.028);

      // Layer B: Dry goatskin crack (~960 - 1650 Hz)
      const snapSrc = ctx.createBufferSource();
      snapSrc.buffer = this.noiseBuffer;
      const skinBand = ctx.createBiquadFilter();
      skinBand.type = 'bandpass';
      skinBand.frequency.setValueAtTime((isBead ? 1120 : 820) + vel * 680 + rNorm * 350, now);
      skinBand.Q.setValueAtTime(isBead ? 2.1 : 1.4, now);
      const snapGain = ctx.createGain();
      snapGain.gain.setValueAtTime(0.0001, now);
      snapGain.gain.linearRampToValueAtTime((isBead ? 1.15 : 0.65) * Math.pow(vel, 0.78), now + 0.0005);
      snapGain.gain.exponentialRampToValueAtTime(0.0001, now + contactDur);
      snapSrc.connect(skinBand);
      skinBand.connect(snapGain);
      snapGain.connect(voiceBus);
      snapSrc.start(now, (offset + 0.17) % 0.85, 0.036);

      // Layer C: Hard knotted-bead / lac tick (~3.2 kHz)
      const clickSrc = ctx.createBufferSource();
      clickSrc.buffer = this.noiseBuffer;
      const clickBand = ctx.createBiquadFilter();
      clickBand.type = 'bandpass';
      clickBand.frequency.setValueAtTime((isBead ? 3200 : 1800) + vel * 1100, now);
      clickBand.Q.setValueAtTime(2.6, now);
      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(0.0001, now);
      clickGain.gain.linearRampToValueAtTime((isBead ? 0.72 : 0.22) * Math.pow(vel, 0.95), now + 0.0004);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, now + contactDur * 0.5);
      clickSrc.connect(clickBand);
      clickBand.connect(clickGain);
      clickGain.connect(voiceBus);
      clickSrc.start(now, (offset + 0.31) % 0.85, 0.022);
    }

    this.activeVoices.push(voiceRecord);
  }

  _playWoodRimKnock(ctx, now, vel) {
    const bus = ctx.createGain();
    bus.gain.value = 1.45;
    bus.connect(this.masterGain);

    for (const [freq, ratioAmp, dur] of [
      [470, 0.45, 0.038],
      [940, 0.28, 0.024],
      [1820, 0.16, 0.014]
    ]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * (0.97 + Math.random() * 0.06), now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(ratioAmp * Math.pow(vel, 0.8), now + 0.0006);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(g);
      g.connect(bus);
      osc.start(now);
      osc.stop(now + dur + 0.01);
    }

    if (this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1950 + vel * 1000;
      bp.Q.value = 2.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.58 * vel, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.012);
      src.connect(bp);
      bp.connect(g);
      g.connect(bus);
      src.start(now, Math.random() * 0.5, 0.02);
    }
  }
}
