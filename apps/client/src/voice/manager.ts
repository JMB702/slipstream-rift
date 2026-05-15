import {
  NPC_VOICE,
  npcById,
  type ClientMessage,
  type ServerMessage,
  type Vec3,
} from '@slipstream-npc/shared';
import { useGame } from '../store.js';
import { getMicStream } from './mic.js';
import { isMuted, onMuteChange } from './mute.js';
import { ConvAISession } from './ConvAISession.js';

interface PendingContext {
  resolve: (msg: Extract<ServerMessage, { type: 'npc_context' }>) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface VoiceManagerDeps {
  send: (msg: ClientMessage) => void;
  myName: string;
}

let deps: VoiceManagerDeps | null = null;
let active: ConvAISession | null = null;
let starting = false;
const pendingContext = new Map<string, PendingContext>();
let muteUnsub: (() => void) | null = null;
let lastSelfPos: Vec3 | null = null;
let lastTickAt = 0;

const POLL_INTERVAL_MS = 250;

export const installVoiceManager = (d: VoiceManagerDeps): void => {
  deps = d;
  if (!muteUnsub) {
    muteUnsub = onMuteChange((m) => {
      active?.setMuted(m);
    });
  }
};

export const teardownVoiceManager = (): void => {
  deps = null;
  void endActive();
  if (muteUnsub) {
    muteUnsub();
    muteUnsub = null;
  }
  for (const p of pendingContext.values()) {
    clearTimeout(p.timer);
    p.reject(new Error('voice manager torn down'));
  }
  pendingContext.clear();
};

export const handleNpcContext = (msg: Extract<ServerMessage, { type: 'npc_context' }>): void => {
  const pending = pendingContext.get(msg.sessionId);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingContext.delete(msg.sessionId);
  pending.resolve(msg);
};

export const handleConsentRequired = (): void => {
  // The local consent gate runs before the lobby, so this only fires if the
  // user joined a room whose server hasn't yet recorded their consent in
  // memory (e.g. server restart). Re-send the current local consent.
  const stored = (() => {
    try {
      return localStorage.getItem('slipstream-npc:consent');
    } catch {
      return null;
    }
  })();
  if (!stored || !deps) return;
  try {
    const parsed = JSON.parse(stored) as { version: string };
    deps.send({ type: 'consent', agreed: true, version: parsed.version });
  } catch {
    // ignore
  }
};

export const tickVoiceProximity = (selfPos: Vec3): void => {
  if (!deps) return;
  lastSelfPos = selfPos;
  const now = performance.now();
  if (now - lastTickAt < POLL_INTERVAL_MS) return;
  lastTickAt = now;

  const closest = findClosestNpc(selfPos);
  if (active) {
    const stillActive =
      closest?.npcId === active.npc.id && closest.dist <= NPC_VOICE.radius + NPC_VOICE.hysteresis;
    if (!stillActive) void endActive();
    return;
  }
  if (starting) return;
  if (!closest || closest.dist > NPC_VOICE.radius) return;
  void startSession(closest.npcId);
};

const findClosestNpc = (
  self: Vec3,
): { npcId: string; dist: number } | null => {
  const snaps = useGame.getState().snapshots;
  const last = snaps[snaps.length - 1];
  if (!last) return null;
  let best: { npcId: string; dist: number } | null = null;
  for (const p of last.players.values()) {
    if (!p.isBot || !p.npcId || !p.alive) continue;
    const dx = p.position[0] - self[0];
    const dy = p.position[1] - self[1];
    const dz = p.position[2] - self[2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!best || d < best.dist) best = { npcId: p.npcId, dist: d };
  }
  return best;
};

const startSession = async (npcId: string): Promise<void> => {
  if (!deps || starting || active) return;
  const npc = npcById(npcId);
  if (!npc) return;
  starting = true;
  const sessionId = `s_${Math.random().toString(36).slice(2, 10)}`;
  try {
    await getMicStream();
  } catch (err) {
    console.warn('[voice] mic permission denied:', err);
    starting = false;
    return;
  }
  let ctxMsg: Extract<ServerMessage, { type: 'npc_context' }>;
  try {
    ctxMsg = await requestContext(npcId, sessionId);
  } catch (err) {
    console.warn('[voice] failed to get npc_context:', err);
    starting = false;
    return;
  }
  const session = new ConvAISession(npc, deps.myName, sessionId, {
    onTranscript: (line) => {
      deps?.send({ type: 'transcript', npcId, sessionId, line });
      useGame.getState().pushTranscript({ npcId, sessionId, line });
    },
    onStatusChange: (status) => {
      useGame.getState().setVoiceSessionStatus(status);
    },
  });
  active = session;
  useGame.getState().setActiveVoiceSession({ npcId, sessionId, npcName: npc.name });
  await session.start({ memoryBlob: ctxMsg.memoryBlob, ...(npc.voiceId ? { voiceId: npc.voiceId } : {}) });
  session.setMuted(isMuted());
  starting = false;
  // Suppress unused-var warning when proximity tick re-uses lastSelfPos in future iterations.
  void lastSelfPos;
};

const requestContext = (
  npcId: string,
  sessionId: string,
): Promise<Extract<ServerMessage, { type: 'npc_context' }>> => {
  if (!deps) return Promise.reject(new Error('no deps'));
  deps.send({ type: 'voice_session_start', npcId, sessionId });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingContext.delete(sessionId);
      reject(new Error('npc_context timeout'));
    }, 5000);
    pendingContext.set(sessionId, { resolve, reject, timer });
  });
};

const endActive = async (): Promise<void> => {
  if (!active) return;
  const s = active;
  active = null;
  useGame.getState().setActiveVoiceSession(null);
  try {
    deps?.send({ type: 'voice_session_end', sessionId: s.sessionId });
  } catch {
    // socket may already be closed
  }
  await s.end();
};
