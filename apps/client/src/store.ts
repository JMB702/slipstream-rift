import { create } from 'zustand';
import type { GameEvent, GameSnapshot, PlayerId, PlayerState } from '@slipstream/shared';

export type ConnState = 'idle' | 'connecting' | 'connected' | 'disconnected';

interface SnapshotEntry {
  receivedAt: number;
  serverTime: number;
  players: Map<PlayerId, PlayerState>;
}

interface State {
  conn: ConnState;
  myId: PlayerId | null;
  serverTimeOffset: number;
  snapshots: SnapshotEntry[];
  events: GameEvent[];
  killFeed: GameEvent[];
  chat: GameEvent[];
  setConn(s: ConnState): void;
  setMyId(id: PlayerId): void;
  ingestSnapshot(s: GameSnapshot): void;
  ingestEvents(e: GameEvent[]): void;
  reset(): void;
}

const SNAPSHOT_BUFFER = 30;
const FEED_LIMIT = 8;

export const useGame = create<State>((set, get) => ({
  conn: 'idle',
  myId: null,
  serverTimeOffset: 0,
  snapshots: [],
  events: [],
  killFeed: [],
  chat: [],

  setConn(s) {
    set({ conn: s });
  },

  setMyId(id) {
    set({ myId: id });
  },

  ingestSnapshot(s) {
    const map = new Map<PlayerId, PlayerState>();
    for (const p of s.players) map.set(p.id, p);
    const entry: SnapshotEntry = {
      receivedAt: performance.now(),
      serverTime: s.serverTime,
      players: map,
    };
    const snapshots = [...get().snapshots, entry];
    while (snapshots.length > SNAPSHOT_BUFFER) snapshots.shift();
    set({ snapshots });
  },

  ingestEvents(events) {
    const prev = get();
    const kills = events.filter((e) => e.type === 'kill');
    const chats = events.filter((e) => e.type === 'chat');
    set({
      events: [...prev.events, ...events].slice(-200),
      killFeed: [...prev.killFeed, ...kills].slice(-FEED_LIMIT),
      chat: [...prev.chat, ...chats].slice(-FEED_LIMIT),
    });
  },

  reset() {
    set({
      conn: 'idle',
      myId: null,
      serverTimeOffset: 0,
      snapshots: [],
      events: [],
      killFeed: [],
      chat: [],
    });
  },
}));

export const latestPlayers = (): Map<PlayerId, PlayerState> => {
  const snaps = useGame.getState().snapshots;
  const last = snaps[snaps.length - 1];
  return last ? last.players : new Map();
};
