/**
 * Canvas 绘制辅助：底图 + 矩形/分区覆盖层。
 */
import type { Rect } from '../domain/types';

export function fitScale(canvas: HTMLCanvasElement, maxW: number, maxH: number): number {
  const sx = maxW / canvas.width;
  const sy = maxH / canvas.height;
  return Math.min(1, sx, sy);
}

export function drawImageBitmap(
  canvas: HTMLCanvasElement,
  source: ImageBitmap | ImageData | HTMLCanvasElement | OffscreenCanvas,
): void {
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (source instanceof ImageData) ctx.putImageData(source, 0, 0);
  else ctx.drawImage(source, 0, 0);
}

export function strokeRect(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  color: string,
  lineWidth = 2,
  dash: number[] = [],
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  ctx.restore();
}

export function fillRect(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  color: string,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

export function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
): void {
  ctx.save();
  ctx.font = '11px "Cascadia Code", Consolas, monospace';
  const w = ctx.measureText(text).width + 8;
  ctx.fillStyle = color;
  ctx.fillRect(x, y - 13, w, 15);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, x + 4, y - 2);
  ctx.restore();
}

export function pointInRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/** 把鼠标事件坐标换算为画布原始像素坐标 */
export function eventToCanvasPos(
  ev: MouseEvent,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((ev.clientX - rect.left) / rect.width) * canvas.width,
    y: ((ev.clientY - rect.top) / rect.height) * canvas.height,
  };
}
