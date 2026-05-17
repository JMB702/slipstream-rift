import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_MAP_ID,
  MAPS,
  MATCH,
  NPCS,
  isBotDifficulty,
  isMapId,
  type BotDifficulty,
  type MapId,
} from '@slipstream-npc/shared';
import { useGame } from '../store.js';
import { CLONE_PROMPT } from './clonePrompt.js';

interface Props {
  onJoin(args: {
    name: string;
    mapId: MapId;
    killTarget: number;
    accessCode: string;
    botCount: number;
    botDifficulty: BotDifficulty;
    npcIds: string[];
  }): void;
}

const ACCESS_CODE_LEN = 4;

export const Lobby = ({ onJoin }: Props) => {
  const [name, setName] = useState(() => loadName());
  const [mapId, setMapId] = useState<MapId>(() => loadMap());
  const [killTarget, setKillTarget] = useState<string>(String(MATCH.defaultKillTarget));
  const [botCount, setBotCount] = useState<string>(String(MATCH.defaultBotCount));
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>(MATCH.defaultBotDifficulty);
  const [npcIds, setNpcIds] = useState<string[]>(() => loadNpcIds());
  const [accessCode, setAccessCode] = useState(() => loadCode());
  const [localError, setLocalError] = useState<string | null>(null);
  const closeReason = useGame((s) => s.lastCloseReason);
  const conn = useGame((s) => s.conn);
  const error = localError ?? closeReason;
  const codeOk = accessCode.length === ACCESS_CODE_LEN;

  const parsedBotCount = useMemo(() => {
    const parsed = Math.floor(Number(botCount));
    return Number.isFinite(parsed)
      ? Math.max(MATCH.minBotCount, Math.min(MATCH.maxBotCount, parsed))
      : MATCH.defaultBotCount;
  }, [botCount]);

  // Walk slot-by-slot, honoring the user's current pick when it's a real NPC
  // and not yet taken by an earlier slot; otherwise fall back to the first
  // NPC still available. Guarantees no duplicates regardless of stale
  // localStorage state.
  const slotIds = useMemo(() => {
    const used = new Set<string>();
    const out: string[] = [];
    for (let i = 0; i < parsedBotCount; i++) {
      const pick = npcIds[i];
      if (pick && NPCS.some((n) => n.id === pick) && !used.has(pick)) {
        out.push(pick);
        used.add(pick);
        continue;
      }
      const fallback = NPCS.find((n) => !used.has(n.id));
      if (!fallback) break;
      out.push(fallback.id);
      used.add(fallback.id);
    }
    return out;
  }, [npcIds, parsedBotCount]);

  return (
    <div style={overlay}>
      <div style={panel}>
        <h1 style={{ margin: 0, fontSize: 36, letterSpacing: 2 }}>SLIPSTREAM</h1>
        <p style={{ opacity: 0.7, marginTop: 4 }}>3rd-person multiplayer arena</p>

        <label style={label}>
          Name
          <input
            style={input}
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label style={label}>
          Map
          <select
            style={input}
            value={mapId}
            onChange={(e) => {
              const v = e.target.value;
              if (isMapId(v)) setMapId(v);
            }}
          >
            {Object.values(MAPS).map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        </label>

        <label style={label}>
          Kills to win
          <input
            style={input}
            type="number"
            inputMode="numeric"
            min={MATCH.minKillTarget}
            max={MATCH.maxKillTarget}
            value={killTarget}
            onChange={(e) => setKillTarget(e.target.value.replace(/[^0-9]/g, ''))}
          />
          <span style={hint}>
            Locked by the first player in the room. {MATCH.minKillTarget}–{MATCH.maxKillTarget}.
          </span>
        </label>

        <label style={label}>
          Bots
          <input
            style={input}
            type="number"
            inputMode="numeric"
            min={MATCH.minBotCount}
            max={MATCH.maxBotCount}
            value={botCount}
            onChange={(e) => setBotCount(e.target.value.replace(/[^0-9]/g, ''))}
          />
          <span style={hint}>
            Enemy AI in the arena. {MATCH.minBotCount}–{MATCH.maxBotCount}. Locked by first player.
          </span>
        </label>

        {slotIds.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, opacity: 0.85 }}>NPC roster</div>
            {slotIds.map((id, i) => (
              <select
                key={i}
                style={{ ...input, marginTop: 6 }}
                value={id}
                onChange={(e) => {
                  const chosen = e.target.value;
                  if (!NPCS.some((n) => n.id === chosen)) return;
                  const next = [...slotIds];
                  next[i] = chosen;
                  setNpcIds(next);
                }}
              >
                {NPCS.map((n) => {
                  const takenElsewhere = slotIds.some(
                    (sid, j) => j !== i && sid === n.id,
                  );
                  return (
                    <option key={n.id} value={n.id} disabled={takenElsewhere}>
                      {n.name}
                      {takenElsewhere ? ' (in use)' : ''}
                    </option>
                  );
                })}
              </select>
            ))}
            <span style={hint}>
              Pick exactly which NPCs spawn. Locked by the first player.
            </span>
          </div>
        )}

        <label style={label}>
          Bot difficulty
          <select
            style={input}
            value={botDifficulty}
            onChange={(e) => {
              const v = e.target.value;
              if (isBotDifficulty(v)) setBotDifficulty(v);
            }}
          >
            <option value="easy">Easy</option>
            <option value="normal">Normal</option>
            <option value="hard">Hard</option>
          </select>
          <span style={hint}>Easy: slow aim, big jitter, miss often. Hard: lethal.</span>
        </label>

        <label style={label}>
          Access code
          <input
            style={input}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={ACCESS_CODE_LEN}
            value={accessCode}
            onChange={(e) => {
              setAccessCode(e.target.value.replace(/[^0-9]/g, '').slice(0, ACCESS_CODE_LEN));
              setLocalError(null);
              if (closeReason) useGame.getState().setCloseReason(null);
            }}
          />
          <span style={hint}>{ACCESS_CODE_LEN} digits.</span>
        </label>

        {error && (
          <div style={errorStyle}>{error}</div>
        )}

        <button
          style={{ ...button, opacity: codeOk ? 1 : 0.55, cursor: codeOk ? 'pointer' : 'not-allowed' }}
          disabled={!codeOk || conn === 'connecting'}
          onClick={() => {
            if (!codeOk) {
              setLocalError(`Enter the ${ACCESS_CODE_LEN}-digit access code.`);
              return;
            }
            const finalName = name.trim() || 'Player';
            saveName(finalName);
            saveCode(accessCode);
            saveMap(mapId);
            const parsed = Math.floor(Number(killTarget));
            const target = Number.isFinite(parsed)
              ? Math.max(MATCH.minKillTarget, Math.min(MATCH.maxKillTarget, parsed))
              : MATCH.defaultKillTarget;
            const parsedBots = Math.floor(Number(botCount));
            const finalBots = Number.isFinite(parsedBots)
              ? Math.max(MATCH.minBotCount, Math.min(MATCH.maxBotCount, parsedBots))
              : MATCH.defaultBotCount;
            const finalNpcIds = slotIds.slice(0, finalBots);
            saveNpcIds(finalNpcIds);
            useGame.getState().setCloseReason(null);
            setLocalError(null);
            onJoin({
              name: finalName,
              mapId,
              killTarget: target,
              accessCode,
              botCount: finalBots,
              botDifficulty,
              npcIds: finalNpcIds,
            });
          }}
        >
          {conn === 'connecting' ? 'Connecting…' : 'Drop in'}
        </button>

        <p style={{ opacity: 0.5, fontSize: 12, marginTop: 16 }}>
          WASD move · Shift sprint · Space jump · Mouse aim · Click fire · R reload · E interact
        </p>

        <CopyClonePromptButton />
      </div>
    </div>
  );
};

const CopyClonePromptButton = () => {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');
  useEffect(() => {
    if (state === 'idle') return;
    const t = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(t);
  }, [state]);

  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(CLONE_PROMPT);
      setState('copied');
    } catch {
      // Fallback for older browsers / non-secure contexts.
      const ta = document.createElement('textarea');
      ta.value = CLONE_PROMPT;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setState('copied');
      } catch {
        setState('error');
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  const label =
    state === 'copied' ? 'Copied — paste into your AI coding agent'
    : state === 'error' ? 'Copy failed — try again'
    : 'Copy this prompt for your AI coding agent to clone this game';

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...cloneButton,
        borderColor: state === 'copied' ? '#3a6a3a' : state === 'error' ? '#6a1a1a' : '#2a2f4a',
        color: state === 'copied' ? '#9bff9b' : state === 'error' ? '#ffb0b0' : '#cfd2e0',
      }}
    >
      {label}
    </button>
  );
};

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  background: 'radial-gradient(circle at 50% 30%, #1a1f3a 0%, #07070d 100%)',
};

const panel: React.CSSProperties = {
  background: 'rgba(15, 18, 32, 0.85)',
  border: '1px solid #2a2f4a',
  padding: '32px 40px',
  borderRadius: 8,
  width: 320,
  boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
};

const label: React.CSSProperties = {
  display: 'block',
  marginTop: 16,
  fontSize: 13,
  opacity: 0.85,
};

const input: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 4,
  padding: '8px 10px',
  background: '#0d1020',
  border: '1px solid #2a2f4a',
  color: '#e8e8f0',
  borderRadius: 4,
  fontSize: 14,
  boxSizing: 'border-box',
};

const hint: React.CSSProperties = {
  display: 'block',
  marginTop: 4,
  fontSize: 11,
  opacity: 0.55,
  fontWeight: 'normal',
};

const cloneButton: React.CSSProperties = {
  marginTop: 14,
  width: '100%',
  padding: '8px 10px',
  background: 'transparent',
  border: '1px solid #2a2f4a',
  borderRadius: 4,
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'border-color 200ms linear, color 200ms linear',
};

const errorStyle: React.CSSProperties = {
  marginTop: 16,
  padding: '8px 12px',
  background: 'rgba(120, 20, 20, 0.4)',
  border: '1px solid #6a1a1a',
  borderRadius: 4,
  fontSize: 12,
  color: '#ffb0b0',
};

const button: React.CSSProperties = {
  marginTop: 24,
  width: '100%',
  padding: '10px 12px',
  background: '#3b6dff',
  border: 'none',
  color: 'white',
  borderRadius: 4,
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
};

const NAME_KEY = 'slipstream-npc:name';
const CODE_KEY = 'slipstream-npc:accessCode';
const MAP_KEY = 'slipstream-npc:mapId';
const loadName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
};
const saveName = (n: string) => {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {
    // ignore
  }
};
const loadCode = () => {
  try {
    return localStorage.getItem(CODE_KEY) ?? '';
  } catch {
    return '';
  }
};
const saveCode = (c: string) => {
  try {
    localStorage.setItem(CODE_KEY, c);
  } catch {
    // ignore
  }
};
const loadMap = (): MapId => {
  try {
    const raw = localStorage.getItem(MAP_KEY);
    return isMapId(raw) ? raw : DEFAULT_MAP_ID;
  } catch {
    return DEFAULT_MAP_ID;
  }
};
const saveMap = (id: MapId) => {
  try {
    localStorage.setItem(MAP_KEY, id);
  } catch {
    // ignore
  }
};

const NPC_IDS_KEY = 'slipstream-npc:npcIds';
const loadNpcIds = (): string[] => {
  try {
    const raw = localStorage.getItem(NPC_IDS_KEY);
    if (!raw) return NPCS.slice(0, MATCH.defaultBotCount).map((n) => n.id);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return NPCS.slice(0, MATCH.defaultBotCount).map((n) => n.id);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of parsed) {
      if (typeof v !== 'string') continue;
      if (seen.has(v)) continue;
      if (!NPCS.some((n) => n.id === v)) continue;
      out.push(v);
      seen.add(v);
    }
    return out.length > 0 ? out : NPCS.slice(0, MATCH.defaultBotCount).map((n) => n.id);
  } catch {
    return NPCS.slice(0, MATCH.defaultBotCount).map((n) => n.id);
  }
};
const saveNpcIds = (ids: string[]) => {
  try {
    localStorage.setItem(NPC_IDS_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
};
