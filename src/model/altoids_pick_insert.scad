// Altoids-tin insert that parks guitar picks in a row of slanted slots.
//
// Every slot is configured independently: pick shape, pick thickness, and a
// slop factor that inflates the slot outline so a pick that is not exactly the
// nominal shape still drops in. A solid comb in the bottom of the insert grips
// the lower part of each pick; everything above the comb is open so a single
// pick can be pinched and lifted out along its slot. A scalloped trough runs
// down the middle of the comb so the centre of a pick stands well clear of the
// plastic while the ends of its slot still hold it square.
//
// Picks lie with their long axis across the tin, because a pick leaning at 45
// degrees is far taller than the tin if its long axis points up the slope. Even
// so, the tin is the binding constraint: a 26 mm teardrop needs 19.45 of the
// 20 mm to lean at 45 degrees, and the two triangles do not fit at that angle
// at all. So `lean` is a request, and the model raises it to whatever the
// tallest pick in the slot list needs and says so.
//
// Export:  openscad -o insert.stl --export-format binstl altoids_pick_insert.scad
//
// Two colours: `part` cuts the insert into the slotted comb and the tray that
// surrounds it. The two share coincident faces and no volume, so their union is
// exactly the one-piece insert, and a slicer can hand each one its own
// filament. Either render them one at a time —
//          openscad -o comb.off -D 'part="comb"' altoids_pick_insert.scad
// which is what the web app does before assembling the 3MF itself, or let
// OpenSCAD write both into one 3MF —
//          openscad -o insert.3mf --enable=lazy-union -D 'part="split"' \
//              altoids_pick_insert.scad
// which needs a desktop build: the WASM builds have no 3MF exporter.
// Preview: preview_picks renders the picks *instead of* the insert, so the two
//          can be rendered separately and overlaid; preview_box adds the tin.
// Outlines come from the pick SVGs via tools/svg_to_profile.py.

include <pick_profiles.scad>

/* [Tin] */
tin_width = 95;         // interior length of the tin (mr moxeys)
tin_depth = 58;         // interior depth of the tin (mr moxeys)
corner_radius = 13;     // corner radius of the tin interior (mr moxeys)
// tin_width = 90;         // interior length of the tin
// tin_depth = 56;         // interior depth of the tin
// corner_radius = 11;     // corner radius of the tin interior
tin_height = 21;        // interior height with the lid closed
fit_clearance = 0.3;    // total slop so the insert drops in without force

/* [Pick types] */
// name, then the two outline dimensions in mm: width across the shoulders and
// height from tip to butt. The smaller of the two always leans up the slope.
pick_types = [
    ["butterfly",         25, 29],
    ["diamond",           20, 25],
    ["rounded_triangle",  29, 28],
    ["teardrop",          26, 30],
    ["triangle",          30, 30],
];

/* [Slots] */
// One slot per entry, laid out along the length of the tin. Give a pick type
// and, optionally, that pick's thickness in mm. Only these three shapes fit a
// 45 degree comb; a triangle or rounded triangle in this list steepens the
// whole comb, because that is the only way they clear the lid.
slots = [
    ["teardrop", 1.5],
    ["teardrop", 1.5],
    ["teardrop", 1.5],
    ["teardrop", 1.5],
    ["teardrop", 1.5],
    ["teardrop", 1.5],
    ["teardrop", 1.5],
    ["teardrop", 1.5],
    ["teardrop", 1.5],
];

default_thickness = 1.5;
thickness_slop = 0.2;   // added to pick thickness, total across both faces
shape_slop = 0.05;      // slot outline scaled up by this fraction of the pick
lean = 45;              // requested slot angle away from vertical
steepen_to_fit = true;  // raise lean if a pick would otherwise foul the lid

/* [Insert] */
insert_height = 19;
wall = 2;
base = 1.2;             // floor under the whole insert
comb_height = 13;        // slots exist only below this; picks are free above it
keep_floor = false;     // true walls off every slot, at the cost of a steeper
                        // lean; false lets deep slots open through the floor so
                        // the pick rests on the tin itself
thin_floor = 0.4;       // thinnest floor worth printing before opening it up
min_fin = 1.6;          // plastic left between two slots
lid_gap = 0.5;          // headroom left under the closed lid
side_gap = 1.5;         // gap between a leaning pick and the tin wall
end_gap = 1.0;          // gap between the first slot and the insert wall
mouth_flare = 0.7;      // lead-in at the top of each slot
mouth_depth = 2.0;      // how far down the slot the lead-in tapers

/* [Extras] */
centre_dip = 2;         // depth of the trough down the middle of the comb, 0 is flat
centre_width = 20;      // how wide the trough opens at the comb top
thumb_scallop = true;   // dish in the front wall to lift the insert out
scallop_radius = 10;
scallop_depth = 5;

/* [Two-colour export] */
// "all" is the one-piece insert. "tray" and "comb" are the two halves of a
// two-colour print, one at a time. "split" draws both as separate top-level
// objects, which only means anything under --enable=lazy-union.
part = "all";           // ["all", "tray", "comb", "split"]
tray_colour = "#2a5f7a";
comb_colour = "#c8442a";

/* [Preview] */
// Both of these are for looking at, not for exporting: neither has any
// business being in a printable STL.
preview_picks = false;  // draw the picks on their own, without the insert
preview_box = false;    // the tin around the insert, drawn 1 mm thick
box_wall = 1.0;

/* [Hidden] */
$fn = 96;

// ------------------------------------------------------------------ picks ---

w = tin_width - fit_clearance;
d = tin_depth - fit_clearance;
n = len(slots);
headroom = tin_height - lid_gap;

function type_row(name) =
    let (rows = [for (t = pick_types) if (t[0] == name) t])
    assert(len(rows) == 1, str("unknown pick type: ", name))
    rows[0];

function profile_of(name) =
    let (rows = [for (p = pick_profiles) if (p[0] == name) p[1]])
    assert(len(rows) == 1, str("no outline generated for pick type: ", name))
    rows[0];

function pick_name(i) = slots[i][0];
// The narrow axis leans up the slope; the wide one lies across the tin.
function rise_axis(i) = min(type_row(pick_name(i))[1], type_row(pick_name(i))[2]);
function cross_axis(i) = max(type_row(pick_name(i))[1], type_row(pick_name(i))[2]);
function turned(i) = type_row(pick_name(i))[2] < type_row(pick_name(i))[1];
function thickness(i) = is_undef(slots[i][1]) ? default_thickness : slots[i][1];
function slab(i) = thickness(i) + thickness_slop;

// ------------------------------------------------------------------- lean ---

// A pick leaning by tilt is rise_axis * cos(tilt) + thickness * sin(tilt) tall:
// the far corner of the slab, not the midplane, is what fouls the lid. Solving
// that for the tilt a given pick needs gives a closed form.
function lean_for(i) =
    let (hyp = norm([rise_axis(i), thickness(i)]))
    atan(thickness(i) / rise_axis(i)) +
    acos(min(1, (headroom - (keep_floor ? base : 0)) / hyp));

lean_needed = max([for (i = [0 : n - 1]) lean_for(i)]);
tallest = [for (i = [0 : n - 1]) if (lean_for(i) == lean_needed) pick_name(i)][0];
tilt = steepen_to_fit ? max(lean, lean_needed) : lean;

ux = sin(tilt);         // unit vector along a slot, pointing up and towards +X
uz = cos(tilt);

// A pick slides down its slot until a corner bottoms out, and stands this tall
// from there. Seat the tall ones lower to buy headroom under the lid; a pick
// that needs the very bottom of the tin gets a slot straight through the floor.
function pick_height(i) = rise_axis(i) * uz + thickness(i) * ux;
function floor_z(i) =
    let (room = headroom - pick_height(i))      // highest floor that still fits
    room >= base || keep_floor ? base :         // the usual case: full floor
    room >= thin_floor ? room :                 // thinner floor, still printable
    0;                                          // open, pick rests on the tin
function pick_top(i) = floor_z(i) + pick_height(i);
function through(i) = floor_z(i) < 0.01;

// Lowest point of the slot's midplane, which is what everything else is
// measured from. The slot's own lowest corner sits at floor_z.
function seat_z(i) = floor_z(i) + slab(i) / 2 * ux;

// ----------------------------------------------------------------- layout ---

// A slot reaches half_x past its midplane in X, and covers wide_x of X at any
// one height.
function half_x(i) = slab(i) / 2 * uz;
function wide_x(i) = slab(i) / 2 / uz;
// Slots are parallel, so the plastic between two of them is the distance
// between their midplanes less half of each slot.
function step(i) =
    ((slab(i) + slab(i + 1)) / 2 + min_fin + (seat_z(i + 1) - seat_z(i)) * ux) / uz;

first_x = -w / 2 + wall + end_gap + half_x(0);
// The last pick has to clear both the tin wall it leans towards and the top of
// the insert wall it leans over. Allow for the longest reach in the set, so the
// order of the slots cannot push a pick through a wall.
reach_x = max([for (i = [0 : n - 1]) rise_axis(i) * (1 + shape_slop) * ux + half_x(i)]);
climb_x = max([for (i = [0 : n - 1]) (insert_height - seat_z(i)) * ux / uz + wide_x(i)]);
last_x = min(w / 2 - side_gap - reach_x, w / 2 - wall - 0.8 - climb_x);

// Pack the slots as tightly as the fins allow, then share out what is left.
function packed(k) = k <= 0 ? 0 : step(k - 1) + packed(k - 1);
spread = n < 2 ? 0 : (last_x - first_x - packed(n - 1)) / (n - 1);

function seat_x(i) = i == 0 ? first_x : seat_x(i - 1) + step(i - 1) + spread;
function fin(i) = (seat_x(i + 1) - seat_x(i)) * uz - (seat_z(i + 1) - seat_z(i)) * ux
                  - (slab(i) + slab(i + 1)) / 2;

// ------------------------------------------------------------------- grip ---

// The comb top dips in a circular arc over the middle of the tin's depth. A
// trough of half-width a and depth dip is the arc of a circle of radius
// (a^2 + dip^2) / (2 * dip), whose centre sits that far above the low point.
trough = centre_dip > 0.01;
trough_r = trough ? (pow(centre_width / 2, 2) + pow(centre_dip, 2)) / (2 * centre_dip) : 0;
trough_z = comb_height - centre_dip;

// How much of a pick's up-slope length is buried in the comb, given how high
// the comb stands at that point across the tin.
function grip(i, top) = min(rise_axis(i), (top - floor_z(i)) / uz);

// ------------------------------------------------------------------ report ---

echo(str("footprint ", w, " x ", d, " x ", insert_height, " mm, ", n, " slots"));
echo(str("lean asked ", lean, " deg, using ", tilt, " deg (the ", tallest,
         " needs ", lean_needed, " deg to clear the lid)"));
for (i = [0 : n - 1])
    echo(str("slot ", i, ": ", pick_name(i), " ", thickness(i), "mm",
             ", x ", seat_x(i), ", floor ", floor_z(i), through(i) ? " (open)" : "",
             ", tops out at ", pick_top(i),
             ", grip ", grip(i, comb_height),
             trough ? str(" (", grip(i, trough_z), " mid)") : "",
             i < n - 1 ? str(", fin ", fin(i)) : ""));

assert(spread >= 0, "slots do not fit: fewer picks, thinner picks or a longer tin");
assert(max([for (i = [0 : n - 1]) cross_axis(i)]) * (1 + shape_slop) < d - 2 * wall,
       "a pick is too wide for the depth of the tin");
assert(max([for (i = [0 : n - 1]) pick_top(i)]) <= headroom,
       str("a pick fouls the lid: lean has to be at least ", lean_needed, " deg"));
assert(comb_height > base + 3 && comb_height < insert_height, "comb_height out of range");
assert(centre_dip <= centre_width / 2,
       "a trough deeper than half its width undercuts itself and will not print");
assert(!trough || trough_z > base + 3, "the centre trough eats too far into the comb");
assert(len([for (p = ["all", "tray", "comb", "split"]) if (p == part) p]) == 1,
       str("part has to be all, tray, comb or split, not ", part));

// ------------------------------------------------------------------ shapes ---

// Rounded rectangle of the given overall size, centred on the origin.
module rounded(width, depth, radius) {
    offset(r = radius)
        square([width - 2 * radius, depth - 2 * radius], center = true);
}

// Footprint of the insert, optionally shrunk by inset on every side.
module footprint(inset = 0) {
    rounded(w - 2 * inset, d - 2 * inset, corner_radius - inset);
}

// Outline of slot i's pick, laid out with its narrow axis along X.
module pick_outline(i) {
    row = type_row(pick_name(i));
    rotate(turned(i) ? 90 : 0)
        scale([row[1], row[2]])
            polygon(profile_of(pick_name(i)));
}

// Outline of slot i, which is the pick plus slop, and also the pick's mirror
// image: turning a pick over mirrors it across this axis, and nobody wants to
// work out which way round an asymmetric pick goes. For a symmetric pick the
// mirror adds nothing.
module slot_outline(i, grow = 0) {
    offset(delta = grow)
        scale(1 + shape_slop) {
            pick_outline(i);
            mirror([1, 0, 0]) pick_outline(i);
        }
}

// Puts children into slot i's plane with the bottom of a shape of the given
// up-slope extent sitting on the slot floor. In that frame the outline lies in
// XY and the slot's thickness runs along Z, so sliding a distance s up the slot
// is a move to -s in X.
module in_slot(i, extent, seat) {
    reach = extent / 2;
    translate([seat_x(i) + reach * ux, 0, seat + reach * uz])
        rotate([0, tilt + 90, 0])
            children();
}

// Slot i's own plane, the frame every part of the slot cutter is built in.
module in_slot_plane(i) {
    in_slot(i, rise_axis(i) * (1 + shape_slop), seat_z(i))
        children();
}

// Slot i's outline slid distance s up the slot, grown by grow all round.
module slid_outline(i, s, grow = 0) {
    translate([-s, 0]) slot_outline(i, grow);
}

// The mouth flare has to thicken across the slot as well as widen within it,
// which is this taper: a prism along the slot's wide axis, thickened over the
// first mouth_depth of the lead-in.
module mouth_taper(i, mouth, reach) {
    thin = slab(i) / 2;
    thick = slab(i) / 2 + mouth_flare;
    start = -(mouth - mouth_depth);
    full = -mouth;
    end = -(reach + 1);
    band = cross_axis(i) * (1 + shape_slop) + 2 * mouth_flare + 2;
    rotate([90, 0, 0])
        linear_extrude(height = band, center = true)
            polygon([
                [start + 1, -thin], [start, -thin], [full, -thick], [end, -thick],
                [end, thick], [full, thick], [start, thin], [start + 1, thin],
            ]);
}

// The volume a pick sweeps on its way out, plus a flared mouth so it is easy
// to drop back in.
//
// A pick only ever moves in its own plane, so every sweep here is hulled in 2D
// and extruded once. Hulling extruded plates in 3D instead puts the outline's
// near-coplanar points through CGAL's convex_hull_3, which asserts and leaves
// OpenSCAD to quietly drop the cutter — a slot that never gets cut.
module slot(i) {
    reach = 60;                                 // always exits the top
    mouth = (comb_height - seat_z(i)) / uz;

    in_slot_plane(i) {
        linear_extrude(height = slab(i), center = true)
            hull() {
                slid_outline(i, 0);
                slid_outline(i, reach);
            }

        // The two tapers of the mouth are separate prisms, intersected, since
        // hulling them together is the 3D hull this module set out to avoid.
        intersection() {
            linear_extrude(height = slab(i) + 2 * mouth_flare, center = true)
                hull() {
                    slid_outline(i, mouth - mouth_depth);
                    slid_outline(i, mouth, mouth_flare);
                    slid_outline(i, reach, mouth_flare);
                }
            mouth_taper(i, mouth, reach);
        }
    }

    // A pick this tall rests on the tin's own floor rather than the insert's.
    // Open the floor under it so the last of the base breaks away cleanly
    // instead of tapering to a knife edge. Square in plan: it is buried under
    // the pick, and dropping straight down is not a move in the slot's plane.
    if (through(i))
        translate([seat_x(i) - wide_x(i), -cross_axis(i) * (1 + shape_slop) / 2, -1])
            cube([2 * wide_x(i), cross_axis(i) * (1 + shape_slop), base + 2]);
}

// The pick itself, resting on the floor of its slot.
module pick(i) {
    in_slot(i, rise_axis(i), floor_z(i) + thickness(i) / 2 * ux)
        linear_extrude(height = thickness(i), center = true)
            pick_outline(i);
}

// A cylinder lying along the length of the tin, dropped so its lowest point is
// centre_dip under the comb top. Cut from the comb alone, so the insert walls
// cap both ends of the trough and keep their full height.
module centre_trough() {
    translate([0, 0, trough_z + trough_r])
        rotate([0, 90, 0])
            cylinder(h = 2 * w, r = trough_r, center = true);
}

module comb() {
    band = max([for (i = [0 : n - 1]) cross_axis(i)]) * (1 + shape_slop) + 6;
    difference() {
        intersection() {
            linear_extrude(comb_height) footprint();
            translate([-w, -band / 2, -1]) cube([2 * w, band, comb_height + 2]);
        }
        if (trough) centre_trough();
    }
}

module shell() {
    linear_extrude(base) footprint();
    difference() {
        linear_extrude(insert_height) footprint();
        translate([0, 0, -1]) linear_extrude(insert_height + 2) footprint(wall);
    }
}

// Everything taken out of the insert, whichever part it is taken out of.
module cutters() {
    for (i = [0 : n - 1]) slot(i);
    if (thumb_scallop)
        translate([0, -d / 2, insert_height + scallop_radius - scallop_depth])
            sphere(r = scallop_radius);
}

// The open volume inside the tray: everything above the floor and inside the
// wall. The comb is clipped to this rather than having the shell subtracted
// from it, which comes to the same solid without asking Manifold to cancel the
// two identical outer arcs — that leaves four zero-volume slivers in the
// rounded corners, and a slicer is entitled to choke on them.
module cavity() {
    translate([0, 0, base])
        linear_extrude(insert_height)
            footprint(wall);
}

// The two halves of a two-colour print. The tray is the shell exactly as the
// one-piece insert has it, floor and wall unbroken; the comb is only what
// stands above that floor and inside that wall. They meet on coincident faces
// and share no volume, so together they are the insert.
module tray_part() {
    difference() {
        shell();
        cutters();
    }
}

module comb_part() {
    difference() {
        intersection() {
            comb();
            cavity();
        }
        cutters();
    }
}

module insert() {
    difference() {
        union() {
            shell();
            comb();
        }
        cutters();
    }
}

// The tin the insert is built for: a shell around the interior, so the lid sits
// at tin_height and the insert stands on the floor at z = 0.
module tin() {
    difference() {
        translate([0, 0, -box_wall])
            linear_extrude(tin_height + 2 * box_wall)
                rounded(tin_width + 2 * box_wall, tin_depth + 2 * box_wall,
                        corner_radius + box_wall);
        linear_extrude(tin_height)
            rounded(tin_width, tin_depth, corner_radius);
    }
}

// The picks are a render of their own rather than something added to the
// insert: exported on their own they can be overlaid on the insert in a
// different colour, and the insert render stays printable no matter what.
if (preview_picks) {
    for (i = [0 : n - 1])
        pick(i);
} else if (part == "tray") {
    tray_part();
} else if (part == "comb") {
    comb_part();
} else if (part == "split") {
    // Two top-level children, so lazy-union can keep them apart all the way
    // into the 3MF. Anything that wraps them in a union() collapses them.
    color(tray_colour) tray_part();
    color(comb_colour) comb_part();
} else {
    union() {
        insert();

        if (preview_box)
            tin();
    }
}
