import { Conversation } from '@elevenlabs/client';
import type { TextConversation, VoiceConversation } from '@elevenlabs/client';
import type { NpcDef, TranscriptLine } from '@slipstream-npc/shared';

export interface ConvAICallbacks {
  onTranscript?: (line: TranscriptLine) => void;
  onStatusChange?: (status: 'idle' | 'connecting' | 'connected' | 'ended' | 'error') => void;
  onModeChange?: (mode: 'speaking' | 'listening') => void;
  onClientToolCall?: (name: string, params: unknown) => Promise<string> | string;
}

export class ConvAISession {
  readonly sessionId: string;
  readonly npc: NpcDef;
  readonly playerName: string;
  private conversation: VoiceConversation | TextConversation | null = null;
  private startedAt = 0;
  private ended = false;
  private cb: ConvAICallbacks;

  constructor(npc: NpcDef, playerName: string, sessionId: string, cb: ConvAICallbacks) {
    this.npc = npc;
    this.playerName = playerName;
    this.sessionId = sessionId;
    this.cb = cb;
  }

  async start(opts: {
    agentId?: string;
    signedUrl?: string;
    memoryBlob: string;
    voiceId?: string;
  }): Promise<void> {
    if (this.conversation || this.ended) return;
    this.cb.onStatusChange?.('connecting');
    if (!opts.agentId && !opts.signedUrl) {
      console.warn(`[voice] no agentId or signedUrl provided for ${this.npc.name}`);
      this.cb.onStatusChange?.('error');
      return;
    }
    const authConfig = opts.signedUrl
      ? ({ signedUrl: opts.signedUrl } as const)
      : ({ agentId: opts.agentId! } as const);
    try {
      const pool = this.npc.greetings;
      const greeting = pool[Math.floor(Math.random() * pool.length)] ?? '';
      this.conversation = await Conversation.startSession({
        ...authConfig,
        overrides: {
          agent: {
            prompt: { prompt: opts.memoryBlob },
            firstMessage: greeting,
          },
          ...(opts.voiceId ? { tts: { voiceId: opts.voiceId } } : {}),
        },
        dynamicVariables: {
          npc_id: this.npc.id,
          player_name: this.playerName,
          session_id: this.sessionId,
        },
        onConnect: () => {
          this.startedAt = Date.now();
          this.cb.onStatusChange?.('connected');
        },
        onDisconnect: () => {
          this.cb.onStatusChange?.('ended');
        },
        onModeChange: ({ mode }) => {
          this.cb.onModeChange?.(mode);
        },
        onError: (msg) => {
          console.warn(`[voice] session error for ${this.npc.name}: ${msg}`);
          this.cb.onStatusChange?.('error');
        },
        onMessage: ({ message, role }) => {
          if (!message) return;
          this.cb.onTranscript?.({
            role: role === 'user' ? 'user' : 'agent',
            text: message,
            at: Date.now(),
          });
        },
        clientTools: {
          // Reserved for v2 client-tool calls. Today the make_friend tool
          // is a server webhook (Phase 6) so the agent doesn't need a
          // browser-side handler.
        },
      });
    } catch (err) {
      console.warn(`[voice] startSession failed for ${this.npc.name}:`, err);
      this.cb.onStatusChange?.('error');
    }
  }

  setMuted(muted: boolean): void {
    if (!this.conversation) return;
    if ('setMicMuted' in this.conversation) this.conversation.setMicMuted(muted);
  }

  // Inject a system-level message into the live conversation. Used by the
  // game to feed in-game events (damage, player movement, kill score) to the
  // agent so it can react in voice mid-conversation. The SDK queues these
  // until the agent's next turn.
  sendContextualUpdate(text: string): void {
    if (!this.conversation) return;
    try {
      this.conversation.sendContextualUpdate(text);
    } catch (err) {
      console.warn(`[voice] sendContextualUpdate failed:`, err);
    }
  }

  // Realtime volume probes from the SDK — used to gate the on-head speaker
  // icons on actual audio activity, not just session-open. Returns 0 when
  // there's no live conversation yet.
  getInputVolume(): number {
    if (!this.conversation) return 0;
    try {
      return this.conversation.getInputVolume() || 0;
    } catch {
      return 0;
    }
  }

  getOutputVolume(): number {
    if (!this.conversation) return 0;
    try {
      return this.conversation.getOutputVolume() || 0;
    } catch {
      return 0;
    }
  }

  async end(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    try {
      await this.conversation?.endSession();
    } catch {
      // The SDK throws if the connection was never established; safe to ignore.
    }
    this.conversation = null;
    this.cb.onStatusChange?.('ended');
  }

  get durationMs(): number {
    return this.startedAt ? Date.now() - this.startedAt : 0;
  }
}
