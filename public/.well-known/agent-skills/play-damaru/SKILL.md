---
name: play-damaru
description: Play, shake, pitch-bend, and perform Indian percussion rhythms on the interactive 3D Damaru via WebMCP or window.damaruAgent.
---

# Play Damaru Skill

## Usage in Browser / WebMCP Runtime

```js
// 1. Trigger a realistic 8.2 Hz wrist-shake roll with waist pitch bend
await window.damaruAgent.shake({
  frequencyHz: 8.2,
  intensity: 0.88,
  durationMs: 1600,
  tension: 0.25
});

// 2. Perform a structured bol pattern
await window.damaruAgent.playRhythm({
  pattern: 'Dam . Du Ta Dha . Roll .',
  bpm: 144,
  tension: 0.2
});

// 3. Read acoustic & physics telemetry
console.log(window.damaruAgent.getState());
```
