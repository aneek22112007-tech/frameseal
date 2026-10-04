// FrameSeal — PRODUCTION PLAN SKETCH. Pseudocode / stubs only. Not a compiling or finished app.
package `in`.frameseal

data class SensorPacket(
    val steps: Int, val estDistanceM: Double, val accelVar: Double, val still: Boolean,
    val lat: Double?, val lon: Double?, val accuracyM: Float?, val isMock: Boolean,
    val gnssDisplacementM: Double?, val maxJumpM: Double?, val capturedAtMs: Long,
)

sealed class Verdict {
    data class Sealed(val sha256: String, val signature: ByteArray) : Verdict()
    data class Refused(val outcome: String, val failedCheck: String) : Verdict()
}

/** CaptureActivity: CameraX Preview + ImageCapture bound to the lifecycle. No ACTION_PICK / ACTION_GET_CONTENT anywhere. */
// class CaptureActivity : AppCompatActivity() { /* bindToLifecycle(preview, imageCapture); onShutter -> Sealer.decide(...) */ }

/** MotionGate: TYPE_STEP_DETECTOR events + Welford variance over TYPE_LINEAR_ACCELERATION magnitude. */
object MotionGate {
    fun passes(p: SensorPacket) = p.steps >= 2 && p.estDistanceM >= 1.4 && !p.still
}

/** GnssGate: FusedLocationProvider fixes + Location.isMock(); compare with IMU. */
object GnssGate {
    fun disagreement(p: SensorPacket): String? = when {
        p.isMock -> "mock location on"
        (p.maxJumpM ?: 0.0) > 25 && p.estDistanceM < 3 -> "GNSS jumped while IMU still"
        else -> null
    }
}

/** Sealer: sensors refuse first; only then hash + sign with a hardware-backed Keystore key. */
object Sealer {
    fun decide(frameJpeg: ByteArray, p: SensorPacket, liveSession: Boolean): Verdict {
        if (!liveSession) return Verdict.Refused("GALLERY", "GALLERY: no capture motion · file not from live camera")
        GnssGate.disagreement(p)?.let { return Verdict.Refused("SPOOF", "SPOOF: $it · signals disagree") }
        if (!MotionGate.passes(p)) return Verdict.Refused("MOTION", "MOTION: walk ~2 steps before sealing")
        val sha = sha256(frameJpeg + canonicalJson(p).toByteArray())
        return Verdict.Sealed(sha, keystoreSign(sha)) // KeyStore "AndroidKeyStore", setIsStrongBoxBacked(true)
    }
    private fun sha256(b: ByteArray): String = TODO("MessageDigest.getInstance(\"SHA-256\")")
    private fun canonicalJson(p: SensorPacket): String = TODO("sorted-key JSON, same as web prototype")
    private fun keystoreSign(sha: String): ByteArray = TODO("Signature SHA256withECDSA with Keystore private key")
}

/** DeskExport: write .frameseal.json and hand it to the Office Kit desk via share sheet / clipboard. No network. */
// object DeskExport { fun share(card: String) { /* Intent.ACTION_SEND, type application/json */ } }
