import React from 'react';
import { SurfaceData } from '../types';
import { Lighting } from './Lighting';
import { TerrainMesh } from './TerrainMesh';
import { Markers } from './Markers';
import { Navigator } from './Navigator';

interface SceneProps {
  surface: SurfaceData;
}

export const Scene: React.FC<SceneProps> = ({ surface }) => {
  return (
    <>
      <Lighting surface={surface} />
      <TerrainMesh surface={surface} />
      <Markers surface={surface} />
      <Navigator surface={surface} />
    </>
  );
};
