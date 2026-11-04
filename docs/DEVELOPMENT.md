# Development notes

## Development principles

- Preserve the last physically verified implementation before making a behavioural change.
- Make one functional change per isolated experiment. Avoid accumulating permanent test branches; integrate useful results into `test/Register-Neo` and delete redundant experiment branches after comparison.
- Keep discovery and device-control transport separate unless SignalRGB runtime evidence demonstrates that sharing is supported.
- Validate UDP sender address/port and parse only bounded payloads before acting on responses.
- Never commit personal MAC addresses, private IP addresses, home IDs, or room IDs.
- Distinguish socket-send success, protocol acknowledgement, and visible device behaviour in logs and test reports.

## SignalRGB lifecycle

The plugin uses the standard SignalRGB plugin lifecycle exports, including `Type()`, `Initialize()`, `Render()`, and `Shutdown()`. SignalRGB's developer overview describes `Render()` as the per-frame path and `Shutdown()` as the cleanup path: <https://docs.signalrgb.com/developer/plugins/>.

The current tested code also has a separate discovery-service lifecycle. Do not assume variables or socket objects created in the discovery context are accessible in the device component context; the one-shot test demonstrated that the device component needed its own UDP socket.

## Current stream behaviour

- Canvas: one LED, read with `device.color(0, 0)`.
- Forced colour: `forceColor` selects `forcedColor` instead of the canvas colour.
- Black pixel: uses `dimmColor` at `minBrightniss`, following the legacy plugin's intent.
- Normal pixel: uses the SignalRGB device brightness.
- Protocol: WiZ `setPilot` with integer RGB, dimming, and speed fields.
- Rate limit: 100 ms minimum between submitted frames (10 Hz cap).
- De-duplication: identical consecutive frames are skipped.

These settings and semantics should be retained or deliberately changed with a corresponding test update.

## Local validation

Before committing a JavaScript change:

1. Run a syntax check compatible with the module format, for example `node --check` after saving the `.js` as an ES module or `node --check --input-type=module` when supported by the installed Node version.
2. Load the plugin in SignalRGB and inspect both discovery and device-component logs.
3. Verify a physical effect on the bulb. A successful socket write alone is not acceptance evidence.
4. Update `docs/TESTING.md` with the exact model, firmware, settings, and outcome.

## Known warning

A `DeviceType(): property isn't callable. Expected Function.` warning has appeared during plugin initialization. It has not prevented controller creation, component initialization, or RGB streaming in the tested environment. Its source remains unresolved; do not suppress or relabel it as fixed without a targeted investigation.
