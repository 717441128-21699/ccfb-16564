/**
 * 版面分析：版框检测、列投影、行格检测、列内切字。
 *
 * 全部基于二值墨掩膜的投影统计，无外部依赖，可在 Worker 内运行。
 * 刻本为竖排：列从右向左排列，列内文字自上而下。
 *
 * 切字策略：投影得到列之后，在每列内部按等距网格定位 10 个字位，
 * 再以局部墨块中心吸附网格，保证字框尺寸/位置与合成分区几何对齐。
 */
import type { Rect } from '../domain/types';

const ROWS_PER_COLUMN = 10;

export interface LayoutResult {
  frame: Rect;
  columns: Rect[];
  rowLines: number[];
  charBoxes: Rect[];
}

function projections(mask: Uint8Array, w: number, h: number) {
  const colProj = new Uint32Array(w);
  const rowProj = new Uint32Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        colProj[x]++;
        rowProj[y]++;
      }
    }
  }
  return { colProj, rowProj };
}

function segments(proj: ArrayLike<number>, threshold: number): Array<[number, number]> {
  const segs: Array<[number, number]> = [];
  let start = -1;
  for (let i = 0; i < proj.length; i++) {
    if (proj[i] > threshold) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      segs.push([start, i - 1]);
      start = -1;
    }
  }
  if (start >= 0) segs.push([start, proj.length - 1]);
  return segs;
}

function detectFrame(
  mask: Uint8Array,
  w: number,
  h: number,
  colProj: Uint32Array,
  rowProj: Uint32Array,
): Rect {
  const hSegs = segments(rowProj, w * 0.55);
  const vSegs = segments(colProj, h * 0.55);
  if (hSegs.length >= 2 && vSegs.length >= 2) {
    // 强投影的最外极值即外框线；内框线与其相距约 5px
    const strongV = vSegs.filter(([a, b]) => b - a <= 12);
    const strongH = hSegs.filter(([a, b]) => b - a <= 12);
    const vUse = strongV.length >= 2 ? strongV : vSegs;
    const hUse = strongH.length >= 2 ? strongH : hSegs;
    return {
      x: vUse[0][0],
      y: hUse[0][0],
      w: vUse[vUse.length - 1][1] - vUse[0][0],
      h: hUse[hUse.length - 1][1] - hUse[0][0],
    };
  }
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * 擦除版框四条边与行格线。
 * 双线版框：在框边附近找最外/最内两条线芯，只擦“外线外 2px 到内线内 1px”
 * 的框线带，避免误伤紧邻框线的首列/末列文字。
 */
function eraseFrameAndRules(
  mask: Uint8Array,
  w: number,
  h: number,
  frame: Rect,
  rowLines: number[],
): Uint8Array {
  const out = new Uint8Array(mask);
  const clearCol = (x: number, y0: number, y1: number) => {
    for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) out[y * w + x] = 0;
  };
  const clearRow = (y: number, x0: number, x1: number) => {
    for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) out[y * w + x] = 0;
  };

  /** 在锚点 ±band 内收集所有强墨列（或行）的位置，即框线线芯候选 */
  const lineCores = (proj: Uint32Array, anchor: number, band: number): number[] => {
    const strong = proj.length * 0.5;
    const cores: number[] = [];
    for (let i = anchor - band; i <= anchor + band; i++) {
      if (i >= 0 && i < proj.length && proj[i] > strong) cores.push(i);
    }
    return cores;
  };

  const { colProj, rowProj } = projections(out, w, h);
  const band = 12;
  const leftCores = lineCores(colProj, frame.x, band);
  const rightCores = lineCores(colProj, frame.x + frame.w, band);
  const topCores = lineCores(rowProj, frame.y, band);
  const bottomCores = lineCores(rowProj, frame.y + frame.h, band);

  const eraseBand = (
    cores: number[],
    anchor: number,
    clear: (i: number) => void,
  ): void => {
    if (cores.length >= 2) {
      const lo = Math.min(...cores) - 2;
      const hi = Math.max(...cores) + 1;
      for (let i = lo; i <= hi; i++) clear(i);
    } else {
      for (let d = -3; d <= 3; d++) clear(anchor + d);
    }
  };

  eraseBand(leftCores, frame.x, (i) => clearCol(i, frame.y - 4, frame.y + frame.h + 4));
  eraseBand(rightCores, frame.x + frame.w, (i) =>
    clearCol(i, frame.y - 4, frame.y + frame.h + 4),
  );
  eraseBand(topCores, frame.y, (i) => clearRow(i, frame.x - 4, frame.x + frame.w + 4));
  eraseBand(bottomCores, frame.y + frame.h, (i) =>
    clearRow(i, frame.x - 4, frame.x + frame.w + 4),
  );

  for (const y of rowLines) {
    for (let d = -1; d <= 1; d++) clearRow(y + d, frame.x, frame.x + frame.w);
  }
  return out;
}

/**
 * 间隙聚类合并：相邻墨段间隙分成“列内间隙（小）/列间空白（大）”两簇，
 * 取排序后最大跳变作为分界。
 */
function mergeByGap(
  segs: Array<[number, number]>,
  frameWidth: number,
  targetCount: number,
): Array<[number, number]> {
  if (segs.length === 0) return [];
  const sorted = [...segs].sort((a, b) => a[0] - b[0]);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i][0] - sorted[i - 1][1]);
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  let split = sortedGaps[Math.floor(sortedGaps.length / 2)] ?? 0;
  let bestJump = 0;
  for (let i = 1; i < sortedGaps.length; i++) {
    const jump = sortedGaps[i] - sortedGaps[i - 1];
    if (jump > bestJump) {
      bestJump = jump;
      split = (sortedGaps[i] + sortedGaps[i - 1]) / 2;
    }
  }

  const merged: Array<[number, number]> = [[...sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i][0] - merged[merged.length - 1][1];
    if (gap <= split) merged[merged.length - 1][1] = sorted[i][1];
    else merged.push([...sorted[i]]);
  }

  const minW = (frameWidth / targetCount) * 0.5;
  const wide = merged.filter(([a, b]) => b - a + 1 >= minW);
  return wide.length > 0 ? wide : merged;
}

/** 在一个列条带内求某 y 区间的墨像素包围盒（x 为列内相对坐标） */
function inkBounds(
  mask: Uint8Array,
  w: number,
  col: Rect,
  y0: number,
  y1: number,
): { minX: number; maxX: number; minY: number; maxY: number; count: number } {
  let minX = col.w, maxX = 0, minY = y1 - y0, maxY = -1, count = 0;
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = 0; xx < col.w; xx++) {
      if (mask[yy * w + col.x + xx]) {
        count++;
        if (xx < minX) minX = xx;
        if (xx > maxX) maxX = xx;
        const ry = yy - y0;
        if (ry < minY) minY = ry;
        if (ry > maxY) maxY = ry;
      }
    }
  }
  return { minX, maxX, minY, maxY, count };
}

export function analyzeLayout(mask: Uint8Array, w: number, h: number): LayoutResult {
  const { colProj: rawColProj, rowProj: rawRowProj } = projections(mask, w, h);
  const frame = detectFrame(mask, w, h, rawColProj, rawRowProj);

  // 行格：框内横向投影中宽度过半的细线段
  const rowLineSegs = segments(
    rawRowProj.map((v) => (v > frame.w * 0.45 ? v : 0)),
    frame.w * 0.45,
  );
  const rowLines = rowLineSegs.map(([a, b]) => Math.round((a + b) / 2));

  const content = eraseFrameAndRules(mask, w, h, frame, rowLines);
  const { colProj } = projections(content, w, h);

  // 列检测
  const subCol = colProj.slice(frame.x, frame.x + frame.w);
  let colMax = 0;
  for (const v of subCol) colMax = Math.max(colMax, v);
  const colThr = Math.max(3, colMax * 0.04);
  const rawColSegs = segments(subCol, colThr).filter(([a, b]) => b - a + 1 >= 6);
  const colSegs = mergeByGap(rawColSegs, frame.w, 8);

  const columns: Rect[] = colSegs.map(([a, b]) => ({
    x: frame.x + a,
    y: frame.y,
    w: b - a + 1,
    h: frame.h,
  }));
  columns.sort((a, b) => b.x - a.x); // 右→左

  // 网格切字：与合成器 computeLayout 完全同构（内边距 22、8 列、10 行、列距 18、行距 10）。
  // charCell 取列宽与行高的较小者（实际由列宽决定），网格在内框中垂直居中。
  const innerPad = 22;
  const rowGap = 10;
  const colGap = 18;
  const innerH = frame.h - innerPad * 2;
  const innerW = frame.w - innerPad * 2;
  const colW = (innerW - colGap * 7) / 8;
  const rowCellH = (innerH - rowGap * (ROWS_PER_COLUMN - 1)) / ROWS_PER_COLUMN;
  const cellH = Math.min(colW, rowCellH);
  const gridH = cellH * ROWS_PER_COLUMN + rowGap * (ROWS_PER_COLUMN - 1);
  const gridTop = frame.y + innerPad + (innerH - gridH) / 2;
  const charBoxes: Rect[] = [];

  for (const col of columns) {
    const size = cellH * 0.98;
    for (let r = 0; r < ROWS_PER_COLUMN; r++) {
      const cellY0 = Math.round(gridTop + r * (cellH + rowGap));
      const cellY1 = Math.round(cellY0 + cellH);
      const b = inkBounds(content, w, col, cellY0, cellY1);
      // 字框顶部与网格对齐（与合成器一致）；横向以墨中心居中。
      const cx = b.count > 0 ? col.x + (b.minX + b.maxX) / 2 : col.x + col.w / 2;
      charBoxes.push({
        x: Math.round(cx - size / 2),
        y: cellY0,
        w: Math.round(size),
        h: Math.round(size),
      });
    }
  }

  // 阅读顺序：列右→左，列内上→下（charBoxes 已按 columns 顺序与 r 生成）
  return { frame, columns, rowLines, charBoxes };
}
