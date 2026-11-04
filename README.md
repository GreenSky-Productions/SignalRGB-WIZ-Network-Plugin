# SignalRGB WiZ Network Plugin — WiZ Neo integration

This repository contains a focused, single-maintainer extension of the SignalRGB WiZ Network Plugin. The work documented here is intended to add local-network RGB control for a Philips WiZ Neo bulb that was not working with the existing plugin implementation.

It is a personal project with a defined scope, not a community-maintained plugin or an ongoing development project.

> **Project status:** The integration has been verified against one Philips WiZ Neo RGB bulb (`ESP25_SHRGB_01`). Registration, controller creation, continuous RGB updates, brightness control, and the bulb's `setPilot` acknowledgement have been tested successfully. The implementation remains device-specific and is not a general compatibility claim for WiZ products.

## Purpose and maintenance expectations

The purpose of this repository is to complete and document the WiZ Neo integration for the original project use case. Once that work is finished, the repository is expected to remain available as-is rather than receive ongoing feature development or community maintenance.

In practical terms:

- There is no commitment to maintain compatibility with future SignalRGB, Windows, WiZ firmware, or networking changes.
- There is no promised issue triage, response time, user support, or pull-request review.
- Additional device models, protocol features, and feature requests are outside the scope of the project unless the maintainer independently decides to work on them.
- Issues and pull requests may be left unanswered or unmerged. Do not depend on this repository as a supported product or service.
- Anyone adapting the code for another device or environment is responsible for testing and maintaining their own changes.

The repository is public for transparency and reuse under its existing license; its public availability should not be interpreted as a commitment to operate a community project.

## Verified device and environment

| Device identifier | Firmware tested | Verified capability | Status |
|---|---:|---|---|
| `ESP25_SHRGB_01` | `1.38.0` | Registration, system configuration, controller registration, RGB colour and dimming via local UDP `setPilot`, continuous SignalRGB frame updates | Verified on one physical device |

The test environment used SignalRGB `2.5.84` on Windows 11. This records the environment used for validation; it is not a minimum-version or compatibility guarantee.

## What has been verified

- The Neo responds to the WiZ registration request.
- The plugin receives and validates `getSystemConfig`, including the device MAC and model identifier.
- SignalRGB creates and announces a controller for the device.
- The device component initializes as a one-LED device.
- A one-shot red command at 10% dimming was acknowledged by the bulb and visibly applied.
- Continuous RGB changes from SignalRGB were visibly applied.
- The stream loop suppresses duplicate frames and currently limits commands to one update every 100 ms (up to 10 updates per second).

These results describe the tested configuration only. See [Testing](docs/TESTING.md), [Architecture](docs/ARCHITECTURE.md), and [Protocol notes](docs/PROTOCOL.md) for implementation details and test limitations.

## Requirements

- SignalRGB with support for custom network plugins.
- A WiZ device on the same local network as the computer running SignalRGB.
- Local-network control enabled for the device, where required by its WiZ app or configuration.
- A stable local address for the device while using the current single-device implementation.

The tested implementation communicates over the local network. Do not configure router port forwarding or expose the bulb to the public internet for this plugin.

## Installation for development

1. Open SignalRGB's Device Information page.
2. Use the **Plugins** button to open the custom plugins folder.
3. Place the plugin's `.js` and corresponding `.qml` files in the appropriate custom plugin location.
4. Restart SignalRGB so it reloads the plugin.
5. Open the WIZ interface/device in SignalRGB and inspect its console logs.

SignalRGB's instructions for overriding a plugin are available at <https://docs.signalrgb.com/troubleshooting/advanced-troubleshooting/replacing-plugin/>.

## Current implementation notes

The current development implementation includes an **Automatically Start Stream** setting. Enable it, and also enable streaming for the Neo device in SignalRGB. The setting gates the `Render()` loop; enabling only the device's stream toggle is not sufficient in the tested implementation.

The current implementation is pinned to one test device. Before using it with another device, the temporary target configuration in `WIZ.js` must be replaced with a proper discovery and configuration mechanism. Do not publish a copy containing a personal device's MAC address or private IP address.

## Known limitations

- Single-device test target; IP address and MAC are pinned in the development code.
- General broadcast/multicast discovery has not been implemented or validated for this Neo.
- Multi-device operation, duplicate-device handling, and device removal/reconnection have not been validated.
- Only RGB colour and dimming have been verified. White colour temperature, tunable-white behaviour, scenes, and groups are not verified.
- The initial streaming cap is 10 updates per second. Smoothness and latency have not been benchmarked systematically.
- Shutdown restoration or returning the bulb to an independent control mode has not been verified.
- SignalRGB logs a non-blocking `DeviceType(): property isn't callable. Expected Function.` warning. The device still initializes and controls the bulb, but the warning's cause has not yet been established.

## Repository workflow

See [Branching and release workflow](BRANCHING.md). During the remaining work, keep only `main` and `test/Register-Neo`. Once the implementation and documentation are complete, merge the tested branch into `main` and delete the development branch. Do not retain an archive of one-off diagnostic branches.

## Security and privacy

- Keep WiZ traffic on the trusted local network.
- Do not add router port-forwarding rules for the device.
- Treat MAC addresses, private IP addresses, home IDs, and room IDs as local device/network identifiers. Use placeholders in issues, screenshots, and public documentation.
- A MAC address is an identifier, not cryptographic authentication. Source-IP/port checks and MAC comparisons help reject unrelated packets but do not provide cryptographic device authentication.

## License and attribution

Retain the repository's existing `LICENSE` and upstream attribution. Do not change licensing terms without confirming the original source's license and the project's rights to modify and redistribute the code.
