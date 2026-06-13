// Web worker that builds OCCT JavaScript models with the occt-wasm kernel.
//
// Bundled as a separate webpack entry (dist/occt-worker.js), mirroring
// openscad-worker.ts. The worker is persistent: the kernel WASM is
// initialized once and reused across renders; shapes are released after
// every job via releaseAll().

import type { OcctKernel, ShapeHandle } from 'occt-wasm';
import { buildOcctModel } from './occt-model-runtime.js';
import { OcctWorkerRequest, OcctWorkerResponse, OcctWorkerResult } from './occt-runner-types.ts';
import { defaultOcctWasmVersion, OcctWasmVersion } from './occt-versions.ts';

declare var self: DedicatedWorkerGlobalScope;

type OcctWasmModule = typeof import('occt-wasm');

const kernelPromises = new Map<OcctWasmVersion, Promise<OcctKernel>>();

async function getKernel(version: OcctWasmVersion, baseUrl: string): Promise<OcctKernel> {
  let kernelPromise = kernelPromises.get(version);
  if (!kernelPromise) {
    kernelPromise = (async () => {
      const moduleUrl = new URL('index.js', baseUrl).href;
      const wasmUrl = new URL('occt-wasm.wasm', baseUrl).href;
      const { OcctKernel } = await import(/* @vite-ignore */ moduleUrl) as OcctWasmModule;
      return OcctKernel.init({ wasm: wasmUrl });
    })();
    kernelPromises.set(version, kernelPromise);
  }
  return kernelPromise;
}

async function handleRequest(req: OcctWorkerRequest): Promise<OcctWorkerResult> {
  const start = performance.now();
  const kernel = await getKernel(req.occtVersion ?? defaultOcctWasmVersion, req.occtBaseUrl);
  try {
    const { shape: rawShape, parameters, logs } = buildOcctModel(kernel, req.source, req.vars);
    const shape = rawShape as ShapeHandle;

    const result: OcctWorkerResult = {
      parameters,
      logs,
      elapsedMillis: 0,
    };
    if (req.want.includes('mesh')) {
      const mesh = kernel.tessellate(shape, {
        linearDeflection: req.linearDeflection ?? 0.1,
        angularDeflection: req.angularDeflection ?? 0.5,
      });
      result.mesh = {
        positions: mesh.positions,
        normals: mesh.normals,
        indices: mesh.indices,
      };
    }
    if (req.want.includes('stl')) {
      result.stlText = kernel.exportStl(shape, req.linearDeflection ?? 0.05, true);
    }
    if (req.want.includes('step')) {
      result.stepText = kernel.exportStep(shape);
    }
    result.elapsedMillis = performance.now() - start;
    return result;
  } finally {
    // Arena cleanup: drop all shapes created during this job.
    kernel.releaseAll();
  }
}

addEventListener('message', async (e: MessageEvent<OcctWorkerRequest>) => {
  const req = e.data;
  try {
    const result = await handleRequest(req);
    const transfer: Transferable[] = [];
    if (result.mesh) {
      transfer.push(result.mesh.positions.buffer, result.mesh.normals.buffer, result.mesh.indices.buffer);
    }
    const response: OcctWorkerResponse = { id: req.id, result };
    self.postMessage(response, transfer);
  } catch (err: any) {
    const response: OcctWorkerResponse = {
      id: req.id,
      error: err?.message ? `${err.message}` : `${err}`,
    };
    self.postMessage(response);
  }
});
