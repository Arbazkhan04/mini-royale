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

### Aiming on touch

Aiming a twin-stick shooter with a thumb is materially harder than with a mouse: the stick
is small, your hand covers the screen, and enemies arrive from outside a phone's narrow
view. So touch gets real help (`systems/AimAssist.ts`), in three escalating steps. Desktop
gets none of it - a mouse does not need it and the pull fights the hand.

| Where the enemy is | What happens |
| --- | --- |
| Crossing your aim | The sweep slows by up to 40%, so a thumb can settle on them |
| Within 15 deg | Aim is pulled hard toward them, ~200 deg/sec |
| 15-25 deg | The pull fades out to ~55 deg/sec |
| Past 25 deg | Nothing. You are aiming, not the game |
| **Holding FIRE, within 70 deg** | The gun swings onto them outright |

Holding FIRE is the important one: the search cone widens to 70 degrees and the gun is
swung onto the target rather than nudged toward it. That is the one place the assist
genuinely aims for you, and it is deliberate - pointing the stick in an enemy's general
direction and pulling the trigger should hit, because that is as precise as a thumb
usefully gets.

Every correction is a capped rate per second, so the player is always turning faster than
the assist and can always override it. A **soft lock** holds the chosen target for 400ms so
the aim cannot flicker between two enemies, and swinging 85 degrees away drops it at once -
the player always wins a disagreement. Targets are ranked by angle first with distance only
as a tie-break, which gives the order that reads correctly to a player: someone under the
crosshair beats someone beside it, and someone beside it beats someone merely close. Every
target needs line of sight, so the assist can never pull onto someone through a wall.

**Per weapon.** `aimAssist` in `config/WeaponConfig.ts` scales the whole thing, and the
assist only reaches as far as the weapon does - so a shotgun is forgiving at the range it
actually works at, and never beyond it.

| Weapon | Multiplier | Nudge cone | FIRE cone |
| --- | --- | --- | --- |
| LR-50 sniper | 0.15 | 3 deg | 10 deg |
| MG-88 | 0.85 | 21 deg | 59 deg |
| AR-27 / PX-9 | 1.0 | 25 deg | 70 deg |
| SC-11 SMG | 1.15 | 28 deg | 80 deg |
| Knife | 1.3 | 32 deg | 91 deg |
| SG-12 shotgun | 1.7 | 42 deg | 100 deg (capped) |

The cap exists so no weapon can ever swing onto someone standing behind you.

**Threat markers** (`ui/ThreatOverlay.ts`). A phone shows a fraction of the world, so an
enemy shooting you from behind is invisible and unanswerable. Off-screen enemies within 820
units get a red chevron on the screen edge pointing at them, sized and brightened by how
close they are. It requires line of sight, so it never reveals someone hiding behind a
wall - it only tells you about a fight you are already in. Anyone who has actually shot you
stays marked for 4 seconds even after breaking line of sight, because by then you know.
The same overlay draws a gold bracket around the soft-locked target: an assist that
silently decides where your shots go is confusing, one that shows its pick reads as help.

**The sticks.** Both are floating, not fixed. Touch anywhere on the left half and the
movement stick appears under your thumb; anywhere on the right and the aim stick does. The
aim direction is kept when you lift off, so the character never snaps back.

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

**Responsive buttons.** Every button in the game comes from `ui/Button.ts`, which exists
for two reasons. The first is a pressed state: Phaser handles input before it renders, so
painting the press inside the `pointerdown` handler puts a lit, sunken button on screen in
the same frame as the tap, before any scene handoff begins - without it a button that
starts a match looks dead for as long as the handoff takes. Touch has no hover state at
all, so there it is the only feedback a press ever gets.

The second is a Phaser trap worth knowing: a Container's hit area is **not** centred on the
container even though its children are. Phaser adds the object's `displayOrigin` to the
local point before testing, so the natural-looking `Rectangle(-w/2, -h/2, w, h)` ends up
shifted half a button up and left - the visible right and bottom halves stop responding and
a click dead-centre lands exactly on the excluded edge. The hit area is anchored at
`(0, 0)` instead, and `ui/Button.ts` is the only place in the codebase that defines one.

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
  ui/                     Button, HUD, Minimap, KillFeed, Crosshair, InventoryUI,
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
