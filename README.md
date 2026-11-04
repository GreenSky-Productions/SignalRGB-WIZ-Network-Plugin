# SignalRGB WiZ Network Plugin

A community-maintained SignalRGB network plugin for controlling WiZ lighting devices over the local network.

> **Development status:** experimental. The current development build has been verified against one Philips WiZ Neo RGB bulb (`ESP25_SHRGB_01`). It is not yet a general-purpose WiZ discovery implementation and should not be described as supporting every WiZ product.

## Verified device

| Device identifier | Firmware tested | Verified capability | Status |
|---|---:|---|---|
| `ESP25_SHRGB_01` | `1.38.0` | RGB colour and brightness through local UDP `setPilot` commands; continuous SignalRGB frame updates | Verified on one device |

The test environment used SignalRGB `2.5.84` on Windows 11. This is a recorded test environment, not a minimum-version guarantee.

## Current implementation status

- Registration and `getSystemConfig` response handling work for the tested Neo.
- The plugin creates and announces a SignalRGB controller for the verified device.
- The device component creates its own UDP control socket.
- A one-shot red command at 10% dimming was acknowledged by the bulb and visibly applied.
- Continuous colour changes from SignalRGB were visibly applied.
- The current stream loop suppresses duplicate frames and limits commands to one update every 100 ms (up to 10 updates per second).

See [Testing](docs/TESTING.md), [Architecture](docs/ARCHITECTURE.md), and [Protocol notes](docs/PROTOCOL.md) for evidence and limitations.

## Requirements

- SignalRGB with support for custom network plugins.
- A WiZ device connected to the same local network as the computer running SignalRGB.
- Local network communication enabled for the device in the WiZ app, where required by the device/app configuration.
- A stable local address for the device is recommended while the current single-device test implementation uses a fixed target.

Do not configure router port forwarding or expose the device to the public internet for this plugin. The tested implementation communicates with the device over the local network.

## Installation for development

1. Open SignalRGB's Device Information page.
2. Use the **Plugins** button to open the custom plugins folder.
3. Place the plugin's `.js` and corresponding `.qml` files in the appropriate custom plugin location.
4. Restart SignalRGB so it reloads the plugin.
5. Open the WIZ interface/device in SignalRGB and inspect its console logs.

SignalRGB's official instructions for overriding a plugin are available at <https://docs.signalrgb.com/troubleshooting/advanced-troubleshooting/replacing-plugin/>.

## First-run settings

The current development implementation has an **Automatically Start Stream** setting. Enable it, and also enable streaming for the Neo device in SignalRGB. The setting gates the `Render()` loop; enabling only the device's stream toggle is not sufficient in this development build.

The current implementation is pinned to one test device. Before using it on another device, the temporary target configuration in `WIZ.js` must be replaced with a proper discovery/configuration mechanism. Do not publish a copy containing a personal device's MAC address or local IP address.

## Known limitations

- Single-device test target; IP address and MAC are currently pinned in development code.
- General broadcast/multicast discovery is not yet implemented or validated for this Neo.
- Multi-device operation, duplicate-device handling, and device removal/reconnection are not yet validated.
- Only RGB colour and dimming have been verified. White colour temperature, tunable-white behaviour, scenes, and groups are not verified.
- The initial streaming cap is 10 updates per second. Smoothness and latency have not been benchmarked systematically.
- Shutdown restoration / returning the bulb to an independent control mode has not been verified.
- SignalRGB logs a non-blocking `DeviceType(): property isn't callable. Expected Function.` warning. The device still initializes and controls the bulb, but the warning's cause has not yet been established.

## Repository workflow

See [Branching and release workflow](BRANCHING.md). Keep the branch model minimal: `main` plus `test/Register-Neo` during current development. Merge the tested working branch into `main`, then delete it; do not maintain an archive of one-off diagnostic branches.

## Security and privacy notes

- Keep WiZ traffic on the trusted local network.
- Do not add router port-forwarding rules for the device.
- Treat MAC addresses, private IP addresses, home IDs, and room IDs as local device/network identifiers. Use placeholders in issues, screenshots, and public documentation.
- A MAC address is an identifier, not cryptographic authentication. Source-IP/port checks and MAC comparisons help reject unrelated packets but do not provide cryptographic device authentication.

## License

Retain the repository's existing `LICENSE` and upstream attribution. Do not change licensing terms without confirming the original source's license and the project's contribution rights.
