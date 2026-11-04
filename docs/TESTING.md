# Test record and acceptance checklist

## Verified test environment

| Item | Recorded value |
|---|---|
| Operating system | Windows 11 |
| SignalRGB | `2.5.84` |
| WiZ device module | `ESP25_SHRGB_01` |
| Device firmware | `1.38.0` |
| Reported region | `eu` |
| Transport | Local UDP |
| Device UDP port | `38899` |
| Discovery socket local port | `38900` |
| Device-component control socket local port | `38901` |

Device-specific identifiers and local IP addresses are intentionally omitted from this document.

## Completed tests

| Test | Evidence | Result |
|---|---|---|
| Registration request/response | SignalRGB log showed registration success and matching device identity | Pass |
| System configuration | SignalRGB log showed model `ESP25_SHRGB_01`, firmware `1.38.0`, and region `eu` | Pass |
| Controller creation | Neo appeared in SignalRGB with the expected model and controller metadata | Pass |
| Device component initialization | Device console logged component initialization and one LED creation | Pass |
| Control socket bind | Device component bound local UDP port `38901` | Pass |
| One-shot RGB command | `setPilot` response returned `success: true`; bulb visibly changed to red at 10% dimming | Pass |
| Continuous frame updates | SignalRGB effect changed the physical bulb colour; response acknowledgement was logged | Pass |
| Duplicate-frame suppression / rate limit | Present in the tested implementation; no quantitative packet capture or performance benchmark recorded | Code present; measurement pending |

## Repeatable smoke test

1. Confirm the device and PC are on the same trusted local network.
2. Confirm local network control is enabled in the WiZ app if the product/app requires it.
3. Load the custom plugin and restart SignalRGB.
4. Confirm registration and `getSystemConfig` complete.
5. Confirm the Neo controller appears in SignalRGB.
6. Enable the device stream and the plugin's **Automatically Start Stream** setting.
7. Apply an effect with visibly changing RGB colours.
8. Confirm the bulb follows the effect and that the control socket reports successful `setPilot` responses.
9. Disable streaming and confirm the component socket closes without an unhandled exception.

## Not yet tested / acceptance criteria for future work

- [ ] Dynamic discovery without a hard-coded IP address or MAC address.
- [ ] At least two WiZ devices discovered and controlled simultaneously.
- [ ] Device address change / DHCP renewal / reconnection.
- [ ] Discovery retry and timeout behaviour when the bulb is offline.
- [ ] Device removal and re-announcement lifecycle.
- [ ] RGB values at black, very low levels, full brightness, and rapid transitions.
- [ ] White and tunable-white modes, if the device supports them.
- [ ] Scene/group semantics, if supported.
- [ ] Behaviour on SignalRGB exit, suspend, and device stream disable.
- [ ] Quantified latency, update rate, packet rate, and visual smoothness at different rate limits.
- [ ] Root cause and resolution of the non-blocking `DeviceType()` warning.

## Interpreting logs

A log line stating that a UDP datagram was submitted means the local socket accepted the send request; it does not by itself prove the bulb applied the command. For the verified `setPilot` test, both a `success: true` response and a visible physical colour change were observed.
