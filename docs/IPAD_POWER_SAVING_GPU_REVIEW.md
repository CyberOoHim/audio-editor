# Review: iPad Power Saving and Whether GPU Helps

**Date:** 2026-09-11
**Scope:** Current power/idle/RAF/DSP paths in the editor, plus whether iPad GPU (Metal via Canvas 2D, WebGL, WebGPU) would actually save energy.
**Related:** `docs/IPAD_GPU_ACCELERATION_PLAN.md` (aspirational GPU roadmap; this review is the evidence-based counterweight).

## Summary

The app already has a real iPad power story: AudioContext idle-suspend, RAF throttling, layered waveform canvases, small FFTs, chunked OfflineAudioContext, and Jetsam-aware memory budgets. Those measures are aimed at the right costs (DAC awake, main-thread work, tab watchdog). GPU can help a **narrow** set of drawing and batch-scan jobs, but it will **not** make real-time Web Audio cheaper, and chasing 120 FPS visualizers would make battery worse, not better.

On Apple Silicon, Web Audio already runs native DSP (Accelerate / vDSP, often AMX-backed for convolution and biquads). Moving that graph onto WebGPU compute adds GPU wakeup, shader dispatch, and extra copies for streaming buffers that are too small to amortize. Canvas 2D in WebKit is already Metal-backed; a 140×28 bar graph does not need a shader pipeline.

**Verdict:** Keep CPU/Web Audio for DSP. Use GPU only for large parallel *visual* work (spectrogram, maybe a future dense waveform) and only at 15–30 FPS. Do not implement the 120 FPS / “zero CPU” milestones in the existing GPU plan if battery is a goal. The highest-ROI power wins are still in the existing JS/audio graph: unused analyser, ScriptProcessor recording, `getContext()` auto-resume, and RAF loops that keep spinning while idle.

---

## What already helps on iPad

| Mechanism | Where | Why it matters |
| :--- | :--- | :--- |
| Idle AudioContext suspend after 20s | `AudioEngine.ts` | Puts the DAC / audio I/O to sleep when not playing |
| Playback ticker skips work when `document.hidden`; 35 FPS → 12 FPS after 15s idle | `AudioEngine.startProgressTicker` | Avoids playhead React/canvas work in background and during hands-off listen |
| Waveform + minimap split into static base + overlay | `WaveformCanvas.tsx`, `MiniMap.tsx` | Playhead ticks do not rescan PCM |
| Peak pyramid + 2px column step | `BufferUtils.getDecimatedPeaks`, waveform draw | Avoids per-sample scans at overview zoom |
| DPR cap 1.25 | waveform, minimap, live visualizer, ruler | Caps backing-store fill rate on 2x/3x iPads |
| Preview analyser `fftSize = 64`; RAF only while auditioning; suspend + close on stop/close | `VoiceChangerEngine.ts`, `VoiceChangerModal.tsx` | Small FFT, no idle visualizer loop |
| Live visualizer 30 FPS + skip draws when hidden | `LiveVisualizer.tsx` | Caps recording UI cost |
| Chunked offline render + yield-to-main | `offlineRender.ts`, `memoryBudget.ts` | Avoids Jetsam and the page watchdog (stability first; also avoids thermal spikes) |
| Encoder worker + WebCodecs AAC | `workerClient.ts`, `WebCodecsEncoder.ts` | Encoding off main thread; AAC uses the media engine, not GPU compute |
| Scaled undo + single-file preview cache | `HistoryManager.ts`, `FileList.tsx` | Memory pressure is the usual iPad crash; extra copies also cost energy to allocate/zero |

These are the correct levers. GPU is not missing from this list because the team forgot it; it is missing because most of the energy here is **audio hardware + main-thread JS**, not fill-rate.

---

## Issues

### Issue 1 -- Severity: bug
- File: `src/audio/AudioEngine.ts:95`
- Description: Playback always routes `gainNode → analyserNode → destination` with `fftSize = 256`. `getAnalyser()` is never called by any editor UI. AnalyserNode still computes a time-domain/FFT window every audio quantum for the entire play session.
- Suggestion: Connect `gainNode` directly to `destination`. Create and insert an analyser only if a visualizer actually subscribes. Disconnect it when unused.
- Status: open

### Issue 2 -- Severity: bug
- File: `src/audio/AudioEngine.ts:102`
- Description: `getContext()` always calls `this.ctx.resume()` when the context is suspended, then resets the 20s idle timer. Any incidental caller (volume, file-list preview, decode, `setVolume`) wakes the DAC and undoes idle suspend. The idle-sleep path at line 72 is therefore easy to defeat.
- Suggestion: Split “ensure context exists” from “ensure context is running”. Resume only on play / record / explicit audition. Do not resume from `setVolume` or from decode-only paths.
- Status: open

### Issue 3 -- Severity: suggestion
- File: `src/audio/AudioEngine.ts:68`
- Description: Idle suspend waits 20 seconds, and `visibilitychange` never suspends the context. When the tab is backgrounded while paused, the DAC can stay up for the full timeout. iOS/iPadOS Safari already treats AudioContext as expensive; Apple’s own guidance is to suspend as soon as audio is not needed.
- Suggestion: Suspend immediately on `pause`/`stop` (or after ~1s to cover seek/restart). On `visibilitychange` to hidden, suspend unless `playState === 'playing'` (and even then, consider pausing the ticker fully rather than spinning RAF). Resume on the next user play gesture.
- Status: open

### Issue 4 -- Severity: suggestion
- File: `src/audio/Recorder.ts:116`
- Description: Capture uses deprecated `ScriptProcessorNode` (4096, 2, 2) on the **main thread**, copies every chunk, scans the right channel for silence, and **connects the processor to `destination`**. That last connection is required for ScriptProcessor to fire, so live mic audio is also played out — extra DAC load, possible speaker feedback on iPad, and a JS callback ~11 times/sec for the whole take. Dual analysers at `fftSize = 512` plus a 30 FPS metrics RAF sit on top of that.
- Suggestion: Replace with `AudioWorklet` (or `MediaRecorder` + decode if quality allows) so capture is off the main thread. Do not tap destination unless the user enables monitor. Keep analysers only while the visualizer is visible. Pause the metrics RAF while recording is paused.
- Status: open

### Issue 5 -- Severity: suggestion
- File: `src/components/file-manager/FileList.tsx:150`
- Description: Library preview progress calls `setPlaybackProgress` on every animation frame (~60/120 Hz). That is a React re-render per frame for a CSS width bar, and it also keeps `AudioEngine.getContext()` running (Issue 2).
- Suggestion: Throttle to 10–15 FPS, or drive the bar from a CSS transform / `element.animate` without React state. Stop the ticker if `document.hidden`.
- Status: open

### Issue 6 -- Severity: suggestion
- File: `src/components/modals/VoiceChangerModal.tsx:170`
- Description: The audition spectrum runs unthrottled RAF (display refresh: 60 or 120 Hz on ProMotion). Every bar rebuilds a linear gradient. `transform: translateZ(0)` on a 140×28 canvas forces a compositor layer that does not save energy at this size; it can increase GPU residency. There is no `document.hidden` guard.
- Suggestion: Cap at 20–30 FPS, reuse one gradient, skip RAF when hidden or idle (already stops on `isPreviewPlaying()`, which is good). Drop `translateZ(0)`. Prefer `getContext('2d', { alpha: false })`.
- Status: open

### Issue 7 -- Severity: suggestion
- File: `src/components/recorder/LiveVisualizer.tsx:45`
- Description: RAF is rescheduled even when `document.hidden` is true (draw is skipped, callback is not). Safari usually pauses RAF in the background, so this is mostly harmless, but the loop still runs at 30 FPS whenever the record modal is open and an analyser exists — including while recording is paused.
- Suggestion: Cancel RAF on hidden / pause; restart on visible / resume. Pass `alpha: false`.
- Status: open

### Issue 8 -- Severity: suggestion
- File: `src/components/recorder/VuMeter.tsx:37`
- Description: Peak bars use `transition: width 0.05s` on a 30 Hz metrics stream. That is layout + paint + compositor animation on every tick, on top of the canvas visualizer.
- Suggestion: Drive width without CSS transition, or use `transform: scaleX` on a GPU layer if a meter is kept. One visualizer (canvas **or** CSS meter) is enough during record.
- Status: open

### Issue 9 -- Severity: nit
- File: `src/audio/VoiceChangerEngine.ts:547`
- Description: Comment claims the offline render “Leverages Apple AMX / hardware DSP on iPad”. OfflineAudioContext *does* use WebKit’s native nodes (Accelerate). The comment oversells a default; it is not an AMX-specific path you own.
- Suggestion: Shorten to why chunked OfflineAudioContext is used (Jetsam / watchdog), not which Apple silicon block might run it.
- Status: open

### Issue 10 -- Severity: suggestion
- File: `docs/IPAD_GPU_ACCELERATION_PLAN.md:37`
- Description: The plan targets “120 FPS visual feedback with ~0% CPU load” and GPU convolution / neural stem separation as iPad wins. On battery, 120 Hz ProMotion + a persistent GPU context is one of the most expensive things an iPad can do. Neural models (Demucs-class) will heat and Jetsam long before they save power. GPU convolution of typical IRs is unlikely to beat `ConvolverNode`.
- Suggestion: Treat that document as a capability roadmap, not a power roadmap. If battery is in scope, cap visualizers at 30 FPS (12 FPS idle) and keep DSP on Web Audio.
- Status: open

---

## Can the iPad GPU help?

Short answer: **yes for some drawing and huge reductions; no for the live audio graph; no if the goal is battery.**

### How iPad actually burns energy in this app

Rough order, high to low, for a typical session (load a file, play, edit, export):

1. **Audio I/O remaining `running`** — DAC, sample clock, mic (record). Dominates idle-with-editor-open.
2. **Main-thread ScriptProcessor + live monitor during record.**
3. **RAF + 2D canvas + React state** at display refresh (playhead, visualizers, file-list progress).
4. **Offline DSP and encode bursts** — Web Audio nodes + workers + WebCodecs. Short, thermal, then idle.
5. **Memory traffic** — copies, undo, peak pyramid. Energy via DRAM and Jetsam risk.

GPU compute does not sit on that list unless you add a spectrogram, a 120 FPS shader visualizer, or an on-device neural model.

### What is already on the GPU (without WebGL/WebGPU)

WebKit Canvas 2D and CSS compositing are Metal-backed. `WaveformCanvas` / `MiniMap` already:

- Draw with batched `rect()` paths (one fill per channel).
- Cap DPR at 1.25.
- Avoid redrawing the PCM layer on every playhead tick.

So the waveform is **already a GPU blit of a CPU-built path**. Promoting it to WebGL does not automatically save power; it adds a GL/WebGPU context (which iPadOS is reluctant to idle) and usually more VRAM.

`translateZ(0)` is the same idea at CSS level. It helps when you have a large layer that would otherwise be repainted with the page. It does not help a 140×28 spectrum.

### Where GPU *would* help (capability / jank, mixed power)

| Workload | GPU fit | Power effect | Notes |
| :--- | :--- | :--- | :--- |
| Spectrogram / STFT heatmap | **Strong** | Neutral to worse at 60–120 FPS; OK at 15–30 FPS if CPU STFT is the bottleneck | Fragment shader for colormap; keep FFT on CPU/vDSP or one compute pass per hop, not per frame |
| Dense waveform at high zoom on a large display | Moderate | Small win if CPU path-building is hot | WebGL line/SDF or compute-to-texture. Current 2px-step 2D path is already cheap at overview |
| Peak pyramid over tens of millions of samples | Moderate (WebGPU compute, iPadOS 26+) | Burst cost, then idle | A Worker + scalar/SIMD scan is simpler and likely similar joules. GPU wins when you would otherwise hitch the UI |
| `OffscreenCanvas` waveform in a worker | Threading, not GPU | Helps **jank**, not watts | Same Metal 2D work, different thread. Safari 2D OffscreenCanvas support still needs a feature check |
| Live bar / oscilloscope visualizers | **Weak** | Often **worse** | Tiny canvases, few vertices. 2D + 30 FPS cap is the power-efficient choice |
| Real-time Biquad / Convolver / Compressor / Analyser | **Poor** | **Worse** | Web Audio already uses Accelerate. Streaming 128–256 sample blocks cannot hide GPU dispatch latency or wakeup |
| Long IR convolution (cathedral-length) | Weak for live; maybe for offline batch | Unclear | `ConvolverNode` is the native path. GPU FFT convolution is a research project, not a battery win |
| Neural stem sep / denoise (ONNX + WebGPU) | Strong **capability** | **Bad for battery and Jetsam** | Do this as an explicit opt-in “use plugged-in iPad Pro” feature, never as a default power optimization |
| AAC/Opus encode | None | N/A | WebCodecs already hits the media engine. Do not batch encode on WebGPU |

WebGPU compute shaders shipped **by default in Safari 26 / iPadOS 26** (September 2025). Older iPads on iPadOS 18/17 have no WebGPU. Any GPU-compute path must feature-detect `navigator.gpu` and fall back. WebGL 2.0 is the realistic baseline for drawing on the installed base.

### Unified memory does not make GPU-DSP free

UMA removes a PCIe copy, not the cost of turning the GPU on, filling caches, and running a compute grid. Audio callbacks are small and periodic. GPUs want large, infrequent dispatches. That mismatch is why native DAWs on Apple silicon still run the mixer on CPU SIMD and keep Metal for meters, spectrograms, and video — not for the biquad.

### Power rules if you do add GPU drawing

1. **One shared context**, created lazily, destroyed when the last canvas unmounts. Do not leak textures (Safari will keep the GPU from sleeping).
2. **Never vsync-lock visualizers to ProMotion 120 Hz.** Cap at 30 FPS active, 12 FPS idle, 0 FPS when paused/hidden/`document.hidden`.
3. **Do not mix 2D canvas RAF and a WebGPU swapchain** on the same view.
4. **Prefer `alpha: false`** (and `desynchronized: true` where Safari honors it) for 2D.
5. **Feature-detect** WebGPU; WebGL 2 for spectrogram if you need older iPadOS; 2D fallback otherwise.
6. **Do not** put the live playback graph on GPU compute.

---

## Recommended order of work (battery first)

1. Bypass unused `AnalyserNode` on the playback graph (Issue 1).
2. Stop auto-resuming AudioContext in `getContext()`; suspend on pause/stop and on hidden-while-idle (Issues 2–3).
3. Replace `ScriptProcessorNode` capture; optional monitor tap (Issue 4).
4. Throttle FileList / voice-changer / live-visualizer RAF; drop cargo-cult `translateZ(0)` (Issues 5–7).
5. Only then consider a **GPU spectrogram** as a new feature, 15–30 FPS, WebGL 2 with WebGPU optional, 2D fallback.
6. Defer WebGPU peak-pyramid and neural audio until there is a measured CPU hotspot and a plugged-in / iPad Pro opt-in.

---

## Issue counts

- bugs: 2
- suggestions: 7
- nits: 1

GPU bottom line: **it can help drawing-heavy views; it cannot replace Web Audio for power-efficient DSP on iPad; 120 FPS GPU visualizers would work against the power-saving work already in the tree.**
