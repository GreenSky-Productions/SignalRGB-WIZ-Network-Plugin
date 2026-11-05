import udp from "@SignalRGB/udp";

export function Name() { return "WIZ Interface"; }
export function Version() { return "1.2.3"; }
export function VendorId() { return 0x0; }
export function ProductId() { return 0x0; }
export function Type() { return "network"; }
export function Publisher() { return "GreenSky Productions"; }
export function Size() { return [1, 1]; }
export function DefaultPosition() { return [75, 70]; }
export function DefaultScale() { return 10.0; }

// Logo hosted in this repository. Used for the device image and for the
// icon of the service tile on SignalRGB's Third Party Services page.
const WIZ_LOGO_URL =
    "https://raw.githubusercontent.com/DukeShank/SignalRGB-WIZ-Network-Plugin/main/images/wiz-logo.png";

// Image shown in the SignalRGB UI on the device page and in the device list.
// Requirements: 1024x1024 transparent PNG, artwork inside the central
// 920x920 area, reachable at a public URL. Without this export SignalRGB
// shows a generic placeholder.
export function ImageUrl() {
    return WIZ_LOGO_URL;
}

/* global
controller:readonly, service:readonly, device:readonly,
AutoStartStream:readonly, MaxUpdatesPerSecond:readonly, forcedColor:readonly, forceColor:readonly,
dimmColor:readonly, minBrightniss:readonly,
TurnOffOnShutdown:readonly, variableLedCount:readonly
*/

export function ControllableParameters() {
    return [
        {
            property: "AutoStartStream",
            group: "settings",
            label: "Automatically Start Stream",
            type: "boolean",
            default: "false"
        },
        {
            property: "MaxUpdatesPerSecond",
            group: "settings",
            label: "Max Updates Per Second",
            min: "1",
            max: "30",
            type: "number",
            default: "10"
        },
        {
            property: "forcedColor",
            group: "lighting",
            label: "Forced Color",
            min: "0",
            max: "255",
            type: "color",
            default: "#009bde"
        },
        {
            property: "minBrightniss",
            group: "lighting",
            label: "Minimal Brightniss",
            min: "10",
            max: "100",
            type: "hue",
            default: "10"
        },
        {
            property: "dimmColor",
            group: "lighting",
            label: "Default Color when dimmed",
            min: "0",
            max: "255",
            type: "color",
            default: "#010101"
        },
        {
            property: "forceColor",
            group: "settings",
            label: "Force Color",
            type: "boolean",
            default: "false"
        }
    ];
}

export function DefaultComponentBrand() {
    return "WIZ";
}

export function SubdeviceController() {
    return false;
}

export function onvariableLedCountChanged() {}

// Called by SignalRGB when the Max Updates Per Second setting changes.
// The log line shows that the value arrived and what interval it produces.
export function onMaxUpdatesPerSecondChanged() {
    const interval = wizGetSendIntervalMs();

    device.log(
        "[WIZ] Max updates per second set to " +
        String(MaxUpdatesPerSecond) +
        (interval === 0
            ? " (update on every frame)."
            : " (minimum " + interval + " ms between updates).")
    );
}


// ============================================================
// CONFIGURATION
// ============================================================

// WiZ local UDP protocol endpoints.
// No individual device address is embedded in the plugin: device IP
// addresses are learned from discovery responses and refreshed on
// every scan, so a DHCP address change is followed automatically.
const WIZ_BROADCAST_ADDRESS = "255.255.255.255";
const WIZ_DEVICE_PORT = 38899;
const WIZ_DISCOVERY_LOCAL_PORT = 38900;

// Deterministic local control port per device component. If the preferred
// port cannot be bound, the next ports in the range are tried.
const WIZ_CONTROL_LOCAL_PORT_BASE = 39000;
const WIZ_CONTROL_LOCAL_PORT_RANGE = 10000;
const WIZ_BIND_ATTEMPTS = 10;

// Discovery schedule:
//  - a burst of scans at startup, so one lost broadcast packet does not
//    delay discovery by a full minute;
//  - a medium interval while no device has been found;
//  - a long interval once at least one device is known (used to detect
//    IP changes and to confirm that devices are still reachable).
const WIZ_DISCOVERY_BURST_COUNT = 5;
const WIZ_DISCOVERY_BURST_INTERVAL_MS = 5000;
const WIZ_DISCOVERY_SEARCH_INTERVAL_MS = 15000;
const WIZ_DISCOVERY_IDLE_INTERVAL_MS = 60000;
const WIZ_PENDING_TIMEOUT_MS = 10000;
const WIZ_STALE_AFTER_MS = 180000;

// Streaming configuration.
// The send rate is a user setting (MaxUpdatesPerSecond) and can be changed
// while streaming. SignalRGB calls Render() about 30 times per second, so
// values above 30 have no effect, and the effective rate is a multiple of
// the frame period (about 30, 15, 10, 7.5, 6 updates per second).
const WIZ_DEFAULT_MAX_UPDATES_PER_SECOND = 10;
const WIZ_MAX_UPDATES_PER_SECOND = 30;
// Frames arrive about every 32 ms with some jitter. Without a tolerance, a
// frame arriving at 99 ms would be skipped for a 100 ms interval, and the
// next one sent at about 130 ms, lowering the real rate by a quarter.
const WIZ_SEND_INTERVAL_TOLERANCE_MS = 10;
// UDP has no delivery guarantee. An unchanged frame is re-sent at this
// interval so a single lost packet does not leave the bulb on a stale colour.
const WIZ_REFRESH_INTERVAL_MS = 2000;
const WIZ_COMMAND_SPEED = 100;
// WiZ dimming range is 10-100.
const WIZ_MIN_DIMMING = 10;
// Consecutive failed writes before the control socket is re-created.
const WIZ_MAX_SEND_FAILURES = 20;

// Fixed request payloads, built once instead of on every scan.
// The registration fields are protocol placeholders, not host/device
// identifiers.
const WIZ_REGISTRATION_REQUEST = JSON.stringify({
    method: "registration",
    params: {
        phoneMac: "AAAAAAAAAAAA",
        register: false,
        phoneIp: "1.2.3.4",
        id: "1"
    }
});

const WIZ_SYSTEM_CONFIG_REQUEST = JSON.stringify({
    method: "getSystemConfig",
    id: 1
});


// ============================================================
// SOCKET AND FRAME STATE
// ============================================================

let wizDiscoverySocket = null;
let wizPendingDevices = {};
let wizScanResponders = {};
let lastBroadcast = 0;
let wizScanCount = 0;
let wizUnicastErrorLogged = false;

let wizControlSocket = null;
let wizControlMac = "";
let wizLastSentFrame = null;
let wizLastSendTime = 0;
let wizSendFailures = 0;
let wizControlAckLogged = false;
let wizControlErrorLogged = false;
let wizRenderStartLogged = false;

// Parsed colour arrays for the Forced Color and dimmed-colour settings,
// keyed by the setting's string value. Re-parsed only when it changes.
let wizColorCache = {
    forced: { key: null, value: null },
    dimmed: { key: null, value: null }
};


// ============================================================
// VALIDATION AND FRAME HELPERS
// ============================================================

function wizIsEnabled(value) {
    return value === true || value === "true" || value === 1;
}

function wizClamp(value, min, max) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return min;
    }

    return Math.min(max, Math.max(min, Math.round(number)));
}

// Minimum time between sent frames, derived from the MaxUpdatesPerSecond
// setting. Read on every Render() call so a change applies immediately.
// The top of the range means "every frame", with no limit.
function wizGetSendIntervalMs() {
    const rate = typeof MaxUpdatesPerSecond === "undefined"
        ? WIZ_DEFAULT_MAX_UPDATES_PER_SECOND
        : Number(MaxUpdatesPerSecond);

    if (!Number.isFinite(rate)) {
        return Math.round(1000 / WIZ_DEFAULT_MAX_UPDATES_PER_SECOND);
    }

    const clamped = Math.min(
        WIZ_MAX_UPDATES_PER_SECOND,
        Math.max(1, rate)
    );

    if (clamped >= WIZ_MAX_UPDATES_PER_SECOND) {
        return 0;
    }

    return Math.round(1000 / clamped);
}

function wizValueOrZero(value) {
    return value === undefined || value === null ? 0 : value;
}

function wizIsValidMacAddress(value) {
    return typeof value === "string" &&
        /^[0-9a-f]{12}$/i.test(value);
}

function wizIsValidIPv4Address(value) {
    if (typeof value !== "string") {
        return false;
    }

    const parts = value.split(".");

    if (parts.length !== 4) {
        return false;
    }

    return parts.every((part) => {
        if (!/^\d{1,3}$/.test(part)) {
            return false;
        }

        const number = Number(part);

        return number >= 0 && number <= 255;
    });
}

// A device address must be a unicast address: not 0.x.x.x, loopback,
// multicast, reserved, or the limited broadcast address.
function wizIsUsableDeviceAddress(value) {
    if (!wizIsValidIPv4Address(value)) {
        return false;
    }

    const first = Number(value.split(".")[0]);

    return first !== 0 && first !== 127 && first < 224;
}

function wizGetControlLocalPort(mac, attempt) {
    // Derive a stable local port from each discovered MAC.
    // This avoids every device component requesting the same port.
    let hash = 0;

    for (let i = 0; i < mac.length; i++) {
        hash = (hash * 31 + mac.charCodeAt(i)) % WIZ_CONTROL_LOCAL_PORT_RANGE;
    }

    return WIZ_CONTROL_LOCAL_PORT_BASE +
        ((hash + attempt) % WIZ_CONTROL_LOCAL_PORT_RANGE);
}

// Tries up to WIZ_BIND_ATTEMPTS ports. portForAttempt(n) returns the port
// to try on attempt n. Returns the bound port, or throws the last error.
function wizBindSocket(socket, portForAttempt) {
    let lastError = null;

    for (let attempt = 0; attempt < WIZ_BIND_ATTEMPTS; attempt++) {
        const port = portForAttempt(attempt);

        try {
            socket.bind(port);
            return port;
        } catch (err) {
            lastError = err;
        }
    }

    throw lastError || new Error("No local UDP port could be bound");
}

function wizHasSocketMethods(socket) {
    return !!socket &&
        typeof socket.on === "function" &&
        typeof socket.bind === "function" &&
        typeof socket.write === "function" &&
        typeof socket.close === "function";
}

function wizMakeFrame(color, dimming) {
    if (!Array.isArray(color) || color.length < 3) {
        return null;
    }

    return {
        r: wizClamp(color[0], 0, 255),
        g: wizClamp(color[1], 0, 255),
        b: wizClamp(color[2], 0, 255),
        dimming: wizClamp(dimming, WIZ_MIN_DIMMING, 100),
        speed: WIZ_COMMAND_SPEED
    };
}

function wizFramesEqual(a, b) {
    return !!a && !!b &&
        a.r === b.r &&
        a.g === b.g &&
        a.b === b.b &&
        a.dimming === b.dimming &&
        a.speed === b.speed;
}

function wizResetColorCache() {
    wizColorCache = {
        forced: { key: null, value: null },
        dimmed: { key: null, value: null }
    };
}

// Returns device.createColorArray(setting, 1, "Inline"), parsing the
// setting only when its value differs from the cached one. A result that
// is not a valid colour array is not cached.
function wizGetCachedColor(slot, setting) {
    const key = String(setting);
    const entry = wizColorCache[slot];

    if (entry.key !== key || !entry.value) {
        entry.value = device.createColorArray(setting, 1, "Inline");
        entry.key = key;
    }

    return entry.value;
}

function wizGetCurrentFrame() {
    const color = wizIsEnabled(forceColor)
        ? wizGetCachedColor("forced", forcedColor)
        : device.color(0, 0);

    if (!Array.isArray(color) || color.length < 3) {
        return null;
    }

    const r = wizClamp(color[0], 0, 255);
    const g = wizClamp(color[1], 0, 255);
    const b = wizClamp(color[2], 0, 255);

    // Preserve the original plugin's black-pixel behaviour.
    if (r === 0 && g === 0 && b === 0) {
        return wizMakeFrame(
            wizGetCachedColor("dimmed", dimmColor),
            wizClamp(minBrightniss, WIZ_MIN_DIMMING, 100)
        );
    }

    return wizMakeFrame(
        [r, g, b],
        wizClamp(device.Brightness, WIZ_MIN_DIMMING, 100)
    );
}


// ============================================================
// CONTROL SOCKET
// ============================================================

function wizCloseControlSocket() {
    if (!wizControlSocket) {
        return;
    }

    try {
        wizControlSocket.close();
    } catch (err) {
        device.log(
            "[WIZ] Control socket close warning: " + String(err)
        );
    }

    wizControlSocket = null;
}

function wizOpenControlSocket(mac) {
    wizCloseControlSocket();

    wizControlMac = mac;
    wizLastSentFrame = null;
    wizLastSendTime = 0;
    wizSendFailures = 0;
    wizControlAckLogged = false;
    wizControlErrorLogged = false;

    try {
        if (!udp || typeof udp.createSocket !== "function") {
            throw new Error(
                "UDP createSocket() unavailable in device component context"
            );
        }

        wizControlSocket = udp.createSocket();

        if (!wizHasSocketMethods(wizControlSocket)) {
            throw new Error(
                "Required device-control UDP socket methods unavailable"
            );
        }

        wizControlSocket.on("message", (message) => {
            // The only use of a reply is the one-time acknowledgement log
            // below, so skip all parsing once that has happened.
            if (wizControlAckLogged) {
                return;
            }

            // The controller endpoint is read on every packet, so a
            // changed device address is followed without re-binding.
            if (
                !message ||
                typeof message !== "object" ||
                message.address !== controller.ip ||
                Number(message.port) !== Number(controller.port)
            ) {
                return;
            }

            const raw = message.data;

            if (
                typeof raw !== "string" ||
                raw.length === 0 ||
                raw.length > 1024
            ) {
                return;
            }

            let response;

            try {
                response = JSON.parse(raw);
            } catch (err) {
                return;
            }

            if (
                response &&
                response.method === "setPilot" &&
                response.result &&
                response.result.success === true &&
                !wizControlAckLogged
            ) {
                device.log(
                    "[WIZ] Device acknowledged live setPilot updates."
                );
                wizControlAckLogged = true;
            }
        });

        wizControlSocket.on("error", (err) => {
            device.log(
                "[WIZ] Control UDP socket error: " + String(err)
            );
        });

        const boundPort = wizBindSocket(
            wizControlSocket,
            (attempt) => wizGetControlLocalPort(mac, attempt)
        );

        device.log(
            "[WIZ] Bound device control socket to local port " + boundPort
        );

        return true;

    } catch (err) {
        device.log(
            "[WIZ] Control socket initialization failed: " + String(err)
        );

        wizCloseControlSocket();

        return false;
    }
}

function wizSendFrame(frame) {
    if (!wizControlSocket) {
        if (!wizControlErrorLogged) {
            device.log(
                "[WIZ] Cannot send frame: control socket is unavailable."
            );
            wizControlErrorLogged = true;
        }

        return false;
    }

    // Re-validate the endpoint on every send; the discovery service may
    // have replaced it since the component was initialized.
    if (
        !wizIsUsableDeviceAddress(controller.ip) ||
        Number(controller.port) !== WIZ_DEVICE_PORT
    ) {
        if (!wizControlErrorLogged) {
            device.log(
                "[WIZ] Cannot send frame: controller endpoint is invalid."
            );
            wizControlErrorLogged = true;
        }

        return false;
    }

    const packet = JSON.stringify({
        method: "setPilot",
        params: {
            r: frame.r,
            g: frame.g,
            b: frame.b,
            dimming: frame.dimming,
            speed: frame.speed
        }
    });

    try {
        wizControlSocket.write(
            packet,
            controller.ip,
            Number(controller.port)
        );

        // Frames are created fresh by wizMakeFrame() and are never modified
        // after sending, so the object can be kept without copying.
        wizLastSentFrame = frame;

        wizLastSendTime = Date.now();
        wizControlErrorLogged = false;
        wizSendFailures = 0;

        return true;

    } catch (err) {
        if (!wizControlErrorLogged) {
            device.log(
                "[WIZ] setPilot transmission failed: " + String(err)
            );
            wizControlErrorLogged = true;
        }

        wizSendFailures++;

        if (wizSendFailures >= WIZ_MAX_SEND_FAILURES) {
            device.log(
                "[WIZ] Repeated send failures; re-creating control socket."
            );
            wizOpenControlSocket(wizControlMac);
        }

        return false;
    }
}


// ============================================================
// DEVICE COMPONENT
// ============================================================

export function Initialize() {
    device.addFeature("udp");
    wizResetColorCache();

    const componentName = controller.wiztype
        ? controller.wiztype.productName
        : `WIZ ${controller.modelName}`;

    device.setName(
        `${componentName} Room: ${controller.roomId}`
    );

    device.addProperty({
        property: "variableLedCount",
        label: "Leds",
        type: "number",
        min: 1,
        max: 1,
        default: 1
    });

    // isTW is stored on the controller object, not on the device object.
    if (controller.isTW) {
        device.removeProperty("forcedColor");
        device.removeProperty("forceColor");
    }

    device.setSize(1, 1);
    device.setControllableLeds(
        ["LED 1"],
        [[0, 0]]
    );

    device.log("[WIZ] Controller component initialized.");
    device.log(
        "[WIZ] Model: " + String(controller.modelName || "unknown")
    );

    const mac = String(
        controller.mac || controller.id || ""
    ).toLowerCase();

    if (!wizIsValidMacAddress(mac)) {
        device.log(
            "[WIZ] Control socket refused: invalid controller identity."
        );
        return;
    }

    if (
        !wizIsUsableDeviceAddress(controller.ip) ||
        !Number.isFinite(Number(controller.port)) ||
        Number(controller.port) !== WIZ_DEVICE_PORT
    ) {
        device.log(
            "[WIZ] Control socket refused: invalid controller network endpoint."
        );
        return;
    }

    wizRenderStartLogged = false;
    wizOpenControlSocket(mac);
}


// ============================================================
// RENDER — CONTINUOUS FRAME HANDLING
// ============================================================

export function Render() {
    if (!wizIsEnabled(AutoStartStream)) {
        return;
    }

    if (!wizControlSocket) {
        if (!wizControlErrorLogged) {
            device.log(
                "[WIZ] Streaming enabled, but the control socket is unavailable."
            );
            wizControlErrorLogged = true;
        }

        return;
    }

    if (!wizRenderStartLogged) {
        device.log(
            "[WIZ] Continuous frame streaming started."
        );
        wizRenderStartLogged = true;
    }

    // Check the send interval first: most Render() calls (about 30 per
    // second) are skipped here, before any colour handling.
    const elapsed = Date.now() - wizLastSendTime;

    if (elapsed + WIZ_SEND_INTERVAL_TOLERANCE_MS < wizGetSendIntervalMs()) {
        return;
    }

    const frame = wizGetCurrentFrame();

    if (!frame) {
        return;
    }

    // Unchanged frames are suppressed, except for the periodic refresh.
    if (
        wizFramesEqual(frame, wizLastSentFrame) &&
        elapsed < WIZ_REFRESH_INTERVAL_MS
    ) {
        return;
    }

    wizSendFrame(frame);
}


// ============================================================
// DEVICE SHUTDOWN
// ============================================================

export function Shutdown(suspend) {
    wizResetColorCache();

    if (wizControlSocket) {
        wizCloseControlSocket();
        device.log(
            "[WIZ] Device control UDP socket closed."
        );
    }

    wizControlMac = "";
    wizLastSentFrame = null;
    wizLastSendTime = 0;
    wizSendFailures = 0;
    wizControlAckLogged = false;
    wizControlErrorLogged = false;
    wizRenderStartLogged = false;
}


// ============================================================
// DEVICE LIBRARY
// ============================================================

const WIZDeviceLibrary = {
    "ESP03_SHRGB3_01ABI": {
        productName: "WRGB LED Strip",
        imageUrl: "https://www.assets.signify.com/is/image/Signify/WiFi-BLE-LEDstrip-2M-1600lm-startkit-SPP?&wid=200&hei=200&qlt=100",
        sku: 27082,
        state: 1,
        supportRGB: true,
        supportDimming: true,
        supportWhiteColor: true,
        supportCostumLedCount: false,
        ledCount: 1
    },

    127372: {
        productName: "W100 WRGB Light Bulb",
        imageUrl: "https://www.assets.signify.com/is/image/PhilipsLighting/Wi_Fi_BLE_100W_A67_E27_922_65_RGB_1PF_6_S-SPP?wid=200&hei=200&qlt=100",
        sku: 127372,
        state: 1,
        supportRGB: true,
        supportDimming: true,
        supportWhiteColor: true,
        supportCostumLedCount: false,
        ledCount: 1
    },

    "ESP25_SHRGB_01": {
        productName: "WiZ Neo RGB Bulb",
        state: 1,
        supportRGB: true,
        supportDimming: true,
        supportCostumLedCount: false,
        ledCount: 1
    }
};


// ============================================================
// DISCOVERY SERVICE — UDP BROADCAST DISCOVERY
// ============================================================

export function DiscoveryService() {
    const discoveryService = this;

    // Icon of the service tile on the Third Party Services page.
    this.IconUrl = WIZ_LOGO_URL;

    this.Initialize = function() {
        service.log(
            "[WIZ] Initializing UDP discovery socket..."
        );

        wizPendingDevices = {};
        wizScanResponders = {};
        lastBroadcast = 0;
        wizScanCount = 0;
        wizUnicastErrorLogged = false;

        if (wizDiscoverySocket) {
            try {
                wizDiscoverySocket.close();
            } catch (err) {
                service.log(
                    "[WIZ] Previous discovery socket close warning: " +
                    String(err)
                );
            }

            wizDiscoverySocket = null;
        }

        try {
            if (!udp || typeof udp.createSocket !== "function") {
                throw new Error("UDP createSocket() unavailable");
            }

            wizDiscoverySocket = udp.createSocket();

            if (!wizHasSocketMethods(wizDiscoverySocket)) {
                throw new Error(
                    "Required UDP socket methods unavailable"
                );
            }

            wizDiscoverySocket.on("message", (message) => {
                if (
                    !message ||
                    typeof message !== "object" ||
                    !wizIsUsableDeviceAddress(message.address) ||
                    Number(message.port) !== WIZ_DEVICE_PORT
                ) {
                    service.log(
                        "[WIZ] Invalid or unexpected discovery sender ignored."
                    );
                    return;
                }

                const raw = message.data;

                if (
                    typeof raw !== "string" ||
                    raw.length === 0 ||
                    raw.length > 1024
                ) {
                    service.log(
                        "[WIZ] Invalid discovery payload ignored."
                    );
                    return;
                }

                let packet;

                try {
                    packet = JSON.parse(raw);
                } catch (err) {
                    service.log(
                        "[WIZ] Invalid JSON discovery response."
                    );
                    return;
                }

                if (
                    !packet ||
                    typeof packet !== "object" ||
                    Array.isArray(packet)
                ) {
                    service.log(
                        "[WIZ] Invalid discovery packet structure."
                    );
                    return;
                }

                // Registration response.
                if (packet.method === "registration") {
                    if (
                        !packet.result ||
                        typeof packet.result !== "object" ||
                        packet.result.success !== true
                    ) {
                        service.log(
                            "[WIZ] Registration response unsuccessful or malformed."
                        );
                        return;
                    }

                    const mac = String(
                        packet.result.mac || ""
                    ).toLowerCase();

                    if (!wizIsValidMacAddress(mac)) {
                        service.log(
                            "[WIZ] Registration response contains an invalid device identity."
                        );
                        return;
                    }

                    // One response per device and address per scan. A device
                    // reached by both broadcast and unicast probe answers twice.
                    if (wizScanResponders[mac] === message.address) {
                        return;
                    }

                    wizScanResponders[mac] = message.address;

                    // Known device, same address, configuration already
                    // loaded: only record that it is still reachable.
                    const known = service.getController(mac);

                    if (
                        known !== undefined &&
                        known.deviceInfoLoaded &&
                        known.ip === message.address
                    ) {
                        known.markSeen();
                        return;
                    }

                    // New device, or a known device at a different address:
                    // request the system configuration to confirm identity.
                    wizPendingDevices[mac] = {
                        address: message.address,
                        time: Date.now()
                    };

                    const request = WIZ_SYSTEM_CONFIG_REQUEST;

                    try {
                        wizDiscoverySocket.write(
                            request,
                            message.address,
                            WIZ_DEVICE_PORT
                        );

                        service.log(
                            "[WIZ] Requested configuration from a discovered WiZ device."
                        );

                    } catch (err) {
                        service.log(
                            "[WIZ] Configuration request failed: " +
                            String(err)
                        );

                        delete wizPendingDevices[mac];
                    }

                    return;
                }

                // System configuration response.
                if (packet.method === "getSystemConfig") {
                    if (
                        !packet.result ||
                        typeof packet.result !== "object"
                    ) {
                        service.log(
                            "[WIZ] Missing system configuration result."
                        );
                        return;
                    }

                    const result = packet.result;
                    const mac = String(
                        result.mac || ""
                    ).toLowerCase();

                    if (!wizIsValidMacAddress(mac)) {
                        service.log(
                            "[WIZ] System configuration contains an invalid device identity."
                        );
                        return;
                    }

                    const pending = wizPendingDevices[mac];

                    if (!pending || pending.address !== message.address) {
                        service.log(
                            "[WIZ] Unsolicited or mismatched system configuration ignored."
                        );
                        return;
                    }

                    if (
                        typeof result.moduleName !== "string" ||
                        typeof result.fwVersion !== "string"
                    ) {
                        service.log(
                            "[WIZ] Missing hardware identity fields."
                        );

                        delete wizPendingDevices[mac];
                        return;
                    }

                    delete wizPendingDevices[mac];

                    service.log(
                        "[WIZ] System configuration received and validated."
                    );

                    service.log(
                        "[WIZ] Hardware model: " + result.moduleName
                    );

                    service.log(
                        "[WIZ] Firmware version: " + result.fwVersion
                    );

                    discoveryService.CreateController(
                        message.address,
                        message.port,
                        result
                    );

                    return;
                }

                service.log(
                    "[WIZ] Unhandled discovery response method: " +
                    String(packet.method)
                );
            });

            wizDiscoverySocket.on("error", (err) => {
                service.log(
                    "[WIZ] Discovery UDP socket error: " + String(err)
                );
            });

            const boundPort = wizBindSocket(
                wizDiscoverySocket,
                (attempt) => WIZ_DISCOVERY_LOCAL_PORT + attempt
            );

            service.log(
                "[WIZ] Bound discovery socket to local port " + boundPort
            );

        } catch (err) {
            service.log(
                "[WIZ] Discovery socket initialization failed: " +
                String(err)
            );

            if (wizDiscoverySocket) {
                try {
                    wizDiscoverySocket.close();
                } catch (closeError) {
                    service.log(
                        "[WIZ] Discovery socket cleanup warning: " +
                        String(closeError)
                    );
                }

                wizDiscoverySocket = null;
            }
        }
    };

    this.CheckForDevices = function() {
        if (!wizDiscoverySocket) {
            service.log(
                "[WIZ] Discovery socket unavailable."
            );
            return;
        }

        const now = Date.now();

        // Drop configuration requests that were never answered.
        for (const pendingMac in wizPendingDevices) {
            if (now - wizPendingDevices[pendingMac].time > WIZ_PENDING_TIMEOUT_MS) {
                delete wizPendingDevices[pendingMac];
            }
        }

        const request = WIZ_REGISTRATION_REQUEST;

        wizScanResponders = {};
        wizScanCount++;

        try {
            wizDiscoverySocket.write(
                request,
                WIZ_BROADCAST_ADDRESS,
                WIZ_DEVICE_PORT
            );

            service.log(
                "[WIZ] WiZ discovery registration broadcast submitted."
            );

        } catch (err) {
            service.log(
                "[WIZ] Discovery broadcast failed: " + String(err)
            );
        }

        // Broadcast can be filtered by the network or by the chosen adapter.
        // Also probe every known device directly at its last known address.
        for (const cont of service.controllers) {
            const known = cont && cont.obj;

            if (!known || !wizIsUsableDeviceAddress(known.ip)) {
                continue;
            }

            try {
                wizDiscoverySocket.write(
                    request,
                    known.ip,
                    WIZ_DEVICE_PORT
                );
            } catch (err) {
                if (!wizUnicastErrorLogged) {
                    service.log(
                        "[WIZ] Direct discovery probe failed: " + String(err)
                    );
                    wizUnicastErrorLogged = true;
                }
            }
        }
    };

    this.CreateController = function(ip, port, data) {
        const mac = String(
            data.mac || ""
        ).toLowerCase();

        if (
            !wizIsValidMacAddress(mac) ||
            !wizIsUsableDeviceAddress(ip) ||
            Number(port) !== WIZ_DEVICE_PORT
        ) {
            service.log(
                "[WIZ] Refusing controller creation: invalid device identity or endpoint."
            );
            return;
        }

        let wizController = service.getController(mac);

        if (wizController === undefined) {
            wizController = new WIZDevice({
                id: mac,
                mac: mac,
                ip: ip,
                port: Number(port)
            });

            service.addController(wizController);

            service.log(
                "[WIZ] Added discovered WiZ controller."
            );

        } else {
            if (wizController.ip !== ip) {
                service.log(
                    "[WIZ] Device address changed; updating controller endpoint."
                );
            }

            wizController.updateWithValue({
                ip: ip,
                port: Number(port)
            });
        }

        wizController.setDeviceInfo(data);
        wizController.markSeen();
    };

    this.Update = function() {
        for (const cont of service.controllers) {
            if (
                cont &&
                cont.obj &&
                typeof cont.obj.update === "function"
            ) {
                cont.obj.update();
            }
        }

        const now = Date.now();

        let interval = WIZ_DISCOVERY_IDLE_INTERVAL_MS;

        if (wizScanCount < WIZ_DISCOVERY_BURST_COUNT) {
            interval = WIZ_DISCOVERY_BURST_INTERVAL_MS;
        } else if (service.controllers.length === 0) {
            interval = WIZ_DISCOVERY_SEARCH_INTERVAL_MS;
        }

        if (now - lastBroadcast >= interval) {
            lastBroadcast = now;
            discoveryService.CheckForDevices();
        }
    };

    this.Shutdown = function() {
        if (wizDiscoverySocket) {
            try {
                wizDiscoverySocket.close();
                service.log(
                    "[WIZ] Discovery UDP socket closed."
                );
            } catch (err) {
                service.log(
                    "[WIZ] Discovery socket shutdown warning: " +
                    String(err)
                );
            }

            wizDiscoverySocket = null;
        }
    };

    this.Removal = function(value) {};
}


// ============================================================
// WIZ CONTROLLER OBJECT
// ============================================================

class WIZDevice {
    constructor(value) {
        this.id = value.id;
        this.mac = String(
            value.mac || value.id || ""
        ).toLowerCase();

        this.ip = value.ip;
        this.port = Number(value.port);

        this.initialized = true;
        this.deviceInfoLoaded = false;
        this.announced = false;

        this.lastSeen = Date.now();
        this.stale = false;

        this.wiztype = null;

        this.homeId = 0;
        this.homeid = 0;
        this.fwVersion = "0.0.0";
        this.roomId = 0;
        this.roomid = 0;
        this.groupId = 0;
        this.groupid = 0;
        this.type = -1;
        this.modelName = "";
        this.isRGB = false;
        this.isTW = false;

        this.lastsend = {
            r: -1,
            g: -1,
            b: -1,
            brightness: -1
        };

        this.DumpControllerInfo();
    }

    DumpControllerInfo() {
        service.log(
            "[WIZ] Controller object created."
        );
    }

    markSeen() {
        this.lastSeen = Date.now();

        if (this.stale) {
            this.stale = false;
            service.log(
                "[WIZ] Device is responding to discovery again."
            );
        }
    }

    updateWithValue(value) {
        if (value && wizIsUsableDeviceAddress(value.ip)) {
            this.ip = value.ip;
        }

        if (value && Number.isFinite(Number(value.port))) {
            this.port = Number(value.port);
        }

        service.updateController(this);
    }

    setDeviceInfo(data) {
        if (this.deviceInfoLoaded) {
            return;
        }

        if (!data || typeof data !== "object") {
            service.log(
                "[WIZ] Refusing invalid controller configuration."
            );
            return;
        }

        const mac = String(
            data.mac || ""
        ).toLowerCase();

        if (!wizIsValidMacAddress(mac) || mac !== this.mac) {
            service.log(
                "[WIZ] Controller configuration MAC does not match controller ID."
            );
            return;
        }

        // Fields can be absent when the device has not been set up in the
        // WiZ app; fall back to 0 instead of storing undefined.
        this.homeId = wizValueOrZero(data.homeId);
        this.homeid = this.homeId;
        this.fwVersion = data.fwVersion;
        this.roomId = wizValueOrZero(data.roomId);
        this.roomid = this.roomId;
        this.groupId = wizValueOrZero(data.groupId);
        this.groupid = this.groupId;

        this.type = Object.prototype.hasOwnProperty.call(data, "typeid")
            ? data.typeid
            : -1;

        this.modelName = data.moduleName;
        this.isRGB = data.moduleName.toUpperCase().includes("RGB");
        this.isTW = data.moduleName.toUpperCase().includes("TW");
        this.deviceInfoLoaded = true;

        if (
            Object.prototype.hasOwnProperty.call(
                WIZDeviceLibrary,
                this.modelName
            )
        ) {
            this.wiztype = WIZDeviceLibrary[this.modelName];
        }

        service.updateController(this);
        service.log(
            "[WIZ] Device information attached to controller."
        );
    }

    update() {
        if (this.deviceInfoLoaded && !this.announced) {
            service.updateController(this);
            service.announceController(this);
            this.announced = true;
            service.log(
                "[WIZ] Controller announced to SignalRGB."
            );
        }

        if (
            this.announced &&
            !this.stale &&
            Date.now() - this.lastSeen > WIZ_STALE_AFTER_MS
        ) {
            this.stale = true;
            service.log(
                "[WIZ] Device has not answered discovery recently."
            );
        }
    }
}
