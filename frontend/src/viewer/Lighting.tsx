import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useAppStore } from '../store';
import { SurfaceData } from '../types';

interface LightingProps {
  surface: SurfaceData;
}

export const Lighting: React.FC<LightingProps> = ({ surface }) => {
  const shadows = useAppStore(state => state.shadows);
  const sunElevation = useAppStore(state => state.sunElevation);
  const sunAzimuth = useAppStore(state => state.sunAzimuth);

  const extent = Math.max(surface.width, surface.height) * surface.pixel_size_m;
  const half = extent * 0.75;
  const dist = extent * 1.2;

  const sunPos = useMemo(() => {
    const phi = (90 - sunElevation) * (Math.PI / 180);
    const theta = sunAzimuth * (Math.PI / 180);
    const x = dist * Math.sin(phi) * Math.sin(theta);
    const y = Math.max(40, dist * Math.cos(phi));
    const z = dist * Math.sin(phi) * Math.cos(theta);
    return new THREE.Vector3(x, y, z);
  }, [sunElevation, sunAzimuth, dist]);

  return (
    <>
      {/* Sky & ambient */}
      <color attach="background" args={['#dbeafe']} />
      <fog attach="fog" args={['#dbeafe', dist * 1.5, dist * 3.5]} />

      <hemisphereLight
        args={['#fdfaf3', '#334155', 0.65]}
      />

      <ambientLight intensity={0.25} />

      {/* Primary Sun with directional shadows */}
      <directionalLight
        position={sunPos}
        intensity={1.8}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-camera-near={10}
        shadow-camera-far={dist * 2.5}
        shadow-bias={-0.0004}
        shadow-normalBias={0.5}
      />
    </>
  );
};
