const parameters = [
  { name: 'width', caption: 'Width', group: 'Prototype', initial: 80, min: 10, max: 200, step: 1 },
  { name: 'depth', caption: 'Depth', group: 'Prototype', initial: 50, min: 10, max: 160, step: 1 },
  { name: 'height', caption: 'Height', group: 'Prototype', initial: 20, min: 5, max: 100, step: 1 },
  { name: 'hole_radius', caption: 'Hole radius', group: 'Prototype', initial: 8, min: 1, max: 30, step: 1 },
];

function build({ kernel, sketch }, p) {
  const body = sketch.extrude(sketch.face(sketch.roundedRect(-p.width / 2, -p.depth / 2, p.width, p.depth, 6)), p.height);
  const hole = kernel.translate(kernel.makeCylinder(p.hole_radius, p.height + 2), 0, 0, -1);
  return kernel.cut(body, hole);
}
