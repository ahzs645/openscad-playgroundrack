const parameters = [
  { name: 'component_selection', caption: 'Component', group: 'Component Selection', type: 'string', initial: 'stamp', options: ['stamp', 'handle'] },
  { name: 'svg_style', caption: 'Stamp style', group: 'Style', type: 'string', initial: 'negative', options: ['positive', 'negative'] },
  { name: 'knub_height', caption: 'Knub height', group: 'Dimensions', initial: 10, min: 2, max: 40, step: 1 },
  { name: 'knub_radius', caption: 'Knub radius', group: 'Dimensions', initial: 10, min: 2, max: 30, step: 0.5 },
  { name: 'wrapper_w', caption: 'Wrapper width', group: 'Dimensions', initial: 30, min: 10, max: 100, step: 1 },
  { name: 'wrapper_h', caption: 'Wrapper height', group: 'Dimensions', initial: 40, min: 10, max: 120, step: 1 },
  { name: 'rounded_radius', caption: 'Corner radius', group: 'Dimensions', initial: 5, min: 0, max: 20, step: 0.5 },
  { name: 'stamp_ridge_height', caption: 'Ridge height', group: 'Dimensions', initial: 2.5, min: 0.5, max: 10, step: 0.5 },
  { name: 'cut_depth', caption: 'Cut depth', group: 'Dimensions', initial: 2.5, min: 0.5, max: 10, step: 0.5 },
];

function build({ kernel, sketch }, p) {
  const rectFace = sketch.face(sketch.roundedRect(-p.wrapper_w / 2, -p.wrapper_h / 2, p.wrapper_w, p.wrapper_h, p.rounded_radius));
  const ring = kernel.cut(sketch.extrude(rectFace, p.knub_height), kernel.translate(kernel.makeCylinder(Math.max(0.5, p.knub_radius - 0.1), p.knub_height + 2), 0, 0, -1));
  const knub = kernel.translate(kernel.makeCylinder(p.knub_radius, p.knub_height), 0, 0, 0);
  const mark = kernel.translate(sketch.extrude(sketch.face(sketch.roundedRect(-p.wrapper_w * 0.25, -p.wrapper_h * 0.18, p.wrapper_w * 0.5, p.wrapper_h * 0.36, 1.5)), p.stamp_ridge_height), 0, 0, p.knub_height);
  if (p.component_selection === 'handle') return kernel.fuse(kernel.makeCylinder(p.knub_radius * 0.8, p.knub_height * 2), kernel.translate(kernel.makeSphere(p.knub_radius), 0, 0, p.knub_height * 2));
  if (p.svg_style === 'positive') return kernel.fuseAll([ring, knub, mark]);
  const pad = kernel.translate(sketch.extrude(rectFace, p.cut_depth), 0, 0, p.knub_height);
  return kernel.fuseAll([ring, knub, kernel.cut(pad, mark)]);
}
