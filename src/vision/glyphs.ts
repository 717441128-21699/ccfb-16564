/**
 * 程序化部件笔画库（合成器与识别模板共用同一套字形定义）。
 *
 * 每个部件在 0..1 归一化方格内定义为若干笔（折线）与点；
 * 字体风格只改变笔画粗细、转折圆度与倾斜，不改变拓扑，
 * 从而模拟同一套减字在不同刻本字体下的差异。
 *
 * 字形为可复现的示意化减字（取通行减字谱的结构特征），
 * 不是对某一具体琴谱版本的原样复刻。
 */
import type { FontStyle } from '../domain/types';
import { FONT_PARAMS } from './vocab';

export interface Stroke {
  /** 折线顶点 */
  pts: [number, number][];
}
export interface Dot {
  x: number;
  y: number;
  r: number;
}
export interface Glyph {
  strokes: Stroke[];
  dots?: Dot[];
}

const S = (pts: [number, number][]): Stroke => ({ pts });

/**
 * 数字笔画：一至九采用七段数码管式结构，每个数字拥有独特笔画组合，
 * 相互间汉明距离大、不易混淆；十以上用汉字式。坐标 0..1。
 * 段编号： a 上横 / b 右上竖 / c 右下竖 / d 下横 / e 左下竖 / f 左上竖 / g 中横
 */
const SEG_A: [number, number][] = [[0.22, 0.12], [0.78, 0.12]];
const SEG_B: [number, number][] = [[0.82, 0.16], [0.82, 0.46]];
const SEG_C: [number, number][] = [[0.82, 0.54], [0.82, 0.84]];
const SEG_D: [number, number][] = [[0.22, 0.88], [0.78, 0.88]];
const SEG_E: [number, number][] = [[0.18, 0.54], [0.18, 0.84]];
const SEG_F: [number, number][] = [[0.18, 0.16], [0.18, 0.46]];
const SEG_G: [number, number][] = [[0.22, 0.5], [0.78, 0.5]];
const SEGMENTS: Record<number, [number, number][][]> = {
  1: [SEG_B, SEG_C],
  2: [SEG_A, SEG_B, SEG_G, SEG_E, SEG_D],
  3: [SEG_A, SEG_B, SEG_G, SEG_C, SEG_D],
  4: [SEG_F, SEG_G, SEG_B, SEG_C],
  5: [SEG_A, SEG_F, SEG_G, SEG_C, SEG_D],
  6: [SEG_A, SEG_F, SEG_G, SEG_E, SEG_C, SEG_D],
  7: [SEG_A, SEG_B, SEG_C],
  8: [SEG_A, SEG_B, SEG_C, SEG_D, SEG_E, SEG_F, SEG_G],
  9: [SEG_A, SEG_B, SEG_C, SEG_D, SEG_F, SEG_G],
};
const NUM_GLYPHS: Record<number, Glyph> = Object.fromEntries(
  Object.entries(SEGMENTS).map(([n, segs]) => [Number(n), { strokes: segs.map((p) => S(p)) }]),
) as Record<number, Glyph>;
Object.assign(NUM_GLYPHS, {
  10: {
    // 十
    strokes: [
      S([[0.18, 0.5], [0.82, 0.5]]),
      S([[0.5, 0.15], [0.5, 0.85]]),
    ],
  },
  11: {
    // 十一
    strokes: [
      S([[0.18, 0.3], [0.82, 0.3]]),
      S([[0.32, 0.3], [0.32, 0.85]]),
      S([[0.62, 0.3], [0.62, 0.85]]),
    ],
  },
  12: {
    // 十二：十 + 二
    strokes: [
      S([[0.16, 0.32], [0.52, 0.32]]),
      S([[0.34, 0.14], [0.34, 0.5]]),
      S([[0.62, 0.22], [0.88, 0.22]]),
      S([[0.66, 0.44], [0.84, 0.44]]),
      S([[0.7, 0.66], [0.8, 0.66]]),
    ],
  },
  13: {
    // 十三：十 + 三
    strokes: [
      S([[0.16, 0.32], [0.52, 0.32]]),
      S([[0.34, 0.14], [0.34, 0.5]]),
      S([[0.6, 0.2], [0.9, 0.2]]),
      S([[0.64, 0.42], [0.86, 0.42]]),
      S([[0.6, 0.64], [0.9, 0.64]]),
    ],
  },
  14: {
    // 徽外标记：外字简化框
    strokes: [
      S([[0.22, 0.2], [0.78, 0.2], [0.78, 0.82], [0.22, 0.82], [0.22, 0.2]]),
      S([[0.4, 0.38], [0.62, 0.38]]),
      S([[0.5, 0.38], [0.5, 0.66]]),
      S([[0.38, 0.66], [0.64, 0.66]]),
    ],
  },
});

/** 右手指法（示意化减字） */
const RIGHT_GLYPHS: Record<string, Glyph> = {
  // 抹：末字旁
  mo: {
    strokes: [
      S([[0.22, 0.16], [0.78, 0.16]]),
      S([[0.28, 0.16], [0.28, 0.82], [0.7, 0.82]]),
      S([[0.42, 0.38], [0.68, 0.38]]),
      S([[0.42, 0.58], [0.62, 0.58]]),
    ],
  },
  // 挑：提手旁 + 乚
  tiao: {
    strokes: [
      S([[0.24, 0.14], [0.24, 0.84]]),
      S([[0.12, 0.34], [0.38, 0.34]]),
      S([[0.46, 0.2], [0.76, 0.2], [0.76, 0.62], [0.44, 0.82]]),
    ],
  },
  // 勾：勹内厶
  gou: {
    strokes: [
      S([[0.3, 0.16], [0.76, 0.16], [0.76, 0.55], [0.3, 0.84]]),
      S([[0.42, 0.42], [0.64, 0.42], [0.42, 0.6], [0.66, 0.6]]),
    ],
  },
  // 剔：易旁简化
  ti: {
    strokes: [
      S([[0.2, 0.22], [0.8, 0.22]]),
      S([[0.3, 0.4], [0.7, 0.4]]),
      S([[0.36, 0.14], [0.36, 0.7]]),
      S([[0.58, 0.14], [0.58, 0.7]]),
      S([[0.28, 0.72], [0.72, 0.86]]),
    ],
  },
  // 打：丁旁
  da: {
    strokes: [
      S([[0.2, 0.22], [0.55, 0.22]]),
      S([[0.4, 0.22], [0.4, 0.55]]),
      S([[0.34, 0.55], [0.8, 0.84]]),
    ],
  },
  // 摘：啇旁简化
  zhai: {
    strokes: [
      S([[0.24, 0.16], [0.76, 0.16]]),
      S([[0.5, 0.16], [0.5, 0.84]]),
      S([[0.24, 0.4], [0.76, 0.4]]),
      S([[0.32, 0.62], [0.68, 0.62]]),
      S([[0.36, 0.82], [0.64, 0.82]]),
    ],
  },
  // 轮：轮旁（车+仑简化）
  lun: {
    strokes: [
      S([[0.22, 0.2], [0.55, 0.2]]),
      S([[0.38, 0.12], [0.38, 0.55]]),
      S([[0.24, 0.36], [0.52, 0.36]]),
      S([[0.22, 0.55], [0.55, 0.55]]),
      S([[0.66, 0.2], [0.82, 0.2], [0.62, 0.48], [0.84, 0.48]]),
      S([[0.6, 0.66], [0.86, 0.66]]),
    ],
  },
  // 拨：发旁简化
  bo: {
    strokes: [
      S([[0.18, 0.24], [0.48, 0.18]]),
      S([[0.26, 0.42], [0.56, 0.36]]),
      S([[0.2, 0.62], [0.5, 0.56]]),
      S([[0.6, 0.16], [0.78, 0.16], [0.78, 0.7], [0.58, 0.84]]),
      S([[0.58, 0.44], [0.84, 0.44]]),
    ],
  },
};

/** 左手指法（大/食/中/名 减字），四者采用差异最大的拓扑结构 */
const LEFT_GLYPHS: Record<string, Glyph> = {
  // 大：撇 + 捺（纯两条斜线，无横无竖，独占此特征）
  da: {
    strokes: [
      S([[0.5, 0.14], [0.2, 0.82]]),
      S([[0.5, 0.4], [0.82, 0.82]]),
    ],
  },
  // 食：人字头 + 下方两横（顶部人字，区别于名的夕）
  shi: {
    strokes: [
      S([[0.22, 0.22], [0.5, 0.42], [0.78, 0.22]]),
      S([[0.3, 0.56], [0.72, 0.56]]),
      S([[0.34, 0.76], [0.68, 0.76]]),
    ],
  },
  // 中：封闭扁框 + 上下贯穿竖（唯一带封闭框的左指）
  zhong: {
    strokes: [
      S([[0.5, 0.12], [0.5, 0.88]]),
      S([[0.28, 0.34], [0.72, 0.34], [0.72, 0.62], [0.28, 0.62], [0.28, 0.34]]),
    ],
  },
  // 名：夕（斜框带内点）+ 下方口，笔画数最多
  ming: {
    strokes: [
      S([[0.32, 0.16], [0.7, 0.2], [0.42, 0.42]]),
      S([[0.42, 0.3], [0.6, 0.46]]),
      S([[0.34, 0.58], [0.74, 0.58], [0.74, 0.84], [0.34, 0.84], [0.34, 0.58]]),
      S([[0.44, 0.58], [0.44, 0.84]]),
    ],
  },
};

/** 发声标记：散（艹头）、泛（泛减字） */
const KIND_GLYPHS: Record<string, Glyph> = {
  san: {
    strokes: [
      S([[0.18, 0.3], [0.44, 0.3]]),
      S([[0.56, 0.3], [0.82, 0.3]]),
      S([[0.32, 0.16], [0.32, 0.55]]),
      S([[0.68, 0.16], [0.68, 0.55]]),
      S([[0.3, 0.75], [0.7, 0.75]]),
    ],
  },
  fan: {
    strokes: [
      S([[0.2, 0.2], [0.5, 0.2]]),
      S([[0.35, 0.12], [0.35, 0.45]]),
      S([[0.55, 0.32], [0.82, 0.55], [0.62, 0.55], [0.84, 0.82]]),
    ],
  },
};

/** 装饰记号 */
const ORN_GLYPHS: Record<string, Glyph> = {
  // 绰：上挑折笔
  chuo: { strokes: [S([[0.2, 0.82], [0.5, 0.5], [0.8, 0.22]]), S([[0.5, 0.5], [0.78, 0.52]])] },
  // 注：下捺折笔
  zhu: { strokes: [S([[0.2, 0.22], [0.5, 0.5], [0.8, 0.82]]), S([[0.5, 0.5], [0.78, 0.48]])] },
  // 吟：今旁
  yin: {
    strokes: [
      S([[0.28, 0.22], [0.5, 0.4], [0.74, 0.22]]),
      S([[0.5, 0.4], [0.5, 0.84]]),
      S([[0.3, 0.6], [0.7, 0.6]]),
    ],
  },
  // 猱：柔旁（弯钩加撇）
  rou: {
    strokes: [
      S([[0.62, 0.14], [0.62, 0.7]]),
      S([[0.3, 0.28], [0.78, 0.28]]),
      S([[0.38, 0.28], [0.38, 0.6], [0.62, 0.6], [0.62, 0.78], [0.4, 0.84]]),
      S([[0.24, 0.44], [0.14, 0.7]]),
    ],
  },
  // 逗：豆旁
  dou: {
    strokes: [
      S([[0.28, 0.18], [0.72, 0.18]]),
      S([[0.5, 0.18], [0.5, 0.36]]),
      S([[0.24, 0.36], [0.76, 0.36]]),
      S([[0.32, 0.55], [0.68, 0.55], [0.68, 0.82], [0.32, 0.82], [0.32, 0.55]]),
    ],
  },
  // 撞：童旁简化
  zhuang: {
    strokes: [
      S([[0.28, 0.16], [0.72, 0.16]]),
      S([[0.5, 0.16], [0.5, 0.34]]),
      S([[0.22, 0.34], [0.78, 0.34]]),
      S([[0.3, 0.5], [0.7, 0.5]]),
      S([[0.36, 0.5], [0.36, 0.84]]),
      S([[0.52, 0.5], [0.52, 0.84]]),
      S([[0.66, 0.5], [0.66, 0.84]]),
    ],
  },
};

export function getGlyph(slot: string, label: string): Glyph {
  if (slot === 'right') return RIGHT_GLYPHS[label];
  if (slot === 'leftFinger') return LEFT_GLYPHS[label];
  if (slot === 'kindMark') return KIND_GLYPHS[label];
  if (slot === 'orn1' || slot === 'orn2') return ORN_GLYPHS[label];
  if (slot === 'string') return NUM_GLYPHS[Number(label)];
  if (slot === 'hui') {
    const [h, f] = label.split('-').map(Number);
    if (!f) return NUM_GLYPHS[h];
    // 带分：上下两个数字合成
    return composeFen(NUM_GLYPHS[h], NUM_GLYPHS[f]);
  }
  throw new Error(`未知槽位/标签：${slot}/${label}`);
}

/**
 * 徽分复合字：上徽数、下分数严格分居上下半区（y=0.5 为界），
 * 使识别端可用“下半区是否有墨”可靠区分整徽与带分徽位，
 * 再在各自半区内做数字识别。
 */
function composeFen(top: Glyph, bottom: Glyph): Glyph {
  const place = (g: Glyph, y0: number, y1: number, s: number, ox: number): Glyph => {
    const sy = (y: number) => y0 + y * (y1 - y0);
    return {
      strokes: g.strokes.map((st) => ({
        pts: st.pts.map(([x, y]) => [ox + x * s, sy(y)] as [number, number]),
      })),
      dots: g.dots?.map((d) => ({ x: ox + d.x * s, y: sy(d.y), r: d.r * s })),
    };
  };
  const g1 = place(top, 0.04, 0.46, 0.72, 0.14);
  const g2 = place(bottom, 0.56, 0.96, 0.62, 0.19);
  return {
    strokes: [...g1.strokes, ...g2.strokes],
    dots: [...(g1.dots ?? []), ...(g2.dots ?? [])],
  };
}

export type DrawCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type DrawCanvas = HTMLCanvasElement | OffscreenCanvas;

/** 把一个 glyph 画到给定 2D 上下文的指定像素矩形内 */
export function drawGlyph(
  ctx: DrawCtx,
  glyph: Glyph,
  px: number,
  py: number,
  pw: number,
  ph: number,
  font: FontStyle,
  color: string,
): void {
  const params = FONT_PARAMS[font];
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1, params.strokeWidth * Math.min(pw, ph));
  ctx.lineCap = params.rounded ? 'round' : 'square';
  ctx.lineJoin = params.rounded ? 'round' : 'miter';

  // 倾斜与轻微收缩（留边距）
  const pad = 0.08;
  const aw = pw * (1 - 2 * pad);
  const ah = ph * (1 - 2 * pad);
  const ox = px + pw * pad;
  const oy = py + ph * pad;
  const mapX = (x: number, y: number) =>
    ox + (x + params.slant * (y - 0.5) * 2) * aw;
  const mapY = (y: number) => oy + y * ah;

  for (const st of glyph.strokes) {
    ctx.beginPath();
    st.pts.forEach(([x, y], i) => {
      const X = mapX(x, y);
      const Y = mapY(y);
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    });
    ctx.stroke();
  }
  for (const d of glyph.dots ?? []) {
    ctx.beginPath();
    ctx.arc(mapX(d.x, d.y), mapY(d.y), Math.max(0.8, d.r * Math.min(aw, ah)), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
