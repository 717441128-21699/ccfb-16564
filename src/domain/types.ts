/**
 * 古琴减字谱打谱工具 —— 领域类型定义
 *
 * 减字谱一个字的逻辑结构：
 *   上半：左手徽位（几徽几分）+ 左手指法（大/食/中/名）
 *   下半：右手指法（勾剔抹挑…）+ 弦序（一至七弦）
 *   附加：绰/注/吟/猱/逗/撞 等装饰记号
 *   特殊：散音（空弦）、泛音（轻触徽位）
 */

/** 右手指法 */
export type RightFinger =
  | 'mo' // 抹
  | 'tiao' // 挑
  | 'gou' // 勾
  | 'ti' // 剔
  | 'da' // 打
  | 'zhai' // 摘
  | 'lun' // 轮
  | 'bo'; // 拨

/** 左手指法 */
export type LeftFinger =
  | 'da' // 大指
  | 'shi' // 食指
  | 'zhong' // 中指
  | 'ming'; // 名指

/** 装饰记号 */
export type Ornament =
  | 'chuo' // 绰
  | 'zhu' // 注
  | 'yin' // 吟
  | 'rou' // 猱
  | 'dou' // 逗
  | 'zhuang'; // 撞

/** 发声方式：散音 / 泛音 / 按音 */
export type SoundKind = 'san' | 'fan' | 'an';

/** 三种程序化刻本字体风格 */
export type FontStyle = 'fangti' | 'yuanti' | 'shouti';

/** 徽位（几徽几分）。hui=14 保留给“徽外” */
export interface HuiPosition {
  /** 1..13；14 表示徽外 */
  hui: number;
  /** 0 表示整徽；2/4/6/8 表示几分 */
  fen: number;
}

/** 矩形（像素坐标，图像左上角为原点） */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 一个减字的逻辑表示（承前消解之后的完整语义） */
export interface JianziChar {
  id: string;
  /** 版面位置：列（从右往左 0 起）、行（从上往下 0 起） */
  column: number;
  row: number;
  right: RightFinger;
  string: number; // 1..7
  kind: SoundKind;
  /** 按音/泛音时的左手指法（泛音仅作记录，不参与按音计算） */
  left?: LeftFinger;
  /** 按音/泛音徽位；散音为 undefined */
  hui?: HuiPosition;
  /** 装饰记号，最多两个 */
  ornaments: Ornament[];
}

/** 合成时刻意省略的部件槽位（承前写法） */
export type SlotName =
  | 'right'
  | 'string'
  | 'leftFinger'
  | 'hui'
  | 'kindMark'
  | 'orn1'
  | 'orn2';

/** 合成页面中单个字的真值 */
export interface CharGroundTruth extends JianziChar {
  box: Rect;
  /** 被省略（不画出来）的槽位 */
  omitted: SlotName[];
  /** 各部件槽位在字框内的分区（归一化坐标 0..1） */
  zones: Partial<Record<SlotName, Rect>>;
}

/** 朱笔批注 */
export interface RedMark {
  box: Rect;
  kind: 'judou' | 'pangzhu';
  text?: string;
}

/** 一整张合成刻本页面的真值 */
export interface PageGroundTruth {
  width: number;
  height: number;
  fontStyle: FontStyle;
  frame: Rect;
  columns: Rect[];
  /** 行格横线所在 y 坐标 */
  rowLines: number[];
  chars: CharGroundTruth[];
  redMarks: RedMark[];
  /** 退化参数 */
  degradation: DegradationLevel;
  seed: number;
}

export type DegradationLevel = 'clean' | 'normal' | 'heavy';

/** 识别器对单个槽位的输出 */
export interface SlotObservation {
  slot: SlotName;
  /** 识别标签；null 表示该槽位为空（省略） */
  label: string | null;
  /** 匹配得分 0..1 */
  score: number;
  box: Rect;
}

/** 承前消解之前的原始识别字 */
export interface RawRecognizedChar {
  box: Rect;
  column: number;
  row: number;
  observations: SlotObservation[];
}

/** 承前消解之后的识别字 */
export interface RecognizedChar {
  box: Rect;
  column: number;
  row: number;
  raw: RawRecognizedChar;
  resolved: JianziChar;
}

/** 音高谱中的一个音 */
export interface Note {
  charId: string;
  column: number;
  row: number;
  string: number;
  kind: SoundKind;
  right: RightFinger;
  left?: LeftFinger;
  hui?: HuiPosition;
  ornaments: Ornament[];
  /** 有效弦长比（相对十三徽位的整段） */
  ratio?: number;
  /** 泛音谐波序数 */
  harmonic?: number;
  /** 频率 Hz */
  frequency: number;
  /** 最近十二平均律音名，如 C3、F#4 */
  noteName: string;
  /** 与最近平均律音的音分偏差 */
  cents: number;
}

/** 视觉管线各阶段耗时（ms） */
export interface StageTiming {
  segment: number;
  layout: number;
  cutChars: number;
  recognize: number;
  resolve: number;
  pitch: number;
  total: number;
}

/** 管线最终结果 */
export interface PipelineResult {
  width: number;
  height: number;
  /** 墨色层（黑字二值图，ImageData 灰度） */
  ink: ImageData;
  /** 朱色层 */
  red: ImageData;
  frame: Rect;
  columns: Rect[];
  rowLines: number[];
  charBoxes: Rect[];
  recognized: RecognizedChar[];
  notes: Note[];
  timing: StageTiming;
}

/** Worker 请求消息 */
export type PipelineRequest =
  | {
      type: 'run';
      /** 刻本位图（RGBA） */
      bitmap: ImageBitmap;
    }
  | { type: 'cancel' };

/** Worker 进度消息 */
export interface PipelineProgress {
  type: 'progress';
  stage: string;
  elapsed: number;
}

export interface PipelineResponse {
  type: 'done';
  result: PipelineResult;
}

export interface PipelineError {
  type: 'error';
  message: string;
}

export type WorkerOutMessage = PipelineProgress | PipelineResponse | PipelineError;

/** 评测结果 */
export interface EvaluationReport {
  fontStyle: FontStyle;
  degradation: DegradationLevel;
  pageCount: number;
  charCount: number;
  /** 可见部件槽位识别正确率 */
  componentAccuracy: number;
  /** 省略槽位判空正确率 */
  omissionAccuracy: number;
  /** 整字完全正确率（含省略判定） */
  wholeCharAccuracy: number;
  /** 音高正确率（±50 音分） */
  pitchAccuracy: number;
  /** 平均端到端耗时 ms */
  avgLatencyMs: number;
  maxLatencyMs: number;
  detail: {
    componentTotal: number;
    componentCorrect: number;
    omissionTotal: number;
    omissionCorrect: number;
    wholeTotal: number;
    wholeCorrect: number;
    pitchTotal: number;
    pitchCorrect: number;
  };
}
