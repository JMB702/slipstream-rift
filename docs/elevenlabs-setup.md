# ElevenLabs agent setup

Per-NPC ElevenLabs Conversational AI agents power the in-game voices. This doc covers what to author in the dashboard so the placeholder `agentId: 'TODO_AGENT_ID_*'` markers in [packages/shared/src/npc-roster.ts](../packages/shared/src/npc-roster.ts) can be filled in.

## One agent per NPC

The roster lives in `packages/shared/src/npc-roster.ts`. Each entry needs:

```ts
{
  id: 'mira',
  name: 'Mira',
  agentId: '<copy from dashboard>',
  voiceId: '<optional voice override>',
  personality: '...',
  startingFriends: ['guts'],
}
```

Author one agent per NPC in the ElevenLabs dashboard. Settings:

- **Name** — match the NPC's `name` (helps you keep them straight in the dashboard).
- **Voice** — pick distinct voices per NPC. If you set `voiceId` in the roster, that overrides the dashboard default at session start.
- **System prompt** — the agent's full personality. Slipstream-NPC also injects a per-session prompt override on top of this with friendship score + recent transcripts; treat the dashboard prompt as the base personality and let the override carry context.
- **First message** — leave blank. The game decides per session.

## The make_friend tool

Every agent gets a single tool the player conversation can invoke when the agent decides the relationship has shifted. The tool calls a PartyKit webhook that updates the friendship graph.

### Tool definition (dashboard JSON)

```json
{
  "name": "make_friend",
  "description": "Mark this player as a friend of this NPC. Call this when the conversation has reached a point where the NPC genuinely considers the player an ally — they have shared something meaningful, expressed solidarity, or completed a small social ritual. Do NOT call this casually or on the first exchange.",
  "type": "webhook",
  "method": "POST",
  "url": "https://slipstream-npc.jmb702.partykit.dev/parties/main/<roomId>/tools/make_friend",
  "headers": [
    { "key": "content-type", "value": "application/json" }
  ],
  "body": {
    "npcId": "{{npc_id}}",
    "playerName": "{{player_name}}",
    "sessionId": "{{session_id}}",
    "secret": "<paste the value of ELEVENLABS_AGENT_TOOL_SECRET from apps/party/.env>"
  }
}
```

`{{npc_id}}`, `{{player_name}}`, and `{{session_id}}` come from `dynamicVariables` the client passes at session start (see [ConvAISession.ts](../apps/client/src/voice/ConvAISession.ts)).

The `<roomId>` segment is the active map id (`fps_shooter` by default). If you change maps after this is configured, repoint the webhook URL.

### Auth

`ELEVENLABS_AGENT_TOOL_SECRET` lives in `apps/party/.env` (gitignored) and must be set on the PartyKit production project via `npx partykit env add ELEVENLABS_AGENT_TOOL_SECRET <value>`. The server constant-time compares the `secret` field on every tool call.

Failure modes:

| Response | Meaning |
| --- | --- |
| `200 { ok: true, score, becameFriend }` | Friendship updated. `becameFriend` is true if this call pushed the score past the threshold. |
| `401 unauthorized` | Bad secret. Check the dashboard tool body. |
| `403 no consent on record` | Player hasn't consented to voice chat (impossible in practice — they couldn't have started a session). |
| `404 not found` | URL doesn't end in `/tools/make_friend`. |
| `503 tools disabled` | `ELEVENLABS_AGENT_TOOL_SECRET` is unset in the room's env. Set it. |

## Verifying end-to-end

1. Set real `agentId`s in `packages/shared/src/npc-roster.ts`.
2. Add the `make_friend` tool to each agent in the dashboard.
3. `pnpm dev` locally.
4. Open the game, accept the consent gate, join.
5. Walk near an NPC. Console should log `[voice] session connected for <name>`.
6. Have a brief conversation. Ask the agent to be friends; cue it explicitly.
7. Watch the agent call `make_friend` — should see a `200` in the PartyKit dev console.
8. The nameplate over the NPC should now show a green pip + green name when you aim at them.
9. Quit and rejoin the room. The NPC should greet you as a friend.

## Future tools

- `get_memory` — agent can pull a fuller transcript history than the per-session blob. Useful if conversations get long. Same webhook auth pattern.
- `remember(key, value)` — agent stashes a structured fact about the player. Surfaces in future memory blobs. Add a `memory:<npcId>:<playerName>` key in `storage.ts`.

Both are deferred from V1; the wiring pattern is the same.
