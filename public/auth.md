# Authentication & Agent Access

Damaru is a 100% public, zero-authentication client-side 3D acoustic instrument.

- **Authentication Required**: None (`public` / anonymous access).
- **Rate Limits**: Local WebGL + WebAudio execution in browser; zero server roundtrips per strike.
- **Runtime Control**: Use WebMCP (`navigator.modelContext`) or `window.damaruAgent` in any headless or headed browser agent.
