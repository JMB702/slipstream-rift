import { useEffect, useState } from 'react';
import { useGame } from '../store.js';

export const Scoreboard = () => {
  const [open, setOpen] = useState(false);
  const lastSnap = useGame((s) => s.snapshots[s.snapshots.length - 1]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        setOpen(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  if (!open || !lastSnap) return null;

  const rows = [...lastSnap.players.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);

  return (
    <div style={overlay}>
      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Player</th>
            <th style={th}>K</th>
            <th style={th}>D</th>
            <th style={th}>HP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td style={td}>
                {p.name}
                {!p.alive && <span style={{ opacity: 0.5 }}> (dead)</span>}
              </td>
              <td style={tdNum}>{p.kills}</td>
              <td style={tdNum}>{p.deaths}</td>
              <td style={tdNum}>{Math.round(p.health)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(0,0,0,0.55)',
  pointerEvents: 'none',
};

const table: React.CSSProperties = {
  background: 'rgba(15, 18, 32, 0.95)',
  border: '1px solid #2a2f4a',
  borderCollapse: 'collapse',
  minWidth: 360,
  fontFamily: 'ui-monospace, monospace',
};

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 14px',
  borderBottom: '1px solid #2a2f4a',
  fontSize: 12,
  letterSpacing: 1,
  opacity: 0.7,
};

const td: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: 14,
};

const tdNum: React.CSSProperties = {
  ...td,
  textAlign: 'right',
};
