# FPS Soccer

Offline-first, first-person 3D football game foundation for Android and the web. The project uses Three.js for 3D rendering, Rapier for ball rigid-body physics, TypeScript/Vite for the application, and Capacitor for Android packaging.

> **Development status: early playable engineering build — not a finished commercial football simulator.** The match scene, input loop, 22 procedural player actors, ball rigid-body, basic AI, club screens, transfers, training, tactics, local career persistence, and CI workflow are implemented. Full competition simulation, the complete Laws of the Game, rigged character animation, and a verified Android release remain unfinished. See [BUILDING.md](BUILDING.md) for verification limitations and build instructions.

## Current implementation

- Three.js/WebGL 3D pitch, goals, line markings, stadium stands, instanced procedural crowd, lighting and advertising boards.
- 22 original procedural humanoid player models with team kits, squad numbers, skin-material variants, and procedural run/idle limb motion.
- First-person camera attached to the selected player's position, pointer look, camera smoothing, head/torso hiding, and touch/keyboard movement.
- In-match player switching and optional nearest-player automatic switching.
- Rapier rigid-body football with gravity, rolling friction, bounce, spin impulses, post/crossbar/net-area colliders, and goal/out-of-bounds detection.
- Basic team AI for formation movement, pressing, support runs, passing, and shots.
- Match clock, two halves, half-time pause, score HUD, goal events, match result, sprint stamina, and mobile action controls.
- Club dashboard, 23-player starting squad, formation and tactical-style selection, captain selection, manager choices, a generated transfer market, buying/selling, individual training, finances, and league-points calculation.
- Versioned IndexedDB career save with a localStorage fallback and migration/validation path.
- Web Audio-generated crowd ambience and simple synthesized match/menu effects. No external audio URL is required.
- Capacitor Android configuration for landscape, immersive system UI, and keep-screen-on behavior.
- GitHub Actions workflow for linting, type checks, domain tests, web build, debug APK, and optional tag-based signed APK.

## Start locally

Requirements: Node.js 22.12+ (22.16 is used in CI), npm, and network access to the npm registry for the first dependency install.

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run dev
```

Vite prints the local development URL. Use a modern browser with WebGL 2 support. The game is designed for landscape mobile play; browser touch controls are also available.

## Android

See [BUILDING.md](BUILDING.md). Capacitor generates the Android project during the first Android setup. The debug APK is expected at `android/app/build/outputs/apk/debug/app-debug.apk` after a successful Gradle build.

## Main folders

```text
src/
  app/                 Screens, navigation, mobile controls and application flow
  data/                Generated player data and attribute models
  game/
    ai/                Match decision and movement logic
    audio/             Procedural Web Audio sound layer
    entities/          Procedural player actors
    match/             Formation layouts
    physics/           Rapier rigid-body world
    stadium/           Procedural 3D pitch and stadium
  management/          Club, transfers, training, tactics and league points
  persistence/         IndexedDB save/load and fallback
  shared/              Domain types and defaults
  styles.css           Responsive mobile UI and match HUD
native/android/        Custom Capacitor Android activity
scripts/               Source hygiene and Android post-generation configuration
 tests/                 Domain test cases
.github/workflows/      GitHub Actions pipeline
```

## Known gaps before calling this release-ready

- Player meshes are procedural, not rigged GLB characters. There is no `GLTFLoader`/`AnimationMixer` animation library yet; locomotion is procedural limb motion.
- The ball uses Rapier rigid-body impulses, but ball handling, curve shots, keeper saves, player-body physical response, and contact resolution need further tuning and device playtesting.
- AI is a basic formation/press/pass/shoot system, not a complete tactical planner or 22-agent decision model.
- Offside, fouls, cards, penalties, throw-ins, corners, free kicks, goal kicks, substitutions, and referee decisions are not fully implemented. The current out-of-bounds handling resets play at midfield.
- The career layer does not yet simulate all other clubs' fixtures, transfer behavior, promotion/relegation, complete contracts, scouting discoveries, injury schedules, or multiple save slots.
- The manager bonus model and player potential need deeper progression balancing.
- Sound is synthesized at runtime; no crowd recording, referee recording, or licensed audio pack is bundled.
- Only one default local career slot is exposed in the UI.
- The current CI generates an Android platform project. A checked-in Gradle wrapper and `package-lock.json` are not included yet. Run npm install in a networked environment and commit the generated lockfile before treating builds as fully reproducible.
- The project has not yet passed a real npm/Vite/Gradle build or on-device Galaxy A06 performance test in this environment.

The limitations above are explicit so that a feature is not mistaken for a completed simulation system.
