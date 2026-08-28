# Mobile-Friendly V2

Target branch: `mobile-friendly-v2`.

## Implemented
- Responsive viewport and safe-area/notch handling.
- Touch-only mobile HUD with movement joystick and right-side look gesture.
- FIRE, JUMP, DASH and BOOST controls.
- Touch scoreboard button.
- Multi-touch pointer tracking with independent pointer IDs.
- Pointer capture and release cleanup.
- Blur/background reset to prevent stuck controls.
- Browser gesture/scroll suppression on the game surface.
- Portrait orientation warning and landscape recommendation.
- Touch controls feed the existing `InputManager`/`InputState` path rather than a separate gameplay authority.
- Desktop keyboard/mouse input path remains unchanged.

## Validation
Automated source validation and real-device validation are separate. GitHub source inspection can verify the implementation, but physical iOS/Android touch behavior and live multiplayer combat still require a deployed browser session. Do not merge until those checks are performed and recorded.
