import type { Renderer } from './renderer';

export type ImageFormat = 'png' | 'jpeg';

export const MIME: Record<ImageFormat, string> = { png: 'image/png', jpeg: 'image/jpeg' };

export async function exportImage(
  renderer: Renderer,
  width: number,
  height: number,
  format: ImageFormat,
  onProgress?: (p: number) => void,
): Promise<Blob> {
  // Rendering is ~85% of the work; encoding the PNG/JPEG is the rest.
  const canvas = await renderer.renderImage(width, height, (p) => onProgress?.(p * 0.85));
  try {
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Image encoding failed.'))),
        MIME[format],
        format === 'jpeg' ? 0.95 : undefined,
      ),
    );
    onProgress?.(1);
    return blob;
  } finally {
    // Release the backing store right away (matters on iOS).
    canvas.width = 0;
    canvas.height = 0;
  }
}
