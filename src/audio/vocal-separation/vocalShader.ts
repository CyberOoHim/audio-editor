/**
 * WebGPU WGSL Compute Shader for Parallel On-Device Vocal & Instrumental Stem Separation
 * Runs natively on Apple Silicon GPU via Metal backend in iPadOS Safari / WebKit.
 */

export const VOCAL_SEPARATION_WGSL = /* wgsl */ `
struct ShaderParams {
  sampleRate: f32,
  fftSize: u32,
  hopSize: u32,
  numFrames: u32,
  vocalSensitivity: f32,
  stereoCenterWeight: f32,
  debleedStrength: f32,
  vocalRangeMinHz: f32,
  vocalRangeMaxHz: f32,
  vocalBalance: f32, // 0 = music only, 1 = vocal only
  isStereo: u32,
  pad: u32,
};

@group(0) @binding(0) var<uniform> params: ShaderParams;
// Interleaved or flat stereo/mono input PCM buffer
@group(0) @binding(1) var<storage, read> inputAudioL: array<f32>;
@group(0) @binding(2) var<storage, read> inputAudioR: array<f32>;
// Output separated Vocal PCM buffers
@group(0) @binding(3) var<storage, read_write> outputVocalL: array<f32>;
@group(0) @binding(4) var<storage, read_write> outputVocalR: array<f32>;
// Normalization energy accumulator
@group(0) @binding(5) var<storage, read_write> windowAccum: array<f32>;

const PI: f32 = 3.141592653589793;

// Hann Window calculation
fn hannWindow(n: u32, N: u32) -> f32 {
  return 0.5 * (1.0 - cos((2.0 * PI * f32(n)) / f32(N)));
}

// Frequency in Hz for bin index k
fn binToFreq(k: u32, fftSize: u32, sampleRate: f32) -> f32 {
  return (f32(k) * sampleRate) / f32(fftSize);
}

// Compute vocal formant probability weight for frequency f
fn computeVocalWeight(f: f32, minHz: f32, maxHz: f32) -> f32 {
  if (f < minHz * 0.7 || f > maxHz * 1.5) {
    return 0.05;
  }
  // Peak sensitivity in primary human voice formant region (250Hz - 3400Hz)
  var weight: f32 = 1.0;
  if (f < minHz) {
    weight = smoothstep(minHz * 0.7, minHz, f);
  } else if (f > maxHz) {
    weight = 1.0 - smoothstep(maxHz, maxHz * 1.5, f);
  }
  
  // Center vocal boost curve around speech clarity 1.2 kHz - 2.8 kHz
  let formantCenter: f32 = 1800.0;
  let formantWidth: f32 = 1200.0;
  let dist: f32 = abs(f - formantCenter) / formantWidth;
  let formantBoost: f32 = 1.0 + 0.35 * exp(-dist * dist);
  
  return clamp(weight * formantBoost, 0.0, 1.35);
}

@compute @workgroup_size(64)
fn processSeparationFrame(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let frameIdx = global_id.x;
  if (frameIdx >= params.numFrames) {
    return;
  }

  let fftSize = params.fftSize;
  let hopSize = params.hopSize;
  let startSample = frameIdx * hopSize;
  let halfFft = fftSize / 2u;

  // Process frequency bins for this frame
  for (var k: u32 = 0u; k < halfFft; k = k + 1u) {
    let freq = binToFreq(k, fftSize, params.sampleRate);
    let vocalFreqWeight = computeVocalWeight(freq, params.vocalRangeMinHz, params.vocalRangeMaxHz);

    // Compute DFT terms for this bin
    var realL: f32 = 0.0;
    var imagL: f32 = 0.0;
    var realR: f32 = 0.0;
    var imagR: f32 = 0.0;

    for (var n: u32 = 0u; n < fftSize; n = n + 1u) {
      let sampleIdx = startSample + n;
      let w = hannWindow(n, fftSize);
      let inL = inputAudioL[sampleIdx] * w;
      let inR = select(inL, inputAudioR[sampleIdx] * w, params.isStereo == 1u);

      let angle = (2.0 * PI * f32(k * n)) / f32(fftSize);
      let cosVal = cos(angle);
      let sinVal = -sin(angle);

      realL = realL + inL * cosVal;
      imagL = imagL + inL * sinVal;

      realR = realR + inR * cosVal;
      imagR = imagR + inR * sinVal;
    }

    let magL = sqrt(realL * realL + imagL * imagL);
    let magR = sqrt(realR * realR + imagR * imagR);

    // Spatial Pan Coherence Analysis (Center Panned Energy vs Stereo Sides)
    var panCoherence: f32 = 1.0;
    if (params.isStereo == 1u) {
      let diff = abs(magL - magR);
      let sum = magL + magR + 0.0001;
      let stereoDiffRatio = diff / sum;
      // High stereo separation => side instrument (guitars, reverb, synths)
      // Low stereo difference => center vocal
      panCoherence = 1.0 - stereoDiffRatio;
      panCoherence = pow(panCoherence, 1.0 + params.stereoCenterWeight * 2.0);
    }

    // Combine Spatial Panning Coherence with Formant Frequency Mask
    var vocalMask: f32 = panCoherence * vocalFreqWeight * params.vocalSensitivity;

    // Apply De-bleed thresholding to cleanly cut residual instrument leakage
    if (params.debleedStrength > 0.01) {
      let thresh = params.debleedStrength * 0.45;
      if (vocalMask < thresh) {
        vocalMask = vocalMask * (vocalMask / (thresh + 0.001));
      } else {
        vocalMask = min(1.0, (vocalMask - thresh) / (1.0 - thresh));
      }
    }

    vocalMask = clamp(vocalMask, 0.0, 1.0);

    // Synthesize vocal bin back into time domain with Hann synthesis window
    let synthVocalRealL = realL * vocalMask;
    let synthVocalImagL = imagL * vocalMask;
    let synthVocalRealR = realR * vocalMask;
    let synthVocalImagR = imagR * vocalMask;

    for (var n: u32 = 0u; n < fftSize; n = n + 1u) {
      let sampleIdx = startSample + n;
      let w = hannWindow(n, fftSize);
      let angle = (2.0 * PI * f32(k * n)) / f32(fftSize);
      let cosVal = cos(angle);

      // Normalization scale factor for 2 / N
      let scale = (2.0 / f32(fftSize)) * w;
      let valL = (synthVocalRealL * cosVal) * scale;
      let valR = (synthVocalRealR * cosVal) * scale;

      outputVocalL[sampleIdx] = outputVocalL[sampleIdx] + valL;
      if (params.isStereo == 1u) {
        outputVocalR[sampleIdx] = outputVocalR[sampleIdx] + valR;
      }
      
      if (k == 0u) {
        windowAccum[sampleIdx] = windowAccum[sampleIdx] + (w * w);
      }
    }
  }
}
`;
