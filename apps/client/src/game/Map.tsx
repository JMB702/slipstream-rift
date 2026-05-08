import { MAP } from '@slipstream/shared';

export const Arena = () => {
  const half = MAP.size / 2;
  const obstacles: { pos: [number, number, number]; size: [number, number, number] }[] = [
    { pos: [-12, 1, -8], size: [4, 2, 4] },
    { pos: [10, 1, -10], size: [3, 2, 6] },
    { pos: [0, 1.5, 0], size: [6, 3, 2] },
    { pos: [-15, 0.5, 12], size: [8, 1, 3] },
    { pos: [14, 2, 8], size: [3, 4, 3] },
    { pos: [6, 1, 14], size: [4, 2, 4] },
    { pos: [-6, 0.75, -16], size: [6, 1.5, 2] },
  ];

  return (
    <group>
      <mesh receiveShadow position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[MAP.size, MAP.size]} />
        <meshStandardMaterial color="#1a1f2e" />
      </mesh>

      {([
        [half, 2, 0, 1, 4, MAP.size],
        [-half, 2, 0, 1, 4, MAP.size],
        [0, 2, half, MAP.size, 4, 1],
        [0, 2, -half, MAP.size, 4, 1],
      ] as const).map(([x, y, z, sx, sy, sz], i) => (
        <mesh key={i} position={[x, y, z]} castShadow receiveShadow>
          <boxGeometry args={[sx, sy, sz]} />
          <meshStandardMaterial color="#2a2f3e" />
        </mesh>
      ))}

      {obstacles.map((o, i) => (
        <mesh key={i} position={o.pos} castShadow receiveShadow>
          <boxGeometry args={o.size} />
          <meshStandardMaterial color="#3a4055" />
        </mesh>
      ))}

      <gridHelper args={[MAP.size, MAP.size, '#2a3050', '#1a2030']} position={[0, 0.01, 0]} />
    </group>
  );
};
