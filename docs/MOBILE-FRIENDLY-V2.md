# Mobile-Friendly V2

Target branch: `mobile-friendly-v2`

## Implemented foundation
- Mobile viewport and safe-area CSS.
- Pointer-event based multi-touch bridge with independent pointer IDs.
- Left-side joystick mapping to movement actions.
- Right-side drag mapping to camera look.
- Focus/background reset to prevent stuck inputs.
- Touch-action suppression for game surfaces.
- Responsive action-control sizing from small phones through tablets.
- Portrait orientation warning for narrow mobile screens.

## Important validation status
The GitHub integration can inspect and commit source but cannot emulate a physical iOS/Android device, browser compositor, touch hardware, or a live multiplayer session. Therefore device-level gameplay validation must be performed against a deployed build.

The branch must not be merged until typecheck, build, lint, device viewport checks, multi-touch gameplay, reconnect testing, and production deployment checks have evidence.
