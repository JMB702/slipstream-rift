import type * as Party from 'partykit/server';
import {
  BOT_PROFILES,
  DEFAULT_MAP_ID,
  MATCH,
  MAX_PLAYERS,
  NPCS,
  PLAYER,
  SOCIAL,
  SNAPSHOT_MS,
  TICK_MS,
  WEAPON,
  decode,
  encode,
  isBotDifficulty,
  isMapId,
  npcById,
  setActiveMap,
  type BotDifficulty,
  type ClientMessage,
  type GameEvent,
  type GameSnapshot,
  type NpcDef,
  type ServerMessage,
  type TranscriptLine,
  type Vec3,
} from '@slipstream-npc/shared';
import {
  applyInput,
  finishReload,
  integrateIdle,
  maybeRespawn,
  pushPositionHistory,
  regenHealth,
  tickVault,
  tryFire,
} from './simulation.js';
import { initialPlayer, randomSpawn, type ServerPlayer } from './state.js';
import { ensureBotDefaults, tickBot } from './bots/controller.js';
import { pruneHostility } from './social.js';
import { GameStorage } from './storage.js';

export const CONSENT_VERSION = 'v1';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
};

export default class SlipstreamServer implements Party.Server {
  readonly options: Party.ServerOptions = {
    hibernate: false,
  };

  private players = new Map<string, ServerPlayer>();
  // Pending fires queued during input dispatch, drained once per tick. We
  // hold the camera-resolved aim alongside the player id so tryFire can
  // cast from the camera origin instead of the player's eye, fixing the
  // third-person parallax that lets ledges block what the reticle clears.
  // null payload → fall back to eye + yaw/pitch (older clients, bots, or
  // any frame whose camera ray we couldn't compute).
  private pendingFire = new Map<string, { aimOrigin: Vec3; aim: Vec3 } | null>();
  private events: GameEvent[] = [];
  private tick = 0;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private snapshotTimer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  // Match-mode state. killTarget is locked the moment the room first gets
  // a player (the first joiner picks via ?killTarget=); subsequent joiners
  // can't change it. Winner+resetAt set together when someone hits the
  // target; resetAt fires once and clears both, starting a fresh round.
  private killTarget: number = MATCH.defaultKillTarget;
  private killTargetLocked = false;
  // Bot count is locked alongside killTarget by the first joiner. Locked
  // separately so refreshing the host doesn't change the in-progress match.
  private botCount: number = MATCH.defaultBotCount;
  private botCountLocked = false;
  private botDifficulty: BotDifficulty = MATCH.defaultBotDifficulty;
  private winnerId: string | null = null;
  private resetAt: number | null = null;
  // Voice state lives in PartyKit room.storage (Cloudflare Durable Object).
  // Survives room restarts and reconnects. GameStorage is a thin write-back
  // cache; reads are cheap once warm, writes go through to disk.
  private store: GameStorage;
  // Local cache of "this player has agreed in this connection" — separate
  // from store.consent so we don't do an async lookup on the hot transcript
  // path. Cleared on disconnect. The storage record is the source of truth.
  private liveConsent = new Set<string>();

  constructor(readonly room: Party.Room) {
    this.store = new GameStorage(room.storage);
  }

  onStart(): void {
    this.startedAt = Date.now();
    // The PartyKit room id IS the map id — Lobby's dropdown maps directly
    // onto room name. Unknown ids fall back to the default map so dev/test
    // rooms with arbitrary names still boot something playable.
    setActiveMap(isMapId(this.room.id) ? this.room.id : DEFAULT_MAP_ID);
    this.startTimers();
  }

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext): void {
    const url = new URL(ctx.request.url);

    // Reject mismatched map ids up front so the client can't silently end
    // up in a room whose physics differ from what the lobby promised.
    const queryMap = url.searchParams.get('mapId');
    const expected = isMapId(this.room.id) ? this.room.id : DEFAULT_MAP_ID;
    if (queryMap && queryMap !== expected) {
      conn.close(4002, `wrong map: room is ${expected}`);
      return;
    }

    // Optional access-code gate. If ACCESS_CODE is set in the room's env
    // (apps/party/.env in dev, `partykit env add` in prod), every
    // connection must present a matching ?accessCode= or the socket is
    // closed with code 4003. Unset = no gate (handy in CI / private LAN).
    // PartyKit exposes env on Room — process.env is NOT populated in the
    // Workers runtime, so reading from this.room.env is the only path that
    // works in both dev and prod.
    const required = (this.room.env.ACCESS_CODE as string | undefined) ?? '';
    if (required) {
      const provided = url.searchParams.get('accessCode') ?? '';
      if (provided !== required) {
        conn.close(4003, 'invalid access code');
        return;
      }
    }

    if (this.players.size >= MAX_PLAYERS) {
      conn.close(4001, 'room full');
      return;
    }
    const name = (url.searchParams.get('name') ?? 'Player').slice(0, 24) || 'Player';
    if (!this.killTargetLocked) {
      const raw = url.searchParams.get('killTarget');
      const parsed = raw == null ? NaN : Math.floor(Number(raw));
      if (Number.isFinite(parsed)) {
        this.killTarget = Math.max(
          MATCH.minKillTarget,
          Math.min(MATCH.maxKillTarget, parsed),
        );
      }
      this.killTargetLocked = true;
    }
    if (!this.botCountLocked) {
      const raw = url.searchParams.get('botCount');
      const parsed = raw == null ? NaN : Math.floor(Number(raw));
      if (Number.isFinite(parsed)) {
        this.botCount = Math.max(
          MATCH.minBotCount,
          Math.min(MATCH.maxBotCount, parsed),
        );
      }
      const rawDiff = url.searchParams.get('botDifficulty') ?? '';
      if (isBotDifficulty(rawDiff)) this.botDifficulty = rawDiff;
      // Difficulty is locked alongside botCount — refreshing the host can't
      // soften live opponents mid-match.
      this.botCountLocked = true;
    }
    const player = initialPlayer(conn.id, conn.id, name, randomSpawn(), this.serverTime(), {
      isBot: false,
      characterId: 'soldier',
    });
    this.players.set(conn.id, player);
    this.spawnBots(this.serverTime());

    // If the room had emptied out, timers were stopped — restart them now.
    this.startTimers();

    this.send(conn, {
      type: 'welcome',
      you: player.id,
      serverTime: this.serverTime(),
    });
    this.broadcastSnapshot();
  }

  private startTimers(): void {
    if (this.tickTimer === null) {
      this.tickTimer = setInterval(() => this.runTick(), TICK_MS);
    }
    if (this.snapshotTimer === null) {
      this.snapshotTimer = setInterval(() => this.broadcastSnapshot(), SNAPSHOT_MS);
    }
  }

  onMessage(raw: string, sender: Party.Connection): void {
    const player = this.players.get(sender.id);
    if (!player) return;

    let msg: ClientMessage;
    try {
      msg = decode<ClientMessage>(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'hello': {
        player.name = (msg.name ?? 'Player').slice(0, 24) || 'Player';
        return;
      }
      case 'input': {
        const now = this.serverTime();
        const frozen = this.winnerId !== null;
        for (const frame of msg.frames) {
          if (frame.seq <= player.lastSeenSeq) continue;
          // No firing while sprinting — silently demote sprint when fire is
          // pressed. Player walks-while-firing instead of running-while-firing.
          // Reloading at sprint speed is allowed; the client picks ReloadRun.
          // Also drop fire entirely while the round is in victory-freeze.
          let effectiveFrame =
            frame.fire && frame.sprint ? { ...frame, sprint: false } : frame;
          if (frozen && effectiveFrame.fire) {
            effectiveFrame = { ...effectiveFrame, fire: false };
          }
          applyInput(player, effectiveFrame, now);
          if (effectiveFrame.fire) {
            const aim =
              effectiveFrame.aimOrigin && effectiveFrame.aim
                ? { aimOrigin: effectiveFrame.aimOrigin, aim: effectiveFrame.aim }
                : null;
            this.pendingFire.set(player.id, aim);
          }
        }
        return;
      }
      case 'chat': {
        const text = (msg.text ?? '').slice(0, 200);
        if (!text.trim()) return;
        this.events.push({
          type: 'chat',
          fromId: player.id,
          fromName: player.name,
          text,
          at: this.serverTime(),
        });
        return;
      }
      case 'ping': {
        this.send(sender, { type: 'pong', t: msg.t, serverTime: this.serverTime() });
        return;
      }
      case 'consent': {
        if (!msg.agreed) return;
        const playerName = player.name;
        this.liveConsent.add(playerName);
        void this.store.setConsent(playerName, {
          version: msg.version,
          agreedAt: Date.now(),
        });
        return;
      }
      case 'voice_session_start': {
        void this.handleVoiceSessionStart(player.name, msg.npcId, msg.sessionId, sender);
        return;
      }
      case 'voice_session_end': {
        return;
      }
      case 'transcript': {
        const playerName = player.name;
        if (!this.liveConsent.has(playerName)) {
          // The consent may live in storage from a prior session; check
          // before dropping. Hot path consent check is fast in cache.
          void this.store.getConsent(playerName).then((rec) => {
            if (!rec) return;
            this.liveConsent.add(playerName);
            this.acceptTranscript(msg.npcId, playerName, msg.line);
          });
          return;
        }
        this.acceptTranscript(msg.npcId, playerName, msg.line);
        return;
      }
    }
  }

  onClose(conn: Party.Connection): void {
    this.players.delete(conn.id);
    this.pendingFire.delete(conn.id);
    // If the only humans are gone, drop the bots too — no point simulating an
    // empty arena. They respawn with the next human via spawnBots().
    if (this.humanCount() === 0) {
      this.removeAllBots();
    }
    if (this.players.size === 0) {
      this.stopTimers();
      // Empty room — release the killTarget and botCount locks so the next
      // first-joiner can pick fresh values.
      this.killTargetLocked = false;
      this.botCountLocked = false;
      this.winnerId = null;
      this.resetAt = null;
    }
  }

  private humanCount(): number {
    let n = 0;
    for (const p of this.players.values()) {
      if (!p.isBot) n += 1;
    }
    return n;
  }

  private spawnBots(now: number): void {
    const desired = Math.min(this.botCount, MAX_PLAYERS - this.humanCount());
    let existing = 0;
    for (const p of this.players.values()) if (p.isBot) existing += 1;
    const toAdd = Math.max(0, desired - existing);
    // Track which NPC ids are already in the room so we don't double-spawn the
    // same persona — names key the friendship/transcript graph, so duplicate
    // names would alias state. With botCount > NPCS.length we run out and
    // simply spawn fewer bots than requested.
    const taken = new Set<string>();
    for (const p of this.players.values()) {
      if (p.isBot && p.npcId !== undefined) taken.add(p.npcId);
    }
    const free: NpcDef[] = NPCS.filter((n) => !taken.has(n.id));
    const slots = Math.min(toAdd, free.length);
    for (let i = 0; i < slots; i++) {
      const def = free[i]!;
      const id = `bot-${def.id}-${Math.random().toString(36).slice(2, 7)}`;
      const friendNames = def.startingFriends
        .map((fid) => npcById(fid)?.name)
        .filter((n): n is string => typeof n === 'string');
      const bot = initialPlayer(id, id, def.name, randomSpawn(), now, {
        isBot: true,
        characterId: 'ch35',
      });
      bot.npcId = def.id;
      bot.friendsWith = friendNames;
      ensureBotDefaults(bot, now);
      this.players.set(id, bot);
    }
  }

  private removeAllBots(): void {
    for (const [id, p] of this.players) {
      if (p.isBot) {
        this.players.delete(id);
        this.pendingFire.delete(id);
      }
    }
  }

  onError(_conn: Party.Connection, err: Error): void {
    console.error('connection error', err);
  }

  async onRequest(req: Party.Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);
    // PartyKit prefixes routes with /parties/<party>/<room>; the trailing path
    // is what callers configure in the ElevenLabs dashboard.
    if (!url.pathname.endsWith('/tools/make_friend')) {
      return jsonResponse({ error: 'not found' }, 404);
    }
    const expected = (this.room.env.ELEVENLABS_AGENT_TOOL_SECRET as string | undefined) ?? '';
    if (!expected) return jsonResponse({ error: 'tools disabled' }, 503);

    let body: { npcId?: string; playerName?: string; sessionId?: string; secret?: string };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return jsonResponse({ error: 'bad json' }, 400);
    }
    if (!constantTimeEqual(body.secret ?? '', expected)) {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }
    const npcId = body.npcId ?? '';
    const playerName = body.playerName ?? '';
    const npc = npcById(npcId);
    if (!npc || !playerName) return jsonResponse({ error: 'bad params' }, 400);
    if (!(await this.store.getConsent(playerName))) {
      return jsonResponse({ error: 'no consent on record' }, 403);
    }

    const result = await this.store.addFriendshipScore(
      npcId,
      playerName,
      SOCIAL.friendBoost,
      SOCIAL.friendThreshold,
    );

    if (result.becameFriend) {
      // Mirror the friendship into the live player and NPC ServerPlayers so
      // the next broadcast snapshot reflects the new friendship pip and the
      // hostility-propagation rules in social.markAttack see them as friends.
      for (const p of this.players.values()) {
        if (p.name === playerName && !p.friendsWith.includes(npc.name)) {
          p.friendsWith.push(npc.name);
        }
        if (p.isBot && p.npcId === npc.id && !p.friendsWith.includes(playerName)) {
          p.friendsWith.push(playerName);
        }
      }
    }

    return jsonResponse({ ok: true, score: result.score, becameFriend: result.becameFriend });
  }

  private runTick(): void {
    const now = this.serverTime();
    const all = Array.from(this.players.values());

    for (const p of all) {
      finishReload(p, now);
      maybeRespawn(p, now);
      regenHealth(p, now);
      pruneHostility(p, now);
      // Vault tween (if any) drives position; must run before integrateIdle
      // since integrateIdle is no-op while vaulting and we want position fresh.
      tickVault(p, now);
    }

    // Bots produce input frames here, BEFORE integrateIdle so their applyInput
    // call updates lastIntegratedAt — otherwise integrateIdle would slap a
    // duplicate physics step on top of the controller's frame.
    if (this.winnerId === null) {
      const profile =
        BOT_PROFILES[this.botDifficulty] ?? BOT_PROFILES[MATCH.defaultBotDifficulty];
      for (const p of all) {
        if (!p.isBot) continue;
        const fired = tickBot(p, all, now, profile);
        // Bots have no camera; null payload routes server through the
        // eye-from-yaw/pitch fallback in tryFire.
        if (fired) this.pendingFire.set(p.id, null);
      }
    }

    for (const p of all) {
      // Run physics for any time gap that hasn't already been integrated by an
      // arriving input — keeps idle/AFK/just-spawned players from floating.
      integrateIdle(p, now);
      // Stamp position into the rewind buffer AFTER all this tick's physics
      // is final, so the buffer reflects the same positions broadcast in the
      // upcoming snapshot. tryFire below uses these to rewind hit detection.
      pushPositionHistory(p, now);
    }

    if (this.winnerId === null && this.pendingFire.size > 0) {
      for (const [id, aim] of this.pendingFire) {
        const shooter = this.players.get(id);
        if (!shooter) continue;
        const fired = tryFire(shooter, all, now, aim);
        if (fired.length > 0) this.events.push(...fired);
      }
      this.pendingFire.clear();

      // Did anyone hit the kill target this tick? Pick the highest-scoring
      // player as the winner (ties broken by player insertion order).
      let winner: ServerPlayer | null = null;
      for (const p of all) {
        if (p.kills >= this.killTarget && (winner === null || p.kills > winner.kills)) {
          winner = p;
        }
      }
      if (winner) {
        this.winnerId = winner.id;
        this.resetAt = now + MATCH.victoryHoldMs;
        this.events.push({
          type: 'gameover',
          winnerId: winner.id,
          winnerName: winner.name,
          killTarget: this.killTarget,
          at: now,
        });
      }
    } else {
      this.pendingFire.clear();
    }

    if (this.resetAt !== null && now >= this.resetAt) {
      this.resetRound(now, all);
    }

    this.tick += 1;
  }

  private resetRound(now: number, all: ServerPlayer[]): void {
    for (const p of all) {
      p.kills = 0;
      p.deaths = 0;
      p.health = PLAYER.maxHealth;
      p.alive = true;
      p.respawnAt = null;
      p.position = randomSpawn();
      p.velocity = [0, 0, 0];
      p.ammo = WEAPON.magazineSize;
      p.reloading = false;
      p.reloadDoneAt = null;
      p.lastDamagedAt = 0;
      p.lastIntegratedAt = now;
      p.grounded = true;
      if (p.isBot) ensureBotDefaults(p, now);
    }
    this.winnerId = null;
    this.resetAt = null;
  }

  private broadcastSnapshot(): void {
    if (this.players.size === 0) return;

    const snapshot: GameSnapshot = {
      serverTime: this.serverTime(),
      tick: this.tick,
      players: Array.from(this.players.values()).map(stripServerOnly),
      killTarget: this.killTarget,
      winnerId: this.winnerId,
    };
    this.room.broadcast(encode<ServerMessage>({ type: 'snapshot', snapshot }));

    if (this.events.length > 0) {
      this.room.broadcast(encode<ServerMessage>({ type: 'events', events: this.events }));
      this.events = [];
    }
  }

  private send(conn: Party.Connection, msg: ServerMessage): void {
    conn.send(encode(msg));
  }

  private acceptTranscript(npcId: string, playerName: string, line: TranscriptLine): void {
    const text = (line.text ?? '').slice(0, 500);
    if (!text.trim()) return;
    void this.store.appendTranscript(npcId, playerName, {
      role: line.role,
      text,
      at: line.at,
    });
  }

  private async handleVoiceSessionStart(
    playerName: string,
    npcId: string,
    sessionId: string,
    sender: Party.Connection,
  ): Promise<void> {
    if (!this.liveConsent.has(playerName)) {
      const stored = await this.store.getConsent(playerName);
      if (stored) this.liveConsent.add(playerName);
    }
    if (!this.liveConsent.has(playerName)) {
      this.send(sender, { type: 'consent_required', version: CONSENT_VERSION });
      return;
    }
    const npc = npcById(npcId);
    if (!npc) return;
    const friendship = (await this.store.getFriendship(npcId, playerName)).score;
    const memoryBlob = await this.buildMemoryBlob(npc, playerName);
    this.send(sender, {
      type: 'npc_context',
      npcId,
      sessionId,
      memoryBlob,
      friendship,
    });
  }

  private async buildMemoryBlob(npc: NpcDef, playerName: string): Promise<string> {
    const friendship = await this.store.getFriendship(npc.id, playerName);
    const ours = await this.store.getTranscript(npc.id, playerName);
    const recentOurs = ours.slice(-10);
    const cutoff = Date.now() - 5 * 60_000;
    const others = await this.store.listRecentForNpc(npc.id, playerName, cutoff);
    others.sort((a, b) => a.line.at - b.line.at);
    const tail = others.slice(-5);
    const lines: string[] = [];
    lines.push(`You are ${npc.name}. ${npc.personality}`);
    lines.push(
      `Friendship score with ${playerName}: ${friendship.score} (threshold ${SOCIAL.friendThreshold}).` +
        (friendship.score >= SOCIAL.friendThreshold ? ' They are your friend.' : ''),
    );
    if (recentOurs.length > 0) {
      lines.push(`Recent conversation with ${playerName}:`);
      for (const l of recentOurs) {
        const who = l.role === 'user' ? playerName : npc.name;
        lines.push(`  ${who}: ${l.text}`);
      }
    }
    if (tail.length > 0) {
      lines.push('Other players you have spoken with recently:');
      for (const o of tail) {
        const who = o.line.role === 'user' ? o.playerName : npc.name;
        lines.push(`  ${who}: ${o.line.text}`);
      }
    }
    return lines.join('\n').slice(0, 2048);
  }

  private serverTime(): number {
    return Date.now() - this.startedAt;
  }

  private stopTimers(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
  }
}

const stripServerOnly = (p: ServerPlayer) => ({
  id: p.id,
  name: p.name,
  position: p.position,
  velocity: p.velocity,
  yaw: p.yaw,
  pitch: p.pitch,
  health: p.health,
  alive: p.alive,
  respawnAt: p.respawnAt,
  ammo: p.ammo,
  reloading: p.reloading,
  reloadDoneAt: p.reloadDoneAt,
  vaulting: p.vaulting,
  kills: p.kills,
  deaths: p.deaths,
  lastSeenSeq: p.lastSeenSeq,
  isBot: p.isBot,
  characterId: p.characterId,
  npcId: p.npcId,
  friendsWith: p.friendsWith,
});
