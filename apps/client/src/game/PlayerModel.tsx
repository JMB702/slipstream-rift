import { Billboard, Text } from '@react-three/drei';
import { Suspense } from 'react';
import { PLAYER, type PlayerId, type Vec3 } from '@slipstream/shared';
import { Character } from './Character.js';

interface Props {
  name: string;
  alive: boolean;
  health: number;
  velocity: Vec3;
  yaw: number;
  reloading: boolean;
  playerId: PlayerId | null;
}

export const PlayerModel = ({ name, alive, health, velocity, yaw, reloading, playerId }: Props) => {
  if (!alive) return null;
  return (
    <group>
      <Suspense fallback={<CapsuleFallback />}>
        <Character
          velocity={velocity}
          yaw={yaw}
          reloading={reloading}
          alive={alive}
          playerId={playerId}
        />
      </Suspense>
      <Billboard position={[0, PLAYER.height / 2 + 0.35, 0]}>
        <Text fontSize={0.14} color="white" outlineWidth={0.012} outlineColor="black">
          {name}
        </Text>
        {health < PLAYER.maxHealth && <NameplateHealthBar health={health} />}
      </Billboard>
    </group>
  );
};

const NAMEPLATE_BAR_W = 0.9;
const NAMEPLATE_BAR_H = 0.04;

const NameplateHealthBar = ({ health }: { health: number }) => {
  const frac = Math.max(0, Math.min(1, health / PLAYER.maxHealth));
  const fillW = Math.max(0.0001, NAMEPLATE_BAR_W * frac);
  const fillX = -NAMEPLATE_BAR_W / 2 + fillW / 2;
  const color = frac > 0.6 ? '#5fff8f' : frac > 0.3 ? '#ffd060' : '#ff5050';
  return (
    <group position={[0, -0.16, 0]}>
      <mesh>
        <planeGeometry args={[NAMEPLATE_BAR_W + 0.03, NAMEPLATE_BAR_H + 0.03]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.7} />
      </mesh>
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[NAMEPLATE_BAR_W, NAMEPLATE_BAR_H]} />
        <meshBasicMaterial color="#3a0a0a" />
      </mesh>
      <mesh position={[fillX, 0, 0.002]}>
        <planeGeometry args={[fillW, NAMEPLATE_BAR_H]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
};

// Shown while the GLB is fetching/parsing on first mount.
const CapsuleFallback = () => (
  <mesh castShadow>
    <capsuleGeometry args={[PLAYER.radius, PLAYER.height - PLAYER.radius * 2, 8, 16]} />
    <meshStandardMaterial color="#666" />
  </mesh>
);

export const colorForId = (id: string): string => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}, 70%, 55%)`;
};
