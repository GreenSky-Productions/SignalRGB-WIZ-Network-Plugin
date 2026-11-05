# SignalRGB WiZ Network Plugin — WiZ Neo support

A small personal extension of the SignalRGB WiZ Network Plugin that lets SignalRGB control a Philips WiZ Neo RGB bulb over the local network.

## What

- Finds WiZ bulbs on the local network by UDP broadcast and creates one single-LED SignalRGB device per bulb.
- Sends SignalRGB colour and brightness to the bulb continuously using the WiZ local `setPilot` command.
- Follows the bulb if its IP address changes. No IP or MAC address is stored in the code.

## Why

The existing plugin did not work with my WiZ Neo. This repository contains the fix I needed, shared as-is in case it is useful to someone else.

## How

**Requirements:** SignalRGB with add-on support, and a WiZ bulb on the same 2.4 GHz network as the PC with local control enabled in the WiZ app.

**Install:**
1. In SignalRGB, open the add-on interface and add this repository's URL: `https://github.com/DukeShank/SignalRGB-WIZ-Network-Plugin`.
2. Select the branch containing this work (currently `test/Register-Neo`).
3. Install the add-on and restart SignalRGB if prompted.
4. Turn on **Automatically Start Stream** in the plugin settings, and enable streaming for the bulb's device.

**How it works:** the plugin broadcasts a registration request to UDP port 38899, confirms each bulb's MAC and model with `getSystemConfig`, then sends `setPilot` (RGB and dimming) to it. The send rate is set by **Max Updates Per Second** in the plugin settings (default 10, range 1–30). It can be changed while streaming. SignalRGB renders about 30 frames per second, so 30 sends every frame, and other values are rounded to a multiple of the frame period. Unchanged colours are re-sent every 2 seconds in case a UDP packet was lost. Scans repeat every 5–60 seconds, which is how address changes are noticed.

## Status

Tested on one bulb: Philips WiZ Neo `ESP25_SHRGB_01`, firmware 1.38.0, SignalRGB 2.5.84, Windows 11. Discovery, device creation, RGB colour, dimming and continuous updates worked.

The latest revision (following IP changes, direct probes of known bulbs, the 2-second refresh, the 10% dimming floor, socket re-creation after repeated failures, the Max Updates Per Second setting) was only checked in a simulation, not on the bulb.

**Known limitations**
- Only RGB colour and dimming are supported. White temperature, scenes and groups are not.
- Discovery uses UDP broadcast. It may fail on networks with client isolation or VLANs, or on PCs with several network adapters. There is no manual IP entry.
- Multiple bulbs, and bulb removal or reconnection, have not been tested.
- The bulb is not restored to a previous state when SignalRGB shuts down.
- SignalRGB logs a harmless `DeviceType(): property isn't callable` warning. Its cause is unknown.

## Disclaimer

This is a personal project with a fixed scope, not a maintained product.

- No support, updates, or compatibility guarantees for future SignalRGB, Windows, or WiZ firmware versions. Issues and pull requests may go unanswered.
- Only the device above has been tested. Other WiZ models may not work.
- Use at your own risk. You are responsible for testing any changes you make.
- WiZ is a trademark of Signify Holding. This project is not affiliated with or endorsed by Signify or SignalRGB. The logo is used only to identify the device.
- Keep traffic on your local network. Do not port-forward the bulb to the internet.
- Do not post your MAC addresses, IP addresses, or home/room IDs in issues or screenshots.

Keep the repository's `LICENSE` and the upstream attribution when reusing the code.
