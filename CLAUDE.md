# Slipstream-NPC — project guide for Claude

Fork of [Slipstream](https://github.com/JMB702/slipstream). Same engine; different social contract: NPCs are peaceful by default, voiced by ElevenLabs Conversational AI, retaliate only when shot at. Players make friends with NPCs through conversation; NPC friends defend each other.

- **Repo**: https://github.com/JMB702/slipstream-npc
- **Live game**: TBD (Vercel deploy not yet linked for this fork)
- **PartyKit prod**: `wss://slipstream-npc.jmb702.partykit.dev` (project not yet deployed)
- **Upstream (Slipstream)**: https://github.com/JMB702/slipstream — combat-only deathmatch parent project. Most engine docs below are inherited from upstream.

## Stack

- **pnpm monorepo**: `apps/client`, `apps/party`, `packages/shared`
- **TypeScript strict** end-to-end, ESM, `.js` extensions in TS source (Node ESM resolver — Vite doesn't care, the server build does)
- **Client**: Vite + React 18 + React Three Fiber + drei + Three.js + zustand + partysocket
- **Server**: PartyKit, single `Party.Server` class per room
- **Shared**: wire types + constants + the deterministic `applyMovement` function used by both sides

Tick rate 30 Hz, snapshot rate 20 Hz, input rate 30 Hz.

## Architecture

- **Server is the source of truth.** It runs `applyMovement` (from `@slipstream/shared`) on every input frame. Hit detection, health, ammo, kills/deaths all live server-side.
- **Client predicts locally** using the same `applyMovement`. On every snapshot the client drops acked inputs from its buffer, replays the rest from the server-confirmed state, and extrapolates a partial frame from the live input for the time since the last input was sent. No rubber-banding when math matches.
- **Position is the capsule's center**, not the feet. Floor clamp is `PLAYER.height / 2`. Visual capsule renders at the group origin (no extra Y lift). Eye height for raycasts is `position.y + height * 0.3`.
- **Remote players are time-interpolated** ~100ms behind the latest snapshot. Snapshot buffer is in `useGame.snapshots`.
- **Wire format**: `ClientMessage` / `ServerMessage` discriminated unions in `packages/shared/src/messages.ts`. Anything that crosses the wire MUST be defined there.

### Hit detection chain (READ THIS BEFORE TOUCHING tryFire)

The fire path looks simple but stacks three load-bearing pieces. They were each added because the user reported them missing in turn — don't simplify by removing one.

1. **Camera-anchored cast** (third-person parallax fix). Each `InputFrame` carries `aimOrigin` (camera world position) and `aim` (camera-resolved hit point in 3D). Server's `tryFire` casts from `aimOrigin` toward `aim`, **not** from the player's eye along yaw/pitch. Reason: the camera sits behind+above the player, so a low ledge in front of the player blocks the EYE's forward ray but not the camera ray. Reticle says clear, eye-cast says blocked, miss. Camera-anchored cast resolves to what the player sees. Bots and frames before the first snapshot pass `null` aim and fall back to eye-from-yaw/pitch.

2. **Vertical capsule hit volume** (matches the visible body). `rayCapsuleVertical` in `packages/shared/src/sim.ts` — cylinder body between `position.y ± (height/2 - radius)` with hemispherical caps of `PLAYER.radius + 0.1` at each end. The old single-sphere-at-center test reached only `[0.18, 1.62]` vertically; head shots from elevation never registered.

3. **Lag-compensated rewind** (so what you saw is what gets hit). Each `ServerPlayer` keeps a 500ms ring of `(serverTime, position)` samples, pushed once per tick after physics settles. `tryFire` rewinds each potential victim to `now - NET.interpolationDelayMs` (linear interp between bracketing samples) before running the capsule test. Without this, a target moving at walk speed (6 m/s) is offset ~0.6m from where the shooter sees them. History clears on respawn so a delayed shot can't tag someone back at their pre-death spot.

The visible tracer in the `shot` event is decoupled from the cast: server splits authoritative cast (`castOrigin = aimOrigin`) from visual event (`origin = eyeOrigin, direction = eye→impact`). Bullet appears to leave the rifle even though the hit logic ran from the camera. Don't merge these — that re-introduces the parallax bug.

## Where things live

```
packages/shared/src/
  constants.ts   — PLAYER (incl. stepHeight), MAP defaults, WEAPON, NET,
                   HOUSE_WALLS + SCATTERED_OBSTACLES (used by 'arena' map)
  maps.ts        — MapDef registry, MAPS, DEFAULT_MAP_ID, isMapId,
                   setActiveMap / getActiveMap singleton
  maps/fps_shooter.collision.ts — auto-generated AABBs for the GLTF map
  sim.ts         — applyMovement (reads getActiveMap obstacles + size),
                   rayAABB, raycastObstacles
  state.ts       — PlayerState, GameSnapshot, GameEvent
  messages.ts    — wire types + encode/decode
apps/party/src/
  server.ts      — Party.Server, tick + snapshot loops, room lifecycle.
                   onStart calls setActiveMap(this.room.id) so room id
                   IS the map id; onConnect rejects mismatched ?mapId=.
  simulation.ts  — applyInput, tryFire, integrateIdle, maybeRespawn
  state.ts       — ServerPlayer, randomSpawn (uses getActiveMap spawnArea)
  bots/
    waypoints.ts — getNavGraph(): per-map cache, built from MapDef.waypoints
    path.ts      — planPath, randomPatrolGoal (defensive on empty graphs)
apps/client/src/
  net/client.ts          — PartySocket wrapper. Room is the mapId; passes
                           ?mapId= alongside name/killTarget/etc.
  store.ts               — Zustand: snapshots, events, conn state, activeMapId
  game/Scene.tsx         — R3F Canvas root
  game/Map.tsx           — branches on activeMapId: 'arena' renders
                           HOUSE_WALLS + SCATTERED_OBSTACLES procedurally;
                           'fps_shooter' renders <MapGltf>
  game/MapGltf.tsx       — drei useGLTF wrapper. Per-map URL + scale (must
                           match SCALE in scripts/extract-map-collision.mjs)
  game/LocalPlayer.tsx   — input loop, prediction, sprint-demote-on-fire
  game/RemotePlayer.tsx  — snapshot interpolation
  game/Camera.tsx        — over-the-shoulder, spring-arm collision
  game/Character.tsx     — Mixamo character, anim state machine, gun
  game/local-state.ts    — singletons for input + predicted state
  game/input.ts          — pointer-lock + WASD + mouse handlers
  game/Tracers.tsx       — bullet tracers from shot events
  game/sfx.ts            — Web Audio one-shot SFX (gunshot, dry-fire, hit-marker, reload)
  ui/Lobby.tsx           — Map dropdown (replaces the old Room input)
  ui/Minimap.tsx         — reads activeMapId + MapDef.obstacles
public/models/Soldier.glb — Mixamo character + animations (Idle/Walk/Run/Fire/Reload/StrafeL/StrafeR)
public/audio/             — gunshot, dry-fire, hit-marker, reload (mp3)
public/maps/fps_shooter/  — GLTF served to the client (scene.gltf + bin + textures)
scripts/extract-map-collision.mjs — voxelizes Maps/<src>/scene.gltf into
                                    fps_shooter.collision.ts. Run via
                                    `pnpm extract:collision`.
```

## Maps

Two maps ship today; the lobby dropdown picks one and the server keys its
PartyKit room by the map id, so different maps live in different rooms.

| id | display | collision | size |
| --- | --- | --- | --- |
| `arena` | Original Arena | hand-authored `HOUSE_WALLS` + `SCATTERED_OBSTACLES` in `constants.ts` | 60×60 |
| `fps_shooter` | FPS Shooter Arena | auto-extracted from `Maps/fps_shooter_game_arena_map_v3/scene.gltf` (voxelized at 0.5m, greedy-merged into ~900 AABBs) | 30×30 |

Default map id: `fps_shooter` (set in `packages/shared/src/maps.ts` as `DEFAULT_MAP_ID`).

**Adding a map:**
1. Drop the GLTF and textures under `apps/client/public/maps/<id>/`.
2. If you want collision auto-extracted, add the source GLTF under `Maps/<dir>/`, point `scripts/extract-map-collision.mjs` at it, and run `pnpm extract:collision` to emit `packages/shared/src/maps/<id>.collision.ts`.
3. Add the new `MapId` literal + `MAPS[id]` entry in `packages/shared/src/maps.ts` (size, spawnArea, spawnHeight, obstacles, waypoints, edges, gltfOffset).
4. Register the URL + scale in `apps/client/src/game/MapGltf.tsx`. SCALE there must match `SCALE` in `scripts/extract-map-collision.mjs` so collision and visuals line up.
5. Branch the renderer in `apps/client/src/game/Map.tsx` (procedural arena vs `<MapGltf>`).

**Stair-step:** `PLAYER.stepHeight` (constants.ts) lets `applyMovement` auto-step grounded movement over obstacles up to that tall. Anything taller still needs a jump.

## Build / dev

```
pnpm install
pnpm dev               # client on :5173, party on :1999, parallel
pnpm typecheck         # strict TS across the workspace
pnpm build
pnpm deploy:party      # PartyKit deploy (requires Adobe-free PartyKit login)
```

`vercel.json` at the repo root pins client builds for Vercel. `VITE_PARTYKIT_HOST` is set as a Vercel project env var (production scope) pointing at `slipstream-npc.jmb702.partykit.dev`. `apps/party/.env` (gitignored) holds `ACCESS_CODE=<4 digits>` for local dev — the `partykit dev` server reads it on startup.

### Deployment (manual; not auto-on-merge)

Branch protection on `main` requires a code-owner approval before any PR can merge — see `CONTRIBUTING.md` and `.github/CODEOWNERS`. **Merging does NOT trigger a deploy.** The maintainer ships when satisfied with the merged commits:

```
# Client (Vercel; uses the linked project from `vercel link`)
vercel --prod

# Server, only when apps/party/ or packages/shared/ changed
cd apps/party && npx partykit deploy --var ACCESS_CODE=<code>
```

The two-gate model is intentional: code-owner review gates what merges, the maintainer's manual deploy gates what ships. Don't reconnect Vercel ↔ GitHub auto-deploy without flipping `CONTRIBUTING.md` and `apps/client/src/ui/clonePrompt.ts` to match — the lobby's Copy AI Agent Prompt button hands agents a workflow that explicitly says "do not run deploy commands; the maintainer ships manually."

## LAN multiplayer testing

`pnpm dev` binds both servers to `0.0.0.0` so a second computer on the same local network can join without deploying. Three pieces make this work:

- `apps/client/vite.config.ts` sets `server.host: true` → Vite prints both `Local:` and `Network:` URLs on startup.
- `apps/party/package.json` runs `partykit dev --port 1999`. PartyKit already binds 0.0.0.0 by default; the explicit `--port` keeps the port stable so the client's `localhost:1999` fallback works without env vars.
- `apps/client/src/net/client.ts` reads an optional `?host=` URL query and uses it before falling back to `VITE_PARTYKIT_HOST`, then `localhost:1999`. Lets the second computer override the host without its own `.env`.

**Procedure (host machine):**
1. `ipconfig getifaddr en0` (Wi-Fi) or `ipconfig getifaddr en1` (Ethernet) → call it `HOST_IP`.
2. `pnpm dev`.
3. macOS firewall is the #1 blocker. System Settings → Network → Firewall: either turn it off for the test, or open it and explicitly allow incoming connections for `node` and `workerd`. The first-launch popup is unreliable for processes spawned by `pnpm` — better to set this up in advance.
4. Player 1 (host) opens `http://localhost:5173/`.
5. Player 2 (other computer, same LAN) opens `http://<HOST_IP>:5173/?host=<HOST_IP>:1999`.

Wi-Fi vs Ethernet doesn't matter — what matters is that both machines sit on the same subnet (almost always true if they share one home router; a `192.168.x.x` IP on each is the tell). A Windows player should run `ipconfig` in PowerShell and confirm its `IPv4 Address` shares the first three octets with `HOST_IP`.

**Sanity checks from another shell on the host:**
- `curl -I http://<HOST_IP>:5173/` → HTTP 200 means Vite is reachable on the LAN interface.
- `curl -I http://<HOST_IP>:1999/parties/main/test` → any HTTP response (even 404/500) proves PartyKit is reachable; connection-refused or timeout means firewall.
- From the second machine's browser, hitting `http://<HOST_IP>:5173/` should load the page. If that fails but localhost on the host works, it's network/firewall, not the code.

**If LAN doesn't work** (firewall stays in the way, hotel/office Wi-Fi with client isolation, separate VLANs): `cloudflared tunnel --url http://localhost:1999`, then pass the printed `*.trycloudflare.com` host via `?host=`. The URL-query override handles arbitrary hosts, no code change needed. Last resort: `pnpm deploy:party` and point `?host=` at the prod PartyKit host while keeping the client local.

## Gotchas (hard-won)

These are the things that have eaten hours. Read before changing related code.

1. **Mixamo bone world scale is ~0.001.** Bones come out of the FBX → Blender → glTF pipeline with a tiny cumulative scale. Don't `bone.add(child)` — the child renders at 0.001× size, invisible. Track the bone via `bone.getWorldPosition()` + `wrapper.worldToLocal()` per frame and skip rotation extraction (its `decompose()` inherits the bad scale).
2. **Mixamo animations carry root motion** in the `Hips.position` track unless downloaded with "In Place" enabled. Server is authoritative for position, so root motion fights every snapshot. `stripRootMotion()` in `Character.tsx` filters those tracks at runtime — don't remove it.
3. **Three.js auto-disables actions after `fadeOut` completes.** Specifically, `_updateWeight` sets `enabled = false` when the weight interpolant hits 0. A subsequent `fadeIn().play()` does NOT re-enable — the mixer forces effective weight to 0 and the bind pose (T-pose) blends through. **Always set `action.enabled = true` on every transition.** `applyClipMode()` does this.
4. **`integrateIdle` must gate on `TICK_MS * 1.5`.** Server's gravity-for-idle-players runs every tick, but if it fires for active players too it overwrites velocity to zero — client snapshots see velocity oscillating between sprint-speed and zero, animation state machine flickers Walk↔Idle on every snapshot.
5. **Don't add an `isRunning()` defensive check to the animation state machine.** It misfires for paused actions (Jump's frozen pose), continuously calls `fadeIn()`, weight permanently near 0 → T-pose blend. State machine should only act on actual state transitions.
6. **drei's `useGLTF` returns a shared scene.** Clone via `SkeletonUtils.clone(gltf.scene)` for each instance. Pass the **cloned object** to `useAnimations`, not a wrapper ref — the latter relies on tree traversal and binds intermittently.
7. **Sprint+fire is silently demoted to walk+fire** in two places: server `onMessage('input')` and client `LocalPlayer` input frame builder. Both must be kept in sync or prediction rubber-bands.
8. **Camera in tight spaces uses spring-arm with asymmetric damping.** Retract fast (lerp 0.6), return slow (lerp 0.1), 0.15m hysteresis. Camera radius (0.3m) inflates obstacle AABBs at ray-cast time so corners pull the camera in before clipping.
9. **Don't bump GLB version timestamps unless the file changed.** drei caches by URL — adding `?v=${Date.now()}` forces re-downloads of multi-MB files for every player on every reload.
10. **HMR debt**. After many hot reloads (especially across `Character.tsx`), WebGL contexts get exhausted and Vite's optimizer cache desyncs. If errors look weird and reloads don't help, restart the dev server. Symptoms: Character component throws on mount, `Context Lost` log spam.

11. **PartyKit env on Cloudflare Workers**: read via `this.room.env.X`, NOT `process.env.X`. The Workers runtime doesn't populate `process.env`; `room.env` is the only path that works in both `partykit dev` and prod. The access-code gate failed silently in prod for an entire deploy because of this.

12. **ADS is a presentation flag, not a gameplay flag.** `state.aiming` (RMB or LT) drives camera framing (back-distance / shoulder / FOV lerp) and look-sensitivity scaling only. Don't gate fire rate, damage, or accuracy on it — keep gameplay invariant under aim.

13. **The local character body hides when the camera is within `LOCAL_HIDE_DIST` (1.9m).** Spring-arm collision and ADS framing both pull the camera that close. Without the hide, the player's own head occludes the aim cone. The gun stays visible because it's a sibling of the cloned mesh inside the wrapper group, not a child.

14. **Shot/hit-marker subscribers must gate on event timestamp, not array length.** The store caps `events` at 200; once full, length stays pinned and length-based comparison silently no-ops every subscriber forever (~25s into a session). HUD hit-marker and Character muzzle-flash both use a `lastAtRef` of the highest-seen `ev.at` instead.

15. **`pendingFire` is a `Map<id, aim|null>`, not a Set.** The aim travels with the fire press from input dispatch into the next tick's `tryFire`, so the server fires from the camera state at the moment of the click — not the most recent yaw/pitch (which can drift between press and tick).

16. **Sister `.claude/worktrees/` are a reversion vector.** Concurrent agent sessions in sister worktrees can check files out into the main directory and clobber uncommitted work. If the same edits keep being undone, check `git worktree list` and remove stale worktrees: `git worktree remove --force .claude/worktrees/<name>` + `git branch -D claude/<name>`. Commit aggressively to lock work in.

## Conventions

- **Wire types only** in `@slipstream/shared`. Server `ServerPlayer` extends `PlayerState` privately; the public wire shape is `PlayerState`.
- **Constants only** in `@slipstream/shared/constants` — even when used only on one side. Keeps tuning in one file.
- **`stripServerOnly`** in `server.ts` strips fields like `grounded`, `pendingInputSeq`, `lastIntegratedAt` before broadcasting. Client derives these if it needs them.
- **Server tunables** that affect prediction must be in shared constants (gravity, jump speed, etc.). Server-only state (timers, room id) stays in `apps/party`.
- **No NaN math.** Clamp input axes (`forward`, `right`) to [-1, 1] before integrating. Clamp `dtMs` to ≤100ms before division.
- **No comments narrating WHAT.** Names do that. Comments only for non-obvious WHY (a gotcha, an invariant, a workaround).

## Asset pipeline (Mixamo character)

To swap or add animations:

1. Mixamo → download character FBX with skin (T-pose) into `Characters/`. Animations → FBX without skin, **In Place ✓**, into `Animations/Slim Shooter Pack/`.
2. Edit `/tmp/merge_mixamo.py`: set `CHARACTER_PATH`, add to `ANIMATIONS` list (clip name → FBX path).
3. Run merge:
   ```
   /Applications/Blender.app/Contents/MacOS/Blender --background --python /tmp/merge_mixamo.py
   ```
4. Compress (Blender output is usually 100MB+ from embedded textures):
   ```
   cp apps/client/public/models/Soldier.glb /tmp/Soldier_uncompressed.glb
   npx --yes @gltf-transform/cli resize /tmp/Soldier_uncompressed.glb /tmp/_step1.glb --width 1024 --height 1024
   npx --yes @gltf-transform/cli webp /tmp/_step1.glb apps/client/public/models/Soldier.glb
   ```
   Don't use `gltf-transform optimize` — it adds meshopt compression which Three.js's default `GLTFLoader` can't decode without `MeshoptDecoder` registration.
5. If clip names changed, update `CLIP_NAMES` at the top of `Character.tsx`.

`Animations/`, `Characters/`, and `*.fbx` are gitignored — keep sources local, only the merged Soldier.glb ships.

## Audio

`apps/client/src/game/sfx.ts` — Web Audio singleton. Lazy `AudioContext` (browser autoplay policy: created on first `play*()` call, which always lands inside a user-gesture call stack via pointer-lock + click). One shared cache of decoded `AudioBuffer`s; each play allocates a fresh `AudioBufferSourceNode` so overlap works.

- **Gunshot**: triggered for every `shot` event in `Character.tsx` (subscriber runs once per character; each fires for its own `playerId` only, so own + remote shots all play uniformly). Distance-attenuated — gain falls linearly to a floor at `GUNSHOT_MAX_DIST` (60m). Camera position resolved via `useThree(s => s.camera)`.
- **Dry-click**: triggered in `LocalPlayer.tsx` when `consumeFire()` is true with `meNow.alive && meNow.ammo <= 0`. Server silently ignores no-ammo fires (`tryFire` early-returns), so this is a pure client-side feedback; the local player already knows ammo from the snapshot.
- **Hit-marker**: same `Character.tsx` shot subscriber, gated on `playerId === myId && ev.hit !== null`. Non-spatial (it's UI feedback). The mp3 has ~217ms of leading silence before the impact transient — `findOnset()` scans for the first sample at ≥10% of peak amplitude (cached per URL) and `src.start(0, offset)` skips the lead-in so the impact lands with the gunshot.
- **Reload**: triggered by a `useEffect` in `Character.tsx` watching the `reloading` prop for a `false → true` transition; looks up the player's position from the latest snapshot for distance attenuation. Tighter falloff than gunshot (`RELOAD_MAX_DIST = 25`) — only audible to nearby enemies as a tactical cue. Audio is 2.0s, server `WEAPON.reloadMs` is 1500ms; the tail plays past reload completion (intentional, no truncation).

Volume constants live at the top of `sfx.ts`. Source SFX live in `Audio/SFX/` (not committed); the in-game files are 1:1 copies in `public/audio/`.

## Known issues

- **Shots from elevation get blocked above the visible wall on `fps_shooter`.** The hit-detection chain (camera-anchored cast + capsule + lag-comp rewind) all behave correctly when validated in isolation. The problem is geometry data: `OBSTACLES` collision AABBs for some elevated platforms appear to extend higher than the rendered wall geometry. Standing behind cover at the top of the multi-level map and aiming down at someone — reticle is on the target, server's `raycastObstacles` from the camera origin still hits an invisible AABB above the visible top edge, shot returns blocked, no hit marker. From above the cover (jumping onto the ledge instead of behind it) the rate improves but isn't perfect. **Don't try to fix in `tryFire`** — the cast is correct; the geometry data is wrong. Fix path: audit the AABBs emitted by `scripts/extract-map-collision.mjs` for `fps_shooter` against the visible mesh top edges. The voxelizer's greedy merge step is the most likely culprit (it can extend an AABB upward past the mesh top when the cell above is also "solid" by the conservative voxelization). Compare voxel cell tops to actual mesh `boundingBox.max.y` per merged region and clamp.

## State of the art (open polish items)

Things that are wired but not yet polished. Pick these up in order of player-visibility.

- **Audit obstacle Y-bounds for `fps_shooter`** (see Known issues above). Highest-impact gameplay fix outstanding.
- **RTT-component lag compensation.** Today's rewind covers `NET.interpolationDelayMs` only; not per-client RTT/2. Adding it requires a client ping loop (none exists today — the `ping`/`pong` wire types are defined but no code sends pings), an RTT estimator on the client, and a new `rtt` field on `InputFrame` so the server can rewind by `now - interpolationDelayMs - rtt/2`.
- **Reload state**: clip exists in GLB, R-key sends `input.reload`, server runs `WEAPON.reloadMs` timer, but state machine never enters Reload (no event triggers it). Need to wire a "reload started" event from server.
- **Real Jump clip**: `Jump` state currently maps to `RunF` frozen mid-stride (`JUMP_POSE_TIME = 0.35`). Replace with a Mixamo `Jump` clip and remove the freeze code in `applyClipMode`.
- **Gun tracks hand rotation**: gun follows hand position but its rotation is fixed at `[0, π, 0]`. Need to extract rotation from `bone.matrixWorld` after scale-normalization.
- **Multi-character UI**: `Ch35.glb` ships and the wire format carries `characterId`, but the lobby has no character picker.
- **Strafe clips**: `StrafeL` / `StrafeR` exist but aren't picked by the locomotion state machine (it uses 8-direction `WalkX`/`RunX` instead). Either wire strafe or delete the unused clips.

## What NOT to do

- Don't push directly to `main`. Branch protection requires a code-owner approval on every PR. Even the maintainer goes through PRs in normal cases.
- Don't add auto-deploy on merge. The two-gate model (PR review + manual deploy) is intentional. If you change this, update `CONTRIBUTING.md` and `apps/client/src/ui/clonePrompt.ts` to match.
- Don't merge the authoritative cast and the visible tracer in `tryFire`. They look duplicative and aren't — splitting them is the only way the shot can come from the camera while the bullet appears to come from the gun.
- Don't commit `Animations/`, `Characters/`, `Audio/`, `Maps/`, or `apps/party/.env` — gitignored. Source files run hundreds of MB and `.env` carries the access code.
- Don't run destructive git operations (`reset --hard`, `push --force`, `worktree remove --force`) without explicit user authorization.
- Don't add features beyond what was asked. Bug fixes don't need surrounding cleanup; one-shot operations don't need helpers.
- Don't add comments narrating what the code does. Names + tests do that.
- Don't introduce backwards-compat shims for code paths the user is fine changing.
- Don't `git add -A` blindly after generating large artifacts — check `git status` first to catch the next 246MB FBX commit before it lands.

---

# Fork-specific: NPC voice + friendship system

Everything above this section is inherited from upstream Slipstream and applies verbatim. The section below documents the fork's additions.

## Social contract

- **NPCs are peaceful by default.** Bot AI (`apps/party/src/bots/controller.ts`) still patrols and explores, but `findVisibleTarget` is replaced with `findVisibleHostileTarget` — bots only consider players hostile if the social state says they are.
- **Hostility is shooter-keyed and time-decayed.** When a shot lands on a player (server confirms hit in `tryFire`), `social.markAttack(shooterName, victimId)` pushes a `HostilityEntry { towardsName, until }` onto the victim AND every player in `victim.friendsWith`. `HOSTILITY_MS = 30_000`. Pruned each tick. After it expires the NPC returns to patrol.
- **Friendship is a real graph.** Both NPCs and humans can have `friendsWith: string[]`. NPCs start with seed friendships from the roster. Players earn NPC friendship via conversation: the ElevenLabs agent has a `make_friend(player_name)` tool that webhooks back into PartyKit (`POST /tools/make_friend`).
- **Friendship is authoritative on the server.** Stored in PartyKit Durable Object storage keyed by `friend:<npcId>:<playerName>`. Survives room restarts.

## Voice topology (V1)

- **Per-player 1:1 ConvAI sessions.** Each player runs its own ElevenLabs Conversational AI session with whichever NPC is in proximity. Browser ↔ ElevenLabs direct WebRTC; PartyKit is not in the audio path.
- **NPC memory is the bridge between sessions.** On `voice_session_start`, the server returns an `npc_context` message with a 2KB memory blob: friendship score + last 10 lines with this player + last 5 lines with anyone recently in earshot of this NPC. The agent receives the blob as a session prompt override, so the same NPC "remembers" what other players said.
- **Other players in earshot hear the agent's TTS** via a PartyKit-broadcast `npc_audio` event, played positionally on listener clients (PannerNode HRTF). Speaker mic stays direct to ElevenLabs.
- **Always-on, proximity-gated mic** within `NPC_VOICE_RADIUS = 5m` with 0.5m hysteresis. At most one session at a time per local player; closest wins on overlap.
- **Mute** is keyboard `M` plus Xbox controller button (Y or LSB). Muted = `track.enabled = false`; session stays open so NPC voice is still heard.

### Known limitation
V1 is per-listener sessions, not true N→1→N multi-speaker. Agent has cross-player context via memory blob but each response is driven by one speaker. True multi-speaker bridge (server-side STT per stream, single LLM conversation, broadcast TTS) is deferred to V2.

## Identity & consent

- **Player identity is `hello.name`** for v1. Two players named "Bob" share friendship and transcript state. Real fix is a per-player UUID flow — track as future work.
- **Voice recording requires consent.** `ConsentGate.tsx` renders before `Lobby.tsx`; checkbox covers voice recording, transcription, storage, and third-party (ElevenLabs) transmission. Florida is a two-party-consent state — do not bypass this gate. Consent is stored both in `localStorage` (`slipstream_consent_v1`) and server-side (Durable Object `consent:<playerName>`).

## Wire types (additions to `packages/shared/src/messages.ts`)

`ClientMessage`:
- `consent { agreed, version }`
- `voice_session_start { npcId, sessionId }`
- `voice_session_end { sessionId }`
- `transcript { npcId, sessionId, role: 'user' | 'agent', text, at }`

`ServerMessage`:
- `consent_required { version }`
- `npc_context { npcId, sessionId, memoryBlob, friendship }`
- `npc_audio` — broadcast TTS frames for listeners (V1 may use existing pubsub; V2 needs binary)

## Where things live (new files in this fork)

```
packages/shared/src/npc-roster.ts    — NPC personas (id, name, agentId, voiceId, personality, startingFriends)
apps/party/src/social.ts             — markAttack, isHostileTo, pruneHostility
apps/party/src/storage.ts            — Durable Object: friendship + transcripts + consent + memoryBlob composition
apps/client/src/voice/
  mic.ts                             — getUserMedia + permission flow
  ConvAISession.ts                   — @elevenlabs/client wrapper, per-NPC session
  proximity.ts                       — distance-gated session start/stop
  spatial.ts                         — PannerNode HRTF for NPC voice
  mute.ts                            — global mute singleton (keyboard + gamepad)
apps/client/src/ui/ConsentGate.tsx   — pre-lobby consent
apps/client/src/ui/MuteIndicator.tsx — HUD widget
```

## ElevenLabs agent setup

Agents are authored in the ElevenLabs dashboard (one per NPC personality). For each agent:
1. Set system prompt with NPC's full personality.
2. Add a `make_friend` tool (Webhook) pointing at `https://<partykit-host>/parties/main/<roomId>/tools/make_friend`. Body schema:
   ```json
   { "npcId": "string", "playerName": "string", "sessionId": "string", "secret": "string" }
   ```
3. The secret is shared via `ELEVENLABS_AGENT_TOOL_SECRET` (set in `apps/party/.env` and in the agent's dashboard config).

See `docs/elevenlabs-setup.md` (to be written) for copy-pasteable JSON.

## What NOT to do (fork additions)

- Don't put microphone audio through PartyKit in V1. Browser → ElevenLabs direct keeps audio off the Workers runtime, which has tight limits on long-running streams.
- Don't trust client-side friendship claims. Server is authoritative; client just renders what comes back in snapshots and `npc_context`.
- Don't bypass `ConsentGate` for testing convenience — Florida two-party consent applies. If you need a dev mode, document it explicitly and gate on a Vite env var so it can't ship.
- Don't store raw audio. Only transcripts are persisted (and only with consent).
