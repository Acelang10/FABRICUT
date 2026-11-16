# Fabricut laser cutter — website controls

The `/dashboard/app-controller` page drives the ESP32 firmware (**2x 28BYJ-48 + ULN2003** for X/Y, plus a **relay on GPIO26** that switches the cutting laser) over Web Serial protocol **v3 (F2 framing)**. The old Z pen stepper is gone; there are no Z moves.

## ⚠ Safety
- Wear laser safety goggles rated for your laser's wavelength (usually 445 nm, OD4+). Normal glasses do not protect.
- Fabric can catch fire: never leave a cut unattended, keep an extinguisher nearby, ventilate smoke.
- Keep a physical switch on the laser 12V supply within reach. Software STOP is not an E-stop.

## Use
1. Sign in with an **approved** owner/staff Google account.
2. Open **Controller**.
3. Connect USB (Chrome/Edge desktop), Arm, optionally jog X/Y and Set origin. Laser ON (M3) / Laser OFF (M5) buttons are provided; the relay only closes during G1 cutting moves.
4. Upload **SVG** (preferred) or PNG/JPG. Adjust size/offset/rotation/margin. Preview must fit **444.5 × 650 mm**.
5. Tick the goggles/supervision checkbox, then **Start laser cut**. Use Pause/STOP as needed.

G-code: `M5` before every `G0` travel and at the end, `M3` only before the `G1` cutting moves of each path.

## Limits
- Raster tracing is outline-only (threshold + marching squares), not production CAM.
- No laser kerf compensation and no laser power (PWM) control — the relay is on/off only.
- Relay switching delay (~10 ms) leaves small burn spots where paths start/stop.
- Soft limits are not calibrated travel; physical E-stop still required.
