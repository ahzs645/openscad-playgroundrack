const parameters = [
  { name: 'columns', caption: 'Columns', group: 'Grid', initial: 5, min: 1, max: 12, step: 1 },
  { name: 'rows', caption: 'Rows', group: 'Grid', initial: 2, min: 1, max: 8, step: 1 },
  { name: 'card_width', caption: 'Card width', group: 'Card', initial: 64, min: 20, max: 120, step: 1 },
  { name: 'card_depth', caption: 'Card depth', group: 'Card', initial: 8, min: 2, max: 30, step: 1 },
  { name: 'wall', caption: 'Wall thickness', group: 'Grid', initial: 2, min: 0.8, max: 8, step: 0.1 },
  { name: 'base_height', caption: 'Base height', group: 'Grid', initial: 8, min: 2, max: 30, step: 1 },
];

function build({ kernel }, p) {
  const box = (x, y, z, w, d, h) => kernel.makeBoxFromCorners({ x, y, z }, { x: x + w, y: y + d, z: z + h });
  const cols = Math.round(p.columns), rows = Math.round(p.rows);
  const w = cols * p.card_width + (cols + 1) * p.wall;
  const d = rows * p.card_depth + (rows + 1) * p.wall;
  const base = box(-w / 2, -d / 2, 0, w, d, p.base_height);
  const tools = [];
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    tools.push(box(-w / 2 + p.wall + c * (p.card_width + p.wall), -d / 2 + p.wall + r * (p.card_depth + p.wall), p.base_height / 2, p.card_width, p.card_depth, p.base_height + 2));
  }
  return kernel.cutAll(base, tools);
}
