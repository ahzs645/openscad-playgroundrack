// Web worker that builds OCCT JavaScript models with the occt-wasm kernel.
//
// Bundled as a separate webpack entry (dist/occt-worker.js), mirroring
// openscad-worker.ts. The worker is persistent: the kernel WASM is
// initialized once and reused across renders; shapes are released after
// every job via releaseAll().

import { OcctKernel, type ShapeHandle } from 'occt-wasm';
import { buildOcctModel } from './occt-model-runtime.js';
import { OcctWorkerRequest, OcctWorkerResponse, OcctWorkerResult } from './occt-runner-types.ts';

declare var self: DedicatedWorkerGlobalScope;

let kernelPromise: Promise<OcctKernel> | undefined;

function getKernel(): Promise<OcctKernel> {
  // The .wasm sits next to this worker bundle in dist/ (copied by webpack).
  kernelPromise ??= OcctKernel.init({ wasm: 'occt-wasm.wasm' });
  return kernelPromise;
}

async function handleRequest(req: OcctWorkerRequest): Promise<OcctWorkerResult> {
  const start = performance.now();
  const kernel = await getKernel();
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
