/**
 * Dedicated Web Worker for Audio Speed Transformation (Time-Stretching & Resampling).
 *
 * Runs off the main UI thread to eliminate lag, prevent mobile Safari watchdog script timeouts,
 * and utilize full CPU core capability without event-loop throttling.
 */

self.onmessage = (e: MessageEvent) => {
  const { id, channel0, channel1, numChannels, sampleRate, speed, keepPitch } = e.data;

  try {
    const safeSpeed = Math.max(0.1, Math.min(10.0, speed));
    const inLen = channel0.length;
    const outLen = Math.max(1, Math.floor(inLen / safeSpeed));

    const ch0: Float32Array = channel0;
    const ch1: Float32Array | null = channel1;
    const isStereo = numChannels > 1 && ch1 !== null;

    const out0 = new Float32Array(outLen);
    const out1 = isStereo ? new Float32Array(outLen) : null;

    if (!keepPitch) {
      // Linear interpolation resampler (tape/vinyl pitch shifting)
      const reportInterval = Math.max(1024, Math.floor(outLen / 20));
      for (let i = 0; i < outLen; i++) {
        const srcPos = i * safeSpeed;
        const idx = Math.floor(srcPos);
        const frac = srcPos - idx;
        const idxNext = idx + 1 < inLen ? idx + 1 : inLen - 1;
        const idxSafe = idx < inLen ? idx : inLen - 1;

        const s0 = ch0[idxSafe];
        const s1 = ch0[idxNext];
        out0[i] = s0 + frac * (s1 - s0);

        if (isStereo && ch1 && out1) {
          const s0_1 = ch1[idxSafe];
          const s1_1 = ch1[idxNext];
          out1[i] = s0_1 + frac * (s1_1 - s0_1);
        }

        if (i % reportInterval === 0) {
          self.postMessage({ type: 'progress', id, progress: i / outLen });
        }
      }

      const transferList: Transferable[] = [out0.buffer];
      if (out1) transferList.push(out1.buffer);

      (self.postMessage as any)(
        {
          type: 'complete',
          id,
          channel0: out0,
          channel1: out1,
          numChannels: isStereo ? 2 : 1,
          outLen
        },
        transferList
      );
      return;
    }

    // WSOLA with Hierarchical Coarse-to-Fine Search (Preserves Pitch)
    const N = sampleRate > 48000 ? 2048 : 1024;
    const Hs = N >> 1; // 50% overlap synthesis hop
    const searchRange = Math.min(256, Hs);

    // Precomputed Hann window
    const win = new Float32Array(N);
    const twoPiOverN = (2 * Math.PI) / N;
    for (let i = 0; i < N; i++) {
      win[i] = 0.5 * (1 - Math.cos(twoPiOverN * i));
    }

    // Initial window copy
    let prevCandidate = 0;
    const initialLen = Math.min(N, inLen, outLen);
    for (let i = 0; i < initialLen; i++) {
      const w = win[i];
      out0[i] = ch0[i] * w;
      if (isStereo && ch1 && out1) {
        out1[i] = ch1[i] * w;
      }
    }

    let synPos = Hs;
    let hops = 0;
    const totalHops = Math.max(1, Math.floor((outLen - N) / Hs));
    const reportHopInterval = Math.max(16, Math.floor(totalHops / 20));

    const COARSE_STEP = 16;
    const FINE_RANGE = 16;
    const FINE_STEP = 2;

    while (synPos + N <= outLen) {
      const targetAna = Math.round(synPos * safeSpeed);
      const natCont = prevCandidate + Hs;

      const minSearch = Math.max(0, targetAna - searchRange);
      const maxSearch = Math.min(inLen - N, targetAna + searchRange);

      let bestCand = Math.max(0, Math.min(inLen - N, targetAna));

      if (natCont + Hs <= inLen && minSearch <= maxSearch) {
        // Coarse Pass: Scan across search window with stride 16
        let coarseBest = bestCand;
        let coarseMaxCorr = -Infinity;

        for (let cand = minSearch; cand <= maxSearch; cand += COARSE_STEP) {
          let corr = 0;
          for (let k = 0; k < Hs; k += 16) {
            corr += ch0[cand + k] * ch0[natCont + k];
          }
          if (corr > coarseMaxCorr) {
            coarseMaxCorr = corr;
            coarseBest = cand;
          }
        }

        // Fine Pass: Refine in localized window (+/- 16 samples) around coarse peak
        const fineStart = Math.max(minSearch, coarseBest - FINE_RANGE);
        const fineEnd = Math.min(maxSearch, coarseBest + FINE_RANGE);

        bestCand = coarseBest;
        let fineMaxCorr = -Infinity;

        for (let cand = fineStart; cand <= fineEnd; cand += FINE_STEP) {
          let corr = 0;
          for (let k = 0; k < Hs; k += 8) {
            corr += ch0[cand + k] * ch0[natCont + k];
          }
          if (corr > fineMaxCorr) {
            fineMaxCorr = corr;
            bestCand = cand;
          }
        }
      }

      // Overlap-add windowed frames
      for (let i = 0; i < N; i++) {
        const w = win[i];
        out0[synPos + i] += ch0[bestCand + i] * w;
        if (isStereo && ch1 && out1) {
          out1[synPos + i] += ch1[bestCand + i] * w;
        }
      }

      prevCandidate = bestCand;
      synPos += Hs;
      hops++;

      if (hops % reportHopInterval === 0) {
        self.postMessage({
          type: 'progress',
          id,
          progress: Math.min(0.99, hops / totalHops)
        });
      }
    }

    const transferList: Transferable[] = [out0.buffer];
    if (out1) transferList.push(out1.buffer);

    (self.postMessage as any)(
      {
        type: 'complete',
        id,
        channel0: out0,
        channel1: out1,
        numChannels: isStereo ? 2 : 1,
        outLen
      },
      transferList
    );
  } catch (err: any) {
    self.postMessage({
      type: 'error',
      id,
      error: err?.message || String(err)
    });
  }
};
