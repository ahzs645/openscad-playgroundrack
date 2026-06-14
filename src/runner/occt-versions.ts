export type OcctWasmVersion = '3.3.1';

export type OcctWasmVersionOption = {
  version: OcctWasmVersion;
  label: string;
};

export const defaultOcctWasmVersion: OcctWasmVersion = '3.3.1';

export const occtWasmVersions: OcctWasmVersionOption[] = [
  { version: '3.3.1', label: 'OCCT WASM 3.3.1' },
];

export function normalizeOcctWasmVersion(value: unknown): OcctWasmVersion {
  return occtWasmVersions.some(option => option.version === value)
    ? value as OcctWasmVersion
    : defaultOcctWasmVersion;
}

export function loadStoredOcctWasmVersion(): OcctWasmVersion {
  if (typeof window === 'undefined') {
    return defaultOcctWasmVersion;
  }
  return normalizeOcctWasmVersion(window.localStorage.getItem('openscad-playground:occt-wasm-version'));
}

export function storeOcctWasmVersion(version: OcctWasmVersion) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('openscad-playground:occt-wasm-version', version);
  }
}
