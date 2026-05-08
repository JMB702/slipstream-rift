import PartySocket from 'partysocket';
import {
  decode,
  encode,
  type ClientMessage,
  type ServerMessage,
} from '@slipstream/shared';
import { useGame } from '../store.js';

const HOST = import.meta.env.VITE_PARTYKIT_HOST || 'localhost:1999';

export interface NetClient {
  socket: PartySocket;
  send(msg: ClientMessage): void;
  close(): void;
}

export const connect = (room: string, name: string): NetClient => {
  const store = useGame.getState();
  store.setConn('connecting');

  const socket = new PartySocket({
    host: HOST,
    room,
    party: 'main',
    query: { name },
  });

  socket.addEventListener('open', () => {
    useGame.getState().setConn('connected');
  });

  socket.addEventListener('close', () => {
    useGame.getState().setConn('disconnected');
  });

  socket.addEventListener('message', (event) => {
    let msg: ServerMessage;
    try {
      msg = decode<ServerMessage>(event.data as string);
    } catch {
      return;
    }
    const s = useGame.getState();
    switch (msg.type) {
      case 'welcome':
        s.setMyId(msg.you);
        return;
      case 'snapshot':
        s.ingestSnapshot(msg.snapshot);
        return;
      case 'events':
        s.ingestEvents(msg.events);
        return;
      case 'pong':
        return;
    }
  });

  return {
    socket,
    send(msg) {
      socket.send(encode(msg));
    },
    close() {
      socket.close();
    },
  };
};
