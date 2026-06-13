# OCCT (OpenCASCADE) Models

The playground supports two rendering engines, selected per model:

| Engine | Source format | Geometry | STEP export |
|---|---|---|---|
| `openscad` (default) | `.scad` | mesh (Manifold backend) | reconstructed from CSG, or tessellated fallback |
| `occt` | `.occt.js` (JavaScript) | exact BREP via [occt-wasm](https://github.com/andymai/occt-wasm) | lossless, native |

OCCT models are built by an OpenCASCADE kernel compiled to WebAssembly,
running in a dedicated web worker (`dist/occt-worker.js`). The tessellated
mesh is converted to GLB and displayed in the same `<model-viewer>` panel as
OpenSCAD renders; the customizer panel works identically for both engines.

## Declaring the engine

Add `"engine": "occt"` to the project's `Models/<Name>/project.json`:

```json
{
  "title": "My OCCT Part",
  "entry": "main.occt.js",
  "engine": "occt"
}
```

The engine is also inferred from the entry extension: any `.js` entry renders
with the OCCT engine, `.scad` renders with OpenSCAD. Run `npm run models:index`
after adding a project so it appears in the gallery manifest.

## Authoring a model

An OCCT model is a plain JavaScript file that declares two top-level bindings:

```js
const parameters = [
  // Same schema as OpenSCAD customizer parameters:
  { name: 'width',  caption: 'Width',  group: 'Body', type: 'number',  initial: 30, min: 5, max: 100, step: 1 },
  { name: 'rounded', caption: 'Round corners', group: 'Body', type: 'boolean', initial: true },
];

function build({ kernel, sketch, echo }, p) {
  // kernel is an occt-wasm OcctKernel: makeBox, fuse, cut, fillet, extrude,
  // revolve, loft, linearPattern, ... (see occt-wasm docs for the full API).
  const body = kernel.makeBox(p.width, 20, 5);
  echo('volume will be roughly', p.width * 20 * 5);
  return body; // must return a shape handle
}
```

`build(ctx, params)` receives:

- `ctx.kernel` — the [occt-wasm `OcctKernel`](https://github.com/andymai/occt-wasm):
  primitives, booleans, fillets/chamfers, sweeps/lofts, patterns, transforms.
- `ctx.sketch` — 2D helpers for the common profile-extrude workflow
  (see `src/runner/occt-model-runtime.js`):
  - `roundedRect(x, y, w, h, r)` — rounded-rectangle wire on the XY plane
    (radius clamps to a stadium, like the SCAD models' `rounded_rect_2d`);
  - `polygon(points)` / `roundedPolygon(points, r)` — closed polygon wires;
  - `face(outerWire, holeWires)` — planar face with optional holes;
  - `extrude(faceOrCompound, height, z0)` — prism along +Z;
  - `faceCount(shape)` — to detect empty boolean results.
- `ctx.echo(...)` — logs shown in the playground's log panel.
- `params` — parameter defaults merged with the user's customizer values.

Shapes are arena-managed; the worker releases everything after each render,
so models don't need to free handles.

### Exports

For OCCT models the export menu offers:

- **GLB** — the displayed mesh;
- **STL** — ASCII STL tessellated by OCCT;
- **STEP** — exact BREP straight from the kernel (no tessellation), suitable
  for CAD interchange.

## Validating models headlessly

occt-wasm runs in Node, so models can be validated without a browser:

```bash
npm run models:validate:occt                       # default: the OCCT gel comb
node scripts/validate-occt-model.mjs "Models/My Part/main.occt.js" \
  --var width=42 --stl /tmp/part.stl --step /tmp/part.step
```

The script builds the model, checks shape validity / volume / tessellation,
and optionally writes STL/STEP files. It exits non-zero on failure, so it can
be used in CI.

## Example

`Models/Parametric Gel Comb (OCCT)/main.occt.js` is a full port of the
OpenSCAD `Parametric Gel Comb` model — same parameter names and default
geometry — useful as a reference for porting other pieces.

## Implementation map

- `src/state/engine.ts` — per-path/per-project engine selection.
- `src/runner/occt-model-runtime.js` — shared script evaluation + sketch
  helpers (used by both the worker and the Node validator).
- `src/runner/occt-worker.ts` — worker entry (webpack bundles it to
  `dist/occt-worker.js`; `occt-wasm.js`/`occt-wasm.wasm` are copied alongside).
- `src/runner/occt-runner.ts` — main-thread client (persistent worker,
  delayable renders, mesh→GLB conversion helper).
- `src/state/model.ts` — `renderWithOcct()` / `exportOcct()` routing.
