# Last Signal

A fast top-down arcade battle royale for the browser. Sixteen combatants drop onto a
compact island; part-way through the match a **Signal Core** appears. Whoever carries it
gets a power — and gets their approximate position broadcast to everyone else every 18
seconds.

> It is a fast top-down battle royale where a powerful Signal appears during the match.
> Whoever carries it gets an ability, but everyone can hunt them.

A player who ignores all of that still has a complete game: **move, shoot, stay in the
circle, survive.** There is no countdown - clicking PLAY drops you straight in, already
holding a PX-9 sidearm and a spare magazine, so the first fight can happen immediately.
Looting is still how you get a *real* gun, armor and heals.

**Your shots kill in one hit.** Any round you land eliminates its target outright,
straight through shield and armor - landing the shot is the whole skill. Damage coming
*at* you is untouched by this, so positioning still matters. It is one flag,
`COMBAT.playerOneShotKills` in `config/GameConfig.ts`; set it to `false` for a
conventional time-to-kill and nothing else in the damage pipeline changes.

Built with **TypeScript + Phaser 3 + Vite**. No image or audio files ship with the game —
every texture is generated procedurally at boot and every sound is synthesised with
WebAudio, so the build is small, self-contained and works offline once loaded.

## Running it

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
npm run typecheck  # tsc --noEmit
```

The build uses a relative `base`, so `dist/` can be dropped onto any static host
(including sandboxed embeds such as YouTube Playables) without further configuration.

## How to play

A seven page **HOW TO PLAY** screen (`scenes/TutorialScene.ts`) covers the goal, the
controls, the opening minute, the circle, both win conditions, the Signal Core and the
level system. It shows itself once on a player's first ever launch and after that lives
behind a button on the menu, so it never gets in the way of a replay.

Every number it quotes - how many shrink phases, the warning lead, zone damage, the
survivor count that opens the Final Signal, the capture time, when the core spawns - is
read back out of `config/` at runtime rather than typed into the copy, so retuning the
game cannot leave the tutorial lying. The lethality page even swaps its wording based on
`COMBAT.playerOneShotKills`. The controls page reads `device.input.touch` and describes
sticks and on-screen buttons instead of the keyboard.

It is deliberately the *only* place the game explains itself in prose. Everything else is
still contextual and never pauses play (`systems/TutorialSystem.ts`) - but the Final
Signal capture in particular cannot be discovered reliably by just playing, which is what
this screen is for.

## Levels

Win a match - be the last one standing, or hold the Final Signal - and you advance a
level. Lose and you stay put, so the run only ever moves forward.

| | |
| --- | --- |
| Where you see it | `LEVEL N` on the menu above PLAY, announced at the drop, and in the results header |
| On a win | `LEVEL N COMPLETE` -> **NEXT LEVEL N+1** starts the next match straight away |
| On a loss | `ELIMINATED` -> **RETRY LEVEL** replays the same level |
| What changes | The bot lobby hardens: mostly rookies at level 1, mostly veterans by level 10 |
| Where it lives | `level` / `bestLevel` in `utils/Storage.ts`, persisted to `localStorage` |

The difficulty curve is purely the skill mix (`SpawnSystem.skillWeightsForLevel`). Bot
count, map size, weapons and zone timings are identical at every level, so a level is a
measure of how far you have got, not a different game.

## Controls

**Desktop**

| Input | Action |
| --- | --- |
| `WASD` / arrows | Move |
| Mouse | Aim |
| Left click | Fire |
| `Space` | Signal ability |
| `R` | Reload |
| `E` | Pick up / swap |
| `Q` | Use healing item |
| `1` / `2` / `3` | Primary / secondary / melee |
| `Tab` | Loadout panel |
| `Esc` | Pause |
| `F1` | Debug overlay |

**Touch** — controls appear automatically on touch devices: a floating movement stick on
the left, an aim stick on the right, plus FIRE / R / HEAL / SWAP. The SIGNAL and PICK UP
buttons only appear when they would actually do something.

Touch input also gets light aim help (`systems/AimAssist.ts`): a slightly wider hit
tolerance, a slower aim sweep while crossing a target, and a capped few-degrees-per-second
nudge toward an enemy that is already nearly lined up. It never tracks a target, and
desktop gets none of it.

Append `?debug=1` to the URL to start with the debug overlay enabled.

## The Signal loop

| Beat | What happens |
| --- | --- |
| 60–90s | `SIGNAL DETECTED` — the core spawns in the open, inside the circle, marked on the minimap. |
| On pickup | The holder gets this match's single ability, shown as `DASH` / `SPACE — ACTIVATE`. |
| Every 18s | `SIGNAL HOLDER DETECTED` — a fuzzy circle appears on everyone's minimap for 4 seconds. Bots within 1500 units converge on it. |
| On holder death | The core drops where they fell. It never disappears. |
| 3 survivors left | `FINAL SIGNAL` — a capture point activates. Hold it alone for 20 seconds, or just kill everyone. |

Abilities (one per match, drawn at random): **Dash**, **Shield**, **Scan**, **Sprint**,
**Blink**. There is exactly one ability slot and one button — no loadouts, no trees.

## Weapon identities

Weapons differ in how they play, not just in their damage number. All of it lives in
`config/WeaponConfig.ts` rather than being special-cased in combat code.

| Weapon | Identity |
| --- | --- |
| PX-9 | Fast movement, fastest weapon swap |
| SC-11 | Best sustained close-range while moving |
| AR-27 | The versatile default |
| BR-3 | Three-round burst, tight grouping |
| SG-12 | One shell takes a wooden door off its hinges |
| LR-50 | Very accurate, and punches through one thin wooden object |
| MG-88 | Huge magazine, chews cover, noticeably slower |

## Other systems

**Destructible cover.** Wooden doors, fences, crates and barricades have hit points and
show progressive damage (clean → cracked → splintered → gone). Concrete walls, rocks and
building structure never break. Every building keeps one clear entrance so a breach is a
tactical shortcut rather than a requirement. Destruction updates the physics bodies, the
bullet raycast hash *and* the navigation grid, so bots immediately path through the hole.

**Noise.** Footsteps, reloads, breaches and gunfire each carry a radius. Bots get a fuzzy
point to investigate, never a position; the player gets a single directional cue for the
loudest thing in earshot, which fades in about a second.

**Match director.** Rolls each match's variant — zone pattern, loot profile, and up to two
short world events (`FOG ROLLING IN`, `RADAR PULSE`, `SUPPLY DROP INBOUND`). One event at a
time, never in the opening minute.

**Zone variants.** Standard shrinking circle by default. After three matches, moving and
split circles become possible. The danger area is a world-sized wash with the safe circles
punched out by an inverted mask, which works for one circle or two with no special cases.

**Performance.** Phaser submits every object on the display list to the renderer each
frame - it has no built-in bounds culling - so a map of ~2300 ground tiles, decals and
props cost 2300 transform-and-batch operations per frame regardless of what was on screen.
`systems/SceneCuller.ts` buckets static scenery by grid cell and toggles visibility as the
camera moves, touching only the cells that enter or leave view. That took a match from 15
to 60 fps in a software-rendered browser. The same reasoning shapes the map renderer:
large `TileSprite`s allocate a canvas the size of their display area, and a map-wide
`Graphics` re-emits its whole command buffer every frame, so neither is used for scenery.

**Readable damage.** Taking a hit flashes the screen edges rather than washing out the
middle, with a directional arrow for where it came from. Armor reads as `ARMOR II 37%` -
the tier and how much is left, never the mitigation maths.

**Onboarding through design, not text.** No tutorial screen and nothing ever pauses. A
single contextual line appears when a mechanic first becomes relevant (`R — RELOAD` on an
empty magazine, `GET INSIDE THE SAFE ZONE` when the circle moves). For the first two
matches, bots near your drop react slowly and a starter weapon is placed within sight.

## Project layout

```
src/
  main.ts                 Bootstrap, scale + renderer config
  config/                 Tuning values only, no logic
    GameConfig.ts         World, camera, match, zone, armor, scoring, perf
    WeaponConfig.ts       Weapon stats, utility identity, rarity, ammo
    LootConfig.ts         Loot tables, spawn weights, loot profiles
    BotConfig.ts          Bot skill profiles and AI tuning
    SignalConfig.ts       Ability definitions and Signal timings
    EventConfig.ts        Match events, zone variants, onboarding
  scenes/                 BootScene, MenuScene, TutorialScene, GameScene, UIScene,
                          ResultScene
  entities/               Combatant (base), Player, Bot, Bullet, Weapon,
                          Inventory, LootItem, SignalCore
  systems/                CombatSystem, LootSystem, ZoneSystem, SpawnSystem,
                          BotAISystem, CollisionSystem, NoiseSystem,
                          SignalSystem, MatchDirector, TutorialSystem, AimAssist,
                          ParticleSystem, AudioSystem, InputSystem, MatchContext
  map/                    MapGenerator, MapRenderer, Building, CoverObject,
                          NavGrid, MapData
  graphics/               TextureFactory (all runtime art), GraphicsUtils
  ui/                     HUD, Minimap, KillFeed, Crosshair, InventoryUI,
                          Announcer, TouchControls, DebugOverlay
  utils/                  Constants, MathUtils, RandomUtils, Storage
```

## How the pieces fit together

**MatchContext** (`systems/MatchContext.ts`) is the seam that holds the codebase together:
a plain interface bundling the map, RNG, event bus, every system and the combatant list.
Entities and systems talk to each other only through it, never through `GameScene`. That
keeps the door open for server-authoritative multiplayer: a networked build can supply its
own `MatchContext` without touching entity, weapon, AI or Signal code.

**Determinism.** Every match is driven by a single seed. Map generation, loot, spawns, bot
personalities, the match variant and the Signal ability all derive from seeded `Rng`
instances, so a seed reproduces the same match.

**Collision** has two representations built from the same map data: arcade static bodies
for movement, and a spatial hash of raw shapes for bullet raycasts, line-of-sight and AI
cover queries. Bullets are swept manually against that hash because a sniper round at 2400
units/second tunnels straight through a 16-unit wall between physics steps.

**Navigation.** Bots path on a 25-unit walkability grid using A* with reusable typed-array
scratch buffers, so a solve allocates nothing. Solves are budgeted per frame and short hops
with a clear line skip the solver entirely.

**Bot AI** is a state machine — Idle, Explore, Loot, MoveToZone, SearchEnemy, Attack,
TakeCover, Heal, Flee — thinking at ~7 Hz while steering, aiming and trigger control run
every frame. Perception is deliberately imperfect: field of view, a per-tick notice roll,
reaction delay, aim error that grows with range, and a memory that decays. Bots hunt the
Signal, use its ability the way a player would, and fight each other, not just you.

**Pacing.** Sixteen combatants on a compact map will wipe each other out in under a minute
if left alone, so spawns are placed on a jittered 4×4 grid (random points clump), bots
spend an opening phase looting rather than engaging distant targets, and they regularly
hold an area instead of roaming continuously. Bots also start unarmed
(`MATCH.botsStartArmed`) and have to find a gun, which is what keeps the opening minute
survivable now that the player drops in already holding one.

## Deliberate constraints

* No React or DOM UI in the gameplay loop; menus and HUD are Phaser scenes.
* Strict TypeScript, no `any` in gameplay code.
* Config values live in `config/`, never inline in systems.
* Object pools for bullets, particles and floating text; AI decisions are rate limited.
* No crafting, attachments, backpacks, hunger, skill trees or grid inventories.
* No copyrighted assets. All art and audio are generated at runtime and original.

## Not implemented (architecture leaves room for it)

Online multiplayer, squads, grenades, attachments, skins, missions, ranks, seasons,
leaderboards, spectating and alternate modes. Match state sits behind `MatchContext` and is
driven by seeds specifically so those can be added without a rewrite.
