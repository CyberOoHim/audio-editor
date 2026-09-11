# iPad GPU Acceleration & Optimization Plan

This document outlines architectural strategies, technical pathways, and implementation plans for leveraging the iPad GPU (Apple Silicon M-series and A-series with Unified Memory Architecture) in the Web Audio Studio.

---

## 1. Executive Summary & Apple Silicon Advantages

iPad devices (iPad Pro, iPad Air, iPad mini, and standard iPad) powered by Apple Silicon (M1/M2/M4 and A-series SoCs) feature:
* **Unified Memory Architecture (UMA)**: The CPU, GPU, and Neural Engine share the same high-bandwidth physical memory pool. This eliminates traditional PCIe transfer bottlenecks when moving multi-megabyte audio sample buffers between CPU and GPU.
* **Metal-Backed WebKit Engine**: All Safari/WebKit graphics (2D Canvas, WebGL 2.0, WebGPU, and CSS Compositor) execute directly on top of Apple's Metal graphics API.
* **120Hz ProMotion Displays**: Capable of silky-smooth rendering at 120 FPS if CPU overhead and main-thread blocking are kept to a minimum.
* **Apple Media Engine & vDSP/Accelerate**: Hardware blocks dedicated to media encoding/decoding and SIMD vector operations.

---

## 2. Strategic GPU Acceleration Opportunities

### Milestone 1: GPU-Accelerated Spectrogram & Spectral View
* **Objective**: Provide a real-time and static frequency-domain spectrogram / waterfall heat-map display.
* **Technology**: WebGL 2.0 / WebGPU Fragment & Compute Shaders.
* **Architecture**:
  * Compute STFT (Short-Time Fourier Transform) slices with windowing functions (Hann / Blackman-Harris).
  * Upload raw FFT bins into dynamic 2D GPU textures or storage buffers.
  * Render logarithmic frequency-to-pixel mappings with perceptual color heatmaps (*Magma*, *Viridis*, *Plasma*, or *Inferno*) calculated in parallel across GPU execution units.
* **Performance Gain**: Instant rendering of millions of spectral points without degrading CPU audio playback threads.

---

### Milestone 2: WebGL Shader-Based Real-Time Visualizers
* **Objective**: Transform playback and recording visualization into responsive, studio-grade visualizer modes.
* **Modes**:
  1. **Analog Phosphor Oscilloscope**: Electron beam simulation with phosphor decay persistence, bloom glow, and variable intensity.
  2. **3D Spectral Waterfall / Ribbon**: Real-time 3D frequency landscape with dynamic vertex displacement.
  3. **Circular / Radial Flux Meter**: Reactive phase correlation and stereo field lissajous vectorscope.
* **Technology**: GLSL Fragment & Vertex Shaders via WebGL 2.0.
* **Performance Gain**: Zero CPU load during high-frame-rate rendering at native 120 FPS.

---

### Milestone 3: Off-Main-Thread Waveform Rendering (`OffscreenCanvas` & Workers)
* **Objective**: Guarantee zero frame drops during complex zoom, scroll, and scrub operations on multi-hour recordings.
* **Technology**: `OffscreenCanvas` + Web Worker + Metal 2D Canvas context.
* **Architecture**:
  * Transfer canvas control to a dedicated background Web Worker via `canvas.transferControlToOffscreen()`.
  * Multi-resolution peak pyramids (decimated mipmaps) are stored and traversed in worker memory.
  * Waveform rasterization occurs completely off the main JavaScript thread, leaving the main thread 100% free to handle multi-touch touch gestures, Apple Pencil input, and 120Hz ProMotion UI transitions.

---

### Milestone 4: On-Device Neural Audio Processing (WebGPU / WebNN)
* **Objective**: Enable zero-latency, private, client-side AI audio manipulation without external servers.
* **Use Cases**:
  * **Vocal & Stem Separation**: Demucs / Spleeter 2-stem and 4-stem extraction.
  * **Neural Noise Suppression**: Real-time background noise removal (DeepFilterNet / RNNoise).
* **Technology**: ONNX Runtime Web with WebGPU execution provider or the WebNN API in WebKit.
* **Performance Gain**: Leverages Apple Silicon GPU cores and Apple Neural Engine (ANE) with zero cloud latency.

---

### Milestone 5: WebGPU Compute for Massive Batch Operations
* **Objective**: Instantaneous processing of large audio datasets (1+ hour tracks, multi-gigabyte audio files).
* **Workloads**:
  1. **Ultra-Fast Peak Pyramid Precomputation**: Scan 50M+ samples and build hierarchical zoom levels in under 10 milliseconds using parallel reduction compute shaders.
  2. **Long Impulse Response (IR) Convolution**: Partitioned GPU FFT convolution for multi-second acoustic spaces (large cathedrals, stadiums, complex cabinet simulations).
  3. **High-Fidelity Phase Vocoder / Granular Resynthesis**: Parallel grain overlap-add for pitch-shifting and time-stretching with minimal phase artifacts.

---

## 3. Current vs. Target Architecture Matrix

| Domain | Current State | Target GPU-Accelerated State | Impact on iPad |
| :--- | :--- | :--- | :--- |
| **Waveform Canvas** | 2D Canvas on Main Thread | `OffscreenCanvas` in Web Worker | Eliminates UI lag during rapid pinch-to-zoom |
| **Spectral Analysis** | None (Waveform only) | WebGL 2.0 / WebGPU Spectrogram | Real-time visual frequency editing |
| **Live Visualizer** | 2D Canvas Line Plot | GLSL Phosphor & Vectorscope Shaders | 120 FPS visual feedback with ~0% CPU load |
| **Audio Encoding** | WebCodecs Hardware AAC | WebCodecs + WebGPU Batching | Maximum hardware throughput |
| **AI Audio Tools** | None | ONNX Runtime Web via WebGPU | 100% offline, local neural audio editing |

---

## 4. Implementation Guidelines & Best Practices

1. **Feature Detection & Progressive Enhancement**:
   * Always check for `navigator.gpu` (WebGPU) and `HTMLCanvasElement.prototype.transferControlToOffscreen`.
   * Gracefully fall back to WebGL 2.0 and standard 2D Canvas when running on older browsers.
2. **Memory Management**:
   * Destroy GPU textures, buffers, and shader programs upon component unmounting to avoid VRAM leaks in mobile Safari.
3. **Power & Battery Efficiency**:
   * Pause visualizer requestAnimationFrame loops when playback is idle or when the tab is backgrounded.
