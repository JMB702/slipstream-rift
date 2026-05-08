import { Canvas } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import type { ClientMessage } from '@slipstream/shared';
import { Arena } from './Map.js';
import { LocalPlayer } from './LocalPlayer.js';
import { RemotePlayers } from './Players.js';
import { FollowCamera } from './Camera.js';

interface Props {
  send(msg: ClientMessage): void;
  myName: string;
}

export const Scene = ({ send, myName }: Props) => (
  <Canvas
    shadows
    camera={{ fov: 70, near: 0.1, far: 500, position: [0, 5, 10] }}
    gl={{ antialias: true }}
  >
    <color attach="background" args={['#0a0a12']} />
    <Sky sunPosition={[100, 50, -100]} />
    <ambientLight intensity={0.4} />
    <directionalLight
      position={[40, 60, 20]}
      intensity={1.2}
      castShadow
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
    />

    <Arena />
    <LocalPlayer send={send} myName={myName} />
    <RemotePlayers />
    <FollowCamera />
  </Canvas>
);
