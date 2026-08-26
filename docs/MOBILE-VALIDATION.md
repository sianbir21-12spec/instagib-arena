# Mobile-friendly validation

Target branch: `mobile-friendly`

Base: `Test_branch` at `d1e8ff279c16e95c45d25632e340f8d111a64b22`

## Implemented

- Touch movement joystick with analog dead-zone and pointer capture.
- Right-side touch-look with per-frame accumulated yaw/pitch.
- Fire, jump, dash, boost, and scoreboard touch actions.
- Multi-touch is supported because movement, aim, and action controls use separate pointer IDs.
- Touch actions feed the existing `InputState`; no mobile-only damage, movement, or fire path exists.
- Browser zoom/scroll interference is suppressed by viewport metadata and `touch-action: none` on gameplay controls.
- Safe-area padding and responsive control sizing are included.
- Portrait mode shows a landscape recommendation overlay.
- Visibility/blur resets release held mobile inputs.
- Mobile controls are injected only when a gameplay canvas exists.
- Desktop pointer-lock/mouse/keyboard input remains in the existing InputManager path.

## Automated validation

The repository CI workflow now triggers on `mobile-friendly` and runs:

1. `npm ci`
2. `npm run typecheck`
3. `npm run build`
4. `npm run lint`

As of the audit, GitHub reports no workflow runs for `mobile-friendly`, so a green CI result cannot be claimed from GitHub evidence yet.

## Live/device validation still required

The following require a real browser/device or a reachable deployment:

- 320 / 360 / 390 / 430 px viewport checks
- iOS Safari touch behavior
- Android Chrome touch behavior
- portrait/landscape rotation
- three-finger simultaneous movement + aim + fire
- real multiplayer combat using touch controls
- background/foreground reconnect behavior
- low-end mobile GPU frame rate
- production HTTPS/WSS behavior

No merge to `Test_branch` or `main` is authorized by this branch. The draft PR is validation-only.
