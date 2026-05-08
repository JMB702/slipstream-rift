import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store.js';
import type { ShotEvent } from '@slipstream/shared';

// We used to render an origin sphere at every shot's `origin` (the shooter's
// eye position) plus a visible tracer line — but the eye sits inside the
// character model, so the muzzle "flash" appeared inside the chest. Now the
// muzzle flash is rendered by Character.tsx, anchored to the actual gun
// barrel. This component only handles the hit flash on the victim.

interface HitFlash {
  id: number;
  point: [number, number, number];
  bornAt: number;
}

const FLASH_LIFE_MS = 350;

export const Tracers = () => {
  const [flashes, setFlashes] = useState<HitFlash[]>([]);
  const idRef = useRef(0);
  const seenRef = useRef(0);

  useEffect(() => {
    return useGame.subscribe((state) => {
      if (state.events.length === seenRef.current) return;
      const fresh = state.events.slice(seenRef.current);
      seenRef.current = state.events.length;
      const hits = fresh.filter(
        (e): e is ShotEvent => e.type === 'shot' && e.hit !== null,
      );
      if (hits.length === 0) return;
      setFlashes((cur) => {
        const next = [...cur];
        for (const s of hits) {
          const point = findHitPoint(s);
          if (!point) continue;
          next.push({ id: idRef.current++, point, bornAt: performance.now() });
        }
        return next.slice(-16);
      });
    });
  }, []);

  useFrame(() => {
    const now = performance.now();
    setFlashes((cur) => {
      const filtered = cur.filter((f) => now - f.bornAt < FLASH_LIFE_MS);
      return filtered.length === cur.length ? cur : filtered;
    });
  });

  const now = performance.now();

  return (
    <group>
      {flashes.map((f) => {
        const age = now - f.bornAt;
        const scale = 0.25 + (age / FLASH_LIFE_MS) * 0.4;
        const opacity = 1 - age / FLASH_LIFE_MS;
        return (
          <mesh key={f.id} position={f.point}>
            <sphereGeometry args={[scale, 12, 12]} />
            <meshBasicMaterial color="#ff7050" transparent opacity={opacity} />
          </mesh>
        );
      })}
    </group>
  );
};

const findHitPoint = (s: ShotEvent): [number, number, number] | null => {
  // Client doesn't have authoritative hit distance — use the latest snapshot
  // position of the hit player.
  const lastSnap = useGame.getState().snapshots[useGame.getState().snapshots.length - 1];
  const hit = s.hit ? lastSnap?.players.get(s.hit) : null;
  if (hit) return [hit.position[0], hit.position[1], hit.position[2]];
  return null;
};
