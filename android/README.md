# FrameSeal · Android production plan (sketch)

> **Status: plan only.** This folder sketches how the web prototype maps onto the native Android build.
> The Kotlin files here are **stubs / pseudocode** to show module boundaries — they are not a finished or compiling app.

```
app/src/main/java/in/frameseal/
├── capture/CaptureActivity.kt   CameraX/Camera2 live preview + in-app frame grab. No gallery intent, no file picker.
├── gates/MotionGate.kt          SensorManager TYPE_STEP_DETECTOR + TYPE_LINEAR_ACCELERATION → steps, ~distance, still-variance
├── gates/GnssGate.kt            FusedLocationProvider + GnssMeasurementsEvent; Location.isMock(); GNSS-vs-IMU agreement
├── seal/Sealer.kt               SHA-256(frame bytes ‖ canonical packet) signed by an Android Keystore (StrongBox) key
├── seal/EditCheck.kt            dHash / pHash compare of an after-photo against the sealed frame (best-effort)
└── desk/DeskExport.kt           .frameseal.json export via share sheet / clipboard to the Office Kit desk — no cloud
```

## Decision order (same as the prototype)

1. **Capture** — frame must come from the live camera session started inside `CaptureActivity`.
2. **Body** — `MotionGate` needs ≥ 2 steps (~1.5 m) before capture; near-zero variance = "IMU still".
   `GnssGate` refuses if `isMock()` is true, or GNSS moves > 25 m while IMU is still, or GNSS is frozen while walking.
3. **Seal** — only if every gate passes. Hash + Keystore signature written on device.
4. **Edit check** — after-photo vs sealed frame: hash break / perceptual distance ⇒ `REFUSE · EDIT`.
5. **Desk** — reads the card, verifies hash + signature (public key), can accept a sealed card. It never holds the private key, so it cannot mint a seal or override a refusal.

## Roadmap

- Play Integrity verdict bundled into the packet.
- Screen-recapture defence: moiré / screen-pixel-grid detection and an autofocus-depth cue.
- Multi-suite job types (wages, deliveries) after the single ward-heap flow.
