# Engine Architecture

This app is moving toward a Tau-style multi-engine shape without adopting Tau's
runtime wholesale.

## Current Engines

- `openscad`: OpenSCAD WASM compiles `.scad` sources. It supports 2D and 3D
  preview/export.
- `occt`: `.occt.js` sources build `occt-wasm` shape handles in the OCCT worker.
  It supports 3D preview/export and exact STEP through `occt-wasm`.

The canonical engine registry lives in `src/state/engine.ts`. UI code should
read capabilities from that registry instead of hardcoding file extensions or
engine names.

## Export Responsibilities

- OpenSCAD native exports: SVG, DXF, OFF, STL.
- App mesh exports: GLB and 3MF from OFF/polyhedron data.
- OCCT model exports: GLB/STL/STEP from the `occt-wasm` worker.
- OpenSCAD STEP export: currently uses `@bitbybit-dev/occt` in
  `src/io/export_step.ts` to convert CSG/OFF output into STEP.

The largest avoidable CAD payload is the OpenSCAD STEP conversion path, not the
OCCT model path. If bundle size becomes the priority, first decide whether
OpenSCAD-to-STEP is required. If it is required, investigate replacing
`@bitbybit-dev/occt` with an `occt-wasm` implementation. If it is not required,
remove that export mode and the BitByBit dependency.

## Adding Engines

New engines should add an entry to `ENGINE_CAPABILITIES` before adding UI. The
minimum contract is:

- render dimensionality: 2D, 3D, or both
- supported 2D export formats
- supported 3D export formats
- STEP modes, if any

The next refactor should move render/export implementation methods behind engine
adapter objects so `Model.render()` and `Model.export()` delegate to the active
engine instead of branching internally.
