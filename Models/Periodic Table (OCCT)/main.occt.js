const parameters = [
  { name: 'BoxUnits', caption: 'Box unit size', group: 'Size', initial: 40, min: 10, max: 100, step: 1 },
  { name: 'BoxHeight', caption: 'Box height', group: 'Size', initial: 40, min: 5, max: 120, step: 1 },
  { name: 'BoxWall', caption: 'Box wall', group: 'Size', initial: 1, min: 0.5, max: 8, step: 0.1 },
  { name: 'BoxFloor', caption: 'Box floor', group: 'Size', initial: 2, min: 0.5, max: 12, step: 0.1 },
  { name: 'BoxWidthUnits', caption: 'Box width units', group: 'Size', initial: 0, min: 0, max: 8, step: 1 },
  { name: 'BoxLengthUnits', caption: 'Box length units', group: 'Size', initial: 6, min: 1, max: 12, step: 1 },
  { name: 'SuppressMaleDT', caption: 'Suppress male dovetails', group: 'Dovetail', type: 'boolean', initial: false },
  { name: 'SuppressFemaleDT', caption: 'Suppress female dovetails', group: 'Dovetail', type: 'boolean', initial: true },
  { name: 'DTInsideLength', caption: 'Dovetail inside length', group: 'Dovetail', initial: 1.1, min: 0.2, max: 8, step: 0.1 },
  { name: 'DTWidth', caption: 'Dovetail width', group: 'Dovetail', initial: 1.5, min: 0.2, max: 8, step: 0.1 },
  { name: 'EnableCardSlot', caption: 'Card slot', group: 'Card Slot', type: 'boolean', initial: true },
  { name: 'CardWidth', caption: 'Card width', group: 'Card Slot', initial: 30, min: 5, max: 120, step: 1 },
  { name: 'CardSlotHeight', caption: 'Card slot height', group: 'Card Slot', initial: 2, min: 0.5, max: 15, step: 0.5 },
  { name: 'CardSlotDepth', caption: 'Card slot depth', group: 'Card Slot', initial: 15, min: 2, max: 80, step: 1 },
  { name: 'CardSlotYPos', caption: 'Card slot Z', group: 'Card Slot', initial: 10, min: 1, max: 80, step: 1 },
];

function build({ kernel, sketch }, p) {
  const box = (x, y, z, w, d, h) => kernel.makeBoxFromCorners({ x, y, z }, { x: x + w, y: y + d, z: z + h });
  const width = p.BoxWidthUnits > 0 ? p.BoxWidthUnits * p.BoxUnits : p.BoxWall * 2 + 0.1;
  const length = Math.max(1, Math.round(p.BoxLengthUnits)) * p.BoxUnits;
  const wall = p.BoxWall;
  const body = box(0, 0, 0, length, width, p.BoxHeight);
  const tools = [
    box(wall, wall + p.DTWidth, p.BoxFloor, Math.max(1, length - 2 * wall - p.DTWidth), Math.max(1, width - 2 * wall - p.DTWidth), p.BoxHeight + 2),
  ];
  if (p.EnableCardSlot) {
    tools.push(box(length - p.CardSlotDepth, (width - p.CardWidth) / 2, p.CardSlotYPos, p.CardSlotDepth + wall + 1, p.CardWidth, p.CardSlotHeight));
  }
  if (!p.SuppressFemaleDT) {
    const dt = sketch.extrude(sketch.face(sketch.polygon([[0, 0], [p.DTInsideLength / 2, 0], [p.DTInsideLength / 2 + p.DTWidth, p.DTWidth], [-p.DTInsideLength / 2 - p.DTWidth, p.DTWidth], [-p.DTInsideLength / 2, 0]])), p.BoxHeight + 1);
    for (let i = 1; i <= p.BoxLengthUnits; i++) tools.push(kernel.translate(dt, (i - 0.5) * p.BoxUnits, 0, -0.5));
  }
  const cut = kernel.cutAll(body, tools);
  const adds = [cut];
  if (!p.SuppressMaleDT) {
    const dtFace = sketch.face(sketch.polygon([[-p.DTInsideLength / 2, 0], [p.DTInsideLength / 2, 0], [p.DTInsideLength / 2 + p.DTWidth, p.DTWidth], [-p.DTInsideLength / 2 - p.DTWidth, p.DTWidth]]));
    const dtSolid = sketch.extrude(dtFace, p.BoxHeight);
    for (let i = 1; i <= p.BoxLengthUnits; i++) adds.push(kernel.translate(dtSolid, (i - 0.5) * p.BoxUnits, width, 0));
  }
  return kernel.fuseAll(adds);
}
