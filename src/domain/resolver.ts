/**
 * 承前消解状态机。
 *
 * 琴谱惯例（本系统采用的简化规则，与《琴学入门》一类教本的通行处理一致）：
 *  - 承前只在同一列内生效；换列后状态重置，列首各槽位必须齐全。
 *  - 右手指法、弦序、左手指法、徽位、发声标记（散/泛）省略时承上一字。
 *  - 装饰记号（绰注吟猱等）逐字标注，空即无，不承前。
 *  - 散音无左手/徽位；泛音必有徽位；按音必有左手与徽位。
 */
import type {
  JianziChar,
  LeftFinger,
  Ornament,
  RawRecognizedChar,
  RecognizedChar,
  RightFinger,
  SlotName,
  SoundKind,
} from './types';

interface CarriedState {
  right: RightFinger | null;
  string: number | null;
  left: LeftFinger | null;
  huiHui: number | null;
  huiFen: number | null;
  kind: SoundKind | null;
}

const EMPTY_STATE: CarriedState = {
  right: null,
  string: null,
  left: null,
  huiHui: null,
  huiFen: null,
  kind: null,
};

function obsLabel(raw: RawRecognizedChar, slot: SlotName): string | null {
  return raw.observations.find((o) => o.slot === slot)?.label ?? null;
}

/** 解析一整列（按阅读顺序：从右列到左列，列内自上而下） */
export function resolveColumn(rows: RawRecognizedChar[]): RecognizedChar[] {
  const carry: CarriedState = { ...EMPTY_STATE };
  const out: RecognizedChar[] = [];

  rows.forEach((raw, idx) => {
    const kind = (obsLabel(raw, 'kindMark') as SoundKind | null) ?? carry.kind ?? 'an';

    const right = (obsLabel(raw, 'right') as RightFinger | null) ?? carry.right;
    const stringLab = obsLabel(raw, 'string');
    const string = stringLab === null ? carry.string : Number(stringLab);

    const left = (obsLabel(raw, 'leftFinger') as LeftFinger | null) ?? carry.left;
    const huiLab = obsLabel(raw, 'hui');
    let hui =
      huiLab === null
        ? carry.huiHui === null
          ? null
          : { hui: carry.huiHui, fen: carry.huiFen ?? 0 }
        : parseHuiLabel(huiLab);

    // 散音没有左手徽位；防御性纠正
    if (kind === 'san') {
      hui = null;
    }
    if ((kind === 'an' || kind === 'fan') && hui === null) {
      // 数据异常时回退到七徽，避免管线中断
      hui = { hui: 7, fen: 0 };
    }

    const ornaments: Ornament[] = [];
    const o1 = obsLabel(raw, 'orn1') as Ornament | null;
    const o2 = obsLabel(raw, 'orn2') as Ornament | null;
    if (o1) ornaments.push(o1);
    if (o2) ornaments.push(o2);

    // 容错：识别异常时回退到承前值或常见组合，保证管线不中断；
    // 该字会在评测中被计为错误，便于暴露识别问题。
    const finalRight: RightFinger = right ?? carry.right ?? 'gou';
    const finalString: number = string === null ? (carry.string ?? 1) : string;

    const resolved: JianziChar = {
      id: `c${raw.column}r${raw.row}`,
      column: raw.column,
      row: raw.row,
      right: finalRight,
      string: finalString,
      kind,
      left: kind === 'san' ? undefined : (left ?? 'da'),
      hui: hui ?? undefined,
      ornaments,
    };

    // 更新承前状态
    carry.kind = kind;
    carry.right = finalRight;
    carry.string = finalString;
    if (kind !== 'san') {
      if (left) carry.left = left;
      if (hui) {
        carry.huiHui = hui.hui;
        carry.huiFen = hui.fen;
      }
    }

    out.push({ box: raw.box, column: raw.column, row: raw.row, raw, resolved });
    void idx;
  });

  return out;
}

export function resolveAll(raws: RawRecognizedChar[]): RecognizedChar[] {
  const byColumn = new Map<number, RawRecognizedChar[]>();
  for (const r of raws) {
    const list = byColumn.get(r.column) ?? [];
    list.push(r);
    byColumn.set(r.column, list);
  }
  const cols = [...byColumn.keys()].sort((a, b) => a - b);
  const out: RecognizedChar[] = [];
  for (const c of cols) {
    const rows = byColumn.get(c)!.sort((a, b) => a.row - b.row);
    out.push(...resolveColumn(rows));
  }
  return out;
}

/** 徽位标签格式："7" 或 "7-6"（七徽六分）、"14"（徽外） */
export function huiLabel(hui: number, fen: number): string {
  return fen === 0 ? String(hui) : `${hui}-${fen}`;
}

export function parseHuiLabel(label: string): { hui: number; fen: number } {
  const [h, f] = label.split('-');
  return { hui: Number(h), fen: f ? Number(f) : 0 };
}
