/*
Parametric gel comb — OpenCASCADE (occt-wasm) variant of the OpenSCAD model
in "Parametric Gel Comb". Same parameter names and default geometry, built
as exact BREP solids instead of meshes, so STEP export is lossless.

Units: millimeters.

The playground evaluates this file with an OCCT kernel context:
  build({ kernel, sketch, echo }, params) -> shape handle
See src/runner/occt-model-runtime.js for the sketch helper API.
*/

const parameters = [
  // ---------- Teeth ----------
  { name: 'tooth_count', caption: 'Tooth count', group: 'Teeth', type: 'number', initial: 38, min: 1, max: 100, step: 1 },
  { name: 'tooth_length', caption: 'Tooth length', group: 'Teeth', type: 'number', initial: 20.0, min: 5, max: 60, step: 0.5 },
  { name: 'tooth_width', caption: 'Tooth width', group: 'Teeth', type: 'number', initial: 3.0, min: 0.5, max: 10, step: 0.1 },
  { name: 'tooth_thickness', caption: 'Tooth thickness', group: 'Teeth', type: 'number', initial: 0.7, min: 0.2, max: 5, step: 0.1 },
  { name: 'tooth_gap', caption: 'Gap between teeth', group: 'Teeth', type: 'number', initial: 1.5, min: 0.2, max: 10, step: 0.1 },
  { name: 'tooth_corner_radius', caption: 'Tooth corner radius', group: 'Teeth', type: 'number', initial: 0.35, min: 0, max: 2, step: 0.05 },

  // ---------- Main body ----------
  { name: 'bar_thickness', caption: 'Bar thickness', group: 'Main body', type: 'number', initial: 1.0, min: 0.2, max: 5, step: 0.1 },
  { name: 'side_overhang', caption: 'Side overhang', group: 'Main body', type: 'number', initial: 3.7, min: 0, max: 20, step: 0.1 },
  { name: 'bar_height', caption: 'Bar height', group: 'Main body', type: 'number', initial: 18.0, min: 5, max: 60, step: 0.5 },
  { name: 'body_corner_radius', caption: 'Body corner radius', group: 'Main body', type: 'number', initial: 0.6, min: 0, max: 3, step: 0.1 },

  // ---------- Slots above the teeth ----------
  { name: 'slot_count', caption: 'Slot count', group: 'Slots', type: 'number', initial: 2, min: 0, max: 6, step: 1 },
  { name: 'slot_height', caption: 'Slot height', group: 'Slots', type: 'number', initial: 3.0, min: 0.5, max: 10, step: 0.1 },
  { name: 'slot_width_manual', caption: 'Slot width (0 = auto-fit)', group: 'Slots', type: 'number', initial: 0, min: 0, max: 120, step: 1 },
  { name: 'slot_gap', caption: 'Gap between slots', group: 'Slots', type: 'number', initial: 4.0, min: 0.5, max: 30, step: 0.5 },
  { name: 'slot_side_margin', caption: 'Slot side margin (auto-fit)', group: 'Slots', type: 'number', initial: 6.0, min: 0, max: 40, step: 0.5 },
  { name: 'slot_center_y', caption: 'Slot center height', group: 'Slots', type: 'number', initial: 9.8, min: 1, max: 50, step: 0.1 },

  // ---------- Side hooks ----------
  { name: 'show_side_hooks', caption: 'Show side hooks', group: 'Side hooks', type: 'boolean', initial: true },
  { name: 'hook_width', caption: 'Hook width', group: 'Side hooks', type: 'number', initial: 2.2, min: 0.5, max: 8, step: 0.1 },
  { name: 'hook_drop', caption: 'Hook drop', group: 'Side hooks', type: 'number', initial: 6.0, min: 0.5, max: 30, step: 0.5 },
  { name: 'hook_attach_height', caption: 'Hook attach height', group: 'Side hooks', type: 'number', initial: 1.2, min: 0.2, max: 10, step: 0.1 },
  { name: 'hook_radius', caption: 'Hook corner radius', group: 'Side hooks', type: 'number', initial: 0.4, min: 0, max: 1, step: 0.05 },
  { name: 'hook_angle_degrees', caption: 'Hook angle (deg, + leans outward)', group: 'Side hooks', type: 'number', initial: 8.0, min: -30, max: 30, step: 0.5 },
  { name: 'hook_tip_outward_extra', caption: 'Extra hook tip offset', group: 'Side hooks', type: 'number', initial: 0, min: -5, max: 5, step: 0.1 },

  // ---------- Raised ridge bands ----------
  { name: 'show_front_ridges', caption: 'Front ridges', group: 'Ridges', type: 'boolean', initial: true },
  { name: 'show_back_ridges', caption: 'Back ridges', group: 'Ridges', type: 'boolean', initial: false },
  { name: 'front_ridge_thickness', caption: 'Front ridge thickness', group: 'Ridges', type: 'number', initial: 0.2, min: 0, max: 2, step: 0.05 },
  { name: 'back_ridge_thickness', caption: 'Back ridge thickness', group: 'Ridges', type: 'number', initial: 0.2, min: 0, max: 2, step: 0.05 },
  { name: 'top_ridge_height', caption: 'Top ridge height', group: 'Ridges', type: 'number', initial: 1.0, min: 0, max: 10, step: 0.1 },
  { name: 'bottom_ridge_height', caption: 'Bottom ridge height', group: 'Ridges', type: 'number', initial: 1.0, min: 0, max: 10, step: 0.1 },
  { name: 'bottom_ridge_gap_from_teeth', caption: 'Bottom ridge gap above teeth', group: 'Ridges', type: 'number', initial: 1.0, min: 0, max: 20, step: 0.1 },
];

function build({ kernel, sketch, echo }, p) {
  // ---------- Calculated geometry (matches the OpenSCAD model) ----------
  const toothCount = Math.max(1, Math.round(p.tooth_count));
  const toothPitch = p.tooth_width + p.tooth_gap;
  const teethSpan = toothCount * p.tooth_width + (toothCount - 1) * p.tooth_gap;
  const barWidth = teethSpan + 2 * p.side_overhang;

  const slotCount = Math.max(0, Math.round(p.slot_count));
  const autoSlotWidth = slotCount > 0
    ? (barWidth - 2 * p.slot_side_margin - (slotCount - 1) * p.slot_gap) / slotCount
    : 0;
  const slotWidth = p.slot_width_manual > 0 ? p.slot_width_manual : autoSlotWidth;
  const slotGroupWidth = slotCount * slotWidth + (slotCount - 1) * p.slot_gap;
  const slotStartX = p.slot_width_manual > 0
    ? -slotGroupWidth / 2
    : -barWidth / 2 + p.slot_side_margin;
  const slotY = p.slot_center_y - p.slot_height / 2;

  if (slotCount > 0 && slotWidth <= 0) {
    echo('WARNING: slot width is <= 0; slots are skipped. Increase side_overhang or reduce slot_count/slot_gap/slot_side_margin.');
  }

  // ---------- Slot hole wires (shared by the bar and the ridge bands) ----------
  const slotWires = () => {
    const wires = [];
    if (slotCount > 0 && slotWidth > 0) {
      for (let i = 0; i < slotCount; i++) {
        const x = slotStartX + i * (slotWidth + p.slot_gap);
        wires.push(sketch.roundedRect(x, slotY, slotWidth, p.slot_height, p.slot_height / 2));
      }
    }
    return wires;
  };

  // ---------- Main bar with slot cutouts ----------
  const barFace = sketch.face(
    sketch.roundedRect(-barWidth / 2, 0, barWidth, p.bar_height, p.body_corner_radius),
    slotWires(),
  );
  const solids = [sketch.extrude(barFace, p.bar_thickness)];

  // ---------- Teeth: one tooth solid, repeated with a linear pattern ----------
  // Teeth overlap the bar by 0.1mm (like the SCAD model) so the fuse is robust.
  const toothFace = sketch.face(
    sketch.roundedRect(-teethSpan / 2, -p.tooth_length, p.tooth_width, p.tooth_length + 0.1, p.tooth_corner_radius),
  );
  const toothSolid = sketch.extrude(toothFace, p.tooth_thickness);
  solids.push(toothCount > 1
    ? kernel.linearPattern(toothSolid, { x: 1, y: 0, z: 0 }, toothPitch, toothCount)
    : toothSolid);

  // ---------- Angled side hooks ----------
  if (p.show_side_hooks) {
    const hookTotalHeight = p.hook_drop + p.hook_attach_height;
    const safeHookRadius = Math.min(
      p.hook_radius,
      Math.max(0, p.hook_width / 2 - 0.01),
      Math.max(0, hookTotalHeight / 2 - 0.01),
    );
    for (const side of [-1, 1]) {
      const outwardTipOffset = hookTotalHeight * Math.tan(p.hook_angle_degrees * Math.PI / 180) + p.hook_tip_outward_extra;
      const tipShiftX = side * outwardTipOffset;
      const outerTopX = side * barWidth / 2;
      const innerTopX = outerTopX - side * p.hook_width;
      const outerBottomX = outerTopX + tipShiftX;
      const innerBottomX = innerTopX + tipShiftX;
      const pts = side < 0
        ? [[outerBottomX, -p.hook_drop], [innerBottomX, -p.hook_drop], [innerTopX, p.hook_attach_height], [outerTopX, p.hook_attach_height]]
        : [[innerBottomX, -p.hook_drop], [outerBottomX, -p.hook_drop], [outerTopX, p.hook_attach_height], [innerTopX, p.hook_attach_height]];
      const hookWire = sketch.roundedPolygon(pts, safeHookRadius);
      solids.push(sketch.extrude(sketch.face(hookWire), p.tooth_thickness));
    }
  }

  // ---------- Raised ridge bands, clipped to the bar outline ----------
  // A band is the planar intersection of the slotted bar face with a
  // full-width horizontal strip, then extruded outward from a face.
  const ridgeBandFaces = () => {
    const bands = [
      { center: p.bar_height - p.top_ridge_height / 2, height: p.top_ridge_height },
      { center: p.bottom_ridge_gap_from_teeth + p.bottom_ridge_height / 2, height: p.bottom_ridge_height },
    ];
    const faces = [];
    for (const band of bands) {
      if (!(band.height > 0)) continue;
      const strip = sketch.face(sketch.roundedRect(-barWidth / 2 - 1, band.center - band.height / 2, barWidth + 2, band.height, 0));
      const clipped = kernel.common(barFace, strip);
      if (sketch.faceCount(clipped) > 0) faces.push(clipped);
    }
    return faces;
  };

  if ((p.show_front_ridges && p.front_ridge_thickness > 0) || (p.show_back_ridges && p.back_ridge_thickness > 0)) {
    for (const bandFace of ridgeBandFaces()) {
      if (p.show_front_ridges && p.front_ridge_thickness > 0) {
        solids.push(sketch.extrude(bandFace, p.front_ridge_thickness, p.bar_thickness));
      }
      if (p.show_back_ridges && p.back_ridge_thickness > 0) {
        solids.push(sketch.extrude(bandFace, p.back_ridge_thickness, -p.back_ridge_thickness));
      }
    }
  }

  return kernel.fuseAll(solids);
}
