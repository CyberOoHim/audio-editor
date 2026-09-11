# Agent Rules: iPad Power & Thermals

Always prioritize battery conservation and prevent thermal throttling on iPad (passively cooled, battery-powered).

1. **AudioContext**: Suspend promptly when idle, paused, or stopped to power down the DAC. Never wake on non-playback actions. Suspend on `document.hidden`.
2. **Visualizers & Canvas**: Cap active meters to 20–30 FPS (no 60/120 Hz ProMotion loops). Stop RAF when hidden/paused. Cap canvas DPR to 1.25.
3. **DSP**: Keep live audio processing on native Web Audio nodes (Accelerate/vDSP). Do not offload real-time audio to WebGPU compute.
4. **Memory & Renders**: Chunk offline renders and yield to the event loop to avoid Jetsam memory kills and tab watchdog timeouts.

## CI/CD Guidelines
- **Commit `package-lock.json`**: Always maintain and commit an up-to-date `package-lock.json` alongside `package.json`.
- **Node Version**: Always set `node-version: 22` in GitHub Actions.
