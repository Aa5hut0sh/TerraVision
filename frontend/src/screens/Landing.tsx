import React, { useState, useEffect, useRef } from 'react';
import {
  UploadCloud,
  FileImage,
  Layers,
  Globe2,
  Cpu,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { Button, Card, Badge } from '../ui';
import { runPipeline } from '../pipeline';

export const Landing: React.FC = () => {
  const [dragOver, setDragOver] = useState(false);
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Check WebGL 2 support
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      setWebglSupported(Boolean(gl));
    } catch {
      setWebglSupported(false);
    }
  }, []);

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      runPipeline(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      runPipeline(file);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4efe6] flex flex-col justify-between p-6 md:p-12">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.tif,.tiff,.geotiff"
        onChange={handleFileInput}
        className="hidden"
      />

      {/* HEADER */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-6xl mx-auto w-full border-b-4 border-zinc-950 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-amber-400 text-zinc-950 font-black px-2.5 py-1 brutal-border-sm text-sm uppercase">
              SIH26175
            </span>
            <Badge color="zinc">SMART INDIA HACKATHON</Badge>
            <Badge color="purple">50% WEIGHTAGE VISUALIZER</Badge>
          </div>
          <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight text-zinc-950">
            DepthWizard 3D
          </h1>
          <p className="text-zinc-600 font-mono text-xs md:text-sm mt-1">
            Single Aerial Image to Calibrated 3D Digital Surface Model & Fly-Through Engine
          </p>
        </div>

        {webglSupported !== null && (
          <div className="flex items-center gap-2 font-mono text-xs">
            {webglSupported ? (
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-900 brutal-border-sm font-bold">
                <ShieldCheck className="w-4 h-4 text-emerald-600" /> WebGL 2 Enabled
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-100 text-rose-900 brutal-border-sm font-bold">
                <AlertTriangle className="w-4 h-4 text-rose-600" /> WebGL 2 Not Detected
              </span>
            )}
          </div>
        )}
      </header>

      {/* MAIN BODY: UPLOAD & QUICK DEMO SAMPLES */}
      <main className="max-w-6xl mx-auto w-full my-8 space-y-8">
        {/* DRAG AND DROP ZONE */}
        <div
          onClick={openFileDialog}
          onDragOver={e => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-4 border-dashed p-10 md:p-14 text-center transition-all bg-white brutal-shadow-lg cursor-pointer ${
            dragOver ? 'border-amber-500 bg-amber-50 scale-[1.01]' : 'border-zinc-950 hover:bg-amber-50/50'
          }`}
        >
          <div className="max-w-md mx-auto space-y-4 pointer-events-none">
            <div className="w-16 h-16 mx-auto bg-amber-300 brutal-border flex items-center justify-center">
              <UploadCloud className="w-8 h-8 text-zinc-950" />
            </div>

            <div>
              <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight">
                Upload Aerial Imagery
              </h2>
              <p className="text-xs text-zinc-600 font-mono mt-1">
                Drop your top-down photo (PNG / JPG) or Georeferenced GeoTIFF (.tif), or click to browse
              </p>
            </div>

            <div className="pt-2">
              <Button size="lg" variant="primary" className="pointer-events-auto">
                Select File from Machine
              </Button>
            </div>
          </div>
        </div>

        {/* HACKATHON LIVE DEMO ONE-CLICK BUTTONS */}
        <Card
          title="Instant Hackathon Demos (No File Needed)"
          subtitle="Test both relative and absolute calibration pipelines with 1 click"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 bg-amber-50 brutal-border-sm flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-extrabold uppercase text-sm">Sample · PNG (Relative)</span>
                  <Badge color="yellow">AGL (METRES)</Badge>
                </div>
                <p className="text-xs font-mono text-zinc-600">
                  Simulates a drone/aerial optical photo. Depth Anything V2 outputs per-pixel height above ground level (AGL) in metres.
                </p>
              </div>
              <Button
                variant="primary"
                onClick={() => runPipeline('png')}
                icon={<ArrowRight className="w-4 h-4" />}
              >
                Launch Relative Demo
              </Button>
            </div>

            <div className="p-4 bg-cyan-50 brutal-border-sm flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-extrabold uppercase text-sm">Sample · GeoTIFF (Absolute)</span>
                  <Badge color="green">CALIBRATED ASL</Badge>
                </div>
                <p className="text-xs font-mono text-zinc-600">
                  Simulates georeferenced satellite tile. Ingests CRS (EPSG:32644), calibrates with SRTM terrain elevation for true sea-level DSM.
                </p>
              </div>
              <Button
                variant="accent"
                onClick={() => runPipeline('geotiff')}
                icon={<ArrowRight className="w-4 h-4" />}
              >
                Launch Absolute Demo
              </Button>
            </div>
          </div>
        </Card>

        {/* JUDGES EVALUATION CRITERIA CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card title="Projection Fidelity" subtitle="Exact UV coordinate alignment">
            <p className="text-xs text-zinc-600 font-mono">
              Maintains 1:1 pixel vertex density (518² = 268k vertices). Analytic surface normals & wall shading eliminate horizontal texture stretching on steep facades.
            </p>
          </Card>

          <Card title="Interactive Analysis" subtitle="Arbitrary perspective probing">
            <p className="text-xs text-zinc-600 font-mono">
              Real-time raycast crosshair, two-point A-B slope and delta height measurement, interactive click-to-recalibrate factor, and ground-truth RMSE validation.
            </p>
          </Card>

          <Card title="Standalone Architecture" subtitle="Zero-fuss local or server run">
            <p className="text-xs text-zinc-600 font-mono">
              Single-process FastAPI serving production build, dual Fly & Walk navigation modes with eye-height collision, minimap teleportation, and tour presets.
            </p>
          </Card>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="max-w-6xl mx-auto w-full text-center text-xs font-mono text-zinc-500 border-t-2 border-zinc-950 pt-4">
        DepthWizard · SIH26175 · Team GAMUS Elevation Visualizer · Ashutosh (Visualizer Lead)
      </footer>
    </div>
  );
};
