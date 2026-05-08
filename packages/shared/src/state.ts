export type PlayerId = string;

export type Vec3 = readonly [number, number, number];

export interface PlayerState {
  id: PlayerId;
  name: string;
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  pitch: number;
  health: number;
  alive: boolean;
  respawnAt: number | null;
  ammo: number;
  reloading: boolean;
  reloadDoneAt: number | null;
  kills: number;
  deaths: number;
  lastSeenSeq: number;
}

export interface GameSnapshot {
  serverTime: number;
  tick: number;
  players: PlayerState[];
}

export interface KillEvent {
  type: 'kill';
  killerId: PlayerId | null;
  victimId: PlayerId;
  at: number;
}

export interface ShotEvent {
  type: 'shot';
  shooterId: PlayerId;
  origin: Vec3;
  direction: Vec3;
  hit: PlayerId | null;
  at: number;
}

export interface ChatEvent {
  type: 'chat';
  fromId: PlayerId;
  fromName: string;
  text: string;
  at: number;
}

export type GameEvent = KillEvent | ShotEvent | ChatEvent;
