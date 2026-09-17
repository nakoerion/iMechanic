package app.imechanic

import android.os.Bundle
import app.imechanic.ble.IMechanicBlePlugin
import com.getcapacitor.BridgeActivity

/**
 * The Android shell's activity (slice S7).
 *
 * Its only addition to the Capacitor template is **local plugin registration**:
 * Capacitor auto-registers plugins installed from npm, but `IMechanicBlePlugin`
 * lives inside this app module, so the bridge has to be told about it before
 * `super.onCreate`. Without this, the web app's
 * `registerPlugin("iMechanicBle")` call has nothing to resolve against and the
 * scan screen correctly reports that the built-in Bluetooth bridge is not in
 * this build.
 *
 * (`registerPlugin` must run before `super.onCreate` — Capacitor's documented
 * order for local plugins, because the bridge is created during onCreate.)
 */
class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(IMechanicBlePlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
