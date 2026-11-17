import type { Api } from '../../shared/api';

declare global {
  interface Window {
    api: Api;
  }
}

export const api: Api = window.api;

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
