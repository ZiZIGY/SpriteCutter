export interface DecodedImage {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export async function decodeImage(src: string): Promise<DecodedImage> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Не удалось прочитать изображение'));
    img.src = src;
  });
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return { width, height, pixels: ctx.getImageData(0, 0, width, height).data };
}
