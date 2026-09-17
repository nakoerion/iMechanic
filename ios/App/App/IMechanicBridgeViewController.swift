import Capacitor
import UIKit

/**
 * The app's WebView controller — a thin subclass of Capacitor's own
 * `CAPBridgeViewController`, wired up in `Main.storyboard`.
 *
 * Its only job is **local plugin registration** (slice S7). Capacitor iOS
 * auto-registers the plugins that come from npm packages (they are listed in
 * the generated `capacitor.config.json`), but a plugin that lives inside the
 * app target like `IMechanicBlePlugin` has to be registered explicitly — the
 * bridge cannot discover it on its own. Without this, the web app's
 * `registerPlugin("iMechanicBle")` call has nothing to resolve against and the
 * scan screen correctly reports that the built-in Bluetooth bridge is not in
 * this build.
 *
 * `capacitorDidLoad()` runs immediately after the bridge is created, which is
 * the earliest point at which plugins can be registered.
 */
@objc(IMechanicBridgeViewController)
class IMechanicBridgeViewController: CAPBridgeViewController {

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(IMechanicBlePlugin())
    }
}
