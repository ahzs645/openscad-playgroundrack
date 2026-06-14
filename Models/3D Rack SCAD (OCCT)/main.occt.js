const parameters = [
  { name: 'rack_width', caption: 'Rack width', group: 'Rack Dimensions', initial: 201, min: 80, max: 420, step: 1 },
  { name: 'rack_depth', caption: 'Rack depth', group: 'Rack Dimensions', initial: 222.4, min: 80, max: 420, step: 1 },
  { name: 'section_height', caption: 'Section height', group: 'Rack Dimensions', initial: 9.4, min: 3, max: 30, step: 0.1 },
  { name: 'num_plates', caption: 'Number of plates', group: 'Plate Configuration', initial: 3, min: 1, max: 10, step: 1 },
  { name: 'hole_diameter', caption: 'Hole diameter', group: 'Hole Configuration', initial: 16, min: 2, max: 50, step: 1 },
  { name: 'hole_spacing', caption: 'Hole spacing', group: 'Hole Configuration', initial: 9.8, min: 2, max: 50, step: 0.5 },
  { name: 'side_margin', caption: 'Side margin', group: 'Margins', initial: 30, min: 5, max: 80, step: 1 },
  { name: 'front_margin', caption: 'Front margin', group: 'Margins', initial: 15, min: 5, max: 80, step: 1 },
  { name: 'support_thickness', caption: 'Support thickness', group: 'Dovetail', initial: 14.3, min: 4, max: 40, step: 0.1 },
  { name: 'handle_height', caption: 'Handle height', group: 'Handle', initial: 60, min: 10, max: 140, step: 1 },
  { name: 'slot_width', caption: 'Slot width', group: 'Handle', initial: 150, min: 20, max: 300, step: 1 },
  { name: 'slot_height', caption: 'Slot height', group: 'Handle', initial: 36, min: 5, max: 100, step: 1 },
  { name: 'component_selection', caption: 'Component', group: 'Component Selection', type: 'string', initial: 'assembly', options: ['assembly', 'bottom_rack', 'combined_rack', 'vertical_support'] },
];

function build({ kernel, sketch }, p) {
  const box = (x, y, z, w, d, h) => kernel.makeBoxFromCorners({ x, y, z }, { x: x + w, y: y + d, z: z + h });
  const cyl = (x, y, z, r, h) => kernel.translate(kernel.makeCylinder(r, h), x, y, z);
  const cols = Math.max(1, Math.floor((p.rack_width - 2 * p.side_margin + p.hole_spacing) / (p.hole_diameter + p.hole_spacing)));
  const rows = Math.max(1, Math.floor((p.rack_depth - 2 * p.front_margin + p.hole_spacing) / (p.hole_diameter + p.hole_spacing)));
  const sx = cols <= 1 ? 0 : (p.rack_width - 2 * p.side_margin - cols * p.hole_diameter) / (cols - 1);
  const sy = rows <= 1 ? 0 : (p.rack_depth - 2 * p.front_margin - rows * p.hole_diameter) / (rows - 1);
  const plate = (z) => {
    const base = box(-p.rack_width / 2, -p.rack_depth / 2, z, p.rack_width, p.rack_depth, p.section_height);
    const tools = [];
    for (let ix = 0; ix < cols; ix++) for (let iy = 0; iy < rows; iy++) {
      tools.push(cyl(-p.rack_width / 2 + p.side_margin + p.hole_diameter / 2 + ix * (p.hole_diameter + sx), -p.rack_depth / 2 + p.front_margin + p.hole_diameter / 2 + iy * (p.hole_diameter + sy), z - 1, p.hole_diameter / 2, p.section_height + 2));
    }
    return kernel.cutAll(base, tools);
  };
  const plates = [];
  for (let i = 0; i < Math.round(p.num_plates); i++) plates.push(plate(i * p.section_height * 2));
  const support = box(-p.rack_width / 2 - p.support_thickness, -p.rack_depth / 2, 0, p.support_thickness, p.rack_depth, p.num_plates * p.section_height * 2 + p.handle_height);
  const support2 = box(p.rack_width / 2, -p.rack_depth / 2, 0, p.support_thickness, p.rack_depth, p.num_plates * p.section_height * 2 + p.handle_height);
  const handle = box(-p.slot_width / 2, -p.rack_depth / 2, p.num_plates * p.section_height * 2, p.slot_width, p.rack_depth, p.handle_height);
  const slot = box(-p.slot_width / 2 + p.support_thickness, -p.rack_depth / 2 - 1, p.num_plates * p.section_height * 2 + (p.handle_height - p.slot_height) / 2, p.slot_width - 2 * p.support_thickness, p.rack_depth + 2, p.slot_height);
  const vertical = kernel.fuseAll([support, support2, kernel.cut(handle, slot)]);
  if (p.component_selection === 'bottom_rack') return plates[0];
  if (p.component_selection === 'combined_rack') return kernel.fuseAll(plates);
  if (p.component_selection === 'vertical_support') return vertical;
  return kernel.fuseAll([...plates, vertical]);
}
