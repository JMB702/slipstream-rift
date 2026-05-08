import { useState } from 'react';
import { connect, type NetClient } from './net/client.js';
import { Scene } from './game/Scene.js';
import { Lobby } from './ui/Lobby.js';
import { HUD } from './ui/HUD.js';
import { Minimap } from './ui/Minimap.js';
import { Scoreboard } from './ui/Scoreboard.js';
import { useGame } from './store.js';

export const App = () => {
  const [client, setClient] = useState<NetClient | null>(null);
  const [name, setName] = useState('');

  const onJoin = ({ name, room }: { name: string; room: string }) => {
    const c = connect(room, name);
    setClient(c);
    setName(name);
  };

  const onLeave = () => {
    client?.close();
    setClient(null);
    useGame.getState().reset();
  };

  if (!client) return <Lobby onJoin={onJoin} />;

  return (
    <>
      <Scene send={client.send} myName={name} />
      <HUD />
      <Minimap />
      <Scoreboard />
      <button onClick={onLeave} style={leaveBtn}>
        Leave
      </button>
    </>
  );
};

const leaveBtn: React.CSSProperties = {
  position: 'fixed',
  top: 12,
  left: 12,
  padding: '6px 10px',
  background: 'rgba(0,0,0,0.5)',
  color: '#e8e8f0',
  border: '1px solid #2a2f4a',
  borderRadius: 4,
  fontSize: 12,
  cursor: 'pointer',
};
