import React, { useRef, useEffect } from 'react';
import {
  CheckCircle,
  Loader2,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  Sparkles,
  BarChart3,
  Layers,
} from 'lucide-react';
import { useAppStore } from '../store';
import { Button, Card, Badge, Stat } from '../ui';
import { viridis } from '../lib/colormaps';

export const Processing: React.FC = () => {
  const activeJob = useAppStore(state => state.activeJob);
  const dataset = useAppStore(state => state.dataset);
  const setScreen = useAppStore(state => state.setScreen);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw Viridis Height Heatmap onto canvas when dataset arrives
  useEffect(() => {
    if (!dataset || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height, elevation_raw, elevation_stats } = dataset;
    canvas.width = width;
    canvas.height = height;

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;
    const range = Math.max(1, elevation_stats.max - elevation_stats.min);

    for (let i = 0; i < elevation_raw.length; i++) {
      const val = elevation_raw[i];
      const t = (val - elevation_stats.min) / range;
      const [r, g, b] = viridis(t);

      data[i * 4] = Math.round(r * 255);
      data[i * 4 + 1] = Math.round(g * 255);
      data[i * 4 + 2] = Math.round(b * 255);
      data[i * 4 + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);
  }, [dataset]);

  const stages = activeJob?.stages || [
    'Ingesting imagery',
    'Depth Anything V2 inference',
    'Height AGL conversion (metres)',
    'Surface normal & relief calculation',
    'Packaging 3D assets',
  ];
  const currentStage = activeJob?.stageIndex ?? 0;
  const isDone = activeJob?.status === 'done' && dataset !== null;
  const isError = activeJob?.status === 'error';

  return (
    <div className="min-h-screen bg-[#f4efe6] p-6 md:p-12 flex flex-col justify-between">
      <div className="max-w-6xl mx-auto w-full space-y-8">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-4 border-zinc-950 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge color="zinc">PIPELINE EXECUTION</Badge>
              {dataset?.mode === 'absolute' ? (
                <Badge color="green">ABSOLUTE ELEVATION (ASL)</Badge>
              ) : (
                <Badge color="yellow">RELATIVE DSM (AGL)</Badge>
              )}
              {dataset?.is_dummy && <Badge color="orange">DEMO DATA</Badge>}
            </div>
            <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight text-zinc-950">
              Depth Analysis & Reconstruction
            </h1>
          </div>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => setScreen('landing')}
            icon={<RotateCcw className="w-4 h-4" />}
          >
            Back to Upload
          </Button>
        </div>

        {/* PIPELINE STEPPER PROGRESS */}
        <div className="bg-white brutal-border brutal-shadow p-6">
          <h2 className="text-sm font-black uppercase tracking-wider mb-4 flex items-center gap-2">
            <span>Execution Pipeline</span>
            {isDone && <Badge color="green">COMPLETED</Badge>}
            {isError && <Badge color="red">FAILED</Badge>}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {stages.map((stageName, idx) => {
              const stepDone = isDone || idx < currentStage;
              const stepActive = !isDone && !isError && idx === currentStage;

              return (
                <div
                  key={stageName}
                  className={`p-3 brutal-border-sm flex items-start gap-2.5 transition-all ${
                    stepDone
                      ? 'bg-emerald-50 border-emerald-950 text-emerald-950'
                      : stepActive
                      ? 'bg-amber-100 border-amber-950 text-amber-950 scale-102 brutal-shadow-sm'
                      : 'bg-zinc-100 text-zinc-400 border-zinc-300'
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {stepDone ? (
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                    ) : stepActive ? (
                      <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-zinc-300" />
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-bold block uppercase text-zinc-500">
                      Step {idx + 1}
                    </span>
                    <span className="text-xs font-bold font-sans uppercase leading-tight block">
                      {stageName}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {isError && (
            <div className="mt-4 p-3 bg-rose-100 text-rose-950 brutal-border-sm flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
              <div className="text-xs font-mono">
                <strong>Pipeline Error:</strong> {activeJob?.error || 'Unknown failure'}
              </div>
            </div>
          )}
        </div>

        {/* RESULTS DATA VIEW WHEN READY */}
        {isDone && dataset && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* ACTION BANNER */}
            <div className="p-6 bg-amber-400 brutal-border brutal-shadow-lg flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black uppercase text-zinc-950">
                  Surface Model Reconstructed Successfully!
                </h3>
                <p className="text-xs font-mono text-zinc-900 mt-1">
                  518×518 vertex heightfield generated with analytic normals, wall shading, and interactive navigation.
                </p>
              </div>

              <Button
                size="lg"
                variant="secondary"
                onClick={() => setScreen('viewer')}
                icon={<ArrowRight className="w-5 h-5" />}
                className="whitespace-nowrap bg-zinc-950 text-white hover:bg-zinc-900 border-white"
              >
                Launch 3D Fly-Through
              </Button>
            </div>

            {/* SIDE BY SIDE TEXTURE VS VIRIDIS HEIGHTMAP */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card title="Input Aerial Imagery (RGB)" subtitle="Texture source for 3D mesh">
                <div className="aspect-square bg-zinc-900 brutal-border overflow-hidden flex items-center justify-center">
                  <img
                    src={dataset.rgb_texture_url}
                    alt="RGB aerial"
                    className="w-full h-full object-contain"
                  />
                </div>
              </Card>

              <Card title="Predicted DSM Heightfield" subtitle="Viridis colormap: purple (low) to yellow (high)">
                <div className="aspect-square bg-zinc-900 brutal-border overflow-hidden flex items-center justify-center">
                  <canvas ref={canvasRef} className="w-full h-full object-contain" />
                </div>
              </Card>
            </div>

            {/* SUMMARY STATS & HISTOGRAM */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Stat label="Minimum Elevation" value={dataset.elevation_stats.min.toFixed(2)} unit="m" />
              <Stat label="Maximum Elevation" value={dataset.elevation_stats.max.toFixed(2)} unit="m" />
              <Stat label="Mean Elevation" value={dataset.elevation_stats.mean.toFixed(2)} unit="m" />
              <Stat label="Median Elevation" value={dataset.elevation_stats.median.toFixed(2)} unit="m" />
              <Stat label="Std Deviation" value={dataset.elevation_stats.std.toFixed(2)} unit="m" />
            </div>

            {/* HISTOGRAM DISTRIBUTION */}
            <Card title="Height Value Distribution" subtitle="Histogram of pixel heights across the tile">
              <div className="h-32 flex items-end gap-1 pt-4 pb-2 border-b-2 border-zinc-950">
                {dataset.elevation_stats.histogram.counts.map((cnt, i) => {
                  const maxCount = Math.max(...dataset.elevation_stats.histogram.counts, 1);
                  const heightPercent = Math.max(4, (cnt / maxCount) * 100);
                  const binVal = dataset.elevation_stats.histogram.bins[i];

                  return (
                    <div
                      key={i}
                      title={`Height: ~${binVal.toFixed(1)}m, Count: ${cnt}`}
                      className="flex-1 bg-amber-400 hover:bg-amber-500 brutal-border-sm transition-all relative group cursor-pointer"
                      style={{ height: `${heightPercent}%` }}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-[11px] font-mono text-zinc-600 mt-2 font-bold">
                <span>{dataset.elevation_stats.min.toFixed(1)} m</span>
                <span>Elevation Span ({dataset.elevation_stats.histogram.bins.length} bins)</span>
                <span>{dataset.elevation_stats.max.toFixed(1)} m</span>
              </div>
            </Card>
          </div>
        )}
      </div>

      <footer className="max-w-6xl mx-auto w-full text-center text-xs font-mono text-zinc-500 pt-8">
        DepthWizard · SIH26175 Hackathon
      </footer>
    </div>
  );
};
