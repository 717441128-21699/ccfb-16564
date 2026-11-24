/**
 * Node 测试环境垫片：用 node-canvas 实现 OffscreenCanvas / ImageBitmap / ImageData。
 * 仅用于 vitest，浏览器构建不加载本文件。
 */
// node-canvas 运行时提供与 DOM 对齐的 Canvas API
import { createCanvas, ImageData as NodeImageData } from 'canvas';

class ImageBitmapShim {
  readonly width: number;
  readonly height: number;
  /** @internal 持有的 node-canvas 画布 */
  readonly _canvas: ReturnType<typeof createCanvas>;

  constructor(canvas: ReturnType<typeof createCanvas>) {
    this._canvas = canvas;
    this.width = canvas.width;
    this.height = canvas.height;
  }

  close(): void {
    /* no-op */
  }
}

class OffscreenCanvasShim {
  width: number;
  height: number;
  /** 底层 node-canvas 画布 */
  readonly _canvas: ReturnType<typeof createCanvas>;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this._canvas = createCanvas(width, height);
  }

  getContext(type: '2d'): ReturnType<ReturnType<typeof createCanvas>['getContext']> {
    return this._canvas.getContext(type);
  }

  transferToImageBitmap(): ImageBitmapShim {
    return new ImageBitmapShim(this._canvas);
  }
}

(globalThis as unknown as Record<string, unknown>).OffscreenCanvas = OffscreenCanvasShim;
(globalThis as unknown as Record<string, unknown>).ImageBitmap = ImageBitmapShim;
(globalThis as unknown as Record<string, unknown>).ImageData = NodeImageData;

export { createCanvas, ImageBitmapShim };
