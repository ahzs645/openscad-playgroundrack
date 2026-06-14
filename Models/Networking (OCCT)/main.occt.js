const parameters = [
  { name: 'rack_width', caption: 'Rack width', group: 'Basic dimensions', initial: 120, min: 40, max: 300, step: 1 },
  { name: 'rack_depth', caption: 'Rack depth', group: 'Basic dimensions', initial: 80, min: 30, max: 220, step: 1 },
  { name: 'rack_height', caption: 'Rack height', group: 'Basic dimensions', initial: 100, min: 30, max: 240, step: 1 },
  { name: 'wall_thickness', caption: 'Wall thickness', group: 'Basic dimensions', initial: 2, min: 0.8, max: 10, step: 0.1 },
  { name: 'poe_switch_width', caption: 'POE cutout width', group: 'Equipment', initial: 100, min: 10, max: 250, step: 1 },
  { name: 'poe_switch_height', caption: 'POE cutout height', group: 'Equipment', initial: 25, min: 5, max: 80, step: 1 },
  { name: 'patch_panel_width', caption: 'Patch cutout width', group: 'Equipment', initial: 100, min: 10, max: 250, step: 1 },
  { name: 'patch_panel_height', caption: 'Patch cutout height', group: 'Equipment', initial: 20, min: 5, max: 80, step: 1 },
  { name: 'vent_hole_size', caption: 'Vent hole size', group: 'Ventilation', initial: 3, min: 1, max: 12, step: 0.5 },
  { name: 'vent_spacing', caption: 'Vent spacing', group: 'Ventilation', initial: 8, min: 4, max: 30, step: 1 },
];

function build({ kernel }, p) {
  const box = (x, y, z, w, d, h) => kernel.makeBoxFromCorners({ x, y, z }, { x: x + w, y: y + d, z: z + h });
  const cylX = (x, y, z, r, h) => kernel.rotate(kernel.translate(kernel.makeCylinder(r, h), x, y, z), { point: { x, y, z }, direction: { x: 0, y: 1, z: 0 } }, Math.PI / 2);
  const wt = Math.min(p.wall_thickness, p.rack_width / 4, p.rack_depth / 4);
  const body = box(0, 0, 0, p.rack_width, p.rack_depth, p.rack_height);
  const tools = [
    box(wt, wt, wt, p.rack_width - 2 * wt, p.rack_depth - 2 * wt, p.rack_height + wt),
    box((p.rack_width - p.poe_switch_width) / 2, -1, 20, p.poe_switch_width, wt + 2, p.poe_switch_height),
    box((p.rack_width - p.patch_panel_width) / 2, -1, 50, p.patch_panel_width, wt + 2, p.patch_panel_height),
    box(p.rack_width / 4, p.rack_depth - wt - 1, 30, 10, wt + 2, 8),
    box(3 * p.rack_width / 4 - 10, p.rack_depth - wt - 1, 30, 10, wt + 2, 8),
  ];
  for (let x = 15; x <= p.rack_width - 15; x += p.vent_spacing) {
    for (let z = 15; z <= p.rack_height - 15; z += p.vent_spacing) {
      tools.push(cylX(-1, p.rack_depth / 3, z, p.vent_hole_size / 2, wt + 2));
      tools.push(cylX(p.rack_width - wt - 1, p.rack_depth / 3, z, p.vent_hole_size / 2, wt + 2));
    }
  }
  const shell = kernel.cutAll(body, tools);
  const shelf1 = box(wt, wt, 20 + p.poe_switch_height + 2, p.rack_width - 2 * wt, p.rack_depth - 2 * wt, 2);
  const shelf2 = box(wt, wt, 50 + p.patch_panel_height + 2, p.rack_width - 2 * wt, p.rack_depth - 2 * wt, 2);
  return kernel.fuseAll([shell, shelf1, shelf2]);
}
