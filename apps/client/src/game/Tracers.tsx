import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store.js';
import { WEAPON, type ShotEvent } from '@slipstream/shared';

interface ActiveTracer {
  id: number;
  points: [[number, number, number], [number, number, number]];
  bornAt: number;
}

const TRACER_LIFE_MS = 80;

export const Tracers = () => {
  const [tracers, setTracers] = useState<ActiveTracer[]>([]);
  const idRef = useRef(0);
  const seenRef = useRef(0);

  useEffect(() => {
    return useGame.subscribe((state) => {
      if (state.events.length === seenRef.current) return;
      const fresh = state.events.slice(seenRef.current);
      seenRef.current = state.events.length;
      const shots = fresh.filter((e): e is ShotEvent => e.type === 'shot');
      if (shots.length === 0) return;
      setTracers((cur) => {
        const next = [...cur];
        for (const s of shots) {
          const len = WEAPON.range;
          const end: [number, number, number] = [
            s.origin[0] + s.direction[0] * len,
            s.origin[1] + s.direction[1] * len,
            s.origin[2] + s.direction[2] * len,
          ];
          next.push({
            id: idRef.current++,
            points: [[s.origin[0], s.origin[1], s.origin[2]], end],
            bornAt: performance.now(),
          });
        }
        return next.slice(-32);
      });
    });
  }, []);

  useFrame(() => {
    const now = performance.now();
    setTracers((cur) => {
      const filtered = cur.filter((t) => now - t.bornAt < TRACER_LIFE_MS);
      return filtered.length === cur.length ? cur : filtered;
    });
  });

  return (
    <group>
      {tracers.map((t) => (
        <Line
          key={t.id}
          points={t.points}
          color="#ffe080"
          lineWidth={2}
          transparent
        />
      ))}
    </group>
  );
};
