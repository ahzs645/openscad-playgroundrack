import JsonUrl from '@firstform/json-url';
import { State } from './app-state.ts';
import { Parameter } from './customizer-types.ts';

const SHARE_PARAM = 'share';
const codec = JsonUrl('lzstring');

export type SharePayload = {
  v: 1;
  vars: { [name: string]: any };
};

function valuesEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!valuesEqual(a[i], b[i])) return false;
    }
    return true;
  }
  return false;
}

export function computeChangedVars(state: State): { [name: string]: any } {
  const parameters: Parameter[] = state.parameterSet?.parameters ?? [];
  const vars = state.params.vars ?? {};
  const changed: { [name: string]: any } = {};
  for (const param of parameters) {
    const current = vars[param.name];
    if (current === undefined) continue;
    if (!valuesEqual(current, param.initial)) {
      changed[param.name] = current;
    }
  }
  return changed;
}

export function getModelIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('model');
}

export async function buildShareUrl(state: State): Promise<string | null> {
  const changed = computeChangedVars(state);
  if (Object.keys(changed).length === 0) return null;
  const modelId = getModelIdFromUrl();
  if (!modelId) return null;
  const payload: SharePayload = { v: 1, vars: changed };
  const compressed = await codec.compress(payload as any);
  const params = new URLSearchParams();
  params.set('model', modelId);
  params.set(SHARE_PARAM, compressed);
  return `${location.protocol}//${location.host}${location.pathname}?${params.toString()}`;
}

export async function readShareFromQuery(): Promise<SharePayload | null> {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const token = params.get(SHARE_PARAM);
  if (!token) return null;
  try {
    const decoded = (await codec.decompress(token)) as SharePayload;
    if (!decoded || typeof decoded !== 'object' || !decoded.vars) return null;
    return decoded;
  } catch (e) {
    console.warn('Failed to decode share link:', e);
    return null;
  }
}

export function stripShareFromUrl() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (!params.has(SHARE_PARAM)) return;
  params.delete(SHARE_PARAM);
  const query = params.toString();
  const newUrl = `${location.pathname}${query ? '?' + query : ''}${location.hash}`;
  window.history.replaceState(null, '', newUrl);
}
