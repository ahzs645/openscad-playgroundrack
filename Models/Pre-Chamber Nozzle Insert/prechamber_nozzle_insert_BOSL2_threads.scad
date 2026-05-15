/*
  BOSL2 OpenSCAD starter model
  Approximate part: M14x1.25 external / M10x1.0 internal spark-plug-style
  pre-chamber / jet-nozzle insert.

  This version uses BOSL2's real helical ISO/UTS-style thread geometry
  instead of the earlier cosmetic ring grooves.

  Required library:
    BOSL2 installed in your OpenSCAD library path.

  BOSL2 includes used:
    include <BOSL2/std.scad>
    include <BOSL2/threading.scad>

  Notes:
  - This is reverse-engineering starter CAD only, not a production drawing.
  - Dimensions other than the provided threads/holes/hex are estimated from photos.
  - For a live engine / combustion / pressure part, final geometry, material,
    heat treatment, tolerances, and inspection should be specified by a qualified
    engineer or machinist.
  - Metal AM threads this small usually still need post-machining/tapping/chasing.

  Known from supplied notes/photos:
  - External thread: M14 x 1.25
  - Internal thread: M10 x 1.0, approx. 19 mm deep
  - Hex: 3/4 inch across flats = 19.05 mm
  - Holes at nozzle end: one axial 2.5 mm, one radial 2.5 mm, two radial 1.0 mm

  Coordinate system:
  - Z=0 is the conical nozzle/tip end.
  - Positive Z goes toward the hex/internal-thread end.
*/

include <BOSL2/std.scad>
include <BOSL2/threading.scad>

$fn = 96;
$fa = 1;
$fs = 0.25;

// -------------------------
// User-adjustable dimensions
// -------------------------

// Dimension preset selector.
//   "original"  = first-pass guess: 3/4" hex, 21.5 mm collar OD.
//   "corrected" = user-supplied correction: 5/8" hex, 0.73" (18.542 mm) collar OD.
dim_preset = "corrected"; // [original, corrected]

// Toggle true BOSL2 threads vs. plain cylinders.  Leave true for thread model.
model_external_thread = true;
model_internal_thread = true;

// Main envelope; guessed from photos/tape. Adjust with calipers/CMM.
overall_len        = 35.0;       // total length, mm; guessed from tape photos
nose_len           = 7.0;        // conical nose length, mm; guessed
threaded_len       = 21.5;       // external M14 threaded section length, mm; guessed
flange_h           = 2.8;        // round shoulder/flange height, mm; guessed
hex_h              = overall_len - nose_len - threaded_len - flange_h;

// External M14x1.25 thread section
ext_thread_major_d = 14.0;       // M14 nominal major OD
ext_thread_pitch   = 1.25;
external_thread_slop = 0.00;     // normally 0 for metal/CNC reference models

// Internal M10x1.0 thread section
int_thread_major_d = 10.0;       // M10 nominal major diameter of mating male thread
int_thread_pitch   = 1.0;
int_thread_depth   = 19.0;       // supplied approximate thread depth
internal_thread_slop = 0.00;     // BOSL2 internal thread clearance; set >0 for printed fit trials

// Bore used if true helical internal thread is disabled; also used for small reliefs.
plain_int_bore_d   = 8.8;        // approximate M10x1 tap drill/minor bore reference

// Hex / shoulder / tip shape
// Preset-driven: 3/4" (19.05 mm) vs corrected 5/8" (15.875 mm) across flats.
hex_af             = (dim_preset == "corrected") ? 15.875 : 19.05;
// Round collar/flange immediately below the hex.
// Original guess 21.5 mm; corrected 0.73" = 18.542 mm.
flange_d           = (dim_preset == "corrected") ? 18.542 : 21.5;
nose_tip_flat_d    = 5.8;        // diameter of flat at conical tip around axial hole; guessed

// Internal pre-chamber/bore behind the small axial tip hole.
prechamber_d       = 5.5;        // guessed internal chamber diameter
prechamber_start_z = 2.2;        // axial tip hole opens into chamber here; guessed
int_thread_start_z = overall_len - int_thread_depth;
prechamber_end_z   = int_thread_start_z + 0.6;  // slight overlap into rear thread cut

// Holes/orifices
axial_hole_d       = 2.5;
side_large_d       = 2.5;
side_small_d       = 1.0;
side_hole_z        = 4.2;        // radial hole Z location on conical end; guessed
side_hole_cut_len  = 12.0;

// Hole clocking around the cone. Adjust these after inspecting the sample.
large_side_angle   = 0;
small_side_angle_1 = 120;
small_side_angle_2 = 240;

// Small clearance so subtractive cuts pass cleanly through faces.
eps = 0.03;

// -------------------------
// Helpers
// -------------------------

module hex_prism_af(af, h) {
    // OpenSCAD cylinder(d=..., $fn=6) uses vertex-to-vertex diameter.
    // Across-flats = sqrt(3) * radius, so vertex diameter = 2*AF/sqrt(3).
    vertex_d = 2 * af / sqrt(3);
    rotate([0, 0, 30]) cylinder(h=h, d=vertex_d, $fn=6);
}

module external_M14_thread(len) {
    if (model_external_thread) {
        // BOSL2 UTS/ISO 60-degree helical thread.
        // anchor=BOTTOM makes the part start at local Z=0.
        threaded_rod(
            d=ext_thread_major_d,
            l=len,
            pitch=ext_thread_pitch,
            anchor=BOTTOM,
            blunt_start=false,
            bevel=false,
            $slop=external_thread_slop
        );
    } else {
        cylinder(h=len, d=ext_thread_major_d);
    }
}

module internal_M10_thread_cut(depth) {
    start_z = overall_len - depth;

    if (model_internal_thread) {
        // BOSL2 internal thread mask.  This is subtracted from the body.
        // It extends a bit past the open end and overlaps the pre-chamber cut.
        translate([0, 0, start_z - eps])
            threaded_rod(
                d=int_thread_major_d,
                l=depth + 2*eps,
                pitch=int_thread_pitch,
                internal=true,
                anchor=BOTTOM,
                blunt_start=false,
                bevel=false,
                $slop=internal_thread_slop
            );
    } else {
        translate([0, 0, start_z - eps])
            cylinder(h=depth + 2*eps, d=plain_int_bore_d);
    }
}

module radial_hole_from_center(d, z, angle_deg, cut_len) {
    // Radial hole from the center/chamber outward.  It cuts one side only.
    rotate([0, 0, angle_deg])
        translate([0, 0, z])
            rotate([0, 90, 0])
                translate([0, 0, -0.40])
                    cylinder(h=cut_len + 0.40, d=d, $fn=max(24, ceil(d*24)));
}

module rear_mouth_chamfer_cut() {
    // Slight rear lead-in/chamfer at internal bore mouth, matching the photos roughly.
    translate([0, 0, overall_len - 1.1])
        cylinder(h=1.4, d1=int_thread_major_d + 1.7, d2=int_thread_major_d + 0.3, $fn=72);
}

// -------------------------
// Positive outer body
// -------------------------

module positive_body() {
    union() {
        // Conical nozzle end.
        cylinder(h=nose_len, d1=nose_tip_flat_d, d2=ext_thread_major_d);

        // M14x1.25 external threaded body.
        translate([0, 0, nose_len])
            external_M14_thread(threaded_len);

        // Round shoulder/flange below the hex.
        translate([0, 0, nose_len + threaded_len])
            cylinder(h=flange_h, d=flange_d);

        // 3/4 inch hex end.
        translate([0, 0, nose_len + threaded_len + flange_h])
            hex_prism_af(hex_af, hex_h);
    }
}

// -------------------------
// Subtractive holes / bores
// -------------------------

module subtractive_features() {
    // 2.5 mm axial tip/orifice hole.
    translate([0, 0, -eps])
        cylinder(h=prechamber_start_z + 2*eps, d=axial_hole_d, $fn=48);

    // Internal pre-chamber behind the axial tip orifice.
    translate([0, 0, prechamber_start_z])
        cylinder(h=prechamber_end_z - prechamber_start_z, d=prechamber_d, $fn=72);

    // Rear M10x1.0 internal thread, approx. 19 mm deep.
    internal_M10_thread_cut(int_thread_depth);

    // Side holes in/near the conical nozzle end.
    radial_hole_from_center(side_large_d, side_hole_z, large_side_angle, side_hole_cut_len);
    radial_hole_from_center(side_small_d, side_hole_z, small_side_angle_1, side_hole_cut_len);
    radial_hole_from_center(side_small_d, side_hole_z, small_side_angle_2, side_hole_cut_len);

    // Rear bore lead-in.
    rear_mouth_chamfer_cut();
}

// -------------------------
// Final model
// -------------------------

difference() {
    positive_body();
    subtractive_features();
}
