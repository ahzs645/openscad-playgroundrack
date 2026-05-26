import { VectorHelperService } from '@bitbybit-dev/occt/lib/api/vector-helper.service.js';
import { ShapesHelperService } from '@bitbybit-dev/occt/lib/api/shapes-helper.service.js';
import { OccHelper } from '@bitbybit-dev/occt/lib/occ-helper.js';
import { OCCTService } from '@bitbybit-dev/occt/lib/occ-service.js';
import { IndexedPolyhedron } from './common';
import createOcct32 from '@bitbybit-dev/occt/bitbybit-dev-occt/cdn.js';
import createOcct64Mt from '@bitbybit-dev/occt/bitbybit-dev-occt-64-bit-mt/cdn.js';

export type OcctStepExportArch = '32' | '64-mt';

type CsgValue = number | string | boolean | CsgValue[] | Record<string, CsgValue>;
type CsgNode = {
  name: string;
  args: Record<string, CsgValue>;
  children: CsgNode[];
};

let occt32Promise: Promise<any> | undefined;
let occt64MtPromise: Promise<any> | undefined;

async function getOcct(arch: OcctStepExportArch) {
  const originalProcess = (globalThis as any).process;
  (globalThis as any).process = undefined;
  if (arch === '64-mt') {
    if (!occt64MtPromise) {
      occt64MtPromise = createOcct64Mt().finally(() => {
        (globalThis as any).process = originalProcess;
      });
    }
    return occt64MtPromise;
  }
  if (!occt32Promise) {
    occt32Promise = createOcct32().finally(() => {
      (globalThis as any).process = originalProcess;
    });
  }
  return occt32Promise;
}

class CsgParser {
  declare private i: number;
  declare private readonly source: string;

  constructor(source: string) {
    this.source = source;
    this.i = 0;
  }

  parse(): CsgNode {
    this.skip();
    const node = this.node();
    this.skip();
    return node;
  }

  private node(): CsgNode {
    const name = this.ident();
    this.skip();
    const args = this.peek() === '(' ? this.args() : {};
    this.skip();
    const children = this.peek() === '{' ? this.children() : [];
    this.skip();
    if (this.peek() === ';') this.i++;
    return { name, args, children };
  }

  private args(): Record<string, CsgValue> {
    const args: Record<string, CsgValue> = {};
    let positional = 0;
    this.expect('(');
    while (true) {
      this.skip();
      if (this.peek() === ')') {
        this.i++;
        return args;
      }
      if (/[A-Za-z_$]/.test(this.peek())) {
        const start = this.i;
        const key = this.ident();
        this.skip();
        if (this.peek() === '=') {
          this.i++;
          args[key] = this.value();
        } else {
          this.i = start;
          args[String(positional++)] = this.value();
        }
      } else {
        args[String(positional++)] = this.value();
      }
      this.skip();
      if (this.peek() === ',') this.i++;
    }
  }

  private children(): CsgNode[] {
    const children: CsgNode[] = [];
    this.expect('{');
    while (true) {
      this.skip();
      if (this.peek() === '}') {
        this.i++;
        return children;
      }
      children.push(this.node());
    }
  }

  private value(): CsgValue {
    this.skip();
    const ch = this.peek();
    if (ch === '[') return this.array();
    if (ch === '"') return this.string();
    if (this.source.startsWith('true', this.i)) {
      this.i += 4;
      return true;
    }
    if (this.source.startsWith('false', this.i)) {
      this.i += 5;
      return false;
    }
    return this.number();
  }

  private array(): CsgValue[] {
    const values: CsgValue[] = [];
    this.expect('[');
    while (true) {
      this.skip();
      if (this.peek() === ']') {
        this.i++;
        return values;
      }
      values.push(this.value());
      this.skip();
      if (this.peek() === ',') this.i++;
    }
  }

  private string(): string {
    this.expect('"');
    let value = '';
    while (this.i < this.source.length && this.peek() !== '"') {
      value += this.source[this.i++];
    }
    this.expect('"');
    return value;
  }

  private number(): number {
    const start = this.i;
    while (/[+\-0-9.eE]/.test(this.peek())) this.i++;
    const value = Number(this.source.slice(start, this.i));
    if (!Number.isFinite(value)) throw new Error(`Invalid CSG number at ${start}`);
    return value;
  }

  private ident(): string {
    const start = this.i;
    while (/[A-Za-z0-9_$]/.test(this.peek())) this.i++;
    if (start === this.i) throw new Error(`Expected CSG identifier at ${start}`);
    return this.source.slice(start, this.i);
  }

  private skip() {
    while (this.i < this.source.length) {
      if (/\s/.test(this.peek())) {
        this.i++;
      } else if (this.source.startsWith('//', this.i)) {
        while (this.i < this.source.length && this.peek() !== '\n') this.i++;
      } else {
        break;
      }
    }
  }

  private expect(ch: string) {
    this.skip();
    if (this.peek() !== ch) throw new Error(`Expected "${ch}" at ${this.i}`);
    this.i++;
  }

  private peek() {
    return this.source[this.i] ?? '';
  }
}

function asNumber(value: CsgValue | undefined, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function asBool(value: CsgValue | undefined, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asVector(value: CsgValue | undefined, fallback: number[]): number[] {
  return Array.isArray(value) ? value.map(v => Number(v)) : fallback;
}

function asMatrix(value: CsgValue | undefined): number[][] {
  if (!Array.isArray(value)) throw new Error('Expected multmatrix m argument.');
  return value.map(row => {
    if (!Array.isArray(row)) throw new Error('Expected multmatrix rows.');
    return row.map(v => Number(v));
  });
}

function dispose(shape: any) {
  if (shape && typeof shape.delete === 'function') shape.delete();
}

function applyMatrix(occ: any, och: OccHelper, shape: any, matrix: number[][]) {
  const trsf = new occ.gp_GTrsf();
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      trsf.SetValue(row + 1, col + 1, matrix[row]?.[col] ?? (row === col ? 1 : 0));
    }
  }
  const transformed = new occ.BRepBuilderAPI_GTransform(shape, trsf).Shape();
  const actual = och.converterService.getActualTypeOfShape(transformed);
  transformed.delete();
  trsf.delete();
  return actual;
}

function buildShape(occ: any, service: OCCTService, och: OccHelper, node: CsgNode): any {
  const childShapes = () => node.children.map(child => buildShape(occ, service, och, child));

  switch (node.name) {
    case 'group':
    case 'color':
    case 'render':
    case 'union': {
      const shapes = childShapes();
      if (shapes.length === 0) throw new Error(`${node.name} has no children.`);
      if (shapes.length === 1) return shapes[0];
      return service.booleans.union({ shapes, keepEdges: false });
    }
    case 'difference': {
      const shapes = childShapes();
      if (shapes.length < 2) throw new Error('difference requires at least two children.');
      return service.booleans.difference({ shape: shapes[0], shapes: shapes.slice(1), keepEdges: false });
    }
    case 'intersection': {
      const shapes = childShapes();
      const results = service.booleans.intersection({ shapes, keepEdges: false });
      if (!results[0]) throw new Error('intersection produced no shape.');
      return results.length === 1 ? results[0] : service.booleans.union({ shapes: results, keepEdges: false });
    }
    case 'multmatrix': {
      const shapes = childShapes();
      if (shapes.length !== 1) throw new Error('multmatrix requires exactly one child.');
      const transformed = applyMatrix(occ, och, shapes[0], asMatrix(node.args.m ?? node.args[0]));
      dispose(shapes[0]);
      return transformed;
    }
    case 'cube': {
      const size = asVector(node.args.size, [1, 1, 1]);
      const center = asBool(node.args.center, false);
      return service.shapes.solid.createBox({
        width: size[0] ?? 1,
        length: size[1] ?? size[0] ?? 1,
        height: size[2] ?? size[0] ?? 1,
        center: center ? [0, 0, 0] : [(size[0] ?? 1) / 2, (size[1] ?? size[0] ?? 1) / 2, (size[2] ?? size[0] ?? 1) / 2],
        originOnCenter: true,
      });
    }
    case 'sphere':
      return service.shapes.solid.createSphere({
        radius: asNumber(node.args.r, asNumber(node.args.$fn, 1)),
        center: [0, 0, 0],
      });
    case 'cylinder': {
      const h = asNumber(node.args.h, 1);
      const r1 = asNumber(node.args.r1, asNumber(node.args.r, 1));
      const r2 = asNumber(node.args.r2, asNumber(node.args.r, r1));
      const center = asBool(node.args.center, false);
      if (Math.abs(r1 - r2) > 1e-7) {
        const cone = service.shapes.solid.createCone({
          radius1: r1,
          radius2: r2,
          height: h,
          center: [0, 0, center ? -h / 2 : 0],
          direction: [0, 0, 1],
          angle: Math.PI * 2,
        });
        return cone;
      }
      return service.shapes.solid.createCylinder({
        radius: r1,
        height: h,
        center: center ? [0, 0, 0] : [0, 0, h / 2],
        direction: [0, 0, 1],
        originOnCenter: true,
      });
    }
    default:
      throw new Error(`Unsupported CSG node "${node.name}" for exact OCCT STEP export.`);
  }
}

export async function exportStepFromCsg(csg: string, arch: OcctStepExportArch): Promise<string> {
  const occ = await getOcct(arch);
  const och = new OccHelper(new VectorHelperService(), new ShapesHelperService(), occ);
  const service = new OCCTService(occ, och);
  const root = new CsgParser(csg).parse();
  const shape = buildShape(occ, service, och, root);
  try {
    return service.io.saveShapeSTEP({ shape, adjustYtoZ: false, fromRightHanded: true });
  } finally {
    dispose(shape);
  }
}

export async function exportStepFromMesh(data: IndexedPolyhedron, arch: OcctStepExportArch): Promise<string> {
  const occ = await getOcct(arch);
  const och = new OccHelper(new VectorHelperService(), new ShapesHelperService(), occ);
  const service = new OCCTService(occ, och);
  const triangles = data.faces.map(face => face.vertices.map(index => {
    const vertex = data.vertices[index];
    return [vertex.x, vertex.y, vertex.z];
  }));
  const faces = service.shapes.face.fromBaseMesh({ mesh: triangles });
  if (faces.length === 0) {
    throw new Error('Could not build OCCT faces from mesh fallback.');
  }
  const shape = service.shapes.compound.makeCompound({ shapes: faces });
  try {
    return service.io.saveShapeSTEP({ shape, adjustYtoZ: false, fromRightHanded: true });
  } finally {
    dispose(shape);
    faces.forEach(dispose);
  }
}
