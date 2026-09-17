package app.imechanic.ble

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONObject
import java.util.UUID

/**
 * iMechanicBle — the app's own Bluetooth LE bridge to an ELM327 OBD2 adapter
 * (slice S7).
 *
 * Android Chrome *can* reach a cheap ELM327 adapter through Web Bluetooth, so
 * this plugin is not the only way in on Android — but it is the transport the
 * app ships to the Play Store, and it gives Android the same first-class
 * adapter path iPhone needs (iOS Safari has no Web Bluetooth at all). Both
 * surfaces speak one contract: `src/native/ble-bridge.ts` — identical method
 * names and payload keys in Kotlin, Swift and TypeScript. Change one, change
 * all three.
 *
 * Connection shape, per the ELM327 BLE clones we target:
 *   scan    → BluetoothLeScanner, no filters (clones often omit their service
 *             UUID from the advertisement; the adapter is chosen in JS)
 *   connect → connectGatt → discoverServices → pick the OBD data channel →
 *             setCharacteristicNotification + write the CCCD so the notify
 *             characteristic (RX) actually delivers
 *   write   → send `AT…`/`03`/`0902`/`04` + CR on the write characteristic
 *             (TX) and resolve with everything the adapter sent back up to and
 *             including the ELM327 prompt (">"), or `complete: false` on
 *             timeout — a partial answer is never passed off as a reply.
 *
 * Honesty rules (mirrored in TS and Swift):
 *   - every failure rejects with a code, never a hang and never a fake success;
 *   - no radio, Bluetooth off, denied permission, unknown device and a dropped
 *     link all get their own code;
 *   - nothing is invented when the adapter does not answer.
 */
@CapacitorPlugin(
    name = "iMechanicBle",
    permissions = [
        Permission(strings = [Manifest.permission.BLUETOOTH_SCAN], alias = "bluetoothScan"),
        Permission(strings = [Manifest.permission.BLUETOOTH_CONNECT], alias = "bluetoothConnect"),
        Permission(strings = [Manifest.permission.ACCESS_FINE_LOCATION], alias = "location")
    ]
)
class IMechanicBlePlugin : Plugin() {

    companion object {
        /** Mirrors `BLE_CANDIDATES` in `src/obd/elm327-live.ts`. */
        private val SERVICE_CANDIDATES = listOf(
            uuid16("FFE0"),
            uuid16("FFF0"),
            uuid16("FF00"),
            uuid16("FFE5")
        )
        private const val CLIENT_CHARACTERISTIC_CONFIG = "00002902-0000-1000-8000-00805f9b34fb"
        /** The ELM327 prompt byte: a reply is complete only once we have seen it. */
        private const val PROMPT = ">"
        private fun uuid16(short: String) = UUID.fromString("0000$short-0000-1000-8000-00805f9b34fb")
    }

    private val handler = Handler(Looper.getMainLooper())

    // Tunables — capacitor.config.ts → plugins.IMechanicBle
    private val scanTimeoutMs: Long get() = getConfig().getInt("scanTimeoutMs", 12_000).toLong()
    private val commandTimeoutMs: Long get() = getConfig().getInt("commandTimeoutMs", 8_000).toLong()
    private val connectTimeoutMs: Long get() = getConfig().getInt("connectTimeoutMs", 15_000).toLong()

    private var gatt: BluetoothGatt? = null
    private var txCharacteristic: BluetoothGattCharacteristic? = null
    private var rxCharacteristic: BluetoothGattCharacteristic? = null

    private val discovered = LinkedHashMap<String, ScanResult>()
    private var state = "disconnected"

    // In-flight operations (at most one of each — the JS driver is serial).
    private var scanCall: PluginCall? = null
    private var connectCall: PluginCall? = null
    private var writeCall: PluginCall? = null
    private val writeBuffer = StringBuilder()

    private val scanTimeout = Runnable { finishScan() }
    private val connectTimeout = Runnable {
        failConnect("The adapter did not answer the connection attempt.", "TIMEOUT")
    }
    private val writeTimeout = Runnable {
        val call = writeCall ?: return@Runnable
        writeCall = null
        // Partial text is reported as incomplete, never as a reply.
        call.resolve(JSObject().put("response", writeBuffer.toString()).put("complete", false))
    }

    // MARK: - Permissions

    @PluginMethod
    override fun requestPermissions(call: PluginCall) {
        if (bluetoothAdapter() == null) {
            call.resolve(JSObject().put("bluetooth", "unsupported"))
            return
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            requestPermissionForAliases(
                arrayOf("bluetoothScan", "bluetoothConnect"),
                call,
                "permissionsCallback"
            )
        } else {
            // Android 11 and below require location permission to scan for
            // BLE devices at all.
            requestPermissionForAlias("location", call, "permissionsCallback")
        }
    }

    @PermissionCallback
    private fun permissionsCallback(call: PluginCall) {
        call.resolve(JSObject().put("bluetooth", permissionState()))
    }

    /**
     * Normalised permission state. `prompt` means the OS is still asking (or
     * will ask) — it is never reported as a decision the user has made.
     */
    private fun permissionState(): String {
        if (bluetoothAdapter() == null) return "unsupported"
        val aliases = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            arrayOf("bluetoothScan", "bluetoothConnect")
        } else {
            arrayOf("location")
        }
        var state = "granted"
        for (alias in aliases) {
            when (getPermissionState(alias)) {
                PermissionState.DENIED -> return "denied"
                PermissionState.PROMPT, PermissionState.PROMPT_WITH_RATIONALE -> state = "prompt"
                else -> {}
            }
        }
        return state
    }

    private fun hasScanPermission(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            getPermissionState("bluetoothScan") == PermissionState.GRANTED &&
                getPermissionState("bluetoothConnect") == PermissionState.GRANTED
        } else {
            getPermissionState("location") == PermissionState.GRANTED
        }

    private fun bluetoothAdapter(): BluetoothAdapter? {
        val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        return manager?.adapter
    }

    // MARK: - Scan

    @SuppressLint("MissingPermission")
    @PluginMethod
    fun scan(call: PluginCall) {
        val adapter = bluetoothAdapter()
        if (adapter == null) {
            call.reject("This device has no usable Bluetooth LE radio.", "NOT_SUPPORTED")
            return
        }
        if (!adapter.isEnabled) {
            call.reject("Bluetooth is switched off.", "NOT_SUPPORTED")
            return
        }
        if (!hasScanPermission()) {
            call.reject("iMechanic is not allowed to use Bluetooth.", "PERMISSION_DENIED")
            return
        }
        if (scanCall != null) {
            call.reject("A scan is already running.", "INVALID_ARGUMENT")
            return
        }
        val scanner = adapter.bluetoothLeScanner
        if (scanner == null) {
            call.reject("Bluetooth scanning is unavailable in this state.", "NOT_SUPPORTED")
            return
        }
        discovered.clear()
        setState("scanning")
        scanCall = call
        adapter.bluetoothLeScanner.startScan(
            null,
            ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(),
            scanCallback
        )
        handler.postDelayed(
            scanTimeout,
            maxOf(1_000L, call.getInt("timeoutMs", scanTimeoutMs.toInt()).toLong())
        )
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            handler.post { discovered[result.device.address] = result }
        }

        override fun onScanFailed(errorCode: Int) {
            handler.post {
                handler.removeCallbacks(scanTimeout)
                val call = scanCall ?: return@post
                scanCall = null
                setState(if (gatt != null) "connected" else "disconnected")
                call.reject("Bluetooth scanning failed (code $errorCode).", "NOT_SUPPORTED")
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun finishScan() {
        handler.removeCallbacks(scanTimeout)
        try {
            bluetoothAdapter()?.bluetoothLeScanner?.stopScan(scanCallback)
        } catch (_: SecurityException) {
            // Permission revoked mid-scan — the reject path below still answers.
        }
        val call = scanCall ?: return
        scanCall = null
        if (state == "scanning") setState(if (gatt != null) "connected" else "disconnected")
        val devices = JSArray()
        for ((address, result) in discovered) {
            val device = JSObject()
            device.put("deviceId", address)
            device.put("name", result.device.name ?: result.scanRecord?.deviceName ?: JSONObject.NULL)
            device.put("rssi", result.rssi)
            devices.put(device)
        }
        call.resolve(JSObject().put("devices", devices))
    }

    // MARK: - Connect

    @SuppressLint("MissingPermission")
    @PluginMethod
    fun connect(call: PluginCall) {
        val deviceId = call.getString("deviceId")
        if (deviceId.isNullOrEmpty()) {
            call.reject("A deviceId is required.", "INVALID_ARGUMENT")
            return
        }
        val adapter = bluetoothAdapter()
        if (adapter == null) {
            call.reject("This device has no usable Bluetooth LE radio.", "NOT_SUPPORTED")
            return
        }
        if (!adapter.isEnabled) {
            call.reject("Bluetooth is switched off.", "NOT_SUPPORTED")
            return
        }
        if (!hasScanPermission()) {
            call.reject("iMechanic is not allowed to use Bluetooth.", "PERMISSION_DENIED")
            return
        }
        if (connectCall != null || writeCall != null) {
            call.reject("Another connection is already in progress.", "INVALID_ARGUMENT")
            return
        }
        finishScan()
        val device: BluetoothDevice = discovered[deviceId]?.device
            ?: try {
                adapter.getRemoteDevice(deviceId)
            } catch (_: IllegalArgumentException) {
                call.reject("That adapter is no longer in range. Scan again.", "NO_DEVICE")
                return
            }
        connectCall = call
        setState("connecting", deviceId)
        gatt = device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
        if (gatt == null) {
            failConnect("Could not open the adapter's Bluetooth link.", "CONNECT_FAILED")
            return
        }
        handler.postDelayed(connectTimeout, connectTimeoutMs)
    }

    /** Abort a connect attempt with an honest code, then clean up. */
    private fun failConnect(message: String, code: String) {
        handler.removeCallbacks(connectTimeout)
        closeGatt()
        setState("disconnected")
        val call = connectCall ?: return
        connectCall = null
        call.reject(message, code)
    }

    private fun failWrite(message: String, code: String) {
        handler.removeCallbacks(writeTimeout)
        val call = writeCall ?: return
        writeCall = null
        call.reject(message, code)
    }

    @SuppressLint("MissingPermission")
    private fun closeGatt() {
        txCharacteristic = null
        rxCharacteristic = null
        try {
            gatt?.disconnect()
            gatt?.close()
        } catch (_: SecurityException) {
            // Losing the link while cleaning up is not an error worth raising.
        }
        gatt = null
    }

    private val gattCallback = object : BluetoothGattCallback() {

        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            handler.post {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    gatt.discoverServices()
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    val hadPendingWrite = writeCall != null
                    handler.removeCallbacks(connectTimeout)
                    closeGatt()
                    setState("disconnected")
                    connectCall?.let {
                        connectCall = null
                        it.reject("The connection was closed.", "DISCONNECTED")
                    }
                    if (hadPendingWrite) {
                        failWrite("The adapter's Bluetooth link dropped.", "DISCONNECTED")
                    }
                }
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            handler.post {
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    failConnect("Could not read the adapter's services (status $status).", "CONNECT_FAILED")
                    return@post
                }
                val services = gatt.services
                if (services.isNullOrEmpty()) {
                    failConnect(
                        "That device offers no Bluetooth services — it does not look like an OBD2 adapter.",
                        "CONNECT_FAILED"
                    )
                    return@post
                }
                // Prefer the known ELM327 clone services, then try the rest.
                val ordered = services.sortedByDescending { SERVICE_CANDIDATES.contains(it.uuid) }
                for (service in ordered) {
                    // Cheap clones rarely expose the OBD data characteristic in
                    // the first service; look in each until one has both
                    // directions available.
                    val writable = service.characteristics.firstOrNull {
                        it.properties and (BluetoothGattCharacteristic.PROPERTY_WRITE or
                            BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0
                    }
                    val notifying = service.characteristics.firstOrNull {
                        it.properties and (BluetoothGattCharacteristic.PROPERTY_NOTIFY or
                            BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0
                    }
                    val tx = writable ?: notifying ?: continue
                    val rx = notifying ?: writable ?: continue
                    subscribeToChannel(gatt, service.uuid, tx, rx)
                    return@post
                }
                failConnect(
                    "Connected over Bluetooth, but found no OBD data channel on the adapter.",
                    "CONNECT_FAILED"
                )
            }
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic
        ) {
            val value = characteristic.value ?: return
            handler.post { consume(characteristic, value) }
        }

        override fun onCharacteristicWrite(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int
        ) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                handler.post {
                    failWrite("The adapter rejected the command (status $status).", "CONNECT_FAILED")
                }
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun subscribeToChannel(
        gatt: BluetoothGatt,
        serviceUuid: UUID,
        tx: BluetoothGattCharacteristic,
        rx: BluetoothGattCharacteristic
    ) {
        txCharacteristic = tx
        rxCharacteristic = rx
        if (!gatt.setCharacteristicNotification(rx, true)) {
            failConnect("The adapter refused to stream its replies.", "CONNECT_FAILED")
            return
        }
        // Android only delivers notifications once the CCCD descriptor is
        // written — setCharacteristicNotification alone is not enough.
        val descriptor = rx.getDescriptor(UUID.fromString(CLIENT_CHARACTERISTIC_CONFIG))
        if (descriptor != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                gatt.writeDescriptor(descriptor, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
            } else {
                @Suppress("DEPRECATION")
                descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                @Suppress("DEPRECATION")
                gatt.writeDescriptor(descriptor)
            }
        }
        handler.removeCallbacks(connectTimeout)
        val device = gatt.device
        setState("connected", device.address)
        val call = connectCall ?: return
        connectCall = null
        call.resolve(
            JSObject()
                .put("deviceId", device.address)
                .put("deviceName", device.name ?: JSONObject.NULL)
                .put("serviceUuid", serviceUuid.toString())
                .put("txCharacteristicUuid", tx.uuid.toString())
                .put("rxCharacteristicUuid", rx.uuid.toString())
        )
    }

    // MARK: - Write (one command → one reply)

    @SuppressLint("MissingPermission")
    @PluginMethod
    fun write(call: PluginCall) {
        val command = call.getString("command")
        if (command.isNullOrEmpty()) {
            call.reject("A command is required.", "INVALID_ARGUMENT")
            return
        }
        if (writeCall != null) {
            call.reject("Another command is already in flight.", "INVALID_ARGUMENT")
            return
        }
        val activeGatt = gatt
        val tx = txCharacteristic
        if (activeGatt == null || tx == null || rxCharacteristic == null) {
            call.reject("The adapter is not connected.", "NOT_CONNECTED")
            return
        }
        if (!hasScanPermission()) {
            call.reject("iMechanic is not allowed to use Bluetooth.", "PERMISSION_DENIED")
            return
        }
        val payload = "$command\r".toByteArray(Charsets.UTF_8)
        val writeType = if (tx.properties and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0) {
            BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
        } else {
            BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
        }
        writeCall = call
        writeBuffer.setLength(0)
        handler.postDelayed(
            writeTimeout,
            maxOf(200L, call.getInt("timeoutMs", commandTimeoutMs.toInt()).toLong())
        )
        val accepted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            activeGatt.writeCharacteristic(tx, payload, writeType) == BluetoothGatt.GATT_SUCCESS
        } else {
            @Suppress("DEPRECATION")
            tx.writeType = writeType
            @Suppress("DEPRECATION")
            tx.value = payload
            @Suppress("DEPRECATION")
            activeGatt.writeCharacteristic(tx)
        }
        if (!accepted) {
            failWrite("The adapter did not accept the command.", "CONNECT_FAILED")
        }
    }

    private fun consume(characteristic: BluetoothGattCharacteristic, value: ByteArray) {
        if (rxCharacteristic?.uuid != characteristic.uuid) return
        writeBuffer.append(String(value, Charsets.UTF_8))
        if (!writeBuffer.contains(PROMPT)) return
        handler.removeCallbacks(writeTimeout)
        val call = writeCall ?: return
        writeCall = null
        call.resolve(JSObject().put("response", writeBuffer.toString()).put("complete", true))
    }

    // MARK: - Disconnect / status

    @PluginMethod
    fun disconnect(call: PluginCall) {
        handler.removeCallbacks(scanTimeout)
        handler.removeCallbacks(connectTimeout)
        handler.removeCallbacks(writeTimeout)
        finishScan()
        connectCall?.let {
            connectCall = null
            it.reject("The connection was closed.", "DISCONNECTED")
        }
        writeCall?.let {
            writeCall = null
            it.reject("The adapter's Bluetooth link dropped.", "DISCONNECTED")
        }
        closeGatt()
        setState("disconnected")
        call.resolve()
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        call.resolve(statusPayload())
    }

    private fun statusPayload(): JSObject {
        val device = gatt?.device
        return JSObject()
            .put("state", state)
            .put("deviceId", device?.address ?: JSONObject.NULL)
            .put("deviceName", device?.name ?: JSONObject.NULL)
    }

    private fun setState(next: String, deviceId: String? = null) {
        state = next
        val payload = statusPayload()
        if (deviceId != null) payload.put("deviceId", deviceId)
        notifyListeners("connectionStateChange", payload)
    }

    override fun handleOnDestroy() {
        handler.removeCallbacksAndMessages(null)
        closeGatt()
        super.handleOnDestroy()
    }
}
