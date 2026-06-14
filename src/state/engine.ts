// Per-item rendering engine selection and capabilities.
//
// Models render with one of two engines:
//  - 'openscad': .scad sources compiled by the OpenSCAD WASM worker (default).
//  - 'occt': JavaScript model scripts (entry usually named main.occt.js)
//    built with the OpenCASCADE kernel (occt-wasm) in a dedicated worker.
//
// A project can declare `"engine": "occt"` in its project.json; otherwise the
// engine is inferred from the entry file extension.

import { VALID_EXPORT_FORMATS_2D, VALID_EXPORT_FORMATS_3D } from './formats.ts';

export type RenderEngine = 'openscad' | 'occt';

export type ExportFormat2D = keyof typeof VALID_EXPORT_FORMATS_2D;
export type ExportFormat3D = keyof typeof VALID_EXPORT_FORMATS_3D;

export type StepExportMode = {
  id: 'native' | 'openscad-csg-32' | 'openscad-csg-64-mt';
  label: string;
  exact: boolean;
};

export type EngineCapabilities = {
  id: RenderEngine;
  label: string;
  render2D: boolean;
  render3D: boolean;
  export2D: ExportFormat2D[];
  export3D: ExportFormat3D[];
  stepExportModes: StepExportMode[];
};

export const ENGINE_CAPABILITIES: Record<RenderEngine, EngineCapabilities> = {
  openscad: {
    id: 'openscad',
    label: 'OpenSCAD',
    render2D: true,
    render3D: true,
    export2D: ['svg', 'dxf'],
    export3D: ['glb', 'stl', 'off', '3mf', 'step'],
    stepExportModes: [
      {
        id: 'openscad-csg-32',
        label: 'STEP via OCCT (32-bit)',
        exact: false,
      },
      {
        id: 'openscad-csg-64-mt',
        label: 'STEP via OCCT (64-bit multithreaded)',
        exact: false,
      },
    ],
  },
  occt: {
    id: 'occt',
    label: 'OpenCascade',
    render2D: false,
    render3D: true,
    export2D: [],
    export3D: ['glb', 'stl', 'step'],
    stepExportModes: [
      {
        id: 'native',
        label: 'STEP (exact BREP via OCCT)',
        exact: true,
      },
    ],
  },
};

export function engineForPath(path: string): RenderEngine {
  return path.endsWith('.js') ? 'occt' : 'openscad';
}

export function engineForProject(engine: string | undefined, entry: string): RenderEngine {
  if (engine === 'occt') return 'occt';
  if (engine === 'openscad') return 'openscad';
  return engineForPath(entry);
}

export function capabilitiesForEngine(engine: RenderEngine): EngineCapabilities {
  return ENGINE_CAPABILITIES[engine];
}

export function capabilitiesForPath(path: string): EngineCapabilities {
  return capabilitiesForEngine(engineForPath(path));
}
