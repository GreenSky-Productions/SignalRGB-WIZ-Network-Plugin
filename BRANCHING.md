# Branching and release workflow

## Branch policy

Keep the branch model deliberately small. This is a single-maintainer plugin and does not need a permanent `develop` branch, a standing feature branch, or an archive of one-off diagnostic branches.

| Branch | Role | Rule |
|---|---|---|
| `main` | Stable baseline and default branch | Keep stable. Merge tested changes only. |
| `test/Register-Neo` | Current Neo development branch | Use as the sole working branch while the Neo implementation is being completed. Merge it into `main` when the release checklist passes, then delete it if no further work is pending. |

Do not create additional branches for routine documentation or small fixes. Use a short-lived branch only when a change genuinely needs isolation (for example, a risky protocol experiment). Delete that branch after its useful result has been integrated or intentionally discarded.

## Current source of truth

The user confirmed `test/Register-Neo` as the latest branch and the source of the implementation that has been physically tested against the Philips WiZ Neo RGB bulb.

Keep `main` and `test/Register-Neo` during the remaining development work. Do not create `feature/neo-support` solely to rename or duplicate the current branch. The current branch can be the source of a pull request directly into `main`.

## Consolidating the diagnostic branches

A GitHub **Your branches** screenshot supplied on 2026-11-05 showed the following branches:

- `test/Register-Neo` — current source of truth; keep.
- `test-implement-single-UDP-socket-dis…` — exact name truncated in screenshot.
- `test/neo-default-udp-import`
- `test/neo-udp-send-probe`
- `test/neo-response-diagnostics`
- `test/neo-unicast-probe`
- `test/neo-same-port-listener`
- `test/udp-socket-probe`
- `test/neo-directed-broadcast`

The screenshot is a point-in-time view and may not show branches outside the captured area. Before deleting the older branches, make one quick comparison against `test/Register-Neo`:

1. Confirm the exact full name of `test-implement-single-UDP-socket-dis…`.
2. For each old diagnostic branch, check whether it has commits or file changes absent from `test/Register-Neo`.
3. If a branch contains a useful unique change, bring that change into `test/Register-Neo` (or record the finding in the docs if it is only a diagnostic result).
4. Delete the old diagnostic branches once the useful work is represented and no open pull request depends on them.

There is no need to archive redundant branches. The current branch plus `main` are sufficient during development. After `test/Register-Neo` is merged and released, remove it so only `main` remains until the next isolated task is necessary.

## Pull request and merge criteria

Open a pull request from `test/Register-Neo` into `main` only when:

- [ ] The tested `WIZ.js` implementation is the version being reviewed.
- [ ] The README and technical documentation match that implementation.
- [ ] The JavaScript syntax check passes.
- [ ] The tested Neo completes registration and `getSystemConfig` validation.
- [ ] SignalRGB creates and announces the controller.
- [ ] The Neo component initializes.
- [ ] Continuous RGB updates are physically verified.
- [ ] The current limitations are clearly documented.
- [ ] No personal MAC address, private IP address, home ID, room ID, token, or other private configuration is committed.

After the pull request is merged, delete `test/Register-Neo` if there is no immediate follow-up work. Keep `main` as the sole long-lived branch.

## Commit message convention

Use concise imperative messages with a scope:

- `feat(neo): add Neo RGB controller support`
- `fix(discovery): validate WiZ response identity`
- `perf(stream): suppress duplicate setPilot frames`
- `docs: document verified Neo setup and limitations`
- `test(neo): record local UDP handshake results`

## Release rule

Do not describe the plugin as generally compatible with WiZ devices based only on the single Neo test. State exact tested model(s), firmware(s), SignalRGB version, and verified capabilities.
