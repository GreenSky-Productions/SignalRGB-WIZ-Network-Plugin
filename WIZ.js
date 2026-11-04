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

let ledCount = 4;
let ledNames = [];
let ledPositions = [];
let subdevices = [];
let lastBroadcast = 0;

// Discovery socket state.
let wizDiscoverySocket = null;
let wizRegistrationVerified = false;
let wizSystemConfigRequested = false;
let wizDeviceInfo = null;

// Device-component control socket state.
// This socket is separate from the discovery socket.
let wizControlSocket = null;
let wizOneShotTestSent = false;

// Temporary single-device test configuration.
const WIZ_PROBE_IP = "192.168.0.237";
const WIZ_DEVICE_PORT = 38899;
const WIZ_LOCAL_PORT = 38900;
const WIZ_CONTROL_LOCAL_PORT = 38901;
const WIZ_EXPECTED_MAC = "9877d5fbb8f4";

// One-shot low-brightness test.
// Render remains disabled, so no continuous lighting stream is sent.
const WIZ_ONE_SHOT_TEST_ENABLED = true;
const WIZ_TEST_COLOR = {
    r: 255,
    g: 0,
    b: 0,
    dimming: 10,
    speed: 100
};

export function onvariableLedCountChanged() {
}


// ============================================================
// DEVICE COMPONENT
// ============================================================

export function Initialize() {
    device.addFeature("udp");

    const componentName = controller.wiztype
        ? controller.wiztype.productName
        : `WIZ ${controller.modelName}`;

    device.setName(`${componentName} Room: ${controller.roomId}`);

    if (controller.wiztype && controller.wiztype.imageUrl) {
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

    device.log("[WIZ] Controller component initialized.");
    device.log(JSON.stringify(controller));
    device.log(controller.ip);
    device.log(controller.port);

    // --------------------------------------------------------
    // ONE-SHOT SETPILOT TEST
    // --------------------------------------------------------

    if (WIZ_ONE_SHOT_TEST_ENABLED && !wizOneShotTestSent) {
        const controllerMac = String(
            controller.mac || controller.id || ""
        ).toLowerCase();

        if (controllerMac !== WIZ_EXPECTED_MAC) {
            device.log(
                "[WIZ] One-shot test refused: controller MAC does not match the test device."
            );
            return;
        }

        if (
            typeof controller.ip !== "string" ||
            !Number.isFinite(Number(controller.port))
        ) {
            device.log(
                "[WIZ] One-shot test refused: controller network address is invalid."
            );
            return;
        }

        try {
            if (!udp || typeof udp.createSocket !== "function") {
                throw new Error(
                    "UDP createSocket() unavailable in device component context"
                );
            }

            // DiscoveryService and the device component run in separate contexts.
            // Create a dedicated socket inside the device component.
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

            // Listen for a response from the Neo.
            wizControlSocket.on("message", (message) => {
                if (!message || typeof message !== "object") {
                    device.log(
                        "[WIZ] Ignored invalid control-socket response wrapper."
                    );
                    return;
                }

                if (
                    message.address !== controller.ip ||
                    Number(message.port) !== Number(controller.port)
                ) {
                    device.log(
                        "[WIZ] Ignored response from an unexpected control-socket sender."
                    );
                    return;
                }

                const raw = message.data;

                if (
                    typeof raw !== "string" ||
                    raw.length === 0 ||
                    raw.length > 1024
                ) {
                    device.log(
                        "[WIZ] Ignored invalid control-socket response payload."
                    );
                    return;
                }

                device.log("[WIZ] Control UDP response: " + raw);

                try {
                    const response = JSON.parse(raw);

                    if (
                        response &&
                        response.method === "setPilot" &&
                        response.result &&
                        response.result.success === true
                    ) {
                        device.log(
                            "[WIZ] Neo acknowledged setPilot successfully."
                        );
                    }
                } catch (err) {
                    device.log(
                        "[WIZ] Control response was not valid JSON."
                    );
                }
            });

            // Socket errors.
            wizControlSocket.on("error", (err) => {
                device.log(
                    "[WIZ] Control UDP socket error: " + String(err)
                );
            });

            // Bind to a different local port from discovery.
            wizControlSocket.bind(WIZ_CONTROL_LOCAL_PORT);

            device.log(
                "[WIZ] Bound device control socket to local port " +
                WIZ_CONTROL_LOCAL_PORT
            );

            // Construct the one-shot red command.
            const testPacket = JSON.stringify({
                method: "setPilot",
                params: {
                    r: WIZ_TEST_COLOR.r,
                    g: WIZ_TEST_COLOR.g,
                    b: WIZ_TEST_COLOR.b,
                    dimming: WIZ_TEST_COLOR.dimming,
                    speed: WIZ_TEST_COLOR.speed
                }
            });

            // Send directly to the verified controller address.
            wizControlSocket.write(
                testPacket,
                controller.ip,
                Number(controller.port)
            );

            wizOneShotTestSent = true;

            device.log(
                "[WIZ] One-shot setPilot datagram submitted: red at 10% dimming."
            );

        } catch (err) {
            device.log(
                "[WIZ] One-shot setPilot setup/transmission failed: " +
                String(err)
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
}

export function Render() {
    // Intentionally empty.
    // This test sends exactly one command from Initialize().
}

export function Shutdown(suspend) {
    if (wizControlSocket) {
        try {
            wizControlSocket.close();

            device.log(
                "[WIZ] Device control UDP socket closed."
            );

        } catch (err) {
            device.log(
                "[WIZ] Device control socket shutdown warning: " +
                String(err)
            );
        }

        wizControlSocket = null;
    }
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
// DISCOVERY SERVICE — SINGLE UDP SOCKET
// ============================================================

export function DiscoveryService() {
    const discoveryService = this;

    this.IconUrl =
        "https://play-lh.googleusercontent.com/jhmjIodqBLQQUD2sJF_O6oawa04ocDFfQIgoH0rPOXQY3V1uVz0-FJvEieFjVO-kcJ8=w200-h200-rw";

    // --------------------------------------------------------
    // INITIALIZATION
    // --------------------------------------------------------

    this.Initialize = function() {
        service.log("[WIZ] Initializing single UDP socket...");

        wizRegistrationVerified = false;
        wizSystemConfigRequested = false;
        wizDeviceInfo = null;
        lastBroadcast = 0;

        if (wizDiscoverySocket) {
            try {
                wizDiscoverySocket.close();
            } catch (err) {
                service.log(
                    "[WIZ] Previous socket close warning: " + String(err)
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
                throw new Error("Required UDP socket methods unavailable");
            }

            // Register callbacks before binding.
            wizDiscoverySocket.on("message", (message) => {
                service.log("[WIZ] UDP message received.");

                if (!message || typeof message !== "object") {
                    service.log(
                        "[WIZ] Invalid UDP message wrapper."
                    );
                    return;
                }

                // Verify source IP and port.
                if (
                    message.address !== WIZ_PROBE_IP ||
                    Number(message.port) !== WIZ_DEVICE_PORT
                ) {
                    service.log(
                        "[WIZ] Unexpected UDP sender ignored."
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
                        "[WIZ] Invalid UDP payload ignored."
                    );
                    return;
                }

                let packet;

                try {
                    packet = JSON.parse(raw);
                } catch (err) {
                    service.log("[WIZ] Invalid JSON response.");
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

                // ------------------------------------------------
                // REGISTRATION RESPONSE
                // ------------------------------------------------

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

                // ------------------------------------------------
                // SYSTEM CONFIGURATION RESPONSE
                // ------------------------------------------------

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

                    discoveryService.CreateController(
                        message.address,
                        message.port,
                        result
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
                    "[WIZ] UDP socket error: " + String(err)
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
            service.log("[WIZ] UDP socket unavailable.");
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
    // CONTROLLER CREATION
    // --------------------------------------------------------

    this.CreateController = function(ip, port, data) {
        const mac = String(data.mac || "").toLowerCase();

        if (mac !== WIZ_EXPECTED_MAC) {
            service.log(
                "[WIZ] Refusing controller creation for unexpected MAC."
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
                "[WIZ] Added new controller for " + mac + "."
            );

        } else {
            wizController.updateWithValue({
                ip: ip,
                port: Number(port)
            });

            service.log(
                "[WIZ] Updated existing controller for " + mac + "."
            );
        }

        wizController.setDeviceInfo(data);

        service.log(
            "[WIZ] Controller configuration applied; announcement is pending."
        );
    };


    // --------------------------------------------------------
    // UPDATE
    // --------------------------------------------------------

    this.Update = function() {
        // Announce configured controllers through the original lifecycle.
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

    this.Removal = function(value) {
    };
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

        // Configuration has already been received before creation.
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
        service.log("[WIZ] Controller ID: " + this.id);
        service.log("[WIZ] Controller MAC: " + this.mac);
        service.log("[WIZ] Controller IP: " + this.ip);
        service.log("[WIZ] Controller port: " + this.port);
    }

    updateWithValue(value) {
        if (value && typeof value.ip === "string") {
            this.ip = value.ip;
        }

        if (
            value &&
            Number.isFinite(Number(value.port))
        ) {
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

        const dataMac = String(
            data.mac || ""
        ).toLowerCase();

        if (dataMac !== this.mac) {
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
        if (
            this.deviceInfoLoaded &&
            !this.announced
        ) {
            service.updateController(this);
            service.announceController(this);

            this.announced = true;

            service.log(
                "[WIZ] Controller announced to SignalRGB."
            );
        }
    }
}
