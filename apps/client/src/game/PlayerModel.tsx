import { Billboard, Text } from '@react-three/drei';
import { PLAYER } from '@slipstream/shared';

interface Props {
  name: string;
  alive: boolean;
  health: number;
  color: string;
}

export const PlayerModel = ({ name, alive, health, color }: Props) => {
  if (!alive) return null;
  return (
    <group>
      <mesh castShadow>
        <capsuleGeometry args={[PLAYER.radius, PLAYER.height - PLAYER.radius * 2, 8, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <Billboard position={[0, PLAYER.height / 2 + 0.4, 0]}>
        <Text fontSize={0.25} color="white" outlineWidth={0.02} outlineColor="black">
          {name}
        </Text>
        <Text position={[0, -0.3, 0]} fontSize={0.18} color="#90ff90" outlineWidth={0.015} outlineColor="black">
          {`${Math.max(0, Math.round(health))} HP`}
        </Text>
      </Billboard>
    </group>
  );
};

export const colorForId = (id: string): string => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}, 70%, 55%)`;
};
