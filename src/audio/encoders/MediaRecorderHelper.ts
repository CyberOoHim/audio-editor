/**
 * Universal MediaRecorder AudioBuffer encoder for WebM, Opus, Ogg, and AAC/MP4 containers.
 */
export async function encodeViaMediaRecorder(
  buffer: AudioBuffer,
  candidateMimes: string[],
  options: {
    bitrate?: number;
    sampleRate?: number;
    onProgress?: (progress: number) => void;
  } = {}
): Promise<Blob> {
  const supportedMime = candidateMimes.find(
    (m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)
  );

  if (!supportedMime) {
    throw new Error(
      `Direct encoding to [${candidateMimes[0]}] is not supported by your browser. Please export as WAV (Lossless) or MP3.`
    );
  }

  const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const targetSampleRate = options.sampleRate || buffer.sampleRate;
  const ctx = new AudioCtxClass({ sampleRate: targetSampleRate });

  try {
    const dest = ctx.createMediaStreamDestination();
    const sourceNode = ctx.createBufferSource();
    sourceNode.buffer = buffer;
    sourceNode.connect(dest);

    const recorderOptions: MediaRecorderOptions = {
      mimeType: supportedMime,
      ...(options.bitrate ? { audioBitsPerSecond: options.bitrate * 1000 } : {})
    };

    const recorder = new MediaRecorder(dest.stream, recorderOptions);
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    return await new Promise<Blob>((resolve, reject) => {
      let progressTimer: ReturnType<typeof setInterval> | null = null;
      const startTime = performance.now();
      const durationMs = Math.max(100, buffer.duration * 1000);

      if (options.onProgress) {
        progressTimer = setInterval(() => {
          const elapsed = performance.now() - startTime;
          options.onProgress?.(Math.min(0.98, elapsed / durationMs));
        }, 150);
      }

      recorder.onstop = () => {
        if (progressTimer) clearInterval(progressTimer);
        options.onProgress?.(1.0);
        // Stop stream tracks
        dest.stream.getTracks().forEach((t) => t.stop());
        resolve(new Blob(chunks, { type: supportedMime }));
      };

      recorder.onerror = (err) => {
        if (progressTimer) clearInterval(progressTimer);
        dest.stream.getTracks().forEach((t) => t.stop());
        reject(err);
      };

      recorder.start(100);
      sourceNode.start(0);

      sourceNode.onended = () => {
        setTimeout(() => {
          if (recorder.state !== 'inactive') {
            recorder.stop();
          }
        }, 150);
      };
    });
  } finally {
    if (ctx.state !== 'closed') {
      await ctx.close().catch(() => {});
    }
  }
}
