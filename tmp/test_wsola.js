// Test WSOLA algorithm in Node
function timeStretchWsola(inputChannels, sampleRate, speed) {
  if (Math.abs(speed - 1.0) < 0.001) return inputChannels;

  const numChannels = inputChannels.length;
  const inputLen = inputChannels[0].length;
  const outputLen = Math.max(1, Math.floor(inputLen / speed));

  const winSize = 1024;
  const halfWin = winSize >> 1;
  const synHop = halfWin; // 512
  const anaHop = Math.round(synHop * speed);
  const searchRange = 256;

  // Hanning window
  const window = new Float32Array(winSize);
  for (let i = 0; i < winSize; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (winSize - 1)));
  }

  const outputChannels = [];
  for (let c = 0; c < numChannels; c++) {
    outputChannels.push(new Float32Array(outputLen));
  }

  // Prime first window
  for (let c = 0; c < numChannels; c++) {
    const src = inputChannels[c];
    const dst = outputChannels[c];
    const copyLen = Math.min(winSize, inputLen, outputLen);
    for (let i = 0; i < copyLen; i++) {
      dst[i] = src[i];
    }
  }

  const ch0 = inputChannels[0];
  let synPos = synHop;
  let anaTarget = anaHop;

  while (synPos + winSize <= outputLen && anaTarget + winSize + searchRange <= inputLen) {
    // Find optimal offset delta around anaTarget that matches previous output overlap
    // Previous overlap is in output at [synPos .. synPos + halfWin]
    const prevOut = outputChannels[0];
    let bestOffset = 0;
    let maxCorr = -Infinity;

    const searchStart = Math.max(0, anaTarget - searchRange);
    const searchEnd = Math.min(inputLen - winSize, anaTarget + searchRange);

    for (let candidate = searchStart; candidate <= searchEnd; candidate += 2) {
      let corr = 0;
      for (let k = 0; k < halfWin; k += 4) {
        corr += prevOut[synPos + k] * ch0[candidate + k];
      }
      if (corr > maxCorr) {
        maxCorr = corr;
        bestOffset = candidate - anaTarget;
      }
    }

    const actualAnaPos = Math.max(0, Math.min(inputLen - winSize, anaTarget + bestOffset));

    // Overlap and add
    for (let c = 0; c < numChannels; c++) {
      const src = inputChannels[c];
      const dst = outputChannels[c];
      for (let i = 0; i < winSize; i++) {
        const w = window[i];
        const outIdx = synPos + i;
        if (outIdx < outputLen) {
          if (i < halfWin) {
            dst[outIdx] = dst[outIdx] * (1 - w) + src[actualAnaPos + i] * w;
          } else {
            dst[outIdx] = src[actualAnaPos + i];
          }
        }
      }
    }

    synPos += synHop;
    anaTarget += anaHop;
  }

  return outputChannels;
}

const sr = 44100;
const dur = 10; // 10 seconds of stereo audio
const samples = sr * dur;
const left = new Float32Array(samples);
const right = new Float32Array(samples);
for (let i = 0; i < samples; i++) {
  left[i] = Math.sin(2 * Math.PI * 440 * i / sr);
  right[i] = Math.sin(2 * Math.PI * 880 * i / sr);
}

const t0 = performance.now();
const res = timeStretchWsola([left, right], sr, 1.25);
const t1 = performance.now();
console.log(`Stretched 10s stereo audio in ${(t1 - t0).toFixed(2)}ms, output length: ${res[0].length}`);
