import { useState } from 'react';

const STORAGE_KEY = 'slipstream-npc:consent';
export const CONSENT_VERSION = 'v1';

interface StoredConsent {
  version: string;
  agreedAt: number;
}

export const getStoredConsent = (): StoredConsent | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
};

interface Props {
  onAgree: () => void;
}

export const ConsentGate = ({ onAgree }: Props) => {
  const [checked, setChecked] = useState(false);

  const onAccept = () => {
    if (!checked) return;
    const stored: StoredConsent = { version: CONSENT_VERSION, agreedAt: Date.now() };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // ignore quota / private-mode errors; the in-memory consent still gates this session
    }
    onAgree();
  };

  return (
    <div style={overlay}>
      <div style={card}>
        <h1 style={h1}>You are about to talk to AI characters</h1>
        <p style={pStrong}>
          The NPCs in Slipstream-NPC are not humans. They are AI agents powered by{' '}
          <a style={a} href="https://elevenlabs.io" target="_blank" rel="noreferrer">
            ElevenLabs
          </a>
          {' '}Conversational AI. You are interacting with software, not with another
          person, whenever you talk to a character in this game.
        </p>
        <p style={p}>
          By clicking <strong>Agree</strong> below and each time you interact with an
          AI agent in this game, you consent to us, ElevenLabs, and each of our service
          providers (including third-party large language model providers) recording,
          viewing, storing, and sharing your communications to provide the service,
          improve our products and services, train machine learning models, and comply
          with applicable law.
        </p>
        <p style={pHeader}>What this means in practice:</p>
        <ul style={ul}>
          <li>Your microphone audio is sent in real time to ElevenLabs.</li>
          <li>It is transcribed. Transcripts are stored on the game server so NPCs can remember conversations with you across sessions.</li>
          <li>Raw audio is not retained by Slipstream-NPC; ElevenLabs and its LLM providers may retain audio and transcripts under their own policies.</li>
          <li>Voice chat only activates when you walk close to an NPC. There is no recording outside those proximity bubbles.</li>
          <li>You can mute the microphone at any time (M on keyboard, Y on Xbox controller). When muted, your audio is not captured or transmitted.</li>
        </ul>
        <p style={pSmall}>
          Florida is a two-party-consent jurisdiction. By proceeding you confirm that
          you and anyone whose voice may be captured by your microphone consent to the
          recording and transcription described above. If a player is under 13, do not
          proceed.
        </p>
        <label style={check}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            style={checkbox}
          />
          I am 13 or older and I agree to the terms above.
        </label>
        <button onClick={onAccept} disabled={!checked} style={checked ? btnOn : btnOff}>
          Agree and continue
        </button>
      </div>
    </div>
  );
};

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(8, 10, 18, 0.95)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 100,
};
const card: React.CSSProperties = {
  background: '#101424',
  color: '#e8e8f0',
  border: '1px solid #2a2f4a',
  borderRadius: 8,
  padding: 24,
  maxWidth: 560,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  lineHeight: 1.45,
};
const h1: React.CSSProperties = { fontSize: 22, margin: '0 0 12px' };
const p: React.CSSProperties = { fontSize: 14, margin: '0 0 12px', opacity: 0.9 };
const pStrong: React.CSSProperties = { fontSize: 14, margin: '0 0 14px', lineHeight: 1.5 };
const pHeader: React.CSSProperties = { fontSize: 13, margin: '0 0 6px', opacity: 0.8 };
const pSmall: React.CSSProperties = { fontSize: 12, margin: '0 0 12px', opacity: 0.7, lineHeight: 1.45 };
const a: React.CSSProperties = { color: '#7aa8ff', textDecoration: 'underline' };
const ul: React.CSSProperties = { fontSize: 13, margin: '0 0 12px', paddingLeft: 18, opacity: 0.9 };
const check: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  margin: '12px 0',
  cursor: 'pointer',
};
const checkbox: React.CSSProperties = { width: 16, height: 16, cursor: 'pointer' };
const btn: React.CSSProperties = {
  padding: '8px 14px',
  border: '1px solid #2a2f4a',
  borderRadius: 4,
  fontSize: 14,
  cursor: 'pointer',
};
const btnOff: React.CSSProperties = { ...btn, background: '#22263a', color: '#6b6f88', cursor: 'not-allowed' };
const btnOn: React.CSSProperties = { ...btn, background: '#3a7afe', color: 'white', borderColor: '#3a7afe' };
