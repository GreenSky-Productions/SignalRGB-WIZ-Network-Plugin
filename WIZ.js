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
controller:readonly
discovery:readonly
TurnOffOnShutdown:readonly
variableLedCount:readonly
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

let wizpro;

let ledCount = 4;
let ledNames = [];
let ledPositions = [];
let subdevices = [];

let lastBroadcast = 0;

// Diagnostic socket state
let wizDiscoverySocket = null;
let wizRegistrationVerified = false;
let wizSystemConfigRequested = false;
let wizDeviceInfo = null;

// Temporary test configuration
const WIZ_PROBE_IP = "192.168.0.237";
const WIZ_DEVICE_PORT = 38899;
const WIZ_LOCAL_PORT = 38900;
const WIZ_EXPECTED_MAC = "9877d5fbb8f4";

export function onvariableLedCountChanged() {
}


// ============================================================
// ORIGINAL DEVICE COMPONENT
// ============================================================

export function Initialize() {

    device.addFeature("udp");

    device.setName(
        `WIZ ${controller.modelName} Room: ${controller.roomId}`
    );

    if (controller.wiztype) {
        // device.setIcon(controller.wiztype.imageUrl);
    }

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
    device.setControllableLeds(["LED 1"], [[0, 0]]);

    device.log(JSON.stringify(controller));
    device.log(controller.ip);
    device.log(controller.port);

    wizpro = new WIZProtcol(
        controller.ip,
        controller.port
    );
}

export function Render() {

    if (AutoStartStream) {

        if (forceColor !== undefined) {

            const color = forceColor
                ? device.createColorArray(forcedColor, 1, "Inline")
                : device.color(0, 0);

            wizpro.setPilot(color[0], color[1], color[2]);

        } else {

            const color = device.color(0, 0);

            wizpro.setPilot(color[0], color[1], color[2]);
        }
    }
}

export function Shutdown(suspend) {

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
    }
};


// ============================================================
// DISCOVERY SERVICE — SINGLE UDP SOCKET
// ============================================================

export function DiscoveryService() {

    this.IconUrl =
        "https://play-lh.googleusercontent.com/jhmjIodqBLQQUD2sJF_O6oawa04ocDFfQIgoH0rPOXQY3V1uVz0-FJvEieFjVO-kcJ8=w200-h200-rw";

    // --------------------------------------------------------
    // INITIALIZATION
    // --------------------------------------------------------

    this.Initialize = function() {

        service.log(
            "[WIZ] Initializing single UDP socket..."
        );

        wizRegistrationVerified = false;
        wizSystemConfigRequested = false;
        wizDeviceInfo = null;
        lastBroadcast = 0;

        if (wizDiscoverySocket) {

            try {
                wizDiscoverySocket.close();
            } catch (err) {
                service.log(
                    "[WIZ] Previous socket close warning: " +
                    String(err)
                );
            }

            wizDiscoverySocket = null;
        }

        try {

            if (
                !udp ||
                typeof udp.createSocket !== "function"
            ) {
                throw new Error(
                    "UDP createSocket() unavailable"
                );
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

            // Register message handler before binding.
            wizDiscoverySocket.on("message", (message) => {

                service.log("[WIZ] UDP message received.");

                // Validate message wrapper.
                if (
                    !message ||
                    typeof message !== "object"
                ) {
                    service.log(
                        "[WIZ] Invalid UDP message wrapper."
                    );
                    return;
                }

                // Verify source IP and source port.
                if (
                    message.address !== WIZ_PROBE_IP ||
                    Number(message.port) !== WIZ_DEVICE_PORT
                ) {
                    service.log(
                        "[WIZ] Unexpected UDP sender ignored."
                    );
                    return;
                }

                // Extract actual JSON payload.
                const raw = message.data;

                if (
                    typeof raw !== "string" ||
                    raw.length === 0 ||
                    raw.length > 1024
                ) {
                    service.log(
                        "[WIZ] Invalid UDP payload ignored."
                    );
                    return;
                }

                let packet;

                try {
                    packet = JSON.parse(raw);
                } catch (err) {
                    service.log(
                        "[WIZ] Invalid JSON response."
                    );
                    return;
                }

                if (
                    !packet ||
                    typeof packet !== "object" ||
                    Array.isArray(packet)
                ) {
                    service.log(
                        "[WIZ] Invalid packet structure."
                    );
                    return;
                }


                // =================================================
                // REGISTRATION RESPONSE
                // =================================================

                if (packet.method === "registration") {

                    if (
                        !packet.result ||
                        typeof packet.result !== "object"
                    ) {
                        service.log(
                            "[WIZ] Missing registration result."
                        );
                        return;
                    }

                    if (packet.result.success !== true) {
                        service.log(
                            "[WIZ] Registration unsuccessful."
                        );
                        return;
                    }

                    const receivedMac = String(
                        packet.result.mac || ""
                    ).toLowerCase();

                    if (receivedMac !== WIZ_EXPECTED_MAC) {
                        service.log(
                            "[WIZ] Registration MAC mismatch."
                        );
                        return;
                    }

                    if (!wizRegistrationVerified) {

                        wizRegistrationVerified = true;

                        service.log(
                            "[WIZ] Neo registration verified."
                        );

                        service.log(
                            "[WIZ] IP: " + message.address
                        );

                        service.log(
                            "[WIZ] MAC: " + receivedMac
                        );

                        service.log(
                            "[WIZ] UDP port: " + message.port
                        );
                    }

                    // Request system configuration once.
                    if (!wizSystemConfigRequested) {

                        const configRequest = JSON.stringify({
                            method: "getSystemConfig",
                            id: 1
                        });

                        try {

                            wizDiscoverySocket.write(
                                configRequest,
                                WIZ_PROBE_IP,
                                WIZ_DEVICE_PORT
                            );

                            wizSystemConfigRequested = true;

                            service.log(
                                "[WIZ] getSystemConfig request submitted."
                            );

                        } catch (err) {

                            service.log(
                                "[WIZ] Configuration request failed: " +
                                String(err)
                            );
                        }
                    }

                    return;
                }


                // =================================================
                // SYSTEM CONFIGURATION RESPONSE
                // =================================================

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

                    const responseMac = String(
                        result.mac || ""
                    ).toLowerCase();

                    if (responseMac !== WIZ_EXPECTED_MAC) {

                        service.log(
                            "[WIZ] System configuration MAC mismatch."
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

                        return;
                    }

                    // Preserve the configuration for later stages.
                    wizDeviceInfo = result;

                    service.log(
                        "[WIZ] System configuration received and validated."
                    );

                    service.log(
                        "[WIZ] Hardware model: " +
                        result.moduleName
                    );

                    service.log(
                        "[WIZ] Firmware version: " +
                        result.fwVersion
                    );

                    service.log(
                        "[WIZ] Region: " +
                        String(result.rgn || "not reported")
                    );

                    service.log(
                        "[WIZ] Diagnostic mode: controller creation suppressed."
                    );

                    return;
                }

                service.log(
                    "[WIZ] Unhandled response method: " +
                    String(packet.method)
                );

            });


            // Socket errors.
            wizDiscoverySocket.on("error", (err) => {

                service.log(
                    "[WIZ] UDP socket error: " +
                    String(err)
                );

            });

            // Bind before sending.
            wizDiscoverySocket.bind(WIZ_LOCAL_PORT);

            service.log(
                "[WIZ] Bound single UDP socket to local port " +
                WIZ_LOCAL_PORT
            );

        } catch (err) {

            service.log(
                "[WIZ] Socket initialization failed: " +
                String(err)
            );

            if (wizDiscoverySocket) {

                try {
                    wizDiscoverySocket.close();
                } catch (closeError) {
                    service.log(
                        "[WIZ] Socket cleanup warning: " +
                        String(closeError)
                    );
                }

                wizDiscoverySocket = null;
            }
        }
    };


    // --------------------------------------------------------
    // REGISTRATION REQUEST
    // --------------------------------------------------------

    this.CheckForDevices = function() {

        if (!wizDiscoverySocket) {

            service.log(
                "[WIZ] UDP socket unavailable."
            );

            return;
        }

        // Stop registration retries after verification.
        if (wizRegistrationVerified) {
            return;
        }

        const request = JSON.stringify({
            method: "registration",
            params: {
                phoneMac: "AAAAAAAAAAAA",
                register: false,
                phoneIp: "1.2.3.4",
                id: "1"
            }
        });

        try {

            service.log(
                "[WIZ] Sending registration to " +
                WIZ_PROBE_IP + ":" + WIZ_DEVICE_PORT
            );

            wizDiscoverySocket.write(
                request,
                WIZ_PROBE_IP,
                WIZ_DEVICE_PORT
            );

            service.log(
                "[WIZ] Registration request submitted."
            );

        } catch (err) {

            service.log(
                "[WIZ] Registration transmission failed: " +
                String(err)
            );
        }
    };


    // --------------------------------------------------------
    // UPDATE
    // --------------------------------------------------------

    this.Update = function() {

        const now = Date.now();

        if (now - lastBroadcast >= 60000) {

            lastBroadcast = now;

            this.CheckForDevices();
        }
    };


    // --------------------------------------------------------
    // SHUTDOWN
    // --------------------------------------------------------

    this.Shutdown = function() {

        if (wizDiscoverySocket) {

            try {

                wizDiscoverySocket.close();

                service.log(
                    "[WIZ] UDP socket closed."
                );

            } catch (err) {

                service.log(
                    "[WIZ] Socket shutdown warning: " +
                    String(err)
                );
            }

            wizDiscoverySocket = null;
        }
    };
}


// ============================================================
// ORIGINAL WIZ DEVICE CLASS
// Not instantiated during diagnostic testing.
// ============================================================

class WIZDevice {

    constructor(value) {

        this.id = value.id;
        this.ip = value.ip;
        this.port = value.port;

        this.initialized = false;
        this.deviceInfoLoaded = false;
        this.announced = false;

        this.wiztype = null;

        this.homeid = 0;
        this.fwVersion = "0.0.0";
        this.roomid = 0;
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

        service.log(`id: ${this.id}`);
        service.log(`port: ${this.port}`);
        service.log(`ip: ${this.ip}`);
    }

    updateWithValue(value) {

        service.log("Got Value update");

        const data = JSON.parse(value.response);

        service.log(data);

        this.ip = data.ip;
        this.port = data.port;
    }

    setDeviceInfo(data) {

        if (this.deviceInfoLoaded) {
            return;
        }

        this.homeid = data.homeId;
        this.fwVersion = data.fwVersion;
        this.roomId = data.roomId;
        this.groupId = data.groupId;

        this.type = data.hasOwnProperty("typeid")
            ? data.typeid
            : -1;

        this.modelName = data.moduleName;

        this.isRGB = data.moduleName.includes("RGB");
        this.isTW = data.moduleName.includes("TW");

        this.deviceInfoLoaded = true;

        if (WIZDeviceLibrary.hasOwnProperty(this.modelName)) {
            this.wiztype = WIZDeviceLibrary[this.modelName];
        }

        service.updateController(this);
    }

    update() {

        if (!this.initialized) {

            this.initialized = true;

            service.broadcast(
                JSON.stringify({
                    method: "getSystemConfig",
                    id: 1
                }),
                this.ip
            );

            service.log(
                `Request Device Info from ${this.ip}`
            );
        }

        if (
            this.deviceInfoLoaded &&
            !this.announced
        ) {

            service.updateController(this);
            service.announceController(this);

            service.log("Is announced!");

            this.announced = true;
        }
    }
}


// ============================================================
// ORIGINAL WIZ LIGHTING PROTOCOL
// ============================================================

class WIZProtcol {

    constructor(ip, port) {

        this.ip = ip;
        this.port = port;

        this.lastR = -1;
        this.lastG = -1;
        this.lastB = -1;

        this.lastDimmR = -1;
        this.lastDimmG = -1;
        this.lastDimmB = -1;

        this.lastBrightness = -1;
    }

    setPilot(r, g, b) {

        const brightness = device.Brightness;

        const color = device.createColorArray(
            dimmColor,
            1,
            "Inline"
        );

        if (
            this.lastR !== r ||
            this.lastG !== g ||
            this.lastB !== b ||
            this.lastBrightness !== brightness ||
            this.lastDimmR !== color[0] ||
            this.lastDimmG !== color[1] ||
            this.lastDimmB !== color[2]
        ) {

            this.lastG = g;
            this.lastB = b;
            this.lastR = r;

            this.lastDimmR = color[0];
            this.lastDimmG = color[1];
            this.lastDimmB = color[2];

            if (r < 1 && g < 1 && b < 1) {

                this.lastBrightness = minBrightniss;

                udp.send(
                    this.ip,
                    this.port,
                    {
                        method: "setPilot",
                        params: {
                            r: color[0],
                            g: color[1],
                            b: color[2],
                            dimming: minBrightniss,
                            speed: 100
                        }
                    }
                );

            } else {

                this.lastBrightness = brightness;

                udp.send(
                    this.ip,
                    this.port,
                    {
                        method: "setPilot",
                        params: {
                            r: r,
                            g: g,
                            b: b,
                            dimming: brightness,
                            speed: 100
                        }
                    }
                );
            }
        }
    }
}
