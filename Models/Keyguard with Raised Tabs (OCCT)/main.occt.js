const parameters = [
  { name: 'tablet_width', caption: 'Tablet width', group: 'Tablet', initial: 280, min: 80, max: 500, step: 1 },
  { name: 'tablet_height', caption: 'Tablet height', group: 'Tablet', initial: 210, min: 60, max: 400, step: 1 },
  { name: 'base_thickness', caption: 'Base thickness', group: 'Body', initial: 2.4, min: 0.8, max: 10, step: 0.1 },
  { name: 'frame_margin', caption: 'Frame margin', group: 'Body', initial: 12, min: 2, max: 50, step: 1 },
  { name: 'corner_radius', caption: 'Corner radius', group: 'Body', initial: 8, min: 0, max: 30, step: 1 },
  { name: 'rows', caption: 'Rows', group: 'Cells', initial: 4, min: 1, max: 10, step: 1 },
  { name: 'columns', caption: 'Columns', group: 'Cells', initial: 6, min: 1, max: 12, step: 1 },
  { name: 'bar_width', caption: 'Bar width', group: 'Cells', initial: 5, min: 1, max: 20, step: 0.5 },
  { name: 'cell_corner_radius', caption: 'Cell corner radius', group: 'Cells', initial: 4, min: 0, max: 15, step: 0.5 },
  { name: 'raised_tabs', caption: 'Raised tabs', group: 'Raised tabs', type: 'boolean', initial: true },
  { name: 'tab_height', caption: 'Tab height', group: 'Raised tabs', initial: 2.5, min: 0.5, max: 10, step: 0.5 },
];

function build({ kernel, sketch }, p) {
  const rows = Math.max(1, Math.round(p.rows));
  const cols = Math.max(1, Math.round(p.columns));
  const outer = sketch.roundedRect(-p.tablet_width / 2, -p.tablet_height / 2, p.tablet_width, p.tablet_height, p.corner_radius);
  const holes = [sketch.roundedRect(-p.tablet_width / 2 + p.frame_margin, -p.tablet_height / 2 + p.frame_margin, p.tablet_width - 2 * p.frame_margin, p.tablet_height - 2 * p.frame_margin, p.corner_radius / 2)];
  const base = sketch.extrude(sketch.face(outer, holes), p.base_thickness);
  const solids = [base];
  const gridW = p.tablet_width - 2 * p.frame_margin;
  const gridH = p.tablet_height - 2 * p.frame_margin;
  const cellW = (gridW - (cols + 1) * p.bar_width) / cols;
  const cellH = (gridH - (rows + 1) * p.bar_width) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -gridW / 2 + p.bar_width + c * (cellW + p.bar_width);
      const y = -gridH / 2 + p.bar_width + r * (cellH + p.bar_width);
      const rimOuter = sketch.roundedRect(x, y, cellW, cellH, p.cell_corner_radius);
      const rimInner = sketch.roundedRect(x + p.bar_width / 2, y + p.bar_width / 2, cellW - p.bar_width, cellH - p.bar_width, Math.max(0, p.cell_corner_radius - p.bar_width / 2));
      solids.push(sketch.extrude(sketch.face(rimOuter, [rimInner]), p.base_thickness + (p.raised_tabs ? p.tab_height : 0), p.base_thickness));
    }
  }
  return kernel.fuseAll(solids);
}
