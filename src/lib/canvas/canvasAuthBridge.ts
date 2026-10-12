import type { CanvasConfig } from './config';

/**
 * Server routes register a per-request token reader here.
 * This file must not import Node-only modules so client bundles stay valid.
 */
let requestConfigGetter: (() => CanvasConfig | undefined) | null = null;

export function setRequestCanvasConfigGetter(getter: () => CanvasConfig | undefined): void {
  requestConfigGetter = getter;
}

export function readRequestCanvasConfig(): CanvasConfig | undefined {
  return requestConfigGetter?.();
}
