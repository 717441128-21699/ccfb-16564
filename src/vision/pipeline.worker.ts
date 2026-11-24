/// <reference lib="webworker" />
/**
 * 视觉管线 Web Worker（ES module）。
 * 识别与拆解全部在本线程完成，避免阻塞 UI。
 */
import type { PipelineRequest, WorkerOutMessage } from '../domain/types';
import { runPipeline } from './pipeline';
import { CharRecognizer } from './recognizer';
import type { FontStyle } from '../domain/types';

const recognizer = new CharRecognizer(['fangti', 'yuanti', 'shouti'] as FontStyle[]);

function post(msg: WorkerOutMessage) {
  (self as unknown as Worker).postMessage(msg);
}

self.onmessage = (ev: MessageEvent<PipelineRequest>) => {
  const req = ev.data;
  if (req.type === 'cancel') return;
  try {
    post({ type: 'progress', stage: 'pipeline', elapsed: 0 });
    const result = runPipeline(req.bitmap, 'zheng', recognizer);
    post({ type: 'done', result });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
