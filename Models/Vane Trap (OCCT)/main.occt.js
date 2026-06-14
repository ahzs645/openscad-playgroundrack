const parameters = [
  { name: 'PART', caption: 'Part', group: 'Configuration', type: 'string', initial: 'assembly', options: ['vanes', 'funnel', 'assembly'] },
  { name: 'jar_thread_od', caption: 'Jar thread OD', group: 'Jar', initial: 86.6, min: 50, max: 120, step: 0.1 },
  { name: 'jar_thread_len', caption: 'Jar thread length', group: 'Jar', initial: 8, min: 2, max: 30, step: 0.5 },
  { name: 'funnel_top_od', caption: 'Funnel top OD', group: 'Funnel', initial: 120, min: 60, max: 220, step: 1 },
  { name: 'funnel_bot_od', caption: 'Funnel bottom OD', group: 'Funnel', initial: 50, min: 20, max: 120, step: 1 },
  { name: 'funnel_height', caption: 'Funnel height', group: 'Funnel', initial: 40, min: 10, max: 120, step: 1 },
  { name: 'funnel_wall', caption: 'Funnel wall', group: 'Funnel', initial: 2, min: 0.8, max: 8, step: 0.1 },
  { name: 'vane_h', caption: 'Vane height', group: 'Vanes', initial: 140, min: 40, max: 260, step: 1 },
  { name: 'vane_w', caption: 'Vane width', group: 'Vanes', initial: 130, min: 40, max: 240, step: 1 },
  { name: 'vane_t', caption: 'Vane thickness', group: 'Vanes', initial: 2, min: 0.8, max: 8, step: 0.1 },
];

function build({ kernel }, p) {
  const box = (x, y, z, w, d, h) => kernel.makeBoxFromCorners({ x, y, z }, { x: x + w, y: y + d, z: z + h });
  const cone = kernel.makeCone(p.funnel_top_od / 2, p.funnel_bot_od / 2 + p.funnel_wall, p.funnel_height);
  const collar = kernel.translate(kernel.makeCylinder(p.jar_thread_od / 2 + p.funnel_wall, p.jar_thread_len), 0, 0, -p.jar_thread_len);
  const outer = kernel.fuse(cone, collar);
  const innerCone = kernel.translate(kernel.makeCone(p.funnel_top_od / 2 - p.funnel_wall, p.funnel_bot_od / 2, p.funnel_height + 2), 0, 0, -1);
  const innerCollar = kernel.translate(kernel.makeCylinder(p.jar_thread_od / 2, p.jar_thread_len + 2), 0, 0, -p.jar_thread_len - 1);
  const keyTools = [];
  for (const a of [0, 90, 180, 270]) {
    const tool = box(-p.vane_w / 4, p.funnel_top_od / 2 - 2, p.funnel_height - p.vane_t - 6, p.vane_w / 2, p.vane_t + 3, p.vane_t + 6);
    keyTools.push(kernel.rotate(tool, { point: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 } }, a * Math.PI / 180));
  }
  const funnel = kernel.cutAll(outer, [innerCone, innerCollar, ...keyTools]);
  const vane1 = box(-p.vane_t / 2, -p.vane_w / 2, 0, p.vane_t, p.vane_w, p.vane_h);
  const vane2 = kernel.rotate(vane1, { point: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 } }, Math.PI / 2);
  const vanes = kernel.translate(kernel.fuse(vane1, vane2), 0, 0, p.funnel_height - p.vane_t - 3);
  if (p.PART === 'vanes') return vanes;
  if (p.PART === 'funnel') return funnel;
  return kernel.fuse(funnel, vanes);
}
