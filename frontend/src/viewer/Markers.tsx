import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useAppStore } from '../store';
import { SurfaceData } from '../types';

interface MarkersProps {
  surface: SurfaceData;
}

export const Markers: React.FC<MarkersProps> = ({ surface }) => {
  const probeA = useAppStore(state => state.probeA);
  const probeB = useAppStore(state => state.probeB);
  const exaggeration = useAppStore(state => state.exaggeration);

  const posA = useMemo(() => {
    if (!probeA) return null;
    const y = (probeA.height - surface.baseline) * exaggeration;
    return new THREE.Vector3(probeA.worldX, y, probeA.worldZ);
  }, [probeA, surface.baseline, exaggeration]);

  const posB = useMemo(() => {
    if (!probeB) return null;
    const y = (probeB.height - surface.baseline) * exaggeration;
    return new THREE.Vector3(probeB.worldX, y, probeB.worldZ);
  }, [probeB, surface.baseline, exaggeration]);

  const lineObject = useMemo(() => {
    if (!posA || !posB) return null;
    const geom = new THREE.BufferGeometry().setFromPoints([posA, posB]);
    const mat = new THREE.LineBasicMaterial({
      color: 0x121212,
      linewidth: 3,
    });
    return new THREE.Line(geom, mat);
  }, [posA, posB]);

  return (
    <group>
      {/* Probe Pin A */}
      {posA && (
        <group position={posA}>
          {/* Vertical pin shaft */}
          <mesh position={[0, 4, 0]}>
            <cylinderGeometry args={[0.2, 0.05, 8, 8]} />
            <meshStandardMaterial color="#f59e0b" roughness={0.3} metalness={0.2} />
          </mesh>
          {/* Pin head sphere */}
          <mesh position={[0, 8, 0]}>
            <sphereGeometry args={[1.2, 16, 16]} />
            <meshStandardMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.5} />
          </mesh>
        </group>
      )}

      {/* Probe Pin B */}
      {posB && (
        <group position={posB}>
          {/* Vertical pin shaft */}
          <mesh position={[0, 4, 0]}>
            <cylinderGeometry args={[0.2, 0.05, 8, 8]} />
            <meshStandardMaterial color="#06b6d4" roughness={0.3} metalness={0.2} />
          </mesh>
          {/* Pin head sphere */}
          <mesh position={[0, 8, 0]}>
            <sphereGeometry args={[1.2, 16, 16]} />
            <meshStandardMaterial color="#22d3ee" emissive="#0891b2" emissiveIntensity={0.5} />
          </mesh>
        </group>
      )}

      {/* Connecting Measure Line */}
      {lineObject && <primitive object={lineObject} />}
    </group>
  );
};
