import { useGame } from '../store.js';
import { RemotePlayer } from './RemotePlayer.js';

export const RemotePlayers = () => {
  const myId = useGame((s) => s.myId);
  const lastSnap = useGame((s) => s.snapshots[s.snapshots.length - 1]);
  if (!lastSnap) return null;
  const ids: string[] = [];
  for (const id of lastSnap.players.keys()) if (id !== myId) ids.push(id);
  return (
    <>
      {ids.map((id) => (
        <RemotePlayer key={id} id={id} />
      ))}
    </>
  );
};
