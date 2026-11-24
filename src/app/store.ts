/**
 * 全局应用状态（轻量发布订阅 store，无框架依赖）。
 */
import type {
  DegradationLevel,
  FontStyle,
  PageGroundTruth,
  PipelineResult,
} from '../domain/types';

export type PageView = 'import' | 'layout' | 'decompose' | 'pitch';

export interface AppState {
  view: PageView;
  fontStyle: FontStyle;
  degradation: DegradationLevel;
  seed: number;
  /** 用户上传的外部扫描图（无真值），与合成页二选一 */
  externalBitmap: ImageBitmap | null;
  externalName: string;
  groundTruth: PageGroundTruth | null;
  bitmap: ImageBitmap | null;
  result: PipelineResult | null;
  tuningId: string;
  /** 拆解页当前选中的字 */
  selectedCharId: string | null;
  /** 人工修正记录：charId -> slot -> label */
  corrections: Record<string, Partial<Record<string, string | null>>>;
  running: boolean;
  error: string | null;
}

type Listener = (s: AppState) => void;

const state: AppState = {
  view: 'import',
  fontStyle: 'fangti',
  degradation: 'normal',
  seed: 20260101,
  externalBitmap: null,
  externalName: '',
  groundTruth: null,
  bitmap: null,
  result: null,
  tuningId: 'zheng',
  selectedCharId: null,
  corrections: {},
  running: false,
  error: null,
};

const listeners = new Set<Listener>();

export function getState(): AppState {
  return state;
}

export function setState(patch: Partial<AppState>): void {
  Object.assign(state, patch);
  for (const l of listeners) l({ ...state });
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
