/**
 * 合成刻本的纯逻辑层：生成带部件级真值的减字序列。
 * 不依赖 Canvas，可在 Node 下单测；渲染见 synth/render.ts。
 */
import type {
  CharGroundTruth,
  DegradationLevel,
  FontStyle,
  HuiPosition,
  LeftFinger,
  Ornament,
  PageGroundTruth,
  Rect,
  RedMark,
  RightFinger,
  SlotName,
  SoundKind,
} from '../domain/types';
import { Rng } from '../domain/rng';
import {
  FEN_LIST,
  HUI_LIST,
  HUI_WAI,
  LEFT_FINGERS,
  ORN_LEFT,
  ORN_RIGHT,
  RIGHT_FINGERS,
  STRINGS,
  ZONES,
} from '../vision/vocab';
import { huiLabel } from '../domain/resolver';

export const PAGE_W = 1200;
export const PAGE_H = 1600;
const FRAME_MARGIN_X = 70;
const FRAME_MARGIN_TOP = 90;
const FRAME_MARGIN_BOTTOM = 110;
const COLUMN_COUNT = 8;
const COLUMN_GAP = 18;
const ROW_COUNT = 10;
const ROW_GAP = 10;

/** 各退化等级下的省略概率（承前写法） */
const OMIT_RATE: Record<DegradationLevel, number> = {
  clean: 0.12,
  normal: 0.22,
  heavy: 0.3,
};

interface CharSpec {
  right: RightFinger;
  string: number;
  kind: SoundKind;
  left: LeftFinger;
  hui: HuiPosition;
  ornaments: Ornament[];
  omitted: SlotName[];
}

function randomHui(rng: Rng): HuiPosition {
  if (rng.chance(0.08)) return { hui: HUI_WAI, fen: 0 };
  const hui = rng.pick(HUI_LIST);
  const fen = rng.chance(0.45) ? rng.pick([2, 4, 6, 8] as const) : 0;
  return { hui, fen };
}

/**
 * 生成一页字的语义序列（列优先：先定整列，列内自上而下）。
 * 省略槽位严格遵守承前规则：每列首字不省略必需槽位。
 */
export function generateCharSpecs(rng: Rng, degradation: DegradationLevel): CharSpec[][] {
  const omitRate = OMIT_RATE[degradation];
  const columns: CharSpec[][] = [];

  for (let c = 0; c < COLUMN_COUNT; c++) {
    const rows: CharSpec[] = [];
    let prev: CharSpec | null = null;

    for (let r = 0; r < ROW_COUNT; r++) {
      const kind: SoundKind = rng.chance(0.16)
        ? 'san'
        : rng.chance(0.18)
          ? 'fan'
          : 'an';
      const right = rng.pick(RIGHT_FINGERS);
      const string = rng.pick([...STRINGS]);
      const left = rng.pick([...LEFT_FINGERS]);
      const hui = kind === 'san' ? { hui: 0, fen: 0 } : randomHui(rng);
      const ornaments: Ornament[] = [];
      if (kind === 'an') {
        if (rng.chance(0.3)) ornaments.push(rng.pick([...ORN_LEFT]));
        if (rng.chance(0.3)) ornaments.push(rng.pick([...ORN_RIGHT]));
      }

      const spec: CharSpec = {
        right,
        string,
        kind,
        left,
        hui,
        ornaments,
        omitted: [],
      };

      // 省略判定（列首不省必需槽位）
      if (prev && r > 0) {
        const tryOmit = (slot: SlotName, canOmit: boolean) => {
          if (canOmit && rng.chance(omitRate)) spec.omitted.push(slot);
        };
        tryOmit('right', prev.right === spec.right);
        tryOmit('string', prev.string === spec.string);
        tryOmit(
          'kindMark',
          prev.kind === spec.kind && (spec.kind !== 'an' || true),
        );
        if (spec.kind !== 'san') {
          tryOmit('leftFinger', prev.left === spec.left);
          tryOmit(
            'hui',
            prev.hui.hui === spec.hui.hui && prev.hui.fen === spec.hui.fen,
          );
        }
        // 按音标记（an）本来就不画 kindMark：归一到 omitted
        if (spec.kind === 'an' && !spec.omitted.includes('kindMark')) {
          spec.omitted.push('kindMark');
        }
      } else if (spec.kind === 'an') {
        spec.omitted.push('kindMark');
      }

      // 散音的左手/徽位本就为空槽
      if (spec.kind === 'san') {
        if (!spec.omitted.includes('leftFinger')) spec.omitted.push('leftFinger');
        if (!spec.omitted.includes('hui')) spec.omitted.push('hui');
      }

      rows.push(spec);
      prev = spec;
    }
    columns.push(rows);
  }
  return columns;
}

/** 计算版框、列框、行格线与每字像素框 */
export function computeLayout(fontStyle: FontStyle): Pick<
  PageGroundTruth,
  'frame' | 'columns' | 'rowLines'
> & { charBoxes: Rect[][]; charCell: number } {
  const frame: Rect = {
    x: FRAME_MARGIN_X,
    y: FRAME_MARGIN_TOP,
    w: PAGE_W - FRAME_MARGIN_X * 2,
    h: PAGE_H - FRAME_MARGIN_TOP - FRAME_MARGIN_BOTTOM,
  };
  const innerPad = 22;
  const innerX = frame.x + innerPad;
  const innerW = frame.w - innerPad * 2;
  const innerH = frame.h - innerPad * 2;
  const colW = (innerW - COLUMN_GAP * (COLUMN_COUNT - 1)) / COLUMN_COUNT;
  const charCell = Math.min(colW, (innerH - ROW_GAP * (ROW_COUNT - 1)) / ROW_COUNT);
  const gridH = charCell * ROW_COUNT + ROW_GAP * (ROW_COUNT - 1);
  const gridTop = frame.y + innerPad + (innerH - gridH) / 2;

  const columns: Rect[] = [];
  const charBoxes: Rect[][] = [];
  // 刻本列从右向左排列
  for (let c = 0; c < COLUMN_COUNT; c++) {
    const visualLeft = innerX + (COLUMN_COUNT - 1 - c) * (colW + COLUMN_GAP);
    columns.push({ x: visualLeft, y: frame.y + innerPad, w: colW, h: gridH });
    const boxes: Rect[] = [];
    for (let r = 0; r < ROW_COUNT; r++) {
      const y = gridTop + r * (charCell + ROW_GAP);
      boxes.push({ x: visualLeft + (colW - charCell) / 2, y, w: charCell, h: charCell });
    }
    charBoxes.push(boxes);
  }

  const rowLines: number[] = [];
  for (let r = 0; r <= ROW_COUNT; r++) {
    rowLines.push(gridTop - ROW_GAP / 2 + r * (charCell + ROW_GAP));
  }

  return { frame, columns, rowLines, charBoxes, charCell };
}

/** 生成朱笔句读与旁注的位置（落在列间空白与字边，不压字心） */
export function generateRedMarks(rng: Rng, charBoxes: Rect[][], columns: Rect[]): RedMark[] {
  const marks: RedMark[] = [];
  // 句读：圈在随机字的右下方
  const judouCount = 5 + rng.int(0, 4);
  for (let i = 0; i < judouCount; i++) {
    const c = rng.int(0, COLUMN_COUNT);
    const r = rng.int(0, ROW_COUNT);
    const box = charBoxes[c][r];
    const size = 16 + rng.int(0, 6);
    marks.push({
      kind: 'judou',
      box: {
        x: box.x + box.w - size * 0.4,
        y: box.y + box.h - size * 0.4,
        w: size,
        h: size,
      },
    });
  }
  // 旁注：写在列间 gutter 的竖排小字
  const pangzhuCount = 1 + rng.int(0, 2);
  for (let i = 0; i < pangzhuCount; i++) {
    const gapIdx = rng.int(1, COLUMN_COUNT);
    const gx = columns[gapIdx - 1].x - COLUMN_GAP / 2 - 7;
    const gy = columns[0].y + rng.int(0, 200);
    marks.push({
      kind: 'pangzhu',
      box: { x: gx, y: gy, w: 14, h: 90 + rng.int(0, 60) },
      text: '注',
    });
  }
  return marks;
}

/** 组装整页真值 */
export function buildPageGroundTruth(
  fontStyle: FontStyle,
  degradation: DegradationLevel,
  seed: number,
): PageGroundTruth {
  const rng = new Rng(seed);
  const specs = generateCharSpecs(rng, degradation);
  const layout = computeLayout(fontStyle);
  const redMarks = generateRedMarks(rng, layout.charBoxes, layout.columns);

  const chars: CharGroundTruth[] = [];
  for (let c = 0; c < COLUMN_COUNT; c++) {
    for (let r = 0; r < ROW_COUNT; r++) {
      const spec = specs[c][r];
      const box = layout.charBoxes[c][r];
      const zones: CharGroundTruth['zones'] = {};
      for (const slot of Object.keys(ZONES) as SlotName[]) {
        if (spec.omitted.includes(slot)) continue;
        const z = ZONES[slot];
        zones[slot] = {
          x: box.x + z.x * box.w,
          y: box.y + z.y * box.h,
          w: z.w * box.w,
          h: z.h * box.h,
        };
      }
      chars.push({
        id: `c${c}r${r}`,
        column: c,
        row: r,
        right: spec.right,
        string: spec.string,
        kind: spec.kind,
        left: spec.kind === 'san' ? undefined : spec.left,
        hui: spec.kind === 'san' ? undefined : spec.hui,
        ornaments: spec.ornaments,
        box,
        omitted: spec.omitted,
        zones,
      });
    }
  }

  return {
    width: PAGE_W,
    height: PAGE_H,
    fontStyle,
    frame: layout.frame,
    columns: layout.columns,
    rowLines: layout.rowLines,
    chars,
    redMarks,
    degradation,
    seed,
  };
}

/** 真值转识别标签（供评测与渲染共用） */
export function slotLabel(
  slot: SlotName,
  ch: CharGroundTruth,
): string | null {
  if (ch.omitted.includes(slot)) return null;
  switch (slot) {
    case 'right':
      return ch.right;
    case 'string':
      return String(ch.string);
    case 'leftFinger':
      return ch.left ?? null;
    case 'hui':
      return ch.hui ? huiLabel(ch.hui.hui, ch.hui.fen) : null;
    case 'kindMark':
      return ch.kind === 'an' ? null : ch.kind;
    case 'orn1':
      return ch.ornaments.find((o) => ORN_LEFT.includes(o as (typeof ORN_LEFT)[number])) ?? null;
    case 'orn2':
      return ch.ornaments.find((o) => ORN_RIGHT.includes(o as (typeof ORN_RIGHT)[number])) ?? null;
  }
}

export { FEN_LIST };
