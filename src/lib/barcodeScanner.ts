import { BarcodeDetector } from 'barcode-detector/ponyfill';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'] as const;

let cachedDetector: InstanceType<typeof BarcodeDetector> | null = null;

function getDetector(): InstanceType<typeof BarcodeDetector> {
  if (cachedDetector) return cachedDetector;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cachedDetector = new BarcodeDetector({ formats: FORMATS as any });
  return cachedDetector;
}

export async function detectBarcodes(source: ImageBitmapSource): Promise<{ rawValue: string; format: string }[]> {
  const detector = getDetector();
  return detector.detect(source as Parameters<typeof detector.detect>[0]);
}
