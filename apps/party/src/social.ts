import { SOCIAL } from '@slipstream-npc/shared';
import type { ServerPlayer } from './state.js';

const setHostility = (player: ServerPlayer, towardsName: string, until: number): void => {
  if (!towardsName || towardsName === player.name) return;
  const existing = player.hostility.find((h) => h.towardsName === towardsName);
  if (existing) {
    if (until > existing.until) existing.until = until;
    return;
  }
  player.hostility.push({ towardsName, until });
};

export const markAttack = (
  attackerName: string,
  victim: ServerPlayer,
  allPlayers: Iterable<ServerPlayer>,
  now: number,
): void => {
  const until = now + SOCIAL.hostilityMs;
  setHostility(victim, attackerName, until);
  if (victim.friendsWith.length === 0) return;
  for (const p of allPlayers) {
    if (p.id === victim.id) continue;
    if (victim.friendsWith.includes(p.name)) {
      setHostility(p, attackerName, until);
    }
  }
};

export const isHostileTo = (player: ServerPlayer, otherName: string, now: number): boolean =>
  player.hostility.some((h) => h.towardsName === otherName && h.until > now);

export const pruneHostility = (player: ServerPlayer, now: number): void => {
  if (player.hostility.length === 0) return;
  player.hostility = player.hostility.filter((h) => h.until > now);
};
