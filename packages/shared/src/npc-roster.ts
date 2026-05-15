import type { CharacterId } from './state.js';

export interface NpcDef {
  id: string;
  name: string;
  agentId: string;
  voiceId?: string;
  personality: string;
  // Verbatim first line the agent speaks when a session opens. The agent
  // continues in character from there. Keep these short and natural — they
  // are NOT instructions, the agent literally says this text.
  greeting: string;
  startingFriends: string[];
}

export const NPCS: readonly NpcDef[] = [
  {
    id: 'mira',
    name: 'Mira',
    agentId: 'TODO_AGENT_ID_mira',
    personality:
      "Jittery former courier who took one too many bullets and now patrols the arena half-convinced everyone is about to start shooting. Speaks fast, interrupts herself, asks lots of questions. Warms up quickly if you don't seem threatening; will not start a fight but holds a grudge.",
    greeting: "Oh — hey, you. Didn't hear you come up. You're not gonna start anything, right?",
    startingFriends: ['guts'],
  },
  {
    id: 'guts',
    name: 'Guts',
    agentId: 'TODO_AGENT_ID_guts',
    personality:
      "Retired drill sergeant who's seen enough combat for one lifetime and now spends his time complaining about modern firearms safety. Gruff but fundamentally decent. Sizes you up before saying much. Will defend Mira on instinct.",
    greeting: "Mm. You walk loud, kid. What do you want.",
    startingFriends: ['mira'],
  },
  {
    id: 'fennel',
    name: 'Fennel',
    agentId: 'TODO_AGENT_ID_fennel',
    personality:
      "Botanist who took a wrong turn somewhere and now identifies the few plants still growing in the arena. Pacifist by conviction, not just by mood. Asks players about their lives like she's interviewing them. Has zero starting allies but befriends easily.",
    greeting: "Oh! Hi. Sorry — I was looking at this little patch of moss. Are you new around here?",
    startingFriends: [],
  },
  {
    id: 'rook',
    name: 'Rook',
    agentId: 'TODO_AGENT_ID_rook',
    personality:
      "Quiet, watchful, says less than he could. Some history with Guts that neither of them will explain. Plays cards alone when he isn't patrolling. Slow to trust, fast to remember a slight.",
    greeting: "Hey.",
    startingFriends: ['guts'],
  },
];

export const npcById = (id: string): NpcDef | null =>
  NPCS.find((n) => n.id === id) ?? null;

// Female + male visual slots. A bot's character is decided at spawn time
// from the total bot count (see pickCharacterMix), not from the NPC's
// persona — so Mira might be Eve in one match and Maria in another.
export const FEMALE_CHARACTER_IDS: readonly CharacterId[] = ['eve', 'maria', 'medea'];
export const MALE_CHARACTER_ID: CharacterId = 'soldier';

const shuffle = <T,>(xs: readonly T[]): T[] => {
  const out = xs.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

// Maps total bot count to the character mix for that match.
//   1 bot  -> 1 female
//   2 bots -> 2 females
//   3 bots -> 2 females + 1 male
//   4 bots -> 3 females + 1 male
//   5+     -> uniform random across all available slots
// Returned in spawn-order; spawnBots assigns by index.
export const pickCharacterMix = (botCount: number): CharacterId[] => {
  if (botCount <= 0) return [];
  const females = shuffle(FEMALE_CHARACTER_IDS);
  switch (botCount) {
    case 1:
      return [females[0]!];
    case 2:
      return [females[0]!, females[1]!];
    case 3:
      return [females[0]!, females[1]!, MALE_CHARACTER_ID];
    case 4:
      return [females[0]!, females[1]!, females[2]!, MALE_CHARACTER_ID];
    default: {
      const pool: CharacterId[] = [...FEMALE_CHARACTER_IDS, MALE_CHARACTER_ID];
      const out: CharacterId[] = [];
      for (let i = 0; i < botCount; i++) {
        out.push(pool[Math.floor(Math.random() * pool.length)]!);
      }
      return out;
    }
  }
};
