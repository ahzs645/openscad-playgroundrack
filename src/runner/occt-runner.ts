// Main-thread client for the OCCT model worker (occt-worker.ts).
//
// Unlike the OpenSCAD runner (which spawns a fresh worker per job), the OCCT
// worker is kept alive across jobs so the ~5MB WASM kernel is only
// initialized once. Killing a job terminates the worker; the next job
// spawns a fresh one.

import { AbortablePromise, turnIntoDelayableExecution } from '../utils.ts';
import { IndexedPolyhedron, DEFAULT_FACE_COLOR } from '../io/common.ts';
import { OcctMeshData, OcctWant, OcctWorkerRequest, OcctWorkerResponse, OcctWorkerResult } from './occt-runner-types.ts';
import { defaultOcctWasmVersion, normalizeOcctWasmVersion, OcctWasmVersion } from './occt-versions.ts';

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (r: OcctWorkerResult) => void, reject: (e: any) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./occt-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<OcctWorkerResponse>) => {
      const { id, result, error } = e.data;
      const handlers = pending.get(id);
      if (!handlers) return;
      pending.delete(id);
      if (result) {
        handlers.resolve(result);
      } else {
        handlers.reject(new Error(error ?? 'Unknown OCCT worker error'));
      }
    };
    worker.onerror = (e) => {
      const error = new Error(e.message ?? 'OCCT worker crashed');
      for (const { reject } of pending.values()) reject(error);
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

function killWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  const error = new Error('OCCT job aborted');
  for (const { reject } of pending.values()) reject(error);
  pending.clear();
}

export type OcctJobArgs = {
  source: string,
  occtVersion?: OcctWasmVersion,
  vars?: { [name: string]: any },
  want: OcctWant[],
  linearDeflection?: number,
  angularDeflection?: number,
};

export function spawnOcctJob(args: OcctJobArgs): AbortablePromise<OcctWorkerResult> {
  const id = nextId++;
  return AbortablePromise<OcctWorkerResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const occtVersion = normalizeOcctWasmVersion(args.occtVersion ?? defaultOcctWasmVersion);
    const request: OcctWorkerRequest = {
      id,
      ...args,
      occtVersion,
      occtBaseUrl: new URL(`./occt/${occtVersion}/`, import.meta.url).href,
    };
    try {
      getWorker().postMessage(request);
    } catch (e) {
      pending.delete(id);
      reject(e);
    }
    return () => {
      if (pending.has(id)) {
        pending.delete(id);
        // The worker is mid-build and cannot be interrupted any other way.
        killWorker();
      }
    };
  });
}

const occtRenderDelay = 1000;
export const renderOcct = turnIntoDelayableExecution(occtRenderDelay, spawnOcctJob);

export function meshToPolyhedron(mesh: OcctMeshData): IndexedPolyhedron {
  const vertices = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    vertices.push({ x: mesh.positions[i], y: mesh.positions[i + 1], z: mesh.positions[i + 2] });
  }
  const faces = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    faces.push({
      vertices: [mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]] as [number, number, number],
      colorIndex: 0,
    });
  }
  return { vertices, faces, colors: [DEFAULT_FACE_COLOR] };
}
