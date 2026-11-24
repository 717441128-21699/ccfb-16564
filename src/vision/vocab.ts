/**
 * 部件词表与字内分区几何（合成器与识别器共享的唯一事实来源）。
 *
 * 分区均为字框内归一化坐标（0..1），互不重叠并留 gutter，
 * 使识别器可以逐区做墨色覆盖判空 + 模板匹配。
 */
import type { FontStyle, Rect, SlotName } from '../domain/types';

export const RIGHT_FINGERS = ['mo', 'tiao', 'gou', 'ti', 'da', 'zhai', 'lun', 'bo'] as const;
export const LEFT_FINGERS = ['da', 'shi', 'zhong', 'ming'] as const;
export const STRINGS = [1, 2, 3, 4, 5, 6, 7] as const;
export const HUI_LIST = Array.from({ length: 13 }, (_, i) => i + 1);
export const HUI_WAI = 14;
export const FEN_LIST = [0, 2, 4, 6, 8] as const;
export const ORN_LEFT = ['chuo', 'zhu'] as const; // 占用 orn1 区（字左）
export const ORN_RIGHT = ['yin', 'rou', 'dou', 'zhuang'] as const; // 占用 orn2 区（字右）
export const KIND_MARKS = ['san', 'fan'] as const;

/** 字内分区（归一化）。各分区互不重叠并留 gutter，小尺寸槽位适当放大。 */
export const ZONES: Record<SlotName, Rect> = {
  kindMark: { x: 0.32, y: 0.03, w: 0.36, h: 0.18 },
  leftFinger: { x: 0.04, y: 0.04, w: 0.28, h: 0.3 },
  hui: { x: 0.66, y: 0.03, w: 0.33, h: 0.32 },
  orn1: { x: 0.0, y: 0.42, w: 0.17, h: 0.24 },
  right: { x: 0.19, y: 0.37, w: 0.4, h: 0.6 },
  string: { x: 0.6, y: 0.4, w: 0.24, h: 0.32 },
  orn2: { x: 0.83, y: 0.42, w: 0.17, h: 0.24 },
};

/** 三种字体的笔画参数 */
export const FONT_PARAMS: Record<
  FontStyle,
  { strokeWidth: number; rounded: boolean; slant: number; label: string }
> = {
  fangti: { strokeWidth: 0.115, rounded: false, slant: 0.0, label: '方体（万历风格）' },
  yuanti: { strokeWidth: 0.095, rounded: true, slant: 0.02, label: '圆体（乾隆风格）' },
  shouti: { strokeWidth: 0.07, rounded: false, slant: -0.05, label: '瘦体（嘉靖风格）' },
};

/** 某槽位的候选标签（识别模板匹配的词表） */
export function candidatesFor(slot: SlotName): string[] {
  switch (slot) {
    case 'right':
      return [...RIGHT_FINGERS];
    case 'string':
      return STRINGS.map(String);
    case 'leftFinger':
      return [...LEFT_FINGERS];
    case 'hui': {
      const labels = HUI_LIST.map(String);
      for (const h of HUI_LIST) {
        for (const f of [2, 4, 6, 8]) labels.push(`${h}-${f}`);
      }
      labels.push(String(HUI_WAI));
      return labels;
    }
    case 'kindMark':
      return [...KIND_MARKS];
    case 'orn1':
      return [...ORN_LEFT];
    case 'orn2':
      return [...ORN_RIGHT];
  }
}

export const ALL_SLOTS: SlotName[] = [
  'kindMark',
  'leftFinger',
  'hui',
  'orn1',
  'right',
  'string',
  'orn2',
];
