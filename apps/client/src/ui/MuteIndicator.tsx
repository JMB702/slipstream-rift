import { useEffect, useState } from 'react';
import { useGame } from '../store.js';
import { isMuted, onMuteChange, toggleMute } from '../voice/mute.js';

export const MuteIndicator = () => {
  const [muted, setLocalMuted] = useState(isMuted());
  const session = useGame((s) => s.activeVoiceSession);
  const status = useGame((s) => s.voiceStatus);

  useEffect(() => onMuteChange(setLocalMuted), []);

  const label = session
    ? muted
      ? `Muted — ${session.npcName} (${status})`
      : `Talking with ${session.npcName} (${status})`
    : muted
      ? 'Mic muted'
      : 'Mic open';

  return (
    <button onClick={toggleMute} style={btnStyle(muted, !!session)} title="M to toggle, Y on Xbox">
      <span style={dot(muted)} />
      {label}
    </button>
  );
};

const btnStyle = (muted: boolean, active: boolean): React.CSSProperties => ({
  position: 'fixed',
  bottom: 12,
  left: 12,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  borderRadius: 16,
  fontSize: 12,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  border: '1px solid ' + (active ? '#3a7afe' : '#2a2f4a'),
  background: muted ? 'rgba(40, 10, 10, 0.7)' : 'rgba(0, 0, 0, 0.5)',
  color: '#e8e8f0',
  cursor: 'pointer',
});

const dot = (muted: boolean): React.CSSProperties => ({
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: muted ? '#ff5050' : '#5fff8f',
});
