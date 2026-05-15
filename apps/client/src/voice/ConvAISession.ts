import { Conversation } from '@elevenlabs/client';
import type { TextConversation, VoiceConversation } from '@elevenlabs/client';
import type { NpcDef, TranscriptLine } from '@slipstream-npc/shared';

export interface ConvAICallbacks {
  onTranscript?: (line: TranscriptLine) => void;
  onStatusChange?: (status: 'idle' | 'connecting' | 'connected' | 'ended' | 'error') => void;
  onClientToolCall?: (name: string, params: unknown) => Promise<string> | string;
}

const isPlaceholderAgent = (agentId: string): boolean => agentId.startsWith('TODO_AGENT_ID_');

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

  async start(opts: { memoryBlob: string; voiceId?: string }): Promise<void> {
    if (this.conversation || this.ended) return;
    this.cb.onStatusChange?.('connecting');
    if (isPlaceholderAgent(this.npc.agentId)) {
      console.warn(
        `[voice] NPC "${this.npc.name}" uses a placeholder agent id ${this.npc.agentId}. ` +
          `Author an agent in the ElevenLabs dashboard and update packages/shared/src/npc-roster.ts. ` +
          `Session not started.`,
      );
      this.cb.onStatusChange?.('error');
      return;
    }
    try {
      this.conversation = await Conversation.startSession({
        agentId: this.npc.agentId,
        overrides: {
          agent: {
            prompt: { prompt: opts.memoryBlob },
            firstMessage: undefined,
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
