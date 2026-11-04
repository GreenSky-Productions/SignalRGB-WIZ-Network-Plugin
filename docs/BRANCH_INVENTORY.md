# Neo branch inventory

Snapshot source: user-provided GitHub **Your branches** screenshot, 2026-11-05.

The user confirmed `test/Register-Neo` as the latest branch and the source of the physically verified Neo implementation. The desired repository policy is minimal: keep `main` and this one working branch during development, then merge and delete the working branch so only `main` remains.

## Branches visible in the screenshot

| Branch | Relative update shown | Disposition |
|---|---:|---|
| `test/Register-Neo` | 12 minutes ago | **Keep.** Current source of truth. |
| `test-implement-single-UDP-socket-dis…` | 39 minutes ago | Compare once, then delete if its useful work is already represented. Exact name is truncated. |
| `test/neo-default-udp-import` | 1 hour ago | Compare once, then delete if redundant. |
| `test/neo-udp-send-probe` | 1 hour ago | Compare once, then delete if redundant. |
| `test/neo-response-diagnostics` | 2 hours ago | Compare once, then delete if findings are recorded and redundant. |
| `test/neo-unicast-probe` | 2 hours ago | Compare once, then delete if redundant. |
| `test/neo-same-port-listener` | 2 hours ago | Compare once, then delete if redundant. |
| `test/udp-socket-probe` | 3 hours ago | Compare once, then delete if redundant. |
| `test/neo-directed-broadcast` | 4 hours ago | Compare once, then delete if redundant. |

Relative update times are copied from the screenshot and are not durable metadata. The screenshot may not show every branch in the repository.

## Cleanup procedure

1. Keep `main` and `test/Register-Neo`.
2. Confirm the full name of the truncated branch.
3. Compare each other visible branch against `test/Register-Neo` for unique commits and file changes.
4. Bring any genuinely useful unique code into `test/Register-Neo`; record useful diagnostic findings in `docs/PROTOCOL.md` or `docs/TESTING.md`.
5. Delete the redundant diagnostic branches. Do not create archive branches.
6. When Neo support is ready, open a pull request from `test/Register-Neo` into `main`. After merge, delete `test/Register-Neo` so only `main` remains.

No remote branch has been deleted or modified as part of this documentation update. The inventory reflects the screenshot, not a live Git graph comparison.
