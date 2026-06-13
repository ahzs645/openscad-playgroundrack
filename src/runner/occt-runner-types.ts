import { Parameter } from '../state/customizer-types.ts';
import { OcctWasmVersion } from './occt-versions.ts';

export type OcctWant = 'mesh' | 'stl' | 'step';

export type OcctWorkerRequest = {
  id: number,
  source: string,
  occtVersion: OcctWasmVersion,
  occtBaseUrl: string,
  vars?: { [name: string]: any },
  want: OcctWant[],
  linearDeflection?: number,
  angularDeflection?: number,
};

export type OcctMeshData = {
  positions: Float32Array,
  normals: Float32Array,
  indices: Uint32Array,
};

export type OcctWorkerResult = {
  parameters: Parameter[],
  logs: string[],
  mesh?: OcctMeshData,
  stlText?: string,
  stepText?: string,
  elapsedMillis: number,
};

export type OcctWorkerResponse = {
  id: number,
  result?: OcctWorkerResult,
  error?: string,
};
