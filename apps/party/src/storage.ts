import type * as Party from 'partykit/server';
import type { TranscriptLine } from '@slipstream-npc/shared';

export interface ConsentRecord {
  version: string;
  agreedAt: number;
}

export interface FriendshipRecord {
  score: number;
  becameFriendAt?: number;
}

const TRANSCRIPT_CAP = 200;

const consentKey = (playerName: string): string => `consent:${playerName}`;
const friendshipKey = (npcId: string, playerName: string): string => `friend:${npcId}:${playerName}`;
const transcriptKey = (npcId: string, playerName: string): string => `tx:${npcId}:${playerName}`;

// Write-back cache over PartyKit room.storage (Cloudflare Durable Object).
// Hot-path reads stay in-memory; writes update the cache and queue an async
// put. Storage misses fall through to a single read which then populates the
// cache. Maps survive across re-entry of onMessage handlers since the class
// instance lives for the room's lifetime.
export class GameStorage {
  private consents = new Map<string, ConsentRecord>();
  private friendships = new Map<string, FriendshipRecord>();
  private transcripts = new Map<string, TranscriptLine[]>();
  private consentLoaded = new Set<string>();
  private friendshipLoaded = new Set<string>();
  private transcriptLoaded = new Set<string>();

  constructor(private storage: Party.Storage) {}

  async getConsent(playerName: string): Promise<ConsentRecord | null> {
    if (this.consentLoaded.has(playerName)) {
      return this.consents.get(playerName) ?? null;
    }
    const stored = (await this.storage.get<ConsentRecord>(consentKey(playerName))) ?? null;
    this.consentLoaded.add(playerName);
    if (stored) this.consents.set(playerName, stored);
    return stored;
  }

  async setConsent(playerName: string, record: ConsentRecord): Promise<void> {
    this.consents.set(playerName, record);
    this.consentLoaded.add(playerName);
    await this.storage.put(consentKey(playerName), record);
  }

  async getFriendship(npcId: string, playerName: string): Promise<FriendshipRecord> {
    const k = friendshipKey(npcId, playerName);
    if (this.friendshipLoaded.has(k)) {
      return this.friendships.get(k) ?? { score: 0 };
    }
    const stored = (await this.storage.get<FriendshipRecord>(k)) ?? { score: 0 };
    this.friendshipLoaded.add(k);
    this.friendships.set(k, stored);
    return stored;
  }

  async setFriendship(npcId: string, playerName: string, record: FriendshipRecord): Promise<void> {
    const k = friendshipKey(npcId, playerName);
    this.friendships.set(k, record);
    this.friendshipLoaded.add(k);
    await this.storage.put(k, record);
  }

  async addFriendshipScore(
    npcId: string,
    playerName: string,
    delta: number,
    threshold: number,
  ): Promise<{ score: number; becameFriend: boolean }> {
    const current = await this.getFriendship(npcId, playerName);
    const wasFriend = current.score >= threshold;
    const nextScore = Math.max(0, Math.min(100, current.score + delta));
    const isFriend = nextScore >= threshold;
    const next: FriendshipRecord = {
      score: nextScore,
      ...(isFriend && !current.becameFriendAt ? { becameFriendAt: Date.now() } : {}),
    };
    if (current.becameFriendAt && !next.becameFriendAt) next.becameFriendAt = current.becameFriendAt;
    await this.setFriendship(npcId, playerName, next);
    return { score: nextScore, becameFriend: !wasFriend && isFriend };
  }

  async getTranscript(npcId: string, playerName: string): Promise<TranscriptLine[]> {
    const k = transcriptKey(npcId, playerName);
    if (this.transcriptLoaded.has(k)) {
      return this.transcripts.get(k) ?? [];
    }
    const stored = (await this.storage.get<TranscriptLine[]>(k)) ?? [];
    this.transcriptLoaded.add(k);
    this.transcripts.set(k, stored);
    return stored;
  }

  async appendTranscript(
    npcId: string,
    playerName: string,
    line: TranscriptLine,
  ): Promise<void> {
    const k = transcriptKey(npcId, playerName);
    const list = await this.getTranscript(npcId, playerName);
    list.push(line);
    while (list.length > TRANSCRIPT_CAP) list.shift();
    this.transcripts.set(k, list);
    await this.storage.put(k, list);
  }

  async listRecentForNpc(
    npcId: string,
    excludePlayer: string,
    sinceMs: number,
  ): Promise<{ playerName: string; line: TranscriptLine }[]> {
    const prefix = `tx:${npcId}:`;
    // Hot path: prefer cached entries since we may already have them in memory
    // from prior session starts. listRecent is called once per session start
    // and isn't latency-critical, but avoiding a storage scan when the answer
    // is already in cache keeps it cheap.
    const cachedKeys = new Set<string>();
    const out: { playerName: string; line: TranscriptLine }[] = [];
    const fold = (key: string, lines: TranscriptLine[]) => {
      const playerName = key.slice(prefix.length);
      if (playerName === excludePlayer) return;
      for (let i = lines.length - 1; i >= 0; i--) {
        const l = lines[i]!;
        if (l.at < sinceMs) break;
        out.push({ playerName, line: l });
      }
    };
    for (const [k, v] of this.transcripts) {
      if (!k.startsWith(prefix)) continue;
      cachedKeys.add(k);
      fold(k, v);
    }
    // Fall through to storage scan to catch transcripts we haven't loaded yet
    // this session. Cheap when there are few transcripts; only runs at session
    // start so the per-tick budget is unaffected.
    const stored = await this.storage.list<TranscriptLine[]>({ prefix });
    for (const [k, v] of stored) {
      if (cachedKeys.has(k)) continue;
      this.transcripts.set(k, v);
      this.transcriptLoaded.add(k);
      fold(k, v);
    }
    return out;
  }
}
