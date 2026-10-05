import { create } from 'zustand';
import {
  Dataset,
  JobStatus,
  MetricsResult,
  NavigationMode,
  ProbePoint,
  ViewLayer,
} from './types';

export type ScreenName = 'landing' | 'processing' | 'viewer';

export interface ActiveJobState {
  jobId: string;
  stages: string[];
  stageIndex: number;
  status: JobStatus;
  error: string | null;
}

export interface Notice {
  id: number;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
}

interface AppState {
  // Screens & Job
  screen: ScreenName;
  dataset: Dataset | null;
  activeJob: ActiveJobState | null;

  // Visualizer settings
  activeLayer: ViewLayer;
  exaggeration: number;
  smoothing: number;
  pixelSizeOverride: number | null;
  meshDetail: 'full' | 'half';
  wallShading: boolean;
  shadows: boolean;
  grayscaleInvert: boolean;
  sunElevation: number;
  sunAzimuth: number;
  flySpeed: number;
  navMode: NavigationMode;
  eyeHeight: number;
  tourActive: boolean;
  pointerLocked: boolean;
  minimapVisible: boolean;
  hudVisible: boolean;

  // Analysis & Validation
  probeA: ProbePoint | null;
  probeB: ProbePoint | null;
  scaleFactor: number;
  validationReference: {
    name: string;
    data: Float32Array;
    metrics: MetricsResult;
  } | null;

  // Toasts
  notice: Notice | null;

  // Actions
  setScreen: (screen: ScreenName) => void;
  setDataset: (dataset: Dataset | null) => void;
  setActiveJob: (job: ActiveJobState | null) => void;
  updateJobProgress: (stageIndex: number, status: JobStatus, error?: string | null) => void;

  setActiveLayer: (layer: ViewLayer) => void;
  setExaggeration: (ex: number) => void;
  setSmoothing: (radius: number) => void;
  setPixelSizeOverride: (size: number | null) => void;
  setMeshDetail: (detail: 'full' | 'half') => void;
  setWallShading: (enabled: boolean) => void;
  setShadows: (enabled: boolean) => void;
  setGrayscaleInvert: (inverted: boolean) => void;
  setSunAngles: (elevation: number, azimuth: number) => void;
  setFlySpeed: (speed: number) => void;
  setNavMode: (mode: NavigationMode) => void;
  setEyeHeight: (h: number) => void;
  setTourActive: (active: boolean) => void;
  setPointerLocked: (locked: boolean) => void;
  setMinimapVisible: (visible: boolean) => void;
  setHudVisible: (visible: boolean) => void;

  setProbeA: (probe: ProbePoint | null) => void;
  setProbeB: (probe: ProbePoint | null) => void;
  setScaleFactor: (factor: number) => void;
  setValidationReference: (ref: { name: string; data: Float32Array; metrics: MetricsResult } | null) => void;

  showNotice: (message: string, type?: 'info' | 'warning' | 'error' | 'success') => void;
  clearNotice: () => void;
  resetViewer: () => void;
}

let noticeCounter = 0;

export const useAppStore = create<AppState>((set, get) => ({
  screen: 'landing',
  dataset: null,
  activeJob: null,

  activeLayer: 'rgb',
  exaggeration: 1.5,
  smoothing: 0,
  pixelSizeOverride: null,
  meshDetail: 'full',
  wallShading: true,
  shadows: true,
  grayscaleInvert: false,
  sunElevation: 45,
  sunAzimuth: 215,
  flySpeed: 40,
  navMode: 'fly',
  eyeHeight: 1.8,
  tourActive: false,
  pointerLocked: false,
  minimapVisible: true,
  hudVisible: true,

  probeA: null,
  probeB: null,
  scaleFactor: 1.0,
  validationReference: null,

  notice: null,

  setScreen: screen => set({ screen }),
  setDataset: dataset => set({ dataset }),
  setActiveJob: activeJob => set({ activeJob }),
  updateJobProgress: (stageIndex, status, error = null) =>
    set(state => ({
      activeJob: state.activeJob
        ? { ...state.activeJob, stageIndex, status, error }
        : { jobId: 'job', stages: ['Processing Imagery'], stageIndex, status, error },
    })),

  setActiveLayer: activeLayer => set({ activeLayer }),
  setExaggeration: exaggeration => set({ exaggeration }),
  setSmoothing: smoothing => set({ smoothing }),
  setPixelSizeOverride: pixelSizeOverride => set({ pixelSizeOverride }),
  setMeshDetail: meshDetail => set({ meshDetail }),
  setWallShading: wallShading => set({ wallShading }),
  setShadows: shadows => set({ shadows }),
  setGrayscaleInvert: grayscaleInvert => set({ grayscaleInvert }),
  setSunAngles: (sunElevation, sunAzimuth) => set({ sunElevation, sunAzimuth }),
  setFlySpeed: flySpeed => set({ flySpeed: Math.max(3, Math.min(400, flySpeed)) }),
  setNavMode: navMode => set({ navMode }),
  setEyeHeight: eyeHeight => set({ eyeHeight }),
  setTourActive: tourActive => set({ tourActive }),
  setPointerLocked: pointerLocked => set({ pointerLocked }),
  setMinimapVisible: minimapVisible => set({ minimapVisible }),
  setHudVisible: hudVisible => set({ hudVisible }),

  setProbeA: probeA => set({ probeA }),
  setProbeB: probeB => set({ probeB }),
  setScaleFactor: scaleFactor => set({ scaleFactor: Math.max(0.05, Math.min(20, scaleFactor)) }),
  setValidationReference: validationReference => set({ validationReference }),

  showNotice: (message, type = 'info') => {
    const id = ++noticeCounter;
    set({ notice: { id, message, type } });
    setTimeout(() => {
      if (get().notice?.id === id) {
        set({ notice: null });
      }
    }, 4000);
  },
  clearNotice: () => set({ notice: null }),

  resetViewer: () =>
    set({
      activeLayer: 'rgb',
      exaggeration: 1.5,
      smoothing: 0,
      scaleFactor: 1.0,
      probeA: null,
      probeB: null,
      tourActive: false,
      pointerLocked: false,
    }),
}));
