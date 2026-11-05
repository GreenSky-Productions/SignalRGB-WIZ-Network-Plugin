# SignalRGB WiZ Network Plugin — WiZ Neo support

A small personal extension of the SignalRGB WiZ Network Plugin that lets SignalRGB control a Philips WiZ Neo RGB bulb over the local network.

## What

- Discovers WiZ devices on the local network using UDP broadcast, validates their identity and creates one single-LED SignalRGB device per discovered controller.
- Sends SignalRGB RGB colour and brightness to each device using the WiZ local `setPilot` command. Each device is represented by one logical LED.
- Also probes previously discovered devices directly and updates their IP address when a later discovery scan finds them at a new address. No individual IP or MAC address is stored in the code.
- The plugin's service panel shows the search indicator when no controllers have been found, then lists each discovered device's model, ID (MAC), room ID, IP address and firmware version.

## Why

The existing plugin did not work with my WiZ Neo. This repository contains the fix I needed, shared as-is in case it is useful to someone else.

## How

**Requirements:** SignalRGB with add-on support, and a WiZ bulb on the same 2.4 GHz network as the PC with local control enabled in the WiZ app. Local UDP communication must be allowed on the network.

**Install:**
1. In SignalRGB, open the add-on interface and add this repository's URL: `https://github.com/DukeShank/SignalRGB-WIZ-Network-Plugin`.
2. Select the branch containing this work (currently `test/Register-Neo`).
3. Install the add-on and restart SignalRGB if prompted.
4. Turn on **Automatically Start Stream** in the plugin settings, and enable streaming for the bulb's device.

**How it works:** the plugin broadcasts a registration request to UDP port 38899, validates the responding device's MAC address, then requests its model and firmware information with `getSystemConfig`. Each scan also sends direct probes to the last known IP addresses of discovered devices. The first five scans run at approximately 5-second intervals; after that, scans repeat every 15 seconds while no devices are known, or every 60 seconds once at least one controller has been discovered. This is how address changes and device availability are detected.

The device component sends RGB colour and dimming through `setPilot`. **Max Updates Per Second** defaults to 10 and can be set from 1 to 30 while streaming. It acts as a transmission-rate limit checked on SignalRGB's approximately 30 FPS render calls. A value of 30 removes the interval limit, allowing changed frames to be sent on every available render call; lower settings limit how often frames are sent. The actual rate depends on the render cadence. Unchanged frames are suppressed, then re-sent every 2 seconds in case a UDP packet was lost. Brightness is clamped to 10–100%; an incoming black frame uses the configured dimmed colour and minimum brightness instead.

**Settings:**
- **Automatically Start Stream** (default off): enables continuous frame streaming.
- **Max Updates Per Second** (default 10, range 1–30): limits the frame transmission rate.
- **Force Color** (default off): uses **Forced Color** instead of the colour supplied by SignalRGB.
- **Forced Color** (default `#009bde`): colour used when **Force Color** is enabled.
- **Default Color when dimmed** (default `#010101`): colour substituted when the incoming SignalRGB frame is black.
- **Minimal Brightness** (default 10%, range 10–100%): brightness used with the dimmed colour. The current SignalRGB setting label is misspelled as “Minimal Brightniss”.

## Status

Tested on one bulb: Philips WiZ Neo `ESP25_SHRGB_01`, firmware 1.38.0, SignalRGB 2.5.84, Windows 11. Discovery, device creation, RGB colour, dimming and continuous updates worked.

The current plugin version is 1.2.3. The device library also contains mappings for `ESP03_SHRGB3_01ABI` (WRGB LED Strip) and `127372` (W100 WRGB Light Bulb). These are model mappings only; they have not been tested here. Other models may be discovered and announced generically, but that does not establish compatibility.

The current revision includes IP-change handling, direct probes of known devices, the 2-second refresh, the 10% dimming floor, control-socket re-creation after repeated write failures and the **Max Updates Per Second** setting.

**Known limitations**
- Only RGB colour and dimming are sent. White temperature, scenes and groups are not supported by the current control path.
- Discovery starts with UDP broadcast and also probes known IP addresses directly. It may fail on networks with client isolation or VLANs, or on PCs with several network adapters. There is no manual IP entry.
- A device that has not answered discovery for 3 minutes is marked stale and logged, but it is not automatically removed from the controller list. The service panel does not show a separate online/offline indicator.
- Multiple bulbs, and device removal or reconnection, have not been tested.
- The bulb is not restored to a previous state when SignalRGB shuts down; the plugin does not send a restore or off command.
- SignalRGB may log `DeviceType(): property isn't callable`. Its cause and impact are unknown.

## Disclaimer

This is a personal project with a fixed scope, not a maintained product.

- No support, updates, or compatibility guarantees for future SignalRGB, Windows, or WiZ firmware versions. Issues and pull requests may go unanswered.
- Only the device above has been tested. Other WiZ models may not work.
- Use at your own risk. You are responsible for testing any changes you make.
- WiZ is a trademark of Signify Holding. This project is not affiliated with or endorsed by Signify or SignalRGB. The logo is used only to identify the device.
- Keep traffic on your local network. Do not port-forward the bulb to the internet.
- Do not post your MAC addresses, IP addresses, or home/room IDs in issues or screenshots.

Keep the repository's `LICENSE` and the upstream attribution when reusing the code.
