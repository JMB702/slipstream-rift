# Slipstream

3D third-person multiplayer arena shooter that runs in the browser.

- **Client:** React + React Three Fiber + Three.js, deployed on Vercel
- **Server:** PartyKit (authoritative simulation, WebSockets) on Cloudflare Durable Objects
- **Shared:** TypeScript wire types between client and server

## Run locally

```
pnpm install
cp apps/client/.env.example apps/client/.env.local   # leave VITE_PARTYKIT_HOST blank for local dev
pnpm dev
```

This starts both apps in parallel:

- Client at http://localhost:5173
- PartyKit server at http://localhost:1999

Open the client in two browser windows, pick a name, use the same room code, and you should see each other.

**Controls:** WASD move · Shift sprint · Space jump · Mouse aim (click canvas to lock) · Click fire · R reload · Tab scoreboard.

## Deploy

You need free accounts on [Vercel](https://vercel.com) and [PartyKit](https://www.partykit.io).

### 1. Deploy the multiplayer server

```
pnpm --filter party deploy
```

First run prompts a login. The output prints a host like `slipstream.<your-username>.partykit.dev`. Save that.

### 2. Deploy the client

Push the repo to GitHub and import it into Vercel. Vercel reads `vercel.json` at the repo root and builds the client.

In Vercel project settings → Environment Variables, add:

```
VITE_PARTYKIT_HOST = slipstream.<your-username>.partykit.dev
```

Trigger a redeploy. The client will now talk to your PartyKit server.

(CLI alternative: `vercel --prod` from the repo root works too.)

## Project structure

```
apps/
  client/           Vite + React + R3F. Vercel build target.
  party/            PartyKit server. Authoritative simulation at 30 Hz.
packages/
  shared/           TypeScript types for messages, state, constants.
                    Imported by both client and party as `@slipstream/shared`.
vercel.json         Pins build/output for Vercel.
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the networking model and how to add a weapon, map, or feature.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Run client + party in parallel |
| `pnpm build` | Build everything |
| `pnpm typecheck` | Strict TS check across the monorepo |
| `pnpm deploy:party` | Deploy multiplayer server to PartyKit |
| `pnpm format` | Prettier write |

## Requirements

- Node 20+ (`.nvmrc` pins 20)
- pnpm 10+
