/**
 * WebGPU Device & Apple Silicon GPU Detector for On-Device Neural Audio Processing
 */

export interface GpuCapabilities {
  hasWebGPU: boolean;
  adapterName: string;
  isAppleSilicon: boolean;
  isMobileSafari: boolean;
  maxComputeWorkgroupSizeX: number;
  maxStorageBufferBindingSize: number;
  deviceDescription: string;
}

let cachedCapabilities: GpuCapabilities | null = null;
let cachedDevice: GPUDevice | null = null;

export async function detectGpuCapabilities(): Promise<GpuCapabilities> {
  if (cachedCapabilities) return cachedCapabilities;

  const isApple = typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent || '') ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );

  const isSafariMobile = isApple && (
    /WebKit/.test(navigator.userAgent || '') &&
    !/Chrome|CriOS/.test(navigator.userAgent || '')
  );

  if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) {
    cachedCapabilities = {
      hasWebGPU: false,
      adapterName: 'CPU WebAssembly Fallback',
      isAppleSilicon: isApple,
      isMobileSafari: isSafariMobile,
      maxComputeWorkgroupSizeX: 0,
      maxStorageBufferBindingSize: 0,
      deviceDescription: isApple ? 'Apple Silicon (Multi-Threaded Audio DSP)' : 'Multi-Threaded Audio DSP'
    };
    return cachedCapabilities;
  }

  try {
    const adapterPromise = navigator.gpu.requestAdapter({
      powerPreference: 'high-performance'
    });
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 800));
    const adapter = await Promise.race([adapterPromise, timeoutPromise]);

    if (!adapter) {
      cachedCapabilities = {
        hasWebGPU: false,
        adapterName: 'WebGPU Adapter Not Available',
        isAppleSilicon: isApple,
        isMobileSafari: isSafariMobile,
        maxComputeWorkgroupSizeX: 0,
        maxStorageBufferBindingSize: 0,
        deviceDescription: 'Web Worker Audio DSP'
      };
      return cachedCapabilities;
    }

    // Probe adapter info if available
    let adapterName = 'WebGPU Hardware Accelerated Device';
    let isAppleGPU = isApple;

    if ('info' in adapter && (adapter as any).info) {
      const info = (adapter as any).info;
      const vendor = info.vendor || '';
      const architecture = info.architecture || '';
      const description = info.description || '';
      adapterName = `${vendor} ${architecture} ${description}`.trim() || adapterName;
      if (/apple|metal/i.test(adapterName) || /apple/i.test(vendor)) {
        isAppleGPU = true;
      }
    } else if (isApple) {
      adapterName = 'Apple Silicon GPU (Metal)';
      isAppleGPU = true;
    }

    cachedCapabilities = {
      hasWebGPU: true,
      adapterName: isAppleGPU ? 'Apple Silicon GPU (Metal)' : adapterName,
      isAppleSilicon: isAppleGPU,
      isMobileSafari: isSafariMobile,
      maxComputeWorkgroupSizeX: adapter.limits.maxComputeWorkgroupSizeX || 256,
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize || (128 * 1024 * 1024),
      deviceDescription: isAppleGPU ? 'iPad Apple Silicon GPU (Metal / WebGPU)' : adapterName
    };
    return cachedCapabilities;
  } catch (err) {
    console.warn('WebGPU detection encountered error, falling back to CPU DSP:', err);
    cachedCapabilities = {
      hasWebGPU: false,
      adapterName: 'CPU Fallback',
      isAppleSilicon: isApple,
      isMobileSafari: isSafariMobile,
      maxComputeWorkgroupSizeX: 0,
      maxStorageBufferBindingSize: 0,
      deviceDescription: isApple ? 'Apple Silicon (Accelerated Worker DSP)' : 'Accelerated Worker DSP'
    };
    return cachedCapabilities;
  }
}

export async function getWebGpuDevice(): Promise<GPUDevice | null> {
  if (cachedDevice) return cachedDevice;
  if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) {
    return null;
  }

  try {
    const adapterPromise = navigator.gpu.requestAdapter({
      powerPreference: 'high-performance'
    });
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 800));
    const adapter = await Promise.race([adapterPromise, timeoutPromise]);
    if (!adapter) return null;

    cachedDevice = await adapter.requestDevice({
      requiredLimits: {
        maxStorageBufferBindingSize: Math.min(
          adapter.limits.maxStorageBufferBindingSize || (128 * 1024 * 1024),
          128 * 1024 * 1024 // Keep allocation conservative for iPad Safari Jetsam
        )
      }
    });

    cachedDevice.lost.then((info) => {
      console.warn('WebGPU Device lost:', info.message);
      cachedDevice = null;
    });

    return cachedDevice;
  } catch (e) {
    console.warn('Could not acquire WebGPU device:', e);
    return null;
  }
}
