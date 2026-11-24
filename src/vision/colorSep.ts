/**
 * 朱墨分色。
 *
 * 判据（对合成色值与常见扫描件均适用）：
 *  - 朱笔：R 显著高于 G/B，且 R 不太低
 *  - 墨：低亮度、通道间差异小
 * 输出两张二值掩膜（0/255）与供 UI 显示的灰度 ImageData。
 */
export interface Separation {
  width: number;
  height: number;
  /** 墨色掩膜，每像素 1 字节，0/1 */
  inkMask: Uint8Array;
  /** 朱色掩膜 */
  redMask: Uint8Array;
  inkImage: ImageData;
  redImage: ImageData;
}

export function separateColors(image: ImageBitmap | ImageData): Separation {
  const width = image.width;
  const height = image.height;
  const rgba = toRGBA(image);
  const n = width * height;
  const inkMask = new Uint8Array(n);
  const redMask = new Uint8Array(n);
  const inkImg = new ImageData(width, height);
  const redImg = new ImageData(width, height);

  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const isRed = r > 110 && r - g > 45 && r - b > 40 && r > lum + 18;
    const isInk = !isRed && lum < 150;

    redMask[p] = isRed ? 1 : 0;
    inkMask[p] = isInk ? 1 : 0;

    // 显示层：掩膜外为白底
    inkImg.data[i] = inkImg.data[i + 1] = inkImg.data[i + 2] = isInk ? 26 : 255;
    inkImg.data[i + 3] = 255;
    redImg.data[i] = isRed ? 176 : 255;
    redImg.data[i + 1] = isRed ? 58 : 255;
    redImg.data[i + 2] = isRed ? 46 : 255;
    redImg.data[i + 3] = 255;
  }

  return { width, height, inkMask, redMask, inkImage: inkImg, redImage: redImg };
}

function toRGBA(image: ImageBitmap | ImageData): Uint8ClampedArray {
  if (image instanceof ImageData) return image.data;
  // Node 测试垫片把底层 node-canvas 挂在 _canvas；浏览器中无此字段，回退原值
  const source = (image as unknown as { _canvas?: CanvasImageSource })._canvas ?? image;
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, 0, 0);
  return ctx.getImageData(0, 0, image.width, image.height).data;
}
