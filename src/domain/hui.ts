/**
 * 徽位 → 有效弦长比。
 *
 * 古琴十三徽按谐波节点定位：第 n 徽的有效弦长比 r = k/(n')，
 * 其中 n' 为谐波序数。徽外（hui=14）按惯例取 r≈0.945。
 */
import type { HuiPosition } from './types';

/** 十三徽的谐波序数（徽序 1..13） */
export const HUI_HARMONIC: readonly number[] = [
  8, // 一徽 1/8
  6, // 二徽 1/6
  5, // 三徽 1/5
  4, // 四徽 1/4
  3, // 五徽 1/3
  5, // 六徽 2/5
  2, // 七徽 1/2
  5, // 八徽 3/5
  3, // 九徽 2/3
  4, // 十徽 3/4
  5, // 十一徽 4/5
  6, // 十二徽 5/6
  8, // 十三徽 7/8
];

/** 各徽整徽位置的有效弦长比 */
export const HUI_RATIO: readonly number[] = HUI_HARMONIC.map((n, i) =>
  i >= 6 ? 1 - 1 / n : 1 / n,
);

/** 徽外（十三徽之下约一寸）的惯例比值 */
export const HUI_WAI_RATIO = 0.945;

/**
 * 徽位（含几分）→ 有效弦长比。
 * 分位在相邻整徽之间线性插值（与实际按音位置的常用取法一致）。
 */
export function huiToRatio(hui: HuiPosition): number {
  if (hui.hui === 14) return HUI_WAI_RATIO;
  const idx = hui.hui - 1;
  const base = HUI_RATIO[idx];
  if (hui.fen === 0) return base;
  // 向第几徽方向插值：一徽至七徽向下一徽（idx+1），八徽至十三徽向上一徽（idx-1）
  const neighborIdx = hui.hui <= 7 ? idx + 1 : idx - 1;
  const neighbor = HUI_RATIO[neighborIdx];
  return base + ((neighbor - base) * hui.fen) / 10;
}

/** 泛音徽位 → 谐波序数；徽外无泛音，返回 null */
export function huiToHarmonic(hui: HuiPosition): number | null {
  if (hui.hui === 14 || hui.fen !== 0) return null;
  return HUI_HARMONIC[hui.hui - 1];
}

export function formatHui(hui: HuiPosition): string {
  if (hui.hui === 14) return '徽外';
  const fenChar = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  return hui.fen === 0 ? `${hui.hui}徽` : `${hui.hui}徽${fenChar[hui.fen]}分`;
}
