export type ImageUploadError = 'heic_unsupported' | 'unsupported_type' | 'too_large';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function isHeicLike(file: Pick<File, 'name' | 'type'>): boolean {
  const lower = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return lower.endsWith('.heic') || lower.endsWith('.heif') || type.includes('heic') || type.includes('heif');
}

async function heicToJpeg(file: File): Promise<File> {
  if (typeof createImageBitmap !== 'function') throw new Error('no_bitmap');
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no_canvas');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', 0.9);
  });
  const name = file.name.replace(/\.hei[cf]$/i, '.jpg');
  return new File([blob], name.endsWith('.jpg') ? name : `${name}.jpg`, { type: 'image/jpeg' });
}

export async function imageFileForUpload(file: File, maxBytes = 5 * 1024 * 1024): Promise<{ file: File } | { error: ImageUploadError }> {
  if (file.size > maxBytes) return { error: 'too_large' };
  if (isHeicLike(file)) {
    try {
      const converted = await heicToJpeg(file);
      if (converted.size > maxBytes) return { error: 'too_large' };
      return { file: converted };
    } catch {
      return { error: 'heic_unsupported' };
    }
  }
  const type = (file.type || '').toLowerCase();
  const lower = file.name.toLowerCase();
  const extOk = ['.jpg', '.jpeg', '.png', '.webp'].some(e => lower.endsWith(e));
  if (!ALLOWED.has(type) && !extOk) return { error: 'unsupported_type' };
  return { file };
}
