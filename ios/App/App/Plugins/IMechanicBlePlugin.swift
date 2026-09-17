import Capacitor
import CoreBluetooth
import Foundation

/**
 * iMechanicBle — the app's own Bluetooth LE bridge to an ELM327 OBD2 adapter
 * (slice S7).
 *
 * Why this exists: **iOS Safari has no Web Bluetooth**. The web app can reach a
 * cheap ELM327 adapter from Android Chrome and from desktop Chrome/Edge (Web
 * Bluetooth / Web Serial), but not from a browser on iPhone. Inside this
 * Capacitor shell the adapter is reached through CoreBluetooth instead, over
 * the same JS contract the web drivers already speak (see
 * `src/native/ble-bridge.ts` — identical method names and payload keys in
 * Swift, Kotlin and TypeScript; change one, change all three).
 *
 * Transport shape, per the ELM327 BLE clones we target:
 *   scan    → CBCentralManager scan (no service filter: many clones do not
 *             advertise their service UUID, so the pick is made in JS where
 *             the naming heuristics live)
 *   connect → connect, discover services, choose the OBD data channel, then
 *             subscribe to the notify characteristic (RX)
 *   write   → send `AT…`/`03`/`0902`/`04` + CR on the write characteristic
 *             (TX) and resolve with everything the adapter sent back up to and
 *             including the ELM327 prompt (">"), or `complete: false` on
 *             timeout — a partial answer is never passed off as a reply.
 *
 * Honesty rules (mirrored in TS and Kotlin):
 *   - every failure rejects with a code, never a hang and never a fake success;
 *   - no BLE radio, Bluetooth off, denied permission, unknown device and a
 *     dropped link all get their own code;
 *   - nothing is invented when the adapter does not answer.
 *
 * Registration: this is a *local* plugin (it lives in the app target, not in
 * node_modules), so it is registered explicitly by
 * `IMechanicBridgeViewController.capacitorDidLoad()` — see that file.
 */
@objc(IMechanicBlePlugin)
public class IMechanicBlePlugin: CAPPlugin, CAPBridgedPlugin {

    // MARK: - Plugin identity (must match `registerPlugin("iMechanicBle")`)

    public let identifier = "IMechanicBlePlugin"
    public let jsName = "iMechanicBle"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise)
    ]

    // MARK: - Tunables (capacitor.config.ts → plugins.IMechanicBle)

    private var scanTimeoutMs: Int { getConfig().getInt("scanTimeoutMs", 12_000) }
    private var commandTimeoutMs: Int { getConfig().getInt("commandTimeoutMs", 8_000) }
    private var connectTimeoutMs: Int { getConfig().getInt("connectTimeoutMs", 15_000) }
    private var permissionTimeoutMs: Int { getConfig().getInt("permissionTimeoutMs", 20_000) }

    /**
     * Services a cheap ELM327 clone is likely to expose. Mirrors
     * `BLE_CANDIDATES` in `src/obd/elm327-live.ts` (there the web driver probes
     * FFE1/FFF1 by UUID; here the characteristics are chosen by their
     * properties, which survives more clone firmware variants).
     */
    private static let serviceCandidates: [CBUUID] = [
        CBUUID(string: "FFE0"),
        CBUUID(string: "FFF0"),
        CBUUID(string: "FF00"),
        CBUUID(string: "FFE5")
    ]

    /** The ELM327 prompt byte: a reply is only complete once we have seen it. */
    private static let prompt = ">"

    // MARK: - CoreBluetooth state

    private var central: CBCentralManager?
    private var peripheral: CBPeripheral?
    private var txCharacteristic: CBCharacteristic?
    private var rxCharacteristic: CBCharacteristic?

    /** Peripherals seen during this session, keyed by the id JS received. */
    private var discoveredPeripherals: [String: CBPeripheral] = [:]
    private var discoveredNames: [String: String] = [:]
    private var discoveredRssi: [String: Int] = [:]

    private var state: String = "disconnected"

    // In-flight operations (at most one of each — the JS driver is serial).
    private var scanCall: CAPPluginCall?
    private var scanTimer: DispatchWorkItem?
    private var permissionCall: CAPPluginCall?
    private var permissionTimer: DispatchWorkItem?
    private var connectCall: CAPPluginCall?
    private var connectTimer: DispatchWorkItem?
    private var writeCall: CAPPluginCall?
    private var writeTimer: DispatchWorkItem?
    private var writeBuffer: String = ""

    // MARK: - Small JSON helpers (explicit, so `null` is always a real null)

    private func json(_ value: String?) -> Any { value ?? NSNull() }
    private func json(_ value: Int?) -> Any { value ?? NSNull() }

    // MARK: - Permission

    /**
     * Normalised permission state. Creating the central manager is what makes
     * iOS show the Bluetooth prompt, so the manager is created here rather than
     * at launch, and we wait for the answer instead of reporting
     * "notDetermined" as if it were a decision.
     */
    @objc override func requestPermissions(_ call: CAPPluginCall) {
        ensureCentral()
        let decision = Self.permissionState()
        if decision != "prompt" {
            call.resolve(["bluetooth": decision])
            return
        }
        permissionCall = call
        let work = DispatchWorkItem { [weak self] in
            guard let self, let pending = self.permissionCall else { return }
            self.permissionCall = nil
            self.permissionTimer = nil
            // The prompt is still on screen: report it honestly rather than
            // guessing that the user said yes.
            pending.resolve(["bluetooth": Self.permissionState()])
        }
        permissionTimer = work
        DispatchQueue.main.asyncAfter(
            deadline: .now() + .milliseconds(max(1_000, permissionTimeoutMs)),
            execute: work
        )
    }

    static func permissionState() -> String {
        switch CBManager.authorization {
        case .allowedAlways:
            return "granted"
        case .denied, .restricted:
            return "denied"
        case .notDetermined:
            return "prompt"
        @unknown default:
            return "unsupported"
        }
    }

    private func ensureCentral() {
        if central == nil {
            // Main queue: plugin calls and delegate callbacks stay on one thread.
            central = CBCentralManager(delegate: self, queue: nil)
        }
    }

    // MARK: - Scan

    @objc func scan(_ call: CAPPluginCall) {
        ensureCentral()
        guard let central = central else {
            call.reject("Bluetooth is not available on this device.", "NOT_SUPPORTED")
            return
        }
        if central.state == .unsupported {
            call.reject("This device has no usable Bluetooth LE radio.", "NOT_SUPPORTED")
            return
        }
        if central.state != .poweredOn {
            call.reject("Bluetooth is switched off.", "NOT_SUPPORTED")
            return
        }
        if scanCall != nil {
            call.reject("A scan is already running.", "INVALID_ARGUMENT")
            return
        }
        discoveredPeripherals.removeAll()
        discoveredNames.removeAll()
        discoveredRssi.removeAll()
        setState("scanning")
        scanCall = call
        // No service filter: clones often omit the service UUID from the
        // advertisement, and the adapter is chosen in JS (`pickAdapterDevice`)
        // where the naming heuristics live.
        central.scanForPeripherals(withServices: nil, options: nil)
        let timeout = max(1_000, call.getInt("timeoutMs", scanTimeoutMs))
        let work = DispatchWorkItem { [weak self] in self?.finishScan() }
        scanTimer = work
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(timeout), execute: work)
    }

    private func finishScan() {
        central?.stopScan()
        scanTimer?.cancel()
        scanTimer = nil
        guard let call = scanCall else { return }
        scanCall = nil
        if state == "scanning" {
            setState(connectedPeripheralId() == nil ? "disconnected" : "connected")
        }
        call.resolve(["devices": deviceList()])
    }

    private func deviceList() -> [[String: Any]] {
        discoveredPeripherals.map { id, peripheral in
            [
                "deviceId": id,
                "name": json(discoveredNames[id] ?? peripheral.name),
                "rssi": json(discoveredRssi[id])
            ]
        }
    }

    // MARK: - Connect

    @objc func connect(_ call: CAPPluginCall) {
        guard let deviceId = call.getString("deviceId"), !deviceId.isEmpty else {
            call.reject("A deviceId is required.", "INVALID_ARGUMENT")
            return
        }
        ensureCentral()
        guard let central = central else {
            call.reject("Bluetooth is not available on this device.", "NOT_SUPPORTED")
            return
        }
        guard central.state == .poweredOn else {
            call.reject("Bluetooth is switched off.", "NOT_SUPPORTED")
            return
        }
        if connectCall != nil || writeCall != nil {
            call.reject("Another connection is already in progress.", "INVALID_ARGUMENT")
            return
        }
        guard let target = peripheral(for: deviceId) else {
            call.reject("That adapter is no longer in range. Scan again.", "NO_DEVICE")
            return
        }
        central.stopScan()
        scanTimer?.cancel()
        scanTimer = nil
        peripheral = target
        target.delegate = self
        connectCall = call
        setState("connecting", deviceId: deviceId)
        let work = DispatchWorkItem { [weak self] in
            self?.failConnect("The adapter did not answer the connection attempt.", "TIMEOUT")
        }
        connectTimer = work
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(connectTimeoutMs), execute: work)
        central.connect(target, options: nil)
    }

    /** Abort a connect attempt with an honest code, then clean up. */
    private func failConnect(_ message: String, _ code: String) {
        connectTimer?.cancel()
        connectTimer = nil
        if let target = peripheral {
            central?.cancelPeripheralConnection(target)
        }
        peripheral = nil
        txCharacteristic = nil
        rxCharacteristic = nil
        setState("disconnected")
        guard let call = connectCall else { return }
        connectCall = nil
        call.reject(message, code)
    }

    private func peripheral(for deviceId: String) -> CBPeripheral? {
        if let known = discoveredPeripherals[deviceId] { return known }
        if let uuid = UUID(uuidString: deviceId),
           let found = central?.retrievePeripherals(withIdentifiers: [uuid]).first {
            return found
        }
        return nil
    }

    private func connectedPeripheralId() -> String? {
        guard let peripheral = peripheral, peripheral.state == .connected else { return nil }
        return peripheral.identifier.uuidString
    }

    // MARK: - Write (one command → one reply)

    @objc func write(_ call: CAPPluginCall) {
        guard let command = call.getString("command"), !command.isEmpty else {
            call.reject("A command is required.", "INVALID_ARGUMENT")
            return
        }
        guard writeCall == nil else {
            call.reject("Another command is already in flight.", "INVALID_ARGUMENT")
            return
        }
        guard let peripheral = peripheral,
              peripheral.state == .connected,
              let tx = txCharacteristic else {
            call.reject("The adapter is not connected.", "NOT_CONNECTED")
            return
        }
        guard let data = "\(command)\r".data(using: .utf8) else {
            call.reject("That command could not be encoded.", "INVALID_ARGUMENT")
            return
        }
        writeCall = call
        writeBuffer = ""
        let timeout = max(200, call.getInt("timeoutMs", commandTimeoutMs))
        let work = DispatchWorkItem { [weak self] in
            guard let self, let pending = self.writeCall else { return }
            self.writeCall = nil
            self.writeTimer = nil
            // Partial text is reported as incomplete, never as a reply.
            pending.resolve(["response": self.writeBuffer, "complete": false])
        }
        writeTimer = work
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(timeout), execute: work)
        // Cheap clones accept writes without a response acknowledgement.
        let writeType: CBCharacteristicWriteType =
            tx.properties.contains(.writeWithoutResponse) ? .withoutResponse : .withResponse
        peripheral.writeValue(data, for: tx, type: writeType)
    }

    private func failWrite(_ message: String, _ code: String) {
        writeTimer?.cancel()
        writeTimer = nil
        guard let call = writeCall else { return }
        writeCall = nil
        call.reject(message, code)
    }

    // MARK: - Disconnect / status

    @objc func disconnect(_ call: CAPPluginCall) {
        central?.stopScan()
        if let target = peripheral {
            central?.cancelPeripheralConnection(target)
        }
        peripheral = nil
        txCharacteristic = nil
        rxCharacteristic = nil
        teardownPendingOperations()
        setState("disconnected")
        call.resolve()
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        call.resolve(statusPayload())
    }

    private func statusPayload() -> [String: Any] {
        let id = connectedPeripheralId()
        return [
            "state": state,
            "deviceId": json(id),
            "deviceName": json(id.flatMap { discoveredNames[$0] })
        ]
    }

    private func setState(_ next: String, deviceId: String? = nil) {
        state = next
        var payload = statusPayload()
        if let deviceId = deviceId { payload["deviceId"] = deviceId }
        notifyListeners("connectionStateChange", data: payload)
    }

    /** Resolve/reject anything still in flight, so no caller is left hanging. */
    private func teardownPendingOperations() {
        scanTimer?.cancel(); scanTimer = nil
        connectTimer?.cancel(); connectTimer = nil
        writeTimer?.cancel(); writeTimer = nil
        if let call = scanCall {
            scanCall = nil
            call.resolve(["devices": deviceList()])
        }
        if let call = connectCall {
            connectCall = nil
            call.reject("The connection was closed.", "DISCONNECTED")
        }
        if let call = writeCall {
            writeCall = nil
            call.reject("The adapter's Bluetooth link dropped.", "DISCONNECTED")
        }
        permissionTimer?.cancel()
        permissionTimer = nil
        if let call = permissionCall {
            permissionCall = nil
            call.resolve(["bluetooth": Self.permissionState()])
        }
    }
}

// MARK: - CBCentralManagerDelegate

extension IMechanicBlePlugin: CBCentralManagerDelegate {

    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if let call = permissionCall, CBManager.authorization != .notDetermined {
            permissionCall = nil
            permissionTimer?.cancel()
            permissionTimer = nil
            call.resolve(["bluetooth": Self.permissionState()])
        }
        switch central.state {
        case .poweredOn:
            break
        case .poweredOff, .unauthorized, .unsupported:
            if state == "connecting" {
                failConnect("Bluetooth became unavailable.", "DISCONNECTED")
            }
            if state == "scanning" {
                finishScan()
            }
            teardownPendingOperations()
            setState("disconnected")
        default:
            break
        }
    }

    public func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        let id = peripheral.identifier.uuidString
        discoveredPeripherals[id] = peripheral
        discoveredRssi[id] = RSSI.intValue
        if let advertised = advertisementData[CBAdvertisementDataLocalNameKey] as? String {
            discoveredNames[id] = advertised
        } else if let name = peripheral.name {
            discoveredNames[id] = name
        }
    }

    public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        connectTimer?.cancel()
        connectTimer = nil
        peripheral.delegate = self
        peripheral.discoverServices(nil)
    }

    public func centralManager(
        _ central: CBCentralManager,
        didFailToConnect peripheral: CBPeripheral,
        error: Error?
    ) {
        failConnect(
            error?.localizedDescription ?? "The adapter refused the connection.",
            "CONNECT_FAILED"
        )
    }

    public func centralManager(
        _ central: CBCentralManager,
        didDisconnectPeripheral peripheral: CBPeripheral,
        error: Error?
    ) {
        txCharacteristic = nil
        rxCharacteristic = nil
        if self.peripheral === peripheral { self.peripheral = nil }
        teardownPendingOperations()
        setState("disconnected")
    }
}

// MARK: - CBPeripheralDelegate

extension IMechanicBlePlugin: CBPeripheralDelegate {

    public func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error = error {
            failConnect(
                "Could not read the adapter's services: \(error.localizedDescription)",
                "CONNECT_FAILED"
            )
            return
        }
        let services = peripheral.services ?? []
        guard !services.isEmpty else {
            failConnect(
                "That device offers no Bluetooth services — it does not look like an OBD2 adapter.",
                "CONNECT_FAILED"
            )
            return
        }
        // Prefer the known ELM327 clone services, then try every other service
        // the adapter exposes (some clones use unusual UUIDs).
        let preferred = Self.serviceCandidates.compactMap { uuid in
            services.first { $0.uuid == uuid }
        }
        var ordered: [CBService] = preferred
        for service in services where !ordered.contains(where: { $0.uuid == service.uuid }) {
            ordered.append(service)
        }
        for service in ordered {
            peripheral.discoverCharacteristics(nil, for: service)
        }
    }

    public func peripheral(
        _ peripheral: CBPeripheral,
        didDiscoverCharacteristicsFor service: CBService,
        error: Error?
    ) {
        if let error = error {
            failConnect(
                "Could not read the adapter's data channel: \(error.localizedDescription)",
                "CONNECT_FAILED"
            )
            return
        }
        // Once a channel is chosen the later services are ignored — the
        // adapter's OBD channel is the first one we can actually talk on.
        guard connectCall != nil, txCharacteristic == nil, rxCharacteristic == nil else { return }
        let characteristics = service.characteristics ?? []
        let writable = characteristics.first {
            $0.properties.contains(.write) || $0.properties.contains(.writeWithoutResponse)
        }
        let notifying = characteristics.first {
            $0.properties.contains(.notify) || $0.properties.contains(.indicate)
        }
        // Some clones use one characteristic for both directions.
        guard let tx = writable ?? notifying, let rx = notifying ?? writable else { return }
        txCharacteristic = tx
        rxCharacteristic = rx
        central?.stopScan()
        connectTimer?.cancel()
        connectTimer = nil
        peripheral.setNotifyValue(true, for: rx)
        let id = peripheral.identifier.uuidString
        setState("connected", deviceId: id)
        guard let call = connectCall else { return }
        connectCall = nil
        call.resolve([
            "deviceId": id,
            "deviceName": json(discoveredNames[id] ?? peripheral.name),
            "serviceUuid": service.uuid.uuidString,
            "txCharacteristicUuid": tx.uuid.uuidString,
            "rxCharacteristicUuid": rx.uuid.uuidString
        ])
    }

    public func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        guard let rx = rxCharacteristic, characteristic.uuid == rx.uuid else { return }
        if let error = error {
            failWrite(
                "The adapter's link failed mid-read: \(error.localizedDescription)",
                "DISCONNECTED"
            )
            return
        }
        guard let data = characteristic.value else { return }
        writeBuffer += String(decoding: data, as: UTF8.self)
        guard writeBuffer.contains(Self.prompt) else { return }
        writeTimer?.cancel()
        writeTimer = nil
        guard let call = writeCall else { return }
        writeCall = nil
        call.resolve(["response": writeBuffer, "complete": true])
    }

    public func peripheral(
        _ peripheral: CBPeripheral,
        didWriteValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        if let error = error {
            failWrite("The adapter rejected the command: \(error.localizedDescription)", "CONNECT_FAILED")
        }
    }
}
