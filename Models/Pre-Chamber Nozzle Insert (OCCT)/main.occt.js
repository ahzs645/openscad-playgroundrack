const parameters = [
  { name: 'dimension_preset', caption: 'Dimension preset', group: 'Dimension preset', type: 'string', initial: 'corrected', options: ['original', 'corrected'] },
  { name: 'overall_len', caption: 'Overall length', group: 'Envelope', initial: 35, min: 15, max: 80, step: 0.5 },
  { name: 'nose_len', caption: 'Nose length', group: 'Envelope', initial: 7, min: 2, max: 20, step: 0.5 },
  { name: 'threaded_len', caption: 'Thread envelope length', group: 'Envelope', initial: 21.5, min: 5, max: 50, step: 0.5 },
  { name: 'collar_h', caption: 'Collar height', group: 'Envelope', initial: 2.8, min: 0.5, max: 12, step: 0.1 },
  { name: 'nose_tip_flat_d', caption: 'Nose tip flat diameter', group: 'Tip', initial: 5.8, min: 2, max: 12, step: 0.1 },
  { name: 'axial_hole_d', caption: 'Axial hole diameter', group: 'Holes', initial: 2.5, min: 0.5, max: 6, step: 0.1 },
  { name: 'side_large_d', caption: 'Large side hole diameter', group: 'Holes', initial: 2.5, min: 0.5, max: 6, step: 0.1 },
  { name: 'side_small_d', caption: 'Small side hole diameter', group: 'Holes', initial: 1, min: 0.3, max: 4, step: 0.1 },
  { name: 'side_hole_z', caption: 'Side hole Z', group: 'Holes', initial: 4.2, min: 1, max: 20, step: 0.1 },
  { name: 'side_hole_tilt_from_horizontal', caption: 'Side hole tilt', group: 'Holes', initial: 30, min: -60, max: 60, step: 1 },
];

function build({ kernel, sketch, solid }, p) {
  const inch = 25.4;
  const hexAf = p.dimension_preset === 'corrected' ? 5 / 8 * inch : 3 / 4 * inch;
  const collarD = p.dimension_preset === 'corrected' ? 0.73 * inch : 21.5;
  const hexH = Math.max(1, p.overall_len - p.nose_len - p.threaded_len - p.collar_h);
  const nose = kernel.makeCone(p.nose_tip_flat_d / 2, 7, p.nose_len);
  const threadEnvelope = solid.metricThread({ name: 'M14', height: p.threaded_len, includeCore: true, at: [0, 0, p.nose_len], samplesPerTurn: 16 });
  const collar = kernel.translate(kernel.makeCylinder(collarD / 2, p.collar_h), 0, 0, p.nose_len + p.threaded_len);
  const hexR = hexAf / Math.sqrt(3);
  const hexPts = Array.from({ length: 6 }, (_, i) => [hexR * Math.cos(Math.PI / 6 + i * Math.PI / 3), hexR * Math.sin(Math.PI / 6 + i * Math.PI / 3)]);
  const hex = kernel.translate(sketch.extrude(sketch.face(sketch.polygon(hexPts)), hexH), 0, 0, p.nose_len + p.threaded_len + p.collar_h);
  const body = kernel.fuseAll([nose, threadEnvelope, collar, hex]);
  const axial = kernel.translate(kernel.makeCylinder(p.axial_hole_d / 2, p.overall_len + 2), 0, 0, -1);
  const bore = kernel.translate(kernel.makeCylinder(4.4, 19), 0, 0, p.overall_len - 19);
  const sideTools = [];
  for (const [dia, az] of [[p.side_large_d, 0], [p.side_small_d, 120], [p.side_small_d, 240]]) {
    let hole = kernel.translate(kernel.makeCylinder(dia / 2, 18), 0, 0, -1);
    hole = kernel.rotate(hole, { point: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } }, (90 + p.side_hole_tilt_from_horizontal) * Math.PI / 180);
    hole = kernel.rotate(hole, { point: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 } }, az * Math.PI / 180);
    sideTools.push(kernel.translate(hole, 0, 0, p.side_hole_z));
  }
  return kernel.cutAll(body, [axial, bore, ...sideTools]);
}
