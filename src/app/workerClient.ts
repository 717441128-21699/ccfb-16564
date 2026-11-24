/**
 * 管线 Worker 客户端封装。
 */
import type { PipelineResult, WorkerOutMessage } from '../domain/types';
import PipelineWorker from '../vision/pipeline.worker.ts?worker';

export function runPipelineInWorker(bitmap: ImageBitmap): Promise<PipelineResult> {
  return new Promise((resolve, reject) => {
    const worker = new PipelineWorker();
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('管线执行超时（10s）'));
    }, 10000);

    worker.onmessage = (ev: MessageEvent<WorkerOutMessage>) => {
      const msg = ev.data;
      if (msg.type === 'done') {
        clearTimeout(timer);
        worker.terminate();
        resolve(msg.result);
      } else if (msg.type === 'error') {
        clearTimeout(timer);
        worker.terminate();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error(e.message));
    };
    worker.postMessage({ type: 'run', bitmap }, [bitmap]);
  });
}
