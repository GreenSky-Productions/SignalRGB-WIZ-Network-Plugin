# Changelog

Notable changes to this project are recorded here. This is an engineering changelog, not a promise that every entry has shipped in a public release.

## Unreleased — Neo development

### Added
- Registration and `getSystemConfig` handling for the tested `ESP25_SHRGB_01` WiZ Neo RGB bulb.
- SignalRGB controller creation and announcement using the device's verified MAC address as its controller identifier.
- A separate UDP control socket in the device component, isolated from the discovery-service socket.
- `setPilot` RGB/dimming command handling.
- Continuous SignalRGB frame updates with duplicate-frame suppression and a 100 ms minimum send interval.

### Verified
- Registration response and system configuration received from one Neo bulb.
- Controller appears in SignalRGB and the device component initializes.
- One-shot red command at 10% dimming receives a successful response and visibly changes the bulb.
- Continuous SignalRGB colour changes visibly affect the bulb.

### Not yet included / not yet verified
- General discovery for arbitrary WiZ devices.
- Multi-device support and discovery/removal lifecycle.
- White colour-temperature control, groups, scenes, and shutdown restoration.
- Performance tuning above the current 10 updates/second cap.
