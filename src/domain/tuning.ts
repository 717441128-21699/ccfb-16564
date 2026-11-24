/**
 * 定弦与音高推算。
 */
import type { JianziChar, Note, SoundKind } from './types';
import { huiToHarmonic, huiToRatio } from './hui';

/** 正调（F 调）七弦空弦频率：C D F G A c d，一弦 C2 */
const ZHENG_DIAO = [65.4064, 73.4162, 87.3071, 97.9989, 110.0, 130.8128, 146.8324];

/** 慢角调：三弦慢一徽（降半音），C D E G A c d */
const MAN_JUE = [65.4064, 73.4162, 82.4069, 97.9989, 110.0, 130.8128, 146.8324];

/** 蕤宾调（紧五弦）：五弦紧半音，C D F G B♭ c d */
const RUI_BIN = [65.4064, 73.4162, 87.3071, 97.9989, 116.5409, 130.8128, 146.8324];

/** 清商调：紧二、五、七弦 */
const QING_SHANG = [65.4064, 77.7817, 87.3071, 97.9989, 116.5409, 130.8128, 155.5635];

export interface Tuning {
  id: string;
  name: string;
  /** 一至七弦空弦频率 */
  openStrings: number[];
}

export const TUNINGS: Record<string, Tuning> = {
  zheng: { id: 'zheng', name: '正调（F 调）', openStrings: ZHENG_DIAO },
  manjue: { id: 'manjue', name: '慢角调（C 调）', openStrings: MAN_JUE },
  ruibin: { id: 'ruibin', name: '蕤宾调（降 B 调）', openStrings: RUI_BIN },
  qingshang: { id: 'qingshang', name: '清商调（降 E 调）', openStrings: QING_SHANG },
};

export const DEFAULT_TUNING = 'zheng';

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** 频率 → 最近十二平均律音名与音分偏差 */
export function frequencyToNoteName(freq: number): { noteName: string; cents: number } {
  const midiFloat = 69 + 12 * Math.log2(freq / 440);
  const midi = Math.round(midiFloat);
  const cents = Math.round((midiFloat - midi) * 100);
  const name = SHARP_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return { noteName: `${name}${octave}`, cents };
}

/**
 * 单个减字 → 音高。
 * @param tuningId 定弦 id
 */
export function charToNote(ch: JianziChar, tuningId: string = DEFAULT_TUNING): Note {
  const tuning = TUNINGS[tuningId] ?? TUNINGS[DEFAULT_TUNING];
  const open = tuning.openStrings[ch.string - 1];
  const kind: SoundKind = ch.kind;
  let frequency: number;
  let ratio: number | undefined;
  let harmonic: number | undefined;

  if (kind === 'san') {
    frequency = open;
  } else if (kind === 'fan') {
    // 泛音只能取整徽；识别出带分徽位时回退到最近整徽的谐波，保证管线不中断
    const hui = ch.hui ?? { hui: 7, fen: 0 };
    const rounded = hui.fen === 0 ? hui : { hui: clampHui(hui.hui), fen: 0 };
    const n = huiToHarmonic(rounded) ?? 2;
    harmonic = n;
    frequency = open * n;
  } else {
    if (!ch.hui) throw new Error('按音缺少徽位');
    ratio = huiToRatio(ch.hui);
    frequency = open / ratio;
  }

  const { noteName, cents } = frequencyToNoteName(frequency);
  return {
    charId: ch.id,
    column: ch.column,
    row: ch.row,
    string: ch.string,
    kind,
    right: ch.right,
    left: ch.left,
    hui: ch.hui,
    ornaments: [...ch.ornaments],
    ratio,
    harmonic,
    frequency: Math.round(frequency * 100) / 100,
    noteName,
    cents,
  };
}

function clampHui(hui: number): number {
  return Math.max(1, Math.min(13, hui));
}

export function charsToNotes(chars: JianziChar[], tuningId: string = DEFAULT_TUNING): Note[] {
  return chars.map((ch) => charToNote(ch, tuningId));
}
