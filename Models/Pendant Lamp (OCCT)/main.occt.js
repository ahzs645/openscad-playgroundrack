const parameters = [
  { name: 'radius', caption: 'Radius', group: 'Shape', initial: 100, min: 30, max: 220, step: 1 },
  { name: 'thickness', caption: 'Thickness', group: 'Shape', initial: 0.8, min: 0.4, max: 8, step: 0.1 },
  { name: 'pleat_gap', caption: 'Pleat gap', group: 'Pleats', initial: 2.8, min: 1, max: 12, step: 0.1 },
  { name: 'pleat_height', caption: 'Pleat height', group: 'Pleats', initial: 1.2, min: 0, max: 8, step: 0.1 },
  { name: 'pleat_offset', caption: 'Pleat offset', group: 'Pleats', initial: -1, min: -4, max: 4, step: 0.1 },
  { name: 'opening_diameter', caption: 'Opening diameter', group: 'Openings', initial: 80, min: 10, max: 180, step: 1 },
  { name: 'shade_depth', caption: 'Shade holder depth', group: 'Openings', initial: 15, min: 0, max: 50, step: 1 },
  { name: 'shade_thickness', caption: 'Shade holder thickness', group: 'Openings', initial: 2, min: 0.5, max: 10, step: 0.1 },
  { name: 'top_brim', caption: 'Top brim', group: 'Openings', type: 'boolean', initial: false },
  { name: 'bottom_brim', caption: 'Bottom brim', group: 'Openings', type: 'boolean', initial: true },
  { name: 'pleats_inside', caption: 'Pleats inside', group: 'Pleats', type: 'boolean', initial: false },
];

function build({ kernel }, p) {
  const r = p.radius;
  const openingR = p.opening_diameter / 2;
  const shell = kernel.cut(kernel.makeSphere(r), kernel.makeSphere(Math.max(1, r - p.thickness)));
  const topCut = kernel.translate(kernel.makeCylinder(openingR, r * 2), 0, 0, 0);
  const botCut = kernel.translate(kernel.makeCylinder(openingR, r * 2), 0, 0, -r * 2);
  const solids = [kernel.cutAll(shell, [topCut, botCut])];
  const sign = p.pleats_inside ? -1 : 1;
  for (let z = -r + p.pleat_gap; z < r; z += p.pleat_gap) {
    const slice = Math.sqrt(Math.max(0, r * r - z * z));
    if (slice > openingR + p.pleat_height * 2 && p.pleat_height > 0) {
      solids.push(kernel.translate(kernel.makeTorus(slice + sign * p.pleat_offset, p.pleat_height), 0, 0, z));
    }
  }
  const openingZ = Math.sqrt(Math.max(0, r * r - openingR * openingR));
  const ring = (z) => kernel.translate(kernel.makeTorus(openingR - p.shade_thickness / 2, p.shade_thickness / 2), 0, 0, z);
  if (p.top_brim) solids.push(ring(openingZ));
  if (p.bottom_brim) solids.push(ring(-openingZ));
  return kernel.fuseAll(solids);
}
