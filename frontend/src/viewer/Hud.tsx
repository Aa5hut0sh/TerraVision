import React, { useState, useEffect } from 'react';
import {
  Camera,
  Compass,
  Crosshair,
  Download,
  Eye,
  Layers,
  MapPin,
  RotateCcw,
  Ruler,
  Sliders,
  Sun,
  Video,
  X,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Info,
  Wind,
} from 'lucide-react';
import { useAppStore } from '../store';
import { SurfaceData, ViewLayer } from '../types';
import { Button, Badge, Slider, Toggle, Segmented } from '../ui';
import { bus } from '../bus';
import { rt, Telemetry, CrosshairInfo } from './runtime';
import { parseNpy } from '../lib/npy';
import { bilinearResize, computeMetrics } from '../lib/metrics';

interface HudProps {
  surface: SurfaceData;
}

export const Hud: React.FC<HudProps> = ({ surface }) => {
  const dataset = useAppStore(state => state.dataset);
  const setScreen = useAppStore(state => state.setScreen);

  // Viewer options
  const activeLayer = useAppStore(state => state.activeLayer);
  const setActiveLayer = useAppStore(state => state.setActiveLayer);
  const exaggeration = useAppStore(state => state.exaggeration);
  const setExaggeration = useAppStore(state => state.setExaggeration);
  const smoothing = useAppStore(state => state.smoothing);
  const setSmoothing = useAppStore(state => state.setSmoothing);
  const pixelSizeOverride = useAppStore(state => state.pixelSizeOverride);
  const setPixelSizeOverride = useAppStore(state => state.setPixelSizeOverride);
  const meshDetail = useAppStore(state => state.meshDetail);
  const setMeshDetail = useAppStore(state => state.setMeshDetail);
  const wallShading = useAppStore(state => state.wallShading);
  const setWallShading = useAppStore(state => state.setWallShading);
  const shadows = useAppStore(state => state.shadows);
  const setShadows = useAppStore(state => state.setShadows);
  const grayscaleInvert = useAppStore(state => state.grayscaleInvert);
  const setGrayscaleInvert = useAppStore(state => state.setGrayscaleInvert);
  const sunElevation = useAppStore(state => state.sunElevation);
  const sunAzimuth = useAppStore(state => state.sunAzimuth);
  const setSunAngles = useAppStore(state => state.setSunAngles);
  const flySpeed = useAppStore(state => state.flySpeed);
  const setFlySpeed = useAppStore(state => state.setFlySpeed);
  const navMode = useAppStore(state => state.navMode);
  const setNavMode = useAppStore(state => state.setNavMode);
  const eyeHeight = useAppStore(state => state.eyeHeight);
  const setEyeHeight = useAppStore(state => state.setEyeHeight);
  const tourActive = useAppStore(state => state.tourActive);
  const pointerLocked = useAppStore(state => state.pointerLocked);
  const hudVisible = useAppStore(state => state.hudVisible);
  const setHudVisible = useAppStore(state => state.setHudVisible);

  // Analysis & Validation
  const probeA = useAppStore(state => state.probeA);
  const probeB = useAppStore(state => state.probeB);
  const setProbeA = useAppStore(state => state.setProbeA);
  const setProbeB = useAppStore(state => state.setProbeB);
  const scaleFactor = useAppStore(state => state.scaleFactor);
  const setScaleFactor = useAppStore(state => state.setScaleFactor);
  const validationReference = useAppStore(state => state.validationReference);
  const setValidationReference = useAppStore(state => state.setValidationReference);
  const showNotice = useAppStore(state => state.showNotice);

  // Floating panel states (icon docks)
  const [openPanels, setOpenPanels] = useState<{ [k: string]: boolean }>({});
  const [recalibrateKnownH, setRecalibrateKnownH] = useState('12.0');

  // Real-time telemetry state
  const [telemetry, setTelemetry] = useState<Telemetry>(rt.telemetry);
  const [crosshair, setCrosshair] = useState<CrosshairInfo | null>(null);

  const togglePanel = (panelId: string) => {
    setOpenPanels(prev => ({
      ...prev,
      [panelId]: !prev[panelId],
    }));
  };

  useEffect(() => {
    rt.onTelemetryUpdate = (t, c) => {
      setTelemetry({ ...t });
      setCrosshair(c ? { ...c } : null);
    };
    const unOpenProbe = bus.on('openProbePanel', () => {
      setOpenPanels(prev => ({ ...prev, probe: true }));
    });
    return () => {
      rt.onTelemetryUpdate = null;
      unOpenProbe();
    };
  }, []);

  const handleCaptureMouse = () => {
    if (rt.glRenderer) {
      rt.glRenderer.domElement.requestPointerLock();
    }
    // Automatically open Probe & Measure when Capture is clicked
    setOpenPanels(prev => ({ ...prev, probe: true }));
  };

  const handleToggleProbe = () => {
    const willOpen = !openPanels.probe;
    setOpenPanels(prev => ({ ...prev, probe: willOpen }));
    if (willOpen) {
      // Automatically request mouse capture when Probe & Measure is selected
      if (rt.glRenderer) {
        rt.glRenderer.domElement.requestPointerLock();
      }
    } else {
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
    }
  };

  const handleDropPinButton = () => {
    if (!pointerLocked) {
      handleCaptureMouse();
    } else {
      bus.emit('dropPinAtCrosshair');
    }
  };

  const handleScreenshot = () => {
    const dataUrl = rt.takeScreenshot();
    if (!dataUrl) {
      showNotice('Failed to capture screenshot', 'error');
      return;
    }
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `DepthWizard_${Date.now()}.png`;
    a.click();
    showNotice('Screenshot downloaded!', 'success');
  };

  const handleApplyRecalibration = () => {
    const targetProbe = probeB || probeA;
    if (!targetProbe) {
      showNotice('Drop a probe pin on a building or structure first', 'warning');
      return;
    }

    const known = parseFloat(recalibrateKnownH);
    if (isNaN(known) || known <= 0) {
      showNotice('Enter a valid known positive height in meters', 'warning');
      return;
    }

    const predicted = dataset?.mode === 'absolute' && targetProbe.structureHeight !== undefined
      ? targetProbe.structureHeight
      : targetProbe.height;

    if (predicted < 0.5) {
      showNotice('Point is near ground level (< 0.5m). Select a rooftop or tree.', 'warning');
      return;
    }

    const factor = known / (predicted / scaleFactor);
    const clamped = Math.max(0.05, Math.min(20, factor));
    setScaleFactor(clamped);
    showNotice(`Recalibrated! Factor: ×${clamped.toFixed(3)}`, 'success');
  };

  const handleLoadValidationFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !dataset) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseNpy(reader.result as ArrayBuffer);
        let refData = parsed.data;

        // Resize if dimensions differ
        if (parsed.shape[1] !== dataset.width || parsed.shape[0] !== dataset.height) {
          refData = bilinearResize(
            parsed.data,
            parsed.shape[1],
            parsed.shape[0],
            dataset.width,
            dataset.height
          );
        }

        // Compare calibrated prediction against reference
        const pred = surface.field;
        const metrics = computeMetrics(pred, refData);

        setValidationReference({
          name: file.name,
          data: refData,
          metrics,
        });

        setActiveLayer('error');
        showNotice(`Reference ${file.name} validated! RMSE: ${metrics.rmse.toFixed(2)}m`, 'success');
      } catch (err: any) {
        showNotice(`Failed to parse reference .npy: ${err.message}`, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  if (!hudVisible) {
    return (
      <div className="absolute top-4 right-4 z-50">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setHudVisible(true)}
          icon={<Eye className="w-4 h-4" />}
        >
          Show HUD (H)
        </Button>
      </div>
    );
  }

  const isGeoTIFF = dataset?.mode === 'absolute';

  return (
    <div className="absolute inset-0 pointer-events-none z-30 flex flex-col justify-between p-4 overflow-hidden select-none">
      {/* 1. TOP BAR (KEPT EXACTLY AS DESIGNED) */}
      <header className="flex items-center justify-between pointer-events-auto bg-white/95 backdrop-blur-md brutal-border brutal-shadow p-3">
        <div className="flex items-center gap-3">
          <div className="bg-amber-400 p-2 brutal-border-sm">
            <Compass className="w-5 h-5 text-zinc-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black uppercase tracking-tight">DepthWizard</h1>
              <Badge color="zinc">SIH26175</Badge>
              {isGeoTIFF ? (
                <Badge color="green">ABS ELEV (ASL)</Badge>
              ) : (
                <Badge color="yellow">AGL (METRES)</Badge>
              )}
              {dataset?.is_dummy && <Badge color="orange">DEMO DATA</Badge>}
            </div>
            <p className="text-[10px] font-mono text-zinc-500">
              {dataset?.filename} · {dataset?.width}×{dataset?.height} px · {dataset?.metadata.units}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={navMode === 'walk' ? 'primary' : 'secondary'}
            onClick={() => setNavMode(navMode === 'walk' ? 'fly' : 'walk')}
            icon={<Compass className="w-3.5 h-3.5" />}
          >
            {navMode === 'walk' ? 'Walk (V)' : 'Fly (V)'}
          </Button>

          <Button
            size="sm"
            variant={pointerLocked ? 'primary' : 'secondary'}
            onClick={handleCaptureMouse}
            icon={<Crosshair className="w-3.5 h-3.5" />}
          >
            {pointerLocked ? 'Locked (Esc)' : 'Capture (F)'}
          </Button>

          <Button
            size="sm"
            variant={tourActive ? 'primary' : 'secondary'}
            onClick={() => bus.emit('toggleTour')}
            icon={<Video className="w-3.5 h-3.5" />}
          >
            Tour (T)
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => bus.emit('resetCamera')}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Reset (R)
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={handleScreenshot}
            icon={<Camera className="w-3.5 h-3.5" />}
          >
            Snap
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setScreen('landing')}
            icon={<LogOut className="w-3.5 h-3.5" />}
          >
            Exit
          </Button>
        </div>
      </header>

      {/* 2. MIDDLE WORKSPACE: SLEEK FLOATING ICON DOCKS (MAXIMUM 3D VISIBILITY) */}
      <div className="flex justify-between items-start flex-1 py-3 overflow-hidden pointer-events-none relative">
        {/* LEFT DOCK: ICONS + POPOUT CARDS */}
        <div className="flex items-start gap-2 pointer-events-auto">
          {/* Vertical Icon Bar */}
          <div className="flex flex-col gap-2 bg-white/95 backdrop-blur-md p-1.5 brutal-border brutal-shadow-sm">
            {/* 1. FLIGHT & WALK DYNAMICS (FIRST!) */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => togglePanel('dynamics')}
                className={`w-10 h-10 flex items-center justify-center brutal-border-sm transition-all cursor-pointer ${
                  openPanels.dynamics
                    ? 'bg-amber-400 text-zinc-950 font-bold brutal-shadow-sm scale-105'
                    : 'bg-white hover:bg-amber-100 text-zinc-800'
                }`}
              >
                <Wind className="w-5 h-5" />
              </button>
              <div className="absolute left-12 top-1.5 bg-zinc-950 text-white font-mono text-[11px] px-2 py-1 brutal-border-sm whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                Flight & Walk Dynamics
              </div>
            </div>

            {/* 2. VISUALIZATION LAYERS */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => togglePanel('layers')}
                className={`w-10 h-10 flex items-center justify-center brutal-border-sm transition-all cursor-pointer ${
                  openPanels.layers
                    ? 'bg-amber-400 text-zinc-950 font-bold brutal-shadow-sm scale-105'
                    : 'bg-white hover:bg-amber-100 text-zinc-800'
                }`}
              >
                <Layers className="w-5 h-5" />
              </button>
              <div className="absolute left-12 top-1.5 bg-zinc-950 text-white font-mono text-[11px] px-2 py-1 brutal-border-sm whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                Visualization Layers
              </div>
            </div>

            {/* 3. TERRAIN & SURFACE */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => togglePanel('terrain')}
                className={`w-10 h-10 flex items-center justify-center brutal-border-sm transition-all cursor-pointer ${
                  openPanels.terrain
                    ? 'bg-amber-400 text-zinc-950 font-bold brutal-shadow-sm scale-105'
                    : 'bg-white hover:bg-amber-100 text-zinc-800'
                }`}
              >
                <Sliders className="w-5 h-5" />
              </button>
              <div className="absolute left-12 top-1.5 bg-zinc-950 text-white font-mono text-[11px] px-2 py-1 brutal-border-sm whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                Terrain & Surface
              </div>
            </div>

            {/* 4. SUN & LIGHTING */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => togglePanel('lighting')}
                className={`w-10 h-10 flex items-center justify-center brutal-border-sm transition-all cursor-pointer ${
                  openPanels.lighting
                    ? 'bg-amber-400 text-zinc-950 font-bold brutal-shadow-sm scale-105'
                    : 'bg-white hover:bg-amber-100 text-zinc-800'
                }`}
              >
                <Sun className="w-5 h-5" />
              </button>
              <div className="absolute left-12 top-1.5 bg-zinc-950 text-white font-mono text-[11px] px-2 py-1 brutal-border-sm whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                Sun & Shadows
              </div>
            </div>
          </div>

          {/* Left Popout Panel Cards */}
          <div className="flex flex-col gap-2 max-h-[75vh] overflow-y-auto">
            {/* DYNAMICS CARD */}
            {openPanels.dynamics && (
              <div className="w-76 bg-white/95 backdrop-blur-md brutal-border brutal-shadow p-3.5 space-y-3 animate-in fade-in slide-in-from-left-2">
                <div className="flex items-center justify-between border-b-2 border-zinc-950 pb-2">
                  <div className="flex items-center gap-2">
                    <Wind className="w-4 h-4 text-amber-600" />
                    <span className="font-extrabold text-xs uppercase">Flight & Walk Dynamics</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => togglePanel('dynamics')}
                    className="p-0.5 hover:bg-zinc-200 brutal-border-sm cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <Slider
                  label="Flight Speed"
                  value={flySpeed}
                  min={5}
                  max={250}
                  step={5}
                  unit="m/s"
                  onChange={setFlySpeed}
                />

                {navMode === 'walk' && (
                  <Slider
                    label="Eye Height"
                    value={eyeHeight}
                    min={1.0}
                    max={3.5}
                    step={0.1}
                    unit="m"
                    onChange={setEyeHeight}
                  />
                )}

                <div className="p-2 bg-amber-50 brutal-border-sm text-[11px] font-mono text-zinc-700">
                  <span>Current Mode: <strong>{navMode.toUpperCase()}</strong></span>
                  <p className="text-[10px] text-zinc-500 mt-0.5">Press 'V' anytime to switch between free Flight & ground Walk</p>
                </div>
              </div>
            )}

            {/* LAYERS CARD */}
            {openPanels.layers && (
              <div className="w-76 bg-white/95 backdrop-blur-md brutal-border brutal-shadow p-3.5 space-y-3 animate-in fade-in slide-in-from-left-2">
                <div className="flex items-center justify-between border-b-2 border-zinc-950 pb-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-cyan-600" />
                    <span className="font-extrabold text-xs uppercase">Visualization Layers</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => togglePanel('layers')}
                    className="p-0.5 hover:bg-zinc-200 brutal-border-sm cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <Segmented<ViewLayer>
                  options={[
                    { id: 'rgb', label: 'RGB (1)' },
                    { id: 'height', label: 'Height (2)' },
                    { id: 'slope', label: 'Slope (3)' },
                    { id: 'grayscale', label: 'Gray (5)' },
                    {
                      id: 'error',
                      label: 'Error (4)',
                      disabled: !validationReference,
                    },
                  ]}
                  value={activeLayer}
                  onChange={setActiveLayer}
                />

                {activeLayer === 'grayscale' && (
                  <div className="pt-2 border-t border-zinc-200 space-y-2">
                    <Toggle
                      label="Invert (White=Low, Black=High)"
                      checked={grayscaleInvert}
                      onChange={setGrayscaleInvert}
                    />
                    <p className="text-[10px] font-mono text-zinc-500">
                      Normalized linear depth map matching CV benchmark models (MiDaS / ZoeDepth / LiDAR intensity).
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* TERRAIN CARD */}
            {openPanels.terrain && (
              <div className="w-76 bg-white/95 backdrop-blur-md brutal-border brutal-shadow p-3.5 space-y-3 animate-in fade-in slide-in-from-left-2">
                <div className="flex items-center justify-between border-b-2 border-zinc-950 pb-2">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-purple-600" />
                    <span className="font-extrabold text-xs uppercase">Terrain & Surface</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => togglePanel('terrain')}
                    className="p-0.5 hover:bg-zinc-200 brutal-border-sm cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <Slider
                  label="Vertical Exaggeration"
                  value={exaggeration}
                  min={0.5}
                  max={4.0}
                  step={0.1}
                  unit="x"
                  onChange={setExaggeration}
                />

                <Slider
                  label="Smoothing Filter"
                  value={smoothing}
                  min={0}
                  max={4}
                  step={1}
                  unit="px"
                  onChange={setSmoothing}
                />

                <Slider
                  label={isGeoTIFF ? 'Pixel Size (Locked)' : 'Assumed Pixel Size'}
                  value={surface.pixel_size_m}
                  min={0.2}
                  max={5.0}
                  step={0.1}
                  unit="m/px"
                  disabled={isGeoTIFF}
                  onChange={setPixelSizeOverride}
                />

                <div className="flex justify-between items-center text-xs font-mono font-bold uppercase">
                  <span>Mesh Geometry</span>
                  <Segmented<'full' | 'half'>
                    options={[
                      { id: 'full', label: '1:1 Full' },
                      { id: 'half', label: 'Half LOD' },
                    ]}
                    value={meshDetail}
                    onChange={setMeshDetail}
                  />
                </div>

                <Toggle
                  label="Slope Wall Shading"
                  checked={wallShading}
                  onChange={setWallShading}
                />
              </div>
            )}

            {/* LIGHTING CARD */}
            {openPanels.lighting && (
              <div className="w-76 bg-white/95 backdrop-blur-md brutal-border brutal-shadow p-3.5 space-y-3 animate-in fade-in slide-in-from-left-2">
                <div className="flex items-center justify-between border-b-2 border-zinc-950 pb-2">
                  <div className="flex items-center gap-2">
                    <Sun className="w-4 h-4 text-amber-500" />
                    <span className="font-extrabold text-xs uppercase">Sun & Lighting</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => togglePanel('lighting')}
                    className="p-0.5 hover:bg-zinc-200 brutal-border-sm cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <Slider
                  label="Sun Elevation"
                  value={sunElevation}
                  min={10}
                  max={85}
                  step={1}
                  unit="°"
                  onChange={v => setSunAngles(v, sunAzimuth)}
                />
                <Slider
                  label="Sun Azimuth"
                  value={sunAzimuth}
                  min={0}
                  max={360}
                  step={5}
                  unit="°"
                  onChange={v => setSunAngles(sunElevation, v)}
                />
                <Toggle label="Cast Shadows" checked={shadows} onChange={setShadows} />
              </div>
            )}
          </div>
        </div>

        {/* CENTER CROSSHAIR (VISIBLE ONLY WHEN MOUSE IS CAPTURED / POINTER LOCKED) */}
        {pointerLocked && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center">
            <div className="w-6 h-6 border-2 border-amber-400/90 rounded-full flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
            </div>
            {crosshair && crosshair.active && (
              <div className="mt-3 px-2.5 py-1 bg-zinc-950/90 text-amber-300 font-mono text-[11px] font-bold brutal-border-sm flex items-center gap-2">
                <span>H: {crosshair.height.toFixed(1)}m</span>
                <span className="text-zinc-500">|</span>
                <span>Slope: {crosshair.slopeDeg.toFixed(0)}°</span>
                <span className="text-zinc-500">|</span>
                <span>Dist: {crosshair.distance.toFixed(1)}m</span>
              </div>
            )}
          </div>
        )}

        {/* RIGHT DOCK: ICONS + POPOUT CARDS */}
        <div className="flex items-start gap-2 pointer-events-auto">
          {/* Right Popout Panel Cards */}
          <div className="flex flex-col gap-2 max-h-[75vh] overflow-y-auto">
            {/* PROBE & MEASURE CARD */}
            {openPanels.probe && (
              <div className="w-80 bg-white/95 backdrop-blur-md brutal-border brutal-shadow p-3.5 space-y-3 animate-in fade-in slide-in-from-right-2">
                <div className="flex items-center justify-between border-b-2 border-zinc-950 pb-2">
                  <div className="flex items-center gap-2">
                    <Ruler className="w-4 h-4 text-amber-600" />
                    <span className="font-extrabold text-xs uppercase">Probe & Measure</span>
                    {probeA && probeB ? (
                      <Badge color="green">A·B</Badge>
                    ) : probeA ? (
                      <Badge color="yellow">A</Badge>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleProbe}
                    className="p-0.5 hover:bg-zinc-200 brutal-border-sm cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-2">
                  <Button
                    size="sm"
                    variant="accent"
                    onClick={handleDropPinButton}
                    icon={<Crosshair className="w-3.5 h-3.5" />}
                    className="w-full text-xs font-bold"
                  >
                    {pointerLocked ? 'Drop Pin at Crosshair' : 'Activate Crosshair / Capture (F)'}
                  </Button>
                  <p className="text-[10px] font-mono text-zinc-500">
                    💡 Tip: Press <strong>F</strong> or click the button above to capture mouse, then click anywhere to probe height and distance accurately!
                  </p>
                </div>

                {probeA ? (
                  <div className="space-y-2 text-xs font-mono">
                    <div className="p-2 bg-amber-50 brutal-border-sm">
                      <div className="flex justify-between font-bold text-amber-900 mb-1">
                        <span>PIN A ({probeA.worldX.toFixed(1)}, {probeA.worldZ.toFixed(1)})</span>
                        <span>{probeA.slopeDeg.toFixed(1)}°</span>
                      </div>
                      <div className="flex justify-between text-zinc-700">
                        <span>Height:</span>
                        <span className="font-bold">{probeA.height.toFixed(2)} m</span>
                      </div>
                      {isGeoTIFF && probeA.structureHeight !== undefined && (
                        <div className="flex justify-between text-zinc-700">
                          <span>Structure H:</span>
                          <span className="font-bold">{probeA.structureHeight.toFixed(2)} m</span>
                        </div>
                      )}
                    </div>

                    {probeB && (
                      <div className="p-2 bg-cyan-50 brutal-border-sm">
                        <div className="flex justify-between font-bold text-cyan-900 mb-1">
                          <span>PIN B ({probeB.worldX.toFixed(1)}, {probeB.worldZ.toFixed(1)})</span>
                          <span>{probeB.slopeDeg.toFixed(1)}°</span>
                        </div>
                        <div className="flex justify-between text-zinc-700">
                          <span>Height:</span>
                          <span className="font-bold">{probeB.height.toFixed(2)} m</span>
                        </div>
                        {isGeoTIFF && probeB.structureHeight !== undefined && (
                          <div className="flex justify-between text-zinc-700">
                            <span>Structure H:</span>
                            <span className="font-bold">{probeB.structureHeight.toFixed(2)} m</span>
                          </div>
                        )}
                      </div>
                    )}

                    {probeA && probeB && (
                      <div className="p-2 bg-zinc-100 brutal-border-sm space-y-1">
                        <span className="text-[10px] font-bold text-zinc-600 uppercase block">A → B Delta</span>
                        <div className="flex justify-between">
                          <span>Horiz Distance:</span>
                          <span className="font-bold">
                            {Math.hypot(probeB.worldX - probeA.worldX, probeB.worldZ - probeA.worldZ).toFixed(2)} m
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Δ Height (B − A):</span>
                          <span className={`font-bold ${probeB.height - probeA.height >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {(probeB.height - probeA.height).toFixed(2)} m
                          </span>
                        </div>
                      </div>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full text-xs"
                      onClick={() => {
                        setProbeA(null);
                        setProbeB(null);
                      }}
                    >
                      Clear Pins
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-600 font-mono">
                    Aim crosshair and press <strong>Drop Pin</strong> or click while in <strong>Capture (F)</strong> mode.
                  </p>
                )}
              </div>
            )}

            {/* RECALIBRATE CARD */}
            {openPanels.recalibrate && (
              <div className="w-80 bg-white/95 backdrop-blur-md brutal-border brutal-shadow p-3.5 space-y-3 animate-in fade-in slide-in-from-right-2">
                <div className="flex items-center justify-between border-b-2 border-zinc-950 pb-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-purple-600" />
                    <span className="font-extrabold text-xs uppercase">Recalibrate</span>
                    <Badge color="purple">×{scaleFactor.toFixed(3)}</Badge>
                  </div>
                  <button
                    type="button"
                    onClick={() => togglePanel('recalibrate')}
                    className="p-0.5 hover:bg-zinc-200 brutal-border-sm cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="text-xs text-zinc-600 font-mono">
                  Pick a rooftop or canopy with a known true height, enter it below, and click Apply to rescale the surface.
                </p>

                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.5"
                    value={recalibrateKnownH}
                    onChange={e => setRecalibrateKnownH(e.target.value)}
                    className="w-24 px-2 py-1 bg-zinc-100 brutal-border-sm font-mono text-xs font-bold"
                    placeholder="Known (m)"
                  />
                  <Button size="sm" variant="accent" onClick={handleApplyRecalibration} className="flex-1">
                    Apply Scale
                  </Button>
                </div>

                {scaleFactor !== 1.0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full text-xs"
                    onClick={() => setScaleFactor(1.0)}
                  >
                    Reset Calibration (1.0x)
                  </Button>
                )}
              </div>
            )}

            {/* VALIDATE CARD */}
            {openPanels.validate && (
              <div className="w-80 bg-white/95 backdrop-blur-md brutal-border brutal-shadow p-3.5 space-y-3 animate-in fade-in slide-in-from-right-2">
                <div className="flex items-center justify-between border-b-2 border-zinc-950 pb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="font-extrabold text-xs uppercase">Validate Reference</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => togglePanel('validate')}
                    className="p-0.5 hover:bg-zinc-200 brutal-border-sm cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {validationReference ? (
                  <div className="space-y-2 text-xs font-mono">
                    <div className="p-2 bg-emerald-50 brutal-border-sm space-y-1">
                      <div className="font-bold text-emerald-950 truncate">{validationReference.name}</div>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <div>RMSE: <span className="font-bold">{validationReference.metrics.rmse.toFixed(2)} m</span></div>
                        <div>MAE: <span className="font-bold">{validationReference.metrics.mae.toFixed(2)} m</span></div>
                        <div>Pearson r: <span className="font-bold">{validationReference.metrics.r.toFixed(3)}</span></div>
                        <div>Bias: <span className="font-bold">{validationReference.metrics.bias.toFixed(2)} m</span></div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full text-xs"
                      onClick={() => setValidationReference(null)}
                    >
                      Unload Reference
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-zinc-600 font-mono">
                      Load a ground-truth LiDAR or DSM <code>.npy</code> array to compute accuracy metrics and render the error heat-layer.
                    </p>
                    <label className="block">
                      <input
                        type="file"
                        accept=".npy"
                        onChange={handleLoadValidationFile}
                        className="hidden"
                      />
                      <span className="inline-flex items-center justify-center w-full px-3 py-1.5 bg-white brutal-border-sm font-bold text-xs uppercase cursor-pointer hover:bg-amber-100">
                        Load Reference .npy
                      </span>
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* DATASET METADATA CARD */}
            {openPanels.metadata && (
              <div className="w-80 bg-white/95 backdrop-blur-md brutal-border brutal-shadow p-3.5 space-y-2 animate-in fade-in slide-in-from-right-2">
                <div className="flex items-center justify-between border-b-2 border-zinc-950 pb-2">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-600" />
                    <span className="font-extrabold text-xs uppercase">Dataset Info</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => togglePanel('metadata')}
                    className="p-0.5 hover:bg-zinc-200 brutal-border-sm cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1 text-xs font-mono text-zinc-700">
                  <div className="flex justify-between">
                    <span>Source:</span>
                    <span className="font-bold truncate max-w-[150px]">{dataset?.metadata.source_image}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Dimensions:</span>
                    <span className="font-bold">{dataset?.width} × {dataset?.height}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Vertical Ref:</span>
                    <span className="font-bold">{dataset?.metadata.vertical_reference}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>CRS:</span>
                    <span className="font-bold">{dataset?.metadata.crs || 'Local / None'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Pixel Size:</span>
                    <span className="font-bold">{surface.pixel_size_m.toFixed(2)} m</span>
                  </div>
                  {dataset?.metadata.terrain_source && (
                    <div className="flex justify-between">
                      <span>Terrain:</span>
                      <span className="font-bold">{dataset.metadata.terrain_source}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Vertical Icon Bar (Right) */}
          <div className="flex flex-col gap-2 bg-white/95 backdrop-blur-md p-1.5 brutal-border brutal-shadow-sm">
            {/* 1. PROBE & MEASURE */}
            <div className="relative group">
              <button
                type="button"
                onClick={handleToggleProbe}
                className={`w-10 h-10 flex items-center justify-center brutal-border-sm transition-all cursor-pointer ${
                  openPanels.probe
                    ? 'bg-amber-400 text-zinc-950 font-bold brutal-shadow-sm scale-105'
                    : 'bg-white hover:bg-amber-100 text-zinc-800'
                }`}
              >
                <Ruler className="w-5 h-5" />
              </button>
              <div className="absolute right-12 top-1.5 bg-zinc-950 text-white font-mono text-[11px] px-2 py-1 brutal-border-sm whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                Probe & Measure
              </div>
            </div>

            {/* 2. RECALIBRATE */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => togglePanel('recalibrate')}
                className={`w-10 h-10 flex items-center justify-center brutal-border-sm transition-all cursor-pointer ${
                  openPanels.recalibrate
                    ? 'bg-amber-400 text-zinc-950 font-bold brutal-shadow-sm scale-105'
                    : 'bg-white hover:bg-amber-100 text-zinc-800'
                }`}
              >
                <MapPin className="w-5 h-5" />
              </button>
              <div className="absolute right-12 top-1.5 bg-zinc-950 text-white font-mono text-[11px] px-2 py-1 brutal-border-sm whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                Recalibrate
              </div>
            </div>

            {/* 3. VALIDATE REFERENCE */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => togglePanel('validate')}
                className={`w-10 h-10 flex items-center justify-center brutal-border-sm transition-all cursor-pointer ${
                  openPanels.validate
                    ? 'bg-amber-400 text-zinc-950 font-bold brutal-shadow-sm scale-105'
                    : 'bg-white hover:bg-amber-100 text-zinc-800'
                }`}
              >
                <CheckCircle2 className="w-5 h-5" />
              </button>
              <div className="absolute right-12 top-1.5 bg-zinc-950 text-white font-mono text-[11px] px-2 py-1 brutal-border-sm whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                Validate Reference
              </div>
            </div>

            {/* 4. DATASET INFO */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => togglePanel('metadata')}
                className={`w-10 h-10 flex items-center justify-center brutal-border-sm transition-all cursor-pointer ${
                  openPanels.metadata
                    ? 'bg-amber-400 text-zinc-950 font-bold brutal-shadow-sm scale-105'
                    : 'bg-white hover:bg-amber-100 text-zinc-800'
                }`}
              >
                <Info className="w-5 h-5" />
              </button>
              <div className="absolute right-12 top-1.5 bg-zinc-950 text-white font-mono text-[11px] px-2 py-1 brutal-border-sm whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                Dataset Metadata
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. BOTTOM TELEMETRY BAR & HINTS (KEPT EXACTLY AS DESIGNED) */}
      <footer className="pointer-events-auto bg-zinc-950 text-white brutal-border brutal-shadow p-2 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-amber-400 font-bold">POS:</span>
            <span>
              {telemetry.x.toFixed(0)}, {telemetry.z.toFixed(0)}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-amber-400 font-bold">ASL:</span>
            <span>{telemetry.elevationASL.toFixed(1)}m</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-amber-400 font-bold">AGL:</span>
            <span>{telemetry.altitudeAGL.toFixed(1)}m</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-amber-400 font-bold">SPD:</span>
            <span>{telemetry.speed.toFixed(1)} m/s</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-amber-400 font-bold">DIR:</span>
            <span>{((telemetry.yawDeg % 360 + 360) % 360).toFixed(0)}°</span>
          </div>
        </div>

        {/* Hotkey Cheatsheet */}
        <div className="hidden lg:flex items-center gap-3 text-[11px] text-zinc-400">
          <span><kbd className="bg-zinc-800 text-amber-300 px-1 py-0.5 border border-zinc-700">WASD</kbd> Move</span>
          <span><kbd className="bg-zinc-800 text-amber-300 px-1 py-0.5 border border-zinc-700">Q/E</kbd> Up/Down</span>
          <span><kbd className="bg-zinc-800 text-amber-300 px-1 py-0.5 border border-zinc-700">Shift</kbd> 3x Boost</span>
          <span><kbd className="bg-zinc-800 text-amber-300 px-1 py-0.5 border border-zinc-700">F</kbd> Lock Mouse</span>
          <span><kbd className="bg-zinc-800 text-amber-300 px-1 py-0.5 border border-zinc-700">V</kbd> Fly/Walk</span>
          <span><kbd className="bg-zinc-800 text-amber-300 px-1 py-0.5 border border-zinc-700">T</kbd> Tour</span>
          <span><kbd className="bg-zinc-800 text-amber-300 px-1 py-0.5 border border-zinc-700">H</kbd> Hide HUD</span>
        </div>
      </footer>
    </div>
  );
};
