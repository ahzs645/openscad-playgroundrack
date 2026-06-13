// Per-item rendering engine selection.
//
// Models render with one of two engines:
//  - 'openscad': .scad sources compiled by the OpenSCAD WASM worker (default).
//  - 'occt': JavaScript model scripts (entry usually named main.occt.js)
//    built with the OpenCASCADE kernel (occt-wasm) in a dedicated worker.
//
// A project can declare `"engine": "occt"` in its project.json; otherwise the
// engine is inferred from the entry file extension.

export type RenderEngine = 'openscad' | 'occt';

export function engineForPath(path: string): RenderEngine {
  return path.endsWith('.js') ? 'occt' : 'openscad';
}

export function engineForProject(engine: string | undefined, entry: string): RenderEngine {
  if (engine === 'occt') return 'occt';
  if (engine === 'openscad') return 'openscad';
  return engineForPath(entry);
}
