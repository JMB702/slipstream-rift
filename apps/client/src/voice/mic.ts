let cachedStream: MediaStream | null = null;
let inflight: Promise<MediaStream> | null = null;

export const getMicStream = async (): Promise<MediaStream> => {
  if (cachedStream && cachedStream.active) return cachedStream;
  if (inflight) return inflight;
  inflight = navigator.mediaDevices
    .getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    .then((s) => {
      cachedStream = s;
      inflight = null;
      return s;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });
  return inflight;
};

export const releaseMic = (): void => {
  if (!cachedStream) return;
  for (const t of cachedStream.getTracks()) t.stop();
  cachedStream = null;
};

export const setMicEnabled = (enabled: boolean): void => {
  if (!cachedStream) return;
  for (const t of cachedStream.getAudioTracks()) t.enabled = enabled;
};
