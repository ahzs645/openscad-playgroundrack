// Shared runtime for OCCT JavaScript models.
//
// An OCCT model is a plain JavaScript file (entry typically named
// `main.occt.js`) that declares:
//
//   const parameters = [
//     { name: 'width', caption: 'Width', group: 'Body', type: 'number', initial: 10, min: 1, max: 100, step: 0.5 },
//     ...
//   ];
//
//   function build(ctx, p) {
//     const { kernel, sketch } = ctx;
//     ...
//     return shape; // an occt-wasm ShapeHandle
//   }
//
// The `parameters` array uses the same shape as OpenSCAD's customizer
// parameter sets (see src/state/customizer-types.ts) so the same
// CustomizerPanel UI drives both engines.
//
// This file is plain ESM JavaScript (not TypeScript) so it can be imported
// both by the webpack-bundled web worker (src/runner/occt-worker.ts) and by
// the Node validation script (scripts/validate-occt-model.mjs).

const EPS = 1e-9;

/** Evaluate an OCCT model script and return its { parameters, build } definition. */
export function evaluateOcctModel(source) {
  const factory = new Function(
    '"use strict";\n' +
    source +
    '\n;return {' +
    "\n  parameters: typeof parameters === 'undefined' ? [] : parameters," +
    "\n  build: typeof build === 'undefined' ? undefined : build," +
    '\n};'
  );
  const mod = factory();
  if (typeof mod.build !== 'function') {
    throw new Error('OCCT model must define a function build(ctx, params) { ... }');
  }
  if (!Array.isArray(mod.parameters)) {
    throw new Error('OCCT model "parameters" must be an array when defined.');
  }
  return mod;
}

/** Fill in defaults so parameters match the OpenSCAD customizer schema. */
export function normalizeParameters(parameters) {
  return parameters
    .filter((p) => p && typeof p.name === 'string')
    .map((p) => ({
      ...p,
      caption: p.caption ?? p.name,
      group: p.group ?? 'Parameters',
      type: p.type ?? (typeof p.initial === 'boolean' ? 'boolean' : typeof p.initial === 'string' ? 'string' : 'number'),
    }));
}

/** Default parameter values, optionally overridden by customizer vars. */
export function resolveParams(parameters, vars) {
  const values = {};
  for (const p of parameters) {
    if (p && typeof p.name === 'string') values[p.name] = p.initial;
  }
  for (const [name, value] of Object.entries(vars ?? {})) {
    if (value !== undefined) values[name] = value;
  }
  return values;
}

/**
 * 2D sketch helpers bound to a kernel. All helpers build planar geometry on
 * the XY plane (z = 0); use `extrude` to give it thickness.
 */
export function createSketch(kernel) {
  /** Line edge between two XY points, skipping degenerate (zero-length) segments. */
  const lineEdge = (edges, x1, y1, x2, y2) => {
    if (Math.hypot(x2 - x1, y2 - y1) <= EPS) return;
    edges.push(kernel.makeLineEdge({ x: x1, y: y1, z: 0 }, { x: x2, y: y2, z: 0 }));
  };

  /** Quarter-circle arc through an explicit midpoint (orientation-unambiguous). */
  const cornerArc = (edges, cx, cy, r, startAngle, endAngle) => {
    if (r <= EPS) return;
    const mid = (startAngle + endAngle) / 2;
    const pt = (a) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), z: 0 });
    edges.push(kernel.makeArcEdge(pt(startAngle), pt(mid), pt(endAngle)));
  };

  /**
   * Rounded-rectangle wire, lower-left corner at (x, y). Mirrors the
   * `rounded_rect_2d` helper used by the OpenSCAD models: the corner radius
   * is clamped to half the smallest side (so r = h/2 yields a stadium).
   */
  const roundedRect = (x, y, w, h, r = 0) => {
    if (!(w > 0) || !(h > 0)) throw new Error(`roundedRect: invalid size ${w} x ${h}`);
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    const edges = [];
    if (rr <= EPS) {
      lineEdge(edges, x, y, x + w, y);
      lineEdge(edges, x + w, y, x + w, y + h);
      lineEdge(edges, x + w, y + h, x, y + h);
      lineEdge(edges, x, y + h, x, y);
    } else {
      const HALF_PI = Math.PI / 2;
      lineEdge(edges, x + rr, y, x + w - rr, y);
      cornerArc(edges, x + w - rr, y + rr, rr, -HALF_PI, 0);
      lineEdge(edges, x + w, y + rr, x + w, y + h - rr);
      cornerArc(edges, x + w - rr, y + h - rr, rr, 0, HALF_PI);
      lineEdge(edges, x + w - rr, y + h, x + rr, y + h);
      cornerArc(edges, x + rr, y + h - rr, rr, HALF_PI, Math.PI);
      lineEdge(edges, x, y + h - rr, x, y + rr);
      cornerArc(edges, x + rr, y + rr, rr, Math.PI, Math.PI + HALF_PI);
    }
    return kernel.makeWire(edges);
  };

  /** Closed polygon wire from [x, y] point pairs. */
  const polygon = (points) => {
    if (!Array.isArray(points) || points.length < 3) {
      throw new Error('polygon: need at least 3 points');
    }
    const edges = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      lineEdge(edges, x1, y1, x2, y2);
    }
    return kernel.makeWire(edges);
  };

  /**
   * Polygon wire with rounded corners, via the same shrink-then-grow offset
   * trick the OpenSCAD models use (`offset(r) offset(-r)`). Falls back to
   * sharp corners if the 2D offset fails on degenerate input.
   */
  const roundedPolygon = (points, r = 0) => {
    const sharp = polygon(points);
    if (!(r > EPS)) return sharp;
    try {
      const shrunk = kernel.offsetWire2D(sharp, -r); // JoinType.Arc default
      const rounded = kernel.offsetWire2D(shrunk, r);
      return rounded;
    } catch (e) {
      return sharp;
    }
  };

  /** Planar face from an outer wire, with optional hole wires. */
  const face = (outerWire, holes = []) => {
    const f = kernel.makeFace(outerWire);
    if (!holes || holes.length === 0) return f;
    return kernel.addHolesInFace(f, holes);
  };

  /** Extrude a face (or compound of faces) along +Z, starting at z0. */
  const extrude = (shape, height, z0 = 0) => {
    if (!(height > 0)) throw new Error(`extrude: height must be > 0, got ${height}`);
    const base = z0 !== 0 ? kernel.translate(shape, 0, 0, z0) : shape;
    return kernel.extrude(base, 0, 0, height);
  };

  /** Number of faces inside a shape (to detect empty boolean results). */
  const faceCount = (shape) => {
    try {
      return kernel.getSubShapes(shape, 'face').length;
    } catch (e) {
      return 0;
    }
  };

  return { roundedRect, polygon, roundedPolygon, face, extrude, faceCount };
}

/**
 * Evaluate + build a model. Returns the shape handle, the normalized
 * parameter list, and any echo() output emitted by the script.
 */
export function buildOcctModel(kernel, source, vars) {
  const { parameters, build } = evaluateOcctModel(source);
  const normalized = normalizeParameters(parameters);
  const params = resolveParams(normalized, vars);
  const logs = [];
  const ctx = {
    kernel,
    sketch: createSketch(kernel),
    echo: (...args) => logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')),
  };
  const shape = build(ctx, params);
  if (typeof shape !== 'number') {
    throw new Error('OCCT model build() must return a shape handle.');
  }
  return { shape, parameters: normalized, logs };
}
