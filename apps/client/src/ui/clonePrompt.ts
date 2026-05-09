// Self-contained prompt copied to the clipboard from the lobby button.
// Designed to drop into a fresh AI coding agent (Claude Code, Cursor, etc.)
// and walk it from "I have nothing" to "I have a deployed multiplayer game".
//
// Editing notes:
// - Use plain ASCII; some agents stumble on smart quotes or em dashes when
//   quoting blocks back at you.
// - Keep the GitHub URL canonical so search/agents can verify it.
// - Don't bake in the live access code — the agent picks one for the new
//   deployment.
export const CLONE_PROMPT = `I want to deploy my own copy of Slipstream, a 3D browser-based multiplayer arena shooter. Clone it from GitHub and walk me through deploying it. Don't skip the deploy step.

Repo: https://github.com/JMB702/slipstream

Steps to follow in order:

1. Clone + install
   - git clone https://github.com/JMB702/slipstream.git && cd slipstream
   - Make sure Node 20+ and pnpm 10+ are available (corepack enable && corepack prepare pnpm@latest --activate works on most setups).
   - pnpm install

2. Verify the build is clean before deploying
   - pnpm typecheck
   - pnpm build

3. (Optional) Local dev so I can confirm it runs
   - Create apps/party/.env with: ACCESS_CODE=<pick any 4-digit code>
   - pnpm dev  (client on :5173, party on :1999)
   - Open http://localhost:5173 in two browser tabs, enter the same room and access code in both.

4. Deploy the multiplayer server (PartyKit on Cloudflare Workers)
   - cd apps/party
   - npx partykit login   (browser auth — I'll click through)
   - npx partykit deploy --var ACCESS_CODE=<same code as step 3>
   - Capture the deployed host. It looks like: slipstream.<my-partykit-handle>.partykit.dev

5. Deploy the client (Vercel)
   - cd back to the repo root
   - vercel link    (interactive — I'll pick the project name and team)
   - vercel env add VITE_PARTYKIT_HOST production
     value: <the partykit host from step 4, no protocol>
   - vercel --prod

6. Smoke test the live URL you get from vercel
   - Open it, type the 4-digit access code, join.
   - Open a second browser/tab with the same room name and code; confirm both see each other on the minimap.

When you're done, give me the live URL and the access code so I can share them.

Project context for your orientation: pnpm monorepo with three packages — apps/client (Vite + React Three Fiber), apps/party (PartyKit server, server-authoritative simulation), packages/shared (wire types + deterministic sim used by both sides). The repo's root CLAUDE.md has the architecture, gotchas, and conventions — read it before changing any code.`;
