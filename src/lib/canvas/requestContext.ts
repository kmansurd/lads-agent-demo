import { AsyncLocalStorage } from 'node:async_hooks';
import { type CanvasConfig, resolveCanvasConfigFromRequest } from './config';
import { setRequestCanvasConfigGetter } from './canvasAuthBridge';

const canvasRequestConfig = new AsyncLocalStorage<CanvasConfig>();

setRequestCanvasConfigGetter(() => canvasRequestConfig.getStore());

/** Per-request Canvas credentials (in-memory only; never persisted). */
export function runWithCanvasConfig<T>(config: CanvasConfig, fn: () => T): T {
  return canvasRequestConfig.run(config, fn);
}

export function getRequestCanvasConfig(): CanvasConfig | undefined {
  return canvasRequestConfig.getStore();
}

export function resolveAndRunCanvasRoute<T>(
  request: Request,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  const config = resolveCanvasConfigFromRequest(request);
  if (!config) {
    throw new MissingCanvasAuthError();
  }
  return runWithCanvasConfig(config, fn);
}

export class MissingCanvasAuthError extends Error {
  constructor() {
    super(
      'Canvas access token required. Open Settings in the sidebar and paste your personal access token.',
    );
    this.name = 'MissingCanvasAuthError';
  }
}
