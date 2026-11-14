# damaru

Play a physically simulated 3D hourglass drum in the browser — click, drag, and shake at any speed to drive real-time cord physics and Bessel-mode WebAudio synthesis.

```bash
npm install
npm run dev
```

## Quick start

```js
// Inspect live physics & tuning
const state = window.damaruAgent.getState();

// Squeeze the V-laced cotton waist cords (+5.3 semitone pitch bend)
window.damaruAgent.setTension({ tension: 0.65 });

// Oscillate the wrist at 8.4 Hz so both lac beads whip onto the goatskin heads
await window.damaruAgent.shake({
  frequencyHz: 8.4,
  intensity: 0.88,
  durationMs: 1600
});
```

`getState()` reads orientation, cord tension, fundamental Hz, and strike velocity. `setTension()` bends both drumheads in real time. `shake()` drives the 360 Hz XPBD cord solver.

## Direct strikes & bol rhythms

```js
// Velocity-sensitive strike on left head, right head, or wooden shell
window.damaruAgent.strike({ side: 'left', velocity: 0.85, radial: 0.35 });

// Play a rhythmic bol phrase
await window.damaruAgent.playRhythm({
  pattern: 'Dam . Dam Ta Dha . Roll .',
  bpm: 138,
  tension: 0.25
});
```

`strike()` excites 7 circular-membrane Bessel modes weighted by radial hit position $J_n(\alpha_{nm} r/R)$ and deforms the 3D goatskin mesh on impact. `playRhythm()` sequences strokes and wrist rolls at any tempo.

## Controls

- Drag and shake horizontally or diagonally across the drum to whip both braided striker cords; strike rate, brightness, and loudness track gesture speed
- Click or tap either goatskin head or the rosewood rim for direct finger strokes
- Scroll wheel or two-finger pinch squeezes the waist lacing to bend pitch upward
- Shake your phone on mobile (`DeviceMotionEvent`) or press `Space`, `F`, `J`, `←`, `→`, `R`, and `?` on desktop

## Agent & WebMCP discovery

```bash
curl -H "Accept: text/markdown" https://damaru.h3manth.com/
```

Ships with `llms.txt`, `.well-known/api-catalog` (RFC 9727), `.well-known/agent-card.json` (A2A), `.well-known/mcp/server-card.json`, `.well-known/agent-skills/index.json`, and in-page `navigator.modelContext` WebMCP tool registration.

## Build

```bash
npm run build
```

Outputs a static bundle in `dist/` with Cloudflare Pages Markdown negotiation in `functions/_middleware.js`.

## License

MIT © [Hemanth.HM](https://h3manth.com)
