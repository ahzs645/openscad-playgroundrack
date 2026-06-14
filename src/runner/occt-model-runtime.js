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

// Metric-thread defaults adapted from replicad-threads (MIT).
const METRIC_THREADS = {
  M1: { nominalDiameter: 1, pitch: 0.25, finePitch: 0.2 },
  'M1.2': { nominalDiameter: 1.2, pitch: 0.25, finePitch: 0.2 },
  'M1.4': { nominalDiameter: 1.4, pitch: 0.3, finePitch: 0.2 },
  'M1.6': { nominalDiameter: 1.6, pitch: 0.35, finePitch: 0.2 },
  'M1.8': { nominalDiameter: 1.8, pitch: 0.35, finePitch: 0.2 },
  M2: { nominalDiameter: 2, pitch: 0.4, finePitch: 0.25 },
  'M2.5': { nominalDiameter: 2.5, pitch: 0.45, finePitch: 0.35 },
  M3: { nominalDiameter: 3, pitch: 0.5, finePitch: 0.35 },
  'M3.5': { nominalDiameter: 3.5, pitch: 0.6, finePitch: 0.35 },
  M4: { nominalDiameter: 4, pitch: 0.7, finePitch: 0.5 },
  M5: { nominalDiameter: 5, pitch: 0.8, finePitch: 0.5 },
  M6: { nominalDiameter: 6, pitch: 1, finePitch: 0.75 },
  M7: { nominalDiameter: 7, pitch: 1, finePitch: 0.75 },
  M8: { nominalDiameter: 8, pitch: 1.25, finePitch: 1 },
  M10: { nominalDiameter: 10, pitch: 1.5, finePitch: 1.25 },
  M12: { nominalDiameter: 12, pitch: 1.75, finePitch: 1.5 },
  M14: { nominalDiameter: 14, pitch: 2, finePitch: 1.5 },
  M16: { nominalDiameter: 16, pitch: 2, finePitch: 1.5 },
  M18: { nominalDiameter: 18, pitch: 2.5, finePitch: 2 },
  M20: { nominalDiameter: 20, pitch: 2.5, finePitch: 1.5 },
  M22: { nominalDiameter: 22, pitch: 2.5, finePitch: 1.5 },
  M24: { nominalDiameter: 24, pitch: 3, finePitch: 2 },
  M27: { nominalDiameter: 27, pitch: 3, finePitch: 2 },
  M30: { nominalDiameter: 30, pitch: 3.5, finePitch: 3 },
  M33: { nominalDiameter: 33, pitch: 3.5, finePitch: 2 },
  M36: { nominalDiameter: 36, pitch: 4, finePitch: 3 },
  M39: { nominalDiameter: 39, pitch: 4, finePitch: 3 },
  M42: { nominalDiameter: 42, pitch: 4.5, finePitch: 3 },
  M45: { nominalDiameter: 45, pitch: 4.5, finePitch: 3 },
  M48: { nominalDiameter: 48, pitch: 5, finePitch: 3 },
  M52: { nominalDiameter: 52, pitch: 5, finePitch: 4 },
  M56: { nominalDiameter: 56, pitch: 5.5, finePitch: 4 },
  M60: { nominalDiameter: 60, pitch: 5.5, finePitch: 4 },
  M64: { nominalDiameter: 64, pitch: 6, finePitch: 4 },
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

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

  const circle = (cx, cy, r, segments = 96) => {
    if (!(r > 0)) throw new Error(`circle: radius must be > 0, got ${r}`);
    const n = Math.max(8, Math.floor(segments));
    const points = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      points.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return polygon(points);
  };

  const slot = (cx, cy, length, width) => {
    if (!(length > 0) || !(width > 0)) throw new Error(`slot: invalid size ${length} x ${width}`);
    return roundedRect(cx - length / 2, cy - width / 2, length, width, width / 2);
  };

  return { roundedRect, polygon, roundedPolygon, circle, slot, face, extrude, faceCount };
}

function createTransform(kernel) {
  const axis = (point, direction) => ({ point, direction });
  const rotateRad = (shape, angle, direction = { x: 0, y: 0, z: 1 }, point = { x: 0, y: 0, z: 0 }) =>
    kernel.rotate(shape, axis(point, direction), angle);
  const rotateDeg = (shape, angleDeg, direction, point) => rotateRad(shape, (angleDeg * Math.PI) / 180, direction, point);
  const translate = (shape, x = 0, y = 0, z = 0) => kernel.translate(shape, x, y, z);
  return { translate, rotateRad, rotateDeg };
}

function createPattern(kernel, transform) {
  const linear = (shape, count, step = { x: 0, y: 0, z: 0 }) => {
    const n = Math.max(0, Math.floor(count));
    const shapes = [];
    for (let i = 0; i < n; i++) shapes.push(transform.translate(shape, step.x * i, step.y * i, step.z * i));
    return shapes;
  };

  const circular = (shape, count, radius = 0, startDeg = 0, center = { x: 0, y: 0, z: 0 }) => {
    const n = Math.max(0, Math.floor(count));
    const shapes = [];
    for (let i = 0; i < n; i++) {
      const angleDeg = startDeg + (i / n) * 360;
      const angle = (angleDeg * Math.PI) / 180;
      const placed = transform.translate(shape, center.x + radius, center.y, center.z);
      shapes.push(transform.rotateRad(placed, angle, { x: 0, y: 0, z: 1 }, center));
    }
    return shapes;
  };

  const fuse = (shapes) => {
    const filtered = shapes.filter(Boolean);
    if (filtered.length === 0) return null;
    if (filtered.length === 1) return filtered[0];
    if (typeof kernel.fuseAll === 'function') return kernel.fuseAll(filtered);
    return filtered.reduce((acc, shape) => (acc ? kernel.fuse(acc, shape) : shape), null);
  };
  return { linear, circular, fuse };
}

function createSolid(kernel, sketch, transform, pattern) {
  const boxFromCorners = (x, y, z, w, d, h) => kernel.makeBoxFromCorners({ x, y, z }, { x: x + w, y: y + d, z: z + h });

  const cuboid = (opts = {}) => {
    if (Array.isArray(opts)) opts = { size: opts };
    const size = opts.size ?? [opts.w, opts.d, opts.h];
    const [w, d, h] = size;
    if (!(w > 0) || !(d > 0) || !(h > 0)) throw new Error(`cuboid: invalid size ${w} x ${d} x ${h}`);
    const at = opts.at ?? [opts.x ?? 0, opts.y ?? 0, opts.z ?? 0];
    const center = opts.center ?? false;
    const centered = Array.isArray(center) ? center : [center, center, center];
    const x = at[0] - (centered[0] ? w / 2 : 0);
    const y = at[1] - (centered[1] ? d / 2 : 0);
    const z = at[2] - (centered[2] ? h / 2 : 0);
    return boxFromCorners(x, y, z, w, d, h);
  };

  const cylinder = (opts = {}) => {
    const radius = opts.radius ?? opts.r ?? (opts.diameter ?? opts.d) / 2;
    const height = opts.height ?? opts.h;
    if (!(radius > 0) || !(height > 0)) throw new Error(`cylinder: invalid radius/height ${radius} / ${height}`);
    const at = opts.at ?? [opts.x ?? 0, opts.y ?? 0, opts.z ?? 0];
    const z = at[2] - (opts.center ? height / 2 : 0);
    return transform.translate(kernel.makeCylinder(radius, height), at[0], at[1], z);
  };

  const cone = (opts = {}) => {
    const r1 = opts.r1 ?? (opts.d1 / 2);
    const r2 = opts.r2 ?? (opts.d2 / 2);
    const height = opts.height ?? opts.h;
    if (!(r1 >= 0) || !(r2 >= 0) || !(height > 0)) throw new Error(`cone: invalid radii/height ${r1} / ${r2} / ${height}`);
    const at = opts.at ?? [opts.x ?? 0, opts.y ?? 0, opts.z ?? 0];
    const z = at[2] - (opts.center ? height / 2 : 0);
    return transform.translate(kernel.makeCone(r1, r2, height), at[0], at[1], z);
  };

  const roundedBox = (opts = {}) => {
    const size = opts.size ?? [opts.w, opts.d, opts.h];
    const [w, d, h] = size;
    const r = opts.radius ?? opts.r ?? 0;
    const at = opts.at ?? [opts.x ?? 0, opts.y ?? 0, opts.z ?? 0];
    const center = opts.center ?? false;
    const centered = Array.isArray(center) ? center : [center, center, center];
    const x = at[0] - (centered[0] ? w / 2 : 0);
    const y = at[1] - (centered[1] ? d / 2 : 0);
    const z = at[2] - (centered[2] ? h / 2 : 0);
    return sketch.extrude(sketch.face(sketch.roundedRect(x, y, w, d, r)), h, z);
  };

  const tube = (opts = {}) => {
    const outerRadius = opts.outerRadius ?? opts.rOuter ?? opts.or ?? (opts.outerDiameter ?? opts.od) / 2;
    const innerRadius = opts.innerRadius ?? opts.rInner ?? opts.ir ?? (opts.innerDiameter ?? opts.id) / 2;
    const height = opts.height ?? opts.h;
    if (!(outerRadius > innerRadius) || !(innerRadius > 0) || !(height > 0)) {
      throw new Error(`tube: invalid radii/height ${outerRadius} / ${innerRadius} / ${height}`);
    }
    const at = opts.at ?? [opts.x ?? 0, opts.y ?? 0, opts.z ?? 0];
    const z = at[2] - (opts.center ? height / 2 : 0);
    const outer = kernel.makeCylinder(outerRadius, height);
    const inner = transform.translate(kernel.makeCylinder(innerRadius, height + 2), 0, 0, -1);
    return transform.translate(kernel.cut(outer, inner), at[0], at[1], z);
  };

  const ring = (opts = {}) => tube(opts);
  const torus = (opts = {}) => {
    const majorRadius = opts.majorRadius ?? opts.major ?? opts.rMajor;
    const minorRadius = opts.minorRadius ?? opts.minor ?? opts.rMinor;
    if (!(majorRadius > 0) || !(minorRadius > 0)) throw new Error(`torus: invalid radii ${majorRadius} / ${minorRadius}`);
    const at = opts.at ?? [opts.x ?? 0, opts.y ?? 0, opts.z ?? 0];
    return transform.translate(kernel.makeTorus(majorRadius, minorRadius), at[0], at[1], at[2]);
  };

  const hexPrism = (opts = {}) => {
    const radius = opts.radius ?? opts.r ?? (opts.diameter ?? opts.d) / 2;
    const height = opts.height ?? opts.h;
    const at = opts.at ?? [opts.x ?? 0, opts.y ?? 0, opts.z ?? 0];
    const points = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      points.push([at[0] + radius * Math.cos(a), at[1] + radius * Math.sin(a)]);
    }
    const z = at[2] - (opts.center ? height / 2 : 0);
    return sketch.extrude(sketch.face(sketch.polygon(points)), height, z);
  };

  const slot = (opts = {}) => {
    const length = opts.length ?? opts.l;
    const width = opts.width ?? opts.w;
    const height = opts.height ?? opts.h;
    const at = opts.at ?? [opts.x ?? 0, opts.y ?? 0, opts.z ?? 0];
    const z = at[2] - (opts.center ? height / 2 : 0);
    return sketch.extrude(sketch.face(sketch.slot(at[0], at[1], length, width)), height, z);
  };

  const dovetail = (opts = {}) => {
    const bottomWidth = opts.bottomWidth ?? opts.bottom ?? opts.w1;
    const topWidth = opts.topWidth ?? opts.top ?? opts.w2;
    const depth = opts.depth ?? opts.d;
    const height = opts.height ?? opts.h;
    if (!(bottomWidth > 0) || !(topWidth > 0) || !(depth > 0) || !(height > 0)) {
      throw new Error(`dovetail: invalid dimensions ${bottomWidth} / ${topWidth} / ${depth} / ${height}`);
    }
    const at = opts.at ?? [opts.x ?? 0, opts.y ?? 0, opts.z ?? 0];
    const y0 = at[1] - depth / 2;
    const y1 = at[1] + depth / 2;
    const points = [
      [at[0] - bottomWidth / 2, y0],
      [at[0] + bottomWidth / 2, y0],
      [at[0] + topWidth / 2, y1],
      [at[0] - topWidth / 2, y1],
    ];
    return sketch.extrude(sketch.face(sketch.polygon(points)), height, at[2]);
  };

  const gridHoles = (opts = {}) => {
    const rows = Math.max(0, Math.floor(opts.rows ?? 0));
    const cols = Math.max(0, Math.floor(opts.cols ?? 0));
    const spacing = opts.spacing ?? [opts.dx ?? 0, opts.dy ?? 0];
    const radius = opts.radius ?? opts.r ?? (opts.diameter ?? opts.d) / 2;
    const height = opts.height ?? opts.h;
    const at = opts.at ?? [opts.x ?? 0, opts.y ?? 0, opts.z ?? 0];
    const center = opts.center ?? true;
    const holes = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = at[0] + (col - (center ? (cols - 1) / 2 : 0)) * spacing[0];
        const y = at[1] + (row - (center ? (rows - 1) / 2 : 0)) * spacing[1];
        holes.push(cylinder({ radius, height, at: [x, y, at[2]], center: opts.centerZ ?? false }));
      }
    }
    return holes;
  };

  const threadProfileConfig = (pitch, threadAngle = 30, external = true) => {
    if (!(pitch > 0)) throw new Error(`threadProfileConfig: pitch must be > 0, got ${pitch}`);
    const shoulderWidth = (pitch / 2) * Math.tan((threadAngle * Math.PI) / 360);
    return {
      pitch,
      rootWidth: pitch / 2 + shoulderWidth,
      apexWidth: Math.max(pitch / 2 - shoulderWidth, EPS),
      toothHeight: external ? pitch / 2 : -pitch / 2,
    };
  };

  const metricThreadProfileConfig = (pitch, external = true) => {
    if (!(pitch > 0)) throw new Error(`metricThreadProfileConfig: pitch must be > 0, got ${pitch}`);
    const h = (Math.sqrt(3) / 2) * pitch;
    const toothHeight = (5 / 8) * h;
    return {
      pitch,
      rootWidth: external ? (3 * pitch) / 4 : (7 * pitch) / 8,
      apexWidth: external ? pitch / 8 : pitch / 4,
      toothHeight: external ? toothHeight : -toothHeight,
    };
  };

  const addThreadClearance = (config, clearance = 0) => {
    if (!clearance) return config;
    const isExternal = config.toothHeight > 0;
    return {
      ...config,
      radius: isExternal ? config.radius - clearance : config.radius + clearance,
      apexWidth: Math.max(config.apexWidth - clearance, 0.01),
      rootWidth: Math.max(config.rootWidth - clearance, 0.01),
    };
  };

  const conjugateThreadConfig = (config, clearance = 0) =>
    addThreadClearance(
      {
        ...config,
        toothHeight: -config.toothHeight,
        radius: config.radius + config.toothHeight,
      },
      clearance
    );

  const metricThreadConfig = (name, height, external = true, clearance = 0, fine = false) => {
    const standard = METRIC_THREADS[name];
    if (!standard) throw new Error(`metricThreadConfig: unknown metric thread "${name}"`);
    const pitch = fine ? standard.finePitch : standard.pitch;
    const profile = metricThreadProfileConfig(pitch, external);
    const apexRadius = standard.nominalDiameter / 2;
    const rootRadius = apexRadius - profile.toothHeight;
    return addThreadClearance(
      {
        ...profile,
        name,
        nominalDiameter: standard.nominalDiameter,
        height,
        radius: external ? rootRadius : apexRadius,
      },
      clearance
    );
  };

  const metricThreadConfigConjugate = (config, clearance = 0) => {
    const external = config.toothHeight <= 0;
    return addThreadClearance(
      {
        ...config,
        ...metricThreadProfileConfig(config.pitch, external),
        radius: config.radius + config.toothHeight,
      },
      clearance
    );
  };

  const wireFromPoints = (points) => {
    const edges = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      edges.push(kernel.makeLineEdge(a, b));
    }
    return kernel.makeWire(edges);
  };

  const makeThreadStart = (opts, startAngle) => {
    const pitch = opts.pitch;
    const radius = opts.radius;
    const height = opts.height;
    const rootWidth = opts.rootWidth;
    const apexWidth = opts.apexWidth;
    const toothHeight = opts.toothHeight;
    const samplesPerTurn = opts.samplesPerTurn ?? 24;
    const leftHand = Boolean(opts.leftHand ?? opts.lefthand);
    const at = opts.at ?? [opts.x ?? 0, opts.y ?? 0, opts.z ?? 0];
    const turns = height / pitch;
    const sampleCount = Math.max(5, Math.ceil(turns * samplesPerTurn));
    const handedness = leftHand ? -1 : 1;
    const fadeHeight = opts.fadeEnds ? Math.max(opts.fadeHeight ?? pitch / 4, EPS) : 0;
    const wires = [];

    for (let i = 0; i <= sampleCount; i++) {
      const t = i / sampleCount;
      const z = height * t;
      const theta = startAngle + handedness * turns * Math.PI * 2 * t;
      const radial = { x: Math.cos(theta), y: Math.sin(theta), z: 0 };
      const effectiveToothHeight = fadeHeight
        ? toothHeight * clamp(Math.min(z, height - z) / fadeHeight, 0.02, 1)
        : toothHeight;
      const rootRadius = radius;
      const apexRadius = Math.max(EPS, radius + effectiveToothHeight);
      const rootHalf = rootWidth / 2;
      const apexHalf = apexWidth / 2;
      const point = (r, zz) => ({
        x: at[0] + radial.x * r,
        y: at[1] + radial.y * r,
        z: at[2] + zz,
      });
      wires.push(
        wireFromPoints([
          point(rootRadius, z - rootHalf),
          point(apexRadius, z - apexHalf),
          point(apexRadius, z + apexHalf),
          point(rootRadius, z + rootHalf),
        ])
      );
    }

    return kernel.loft(wires, true, false);
  };

  const thread = (opts = {}) => {
    const config = { ...opts };
    const pitch = config.pitch;
    const radius = config.radius ?? config.r ?? (config.diameter ?? config.d) / 2;
    const height = config.height ?? config.h;
    const rootWidth = config.rootWidth ?? config.root;
    const apexWidth = config.apexWidth ?? config.apex;
    const toothHeight = config.toothHeight ?? config.tooth;
    if (!(pitch > 0) || !(radius > 0) || !(height > 0)) {
      throw new Error(`thread: invalid pitch/radius/height ${pitch} / ${radius} / ${height}`);
    }
    if (!(rootWidth > 0) || !(apexWidth > 0) || !(Math.abs(toothHeight) > EPS)) {
      throw new Error(`thread: invalid profile ${rootWidth} / ${apexWidth} / ${toothHeight}`);
    }
    const starts = Math.max(1, Math.floor(config.starts ?? 1));
    const shapes = [];
    for (let i = 0; i < starts; i++) {
      shapes.push(
        makeThreadStart(
          {
            ...config,
            pitch,
            radius,
            height,
            rootWidth,
            apexWidth,
            toothHeight,
          },
          ((config.startAngleDeg ?? 0) * Math.PI) / 180 + (i * Math.PI * 2) / starts
        )
      );
    }
    return starts === 1 ? shapes[0] : kernel.makeCompound(shapes);
  };

  const metricThread = (opts = {}) => {
    const config = metricThreadConfig(opts.name ?? opts.size ?? 'M6', opts.height ?? opts.h, opts.external ?? true, opts.clearance ?? 0, opts.fine ?? false);
    const shape = thread({ ...config, ...opts, radius: opts.radius ?? opts.r ?? config.radius });
    if (opts.includeCore && config.toothHeight > 0) {
      const overlap = Math.min(Math.abs(config.toothHeight) * 0.05, 0.05);
      return pattern.fuse([cylinder({ radius: config.radius + overlap, height: config.height, at: opts.at ?? [opts.x ?? 0, opts.y ?? 0, opts.z ?? 0] }), shape]);
    }
    return shape;
  };

  const threadEnvelope = (opts = {}) => {
    const shape = cylinder(opts);
    const pitch = opts.pitch;
    const radius = opts.radius ?? opts.r ?? (opts.diameter ?? opts.d) / 2;
    const height = opts.height ?? opts.h;
    const at = opts.at ?? [opts.x ?? 0, opts.y ?? 0, opts.z ?? 0];
    const helix = pitch > 0 && height > 0 && radius > 0
      ? transform.translate(kernel.makeHelixWire({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, pitch, height, radius), at[0], at[1], at[2])
      : null;
    return { shape, helix };
  };

  return {
    cuboid,
    box: cuboid,
    boxFromCorners,
    cylinder,
    cone,
    roundedBox,
    tube,
    ring,
    torus,
    hexPrism,
    slot,
    dovetail,
    gridHoles,
    thread,
    makeThread: thread,
    rawThread: thread,
    metricThread,
    threadProfileConfig,
    trapezoidalThreadConfig: threadProfileConfig,
    metricThreadProfileConfig,
    metricThreadConfig,
    conjugateThreadConfig,
    metricThreadConfigConjugate,
    addThreadClearance,
    threadEnvelope,
    fuse: pattern.fuse,
  };
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
  const sketch = createSketch(kernel);
  const transform = createTransform(kernel);
  const pattern = createPattern(kernel, transform);
  const ctx = {
    kernel,
    sketch,
    transform,
    pattern,
    solid: createSolid(kernel, sketch, transform, pattern),
    echo: (...args) => logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')),
  };
  const shape = build(ctx, params);
  if (typeof shape !== 'number') {
    throw new Error('OCCT model build() must return a shape handle.');
  }
  return { shape, parameters: normalized, logs };
}
