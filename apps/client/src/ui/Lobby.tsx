import { useState } from 'react';
import { MATCH } from '@slipstream/shared';

interface Props {
  onJoin(args: { name: string; room: string; killTarget: number }): void;
}

export const Lobby = ({ onJoin }: Props) => {
  const [name, setName] = useState(() => loadName());
  const [room, setRoom] = useState('arena-1');
  const [killTarget, setKillTarget] = useState<string>(String(MATCH.defaultKillTarget));

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
          Room
          <input
            style={input}
            value={room}
            maxLength={32}
            onChange={(e) => setRoom(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ''))}
          />
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

        <button
          style={button}
          onClick={() => {
            const finalName = name.trim() || 'Player';
            saveName(finalName);
            const parsed = Math.floor(Number(killTarget));
            const target = Number.isFinite(parsed)
              ? Math.max(MATCH.minKillTarget, Math.min(MATCH.maxKillTarget, parsed))
              : MATCH.defaultKillTarget;
            onJoin({
              name: finalName,
              room: room.trim() || 'arena-1',
              killTarget: target,
            });
          }}
        >
          Drop in
        </button>

        <p style={{ opacity: 0.5, fontSize: 12, marginTop: 16 }}>
          WASD move · Shift sprint · Space jump · Mouse aim · Click fire · R reload
        </p>
      </div>
    </div>
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

const NAME_KEY = 'slipstream:name';
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
