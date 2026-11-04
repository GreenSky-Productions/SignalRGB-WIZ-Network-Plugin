# WiZ local UDP protocol notes

These notes document the message shapes observed and successfully exercised with one WiZ Neo RGB bulb. They are not a complete specification of the WiZ protocol.

## Endpoint

The tested device accepted local UDP requests on port `38899`. Discovery and control used separate local sockets in the SignalRGB plugin. No router port forwarding was used or needed for the tests documented here.

## Registration request

Observed request shape:

```json
{
  "method": "registration",
  "params": {
    "phoneMac": "<client-mac>",
    "register": false,
    "phoneIp": "<client-ip>",
    "id": "1"
  }
}
```

Successful response shape observed:

```json
{
  "method": "registration",
  "env": "pro",
  "result": {
    "mac": "<device-mac>",
    "success": true
  }
}
```

The plugin checks `result.success` and compares the returned MAC against the expected device identity.

## System configuration request

```json
{
  "method": "getSystemConfig",
  "id": 1
}
```

The tested response included these fields under `result`:

- `mac`
- `homeId`
- `roomId`
- `rgn`
- `moduleName`
- `fwVersion`
- `groupId`
- `ping`
- `accUdpPropRate`

Field availability may vary by model or firmware. The current Neo path requires a matching `mac`, a string `moduleName`, and a string `fwVersion` before creating the controller.

## RGB control request

The following one-shot command was successfully acknowledged and visibly applied by the tested Neo:

```json
{
  "method": "setPilot",
  "params": {
    "r": 255,
    "g": 0,
    "b": 0,
    "dimming": 10,
    "speed": 100
  }
}
```

The bulb returned:

```json
{
  "method": "setPilot",
  "env": "pro",
  "result": {
    "success": true
  }
}
```

Continuous SignalRGB colour changes using the same `setPilot` shape were also visibly applied. The current implementation caps submissions at one update per 100 ms and suppresses unchanged frames.

## Response handling and trust boundary

The SignalRGB UDP wrapper supplies sender address, sender port, and payload data. The tested plugin checks the expected sender address and port before parsing the payload, then checks the response MAC for registration and configuration messages.

These checks are validation and filtering, not cryptographic authentication. A MAC address can be spoofed. Keep the device and computer on a trusted local network and do not expose the UDP service to the public internet.

## Not yet established

The work so far does not establish complete WiZ protocol semantics for white colour temperature, scenes, groups, power state, effects, device state queries, or all firmware variants. Do not infer support for those features from the RGB test.
