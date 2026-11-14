// Level 5 Agent-Native Runtime: WebMCP Tool Registration + Programmatic Agent API

export function registerDamaruAgentAPI({ physics, audio, onAutoPlayChange }) {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  const api = {
    getState() {
      return {
        instrument: 'damaru',
        autoPlay: physics.autoPlay.active,
        orientationRad: {
          yaw: Number(physics.yaw.toFixed(3)),
          pitch: Number(physics.pitch.toFixed(3)),
          roll: Number(physics.roll.toFixed(3))
        },
        angularVelocityRadSec: {
          yaw: Number(physics.velYaw.toFixed(3)),
          pitch: Number(physics.velPitch.toFixed(3)),
          roll: Number(physics.velRoll.toFixed(3))
        },
        tension: Number(physics.tension.toFixed(3)),
        fundamentalHz: {
          left: Math.round(234 * (1 + physics.tension * 0.42)),
          right: Math.round(258 * (1 + physics.tension * 0.42))
        },
        totalStrikes: physics.totalStrikes,
        lastStrikeSide: physics.lastStrikeSide,
        lastStrikeVelocity: physics.lastStrikeVelocity,
        audioState: audio.ctx ? audio.ctx.state : 'uninitialized'
      };
    },

    strike({ side = 'right', velocity = 0.78, radial = 0.42 } = {}) {
      const validSide = side === 'left' || side === 'right' || side === 'shell' ? side : 'right';
      const r = Math.max(0, Math.min(1, Number(radial) || 0.42)) * 0.745;
      const angle = Math.random() * Math.PI * 2;
      physics.triggerDirectTap(
        validSide,
        Math.cos(angle) * r,
        Math.sin(angle) * r,
        Math.max(0.05, Math.min(1, Number(velocity) || 0.78))
      );
      return api.getState();
    },

    async shake({ frequencyHz = 7.5, intensity = 0.82, durationMs = 1400, tension } = {}) {
      audio.ensureContext();
      if (typeof tension === 'number') {
        api.setTension({ tension });
      }
      const dur = Math.max(150, Math.min(10000, Number(durationMs) || 1400));
      physics.triggerAutoShake({
        frequencyHz: Number(frequencyHz) || 7.5,
        intensity: Number(intensity) || 0.82,
        durationMs: dur
      });
      await sleep(dur);
      return api.getState();
    },

    setTension({ tension = 0 } = {}) {
      const clamped = Math.max(0, Math.min(1, Number(tension) || 0));
      physics.tension = clamped;
      audio.setTension(clamped);
      return api.getState();
    },

    autoPlay({ enabled } = {}) {
      const next = typeof enabled === 'boolean' ? enabled : !physics.autoPlay.active;
      if (next) audio.ensureContext();
      const active = physics.setAutoPlay(next);
      if (!active) audio.setTension(0);
      if (typeof onAutoPlayChange === 'function') onAutoPlayChange(active);
      return api.getState();
    },

    async playRhythm({ pattern = 'Dam . Dam Ta Dha . Roll .', bpm = 132, tension = 0.15 } = {}) {
      audio.ensureContext();
      api.setTension({ tension });
      const tokens = String(pattern)
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const stepMs = Math.max(80, Math.min(1200, (60 / (Number(bpm) || 132)) * 500));

      for (const raw of tokens) {
        const tok = raw.toLowerCase();
        if (tok === 'dam' || tok === 'dha') {
          api.strike({ side: 'left', velocity: 0.86, radial: 0.32 });
        } else if (tok === 'du' || tok === 'ge') {
          api.strike({ side: 'right', velocity: 0.78, radial: 0.36 });
        } else if (tok === 'ta' || tok === 'na') {
          api.strike({ side: 'right', velocity: 0.82, radial: 0.82 });
        } else if (tok === 'ka' || tok === 'rim') {
          api.strike({ side: 'shell', velocity: 0.65, radial: 1.0 });
        } else if (tok === 'roll' || tok === 'trkt') {
          physics.triggerAutoShake({ frequencyHz: 8.8, intensity: 0.88, durationMs: stepMs * 1.85 });
        }
        await sleep(stepMs);
      }
      return api.getState();
    }
  };

  if (typeof window !== 'undefined') {
    window.damaruAgent = api;
  }

  // Register WebMCP tools if supported by agentic browser runtime
  if (typeof navigator !== 'undefined' && navigator.modelContext && typeof navigator.modelContext.registerTool === 'function') {
    const tools = [
      {
        name: 'get_damaru_state',
        description: 'Inspect current 3D Damaru orientation, angular velocity, waist-cord tension, fundamental pitch (Hz), and strike counters.',
        parameters: { type: 'object', properties: {} },
        handler: async () => api.getState()
      },
      {
        name: 'strike_damaru',
        description: 'Directly tap left/right goatskin drumhead or wooden shell with velocity-matched physical modeling and 3D Bessel membrane ripple.',
        parameters: {
          type: 'object',
          properties: {
            side: { type: 'string', enum: ['left', 'right', 'shell'], description: 'Target surface' },
            velocity: { type: 'number', description: 'Impact velocity from 0.05 to 1.0' },
            radial: { type: 'number', description: 'Radial strike position from 0.0 (center) to 1.0 (rim)' }
          }
        },
        handler: async args => api.strike(args)
      },
      {
        name: 'shake_damaru',
        description: 'Physically oscillate the 3D Damaru around its waist so both braided striker cords and lac beads whip onto both drumheads.',
        parameters: {
          type: 'object',
          properties: {
            frequencyHz: { type: 'number', description: 'Wrist twist frequency in Hz (2.5 to 13)' },
            intensity: { type: 'number', description: 'Angular amplitude intensity (0.15 to 1.0)' },
            durationMs: { type: 'number', description: 'Duration in milliseconds (150 to 10000)' },
            tension: { type: 'number', description: 'Optional waist-cord squeeze tension (0.0 to 1.0)' }
          }
        },
        handler: async args => api.shake(args)
      },
      {
        name: 'set_damaru_tension',
        description: 'Squeeze or release the V-laced cotton waist cords to bend the drumhead pitch up by up to +5.3 semitones.',
        parameters: {
          type: 'object',
          properties: {
            tension: { type: 'number', description: 'Cord squeeze tension in [0.0, 1.0]' }
          },
          required: ['tension']
        },
        handler: async args => api.setTension(args)
      },
      {
        name: 'play_damaru_rhythm',
        description: 'Perform a rhythmic bol sequence (tokens: Dam, Dha, Du, Ta, Na, Rim, Roll, .) at a target BPM.',
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Space-separated bol tokens, e.g. "Dam . Dam Ta Roll ."' },
            bpm: { type: 'number', description: 'Tempo in beats per minute' },
            tension: { type: 'number', description: 'Waist tension [0.0, 1.0]' }
          },
          required: ['pattern']
        },
        handler: async args => api.playRhythm(args)
      },
      {
        name: 'toggle_damaru_autoplay',
        description: 'Start or stop continuous expressive Damaru auto-play with dynamic wrist tempo swells and waist-cord pitch-bend phrasing.',
        parameters: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', description: 'Set true to start or false to stop; omit to toggle' }
          }
        },
        handler: async args => api.autoPlay(args)
      }
    ];

    for (const t of tools) {
      try {
        navigator.modelContext.registerTool(t);
      } catch {}
    }
  }

  return api;
}
