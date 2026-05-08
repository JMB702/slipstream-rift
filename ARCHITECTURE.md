# Architecture

## Three apps, one repo

```
┌────────────────┐         WebSocket          ┌────────────────────┐
│  apps/client   │  ◀──────────────────────▶  │   apps/party       │
│  (Vercel CDN)  │   inputs (30Hz)            │   (PartyKit DO)    │
│  React + R3F   │   snapshots (20Hz)         │   authoritative    │
└────────────────┘                            └────────────────────┘
        │                                              │
        └──────────── packages/shared ─────────────────┘
                  (TypeScript wire types)
```

`packages/shared` is the source of truth for the wire protocol. Both apps import it as `@slipstream/shared`. Anything that crosses the wire MUST be defined there.

## Networking lifecycle

1. **Connect.** Client opens a `PartySocket` to `wss://<host>/party/main/<room>?name=<n>`. PartyKit routes the connection to a Durable Object instance keyed by `<room>`.
2. **Welcome.** Server sends `{ type: 'welcome', you, serverTime }` so the client knows its own player id and a server clock to anchor interpolation against.
3. **Inputs.** Client sends `{ type: 'input', frames: InputFrame[] }` at 30 Hz. Each frame includes `{ seq, dtMs, forward, right, jump, sprint, fire, reload, yaw, pitch }`.
4. **Server tick.** Server simulates at 30 Hz: applies inputs, integrates physics, processes shot raycasts, handles death/respawn.
5. **Snapshots.** Server broadcasts `{ type: 'snapshot', snapshot: GameSnapshot }` at 20 Hz with all player states.
6. **Events.** Discrete events (kills, shots, chat) are batched and broadcast as `{ type: 'events', events }` alongside the next snapshot.
7. **Client render.** Local player uses **client-side prediction**: it keeps a buffer of inputs that haven't been acked yet (compared against `me.lastSeenSeq` in the latest snapshot), and each frame it replays those inputs from the last server-confirmed state through the same `applyMovement` function the server runs. This makes input feel instant. Remote players are interpolated with `NET.interpolationDelayMs` (100ms) lag against the snapshot buffer.

## Server authority

The server is authoritative. The client never sends "I dealt damage" or "I am at position X" — only intent. This is the cheap-and-correct model for an MVP shooter:

- Movement is integrated server-side from input axes.
- Hit detection is server-side ray vs sphere against the latest known positions of all alive players.
- Health, ammo, kills, deaths live on the server.

Lag compensation is **not** implemented — a 100ms-ping shooter aiming at a moving 100ms-ping target will undershoot. This is acceptable for v1; see *Future work*.

## Client structure

```
apps/client/src/
  main.tsx              # React mount
  App.tsx               # Lobby ↔ Game switch
  store.ts              # Zustand: snapshots, events, conn state
  net/client.ts         # PartySocket wrapper, message dispatch
  game/
    Scene.tsx           # R3F Canvas root: lighting, sky, world
    Map.tsx             # Greybox arena geometry
    LocalPlayer.tsx     # Drives input loop; renders own avatar from server state
    RemotePlayer.tsx    # Interpolated remote avatar
    Players.tsx         # Iterates remote players from latest snapshot
    PlayerModel.tsx     # Capsule mesh + name tag billboard
    Camera.tsx          # 3rd-person follow camera (reads live yaw/pitch)
    Tracers.tsx         # Hitscan tracer effect, driven by 'shot' events
    input.ts            # WASD / pointer-lock / mouse handling
  ui/
    Lobby.tsx           # Name + room entry
    HUD.tsx             # Crosshair, status bar, kill feed, death overlay
    Scoreboard.tsx      # Tab-hold scoreboard
```

## Server structure

```
apps/party/src/
  server.ts             # PartyKit Server class. Connection lifecycle, tick loop, snapshot broadcast
  state.ts              # ServerPlayer shape, spawn helpers
  simulation.ts         # applyInput, tryFire, raycast, finishReload, maybeRespawn
```

Tick rate (`TICK_HZ`), snapshot rate (`SNAPSHOT_HZ`), and gameplay constants live in `packages/shared/src/constants.ts`. Tune them in one place.

## Extension recipes

### Add a new weapon

1. In `packages/shared/src/constants.ts` add a `WEAPONS` map keyed by id.
2. In `packages/shared/src/state.ts` add `weaponId: string` to `PlayerState`.
3. In `apps/party/src/simulation.ts` make `tryFire` look up the weapon by id and use its damage/range/spread.
4. In the client, add a weapon-switch input (`InputFrame.weaponSlot: number`) and render the model.

### Add a new map

1. Replace `apps/client/src/game/Map.tsx` with new geometry, OR introduce a `mapId` switch.
2. If physics/collision matters, mirror the obstacle list in `apps/party/src/simulation.ts` and ray-test against it.
3. Update spawn points in `apps/party/src/state.ts` `randomSpawn`.

### Add chat UI

The chat event flow is already wired (`ClientMessage.chat`, server fanout, store ingest). Just add a chat-input component in `ui/` that calls `client.send({ type: 'chat', text })` and renders `useGame((s) => s.chat)`.

## Future work

- **Lag compensation.** Server keeps a small history of player positions, raycasts against the position the shooter actually saw (now − their RTT/2 − interpolation delay).
- **Anti-cheat.** Server already validates everything. For higher trust, clamp input axes per frame (already done), reject impossible deltas, rate-limit fire even harder.
- **Map collision.** Currently only the floor and outer walls are collided. Obstacle boxes are visual only on both sides.
- **Multiple weapons / classes / progression.**
- **Mobile / gamepad input** in `game/input.ts`.

## Conventions

- TypeScript strict mode, ESM throughout, `.js` import extensions in TS source (per Node ESM resolver — Vite doesn't care, the server build does).
- Wire types live in `@slipstream/shared`. Don't duplicate them.
- Constants go in `@slipstream/shared/constants` even when used only on one side. Keeps tuning in one file.
