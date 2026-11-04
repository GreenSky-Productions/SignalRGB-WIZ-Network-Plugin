# Architecture and lifecycle

## Current data path

```text
SignalRGB discovery service
    |
    | UDP registration request
    v
WiZ device: UDP 38899
    |
    | registration response
    v
Discovery callback validates sender and MAC
    |
    | getSystemConfig request/response
    v
Controller object created or updated
    |
    | service.updateController / announceController
    v
SignalRGB device component
    |
    | Initialize(): create separate UDP control socket
    v
Render(): read LED 0 colour and brightness
    |
    | change detection + 100 ms rate limit
    v
UDP setPilot datagram to device:38899
```

## Socket separation

The discovery service and device component operate in separate SignalRGB component contexts. The discovery socket is therefore not assumed to be available inside the device component. The tested implementation uses:

| Purpose | Local UDP port | Remote endpoint |
|---|---:|---|
| Discovery and configuration | `38900` | tested device on `38899` |
| Device control and response handling | `38901` | tested device on `38899` |

The separate control socket is created and bound inside the device component's `Initialize()` function. It is closed in `Shutdown()`.

## Discovery lifecycle

1. The discovery service creates a UDP socket and binds its discovery port.
2. It sends a WiZ `registration` request to the configured test device.
3. The response handler checks the UDP sender, parses the JSON payload, checks `result.success`, and compares the returned MAC with the expected device MAC.
4. After successful registration, it sends `getSystemConfig` once.
5. The configuration response is checked for the expected MAC and required hardware identity fields.
6. A `WIZDevice` controller object is created or updated, populated with the configuration, and announced to SignalRGB.

## Device-component lifecycle

1. `Initialize()` creates the one-LED device component and a separate UDP control socket.
2. `Render()` exits unless `AutoStartStream` is enabled.
3. The current LED colour is read from `device.color(0, 0)`, or from `forcedColor` when `forceColor` is enabled.
4. The frame is normalized to integer RGB and dimming values.
5. Frames identical to the last successfully submitted frame are skipped.
6. A new frame is submitted only when at least 100 ms have elapsed since the previous submission.
7. `Shutdown()` closes the component's control socket.

## Scope of the current implementation

The implementation is currently a single-device test build. The IP address and expected MAC are fixed in the source. This is not general network discovery. Multi-device lifecycle, dynamic device configuration, reconnection, and device removal require separate implementation and testing.
