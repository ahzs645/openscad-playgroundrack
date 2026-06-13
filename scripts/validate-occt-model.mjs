#!/usr/bin/env node
// Validates an OCCT JavaScript model (Models/**/main.occt.js) by building it
// with occt-wasm in Node and reporting volume / bounds / mesh stats.
//
// Usage:
//   node scripts/validate-occt-model.mjs [path/to/main.occt.js]
//     [--var name=value ...] [--stl out.stl] [--step out.step] [--json]
//
// Exits non-zero if the model fails to evaluate, build, or tessellate.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OcctKernel } from 'occt-wasm';
import { buildOcctModel } from '../src/runner/occt-model-runtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MODEL = path.resolve(__dirname, '..', 'Models', 'Parametric Gel Comb (OCCT)', 'main.occt.js');

function parseArgs(argv) {
  const args = { model: DEFAULT_MODEL, vars: {}, stl: null, step: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--var') {
      const [name, raw] = String(argv[++i] ?? '').split('=');
      if (!name || raw === undefined) throw new Error('--var expects name=value');
      let value;
      if (raw === 'true') value = true;
      else if (raw === 'false') value = false;
      else if (raw !== '' && !Number.isNaN(Number(raw))) value = Number(raw);
      else value = raw;
      args.vars[name] = value;
    } else if (a === '--stl') {
      args.stl = argv[++i];
    } else if (a === '--step') {
      args.step = argv[++i];
    } else if (a === '--json') {
      args.json = true;
    } else if (!a.startsWith('--')) {
      args.model = path.resolve(a);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = fs.readFileSync(args.model, 'utf-8');

  const kernel = await OcctKernel.init();
  try {
    const t0 = performance.now();
    const { shape, parameters, logs } = buildOcctModel(kernel, source, args.vars);
    const buildMillis = performance.now() - t0;

    for (const line of logs) console.log(`[echo] ${line}`);

    const valid = kernel.isValid(shape);
    const volume = kernel.getVolume(shape);
    const bbox = kernel.getBoundingBox(shape, false);
    const mesh = kernel.tessellate(shape, { linearDeflection: 0.1, angularDeflection: 0.5 });

    const report = {
      model: args.model,
      parameters: parameters.length,
      overriddenVars: args.vars,
      valid,
      volume: Number(volume.toFixed(3)),
      bbox: {
        x: [Number(bbox.xmin.toFixed(3)), Number(bbox.xmax.toFixed(3))],
        y: [Number(bbox.ymin.toFixed(3)), Number(bbox.ymax.toFixed(3))],
        z: [Number(bbox.zmin.toFixed(3)), Number(bbox.zmax.toFixed(3))],
      },
      triangles: mesh.triangleCount,
      vertices: mesh.vertexCount,
      buildMillis: Math.round(buildMillis),
    };

    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`model:      ${report.model}`);
      console.log(`parameters: ${report.parameters}`);
      console.log(`valid:      ${report.valid}`);
      console.log(`volume:     ${report.volume} mm^3`);
      console.log(`bbox x:     ${report.bbox.x.join(' .. ')}`);
      console.log(`bbox y:     ${report.bbox.y.join(' .. ')}`);
      console.log(`bbox z:     ${report.bbox.z.join(' .. ')}`);
      console.log(`mesh:       ${report.triangles} triangles, ${report.vertices} vertices`);
      console.log(`build:      ${report.buildMillis} ms`);
    }

    if (args.stl) {
      fs.writeFileSync(args.stl, kernel.exportStl(shape, 0.05, true));
      console.log(`wrote ${args.stl}`);
    }
    if (args.step) {
      fs.writeFileSync(args.step, kernel.exportStep(shape));
      console.log(`wrote ${args.step}`);
    }

    if (!valid) {
      console.error('Model built but the resulting shape is not valid.');
      process.exit(1);
    }
    if (!(volume > 0)) {
      console.error('Model built but has zero/negative volume.');
      process.exit(1);
    }
    if (!(mesh.triangleCount > 0)) {
      console.error('Model built but tessellated to an empty mesh.');
      process.exit(1);
    }
  } finally {
    kernel[Symbol.dispose]?.();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
