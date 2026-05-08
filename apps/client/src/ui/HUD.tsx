import { useGame } from '../store.js';
import { WEAPON, type KillEvent } from '@slipstream/shared';

export const HUD = () => {
  const myId = useGame((s) => s.myId);
  const lastSnap = useGame((s) => s.snapshots[s.snapshots.length - 1]);
  const killFeed = useGame((s) => s.killFeed);
  const conn = useGame((s) => s.conn);
  const me = myId ? lastSnap?.players.get(myId) : undefined;

  return (
    <>
      <div style={crosshairOuter}>
        <div style={crosshair} />
      </div>

      <div style={statusBar}>
        <span style={{ color: connColor(conn) }}>● {conn}</span>
        {me && (
          <>
            <span>HP {Math.round(me.health)}</span>
            <span>
              AMMO {me.ammo}/{WEAPON.magazineSize}
              {me.reloading && ' (reloading...)'}
            </span>
            <span>K {me.kills}</span>
            <span>D {me.deaths}</span>
          </>
        )}
      </div>

      {me && !me.alive && (
        <div style={deathOverlay}>
          <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>You died</div>
          <div style={{ opacity: 0.8 }}>Respawning…</div>
        </div>
      )}

      <div style={killFeedStyle}>
        {killFeed
          .filter((e): e is KillEvent => e.type === 'kill')
          .slice(-5)
          .reverse()
          .map((k, i) => (
            <KillRow key={`${k.at}-${i}`} kill={k} />
          ))}
      </div>
    </>
  );
};

const KillRow = ({ kill }: { kill: KillEvent }) => {
  const lastSnap = useGame.getState().snapshots[useGame.getState().snapshots.length - 1];
  const killerName = kill.killerId
    ? lastSnap?.players.get(kill.killerId)?.name ?? 'Someone'
    : 'World';
  const victimName = lastSnap?.players.get(kill.victimId)?.name ?? 'Someone';
  return (
    <div style={killRow}>
      <span style={{ color: '#9bdcff' }}>{killerName}</span>
      <span style={{ opacity: 0.6 }}> → </span>
      <span style={{ color: '#ff9090' }}>{victimName}</span>
    </div>
  );
};

const connColor = (s: string) =>
  s === 'connected' ? '#5fff8f' : s === 'connecting' ? '#ffd060' : '#ff7070';

const crosshairOuter: React.CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'none',
};

const crosshair: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: 'rgba(255,255,255,0.85)',
  boxShadow: '0 0 0 1px rgba(0,0,0,0.6)',
};

const statusBar: React.CSSProperties = {
  position: 'fixed',
  left: 16,
  bottom: 16,
  display: 'flex',
  gap: 16,
  fontSize: 14,
  background: 'rgba(0,0,0,0.4)',
  padding: '8px 14px',
  borderRadius: 4,
  pointerEvents: 'none',
  fontFamily: 'ui-monospace, monospace',
};

const deathOverlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(40, 0, 0, 0.45)',
  pointerEvents: 'none',
  textAlign: 'center',
};

const killFeedStyle: React.CSSProperties = {
  position: 'fixed',
  right: 16,
  top: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  pointerEvents: 'none',
  fontFamily: 'ui-monospace, monospace',
};

const killRow: React.CSSProperties = {
  background: 'rgba(0,0,0,0.5)',
  padding: '4px 10px',
  borderRadius: 3,
  fontSize: 13,
};
