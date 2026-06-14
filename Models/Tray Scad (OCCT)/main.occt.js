const parameters = [
  { name: 'width', caption: 'Width', group: 'Tray', initial: 120, min: 20, max: 300, step: 1 },
  { name: 'depth', caption: 'Depth', group: 'Tray', initial: 80, min: 20, max: 240, step: 1 },
  { name: 'height', caption: 'Height', group: 'Tray', initial: 24, min: 5, max: 100, step: 1 },
  { name: 'wall', caption: 'Wall thickness', group: 'Tray', initial: 2, min: 0.8, max: 10, step: 0.1 },
  { name: 'radius', caption: 'Corner radius', group: 'Tray', initial: 8, min: 0, max: 30, step: 1 },
  { name: 'dividers_x', caption: 'X dividers', group: 'Dividers', initial: 2, min: 0, max: 8, step: 1 },
  { name: 'dividers_y', caption: 'Y dividers', group: 'Dividers', initial: 1, min: 0, max: 8, step: 1 },
];

function build({ kernel, sketch }, p) {
  const outer = sketch.roundedRect(-p.width / 2, -p.depth / 2, p.width, p.depth, p.radius);
  const inner = sketch.roundedRect(-p.width / 2 + p.wall, -p.depth / 2 + p.wall, p.width - 2 * p.wall, p.depth - 2 * p.wall, Math.max(0, p.radius - p.wall));
  const solids = [sketch.extrude(sketch.face(outer, [inner]), p.height), sketch.extrude(sketch.face(inner), p.wall)];
  for (let i = 1; i <= Math.round(p.dividers_x); i++) {
    const x = -p.width / 2 + p.wall + i * (p.width - 2 * p.wall) / (Math.round(p.dividers_x) + 1) - p.wall / 2;
    solids.push(kernel.makeBoxFromCorners({ x, y: -p.depth / 2 + p.wall, z: p.wall }, { x: x + p.wall, y: p.depth / 2 - p.wall, z: p.height }));
  }
  for (let i = 1; i <= Math.round(p.dividers_y); i++) {
    const y = -p.depth / 2 + p.wall + i * (p.depth - 2 * p.wall) / (Math.round(p.dividers_y) + 1) - p.wall / 2;
    solids.push(kernel.makeBoxFromCorners({ x: -p.width / 2 + p.wall, y, z: p.wall }, { x: p.width / 2 - p.wall, y: y + p.wall, z: p.height }));
  }
  return kernel.fuseAll(solids);
}
