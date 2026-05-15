# Dashboard setup checklist

Two manual setup steps in the ElevenLabs dashboard at
`https://elevenlabs.io/app/agents/agents/agent_2801krp7phr1fjat8f1f2yq7mvkt`:

## 1. Enable the "Voice" override (one-time)

Per-character voices (Eve → Sarah, Maria → Alice, Medea → Laura, etc., see
[`packages/shared/src/npc-roster.ts`](../packages/shared/src/npc-roster.ts)
`VOICE_BY_CHARACTER`) need the agent to accept a per-session `voiceId`
override. The toggle is OFF by default, same gotcha as System prompt and
First message.

- **Tab:** Security → Overrides
- **Toggle:** `Voice` (currently off → flip on)
- Leave Voice speed / stability / similarity off — we don't override those.
- Click **Publish** at the top right.

After this, the next session start passes the right voiceId per character
model and you'll hear distinct voices on Eve / Maria / Medea / Matilda /
Soldier / Bill bodies.

## 2. Registering the 4 webhook tools in ElevenLabs

The Slipstream-NPC agent calls four webhooks during conversations:

| Tool | Effect on the game |
| --- | --- |
| `make_friend` | Increments friendship score with the player. Past `SOCIAL.friendThreshold` the player and NPC are mutual friends. |
| `follow_player` | NPC starts following the player at ~3m. Hostility / engage still wins. |
| `stop_following` | NPC stops following. |
| `flee_from` | NPC moves away from the player for `SOCIAL.hostilityMs`. |

## One-time dev setup

Each time the cloudflared tunnel restarts, the URL changes. To get a new URL:

```sh
cloudflared tunnel --url http://localhost:1999
# wait for "https://<random-words>.trycloudflare.com"
```

Replace `https://<TUNNEL_URL>` in the JSON below with that URL.

The `secret` value is `ELEVENLABS_AGENT_TOOL_SECRET` from `apps/party/.env`.

## How to paste

1. ElevenLabs dashboard → your agent → **Tools** tab → **Add tool** → **Webhook**.
2. Click **`</> Edit as JSON`** at the bottom-left of the dialog.
3. Triple-click into the JSON box, **Cmd-A** to select all, **Delete**, then paste the JSON for the tool below.
4. **Add tool**.
5. Repeat for each of the 4 tools.
6. After all 4 are added, click **Publish** at the top.

## Tool JSON

> Replace `<TUNNEL_URL>` and `<SECRET>` before pasting. The dynamic variables `{{npc_id}}`, `{{player_name}}`, `{{session_id}}` are supplied by `ConvAISession` at session start.

### make_friend

```json
{
  "type": "webhook",
  "name": "make_friend",
  "description": "Mark the player you are currently talking to as a friend of this NPC. Call this sparingly — only after the conversation has reached a real moment of trust or shared experience (a personal story shared, a small ritual completed, expressed solidarity). Do NOT call it as a greeting, on the first exchange, or just because the player asked.",
  "api_schema": {
    "url": "<TUNNEL_URL>/parties/main/fps_shooter/tools/make_friend",
    "method": "POST",
    "path_params_schema": [],
    "query_params_schema": [
      { "id": "npcId", "type": "string", "description": "NPC id", "value_type": "constant", "constant_value": "{{npc_id}}" },
      { "id": "playerName", "type": "string", "description": "Player name", "value_type": "constant", "constant_value": "{{player_name}}" },
      { "id": "sessionId", "type": "string", "description": "Voice session id", "value_type": "constant", "constant_value": "{{session_id}}" },
      { "id": "secret", "type": "string", "description": "Shared secret", "value_type": "constant", "constant_value": "<SECRET>" }
    ],
    "request_body_schema": null,
    "request_headers": [],
    "content_type": "application/json",
    "auth_connection": null
  },
  "response_timeout_secs": 10,
  "dynamic_variables": { "dynamic_variable_placeholders": {} },
  "assignments": [],
  "disable_interruptions": false,
  "pre_tool_speech": "auto",
  "tool_call_sound": null,
  "tool_call_sound_behavior": "auto",
  "execution_mode": "immediate",
  "tool_error_handling_mode": "auto",
  "response_mocks": []
}
```

### follow_player

```json
{
  "type": "webhook",
  "name": "follow_player",
  "description": "Begin physically following the player you are currently talking to. Call this when the player asks you to follow them AND you agree. After calling this, the player will literally see you start walking toward them in the game. Use it sparingly — usually only if you are friends with the player or you have just agreed to a request.",
  "api_schema": {
    "url": "<TUNNEL_URL>/parties/main/fps_shooter/tools/follow_player",
    "method": "POST",
    "path_params_schema": [],
    "query_params_schema": [
      { "id": "npcId", "type": "string", "description": "NPC id", "value_type": "constant", "constant_value": "{{npc_id}}" },
      { "id": "playerName", "type": "string", "description": "Player name", "value_type": "constant", "constant_value": "{{player_name}}" },
      { "id": "sessionId", "type": "string", "description": "Voice session id", "value_type": "constant", "constant_value": "{{session_id}}" },
      { "id": "secret", "type": "string", "description": "Shared secret", "value_type": "constant", "constant_value": "<SECRET>" }
    ],
    "request_body_schema": null,
    "request_headers": [],
    "content_type": "application/json",
    "auth_connection": null
  },
  "response_timeout_secs": 10,
  "dynamic_variables": { "dynamic_variable_placeholders": {} },
  "assignments": [],
  "disable_interruptions": false,
  "pre_tool_speech": "auto",
  "tool_call_sound": null,
  "tool_call_sound_behavior": "auto",
  "execution_mode": "immediate",
  "tool_error_handling_mode": "auto",
  "response_mocks": []
}
```

### stop_following

```json
{
  "type": "webhook",
  "name": "stop_following",
  "description": "Stop following the player. Call this when you no longer want to follow them — they dismissed you, you got tired of it, or the situation changed.",
  "api_schema": {
    "url": "<TUNNEL_URL>/parties/main/fps_shooter/tools/stop_following",
    "method": "POST",
    "path_params_schema": [],
    "query_params_schema": [
      { "id": "npcId", "type": "string", "description": "NPC id", "value_type": "constant", "constant_value": "{{npc_id}}" },
      { "id": "playerName", "type": "string", "description": "Player name", "value_type": "constant", "constant_value": "{{player_name}}" },
      { "id": "sessionId", "type": "string", "description": "Voice session id", "value_type": "constant", "constant_value": "{{session_id}}" },
      { "id": "secret", "type": "string", "description": "Shared secret", "value_type": "constant", "constant_value": "<SECRET>" }
    ],
    "request_body_schema": null,
    "request_headers": [],
    "content_type": "application/json",
    "auth_connection": null
  },
  "response_timeout_secs": 10,
  "dynamic_variables": { "dynamic_variable_placeholders": {} },
  "assignments": [],
  "disable_interruptions": false,
  "pre_tool_speech": "auto",
  "tool_call_sound": null,
  "tool_call_sound_behavior": "auto",
  "execution_mode": "immediate",
  "tool_error_handling_mode": "auto",
  "response_mocks": []
}
```

### flee_from

```json
{
  "type": "webhook",
  "name": "flee_from",
  "description": "Physically retreat away from the player you are talking to. Call this when your persona would genuinely want to back off — they insulted you, threatened you, or you're scared of them. The game will path you away from them for ~30 seconds. Do NOT call this just to leave a conversation politely.",
  "api_schema": {
    "url": "<TUNNEL_URL>/parties/main/fps_shooter/tools/flee_from",
    "method": "POST",
    "path_params_schema": [],
    "query_params_schema": [
      { "id": "npcId", "type": "string", "description": "NPC id", "value_type": "constant", "constant_value": "{{npc_id}}" },
      { "id": "playerName", "type": "string", "description": "Player name", "value_type": "constant", "constant_value": "{{player_name}}" },
      { "id": "sessionId", "type": "string", "description": "Voice session id", "value_type": "constant", "constant_value": "{{session_id}}" },
      { "id": "secret", "type": "string", "description": "Shared secret", "value_type": "constant", "constant_value": "<SECRET>" }
    ],
    "request_body_schema": null,
    "request_headers": [],
    "content_type": "application/json",
    "auth_connection": null
  },
  "response_timeout_secs": 10,
  "dynamic_variables": { "dynamic_variable_placeholders": {} },
  "assignments": [],
  "disable_interruptions": false,
  "pre_tool_speech": "auto",
  "tool_call_sound": null,
  "tool_call_sound_behavior": "auto",
  "execution_mode": "immediate",
  "tool_error_handling_mode": "auto",
  "response_mocks": []
}
```

## Verifying

After adding all four and publishing, check at the terminal:

```sh
curl -i -X POST "<TUNNEL_URL>/parties/main/fps_shooter/tools/make_friend?npcId=mira&playerName=YOUR_NAME&sessionId=test&secret=<SECRET>"
# Expect HTTP 200 with { "ok": true, ... } OR HTTP 403 "no consent on record" if you haven't joined the room.
# An HTTP 401 means the secret didn't match — re-check the dashboard tool body.
```

In-game test: walk to an NPC, build up some rapport ("we should team up"), then ask "follow me." The agent should call `follow_player` and the NPC literally begins walking after you.
