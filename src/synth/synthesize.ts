/**
 * 合成页面服务：生成真值 + 渲染位图，产出可送入管线的 ImageBitmap。
 */
import type { DegradationLevel, FontStyle, PageGroundTruth } from '../domain/types';
import { buildPageGroundTruth, PAGE_W, PAGE_H } from './sequence';
import { renderPage } from './render';

export interface SynthOutput {
  groundTruth: PageGroundTruth;
  bitmap: ImageBitmap;
}

export async function synthesizePage(
  fontStyle: FontStyle,
  degradation: DegradationLevel,
  seed: number,
): Promise<SynthOutput> {
  const groundTruth = buildPageGroundTruth(fontStyle, degradation, seed);
  const canvas = new OffscreenCanvas(PAGE_W, PAGE_H);
  renderPage(groundTruth, canvas);
  const bitmap = canvas.transferToImageBitmap();
  return { groundTruth, bitmap };
}
