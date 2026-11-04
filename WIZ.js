import udp from "@SignalRGB/udp";

export function Name() { return "WIZ Interface"; }
export function Version() { return "1.0.0"; }
export function VendorId() { return 0x0; }
export function ProductId() { return 0x0; }
export function Type() { return "network"; }
export function Publisher() { return "GreenSky Productions"; }
export function Size() { return [1, 1]; }
export function DefaultPosition() { return [75, 70]; }
export function DefaultScale() { return 10.0; }

/* global
controller:readonly, service:readonly, device:readonly,
AutoStartStream:readonly, forcedColor:readonly, forceColor:readonly,
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
            min: "1",
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


// ============================================================
// CONFIGURATION
// ============================================================

// WiZ local UDP protocol endpoints.
// No individual device address is embedded in the plugin.
const WIZ_BROADCAST_ADDRESS = "255.255.255.255";
const WIZ_DEVICE_PORT = 38899;
const WIZ_DISCOVERY_LOCAL_PORT = 38900;

// Allocate a deterministic local control port for each device component.
const WIZ_CONTROL_LOCAL_PORT_BASE = 39000;
const WIZ_CONTROL_LOCAL_PORT_RANGE = 10000;

const WIZ_DISCOVERY_INTERVAL_MS = 60000;

// Initial conservative streaming configuration.
const WIZ_MIN_SEND_INTERVAL_MS = 100;
const WIZ_COMMAND_SPEED = 100;


// ============================================================
// SOCKET AND FRAME STATE
// ============================================================

let wizDiscoverySocket = null;
let wizPendingDevices = {};
let wizScanResponders = {};
let lastBroadcast = 0;

let wizControlSocket = null;
let wizLastSentFrame = null;
let wizLastSendTime = 0;
let wizControlAckLogged = false;
let wizControlErrorLogged = false;
let wizRenderStartLogged = false;


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

function wizGetControlLocalPort(mac) {
    // Derive a stable local port from each discovered MAC.
    // This avoids every device component requesting the same port.
    let hash = 0;

    for (let i = 0; i < mac.length; i++) {
        hash = (hash * 31 + mac.charCodeAt(i)) % WIZ_CONTROL_LOCAL_PORT_RANGE;
    }

    return WIZ_CONTROL_LOCAL_PORT_BASE + hash;
}

function wizMakeFrame(color, dimming) {
    if (!Array.isArray(color) || color.length < 3) {
        return null;
    }

    return {
        r: wizClamp(color[0], 0, 255),
        g: wizClamp(color[1], 0, 255),
        b: wizClamp(color[2], 0, 255),
        dimming: wizClamp(dimming, 0, 100),
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

function wizGetCurrentFrame() {
    const color = wizIsEnabled(forceColor)
        ? device.createColorArray(forcedColor, 1, "Inline")
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
            device.createColorArray(dimmColor, 1, "Inline"),
            wizClamp(minBrightniss, 1, 100)
        );
    }

    return wizMakeFrame(
        [r, g, b],
        wizClamp(device.Brightness, 0, 100)
    );
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

        // Explicit assignments: no object spread syntax.
        wizLastSentFrame = {
            r: frame.r,
            g: frame.g,
            b: frame.b,
            dimming: frame.dimming,
            speed: frame.speed
        };

        wizLastSendTime = Date.now();
        wizControlErrorLogged = false;

        return true;

    } catch (err) {
        if (!wizControlErrorLogged) {
            device.log(
                "[WIZ] setPilot transmission failed: " + String(err)
            );
            wizControlErrorLogged = true;
        }

        return false;
    }
}


// ============================================================
// DEVICE COMPONENT
// ============================================================

export function Initialize() {
    device.addFeature("udp");

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

    if (device.isTW) {
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
        !wizIsValidIPv4Address(controller.ip) ||
        !Number.isFinite(Number(controller.port)) ||
        Number(controller.port) !== WIZ_DEVICE_PORT
    ) {
        device.log(
            "[WIZ] Control socket refused: invalid controller network endpoint."
        );
        return;
    }

    if (wizControlSocket) {
        try {
            wizControlSocket.close();
        } catch (err) {
            device.log(
                "[WIZ] Previous control socket close warning: " + String(err)
            );
        }

        wizControlSocket = null;
    }

    wizLastSentFrame = null;
    wizLastSendTime = 0;
    wizControlAckLogged = false;
    wizControlErrorLogged = false;
    wizRenderStartLogged = false;

    try {
        if (!udp || typeof udp.createSocket !== "function") {
            throw new Error(
                "UDP createSocket() unavailable in device component context"
            );
        }

        wizControlSocket = udp.createSocket();

        if (
            !wizControlSocket ||
            typeof wizControlSocket.on !== "function" ||
            typeof wizControlSocket.bind !== "function" ||
            typeof wizControlSocket.write !== "function" ||
            typeof wizControlSocket.close !== "function"
        ) {
            throw new Error(
                "Required device-control UDP socket methods unavailable"
            );
        }

        wizControlSocket.on("message", (message) => {
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
                    "[WIZ] Neo acknowledged live setPilot updates."
                );
                wizControlAckLogged = true;
            }
        });

        wizControlSocket.on("error", (err) => {
            device.log(
                "[WIZ] Control UDP socket error: " + String(err)
            );
        });

        const controlLocalPort = wizGetControlLocalPort(mac);
        wizControlSocket.bind(controlLocalPort);

        device.log(
            "[WIZ] Bound device control socket to local port " +
            controlLocalPort
        );

    } catch (err) {
        device.log(
            "[WIZ] Control socket initialization failed: " + String(err)
        );

        if (wizControlSocket) {
            try {
                wizControlSocket.close();
            } catch (closeError) {
                device.log(
                    "[WIZ] Control socket cleanup warning: " +
                    String(closeError)
                );
            }

            wizControlSocket = null;
        }
    }
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

    const frame = wizGetCurrentFrame();

    if (!frame || wizFramesEqual(frame, wizLastSentFrame)) {
        return;
    }

    if (
        Date.now() - wizLastSendTime <
        WIZ_MIN_SEND_INTERVAL_MS
    ) {
        return;
    }

    wizSendFrame(frame);
}


// ============================================================
// DEVICE SHUTDOWN
// ============================================================

export function Shutdown(suspend) {
    if (wizControlSocket) {
        try {
            wizControlSocket.close();
            device.log(
                "[WIZ] Device control UDP socket closed."
            );
        } catch (err) {
            device.log(
                "[WIZ] Control socket shutdown warning: " + String(err)
            );
        }

        wizControlSocket = null;
    }

    wizLastSentFrame = null;
    wizLastSendTime = 0;
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

    this.IconUrl =
        "https://play-lh.googleusercontent.com/jhmjIodqBLQQUD2sJF_O6oawa04ocDFfQIgoH0rPOXQY3V1uVz0-FJvEieFjVO-kcJ8=w200-h200-rw";

    this.Initialize = function() {
        service.log(
            "[WIZ] Initializing UDP discovery socket..."
        );

        wizPendingDevices = {};
        wizScanResponders = {};
        lastBroadcast = 0;

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

            if (
                !wizDiscoverySocket ||
                typeof wizDiscoverySocket.on !== "function" ||
                typeof wizDiscoverySocket.bind !== "function" ||
                typeof wizDiscoverySocket.write !== "function" ||
                typeof wizDiscoverySocket.close !== "function"
            ) {
                throw new Error(
                    "Required UDP socket methods unavailable"
                );
            }

            wizDiscoverySocket.on("message", (message) => {
                if (
                    !message ||
                    typeof message !== "object" ||
                    !wizIsValidIPv4Address(message.address) ||
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

                    if (wizScanResponders[mac] === message.address) {
                        return;
                    }

                    wizScanResponders[mac] = message.address;
                    wizPendingDevices[mac] = message.address;

                    const request = JSON.stringify({
                        method: "getSystemConfig",
                        id: 1
                    });

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

                    if (wizPendingDevices[mac] !== message.address) {
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

            wizDiscoverySocket.bind(WIZ_DISCOVERY_LOCAL_PORT);

            service.log(
                "[WIZ] Bound discovery socket to local port " +
                WIZ_DISCOVERY_LOCAL_PORT
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

        // These fields are protocol placeholders, not host/device identifiers.
        const request = JSON.stringify({
            method: "registration",
            params: {
                phoneMac: "AAAAAAAAAAAA",
                register: false,
                phoneIp: "1.2.3.4",
                id: "1"
            }
        });

        wizScanResponders = {};

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
    };

    this.CreateController = function(ip, port, data) {
        const mac = String(
            data.mac || ""
        ).toLowerCase();

        if (
            !wizIsValidMacAddress(mac) ||
            !wizIsValidIPv4Address(ip) ||
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
            wizController.updateWithValue({
                ip: ip,
                port: Number(port)
            });

            service.log(
                "[WIZ] Updated discovered WiZ controller endpoint."
            );
        }

        wizController.setDeviceInfo(data);
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

        if (now - lastBroadcast >= WIZ_DISCOVERY_INTERVAL_MS) {
            lastBroadcast = now;
            this.CheckForDevices();
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

    updateWithValue(value) {
        if (value && typeof value.ip === "string") {
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

        this.homeId = data.homeId;
        this.homeid = data.homeId;
        this.fwVersion = data.fwVersion;
        this.roomId = data.roomId;
        this.roomid = data.roomId;
        this.groupId = data.groupId;
        this.groupid = data.groupId;

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
    }
}
