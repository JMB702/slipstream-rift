import { useEffect, useState } from 'react';
import { useGame } from '../store.js';

// Minimal voice-state HUD. Shows whether a session is open, current SDK
// status, last error, and live input/output volume bars. Diagnostic-only —
// remove once the voice pipeline is fully wired and stable.
export const VoiceDebug = () => {
  const session = useGame((s) => s.activeVoiceSession);
  const status = useGame((s) => s.voiceStatus);
  const mode = useGame((s) => s.voiceMode);
  const inputVol = useGame((s) => s.voiceInputVolume);
  const outputVol = useGame((s) => s.voiceOutputVolume);
  const lastError = useGame((s) => s.voiceLastError);

  // Forces a re-render every 200ms so the bars animate even when zustand
  // batches setVoiceVolumes inside the same React commit.
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 200);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={box}>
      <div style={row}>
        <span style={lbl}>session</span>
        <span style={val}>{session ? `${session.npcName} (${status})` : '—'}</span>
      </div>
      <div style={row}>
        <span style={lbl}>mode</span>
        <span style={val}>{mode ?? '—'}</span>
      </div>
      <div style={row}>
        <span style={lbl}>mic</span>
        <Bar value={inputVol} color="#3a7afe" />
        <span style={vol}>{inputVol.toFixed(2)}</span>
      </div>
      <div style={row}>
        <span style={lbl}>NPC</span>
        <Bar value={outputVol} color="#5fff8f" />
        <span style={vol}>{outputVol.toFixed(2)}</span>
      </div>
      {lastError && (
        <div style={err}>{lastError}</div>
      )}
    </div>
  );
};

const Bar = ({ value, color }: { value: number; color: string }) => {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div style={track}>
      <div style={{ ...fill, width: `${pct}%`, background: color }} />
    </div>
  );
};

const box: React.CSSProperties = {
  position: 'fixed',
  bottom: 50,
  left: 12,
  width: 240,
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid #2a2f4a',
  background: 'rgba(0, 0, 0, 0.6)',
  color: '#e8e8f0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: 11,
  lineHeight: 1.4,
  pointerEvents: 'none',
};
const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginBottom: 3,
};
const lbl: React.CSSProperties = { width: 50, opacity: 0.65 };
const val: React.CSSProperties = { flex: 1, fontVariantNumeric: 'tabular-nums' };
const vol: React.CSSProperties = { width: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const track: React.CSSProperties = {
  flex: 1,
  height: 6,
  background: '#1a1e30',
  borderRadius: 3,
  overflow: 'hidden',
};
const fill: React.CSSProperties = { height: '100%', transition: 'width 80ms linear' };
const err: React.CSSProperties = {
  marginTop: 6,
  padding: '4px 6px',
  background: 'rgba(80, 10, 10, 0.7)',
  borderRadius: 4,
  color: '#ffb0b0',
  fontSize: 10,
  wordBreak: 'break-word',
};
