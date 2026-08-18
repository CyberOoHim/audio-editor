# AudioCraft Studio 🎵

> A modern, browser-based digital audio editor and indexed audio file manager built with React, TypeScript, Web Audio API, and IndexedDB.

![AudioCraft Studio](./src/assets/hero.png)

## ✨ Features

### 🎛️ Audio Editor & Waveform Canvas
- **High-Performance Waveform Rendering**: Interactive canvas with stereo/mono channel support, zoom controls (up to 32x), mini-map navigation, and millisecond-accurate time ruler.
- **Editing Tools**: Selection tool, Cut, Copy, Paste, Delete, Trim to Selection, Insert Silence, and Gain Adjustment.
- **Multi-level Undo / Redo**: Complete history tracking with visual state indicators.
- **Transport Controls**: Play, pause, loop playback, stop, skip to start/end, and scrub with real-time playback position cursor.

### 🎚️ Real-Time DSP Audio Effects
- **Equalizer**: 3-Band Parametric EQ (Low, Mid, High).
- **Dynamics & Spatial**: Reverb, Delay, Compressor, Distortion, Pitch Shift, and Stereo Panning.
- **Fade Tools**: Fade-in and Fade-out curve processing.
- **Master Effects Rack**: Live preview toggle with instant bypass & parameter tweaking.

### 🎙️ Live Audio Recorder
- **Multi-source Recording**: High-fidelity microphone input capture using Web Audio API.
- **Live Visualizers**: Real-time frequency spectrum visualizer and dual-channel peak VU meter.
- **Direct-to-Editor**: Save recordings directly into your library or load straight onto the editor canvas.

### 📁 Audio File Manager & Library
- **IndexedDB Persistent Storage**: Store multiple audio projects, tracks, and recordings directly in your browser.
- **Folder Organization**: Create, rename, delete folders, and organize tracks hierarchically.
- **Tagging & Search**: Filter by tags, search by name, sort by date/size/duration.
- **Storage Quota Meter**: Real-time browser storage quota visualization.

### 💾 Multi-Format Audio Export
- **Formats**: WAV (16-bit / 24-bit / 32-bit float), MP3 (VBR / CBR via Lamejs), and FLAC (lossless).
- **Export Options**: Export entire project or only the selected region.
- **Custom Sample Rates & Channels**: 44.1kHz, 48kHz, 96kHz / Stereo or Mono.

### 📱 Progressive Web App (PWA)
- **Offline Capable**: Fully functional offline with Service Worker caching.
- **Installable**: Install as a desktop or mobile application.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| <kbd>Space</kbd> | Play / Pause |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | Undo |
| <kbd>Ctrl</kbd> + <kbd>Y</kbd> / <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> | Redo |
| <kbd>Ctrl</kbd> + <kbd>X</kbd> | Cut Selection |
| <kbd>Ctrl</kbd> + <kbd>C</kbd> | Copy Selection |
| <kbd>Ctrl</kbd> + <kbd>V</kbd> | Paste from Clipboard |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd> | Delete Selection |
| <kbd>Ctrl</kbd> + <kbd>A</kbd> | Select All |
| <kbd>Ctrl</kbd> + <kbd>T</kbd> | Trim to Selection |
| <kbd>Ctrl</kbd> + <kbd>E</kbd> | Open Export Modal |
| <kbd>Ctrl</kbd> + <kbd>R</kbd> | Open Recorder Modal |
| <kbd>+</kbd> / <kbd>-</kbd> | Zoom In / Out |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/CyberOoHim/audio-editor.git
cd audio-editor

# Install dependencies
npm install

# Start local development server
npm run dev
```

### Production Build

```bash
# Build optimized production bundle
npm run build

# Preview production build locally
npm run preview
```

---

## 🛠️ Tech Stack

- **Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vite.dev/)
- **Audio Processing**: Web Audio API, Canvas 2D Rendering
- **Audio Encoders**: `lamejs` (MP3), `libflacjs` (FLAC), Custom PCM WAV encoder
- **Database**: IndexedDB (`idb`)
- **Styling**: Vanilla CSS Design System with dark studio theme

---

## 📄 License

MIT
