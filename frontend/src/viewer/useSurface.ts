import { useMemo, useEffect } from 'react';
import { useAppStore } from '../store';
import { computeSurfaceData } from '../lib/surface';
import { SurfaceData } from '../types';
import { rt } from './runtime';

export function useSurface(): SurfaceData | null {
  const dataset = useAppStore(state => state.dataset);
  const scaleFactor = useAppStore(state => state.scaleFactor);
  const smoothing = useAppStore(state => state.smoothing);
  const pixelSizeOverride = useAppStore(state => state.pixelSizeOverride);

  const surface = useMemo(() => {
    if (!dataset) return null;
    return computeSurfaceData(dataset, scaleFactor, smoothing, pixelSizeOverride ?? undefined);
  }, [dataset, scaleFactor, smoothing, pixelSizeOverride]);

  useEffect(() => {
    rt.currentSurface = surface;
  }, [surface]);

  return surface;
}
