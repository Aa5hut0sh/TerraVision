import React, { useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { useAppStore } from '../store';
import { useSurface } from '../viewer/useSurface';
import { Scene } from '../viewer/Scene';
import { Hud } from '../viewer/Hud';
import { Minimap } from '../viewer/Minimap';
import { bus } from '../bus';
import { rt } from '../viewer/runtime';
import { AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';

export const Viewer: React.FC = () => {
  const surface = useSurface();
  const activeLayer = useAppStore(state => state.activeLayer);
  const setActiveLayer = useAppStore(state => state.setActiveLayer);
  const navMode = useAppStore(state => state.navMode);
  const setNavMode = useAppStore(state => state.setNavMode);
  const tourActive = useAppStore(state => state.tourActive);
  const setTourActive = useAppStore(state => state.setTourActive);
  const hudVisible = useAppStore(state => state.hudVisible);
  const setHudVisible = useAppStore(state => state.setHudVisible);
  const minimapVisible = useAppStore(state => state.minimapVisible);
  const setMinimapVisible = useAppStore(state => state.setMinimapVisible);
  const validationReference = useAppStore(state => state.validationReference);
  const notice = useAppStore(state => state.notice);

  // Global hotkeys listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing inside input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      switch (e.code) {
        case 'KeyF':
          e.preventDefault();
          if (rt.glRenderer) {
            rt.glRenderer.domElement.requestPointerLock();
          }
          bus.emit('openProbePanel');
          break;
        case 'KeyV':
          setNavMode(navMode === 'walk' ? 'fly' : 'walk');
          break;
        case 'KeyT':
          bus.emit('toggleTour');
          break;
        case 'KeyR':
          bus.emit('resetCamera');
          break;
        case 'KeyH':
          setHudVisible(!hudVisible);
          break;
        case 'KeyM':
          setMinimapVisible(!minimapVisible);
          break;
        case 'Digit1':
          setActiveLayer('rgb');
          break;
        case 'Digit2':
          setActiveLayer('height');
          break;
        case 'Digit3':
          setActiveLayer('slope');
          break;
        case 'Digit4':
          if (validationReference) setActiveLayer('error');
          break;
        case 'Digit5':
          setActiveLayer('grayscale');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navMode, setNavMode, hudVisible, setHudVisible, minimapVisible, setMinimapVisible, setActiveLayer, validationReference]);

  if (!surface) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-zinc-900 text-white font-mono">
        Loading 3D surface dataset...
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-sky-200">
      {/* 3D WEBGL CANVAS */}
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{
          antialias: true,
          preserveDrawingBuffer: true, // Prevents black screenshot
          powerPreference: 'high-performance',
        }}
        camera={{
          fov: 55,
          near: 0.5,
          far: 5000,
        }}
      >
        <Scene surface={surface} />
      </Canvas>

      {/* TOP NOTICES / TOAST */}
      {notice && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-in fade-in slide-in-from-top-2">
          <div
            className={`px-4 py-2 font-mono text-xs font-bold uppercase brutal-border brutal-shadow flex items-center gap-2 ${
              notice.type === 'error'
                ? 'bg-rose-400 text-zinc-950'
                : notice.type === 'success'
                ? 'bg-emerald-400 text-zinc-950'
                : notice.type === 'warning'
                ? 'bg-amber-400 text-zinc-950'
                : 'bg-cyan-300 text-zinc-950'
            }`}
          >
            {notice.type === 'error' ? (
              <AlertCircle className="w-4 h-4" />
            ) : notice.type === 'success' ? (
              <CheckCircle className="w-4 h-4" />
            ) : notice.type === 'warning' ? (
              <AlertTriangle className="w-4 h-4" />
            ) : (
              <Info className="w-4 h-4" />
            )}
            <span>{notice.message}</span>
          </div>
        </div>
      )}

      {/* MINIMAP */}
      <Minimap surface={surface} />

      {/* HUD OVERLAY */}
      <Hud surface={surface} />
    </div>
  );
};
